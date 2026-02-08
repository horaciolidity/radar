import { ethers } from 'ethers';
import { supabase } from './supabase';

const RPC_CONFIG = {
    'Ethereum': ['https://ethereum.publicnode.com', 'https://cloudflare-eth.com', 'https://eth.llamarpc.com'],
    'BSC': ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc', 'https://binance.llamarpc.com'],
    'Polygon': ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon', 'https://polygon.llamarpc.com', 'https://polygon.publicnode.com'],
    'Base': ['https://mainnet.base.org', 'https://base.publicnode.com', 'https://base.llamarpc.com'],
    'Arbitrum': ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.publicnode.com', 'https://arbitrum.llamarpc.com'],
    'Optimism': ['https://mainnet.optimism.io', 'https://optimism.publicnode.com', 'https://optimism.llamarpc.com']
};

const NETWORK_IDS = {
    'Ethereum': 1, 'BSC': 56, 'Polygon': 137, 'Base': 8453, 'Arbitrum': 42161, 'Optimism': 10
};

const DEX_CONFIG = {
    'Ethereum': { factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'ETH' },
    'BSC': { factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'BNB' },
    'Polygon': { factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32', weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'MATIC' },
    'Base': { factory: '0x8909Dc15e46C4A96d16279053B9F26870F605850', weth: '0x4200000000000000000000000000000000000006', symbol: 'ETH' },
    'Arbitrum': { factory: '0x1C232F01118CB8B424793ae03F870aa7D0ff7fFF', weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'ETH' },
    'Optimism': { factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984', weth: '0x4200000000000000000000000000000000000006', symbol: 'ETH' }
};

const SIGNATURES = {
    SELFDESTRUCT: 'ff',
    DELEGATECALL: 'f4',
    TRANSFER: 'a9059cbb',
    OWNER: '8da5cb5b',
    MINT: '40c10f19',
    TOTAL_SUPPLY: '18160ddd'
};

const FACTORY_ABI = ["function getPair(address tokenA, address tokenB) view returns (address pair)"];
const PAIR_ABI = ["function getReserves() view returns (uint112, uint112, uint32)", "function token0() view returns (address)"];

export async function analyzeContract(address, deployer, provider, network) {
    const analysis = {
        id: `${network}-${address}`.toLowerCase(),
        address, deployer, network,
        risk_score: 0, findings: [], type: "Unknown", features: [],
        name: "Unknown Contract", symbol: "???",
        timestamp: new Date().toISOString(),
        is_scam: false, is_vulnerable: false, tag: "SAFE",
        has_liquidity: false, is_mintable: false, is_burnable: false
    };

    try {
        const bytecode = await provider.getCode(address);
        if (bytecode === '0x' || !bytecode || bytecode === '0x0') return null;

        // 1. Structural Analysis
        const isProxy = bytecode.includes('363d3d373d3d3d363d73') || (bytecode.length > 2 && bytecode.length < 500);
        if (isProxy) {
            analysis.type = "Proxy";
            analysis.features.push("Proxy Architecture");
            analysis.risk_score += 20;
        }

        // 2. Token Detection
        const hasTransfer = bytecode.includes(SIGNATURES.TRANSFER);
        const hasTotalSupply = bytecode.includes(SIGNATURES.TOTAL_SUPPLY);
        let isToken = hasTransfer && hasTotalSupply;

        if (isToken) {
            analysis.type = "Token (ERC20)";
            analysis.features.push("ERC20 / Token");
            try {
                const contract = new ethers.Contract(address, ["function name() view returns (string)", "function symbol() view returns (string)"], provider);
                const [name, symbol] = await Promise.all([
                    Promise.race([contract.name(), new Promise((_, r) => setTimeout(() => r('Unknown'), 3000))]),
                    Promise.race([contract.symbol(), new Promise((_, r) => setTimeout(() => r('???'), 3000))])
                ]).catch(() => ["Unknown Token", "???"]);
                analysis.name = name; analysis.symbol = symbol;
            } catch (e) { }
        }

        // 3. Liquidity Check
        if ((isToken || hasTransfer) && DEX_CONFIG[network]) {
            try {
                const { factory, weth, symbol: nativeSymbol } = DEX_CONFIG[network];
                const factoryContract = new ethers.Contract(factory, FACTORY_ABI, provider);
                const pair = await factoryContract.getPair(address, weth).catch(() => null);
                if (pair && pair !== ethers.ZeroAddress) {
                    const pairContract = new ethers.Contract(pair, PAIR_ABI, provider);
                    const [res0, res1] = await pairContract.getReserves();
                    const t0 = await pairContract.token0();
                    const wethRes = (t0.toLowerCase() === weth.toLowerCase()) ? res0 : res1;
                    const val = parseFloat(ethers.formatEther(wethRes));
                    if (val > 0) {
                        analysis.has_liquidity = true;
                        analysis.features.push(`Liquidity: ${val.toFixed(2)} ${nativeSymbol}`);
                    }
                }
            } catch (e) { }
        }

        // 4. SURGICAL VULNERABILITY DETECTION
        // H1: Reentrancy Pattern
        if (bytecode.includes('f1') && bytecode.length > 2000) {
            analysis.findings.push({ type: "Possible Reentrancy", severity: "HIGH", description: "Contract uses low-level calls. Verify if state updates follow C-E-I pattern." });
            analysis.risk_score += 45;
        }

        // H2: Self-Destruct Logic
        if (bytecode.includes(SIGNATURES.SELFDESTRUCT)) {
            analysis.findings.push({ type: "Critical: SelfDestruct", severity: "CRITICAL", description: "Bytecode contains self-destruct instructions. Vulnerable to total fund loss." });
            analysis.risk_score += 85;
        }

        // H3: Unsafe DelegateCall
        if (bytecode.includes(SIGNATURES.DELEGATECALL) && !isProxy) {
            analysis.findings.push({ type: "Critical: Unsafe Logical Injection", severity: "CRITICAL", description: "Arbitrary delegatecall detected. External contracts can hijack storage." });
            analysis.risk_score += 90;
        }

        // H4: Honeypot / Transfer Restriction
        if (bytecode.includes('08c379a0')) {
            analysis.findings.push({ type: "Honeypot Hazard", severity: "CRITICAL", description: "Hidden transfer restrictions detected in bytecode." });
            analysis.risk_score += 75;
        }

        // H5: High-Privilege Minting
        if (bytecode.includes(SIGNATURES.MINT) && bytecode.includes(SIGNATURES.OWNER)) {
            analysis.findings.push({ type: "Owner Minting", severity: "HIGH", description: "Centralized power to create supply. High risk of rug-pull." });
            analysis.risk_score += 50;
        }

        // Final Scoring
        analysis.risk_score = Math.min(analysis.risk_score, 100);
        analysis.tag = analysis.risk_score >= 70 ? "CRITICAL" : (analysis.risk_score >= 40 ? "HIGH" : "SAFE");
        analysis.is_vulnerable = analysis.risk_score >= 40;
        analysis.is_scam = analysis.risk_score >= 75;

        analysis.bytecode = bytecode.length > 500 ? bytecode.slice(0, 250) + "..." + bytecode.slice(-250) : bytecode;
        analysis.bytecode_size = (bytecode.length - 2) / 2;

        return analysis;
    } catch (error) { return null; }
}

class ContractManager {
    constructor() {
        this.providers = {};
        this.lastBlocks = this.loadPersistedBlocks();
        this.rpcIndex = {};
        this.isScanning = {};
    }

    loadPersistedBlocks() {
        try { return JSON.parse(localStorage.getItem('radar_last_blocks')) || {}; } catch (e) { return {}; }
    }

    getProvider(network) {
        if (!this.providers[network]) {
            const urls = getRpcUrls(network);
            const url = urls[(this.rpcIndex[network] || 0) % urls.length];
            if (!url) return null;
            // FIXED: Pass chainId as number for Ethers v6
            this.providers[network] = new ethers.JsonRpcProvider(url, NETWORK_IDS[network], { staticNetwork: true });
        }
        return this.providers[network];
    }

    rotateProvider(network) {
        this.rpcIndex[network] = (this.rpcIndex[network] || 0) + 1;
        this.providers[network] = null;
    }

    async scanRecentBlocks(network, countOrStartBlock = 5) {
        if (this.isScanning[network]) return;
        this.isScanning[network] = true;
        const provider = this.getProvider(network);
        if (!provider) { this.isScanning[network] = false; return; }

        try {
            const current = await provider.getBlockNumber();
            let start = (typeof countOrStartBlock === 'number' && countOrStartBlock < 1000) ? current - countOrStartBlock : countOrStartBlock;
            if (this.lastBlocks[network] && start <= this.lastBlocks[network]) start = this.lastBlocks[network] + 1;
            if (start > current) { this.isScanning[network] = false; return; }

            for (let b = start; b <= current; b++) {
                const block = await provider.send("eth_getBlockByNumber", [ethers.toQuantity(b), true]).catch(() => null);
                if (!block || !block.transactions) continue;

                for (const tx of block.transactions) {
                    if (!tx.to || tx.to === ethers.ZeroAddress) {
                        const receipt = await provider.getTransactionReceipt(tx.hash).catch(() => null);
                        if (receipt && receipt.contractAddress) {
                            const analysis = await analyzeContract(receipt.contractAddress, tx.from, provider, network);
                            if (!analysis) continue;

                            const bal = await provider.getBalance(receipt.contractAddress).catch(() => 0n);
                            const hasNativeVal = bal > 0n;
                            const isToken = analysis.type === "Token (ERC20)";
                            const hasLiquidity = analysis.has_liquidity;

                            if (isToken || ((hasNativeVal || hasLiquidity) && analysis.is_vulnerable)) {
                                console.log(`[RADAR 🎯] Hit: ${receipt.contractAddress} (${analysis.type})`);
                                if (bal > 0n) analysis.features.push(`Native: ${parseFloat(ethers.formatEther(bal)).toFixed(4)}`);

                                analysis.block_number = b;
                                analysis.tx_hash = tx.hash;
                                analysis.timestamp = new Date(parseInt(block.timestamp, 16) * 1000).toISOString();
                                await this.saveContract(analysis);
                            }
                        }
                    }
                }
            }
            this.lastBlocks[network] = current;
            localStorage.setItem('radar_last_blocks', JSON.stringify(this.lastBlocks));
        } catch (e) { this.rotateProvider(network); } finally { this.isScanning[network] = false; }
    }

    async saveContract(contract) {
        try {
            await supabase.from('contracts').upsert({ ...contract, id: `${contract.network}-${contract.address}`.toLowerCase() }, { onConflict: 'id' });
        } catch (e) { }
    }

    async findAndAnalyze(address, network = 'Ethereum') {
        const provider = this.getProvider(network);
        if (!provider) return null;
        try {
            const analysis = await analyzeContract(address, ethers.ZeroAddress, provider, network);
            if (analysis) await this.saveContract(analysis);
            return analysis;
        } catch (e) { return null; }
    }

    getStatus(network) { return { lastBlock: this.lastBlocks[network] || null, isReady: !!this.providers[network], isScanning: !!this.isScanning[network] }; }
}

const getRpcUrls = (network) => {
    const custom = import.meta.env[`VITE_RPC_${network.toUpperCase()}`];
    const defaults = RPC_CONFIG[network] || [];
    return custom ? [custom, ...defaults] : defaults;
};

export const contractManager = new ContractManager();
