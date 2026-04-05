const fs = require('fs');
const https = require('https');

const districts = {
  "Thành phố Long Xuyên": ["Phường Long Xuyên", "Phường Bình Đức", "Phường Mỹ Thới", "Phường Mỹ Thạnh", "Phường Mỹ Long", "Phường Mỹ Bình", "Phường Mỹ Hòa", "Phường Mỹ Quý", "Phường Mỹ Phước", "Phường Đông Xuyên", "Xã Mỹ Khánh", "Xã Mỹ Hòa Hưng"],
  "Thành phố Châu Đốc": ["Phường Châu Đốc", "Phường Núi Sam", "Phường Châu Phú A", "Phường Châu Phú B", "Phường Vĩnh Mỹ", "Xã Vĩnh Tế", "Xã Vĩnh Châu"],
  "Thị xã Tân Châu": ["Phường Tân Châu", "Phường Long Thạnh", "Phường Long Hưng", "Phường Long Châu", "Xã Phú Lộc", "Xã Vĩnh Xương", "Xã Vĩnh Hòa", "Xã Tân An", "Xã Tân Thạnh", "Xã Long Phú", "Xã Châu Phong", "Xã Phú Vĩnh", "Xã Lê Chánh"],
  "Huyện An Phú": ["Thị trấn An Phú", "Xã Khánh An", "Xã Phú Hữu", "Xã Khánh Bình", "Xã Quốc Thái", "Xã Nhơn Hội", "Xã Phú Hội", "Xã Phước Hưng", "Xã Vĩnh Hội Đông", "Xã Đa Phước", "Xã Vĩnh Trường", "Xã Vĩnh Hậu", "Xã Vĩnh Lộc"],
  "Huyện Tịnh Biên": ["Thị trấn Tịnh Biên", "Thị trấn Nhà Bàng", "Thị trấn Chi Lăng", "Xã Nhơn Hưng", "Xã An Phú", "Xã Thới Sơn", "Xã Văn Giáo", "Xã An Cư", "Xã An Nông", "Xã Vĩnh Trung", "Xã An Hảo", "Xã Tân Lợi", "Xã An Bình", "Xã Núi Voi"],
  "Huyện Tri Tôn": ["Thị trấn Tri Tôn", "Thị trấn Ba Chúc", "Xã Lạc Quới", "Xã Lê Trì", "Xã Vĩnh Gia", "Xã Vĩnh Phước", "Xã Châu Lăng", "Xã Lương Phi", "Xã Lương An Trà", "Xã Tà Đảnh", "Xã Núi Tô", "Xã An Tức", "Xã Cô Tô", "Xã Tân Tuyến", "Xã Ô Lâm"],
  "Huyện Châu Phú": ["Thị trấn Cái Dầu", "Xã Mỹ Đức", "Xã Mỹ Phú", "Xã Ô Long Vĩ", "Xã Vĩnh Thạnh Trung", "Xã Thạnh Mỹ Tây", "Xã Bình Long", "Xã Bình Mỹ", "Xã Bình Thủy", "Xã Đào Hữu Cảnh", "Xã Bình Chánh", "Xã Bình Phú"],
  "Huyện Châu Thành": ["Thị trấn An Châu", "Xã Vĩnh Bình", "Xã Vĩnh An", "Xã Cần Đăng", "Xã Vĩnh Hanh", "Xã Hòa Bình Thạnh", "Xã Vĩnh Lợi", "Xã Vĩnh Nhuận", "Xã Tân Phú", "Xã Bình Hòa", "Xã An Hòa"],
  "Huyện Chợ Mới": ["Thị trấn Chợ Mới", "Thị trấn Mỹ Luông", "Xã Kiến An", "Xã Kiến Thành", "Xã Mỹ Hội Đông", "Xã Nhơn Mỹ", "Xã Long Giang", "Xã Long Điền A", "Xã Long Điền B", "Xã Long Điền C", "Xã Tấn Mỹ", "Xã Mỹ Hiệp", "Xã Bình Phước Xuân", "Xã Long Kiến", "Xã An Thạnh Trung", "Xã Hội An", "Xã Hòa An", "Xã Hòa Bình"],
  "Huyện Phú Tân": ["Thị trấn Phú Mỹ", "Xã Phú Long", "Xã Phú Lâm", "Xã Phú Hiệp", "Xã Phú Thạnh", "Xã Phú An", "Xã Phú Xuân", "Xã Phú Bình", "Xã Phú Thành", "Xã Phú Hưng", "Xã Phú Thọ", "Xã Hiệp Xương", "Xã Bình Thạnh Đông", "Xã Tân Hòa", "Xã Tân Trung", "Xã Chợ Vàm", "Xã Hòa Lạc", "Xã Phú Anh"],
  "Huyện Thoại Sơn": ["Thị trấn Núi Sập", "Thị trấn Phú Hòa", "Thị trấn Óc Eo", "Xã Thoại Giang", "Xã Bình Thành", "Xã Định Mỹ", "Xã Định Hiệp", "Xã Tây Phú", "Xã Vọng Đông", "Xã Vọng Thê", "Xã Mỹ Phú Đông", "Xã Phú Thuận", "Xã Vĩnh Phú", "Xã Vĩnh Khánh", "Xã Vĩnh Trạch", "Xã Vĩnh Chánh"]
};

function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ json: () => JSON.parse(data), ok: res.statusCode < 400, statusCode: res.statusCode }); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function geocode() {
    const coords = {};
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const validate = (lat, lon) => lat >= 10.1 && lat <= 11.1 && lon >= 104.6 && lon <= 105.7;

    const districtCoords = {
        "Thành phố Long Xuyên": [10.3708, 105.4333], "Thành phố Châu Đốc": [10.7072, 105.1167], "Thị xã Tân Châu": [10.8033, 105.2344], "Huyện An Phú": [10.8406, 105.1017], "Huyện Tịnh Biên": [10.5947, 104.9922], "Huyện Tri Tôn": [10.4072, 105.0064], "Huyện Châu Phú": [10.6064, 105.1764], "Huyện Châu Thành": [10.4286, 105.3081], "Huyện Chợ Mới": [10.4853, 105.4744], "Huyện Phú Tân": [10.7028, 105.3211], "Huyện Thoại Sơn": [10.2789, 105.2417]
    };

    for (const [district, communeList] of Object.entries(districts)) {
        for (const name of communeList) {
            let found = false;
            // Clean name for fallback (remove Xã, Phường, Thị trấn)
            const cleanName = name.replace(/^(Xã|Phường|Thị trấn)\s+/i, '').trim();
            
            const queries = [
                `${name}, ${district}, An Giang, Vietnam`,
                `${cleanName}, ${district}, An Giang, Vietnam`,
                `${name}, An Giang, Vietnam`,
                `${cleanName}, An Giang, Vietnam`
            ];

            for (const q of queries) {
                try {
                    console.log(`📡 Querying: ${q}...`);
                    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
                    const response = await fetch(url, { headers: { 'User-Agent': 'AnGiangChecker/1.1' } });
                    if (!response.ok) continue;

                    const data = await response.json();
                    if (data && data.length > 0) {
                        const lat = parseFloat(data[0].lat);
                        const lon = parseFloat(data[0].lon);
                        if (validate(lat, lon)) {
                            coords[name] = [lat, lon];
                            console.log(`✅ ${name} found via [${q}]: ${coords[name]}`);
                            found = true;
                            break;
                        }
                    }
                    await delay(1000); // Nominatim requirement
                } catch (err) { console.error(`Error for ${q}:`, err.message); }
            }

            if (!found) {
                console.warn(`❌ No match for ${name}. Skipping to avoid fake grid coords.`);
                // We no longer fallback to Math.random() grid/fake coordinates.
            }
        }
    }

    if (!fs.existsSync('data')) fs.mkdirSync('data');
    fs.writeFileSync('data/angiang_coordinates.json', JSON.stringify(coords, null, 2));
    fs.writeFileSync('db.js', `window.PREBAKED_COORDS = ${JSON.stringify(coords, null, 2)};`);
    console.log("Done! Generated data/angiang_coordinates.json and db.js");
}

geocode();
