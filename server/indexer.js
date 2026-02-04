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
                        const completeData = {
                            id: `${network}-${receipt.contractAddress}`,
                            address: receipt.contractAddress,
                            deployer: tx.from,
                            ...analysis,
                            blockNumber,
                            txHash: tx.hash,
                            network,
                            blockchain: network,
                            timestamp: new Date().toISOString()
                        };
                        this.addContract(completeData);
                        console.log(`[${network}] Detected contract ${receipt.contractAddress}`);
                    }
                }
            }
        } catch (err) {
            console.error(`Error scanning block ${blockNumber} on ${network}:`, err.message);
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

    async scanHistory(network, blocksBack = 10) {
        const provider = this.getProvider(network);
        if (!provider) return;

        const currentBlock = await provider.getBlockNumber();
        console.log(`Scanning history on ${network} from ${currentBlock - blocksBack} to ${currentBlock}`);

        for (let i = 0; i < blocksBack; i++) {
            await this.scanBlock(network, currentBlock - i);
        }
    }

    getStatus() {
        return {
            activeScans: this.activeScans,
            availableNetworks: Object.keys(RPC_URLS)
        };
    }
}

export const indexer = new ContractIndexer();
