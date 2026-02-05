import { ethers } from 'ethers';
import { supabase } from './supabase';

const RPC_CONFIG = {
    'Ethereum': ['https://eth.llamarpc.com', 'https://cloudflare-eth.com', 'https://ethereum.publicnode.com', 'https://eth.drpc.org'],
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

const NATIVE_TICKERS = {
    'Ethereum': 'ethereum',
    'BSC': 'binancecoin',
    'Polygon': 'matic-network',
    'Base': 'ethereum',
    'Arbitrum': 'ethereum',
    'Optimism': 'ethereum'
};

// Fallback prices in case Coingecko fails
const FALLBACK_PRICES = {
    'Ethereum': 2300,
    'BSC': 600,
    'Polygon': 0.40,
    'Base': 2300,
    'Arbitrum': 2300,
    'Optimism': 2300
};

class WalletManager {
    constructor() {
        this.providers = {};
        this.prices = {};
        this.lastUpdateTime = 0;
        this.isScanning = {};
        this.rpcIndex = {};
        this.lastBlocks = this.loadPersistedBlocks();
    }

    loadPersistedBlocks() {
        try {
            const saved = localStorage.getItem('wallet_radar_last_blocks');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    }

    persistBlocks() {
        try {
            localStorage.setItem('wallet_radar_last_blocks', JSON.stringify(this.lastBlocks));
        } catch (e) {
            console.warn("[WalletRadar] Failed to persist blocks", e);
        }
    }

    async getPrices() {
        const now = Date.now();
        // Return cached prices if they are fresh (< 5 minutes)
        if (now - this.lastUpdateTime < 300000 && Object.keys(this.prices).length > 0) {
            return this.prices;
        }

        try {
            const ids = [...new Set(Object.values(NATIVE_TICKERS))].join(',');
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            const newPrices = {};
            for (const [network, ticker] of Object.entries(NATIVE_TICKERS)) {
                newPrices[network] = data[ticker]?.usd || FALLBACK_PRICES[network];
            }

            this.prices = newPrices;
            this.lastUpdateTime = now;
            return this.prices;
        } catch (e) {
            console.warn("[WalletRadar] Price fetch failed, using fallbacks:", e.message);
            // If we have no prices yet, use fallbacks
            if (Object.keys(this.prices).length === 0) {
                this.prices = { ...FALLBACK_PRICES };
            }
            return this.prices;
        }
    }

    getProvider(network) {
        if (!this.providers[network]) {
            const urls = RPC_CONFIG[network] || [];
            const index = this.rpcIndex[network] || 0;
            const url = urls[index % urls.length];

            if (!url) return null;

            const chainId = NETWORK_IDS[network];
            this.providers[network] = new ethers.JsonRpcProvider(url, chainId ? { chainId, name: network.toLowerCase() } : undefined, { staticNetwork: true });
        }
        return this.providers[network];
    }

    rotateProvider(network) {
        const urls = RPC_CONFIG[network] || [];
        this.rpcIndex[network] = (this.rpcIndex[network] || 0) + 1;
        const nextUrl = urls[this.rpcIndex[network] % urls.length];

        console.warn(`[WalletRadar] Rotating RPC for ${network} to: ${nextUrl}`);
        this.providers[network] = null; // Clear to recreate
        return this.getProvider(network);
    }

    async scanRecentBlocks(network, count = 2) {
        if (this.isScanning[network]) return;
        this.isScanning[network] = true;

        const provider = this.getProvider(network);
        if (!provider) {
            this.isScanning[network] = false;
            return;
        }

        try {
            const prices = await this.getPrices();
            const nativePrice = prices[network] || FALLBACK_PRICES[network];

            const currentBlock = await provider.getBlockNumber();
            let startBlock = this.lastBlocks[network] ? this.lastBlocks[network] + 1 : currentBlock - count;

            if (startBlock > currentBlock) {
                this.isScanning[network] = false;
                return;
            }

            // Cap the scan to avoid massive backlogs if browser was closed
            if (currentBlock - startBlock > 10) {
                startBlock = currentBlock - 5;
            }

            console.log(`[WalletRadar] ${network} height: ${startBlock} -> ${currentBlock}`);

            for (let b = startBlock; b <= currentBlock; b++) {
                const block = await provider.send("eth_getBlockByNumber", [ethers.toQuantity(b), true]);
                if (!block || !block.transactions) continue;

                const seenAddresses = new Set();
                for (const tx of block.transactions) {
                    if (tx.from) seenAddresses.add(tx.from);
                    if (tx.to && tx.to !== '0x0000000000000000000000000000000000000000') seenAddresses.add(tx.to);
                }

                // Check balances for seen addresses
                // Limit to 10 addresses per block to avoid rate limits
                const addressesToCheck = Array.from(seenAddresses).slice(0, 10);

                for (const address of addressesToCheck) {
                    if (!address) continue;

                    try {
                        const balance = await provider.getBalance(address);
                        const balanceEth = parseFloat(ethers.formatEther(balance));
                        const balanceUsd = balanceEth * nativePrice;

                        if (balanceUsd >= 1000) {
                            await this.saveWallet({
                                address,
                                network,
                                balance_eth: balanceEth,
                                balance_usd: balanceUsd,
                                last_seen: new Date(parseInt(block.timestamp, 16) * 1000).toISOString(),
                                tx_hash: block.transactions[0]?.hash
                            });
                        }
                    } catch (err) {
                        // If error is 429 or fetch related, rotate
                        if (err.message.includes('429') || err.message.includes('fetch')) {
                            this.rotateProvider(network);
                        }
                        console.warn(`[WalletRadar] ${network} balance check error:`, err.message);
                    }
                }
            }

            this.lastBlocks[network] = currentBlock;
            this.persistBlocks();
        } catch (e) {
            console.error(`[WalletRadar] ${network} Scan Failed:`, e.message);
            // General failure (like getBlockNumber) should also trigger rotation
            this.rotateProvider(network);
        } finally {
            this.isScanning[network] = false;
        }
    }

    async saveWallet(wallet) {
        try {
            const id = `${wallet.network}-${wallet.address}`.toLowerCase();
            const { error } = await supabase
                .from('wallets')
                .upsert({ ...wallet, id }, { onConflict: 'id' });

            if (error) {
                console.error("[WalletRadar] Supabase Save Error:", error.message);
            }
        } catch (e) {
            console.error("[WalletRadar] Save failed:", e);
        }
    }
}

export const walletManager = new WalletManager();
