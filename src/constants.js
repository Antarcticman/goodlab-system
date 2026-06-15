/**
 * GOODLAB — 全站共用常數
 * Phase 4：從根目錄搬入 src/，新增 Routine 分類常數。
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

// 值日生固定清潔任務清單
export const DUTY_CLEANING_TASKS = [
    { id: 'sweep', name: '掃地', detail: '實驗區及辦公區' },
    { id: 'trash', name: '一般垃圾', detail: '實驗區五個，辦公區一個，垃圾袋不夠找碩一去拿' },
    { id: 'recycle', name: '資源回收', detail: '黃光室門口及辦公區，資源回收需裝好，不需用學校垃圾袋' },
    { id: 'water', name: '冰水槽水位', detail: '機房，不夠拿空桶子裝水' },
    { id: 'fingerprint', name: '門禁指紋機', detail: '實驗區及辦公區，只能拿清水擦拭' }
];

// 值日生耗材清點清單（勾選 = 數量足夠或已叫貨）
export const DUTY_SUPPLY_ITEMS = [
    { id: 'acetone', name: 'acetone', threshold: '<4', location: '機房' },
    { id: 'methanol', name: 'methanol', threshold: '<4', location: '機房' },
    { id: 'gloves_s', name: '乳膠手套S', threshold: '<10', location: '黃光室' }
    // TODO: Phase 5 實作時補完剩餘 9 項
];
