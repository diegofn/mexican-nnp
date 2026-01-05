const PrismaClient = require('@prisma/client').PrismaClient;
const PrismaPg = require ('@prisma/adapter-pg').PrismaPg;

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
        return res.status(200).json({ found: true, data: row[0]?.modalidad || row?.MODALIDAD });
    } catch (err) {
        LOG.error('Lookup error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

//
// Reload the NNP data from CSV file and save to the database if needed
//
router.post('/syncnnp', async function(req, res){
    try {
        return res.status(200).json({ result: await saveNNPToDatabase() });
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
let prisma = null;
let adapter = null;

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

        return nnpRows;
    } catch (err) {
        LOG.error('Error loading NNP CSV:', err);
        throw err;
    }
}

async function saveNNPToDatabase() {
    try {
        //
        // Sync the NNP data to the database
        //
        if (process.env.NNP_TO_DB === 'true') {
            if (!adapter) adapter = new PrismaPg({
                connectionString: process.env.DATABASE_URL,
            });
            if (!prisma) prisma = new PrismaClient({ adapter });
            if (!nnpRows) await loadNNPFile();

            const data = nnpRows.map(r => ({
                numeracion_inicial: r.NUMERACION_INICIAL || r['NUMERACION_INICIAL'] || '',
                numeracion_final: r.NUMERACION_FINAL || r['NUMERACION_FINAL'] || '',
                modalidad: r.MODALIDAD || r['MODALIDAD'] || null,
                raw: r
            }));

            //
            // If there is existing data, clear it first and load again
            //
            if (await prisma.MexicanNnp.count() > 0) {
                await prisma.MexicanNnp.deleteMany({});

                const chunkSize = 1000;
                for (let i = 0; i < data.length; i += chunkSize) {
                    const chunk = data.slice(i, i + chunkSize);
                    await prisma.MexicanNnp.createMany({
                    data: chunk,
                    skipDuplicates: true
                    });
                }
            }
            LOG.log(`NNP data synchronized to database. Total records: ${await prisma.MexicanNnp.count()}`);
            return true;        
        }
        else {
            LOG.log('NNP_TO_DB is not true; skipping database synchronization.');
            return false;
        }
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

    if (process.env.NNP_TO_DB === 'true') {
        //
        // Create a database connection and look for the phone there
        //
        if (!adapter) adapter = new PrismaPg({
                connectionString: process.env.DATABASE_URL,
            });
        if (!prisma) prisma = new PrismaClient({ adapter });
        const row = await prisma.MexicanNnp.findMany({
            where: {
                numeracion_inicial: {
                    lte: target,
                },
                numeracion_final: {
                    gt: target,
                },
            },
            select: {
                id: true,
                numeracion_inicial: true,
                numeracion_final: true,
                modalidad: true,
                raw: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return row;
    }
    else {
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
router.saveNNPToDatabase = saveNNPToDatabase;

module.exports = router;