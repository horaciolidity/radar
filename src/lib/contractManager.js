import { ethers } from 'ethers';
import { supabase } from './supabase';

const RPC_CONFIG = {
    'Ethereum': [import.meta.env.VITE_RPC_ETHEREUM, 'https://rpc.ankr.com/eth', 'https://eth.llamarpc.com', 'https://ethereum.publicnode.com'],
    'BSC': [import.meta.env.VITE_RPC_BSC, 'https://bsc-dataseed.binance.org', 'https://binance.llamarpc.com'],
    'Polygon': [import.meta.env.VITE_RPC_POLYGON, 'https://polygon-rpc.com', 'https://polygon.llamarpc.com'],
    'Base': [import.meta.env.VITE_RPC_BASE, 'https://mainnet.base.org', 'https://base.llamarpc.com'],
    'Arbitrum': [import.meta.env.VITE_RPC_ARBITRUM, 'https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'],
    'Optimism': [import.meta.env.VITE_RPC_OPTIMISM, 'https://mainnet.optimism.io', 'https://optimism.llamarpc.com']
};

const getRpcUrl = (network) => {
    const urls = RPC_CONFIG[network] || [];
    const validUrls = urls.filter(url => url && url.startsWith('http'));
    return validUrls[0] || null;
};

const SIGNATURES = {
    SELFDESTRUCT: 'ff',
    DELEGATECALL: 'f4',
    TRANSFER: 'a9059cbb',
    APPROVE: '095ea7b3',
    OWNER: '8da5cb5b',
    TOTAL_SUPPLY: '18160ddd',
    MINT: '40c10f19',
    BURN: '4296696b'
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
                // Not a standard ERC20 or name/symbol not available
            }
        }

        // 3. Security Patterns
        if (bytecode.includes(SIGNATURES.OWNER)) {
            analysis.features.push("Ownable");
        }

        if (bytecode.includes('40c10f19')) {
            analysis.is_mintable = true;
            analysis.features.push("Mintable");
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
        } catch (e) { }

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
    }

    getProvider(network) {
        const url = getRpcUrl(network);
        if (!url) return null;
        if (!this.providers[network]) {
            this.providers[network] = new ethers.JsonRpcProvider(url);
        }
        return this.providers[network];
    }

    async scanRecentBlocks(network, countOrStartBlock = 5) {
        const provider = this.getProvider(network);
        if (!provider) return;

        try {
            const currentBlock = await provider.getBlockNumber();

            let startBlock;
            if (typeof countOrStartBlock === 'number' && countOrStartBlock < 1000) {
                // It's a count (e.g., scan last 5 blocks)
                startBlock = currentBlock - countOrStartBlock;
            } else {
                // It's a specific block number
                startBlock = countOrStartBlock;
            }

            // If we've scanned before, don't re-scan old blocks
            if (this.lastBlocks[network] && startBlock <= this.lastBlocks[network]) {
                startBlock = this.lastBlocks[network] + 1;
            }

            if (startBlock > currentBlock) return; // Nothing new

            console.log(`[${network}] Scanning from block ${startBlock} to ${currentBlock}...`);

            for (let b = startBlock; b <= currentBlock; b++) {
                try {
                    // Get block with full transactions
                    const block = await provider.send("eth_getBlockByNumber", [ethers.toBeHex(b), true]);

                    if (!block || !block.transactions) continue;

                    const contractTxs = block.transactions.filter(tx => tx.to === null || tx.to === '0x0000000000000000000000000000000000000000');

                    for (const tx of contractTxs) {
                        try {
                            const receipt = await provider.getTransactionReceipt(tx.hash);
                            if (receipt && receipt.contractAddress) {
                                console.log(`[${network}] Found new contract: ${receipt.contractAddress}`);
                                const analysis = await analyzeContract(receipt.contractAddress, tx.from, provider, network);
                                // Add block and tx data missing from analyzeContract
                                analysis.block_number = b;
                                analysis.tx_hash = tx.hash;
                                analysis.timestamp = new Date(parseInt(block.timestamp, 16) * 1000).toISOString();

                                await this.saveContract(analysis);
                            }
                        } catch (txErr) {
                            console.warn(`[${network}] Failed tx receipt:`, txErr.message);
                        }
                    }
                } catch (blockErr) {
                    console.error(`[${network}] Error on block ${b}:`, blockErr.message);
                }
            }

            this.lastBlocks[network] = currentBlock;
        } catch (e) {
            console.error(`Scan error on ${network}:`, e);
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
            return null;
        }
    }
}

export const contractManager = new ContractManager();

