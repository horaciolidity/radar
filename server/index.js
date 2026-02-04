import express from 'express';
import cors from 'cors';
import { indexer } from './indexer.js';
import { supabase } from './supabaseClient.js';

const app = express();
const PORT = 3001;

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
app.get('/api/contracts', async (req, res) => {
    try {
        const { network, risk } = req.query;
        let query = supabase
            .from('contracts')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(100);

        if (network && network !== 'all') {
            query = query.eq('network', network);
        }

        if (risk && risk !== 'all') {
            query = query.eq('tag', risk.toUpperCase());
        }

        const { data, error } = await query;

        if (error) throw error;

        // Map back to internal format for frontend consistency
        const results = data.map(indexer.mapDbToInternal);
        res.json(results);
    } catch (e) {
        console.error("API error:", e.message);
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
