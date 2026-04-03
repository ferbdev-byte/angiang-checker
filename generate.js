const xlsx = require('xlsx');
const fs = require('fs');

const wb = xlsx.readFile('105-phuongxa-- email angiang.xlsx');
const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1});
const names = data.slice(1).map(r => r[1]).filter(Boolean);

async function geocode(name) {
    try {
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(name + ", Vietnam")}&limit=1`);
        const json = await res.json();
        if (json.features && json.features.length > 0) {
            return [json.features[0].geometry.coordinates[1], json.features[0].geometry.coordinates[0]];
        }
    } catch (e) { }
    return null;
}

async function run() {
    const results = {};
    const promises = names.map(async (name) => {
        const coords = await geocode(name);
        if (coords) {
            results[name] = coords;
        } else {
            // Default spread for miss
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = Math.imul(31, hash) + name.charCodeAt(i) | 0;
            hash = Math.abs(hash);
            results[name] = [
                10.3 + (hash % 1000)/1000 * 0.5,
                104.9 + ((hash*7) % 1000)/1000 * 0.6
            ];
        }
    });
    
    await Promise.all(promises);
    fs.writeFileSync('data/coords.json', JSON.stringify(results, null, 2));
    console.log("Done");
}

run();
