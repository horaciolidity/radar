import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { analyzeContract } from './analyzer.js';
import { supabase } from './supabaseClient.js';

const DB_PATH = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);

const STATE_FILE = path.join(DB_PATH, 'state.json');

const RPC_URLS = {
    'Ethereum': 'https://rpc.ankr.com/eth',
    'BSC': 'https://rpc.ankr.com/bsc',
    'Polygon': 'https://rpc.ankr.com/polygon',
    'Base': 'https://rpc.ankr.com/base',
    'Arbitrum': 'https://rpc.ankr.com/arbitrum',
    'Optimism': 'https://rpc.ankr.com/optimism'
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
            isVulnerable: dbRow.is_vulnerable
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
            is_vulnerable: contract.isVulnerable || false
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
        if (!RPC_URLS[network]) return null;
        if (!this.providers[network]) {
            this.providers[network] = new ethers.JsonRpcProvider(RPC_URLS[network]);
        }
        return this.providers[network];
    }

    async scanBlock(network, blockNumber) {
        const provider = this.getProvider(network);
        if (!provider) return;

        try {
            console.log(`[${network}] Scanning block ${blockNumber}...`);
            const block = await provider.getBlock(blockNumber, true);
            if (!block || !block.prefetchedTransactions) return;

            for (const tx of block.prefetchedTransactions) {
                if (tx.to === null) {
                    const receipt = await provider.getTransactionReceipt(tx.hash);
                    if (receipt && receipt.contractAddress) {
                        const analysis = await analyzeContract(receipt.contractAddress, tx.from, provider);

                        // Age Estimation for historical blocks
                        const currentBlock = await provider.getBlockNumber();
                        const blocksAgo = currentBlock - blockNumber;
                        const estimatedTs = new Date(Date.now() - (blocksAgo * 12 * 1000)).toISOString();

                        const completeData = {
                            id: `${network}-${receipt.contractAddress}`.toLowerCase(),
                            address: receipt.contractAddress,
                            deployer: tx.from,
                            ...analysis,
                            blockNumber,
                            txHash: tx.hash,
                            network,
                            blockchain: network,
                            timestamp: block.timestamp ? new Date(block.timestamp * 1000).toISOString() : estimatedTs
                        };
                        await this.addContract(completeData);
                        console.log(`[${network}] Found contract ${receipt.contractAddress} at block ${blockNumber}`);
                    }
                }
            }
        } catch (err) {
            console.error(`[${network}] Error scanning block ${blockNumber}:`, err.message);
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

        provider.on('block', (blockNumber) => {
            if (this.activeScans[network]) {
                this.scanBlock(network, blockNumber);
            }
        });
        console.log(`Radar started on ${network}`);
    }

    stopScanning(network) {
        this.activeScans[network] = false;
        this.saveState();
        const provider = this.providers[network];
        if (provider) {
            provider.removeAllListeners('block');
        }
        console.log(`Radar stopped on ${network}`);
    }

    async scanHistory(network, blocksBack = 50) {
        const provider = this.getProvider(network);
        if (!provider) return;

        const currentBlock = await provider.getBlockNumber();
        console.log(`Deep scanning ${network}...`);

        // Scan in chunks of 5 blocks in parallel to speed up
        for (let i = 0; i < blocksBack; i += 5) {
            const promises = [];
            for (let j = 0; j < 5 && (i + j) < blocksBack; j++) {
                promises.push(this.scanBlock(network, currentBlock - (i + j)));
            }
            await Promise.all(promises);
        }
    }

    seedInitialData() {
        if (this.contractStorage.length > 0) return;

        console.log("Seeding initial data for demonstration...");
        const seed = [
            {
                id: 'eth-0x1',
                name: 'Uniswap V3 Factory',
                symbol: 'UNI-V3',
                network: 'Ethereum',
                blockchain: 'Ethereum',
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
                blockchain: 'Ethereum',
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
        this.contractStorage = seed;
        this.saveContracts();
    }

    getStatus() {
        return {
            activeScans: this.activeScans,
            availableNetworks: Object.keys(RPC_URLS)
        };
    }
}

export const indexer = new ContractIndexer();
indexer.seedInitialData(); // Seed if empty on boot
