const fs = require('fs');
const https = require('https');
const path = require('path');

const url = process.argv[2];

if (!url) {
    console.error("❌ ERROR: Vui lòng cung cấp URL nguồn dữ liệu RAW JSON bằng tham số truyền vào.");
    console.log("👉 Cú pháp chạy: node scripts/extract_angiang_geojson.js <URL_RAW_JSON>");
    process.exit(1);
}

console.log(`📡 Bắt đầu kết nối tải xuống tệp dữ liệu quy mô lớn từ: ${url} ...\n`);

https.get(url, { headers: { 'User-Agent': 'NodeJS-Downloader' } }, (res) => {
    let rawData = '';

    if (res.statusCode >= 400) {
        console.error(`❌ Lỗi mạng tải xuống - HTTP Mã trạng thái: ${res.statusCode}`);
        process.exit(1);
    }

    res.setEncoding('utf8');

    // Chèn buffer streams cho tiến trình download
    res.on('data', (chunk) => {
        rawData += chunk;
        process.stdout.write('█'); // progress dots
    });

    res.on('end', () => {
        console.log("\n\n✅ Tải tệp thành công. Bắt đầu phân rã dữ liệu (Parse JSON)...");
        try {
            // Định dạng dữ liệu parse
            let jsonData = JSON.parse(rawData);
            
            // Xử lý các dạng Root Payload phổ thông (Kể cả Nested Tree Data)
            let allCommunes = [];
            let foundProvince = false;

            // Hàm đệ quy lục lọi khắp các ngõ ngách của file JSON để bóc cấu trúc (Trường hợp dữ liệu Tree/Nested)
            const extractLevel3FromTree = (node, isAnGiang = false) => {
                if (!node) return;
                
                if (Array.isArray(node)) {
                    node.forEach(n => extractLevel3FromTree(n, isAnGiang));
                } else if (typeof node === 'object') {
                    // Cờ xác nhận đã lọt vào lãnh thổ An Giang
                    let currentIsAnGiang = isAnGiang;
                    
                    // Phát hiện Node cấp 1 (Tỉnh/TP) là An Giang
                    if ((node.level1_id === '89' || node.matp === '89' || node.province_id === '89') || 
                        (node.name && node.name.includes("An Giang") && (node.type === "Tỉnh" || !node.level2_id))) {
                        currentIsAnGiang = true;
                        foundProvince = true;
                    }

                    // Nếu đang ở trong An Giang, gom Node nếu nó là cấp 3 (Xã/Phường/Thị trấn)
                    const isLevel3 = node.level3_id || node.maxa || 
                                     (node.type && ['Xã', 'Phường', 'Thị trấn'].includes(node.type));
                                     
                    if (currentIsAnGiang && isLevel3) {
                        allCommunes.push(node);
                    } else if (currentIsAnGiang && node.type === 'Feature' && node.properties && node.properties.level3_id) {
                        // Trường hợp GeoJSON chuẩn hoá
                        allCommunes.push(node);
                    }

                    // Đệ quy sâu xuống các khoá thường dùng của API
                    if (node.level2s) extractLevel3FromTree(node.level2s, currentIsAnGiang);
                    if (node.level3s) extractLevel3FromTree(node.level3s, currentIsAnGiang);
                    if (node.features) extractLevel3FromTree(node.features, currentIsAnGiang);
                    if (node.data) extractLevel3FromTree(node.data, currentIsAnGiang);
                }
            };

            // Tiến hành quét Data
            extractLevel3FromTree(jsonData);

            if (allCommunes.length === 0) {
                 if (foundProvince) {
                     console.error("🚫 Parsing failed: Không tìm thấy bất kỳ Xã/Phường nào dù đã tìm thấy tỉnh An Giang! Có thể dữ liệu JSON không cung cấp cấp 3.");
                 } else {
                     console.error("🚫 Parsing failed: Không tìm thấy dữ liệu Tỉnh An Giang (Mã 89) trong tệp. Hoặc cấu trúc JSON hoàn toàn lạ.");
                 }
                 process.exit(1);
            }

            console.log(`👉 Đã phát hiện và bóc tách thành công [${allCommunes.length}] Phường/Xã thuộc An Giang từ tập dữ liệu cây phân cấp.`);

            // Format lại thành chuẩn FeatureCollection GeoJSON
            const features = allCommunes.map(commune => {
                // Cấu trúc 1: Core Feature
                if (commune.type === 'Feature') {
                    const props = commune.properties || {};
                    return {
                        type: "Feature",
                        properties: {
                            id: (props.id || props.level3_id || props.maxa || "unknown").toString(),
                            name: props.name || props.tenxa || "Không rõ",
                            khu_vuc: "", 
                            ...props 
                        },
                        geometry: commune.geometry || null
                    };
                }

                // Cấu trúc 2: Object Data Thô (Nested)
                const id = commune.level3_id || commune.maxa || commune.id || "unknown";
                const name = commune.name || commune.tenxa || commune.title || "Không rõ";
                const geometry = commune.geometry || commune.geojson || commune.shape || null;

                return {
                    "type": "Feature",
                    "properties": {
                        "id": id.toString(),
                        "name": name,
                        "khu_vuc": ""
                    },
                    "geometry": geometry
                };
            });

            console.log(`🔎 Thông báo: Đã sàng được tổng cộng [${features.length}] đơn vị Phường/Xã thuộc về An Giang.`);

            // Cảnh báo nếu dữ liệu bị "cụt", thiếu mất ranh giới vẽ map
            const nullGeomsCount = features.filter(f => !f.geometry).length;
            if (nullGeomsCount === features.length && features.length > 0) {
                 console.warn("\n⚠️ CẢNH BÁO MẠNH: Dữ liệu tải về hoàn toàn không tồn tại trường tọa độ hình học 'geometry' (Ranh giới Polygon). Bản đồ sẽ không thể vẽ ra khu vực! Yêu cầu đổi URL nguồn khác có hỗ trợ.");
            } else if (nullGeomsCount > 0) {
                 console.warn(`\n⚠️ CHÚ Ý: Có ${nullGeomsCount} phường/xã bị khuyết (không có tọa độ).`);
            }

            const featureCollection = {
                "type": "FeatureCollection",
                "features": features
            };

            // Path xử lý Target theo requirement User
            const exportDir = path.join(__dirname, '..', 'public', 'data');
            const exportPath = path.join(exportDir, 'angiang_boundaries.json');

            // Safe create folder recursive 
            fs.mkdirSync(exportDir, { recursive: true });

            fs.writeFileSync(exportPath, JSON.stringify(featureCollection, null, 2));

            console.log(`\n🎉 THÀNH CÔNG RỰC RỠ! Toàn bộ file đã được Pack theo định dạng GeoJSON tiêu chuẩn.`);
            console.log(`📁 Đường dẫn tệp tin: ${exportPath}`);
            console.log(`✍️ Note: Bạn có thể mở trực tiếp cái file JSON trên để đánh chữ "Khu vực I", "Khu vực II"... vào trường "khu_vuc"`);

        } catch (e) {
            console.error("\n❌ LỖI TRẦM TRỌNG TRONG QUÁ TRÌNH PARSE - Đảm bảo URL là chuỗi tệp RAW TEXT JSON thuần.", e.message);
        }
    });

}).on('error', (e) => {
    console.error("❌ Bị mất kết nối Internet hoặc lỗi cấm URL: ", e.message);
});
