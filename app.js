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

// Khởi tạo Layer Phân vùng hành chính (GeoJSON Polygon)
let geoJsonLayer;

// ============================================
// COMMUNE NAME HELPERS (Dynamic & Robust)
// ============================================

/**
 * Get commune name from GeoJSON properties using fallback keys
 * @param {Object} props - Feature properties
 * @returns {string} - The detected commune name or 'Không xác định'
 */
const getCommuneName = (props) => {
    if (!props) return 'Không xác định';
    return props.ten_xa 
        || props.Ten_Xa 
        || props.ten_phuong 
        || props.Ten_Phuong 
        || props.TEN_HC 
        || props.Name 
        || props.name 
        || props.NAME_3 
        || 'Không xác định';
};

/**
 * Normalize commune names for robust matching (lowercase, no prefixes, no spaces)
 * @param {string} str - Name to normalize
 * @returns {string} - Normalized string
 */
const normalizeCommuneName = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.toLowerCase()
        .replace(/(xã|phường|thị trấn|tp\.|thành phố|thị xã|huyện|tphcm\.|district|commune|ward)/g, '')
        .replace(/\s+/g, '')
        .trim();
};

const getChoroplethStyle = (feature) => {
    let baseColor = '#bdc3c7'; // Màu xám mặc định cho vùng chưa có data (Kiên Giang/vùng khác)
    let opacity = 0.4;
    
    // Tìm xem xã này có nằm trong danh sách tracking (Excel) không
    const name = getCommuneName(feature.properties);
    const normalizedName = normalizeCommuneName(name);
    const trackingRegion = regions.find(r => normalizeCommuneName(r.name) === normalizedName);

    if (trackingRegion) {
        const kv = trackingRegion.khu_vuc || ''; // Lấy khu vực từ data Excel/Custom
        if (kv === 'Khu vực I') {
            baseColor = '#2ecc71'; opacity = 0.4;
        } else if (kv === 'Khu vực II') {
            baseColor = '#f39c12'; opacity = 0.5;
        } else if (kv === 'Khu vực III') {
            baseColor = '#e74c3c'; opacity = 0.6;
        } else {
            baseColor = '#3498db'; opacity = 0.3; // Màu xanh mặc định cho vùng CÓ trong Excel nhưng chưa gán khu vực
        }
    }

    return {
        color: baseColor,
        weight: 1,
        fillOpacity: opacity,
        fillColor: baseColor,
        dashArray: '3'
    };
};

const onGeoJsonHover = (e) => {
    const layer = e.target;
    // Tăng độ sáng viền + Fill
    layer.setStyle({
        weight: 3,
        color: '#ffffff',
        dashArray: '',
        fillOpacity: layer.options.fillOpacity + 0.2
    });
    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }
    // Ghi đè Z-index để Pointer / marker luôn ở trên lớp Polygon vừa bị Pull to front
    if (markerLayerGroup) {
        markerLayerGroup.eachLayer(m => {
            if (m.getElement && m.getElement()) {
                m.getElement().style.zIndex = 1000;
            }
        });
    }
};

const onGeoJsonOut = (e) => {
    if (geoJsonLayer) geoJsonLayer.resetStyle(e.target);
};

const onGeoJsonFeature = (feature, layer) => {
    layer.on({
        mouseover: onGeoJsonHover,
        mouseout: onGeoJsonOut
    });
    
    const name = getCommuneName(feature.properties);
    const normalizedName = normalizeCommuneName(name);
    const trackingRegion = regions.find(r => normalizeCommuneName(r.name) === normalizedName);

    let tooltipContent = `
        <div class="flex flex-col">
           <span class="font-bold text-white text-[13px]">${name}</span>
    `;

    if (trackingRegion) {
        if (trackingRegion.khu_vuc) {
            tooltipContent += `<span class="text-[10px] text-gray-300">${trackingRegion.khu_vuc}</span>`;
        } else {
            tooltipContent += `<span class="text-[10px] text-blue-300">Đang theo dõi tracking</span>`;
        }
    } else {
        tooltipContent += `<span class="text-[10px] text-gray-400 italic">Chưa có dữ liệu tracking</span>`;
    }

    tooltipContent += `</div>`;

    layer.bindTooltip(tooltipContent, { sticky: true, className: 'custom-tooltip', direction: 'auto' });
};

// Sẽ nạp GeoJSON qua Fetch trong hàm initData()
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

// ============================================
// CUSTOM COORDS (Drag & Drop) - Ưu tiên #1
// ============================================
const CUSTOM_COORDS_PREFIX = 'custom_coords_';

const getCustomCoords = (name) => {
    const stored = localStorage.getItem(CUSTOM_COORDS_PREFIX + name);
    return stored ? JSON.parse(stored) : null;
};

const setCustomCoords = (name, latlng) => {
    localStorage.setItem(CUSTOM_COORDS_PREFIX + name, JSON.stringify([latlng.lat, latlng.lng]));
    // Cập nhật lại trong mảng regions
    const region = regions.find(r => r.name === name);
    if (region) {
        region.latlng = [latlng.lat, latlng.lng];
        region.isCustomLoc = true;
    }
};

// Xuất toàn bộ tọa độ thành file JSON
const exportCoordinates = () => {
    const coordsMap = {};
    regions.forEach(r => {
        coordsMap[r.name] = r.latlng;
    });
    const json = JSON.stringify(coordsMap, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'an_giang_coordinates.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
window.exportCoordinates = exportCoordinates;


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
        // 1. Đọc dữ liệu Excel trước (Nền tảng để map màu sắc)
        const response = await fetch(encodeURI(FILE_NAME));
        if (!response.ok) throw new Error("File tracking (Excel) không tìm thấy: " + FILE_NAME);
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        let validRows = rawJson.filter((row, index) => {
             if (!row.some(v => String(v).trim() !== '')) return false;
             const rowText = row.join(' ').toLowerCase();
             if (index === 0 && (rowText.includes('stt') || rowText.includes('tên') || rowText.includes('email'))) {
                 return false;
             }
             return true;
        });

        // 2. Nạp Ranh giới Hành chính (GeoJSON)
        let geoJsonData = null;
        const geoPaths = [
            'data/angiang34.geojson',
            '/data/angiang34.geojson',
            'data/new_angiang_boundaries.json',
            '/data/new_angiang_boundaries.json',
            'public/data/angiang34.geojson',
            '/public/data/angiang34.geojson',
            'angiang34.geojson'
        ];

        console.log("⏳ Đang nạp Ranh giới Hành chính (GeoJSON)...");
        
        for (const path of geoPaths) {
            try {
                const res = await fetch(path);
                if (res.ok) {
                    geoJsonData = await res.json();
                    console.log(`✅ Đã nạp thành công GeoJSON từ: ${path}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!geoJsonData) {
            console.error("⛔ Không thể nạp được bất kỳ tệp Ranh giới nào. Vui lòng kiểm tra vị trí tệp GeoJSON.");
        }

        const geoCoordMap = {};
        if (geoJsonData) {
            geoJsonData.features.forEach(f => {
                const props = f.properties;
                const communeName = getCommuneName(props);
                if(communeName && communeName !== 'Không xác định') {
                    const norm = normalizeCommuneName(communeName);
                    try {
                        const centroid = turf.centroid(f);
                        if (centroid && centroid.geometry) {
                            geoCoordMap[norm] = [centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]];
                        }
                    } catch (err) {
                        console.warn(`⚠️ Lỗi tính centroid cho ${communeName}`);
                    }
                }
            });
        }
        
        let latLngBounds = [];

        // 4. Khởi tạo mảng regions từ Excel + Gán tọa độ từ GeoJSON
        regions = validRows.map((row, index) => {
            const { name, email } = extractData(row);
            let finalLatLng = [...DEFAULT_LATLNG];
            let isVerified = false;

            const custom = getCustomCoords(name);
            if (custom) {
                finalLatLng = custom;
                isVerified = true;
            } else {
                const norm = normalizeCommuneName(name); 
                if(geoCoordMap[norm]) {
                    finalLatLng = geoCoordMap[norm];
                    isVerified = true;
                }
            }
            
            if (isVerified && finalLatLng) {
                latLngBounds.push(finalLatLng);
            }

            return {
                id: `id_wow_${index}`,
                name: name,
                email: email,
                latlng: finalLatLng,
                isVerifiedLoc: isVerified,
                isCustomLoc: !!custom
            };
        });

        // 5. Vẽ Ranh giới Polygon (Giờ đã có data regions để style màu)
        if (geoJsonData) {
            geoJsonLayer = L.geoJSON(geoJsonData, {
                style: getChoroplethStyle,
                onEachFeature: onGeoJsonFeature
            }).addTo(map);
            geoJsonLayer.bringToBack();
            
            // Tự động căn chỉnh bản đồ theo toàn bộ ranh giới mới
            map.fitBounds(geoJsonLayer.getBounds(), { padding: [40, 40] });
        } else {
            console.error("⛔ Không thể vẽ Ranh giới Polygon vì dữ liệu GeoJSON trống.");
            // Thông báo trên UI sidebar
            const listContainer = document.getElementById('region-list');
            if (listContainer) {
                listContainer.insertAdjacentHTML('afterbegin', `
                    <div class="mb-4 p-3 bg-red-100/80 border border-red-200 text-red-700 rounded-xl text-xs font-semibold animate-pulse">
                        ⚠️ LỖI: Không tìm thấy file Ranh giới! Tọa độ xã đang dùng mặc định nên bị dồn lại một chỗ.
                    </div>
                `);
            }
            if (latLngBounds.length > 0) {
                map.fitBounds(L.latLngBounds(latLngBounds), { padding: [40, 40] });
            }
        }

        // 6. Vẽ Marker và Danh sách
        renderMap();
        renderList();

    } catch (err) {
        console.error(err);
        document.getElementById('region-list').innerHTML = `
            <div class="p-4 bg-red-50 text-red-600 rounded-xl border border-red-200">
                ⛔ Lỗi khởi tạo hệ thống: ${err.message}
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
                layer.openPopup();
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
            ? `<div class="text-[10px] bg-yellow-50 text-yellow-600 rounded px-2 py-1 mt-1 font-medium border border-yellow-200 animate-pulse">⏳ Đang tự động tìm vị trí thật... (có thể kéo thả)</div>` 
            : '';

        const customBadge = region.isCustomLoc
            ? `<div class="text-[10px] bg-blue-50 text-blue-600 rounded px-2 py-1 mt-1 font-medium border border-blue-200">✏️ Đã căn chỉnh thủ công</div>`
            : '';

        const popupContent = `
            <div class="p-4 flex flex-col gap-2 min-w-[210px]">
                <div>
                    <h3 class="font-bold text-slate-800 text-lg leading-tight tracking-tight">${region.name}</h3>
                    <p class="text-[13px] font-medium text-slate-500 truncate mt-0.5">${region.email}</p>
                    ${warningLoc}
                    ${customBadge}
                    <p class="text-[11px] text-slate-400 italic mt-1">💡 Bạn có thể kéo thả ghim này để sửa vị trí</p>
                </div>
                <hr class="border-slate-100 my-1"/>
                <button onclick="window.handleStatusToggle('${region.id}')" 
                        class="w-full mt-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-300 ${btnClass}">
                    ${txt}
                </button>
            </div>
        `;

        const marker = L.marker(region.latlng, { icon: icon, regionId: region.id, draggable: true });
        marker.bindPopup(popupContent);

        // Bắt sự kiện kéo thả - lưu tọa độ custom vào localStorage
        marker.on('dragend', (e) => {
            const newLatLng = e.target.getLatLng();
            setCustomCoords(region.name, newLatLng);
            // Cập nhật popup với badge mới
            const updatedCustomBadge = `<div class="text-[10px] bg-blue-50 text-blue-600 rounded px-2 py-1 mt-1 font-medium border border-blue-200">✏️ Đã căn chỉnh thủ công</div>`;
            e.target.setPopupContent(e.target.getPopup().getContent().replace(warningLoc, '').replace(customBadge, updatedCustomBadge));
            // Flash confirm
            const toast = document.createElement('div');
            toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl z-[9999] animate-bounce';
            toast.textContent = `📌 Đã lưu vị trí mới: ${region.name}`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2500);
        });

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
