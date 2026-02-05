import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { analyzeContract } from './analyzer.js';
import { supabase } from './supabaseClient.js';

const DB_PATH = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);

const STATE_FILE = path.join(DB_PATH, 'state.json');

const RPC_CONFIG = {
    'Ethereum': [process.env.RPC_ETHEREUM, 'https://eth.llamarpc.com', 'https://ethereum.publicnode.com', 'https://cloudflare-eth.com'],
    'BSC': [process.env.RPC_BSC, 'https://binance.llamarpc.com', 'https://bsc-dataseed.binance.org'],
    'Polygon': [process.env.RPC_POLYGON, 'https://polygon.llamarpc.com', 'https://polygon-rpc.com'],
    'Base': [process.env.RPC_BASE, 'https://mainnet.base.org', 'https://base.llamarpc.com'],
    'Arbitrum': [process.env.RPC_ARBITRUM, 'https://arbitrum.llamarpc.com', 'https://arb1.arbitrum.io/rpc'],
    'Optimism': [process.env.RPC_OPTIMISM, 'https://optimism.llamarpc.com', 'https://mainnet.optimism.io']
};

const getRpcUrl = (network) => {
    const urls = RPC_CONFIG[network] || [];
    // Filter out undefined and pick the first valid URL
    const validUrls = urls.filter(url => url && url.startsWith('http'));
    return validUrls[0] || null;
};

export class ContractIndexer {
    constructor() {
        this.providers = {};
        this.activeScans = {}; // { network: boolean }
        this.contractStorage = []; // Will be synced with Supabase
        this.loadState();
        this.syncWithSupabase();
    }

    async syncWithSupabase() {
        try {
            const { data, error } = await supabase
                .from('contracts')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(500);

            if (error) throw error;
            if (data) {
                this.contractStorage = data.map(this.mapDbToInternal);
            }
        } catch (err) {
            console.error("Error syncing with Supabase:", err.message);
        }
    }

    mapDbToInternal(dbRow) {
        return {
            id: dbRow.id,
            network: dbRow.network,
            address: dbRow.address,
            deployer: dbRow.deployer,
            blockNumber: dbRow.block_number,
            txHash: dbRow.tx_hash,
            timestamp: dbRow.timestamp,
            tag: dbRow.tag,
            riskScore: dbRow.risk_score,
            type: dbRow.type,
            name: dbRow.name,
            symbol: dbRow.symbol,
            findings: dbRow.findings,
            features: dbRow.features,
            isScam: dbRow.is_scam,
            isVulnerable: dbRow.is_vulnerable,
            hasLiquidity: dbRow.has_liquidity || false,
            isMintable: dbRow.is_mintable || false,
            isBurnable: dbRow.is_burnable || false
        };
    }

    mapInternalToDb(contract) {
        return {
            id: contract.id,
            network: contract.network,
            address: contract.address,
            deployer: contract.deployer,
            block_number: contract.blockNumber,
            tx_hash: contract.txHash,
            timestamp: contract.timestamp,
            tag: contract.tag,
            risk_score: contract.riskScore,
            type: contract.type,
            name: contract.name,
            symbol: contract.symbol,
            findings: contract.findings,
            features: contract.features,
            is_scam: contract.isScam || false,
            is_vulnerable: contract.isVulnerable || false,
            has_liquidity: contract.hasLiquidity || false,
            is_mintable: contract.isMintable || false,
            is_burnable: contract.isBurnable || false
        };
    }

    loadState() {
        if (fs.existsSync(STATE_FILE)) {
            try {
                const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
                this.activeScans = state.activeScans || {};
            } catch (e) {
                this.activeScans = {};
            }
        }
    }

    saveState() {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ activeScans: this.activeScans }));
    }

    getProvider(network) {
        const url = getRpcUrl(network);
        if (!url) {
            console.error(`[${network}] No RPC URL configured!`);
            return null;
        }
        if (!this.providers[network]) {
            console.log(`[${network}] connecting to ${url}...`);
            this.providers[network] = new ethers.JsonRpcProvider(url);
        }
        return this.providers[network];
    }

    async scanBlock(network, blockNumber) {
        if (blockNumber < 0) return;
        const provider = this.getProvider(network);
        if (!provider) return;

        console.log(`[${network}] Scanning block ${blockNumber}...`);

        const block = await provider.send("eth_getBlockByNumber", [ethers.toQuantity(blockNumber), true]);

        if (!block) {
            throw new Error(`Block ${blockNumber} not found (RPC failure)`);
        }

        if (!block.transactions) return;

        for (const tx of block.transactions) {
            // Check for contract creation with tx.to === null or the zero address
            if (tx.to === null || tx.to === '0x0000000000000000000000000000000000000000') {
                try {
                    const receipt = await provider.getTransactionReceipt(tx.hash);
                    if (receipt && receipt.contractAddress) {
                        console.log("[Radar] Contract detected", {
                            network,
                            address: receipt.contractAddress,
                            txHash: tx.hash
                        });

                        const analysis = await analyzeContract(receipt.contractAddress, tx.from, provider, network);
                        const completeData = {
                            id: `${network}-${receipt.contractAddress}`.toLowerCase(),
                            address: receipt.contractAddress,
                            deployer: tx.from,
                            ...analysis,
                            blockNumber: parseInt(block.number, 16),
                            txHash: tx.hash,
                            network,
                            timestamp: new Date(parseInt(block.timestamp, 16) * 1000).toISOString()
                        };
                        await this.addContract(completeData);
                    }
                } catch (txErr) {
                    console.error(`[Radar] Error on receipt ${tx.hash}:`, txErr.message);
                }
            }
        }
    }

    async addContract(contract) {
        // Update local cache
        if (!this.contractStorage.find(c => c.id === contract.id)) {
            this.contractStorage.unshift(contract);
            if (this.contractStorage.length > 500) this.contractStorage.pop();

            // Push to Supabase
            try {
                const dbRow = this.mapInternalToDb(contract);
                const { error } = await supabase
                    .from('contracts')
                    .upsert(dbRow, { onConflict: 'id' });

                if (error) console.error("Supabase upsert error:", error.message);
            } catch (err) {
                console.error("Failed to push to Supabase:", err.message);
            }
        }
    }

    async startScanning(network) {
        if (this.activeScans[network]) return;

        const provider = this.getProvider(network);
        if (!provider) return;

        this.activeScans[network] = true;
        this.saveState();

        // Use a interval-based polling if event-based is flaky on some networks
        const scanLoop = async () => {
            let lastBlock = await provider.getBlockNumber();
            while (this.activeScans[network]) {
                try {
                    const currentBlock = await provider.getBlockNumber();
                    if (currentBlock > lastBlock) {
                        for (let b = lastBlock + 1; b <= currentBlock; b++) {
                            await this.scanBlock(network, b);
                        }
                        lastBlock = currentBlock;
                    }
                } catch (e) {
                    console.error(`[${network}] Polling error:`, e.message);
                }
                await new Promise(r => setTimeout(r, 12000)); // Poll every 12s (avg block time)
            }
        };

        scanLoop();
        console.log(`Radar started on ${network}`);
    }

    stopScanning(network) {
        this.activeScans[network] = false;
        this.saveState();
        console.log(`Radar stopped on ${network}`);
    }

    async scanHistory(network, blocksBack = 50) {
        const provider = this.getProvider(network);
        if (!provider) return;

        try {
            const currentBlock = await provider.getBlockNumber();
            console.log(`Deep scanning ${network}... starting from ${currentBlock}`);

            // Scan in sequence to avoid overwhelming the RPC
            for (let i = 0; i < blocksBack; i++) {
                const targetBlock = currentBlock - i;
                if (targetBlock < 0) break;
                await this.scanBlock(network, targetBlock);
                // Tiny delay to be nice to RPC
                await new Promise(r => setTimeout(r, 100));
            }
            console.log(`Deep scan for ${network} finished.`);
        } catch (err) {
            console.error(`Historical scan error on ${network}:`, err.message);
        }
    }

    async seedInitialData() {
        try {
            const { count, error } = await supabase
                .from('contracts')
                .select('*', { count: 'exact', head: true });

            if (error) throw error;
            if (count > 0) return;

            console.log("Seeding initial data for demonstration...");
            const seed = [
                {
                    id: 'eth-0x1',
                    name: 'Uniswap V3 Factory',
                    symbol: 'UNI-V3',
                    network: 'Ethereum',
                    address: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
                    deployer: '0x1a21...',
                    tag: 'SAFE',
                    riskScore: 5,
                    type: 'DEX Factory',
                    findings: [],
                    features: ['Verified', 'Multi-sig'],
                    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 400).toISOString() // > 1 year ago
                },
                {
                    id: 'eth-0x2',
                    name: 'Tether USD',
                    symbol: 'USDT',
                    network: 'Ethereum',
                    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                    deployer: '0x3691...',
                    tag: 'SAFE',
                    riskScore: 10,
                    type: 'Stablecoin',
                    findings: [],
                    features: ['Centralized', 'Blacklist'],
                    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 500).toISOString() // > 1 year ago
                }
            ];

            for (const contract of seed) {
                await this.addContract(contract);
            }
            console.log("Seeding completed.");
        } catch (err) {
            console.error("Seeding failed:", err.message);
        }
    }

    getStatus() {
        return {
            activeScans: this.activeScans,
            availableNetworks: Object.keys(RPC_CONFIG)
        };
    }
}

export const indexer = new ContractIndexer();
indexer.seedInitialData(); // Seed if empty on boot
