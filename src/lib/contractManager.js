import { ethers } from 'ethers';
import { supabase } from './supabase';

const RPC_CONFIG = {
    // Prioritize CORS-friendly RPCs for browser environment
    'Ethereum': ['https://ethereum.publicnode.com', 'https://cloudflare-eth.com', 'https://eth.llamarpc.com'],
    'BSC': ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc', 'https://binance.llamarpc.com'],
    'Polygon': ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon', 'https://polygon.llamarpc.com', 'https://polygon.publicnode.com'],
    'Base': ['https://mainnet.base.org', 'https://base.publicnode.com', 'https://base.llamarpc.com'],
    'Arbitrum': ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.publicnode.com', 'https://arbitrum.llamarpc.com'],
    'Optimism': ['https://mainnet.optimism.io', 'https://optimism.publicnode.com', 'https://optimism.llamarpc.com']
};

const NETWORK_IDS = {
    'Ethereum': 1,
    'BSC': 56,
    'Polygon': 137,
    'Base': 8453,
    'Arbitrum': 42161,
    'Optimism': 10
};

// DEX Configuration for Liquidity Checks
const DEX_CONFIG = {
    'Ethereum': {
        factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // Uniswap V2
        weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',    // WETH
        symbol: 'ETH'
    },
    'BSC': {
        factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', // PancakeSwap V2
        weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',    // WBNB
        symbol: 'BNB'
    },
    'Polygon': {
        factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32', // QuickSwap
        weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',    // WMATIC
        symbol: 'MATIC'
    },
    'Base': {
        factory: '0x8909Dc15e46C4A96d16279053B9F26870F605850', // BaseSwap
        weth: '0x4200000000000000000000000000000000000006',    // WETH
        symbol: 'ETH'
    },
    'Arbitrum': {
        factory: '0x1C232F01118CB8B424793ae03F870aa7D0ff7fFF', // SushiSwap (Arb1)
        weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',    // WETH
        symbol: 'ETH'
    },
    'Optimism': {
        factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 (Using V2 compatible if available or custom logic)
        weth: '0x4200000000000000000000000000000000000006',    // WETH
        symbol: 'ETH'
    }
};

const PAIR_ABI = [
    "function getReserves() view returns (uint112, uint112, uint32)",
    "function token0() view returns (address)",
    "function token1() view returns (address)"
];

const FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) view returns (address pair)"
];

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

        if (bytecode === '0x' || !bytecode || bytecode === '0x0') {
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

        let isToken = false;

        if (hasTransfer && hasTotalSupply) {
            isToken = true;
            analysis.type = "Token (ERC20)";
            analysis.features.push("ERC20 / Token");
            try {
                const abi = [
                    "function name() view returns (string)",
                    "function symbol() view returns (string)"
                ];
                const contract = new ethers.Contract(address, abi, provider);
                // Use a short timeout for metadata to avoid hanging
                const namePromise = contract.name();
                const symbolPromise = contract.symbol();

                const [name, symbol] = await Promise.all([
                    Promise.race([namePromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))]),
                    Promise.race([symbolPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))])
                ]).catch(() => ["Unknown Token", "???"]);

                analysis.name = name;
                analysis.symbol = symbol;
            } catch (e) {
                console.warn(`[Radar] Non-standard token or metadata missing for ${address}`);
            }
        }

        // 3. REAL Liquidity Check (DEX Query)
        // If it's a token (even if waiting for metadata), check liquidity
        if ((isToken || hasTransfer) && DEX_CONFIG[network]) {
            try {
                const { factory, weth, symbol: nativeSymbol } = DEX_CONFIG[network];
                const factoryContract = new ethers.Contract(factory, FACTORY_ABI, provider);

                // Get Pair Address
                const pairAddress = await factoryContract.getPair(address, weth);

                if (pairAddress && pairAddress !== '0x0000000000000000000000000000000000000000') {
                    // Check Reserves
                    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider);
                    const [reserves0, reserves1] = await pairContract.getReserves();
                    const token0 = await pairContract.token0();

                    // Identify which reserve is WETH/Native
                    const wethReserve = (token0.toLowerCase() === weth.toLowerCase()) ? reserves0 : reserves1;

                    // Calculate numeric value (rough)
                    const wethValue = parseFloat(ethers.formatEther(wethReserve));

                    if (wethValue > 0) {
                        analysis.has_liquidity = true;
                        analysis.features.push(`Liquidity: ${wethValue.toFixed(2)} ${nativeSymbol}`);
                        analysis.type = "Token (Liquid)";

                        // Reduce risk score for significant liquidity
                        if (wethValue > 1.0) {
                            analysis.risk_score = Math.max(0, analysis.risk_score - 20);
                        }
                    } else {
                        analysis.features.push("Pair Created (Empty)");
                    }
                }
            } catch (liqErr) {
                // Ignore liquidity check errors (CORS, network issues, etc)
            }
        }

        // Fallback for simple LP detection if real check failed or wasn't applicable
        if (!analysis.has_liquidity && (bytecode.includes('0dfe165a') || bytecode.includes('bc25cf77'))) {
            analysis.has_liquidity = true;
            analysis.features.push("LP Contract Pattern");
        }


        // 4. Security Patterns
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

        // 5. Deployer Reputation (Basic check for browser performance)
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

        // 6. Final Scoring
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
        console.error("Analysis failed:", error);
        return analysis;
    }
}


class ContractManager {
    constructor() {
        this.providers = {};
        this.lastBlocks = this.loadPersistedBlocks();
        this.rpcIndex = {};
        this.isScanning = {};
    }

    loadPersistedBlocks() {
        try {
            const saved = localStorage.getItem('radar_last_blocks');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    }

    persistBlocks() {
        try {
            localStorage.setItem('radar_last_blocks', JSON.stringify(this.lastBlocks));
        } catch (e) {
            console.warn("[Radar] Failed to persist blocks", e);
        }
    }

    getStatus(network) {
        return {
            lastBlock: this.lastBlocks[network] || null,
            isReady: !!this.providers[network],
            isScanning: !!this.isScanning[network]
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
        if (this.isScanning[network]) return;
        this.isScanning[network] = true;

        const provider = this.getProvider(network);
        if (!provider) {
            this.isScanning[network] = false;
            return;
        }

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

            if (startBlock > currentBlock) {
                this.isScanning[network] = false;
                return;
            }

            console.log(`[${network}] Height: ${startBlock} -> ${currentBlock}`);

            for (let b = startBlock; b <= currentBlock; b++) {
                const block = await provider.send("eth_getBlockByNumber", [ethers.toQuantity(b), true]);

                if (!block) throw new Error(`Empty block ${b}`);
                console.log(`[Radar] Scanning ${network} block ${b}`);

                if (!block.transactions || !Array.isArray(block.transactions)) continue;

                for (const tx of block.transactions) {
                    // Check for contract creation
                    if (tx.to === null || tx.to === '0x0000000000000000000000000000000000000000' || !tx.to) {
                        try {
                            const receipt = await provider.getTransactionReceipt(tx.hash);

                            if (receipt && receipt.contractAddress) {
                                console.log(`[Radar] ${network} CONTRACT DETECTED`, {
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
            this.persistBlocks();
        } catch (e) {
            console.error(`[${network}] Scan Failed:`, e.message);
            // Rotate on any network/RPC error (coalesce, fetch, CORS, rate limits)
            this.rotateProvider(network);
        } finally {
            this.isScanning[network] = false;
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

            if (error) {
                console.error("Supabase Save Error:", error.message);
            } else {
                console.log(`[Radar] Saved contract ${contract.address} on ${contract.network}`);
            }
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
