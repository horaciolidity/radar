import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { analyzeContract } from './analyzer.js';

const DB_PATH = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);

const CONTRACTS_FILE = path.join(DB_PATH, 'contracts.json');
const STATE_FILE = path.join(DB_PATH, 'state.json');

// Initialize DBs
if (!fs.existsSync(CONTRACTS_FILE)) fs.writeFileSync(CONTRACTS_FILE, '[]');
if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify({ isScanning: false }));

export class ContractIndexer {
    constructor() {
        this.provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth"); // Public RPC
        this.isScanning = this.loadState().isScanning;
        this.scanInterval = null;
    }

    loadState() {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }

    saveState(state) {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    }

    getContracts() {
        return JSON.parse(fs.readFileSync(CONTRACTS_FILE, 'utf8'));
    }

    addContract(contractData) {
        const contracts = this.getContracts();
        // Avoid duplicates
        if (!contracts.find(c => c.address === contractData.address)) {
            contracts.unshift(contractData); // Add to top
            // Limit to last 100 to avoid huge file in this demo
            if (contracts.length > 100) contracts.pop();
            fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(contracts, null, 2));
        }
    }

    async start() {
        if (this.isScanning) {
            console.log("Scanner already running");
            return;
        }

        console.log("Starting Indexer...");
        this.isScanning = true;
        this.saveState({ isScanning: true });

        // Listen for blocks
        this.provider.on("block", async (blockNumber) => {
            if (!this.isScanning) return;

            console.log(`New Block: ${blockNumber}`);
            try {
                const block = await this.provider.getBlock(blockNumber, true); // true for prefetch txs

                if (block && block.prefetchedTransactions) {
                    for (const tx of block.prefetchedTransactions) {
                        // Contract creation: 'to' is null
                        if (tx.to === null) {
                            console.log(`Contract detected in tx: ${tx.hash}`);
                            // Calculate contract address (simplified or wait for receipt)
                            // Correct way: ethers.getCreateAddress(tx) (if available) or from receipt
                            // For speed, let's try to get receipt
                            try {
                                const receipt = await this.provider.getTransactionReceipt(tx.hash);
                                if (receipt && receipt.contractAddress) {
                                    const analysis = await analyzeContract(receipt.contractAddress, tx.from, this.provider);

                                    // Enrich with metadata
                                    const completeData = {
                                        id: receipt.contractAddress,
                                        ...analysis,
                                        blockNumber,
                                        txHash: tx.hash,
                                        network: "Ethereum", // TODO: Support multi-chain
                                        timestamp: new Date().toISOString()
                                    };

                                    this.addContract(completeData);
                                    console.log(`Indexed ${receipt.contractAddress} Risk: ${analysis.riskScore}`);
                                }
                            } catch (e) {
                                console.error("Error processing tx receipt", e);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Block processing error", err);
            }
        });
    }

    stop() {
        console.log("Stopping Indexer...");
        this.isScanning = false;
        this.saveState({ isScanning: false });
        this.provider.removeAllListeners("block");
    }
}

export const indexer = new ContractIndexer();
