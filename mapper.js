const fs = require('fs');

const rawData = require('./data/coords.json');
const names = Object.keys(rawData);

function classifyDistrict(name) {
    const n = name.toLowerCase();
    
    // KIÊN GIANG
    if (n.includes('hà tiên') || n.includes('tô châu') || n.includes('mỹ đức')) return [10.38, 104.48];
    if (n.includes('rạch giá')) return [10.01, 105.08];
    if (n.includes('phú quốc') || n.includes('thổ châu')) return [10.22, 103.96];
    if (n.includes('kiên hải') || n.includes('lại sơn') || n.includes('nam du') || n.includes('hòn nghệ') || n.includes('an sơn') || n.includes('tiên hải') || n.includes('sơn hải')) return [9.8, 104.3];
    if (n.includes('gò quao') || n.includes('vĩnh hòa hưng') || n.includes('vĩnh tuy') || n.includes('định hòa')) return [9.76, 105.22];
    if (n.includes('giang thành') || n.includes('vĩnh điều') || n.includes('tân khánh hòa') || n.includes('phú mỹ')) return [10.51, 104.81];
    if (n.includes('hòn đất') || n.includes('bình sơn') || n.includes('sơn kiên')) return [10.11, 104.88];
    if (n.includes('kiên lương') || n.includes('bình an') || n.includes('hòa điền')) return [10.23, 104.62];
    if (n.includes('tân hiệp') || n.includes('thạnh đông')) return [10.05, 105.3];
    if (n.includes('giồng riềng') || n.includes('hòa thuận') || n.includes('ngọc chúc') || n.includes('thạnh hưng') || n.includes('hòa hưng') || n.includes('hòa an')) return [9.85, 105.31];
    if (n.includes('u minh') || n.includes('thạnh lộc')) return [9.59, 105.07];
    if (n.includes('an minh') || n.includes('đông hưng') || n.includes('vân khánh') || n.includes('đông thái') || n.includes('đông hòa')) return [9.62, 104.9];
    if (n.includes('an biên') || n.includes('tây yên')) return [9.81, 104.99];
    if (n.includes('vĩnh phong') || n.includes('vĩnh thuận') || n.includes('bình giang')) return [9.54, 105.23];
    // Kiên giang châu thành
    if (n.includes('châu thành') && (n.includes('kiên') || n.includes('giang'))) return [9.95, 105.15];

    // AN GIANG
    if (n.includes('long xuyên') || n.includes('mỹ thới') || n.includes('mỹ hòa hưng') || n.includes('bình đức') || n.includes('mỹ phước')) return [10.38, 105.43];
    if (n.includes('châu đốc') || n.includes('vĩnh tế') || n.includes('châu phong') || n.includes('vĩnh thông')) return [10.7, 105.11];
    if (n.includes('tân châu') || n.includes('long phú') || n.includes('vĩnh xương')) return [10.79, 105.23];
    if (n.includes('tịnh biên') || n.includes('núi cấm') || n.includes('chi lăng') || n.includes('an cư') || n.includes('thới sơn') || n.includes('văn giáo')) return [10.6, 104.95];
    if (n.includes('tri tôn') || n.includes('ba chúc') || n.includes('cô tô') || n.includes('ô lâm')) return [10.45, 104.98];
    if (n.includes('thoại sơn') || n.includes('óc eo') || n.includes('định mỹ') || n.includes('vĩnh trạch') || n.includes('phú hòa')) return [10.3, 105.25];
    if (n.includes('châu phú') || n.includes('khánh hòa') || n.includes('vĩnh thạnh trung') || n.includes('bình mỹ')) return [10.55, 105.2];
    if (n.includes('chợ mới') || n.includes('long kiến') || n.includes('long điền') || n.includes('cù lao giêng') || n.includes('nhơn mỹ') || n.includes('hội an') || n.includes('hòa bình')) return [10.45, 105.52];
    if (n.includes('phú tân') || n.includes('chợ vàm') || n.includes('bình thạnh đông') || n.includes('hòa lạc') || n.includes('phú an') || n.includes('hiệp xương')) return [10.68, 105.35];
    if (n.includes('an phú') || n.includes('khánh bình') || n.includes('nhơn hội') || n.includes('đa phước') || n.includes('phú hữu')) return [10.85, 105.08];
    if (n.includes('cần đăng') || n.includes('bình hòa') || n.includes('vĩnh hanh') || n.includes('châu thành')) return [10.43, 105.35];
    
    // Default fallback to central an giang
    return [10.5, 105.1];
}

const results = {};
names.forEach((name, idx) => {
    const baseCoord = classifyDistrict(name);
    // Add small jitter to avoid perfect overlap (max ~3km scatter)
    let hash = 0;
    for (let x = 0; x < name.length; x++) hash = Math.imul(31, hash) + name.charCodeAt(x) | 0;
    hash = Math.abs(hash);
    
    // Jitter range: -0.02 to +0.02
    const latJitter = ((hash % 100) / 100) * 0.04 - 0.02;
    const lngJitter = (((hash * 7) % 100) / 100) * 0.04 - 0.02;
    
    results[name] = [baseCoord[0] + latJitter, baseCoord[1] + lngJitter];
});

fs.writeFileSync('db.js', 'window.PREBAKED_COORDS = ' + JSON.stringify(results, null, 2) + ';');
console.log("Generated perfect layout distribution!");
