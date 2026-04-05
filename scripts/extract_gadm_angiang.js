const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, '..', 'gadm41_VNM_3.json');
const outputDir = path.join(__dirname, '..', 'public', 'data');
const outputFile = path.join(outputDir, 'new_angiang_boundaries.json');

console.log("🚀 Bắt đầu trích xuất dữ liệu ranh giới An Giang (Mới - Bao gồm Kiên Giang) từ GADM...");

try {
    // 1. Kiểm tra sự tồn tại của file gốc
    if (!fs.existsSync(inputFile)) {
        throw new Error(`Không tìm thấy file nguồn. Vui lòng đảm bảo file gadm41_VNM_3.json được đặt đúng ở root directory:\n👉 ${inputFile}`);
    }

    console.log("⏳ Đang tải tệp GADM khổng lồ vào bộ nhớ (Tiến trình này có thể hơi nặng)...");
    const rawData = fs.readFileSync(inputFile, 'utf8');
    
    console.log("⏳ Đang phân rã dữ liệu (Parse JSON)...");
    const geoData = JSON.parse(rawData);

    if (!geoData.features || !Array.isArray(geoData.features)) {
         throw new Error("Lỗi định dạng: File GADM gốc không chứa mảng 'features' theo chuẩn GeoJSON FeatureCollection.");
    }

    const totalRecords = geoData.features.length;
    console.log(`🗺️ Parse thành công bộ dữ liệu chứa [${totalRecords}] đơn vị hành chính toàn quốc Việt Nam.`);
    console.log("🔍 Đang sử dụng bộ lọc (Filter) săn tìm toàn bộ xã thuộc 'An Giang' và 'Kiên Giang' (NAME_1)...");

    // 2. Map & Filter Logic
    const extractedFeatures = geoData.features
        .filter(feature => {
            if (!feature.properties) return false;
            const prov = feature.properties.NAME_1;
            // Catching both provinces from GADM 4.1 naming variants
            return prov === 'AnGiang' || prov === 'An Giang' || prov === 'KienGiang' || prov === 'Kien Giang' || prov === 'Kiên Giang';
        })
        .map(commune => {
            const props = commune.properties;
            return {
                type: "Feature",
                properties: {
                    id: props.GID_3 || "không-rõ-mã",
                    name: props.NAME_3 || "Chưa rõ Tên xã",
                    district: props.NAME_2 || "Chưa rõ Huyện",
                    province: "An Giang", // Hardcode theo yêu cầu An Giang Mới
                    khu_vuc: "" // Điểm neo bỏ trống - Rất then chốt
                },
                geometry: commune.geometry || null
            };
        });

    if (extractedFeatures.length === 0) {
         console.warn("\n⚠️ CẢNH BÁO: Trích xuất hoàn thành nhưng quét mảng Features trúng [0] xã của tỉnh 'An Giang' và 'Kiên Giang'!!");
    } else {
         console.log(`✅ Tuyệt vời! Thu thập rách lưới được tổng cộng [${extractedFeatures.length}] Phường/Xã chi tiết kèm tọa độ vẽ.`);
    }

    // 3. Đóng gói lại chuẩn Format Collection Mapping
    const resultJson = {
        type: "FeatureCollection",
        features: extractedFeatures
    };

    // 4. Khâu xuất File (Writer) đệ quy thư mục an toàn
    fs.mkdirSync(outputDir, { recursive: true });

    console.log("⏳ Đang ghi thông tin chuẩn hóa ra tệp đích Json Format...");
    fs.writeFileSync(outputFile, JSON.stringify(resultJson, null, 2), 'utf8');

    console.log("\n🎉 THÀNH CÔNG RỰC RỠ! Hoàn thành trọn vẹn quy trình (Plan -> Do -> Check).");
    console.log(`📁 File kết tinh nằm ngoan ngoãn tại đường dẫn: /public/data/new_angiang_boundaries.json`);

} catch (error) {
    // Bẫy lỗi Check PDCA
    console.error("\n❌ LỖI NGHIÊM TRỌNG (CHECK FAILED):");
    console.error(error.message);
    process.exit(1);
}
