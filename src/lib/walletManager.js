import { ethers } from 'ethers';
import { supabase } from './supabase';

const RPC_CONFIG = {
    'Ethereum': ['https://eth.llamarpc.com', 'https://cloudflare-eth.com', 'https://ethereum.publicnode.com'],
    'BSC': ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc', 'https://binance.llamarpc.com'],
    'Polygon': ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon', 'https://polygon.llamarpc.com'],
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

class WalletManager {
    constructor() {
        this.providers = {};
        this.prices = {};
        this.lastUpdateTime = 0;
        this.isScanning = {};
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
        if (now - this.lastUpdateTime < 60000 && Object.keys(this.prices).length > 0) {
            return this.prices;
        }

        try {
            const ids = [...new Set(Object.values(NATIVE_TICKERS))].join(',');
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
            const data = await response.json();

            const newPrices = {};
            for (const [network, ticker] of Object.entries(NATIVE_TICKERS)) {
                newPrices[network] = data[ticker]?.usd || 0;
            }

            this.prices = newPrices;
            this.lastUpdateTime = now;
            return this.prices;
        } catch (e) {
            console.error("[WalletRadar] Failed to fetch prices", e);
            return this.prices; // Return stale prices if fetch fails
        }
    }

    getProvider(network) {
        if (!this.providers[network]) {
            const urls = RPC_CONFIG[network] || [];
            const url = urls[0]; // For simplicity, pick the first one

            if (!url) return null;

            const chainId = NETWORK_IDS[network];
            this.providers[network] = new ethers.JsonRpcProvider(url, chainId ? { chainId, name: network.toLowerCase() } : undefined, { staticNetwork: true });
        }
        return this.providers[network];
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
            const nativePrice = prices[network];
            if (!nativePrice) throw new Error(`No price for ${network}`);

            const currentBlock = await provider.getBlockNumber();
            let startBlock = this.lastBlocks[network] ? this.lastBlocks[network] + 1 : currentBlock - count;

            if (startBlock > currentBlock) {
                this.isScanning[network] = false;
                return;
            }

            console.log(`[WalletRadar] Scanning ${network} blocks ${startBlock} to ${currentBlock}`);

            for (let b = startBlock; b <= currentBlock; b++) {
                const block = await provider.send("eth_getBlockByNumber", [ethers.toQuantity(b), true]);
                if (!block || !block.transactions) continue;

                const seenAddresses = new Set();
                for (const tx of block.transactions) {
                    if (tx.from) seenAddresses.add(tx.from);
                    if (tx.to) seenAddresses.add(tx.to);
                }

                // Check balances for all seen addresses (be careful with RPC limits)
                // We'll limit to first 10 addresses per block to avoid hitting rate limits too fast
                const addressesToCheck = Array.from(seenAddresses).slice(0, 15);

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
                                tx_hash: block.transactions[0]?.hash // Link to a tx in that block
                            });
                        }
                    } catch (err) {
                        console.warn(`[WalletRadar] Error checking balance for ${address}:`, err.message);
                    }
                }
            }

            this.lastBlocks[network] = currentBlock;
            this.persistBlocks();
        } catch (e) {
            console.error(`[WalletRadar] ${network} Scan Failed:`, e.message);
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
                // If the table doesn't exist, we'll log it but we can't create it here
                console.error("[WalletRadar] Supabase Save Error:", error.message);
            } else {
                console.log(`[WalletRadar] Found wallet: ${wallet.address} ($${wallet.balance_usd.toFixed(2)}) on ${wallet.network}`);
            }
        } catch (e) {
            console.error("[WalletRadar] Save failed:", e);
        }
    }
}

export const walletManager = new WalletManager();
