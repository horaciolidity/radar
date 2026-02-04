import express from 'express';
import cors from 'cors';
import { indexer } from './indexer.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Routes
app.get('/api/status', (req, res) => {
    res.json({ isScanning: indexer.isScanning });
});

app.post('/api/scan/start', async (req, res) => {
    await indexer.start();
    res.json({ success: true, isScanning: true });
});

app.post('/api/scan/stop', (req, res) => {
    indexer.stop();
    res.json({ success: true, isScanning: false });
});

app.get('/api/contracts', (req, res) => {
    try {
        const contracts = indexer.getContracts();
        // Support filters via query params
        const { risk, network, sort } = req.query;

        let results = contracts;

        // 1. Filter by Risk
        if (risk && risk !== 'all') {
            results = results.filter(c => c.tag.toLowerCase() === risk.toLowerCase());
        }

        // 2. Filter by Network (Future proofing)
        if (network && network !== 'all') {
            results = results.filter(c => c.network.toLowerCase() === network.toLowerCase());
        }

        // 3. Sorting (Default is newest first)
        // Ensure indexer saves new ones at top (unshift), so default is correct.

        res.json(results);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch contracts" });
    }
});

// Auto-start if state saved as true
if (indexer.isScanning) {
    indexer.start();
}

app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
    console.log(`Scanner Status: ${indexer.isScanning ? "ON" : "OFF"}`);
});
