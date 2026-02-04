import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { analyzeContract } from './analyzer.js';

const DB_PATH = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);

const CONTRACTS_FILE = path.join(DB_PATH, 'contracts.json');
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
        this.contractStorage = this.loadContracts();
        this.loadState();
    }

    loadState() {
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            this.activeScans = state.activeScans || {};
        }
    }

    saveState() {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ activeScans: this.activeScans }));
    }

    loadContracts() {
        if (fs.existsSync(CONTRACTS_FILE)) {
            return JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8'));
        }
        return [];
    }

    saveContracts() {
        fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(this.contractStorage, null, 2));
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
            const block = await provider.getBlock(blockNumber, true);
            if (!block || !block.prefetchedTransactions) return;

            for (const tx of block.prefetchedTransactions) {
                if (tx.to === null) {
                    const receipt = await provider.getTransactionReceipt(tx.hash);
                    if (receipt && receipt.contractAddress) {
                        const analysis = await analyzeContract(receipt.contractAddress, tx.from, provider);

                        // Age Estimation for historical blocks
                        // If block is old, estimate timestamp
                        const currentBlock = await provider.getBlockNumber();
                        const blocksAgo = currentBlock - blockNumber;
                        const estimatedTs = new Date(Date.now() - (blocksAgo * 12 * 1000)).toISOString(); // 12s per block avg

                        const completeData = {
                            id: `${network}-${receipt.contractAddress}`,
                            address: receipt.contractAddress,
                            deployer: tx.from,
                            ...analysis,
                            blockNumber,
                            txHash: tx.hash,
                            network,
                            blockchain: network,
                            timestamp: block.timestamp ? new Date(block.timestamp * 1000).toISOString() : estimatedTs
                        };
                        this.addContract(completeData);
                        console.log(`[${network}] Found contract ${receipt.contractAddress} at block ${blockNumber}`);
                    }
                }
            }
        } catch (err) {
            // Silently ignore individual block errors in history
        }
    }

    addContract(contract) {
        if (!this.contractStorage.find(c => c.id === contract.id)) {
            this.contractStorage.unshift(contract);
            if (this.contractStorage.length > 500) this.contractStorage.pop();
            this.saveContracts();
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
