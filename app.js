/**
 * An Giang Email Status Tracker - WOW Edition
 */

const FILE_NAME = '105-phuongxa-- email angiang.xlsx';
const DEFAULT_LATLNG = [10.3759, 105.4333]; // Long Xuyen fallback

// Khởi tạo Map
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false
}).setView([10.55, 105.15], 10);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Sử dụng bản đồ sáng/hiện đại thiết kế nhạt phù hợp glassmorphism
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

let regions = [];
let markerLayerGroup = L.layerGroup().addTo(map);

// Xử lý sự kiện resize tránh lỗi vỡ mảng xám của Leaflet khi chuyển đổi giao diện Mobile/Desktop
window.addEventListener('resize', () => {
    setTimeout(() => {
        if(map) map.invalidateSize();
    }, 300);
});

// Icons Pulse Animaton Markers
const iconPending = L.divIcon({
    className: 'pulse-marker marker-pending',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9]
});

const iconSent = L.divIcon({
    className: 'pulse-marker marker-sent',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10]
});

// Logic Lưu trữ trạng thái gửi email LocalStorage
const isEmailSent = (id) => localStorage.getItem(`ag_wow_${id}`) === 'true';

const toggleEmailStatus = (id) => {
    if (isEmailSent(id)) {
        localStorage.removeItem(`ag_wow_${id}`);
    } else {
        localStorage.setItem(`ag_wow_${id}`, 'true');
    }
    renderMap();
    renderList(document.getElementById('search-input').value);
};
window.handleStatusToggle = toggleEmailStatus;

/**
 * Geocoding logic via Nominatim with Rate-limit consideration
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const geocodeCommune = async (name) => {
    // Tận dụng Catch Storage trước khi đập request
    const cacheKey = `geo_wow_${name}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
        console.log(`📡 Đang định vị: ${name}...`);
        const query = encodeURIComponent(`${name}, An Giang, Vietnam`);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
        const data = await res.json();
        
        if (data && data.length > 0) {
            const loc = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            localStorage.setItem(cacheKey, JSON.stringify(loc));
            return loc;
        } else {
            console.warn(`❌ Không tìm thấy tọa độ cho: ${name}`);
            return null; // Quăng fallback logic
        }
    } catch (e) {
        console.error("Geocoding failed", e);
        return null; // Quăng fallback logic
    }
};

// Trích xuất dữ liệu thông minh từ mảng dữ liệu (Không dùng key object)
const extractData = (rowArray) => {
    // 1. Tìm Email: chứa '@'
    const foundEmail = rowArray.find(col => col && String(col).includes('@'));
    const email = foundEmail ? String(foundEmail).trim() : 'Chưa có email';
    
    // 2. Tìm Tên xã: dài hơn 3 ký tự, không chứa '@', không phải là số thuần túy
    const foundName = rowArray.find(col => {
        if (!col) return false;
        const str = String(col).trim();
        return str.length > 3 && !str.includes('@') && isNaN(Number(str)) && !str.toLowerCase().includes('email');
    });
    const name = foundName ? String(foundName).trim() : 'Không xác định';

    return { name, email };
};

const initData = async () => {
    try {
        // Fetch Excel 
        const response = await fetch(FILE_NAME);
        if (!response.ok) throw new Error("File not found");
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        // Chuyển đổi dưới dạng Mảng của các Mảng (Array of Arrays) tương tự PapaParse header: false
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        // Bỏ qua dòng tiêu đề có chứa các từ khóa Tên, STT...
        let validRows = rawJson.filter((row, index) => {
             // Loại dòng rỗng hoàn toàn
             if (!row.some(v => String(v).trim() !== '')) return false;
             // Loại dòng đầu tiên nếu nghi ngờ là header
             const rowText = row.join(' ').toLowerCase();
             if (index === 0 && (rowText.includes('stt') || rowText.includes('tên') || rowText.includes('email'))) {
                 return false;
             }
             return true;
        });
        
        // Setup initial region array
        regions = validRows.map((row, index) => {
            const { name, email } = extractData(row);
            return {
                id: `id_wow_${index}`,
                name: name,
                email: email,
                latlng: [...DEFAULT_LATLNG], // Fallback temp array
                isVerifiedLoc: false
            };
        });

        // Vẽ bộ khung Local/Cached trước cho nhanh
        const initBatchGeocodingCacheCheck = () => {
             regions.forEach(region => {
                const cacheKey = `geo_wow_${region.name}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    region.latlng = JSON.parse(cached);
                    region.isVerifiedLoc = true;
                }
             })
        }
        initBatchGeocodingCacheCheck();
        
        // Render Initial Map (Chủ yếu local storage caching)
        renderMap();
        renderList();

        // 🟢 Background API fetch rate limiting 1.2s for Geolocation MISSES
        let apiQueueTotal = regions.filter(r => !r.isVerifiedLoc).length;
        let apiProcessed = 0;

        for (let i = 0; i < regions.length; i++) {
            const region = regions[i];
            if (!region.isVerifiedLoc) {
                apiProcessed++;
                // Nhét indicator Loading nhẹ chạy báo hiệu người dùng
                const list = document.getElementById('region-list');
                let gUI = document.getElementById('loading-geo');
                if (!gUI) {
                    gUI = document.createElement('div');
                    gUI.id = "loading-geo";
                    gUI.className = "text-[12px] text-blue-600 font-medium text-center py-2 mt-1 mb-2 bg-blue-50 rounded-lg animate-pulse border border-blue-100 shadow-sm";
                    list.insertBefore(gUI, list.firstChild);
                }
                gUI.textContent = `⏳ Đang dò tọa độ xã thứ ${apiProcessed}/${apiQueueTotal}: ${region.name}...`;

                // Fetch API (Delay 1.2s bắt buộc để không bị Rate limit OSM)
                await delay(1200); 
                const loc = await geocodeCommune(region.name);

                if (loc) {
                    region.latlng = loc;
                    region.isVerifiedLoc = true;
                } else {
                    // Fallback thông minh: Tỏa ngẫu nhiên quanh Long Xuyên (nhỏ, để không bị đè xếp lớp)
                    region.latlng = [
                        DEFAULT_LATLNG[0] + (Math.random() - 0.5) * 0.04,
                        DEFAULT_LATLNG[1] + (Math.random() - 0.5) * 0.04
                    ];
                    localStorage.setItem(`geo_wow_${region.name}`, JSON.stringify(region.latlng));
                }
                
                // Re-render
                renderMap();
            }
        }
        
        // Hoàn thành hết hàng đợi
        const finalGUI = document.getElementById('loading-geo');
        if (finalGUI) finalGUI.remove();

    } catch (err) {
        console.error(err);
        document.getElementById('region-list').innerHTML = `
            <div class="p-4 bg-red-50 text-red-600 rounded-xl border border-red-200">
                ⛔ Lỗi đọc file: ${FILE_NAME}. Hãy chắc chắn tệp tồn tại!
            </div>
        `;
    }
};

const focusRegion = (id) => {
    const region = regions.find(r => r.id === id);
    if (!region) return;
    
    // Zoom & Fly mượt
    map.flyTo(region.latlng, 14, { duration: 1.5, easeLinearity: 0.25 });
    
    setTimeout(() => {
        markerLayerGroup.eachLayer(layer => {
            if (layer.options.regionId === id) {
                layer.togglePopup();
            }
        });
    }, 1500);
};
window.focusRegion = focusRegion;

// Logic Backup Dữ liệu
const exportToCSV = () => {
    const sentRegions = regions.filter(r => isEmailSent(r.id));
    if (sentRegions.length === 0) {
        alert("Chưa có xã nào được đánh dấu đã gửi!");
        return;
    }
    
    // Generate CSV Content with UTF-8 BOM explicitly
    let csvContent = "\uFEFFSTT,Tên Xã/Phường,Email,Tọa Độ\n";
    sentRegions.forEach((r, idx) => {
        csvContent += `${idx + 1},"${r.name}","${r.email}","${r.latlng.join(', ')}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "danh_sach_da_gui.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
window.exportToCSV = exportToCSV;

const renderMap = () => {
    markerLayerGroup.clearLayers();
    let sentCount = 0;

    regions.forEach(region => {
        const isSent = isEmailSent(region.id);
        if (isSent) sentCount++;
        
        const icon = isSent ? iconSent : iconPending;
        const btnClass = isSent 
            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300' 
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-transform hover:scale-[1.02] active:scale-95';
        const txt = isSent ? 'Hủy gửi (Hoàn tác)' : 'Đánh Dấu Đã Gửi 📤';

        const warningLoc = !region.isVerifiedLoc 
            ? `<div class="text-[10px] bg-yellow-50 text-yellow-600 rounded px-2 py-1 mt-1 font-medium border border-yellow-200">⚠️ Vị trí ước lượng do không tìm thấy trên bản đồ thế giới</div>` 
            : '';

        const popupContent = `
            <div class="p-4 flex flex-col gap-2 min-w-[200px]">
                <div>
                    <h3 class="font-bold text-slate-800 text-lg leading-tight tracking-tight">${region.name}</h3>
                    <p class="text-[13px] font-medium text-slate-500 truncate mt-0.5">${region.email}</p>
                    ${warningLoc}
                </div>
                <hr class="border-slate-100 my-1"/>
                <button onclick="window.handleStatusToggle('${region.id}')" 
                        class="w-full mt-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-300 ${btnClass}">
                    ${txt}
                </button>
            </div>
        `;

        const marker = L.marker(region.latlng, { icon: icon, regionId: region.id });
        marker.bindPopup(popupContent);
        markerLayerGroup.addLayer(marker);
    });

    document.getElementById('stat-total').textContent = regions.length;
    document.getElementById('stat-sent').textContent = sentCount;
    document.getElementById('stat-pending').textContent = regions.length - sentCount;
};

const renderList = (searchTerm = '') => {
    const listContainer = document.getElementById('region-list');
    
    // Giữ lại element loader geolocation nếu có
    const geoLoadParams = document.getElementById('loading-geo');
    listContainer.innerHTML = '';
    if(geoLoadParams) listContainer.appendChild(geoLoadParams);

    const filtered = regions.filter(r => 
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        r.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (filtered.length === 0) {
        listContainer.insertAdjacentHTML('beforeend', '<div class="text-center text-slate-400 py-6 text-sm font-medium">Không tìm thấy kết quả 🍂</div>');
        return;
    }

    filtered.forEach(region => {
        const isSent = isEmailSent(region.id);
        
        const badge = isSent 
            ? `<span class="px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-widest shadow-sm">Đã gửi</span>`
            : `<span class="px-2.5 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase tracking-widest shadow-sm">Chưa gửi</span>`;
        
        const cardClass = isSent ? 'bg-white/90 border-l-[3px] border-emerald-500 opacity-80' : 'bg-white/80 border-l-[3px] border-red-500';

        const div = document.createElement('div');
        div.className = `list-card p-3.5 mb-2.5 rounded-xl cursor-pointer border border-white/60 shadow-sm ${cardClass}`;
        div.onclick = () => focusRegion(region.id);
        
        div.innerHTML = `
            <div class="flex justify-between items-center mb-1.5">
                <span class="font-bold text-slate-800 text-sm leading-tight pr-2">${region.name}</span>
                ${badge}
            </div>
            <div class="text-[12px] font-medium text-slate-500 truncate flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                ${region.email}
            </div>
        `;
        listContainer.appendChild(div);
    });
};

document.getElementById('search-input').addEventListener('input', (e) => {
    renderList(e.target.value);
});

// Kickoff
initData();
