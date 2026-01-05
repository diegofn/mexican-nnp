const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });
const LOG = console;
const router = express.Router();

//
// Mexican NNP / for Mexican NNP Integration
//
router.get('/', async function(req, res){
    res.status(200)
    res.send(`Mexican NNP Webhook successfully running`)  
});

//
// Find a phone number in the Mexican NNP
//
router.post('/', async function(req, res){
    try {
        const phone = req.body.phone;
        if (!phone) return res.status(400).json({ error: 'phone query required' });
        
        const row = await findPhoneInNNP(phone);
        if (!row) 
            return res.status(404).json({ found: false });
        
        //
        // Return found row
        //
        return res.status(200).json({ found: true, data: row.MODALIDAD || row['MODALIDAD'] });
    } catch (err) {
        LOG.error('Lookup error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

//
// NNP file loading and searching
//
const NNP_CSV_PATH = path.join(__dirname, '..', 'public', process.env.MEXICAN_NNP_FILENAME || 'pnn_Publico_Latest.csv');
let nnpRows = null;

function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i+1] === '"') {
                cur += '"';
                i++; // skip escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

async function loadNNPFile() {
    try {
        const data = await fs.promises.readFile(NNP_CSV_PATH, 'utf8');
        const lines = data.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length === 0) return [];
        const headers = parseCSVLine(lines.shift()).map(h => h.trim());
        nnpRows = lines.map(line => {
            const vals = parseCSVLine(line);
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = (vals[idx] !== undefined) ? vals[idx] : ''; });
            return obj;
        });

        //
        // Sync the NNP data to the database
        //
        if (process.env.SYNC_NNP_TO_DB === 'true') {
            const { syncNNPToDB } = require('../services/nnpSync');
            await syncNNPToDB(nnpRows);
        }

        return nnpRows;
    } catch (err) {
        LOG.error('Error loading NNP CSV:', err);
        throw err;
    }
}

function cleanNumber(s) {
    if (!s) return '';
    return String(s).replace(/\D/g, '');
}

async function findPhoneInNNP(phone) {
    if (!nnpRows) await loadNNPFile();
    const target = cleanNumber(phone);
    if (!target) return null;

    //
    // Look for the phone in the NNP ranges
    //
    for (const row of nnpRows) {
        const startRaw = row.NUMERACION_INICIAL || row['NUMERACION_INICIAL'] || '';
        const endRaw = row.NUMERACION_FINAL || row['NUMERACION_FINAL'] || '';
        const start = startRaw;
        const end = endRaw;
        if (!start || !end) continue;
        try {
            const t = BigInt(target);
            const s = BigInt(start);
            const e = BigInt(end);
            if (t >= s && t <= e) return row;
        } catch (e) {
            // Fallback to string compare when numbers are small
            if (target.length === start.length && target >= start && target <= end) return row;
        }
    }
    return null;
}

//
// Watch the NNP CSV file for changes to reload
//
/*try {
    fs.watch(NNP_CSV_PATH, { persistent: false }, (evt) => {
        console.log('NNP CSV change detected -> reloading');
        loadNNPFile(true).catch(err => LOG.error('Reload failed:', err));
    });
} catch (e) {
    console.log('NNP CSV watcher could not be established:', e && e.message ? e.message : e);
}
*/

//
// expose helpers on router for external testing
//
router.loadNNPFile = loadNNPFile;
router.findPhoneInNNP = findPhoneInNNP;

module.exports = router;