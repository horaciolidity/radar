import { ethers } from 'ethers';
import { supabase } from './supabase';

const RPC_CONFIG = {
    'Ethereum': [import.meta.env.VITE_RPC_ETHEREUM, 'https://eth.llamarpc.com', 'https://ethereum.publicnode.com'],
    'BSC': [import.meta.env.VITE_RPC_BSC, 'https://binance.llamarpc.com', 'https://bsc-dataseed.binance.org'],
    'Polygon': [import.meta.env.VITE_RPC_POLYGON, 'https://polygon.llamarpc.com', 'https://polygon-rpc.com'],
    'Base': [import.meta.env.VITE_RPC_BASE, 'https://base.llamarpc.com', 'https://mainnet.base.org'],
    'Arbitrum': [import.meta.env.VITE_RPC_ARBITRUM, 'https://arbitrum.llamarpc.com', 'https://arb1.arbitrum.io/rpc'],
    'Optimism': [import.meta.env.VITE_RPC_OPTIMISM, 'https://optimism.llamarpc.com', 'https://mainnet.optimism.io']
};

const getRpcUrl = (network) => {
    const urls = RPC_CONFIG[network] || [];
    return urls.find(url => url && url.startsWith('http'));
};

const SIGNATURES = {
    SELFDESTRUCT: 'ff',
    DELEGATECALL: 'f4',
    TRANSFER: 'a9059cbb',
    APPROVE: '095ea7b3',
    OWNER: '8da5cb5b',
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
        name: "Unknown Token",
        symbol: "???",
        timestamp: new Date().toISOString(),
        is_scam: false,
        is_vulnerable: false,
        tag: "SAFE"
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
        } else {
            analysis.type = "Standard Contract";
        }

        // 2. Token Detection
        const hasTransfer = bytecode.includes(SIGNATURES.TRANSFER);
        if (hasTransfer) {
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

        // Honeypot Heuristic
        if (bytecode.includes('08c379a0') && bytecode.length < 5000) {
            analysis.findings.push({
                type: "Honeypot Risk",
                severity: "CRITICAL",
                description: "Potential conditional transfer restriction detected in bytecode."
            });
            analysis.risk_score += 50;
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

        if (analysis.risk_score >= 70) {
            analysis.tag = "CRITICAL";
            analysis.is_scam = analysis.risk_score > 85;
            analysis.is_vulnerable = true;
        } else if (analysis.risk_score >= 40) {
            analysis.tag = "HIGH";
            analysis.is_vulnerable = true;
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
        this.activeScans = {};
    }

    getProvider(network) {
        const url = getRpcUrl(network);
        if (!url) return null;
        if (!this.providers[network]) {
            this.providers[network] = new ethers.JsonRpcProvider(url);
        }
        return this.providers[network];
    }

    async scanRecentBlocks(network, count = 5) {
        const provider = this.getProvider(network);
        if (!provider) return;

        try {
            const currentBlock = await provider.getBlockNumber();
            for (let i = 0; i < count; i++) {
                const blockNumber = currentBlock - i;
                const block = await provider.getBlock(blockNumber, true);
                if (!block) continue;

                // Note: v6 block.transactions is different from v5
                for (const txHash of block.transactions) {
                    const tx = typeof txHash === 'string' ? await provider.getTransaction(txHash) : txHash;
                    if (tx && tx.to === null) {
                        const receipt = await provider.getTransactionReceipt(tx.hash);
                        if (receipt && receipt.contractAddress) {
                            const analysis = await analyzeContract(receipt.contractAddress, tx.from, provider, network);
                            await this.saveContract(analysis);
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Scan error on ${network}:`, e);
        }
    }

    async saveContract(contract) {
        try {
            const { error } = await supabase
                .from('contracts')
                .upsert(contract, { onConflict: 'id' });
            if (error) console.error("Supabase Save Error:", error.message);
        } catch (e) {
            console.error("Save failed:", e);
        }
    }

    async findAndAnalyze(address, network = 'Ethereum') {
        const provider = this.getProvider(network);
        if (!provider) return null;

        try {
            // Check if contract exists
            const bytecode = await provider.getCode(address);
            if (bytecode === '0x') return null;

            // Try to find tx if possible (limited by RPC)
            // For now, assume current user is analyzing it
            const analysis = await analyzeContract(address, '0x...', provider, network);
            await this.saveContract(analysis);
            return analysis;
        } catch (e) {
            return null;
        }
    }
}

export const contractManager = new ContractManager();
