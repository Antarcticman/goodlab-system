/**
 * GOODLAB — 全站共用常數
 * Phase 5：新增值日生完整耗材清單 + 廠商資訊、Routine 分類。
 */

// 實驗室標準區域清單（不含「其他」）
export const LOCATIONS = [
    "多腔體區",
    "機房",
    "製程區",
    "黃光室",
    "量測區",
    "辦公區",
    "頂樓"
];

// 含「其他」的完整清單
export const LOCATIONS_WITH_OTHER = [...LOCATIONS, "其他"];

// Routine 任務分類
export const ROUTINE_CATEGORIES = [
    "機台維護",
    "行政",
    "實驗室環境",
    "license購買"
];

// === 值日生 ===

// 固定清潔任務清單
export const DUTY_CLEANING_TASKS = [
    { id: 'sweep', name: '掃地', detail: '實驗區及辦公區' },
    { id: 'trash', name: '一般垃圾', detail: '實驗區五個，辦公區一個，垃圾袋不夠找碩一去拿' },
    { id: 'recycle', name: '資源回收', detail: '黃光室門口及辦公區，資源回收需裝好，不需用學校垃圾袋' },
    { id: 'water', name: '冰水槽水位', detail: '機房，不夠拿空桶子裝水' },
    { id: 'fingerprint', name: '門禁指紋機', detail: '實驗區及辦公區，只能拿清水擦拭' }
];

// 耗材清點清單（勾選 = 數量足夠或已叫貨）— 完整 12 項
export const DUTY_SUPPLY_ITEMS = [
    { id: 'acetone',    name: 'Acetone',    threshold: '<4',  unit: '瓶', location: '機房' },
    { id: 'methanol',   name: 'Methanol',   threshold: '<4',  unit: '瓶', location: '機房' },
    { id: 'detergent',  name: 'Detergent',  threshold: '<2',  unit: '瓶', location: '機房' },
    { id: 'n2_tank',    name: '氮氣鋼瓶',   threshold: '<2',  unit: '瓶 (空瓶不算)', location: '機房' },
    { id: 'wiper',      name: '無塵紙',     threshold: '<10', unit: '包', location: '黃光室、多腔體區' },
    { id: 'glass_slide',name: '載玻片',     threshold: '<10', unit: '盒', location: '黃光室' },
    { id: 'gloves_s',   name: '乳膠手套 S', threshold: '<10', unit: '盒', location: '黃光室' },
    { id: 'gloves_m',   name: '乳膠手套 M', threshold: '<10', unit: '盒', location: '黃光室' },
    { id: 'gloves_l',   name: '乳膠手套 L', threshold: '<10', unit: '盒', location: '黃光室' },
    { id: 'cotton_swab',name: '棉花棒',     threshold: '<20', unit: '包', location: '黃光室' },
    { id: 'aluminum_foil',name: '鋁箔',     threshold: '<20', unit: '卷', location: '黃光室' },
    { id: 'pe_gloves',  name: 'PE手套',     threshold: '<20', unit: '盒', location: '黃光室' }
];

// 耗材廠商聯絡資訊（點擊 (i) icon 時顯示）
export const SUPPLY_VENDORS = {
    'acetone':    { vendor: '榮欣化工', phone: '02-2599-1234', note: '訂購 acetone 4L/瓶' },
    'methanol':   { vendor: '榮欣化工', phone: '02-2599-1234', note: '訂購 methanol 4L/瓶' },
    'detergent':  { vendor: '榮欣化工', phone: '02-2599-1234', note: '訂購 detergent' },
    'n2_tank':    { vendor: '三福氣體', phone: '0800-211-311', note: '叫氮氣鋼瓶，報實驗室地址' },
    'wiper':      { vendor: '昱麟', phone: '02-8692-6360', note: '' },
    'glass_slide':{ vendor: '昱麟', phone: '02-8692-6360', note: '' },
    'gloves_s':   { vendor: '昱麟', phone: '02-8692-6360', note: 'Size S' },
    'gloves_m':   { vendor: '昱麟', phone: '02-8692-6360', note: 'Size M' },
    'gloves_l':   { vendor: '昱麟', phone: '02-8692-6360', note: 'Size L' },
    'cotton_swab':{ vendor: '昱麟', phone: '02-8692-6360', note: '' },
    'aluminum_foil':{ vendor: '昱麟', phone: '02-8692-6360', note: '' },
    'pe_gloves':  { vendor: '昱麟', phone: '02-8692-6360', note: '' }
};
