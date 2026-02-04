import express from 'express';
import cors from 'cors';
import { indexer } from './indexer.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Get system status
app.get('/api/status', (req, res) => {
    res.json(indexer.getStatus());
});

// Start scanning a specific network
app.post('/api/scan/start', async (req, res) => {
    const { network } = req.body;
    if (!network) return res.status(400).json({ error: "Network required" });
    await indexer.startScanning(network);
    res.json({ success: true, network, isScanning: true });
});

// Stop scanning a specific network
app.post('/api/scan/stop', (req, res) => {
    const { network } = req.body;
    if (!network) return res.status(400).json({ error: "Network required" });
    indexer.stopScanning(network);
    res.json({ success: true, network, isScanning: false });
});

// Historical search
app.post('/api/scan/history', async (req, res) => {
    const { network, blocks } = req.body;
    if (!network) return res.status(400).json({ error: "Network required" });
    indexer.scanHistory(network, blocks || 10); // Default 10 blocks
    res.json({ success: true, message: "Historical scan started in background" });
});

// Get contracts with filters
app.get('/api/contracts', (req, res) => {
    try {
        let results = indexer.contractStorage;
        const { network, risk } = req.query;

        if (network && network !== 'all') {
            results = results.filter(c => c.network.toLowerCase() === network.toLowerCase());
        }

        if (risk && risk !== 'all') {
            results = results.filter(c => c.tag.toLowerCase() === risk.toLowerCase());
        }

        res.json(results);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch contracts" });
    }
});

// Resume previous scans
const state = indexer.getStatus();
Object.keys(state.activeScans).forEach(network => {
    if (state.activeScans[network]) {
        indexer.startScanning(network);
    }
});

app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});
