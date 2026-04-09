/**
 * An Giang Email Status Tracker - WOW Edition
 */

// Configuration
const FILE_NAME = '105-phuongxa-- email angiang.xlsx';
const SUPABASE_CONFIG = window.__SUPABASE_CONFIG__ || {};
const SUPABASE_URL = SUPABASE_CONFIG.url || '';
const SUPABASE_ANON_KEY = SUPABASE_CONFIG.anonKey || '';
const supabaseClient = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    })
    : null;
const COMMUNE_STATE_TABLE = 'commune_states';

let isDataLoaded = false;
let hasBootstrapped = false;
let currentUser = null;
let userStates = new Map();
let communeStateChannel = null;
const RACH_GIA_COORDS = L.latLng(10.0159, 105.0809); // Tọa độ trung tâm Rạch Giá

const DEFAULT_LATLNG = [10.3759, 105.4333]; // Long Xuyen fallback
const ZOOM_THRESHOLD = 11; // Ngưỡng hiển thị Tooltip cố định (Permanent)

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
let stripePattern;

const emptyCommuneState = () => ({
    email_sent: false,
    contracted: false,
    phone: '',
    note: '',
    updated_at: null
});

const resolveCommuneKey = (value) => {
    if (!value) return '';

    const rawName = typeof value === 'object'
        ? value.name || value.commune_name || value.region_name || value.label || ''
        : value;

    return normalizeCommuneName(String(rawName));
};

const getCommuneState = (value) => {
    const key = resolveCommuneKey(value);
    return userStates.get(key) || emptyCommuneState();
};

const loadUserStates = async () => {
    if (!supabaseClient || !currentUser) {
        userStates = new Map();
        return;
    }

    const { data, error } = await supabaseClient
        .from(COMMUNE_STATE_TABLE)
        .select('commune_key,email_sent,contracted,phone,note,updated_at');

    if (error) throw error;

    userStates = new Map((data || []).map((row) => [row.commune_key, {
        email_sent: Boolean(row.email_sent),
        contracted: Boolean(row.contracted),
        phone: row.phone || '',
        note: row.note || '',
        updated_at: row.updated_at || null
    }]));
};

const upsertCommuneState = async (communeName, patch) => {
    if (!supabaseClient || !currentUser) {
        throw new Error('Chưa kết nối Supabase hoặc chưa đăng nhập.');
    }

    const communeKey = resolveCommuneKey(communeName);
    const nextState = {
        ...emptyCommuneState(),
        ...getCommuneState(communeKey),
        ...patch,
        updated_at: new Date().toISOString(),
        commune_key: communeKey,
        commune_name: String(communeName),
        updated_by: currentUser.id
    };

    const { error } = await supabaseClient
        .from(COMMUNE_STATE_TABLE)
        .upsert(nextState, { onConflict: 'commune_key' });

    if (error) throw error;

    userStates.set(communeKey, {
        email_sent: Boolean(nextState.email_sent),
        contracted: Boolean(nextState.contracted),
        phone: nextState.phone || '',
        note: nextState.note || '',
        updated_at: nextState.updated_at
    });
};

const refreshSharedStates = async () => {
    try {
        await loadUserStates();
        if (geoJsonLayer) {
            geoJsonLayer.setStyle(getChoroplethStyle);
        }
        renderMap();
        renderList(document.getElementById('search-input')?.value || '');
    } catch (error) {
        console.error('Không thể đồng bộ dữ liệu realtime:', error);
    }
};

const subscribeToCommuneStates = () => {
    if (!supabaseClient) return;

    if (communeStateChannel) {
        supabaseClient.removeChannel(communeStateChannel);
        communeStateChannel = null;
    }

    communeStateChannel = supabaseClient
        .channel('commune-states-realtime')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: COMMUNE_STATE_TABLE
            },
            () => {
                void refreshSharedStates();
            }
        )
        .subscribe();
};

const unsubscribeFromCommuneStates = () => {
    if (!supabaseClient || !communeStateChannel) return;

    supabaseClient.removeChannel(communeStateChannel);
    communeStateChannel = null;
};

// Helper: Normalize commune names

// Khởi tạo Hatch Pattern (Gạch sọc Vàng Gold cho xã đã ký Hợp đồng)
// Khởi tạo Hatch Pattern (Đã gỡ bỏ do lỗi hiển thị trên một số trình duyệt)
function initPatterns() {
    return true; // Bỏ qua vì đã chuyển sang Solid Style
}

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
    // 1. Dữ liệu nền
    const name = getCommuneName(feature.properties);
    const normalizedName = normalizeCommuneName(name);
    const trackingRegion = regions.find(r => normalizeCommuneName(r.name) === normalizedName);

    // MẶC ĐỊNH: Màu xám nhạt (Slate-100) cho vùng chưa có data hoặc ngoài An Giang
    let style = {
        fillColor: '#f1f5f9',
        weight: 1,
        opacity: 0.3,
        color: '#cbd5e1',
        fillOpacity: 0.2,
        dashArray: ''
    };

    if (trackingRegion) {
        // TRƯỜNG HỢP 1: Đã chốt Hợp đồng (Ưu tiên cao nhất - Vàng Gold)
        if (trackingRegion.hasContract || isContracted(name)) {
            style = {
                fillColor: '#f1c40f', // Vàng Gold
                weight: 2,
                opacity: 1,
                color: '#d97706',      // Viền Amber-600
                fillOpacity: 0.7,
                dashArray: ''
            };
        } 
        // TRƯỜNG HỢP 2: Đã gửi Email (Xanh Pastel)
        else if (isEmailSent(trackingRegion.name)) {
            style = {
                fillColor: '#bae6fd', // Xanh dương nhạt (Sky-200)
                weight: 2,
                opacity: 1,
                color: '#2563eb',      // Viền Blue-600
                fillOpacity: 0.6,
                dashArray: ''
            };
        }
        // TRƯỜNG HỢP 3: Có trong danh sách Tracking nhưng chưa gửi (Xám nhạt dịu mắt)
        else {
            style = {
                fillColor: '#e2e8f0', // Xám Slate-200
                weight: 1,
                opacity: 1,
                color: '#94a3b8',      // Viền Slate-400
                fillOpacity: 0.5,
                dashArray: '3'
            };
        }
    }

    return style;
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
    // 1. Tạo Fallback Text & Logic Debug (Yêu cầu sửa lỗi)
    const rawName = getCommuneName(feature.properties);
    // Nếu getCommuneName trả về 'Không xác định', ta coi như rỗng để kích hoạt fallback
    const mapName = (rawName === 'Không xác định') ? "" : rawName;
    const finalName = mapName ? mapName : "Khu vực chưa có tên (Missing Data)";

    // Debug Data ngầm
    if (!mapName || mapName === "") {
        console.warn("Polygon thiếu tên:", feature.properties);
    }

    layer.on({
        mouseover: onGeoJsonHover,
        mouseout: onGeoJsonOut,
        click: (e) => {
            const name = getCommuneName(feature.properties);
            const isContract = isContracted(name);
            const data = getCommuneState(name);
            const btnContractText = isContract ? 'Hủy Chốt ✖️' : 'Chốt Hợp Đồng 🤝';
            const btnContractClass = isContract 
                ? 'bg-slate-100 text-slate-600 border border-slate-300' 
                : 'bg-amber-500 text-white shadow-amber-200 shadow-md transform hover:scale-105 transition-all';

            // Tính toán khoảng cách từ Rạch Giá
            const targetCenter = layer.getBounds().getCenter();
            const distanceMeters = RACH_GIA_COORDS.distanceTo(targetCenter);
            const distanceKm = (distanceMeters / 1000).toFixed(1);

            const popupContent = `
                <div class="p-4 min-w-[280px]">
                    <div class="mb-4 border-b border-slate-100 pb-3 text-slate-800">
                        <h4 class="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-1">Hồ sơ khu vực</h4>
                        <p class="font-black text-2xl leading-tight">${finalName}</p>
                        <p class="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1">
                            <span class="text-sm">📍</span> Cách Rạch Giá: ~${distanceKm} km <span class="text-[9px] italic text-slate-400 opacity-80">(chim bay)</span>
                        </p>
                    </div>
                    
                    <div class="space-y-4 mb-4">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Số điện thoại liên hệ</label>
                            <input type="text" id="crm-phone-${normalizeCommuneName(name)}" 
                                   value="${data.phone || ''}"
                                   placeholder="Ví dụ: 090..."
                                   class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Ghi chú chiến dịch</label>
                            <textarea id="crm-note-${normalizeCommuneName(name)}" 
                                      rows="2"
                                      placeholder="Nhập ghi chú quan trọng..."
                                      class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all">${data.note || ''}</textarea>
                        </div>
                    </div>

                    <div class="flex flex-col gap-2">
                        <button onclick="window.handleSaveNote('${name}')" 
                                class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 active:scale-95 transition-all">
                            💾 Lưu thông tin CRM
                        </button>
                        <button onclick="window.handleContractToggle('${name}')" 
                                class="w-full py-2.5 rounded-xl font-bold text-sm ${btnContractClass}">
                            ${btnContractText}
                        </button>
                    </div>
                </div>
            `;
            L.popup({ maxWidth: 350 })
                .setLatLng(e.latlng)
                .setContent(popupContent)
                .openOn(map);
        }
    });
    
    // Sử dụng finalName cho Tooltip render
    const name = getCommuneName(feature.properties);
    const normalizedName = normalizeCommuneName(name);
    const trackingRegion = regions.find(r => normalizeCommuneName(r.name) === normalizedName);

    let tooltipContent = `
        <div class="flex flex-col">
           <span class="font-black text-slate-800 text-[14px]">${finalName}</span>
    `;

    if (trackingRegion) {
        if (trackingRegion.khu_vuc) {
            tooltipContent += `<span class="text-[10px] text-slate-500 font-bold">${trackingRegion.khu_vuc}</span>`;
        } else {
            tooltipContent += `<span class="text-[10px] text-blue-600 font-bold">Đang theo dõi tracking</span>`;
        }
    } else {
        tooltipContent += `<span class="text-[10px] text-slate-400 italic">Chưa có dữ liệu tracking</span>`;
    }

    tooltipContent += `</div>`;

    // 2. Logic Dynamic Tooltip: Tự động quyết định hiển thị theo mức Zoom
    const currentZoom = map.getZoom();
    const isPermanent = currentZoom >= ZOOM_THRESHOLD;

    layer.bindTooltip(tooltipContent, { 
        sticky: !isPermanent, 
        permanent: isPermanent,
        className: 'custom-tooltip', 
        direction: isPermanent ? 'center' : 'auto' 
    });
};

// 3. Zoom Listener: Cập nhật Tooltip cho TOÀN BỘ Layer khi dừng Zoom
map.on('zoomend', () => {
    if (!geoJsonLayer) return;
    
    const zoom = map.getZoom();
    const isPermanent = zoom >= ZOOM_THRESHOLD;
    
    console.log(`🔍 Zoom Level: ${zoom} | Tooltip Mode: ${isPermanent ? 'PERMANENT' : 'HOVER'}`);
    
    geoJsonLayer.eachLayer(layer => {
        const tooltip = layer.getTooltip();
        if (tooltip) {
            const content = tooltip.getContent();
            layer.unbindTooltip();
            layer.bindTooltip(content, {
                sticky: !isPermanent,
                permanent: isPermanent,
                className: 'custom-tooltip',
                direction: isPermanent ? 'center' : 'auto'
            });
        }
    });
});

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

// Logic lưu trạng thái gửi email theo tài khoản Supabase
const isEmailSent = (value) => getCommuneState(value).email_sent === true;

const toggleEmailStatus = async (id) => {
    try {
        const region = regions.find((item) => String(item.id) === String(id));
        if (!region) return;

        const nextValue = !isEmailSent(region.name);
        await upsertCommuneState(region.name, {
            email_sent: nextValue
        });
    } catch (error) {
        console.error('Không thể cập nhật trạng thái email:', error);
        alert('Không thể lưu trạng thái email lên Supabase. Kiểm tra bảng commune_states.');
        return;
    }

    if (geoJsonLayer) {
        geoJsonLayer.setStyle(getChoroplethStyle);
    }

    renderMap();
    renderList(document.getElementById('search-input').value);
};
window.handleStatusToggle = toggleEmailStatus;

// Logic chốt hợp đồng theo tài khoản Supabase
const isContracted = (value) => getCommuneState(value).contracted === true;

const toggleContractStatus = async (name) => {
    try {
        const nextValue = !isContracted(name);
        await upsertCommuneState(name, {
            contracted: nextValue
        });
    } catch (error) {
        console.error('Không thể cập nhật trạng thái hợp đồng:', error);
        alert('Không thể lưu hợp đồng lên Supabase. Kiểm tra bảng commune_states.');
        return;
    }

    if (geoJsonLayer) {
        geoJsonLayer.setStyle(getChoroplethStyle);
    }

    map.closePopup();

    renderMap();
    renderList(document.getElementById('search-input').value);
};
window.handleContractToggle = toggleContractStatus;

// Mini-CRM Logic: Lưu trữ SĐT và Ghi chú
const handleSaveNote = async (name) => {
    const norm = normalizeCommuneName(name);
    const phone = document.getElementById(`crm-phone-${norm}`).value;
    const note = document.getElementById(`crm-note-${norm}`).value;

    try {
        await upsertCommuneState(name, {
            phone,
            note
        });
    } catch (error) {
        console.error('Không thể lưu ghi chú CRM:', error);
        alert('Không thể lưu ghi chú lên Supabase. Kiểm tra bảng commune_states.');
        return;
    }

    map.closePopup();
    renderList(document.getElementById('search-input').value);

    console.log(`✅ Đã lưu CRM cho ${name}`);
};
window.handleSaveNote = handleSaveNote;

// ============================================
// SYSTEM UTILS
// ============================================
const CUSTOM_COORDS_PREFIX = 'custom_coords_';

const getCustomCoords = (name) => {
    // Lock: Không dùng tọa độ tùy chỉnh nữa, luôn dùng tọa độ đã tính
    return null;
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

// Logic Responsive: Thu gọn/Mở rộng Sidebar
const toggleSidebar = () => {
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('sidebar-collapsed');
        // Ép Leaflet tính toán lại kích thước map sau khi sidebar thay đổi diện tích
        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 350); // Đợi hiệu ứng trượt (300ms) của Sidebar hoàn tất + 50ms bù trừ
    }
};
window.toggleSidebar = toggleSidebar;


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

    // 3. Tìm trạng thái Hợp đồng: chứa "Đã ký" hoặc "Đã ký HĐ"
    const hasContract = rowArray.some(col => 
        col && String(col).toLowerCase().includes('đã ký')
    );

    return { name, email, hasContract };
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
        regions = [];
        validRows.forEach((rowArray) => {
            const { name, email, hasContract } = extractData(rowArray);
            
            let khu_vuc = 'Khu vực I'; 
            
            if (name !== 'Không xác định') {
                regions.push({
                    id: btoa(unescape(encodeURIComponent(name))),
                    name,
                    email,
                    hasContract,
                    khu_vuc,
                    latlng: geoCoordMap[normalizeCommuneName(name)] || DEFAULT_LATLNG,
                    isVerifiedLoc: !!geoCoordMap[normalizeCommuneName(name)]
                });
            }
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
    const sentRegions = regions.filter(r => isEmailSent(r.name));
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
        const isSent = isEmailSent(region.name);
        if (isSent) sentCount++;
        
        const icon = isSent ? iconSent : iconPending;
        const btnClass = isSent 
            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300' 
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-transform hover:scale-[1.02] active:scale-95';
        const txt = isSent ? 'Hủy gửi (Hoàn tác)' : 'Đánh Dấu Đã Gửi 📤';

        const popupContent = `
            <div class="p-4 flex flex-col gap-2 min-w-[210px]">
                <div>
                    <h3 class="font-bold text-slate-800 text-lg leading-tight tracking-tight">${region.name}</h3>
                    <p class="text-[13px] font-medium text-slate-500 truncate mt-0.5">${region.email}</p>
                </div>
                <hr class="border-slate-100 my-1"/>
                <button onclick="window.handleStatusToggle('${region.id}')" 
                        class="w-full mt-1 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-300 ${btnClass}">
                    ${txt}
                </button>
            </div>
        `;

        const marker = L.marker(region.latlng, { icon: icon, regionId: region.id, draggable: false });
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
        const isSent = isEmailSent(region.name);
        const regionState = getCommuneState(region.name);
        
        const badge = isSent 
            ? `<span class="px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-widest shadow-sm">Đã gửi</span>`
            : `<span class="px-2.5 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase tracking-widest shadow-sm">Chưa gửi</span>`;
        
        const cardClass = isSent ? 'bg-white/90 border-l-[3px] border-emerald-500 opacity-80' : 'bg-white/80 border-l-[3px] border-red-500';

        const div = document.createElement('div');
        div.className = `list-card p-3.5 mb-2.5 rounded-xl cursor-pointer border border-white/60 shadow-sm ${cardClass}`;
        div.onclick = () => focusRegion(region.id);
        
        div.innerHTML = `
            <div class="flex justify-between items-center mb-1.5">
                <span class="font-bold text-slate-800 text-sm leading-tight pr-2">
                    ${isContracted(region.name) ? '🤝 ' : ''}${region.name}
                    ${regionState.phone ? '<span class="ml-1" title="Đã có SĐT CRM">📱</span>' : ''}
                </span>
                ${badge}
            </div>
            <div class="text-[10px] mt-2 flex gap-2 items-center">
                <span class="text-xs">📍</span>
                <span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md font-bold">${region.email_status || 'Chưa gửi'}</span>
                ${isContracted(region.name) ? '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-bold text-[9px]">HỢP ĐỒNG</span>' : ''}
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

// ============================================
// AUTH & BOOTSTRAP (Đặt ở cuối để tránh lỗi ReferenceError)
// ============================================
const showLoginScreen = () => {
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
};

const showAppScreen = () => {
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
};

const renderUserInfoBar = (user) => {
    const userInfoEl = document.getElementById('user-info-bar');
    if (!userInfoEl) return;

    const displayName = user?.email || 'Tài khoản Supabase';

    userInfoEl.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 flex items-center justify-center bg-blue-500/20 text-blue-400 rounded-xl border border-white/10">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            </div>
            <div class="flex flex-col">
                <span class="text-xs font-black text-white tracking-wide uppercase">${displayName}</span>
                <span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Đồng bộ trạng thái lên Supabase</span>
            </div>
        </div>
        <button onclick="window.handleLogout()" class="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all active:scale-95 group" title="Đăng xuất">
            <svg class="w-5 h-5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
        </button>
    `;
};

const bootAuthenticatedApp = async (user) => {
    currentUser = user;
    showAppScreen();
    renderUserInfoBar(user);

    try {
        await loadUserStates();
    } catch (error) {
        console.error('Không thể tải trạng thái người dùng:', error);
        userStates = new Map();
    }

    subscribeToCommuneStates();

    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 300);

    if (!isDataLoaded) {
        isDataLoaded = true;
        initPatterns();
        await initData();
        return;
    }

    renderMap();
    renderList(document.getElementById('search-input')?.value || '');
    hasBootstrapped = true;
};

const syncAuthState = async (session) => {
    const user = session?.user || null;

    if (!user) {
        currentUser = null;
        userStates = new Map();
        hasBootstrapped = false;
        unsubscribeFromCommuneStates();
        showLoginScreen();
        return;
    }

    if (hasBootstrapped && currentUser?.id === user.id) {
        showAppScreen();
        renderUserInfoBar(user);
        return;
    }

    await bootAuthenticatedApp(user);
};

const handleLogout = async () => {
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
};
window.handleLogout = handleLogout;

const handleLogin = async (e) => {
    e.preventDefault();
    const userVal = document.getElementById('username').value;
    const passVal = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');

    if (!supabaseClient) {
        errorMsg.textContent = 'Chưa cấu hình SUPABASE_URL hoặc SUPABASE_ANON_KEY.';
        errorMsg.classList.remove('hidden');
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: userVal,
        password: passVal
    });

    if (error || !data?.user) {
        console.error('Đăng nhập Supabase thất bại:', error);
        errorMsg.textContent = 'Tài khoản hoặc mật khẩu Supabase không đúng!';
        errorMsg.classList.remove('hidden');
        const form = document.getElementById('login-form');
        form.classList.add('animate-shake');
        setTimeout(() => form.classList.remove('animate-shake'), 500);
        return;
    }

    errorMsg.classList.add('hidden');
};

// Khởi tạo Auth khi trang sẵn sàng
document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    if (!supabaseClient) {
        showLoginScreen();
        const errorMsg = document.getElementById('login-error');
        if (errorMsg) {
            errorMsg.textContent = 'Thiếu cấu hình Supabase. Kiểm tra .env.local và chạy lại server.';
            errorMsg.classList.remove('hidden');
        }
        return;
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        void syncAuthState(session);
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    await syncAuthState(session);
});
