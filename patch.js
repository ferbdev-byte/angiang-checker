const fs = require('fs'); 
let code = fs.readFileSync('app.js', 'utf8'); 

const startIdx = code.indexOf('        // V'); // Looking for V... frame local cache
const endIdx = code.indexOf('    } catch (err) {'); 

if(startIdx > -1 && endIdx > -1) { 
    const replacement = `        // Gán tọa độ ngay lập tức từ file prebake db.js
        let latLngBounds = [];
        regions.forEach(region => {
            if (window.PREBAKED_COORDS && window.PREBAKED_COORDS[region.name]) {
                region.latlng = window.PREBAKED_COORDS[region.name];
                region.isVerifiedLoc = true;
            } else {
                const cacheKey = 'geo_wow_' + region.name;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    region.latlng = JSON.parse(cached);
                    region.isVerifiedLoc = true;
                } else {
                    let hash = 0;
                    for (let x = 0; x < region.name.length; x++) hash = Math.imul(31, hash) + region.name.charCodeAt(x) | 0;
                    hash = Math.abs(hash);
                    region.latlng = [
                        10.3 + (hash % 1000)/1000 * 0.5,
                        104.9 + ((hash*7) % 1000)/1000 * 0.6
                    ];
                    region.isVerifiedLoc = false;
                }
            }
            latLngBounds.push(region.latlng);
        });

        renderMap();
        renderList();

        if (latLngBounds.length > 0) {
            map.fitBounds(L.latLngBounds(latLngBounds), { padding: [20, 20], maxZoom: 14 });
        }\n\n`; 
    code = code.substring(0, startIdx) + replacement + code.substring(endIdx); 
    fs.writeFileSync('app.js', code); 
    console.log('Replaced successfully!'); 
} else {
    console.log('Indexes not found!');
}
