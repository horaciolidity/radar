import { ethers } from 'ethers';
import { supabase } from './supabase';

const RPC_CONFIG = {
    'Ethereum': ['https://eth.publicnode.com', 'https://rpc.ankr.com/eth', 'https://cloudflare-eth.com'],
    'BSC': ['https://binance.llamarpc.com', 'https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io'],
    'Polygon': ['https://polygon.llamarpc.com', 'https://polygon-rpc.com', 'https://rpc-mainnet.maticvigil.com'],
    'Base': ['https://mainnet.base.org', 'https://base.llamarpc.com'],
    'Arbitrum': ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.publicnode.com'],
    'Optimism': ['https://mainnet.optimism.io', 'https://optimism.publicnode.com']
};

const NETWORK_IDS = {
    'Ethereum': 1,
    'BSC': 56,
    'Polygon': 137,
    'Base': 8453,
    'Arbitrum': 42161,
    'Optimism': 10
};

const getRpcUrls = (network) => {
    const customRpc = import.meta.env[`VITE_RPC_${network.toUpperCase()}`];
    const defaultUrls = RPC_CONFIG[network] || [];
    const all = customRpc ? [customRpc, ...defaultUrls] : defaultUrls;
    return all.filter(url => url && url.startsWith('http'));
};

const SIGNATURES = {
    SELFDESTRUCT: 'ff',
    DELEGATECALL: 'f4',
    TRANSFER: 'a9059cbb',
    TRANSFER_FROM: '23b872dd',
    APPROVE: '095ea7b3',
    OWNER: '8da5cb5b',
    TOTAL_SUPPLY: '18160ddd',
    MINT: '40c10f19',
    BURN: '4296696b',
    PAIR_FACTORY: 'c9c991c0'
};

export async function analyzeContract(address, deployer, provider, network) {
    const analysis = {
        id: `${network}-${address}`.toLowerCase(),
        address,
        deployer,
        network,
        risk_score: 0,
        findings: [],
        type: "Unknown",
        features: [],
        name: "Unknown Contract",
        symbol: "???",
        timestamp: new Date().toISOString(),
        is_scam: false,
        is_vulnerable: false,
        tag: "SAFE",
        has_liquidity: false,
        is_mintable: false,
        is_burnable: false
    };

    try {
        const bytecode = await provider.getCode(address);

        if (bytecode === '0x') {
            analysis.type = "Destructed / EOA";
            analysis.risk_score = 10;
            return analysis;
        }

        // 1. Structural Analysis
        const isProxy = bytecode.includes('363d3d373d3d3d363d73') || bytecode.length < 500;
        if (isProxy) {
            analysis.type = "Proxy";
            analysis.features.push("Proxy Architecture");
            analysis.findings.push({
                type: "Proxy Detected",
                severity: "MEDIUM",
                description: "Contract uses a proxy pattern. Logic can be changed by owner at any time."
            });
            analysis.risk_score += 25;
        }

        // 2. Token Detection
        const hasTransfer = bytecode.includes(SIGNATURES.TRANSFER);
        const hasTotalSupply = bytecode.includes('18160ddd');
        if (hasTransfer && hasTotalSupply) {
            analysis.type = "Token (ERC20)";
            analysis.features.push("ERC20 / Token");
            try {
                const abi = [
                    "function name() view returns (string)",
                    "function symbol() view returns (string)"
                ];
                const contract = new ethers.Contract(address, abi, provider);
                analysis.name = await contract.name();
                analysis.symbol = await contract.symbol();
            } catch (e) {
                console.warn(`[Radar] Non-standard token or metadata missing for ${address}`);
            }
        }

        // 3. Security Patterns
        if (bytecode.includes(SIGNATURES.OWNER)) {
            analysis.features.push("Ownable");
        }

        if (bytecode.includes(SIGNATURES.MINT)) {
            analysis.is_mintable = true;
            analysis.features.push("Mintable");

            if (analysis.features.includes("Ownable")) {
                analysis.findings.push({
                    type: "Centralized Minting",
                    severity: "HIGH",
                    description: "Owner can mint new tokens at will, potentially diluting holders."
                });
                analysis.risk_score += 30;
            }
        }

        if (bytecode.includes(SIGNATURES.BURN)) {
            analysis.is_burnable = true;
            analysis.features.push("Burnable");
        }

        // Transfer Tax Heuristic
        if (bytecode.includes('405c') && hasTransfer) {
            analysis.features.push("Tax Logic");
            analysis.findings.push({
                type: "Transfer Tax",
                severity: "LOW",
                description: "Contract may charge fees on transfers based on arithmetic operations in transfer flow."
            });
        }

        // Honeypot Heuristic
        if (bytecode.includes('08c379a0') && bytecode.length < 5000) {
            analysis.findings.push({
                type: "Honeypot Risk",
                severity: "CRITICAL",
                description: "Potential conditional transfer restriction detected in bytecode."
            });
            analysis.risk_score += 50;
        }

        // Liquidity Heuristic
        if (bytecode.includes('0dfe165a') || bytecode.includes('bc25cf77')) {
            analysis.has_liquidity = true;
            analysis.features.push("LP Contract");
        }

        // 4. Deployer Reputation (Basic check for browser performance)
        try {
            const deployerBalance = await provider.getBalance(deployer);
            const balanceEth = parseFloat(ethers.formatEther(deployerBalance));
            if (balanceEth < 0.01) {
                analysis.findings.push({
                    type: "High Risk Deployer",
                    severity: "HIGH",
                    description: `Deployer balance is low (${balanceEth.toFixed(4)} ETH).`
                });
                analysis.risk_score += 30;
            }
        } catch (e) {
            console.warn(`[Radar] Could not fetch deployer balance`);
        }

        // 5. Final Scoring
        analysis.risk_score = Math.min(analysis.risk_score, 100);

        if (analysis.risk_score >= 75) {
            analysis.tag = "CRITICAL";
            analysis.is_scam = true;
            analysis.is_vulnerable = true;
        } else if (analysis.risk_score >= 45) {
            analysis.tag = "HIGH";
            analysis.is_vulnerable = true;
            analysis.is_scam = false;
        } else if (analysis.risk_score >= 20) {
            analysis.tag = "MEDIUM";
        } else {
            analysis.tag = "SAFE";
        }

        analysis.bytecode = bytecode.length > 600 ? bytecode.slice(0, 300) + "..." + bytecode.slice(-300) : bytecode;
        analysis.bytecode_size = (bytecode.length - 2) / 2;

        return analysis;
    } catch (error) {
        console.error("Analysis failed", error);
        return analysis;
    }
}


class ContractManager {
    constructor() {
        this.providers = {};
        this.lastBlocks = {};
        this.rpcIndex = {};
    }

    getStatus(network) {
        return {
            lastBlock: this.lastBlocks[network] || null,
            isReady: !!this.providers[network]
        };
    }

    getProvider(network) {
        if (!this.providers[network]) {
            const urls = getRpcUrls(network);
            const index = this.rpcIndex[network] || 0;
            const url = urls[index % urls.length];

            if (!url) return null;

            const chainId = NETWORK_IDS[network];
            this.providers[network] = new ethers.JsonRpcProvider(url, chainId ? { chainId, name: network.toLowerCase() } : undefined, { staticNetwork: true });
            console.log(`[Radar] Connected to ${network} via ${url}`);
        }
        return this.providers[network];
    }

    rotateProvider(network) {
        const urls = getRpcUrls(network);
        this.rpcIndex[network] = (this.rpcIndex[network] || 0) + 1;
        const nextUrl = urls[this.rpcIndex[network] % urls.length];

        console.warn(`[Radar] Rotating RPC for ${network} to: ${nextUrl}`);
        this.providers[network] = null; // Force recreation on next getProvider call
        return this.getProvider(network);
    }

    async scanRecentBlocks(network, countOrStartBlock = 5) {
        const provider = this.getProvider(network);
        if (!provider) return;

        try {
            const currentBlock = await provider.getBlockNumber();

            let startBlock;
            if (typeof countOrStartBlock === 'number' && countOrStartBlock < 1000) {
                startBlock = currentBlock - countOrStartBlock;
            } else {
                startBlock = countOrStartBlock;
            }

            if (this.lastBlocks[network] && startBlock <= this.lastBlocks[network]) {
                startBlock = this.lastBlocks[network] + 1;
            }

            if (startBlock > currentBlock) return;

            console.log(`[${network}] Height: ${startBlock} -> ${currentBlock}`);

            for (let b = startBlock; b <= currentBlock; b++) {
                const block = await provider.send("eth_getBlockByNumber", [ethers.toQuantity(b), true]);

                if (!block) throw new Error(`Empty block ${b}`);
                console.log("[Radar] Scanning block", b);

                if (!block.transactions || !Array.isArray(block.transactions)) continue;

                for (const tx of block.transactions) {
                    console.log("[Radar] TX", tx.hash, "to:", tx.to);

                    if (tx.to === null || tx.to === '0x0000000000000000000000000000000000000000') {
                        console.warn("[Radar] Possible contract creation", tx.hash);
                        try {
                            const receipt = await provider.getTransactionReceipt(tx.hash);
                            console.log("[Radar] Receipt", {
                                tx: tx.hash,
                                contract: receipt?.contractAddress
                            });

                            if (receipt && receipt.contractAddress) {
                                console.log("[Radar] CONTRACT DETECTED", {
                                    address: receipt.contractAddress,
                                    creator: tx.from,
                                    block: b,
                                    tx: tx.hash
                                });

                                const analysis = await analyzeContract(receipt.contractAddress, tx.from, provider, network);
                                analysis.block_number = b;
                                analysis.tx_hash = tx.hash;
                                analysis.timestamp = new Date(parseInt(block.timestamp, 16) * 1000).toISOString();

                                await this.saveContract(analysis);
                            }
                        } catch (txErr) {
                            console.warn(`[Radar] Receipt error ${tx.hash}:`, txErr.message);
                        }
                    }
                }
            }

            this.lastBlocks[network] = currentBlock;
        } catch (e) {
            console.error(`[${network}] Scan Failed:`, e.message);
            // Rotate on any network/RPC error (coalesce, fetch, CORS, rate limits)
            this.rotateProvider(network);
        }
    }

    async saveContract(contract) {
        try {
            // Ensure the ID is unique and consistent
            const contractToSave = {
                ...contract,
                id: `${contract.network}-${contract.address}`.toLowerCase()
            };

            const { error } = await supabase
                .from('contracts')
                .upsert(contractToSave, { onConflict: 'id' });

            if (error) console.error("Supabase Save Error:", error.message);
        } catch (e) {
            console.error("Save failed:", e);
        }
    }

    async findAndAnalyze(address, network = 'Ethereum') {
        const provider = this.getProvider(network);
        if (!provider) return null;

        try {
            const bytecode = await provider.getCode(address);
            if (bytecode === '0x') return null;

            const analysis = await analyzeContract(address, '0x0000000000000000000000000000000000000000', provider, network);
            await this.saveContract(analysis);
            return analysis;
        } catch (e) {
            console.error("[Radar] Manual analysis failed:", e.message);
            return null;
        }
    }
}

export const contractManager = new ContractManager();

