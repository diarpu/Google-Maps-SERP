#!/usr/bin/env node
/**
 * Pre-processes GeoNames allCountries.txt into compact per-country JSON files.
 * Each file contains an array of {pc, pn, lat, lng} entries.
 * 
 * Output: data/postal/<COUNTRY_CODE>.json
 * 
 * Run once: node scripts/build-postal-data.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const INPUT = path.join(__dirname, '..', 'data', 'allCountries.txt');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'postal');

async function main() {
    if (!fs.existsSync(INPUT)) {
        console.error('Missing allCountries.txt — download from https://download.geonames.org/export/zip/allCountries.zip');
        process.exit(1);
    }

    // Ensure output dir exists
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const countries = new Map(); // countryCode -> [{pc, pn, lat, lng}]
    let lineCount = 0;

    const rl = readline.createInterface({
        input: fs.createReadStream(INPUT, 'utf8'),
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        lineCount++;
        const parts = line.split('\t');
        if (parts.length < 12) continue;

        const countryCode = parts[0];
        const postalCode = parts[1];
        const placeName = parts[2];
        const lat = parseFloat(parts[9]);
        const lng = parseFloat(parts[10]);

        if (!countryCode || !postalCode || isNaN(lat) || isNaN(lng)) continue;

        if (!countries.has(countryCode)) {
            countries.set(countryCode, []);
        }

        countries.get(countryCode).push({
            pc: postalCode,
            pn: placeName,
            lat: Math.round(lat * 1e6) / 1e6,
            lng: Math.round(lng * 1e6) / 1e6,
        });
    }

    console.log(`Processed ${lineCount} lines from allCountries.txt`);
    console.log(`Found ${countries.size} countries`);

    let totalEntries = 0;
    for (const [cc, entries] of countries) {
        const outFile = path.join(OUTPUT_DIR, `${cc}.json`);
        fs.writeFileSync(outFile, JSON.stringify(entries));
        totalEntries += entries.length;
    }

    console.log(`Wrote ${totalEntries} postal code entries to ${countries.size} files in data/postal/`);

    // Write an index file listing all available countries
    const index = {};
    for (const [cc, entries] of countries) {
        index[cc] = entries.length;
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, '_index.json'), JSON.stringify(index, null, 2));
    console.log('Wrote _index.json');
}

main().catch(console.error);
