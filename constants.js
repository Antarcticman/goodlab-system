/**
 * GOODLAB - 全站共用常數 (constants.js)
 * Phase 2：集中管理所有硬編碼清單，取代散落在 7 個地方的重複定義。
 *
 * 使用方式（在其他模組引入）：
 *   import { LOCATIONS, LOCATIONS_WITH_OTHER } from "./constants.js";
 */

// 實驗室標準區域清單（不含「其他」，用於儀器/人員的主要位置）
export const LOCATIONS = [
    "多腔體區",
    "機房",
    "製程區",
    "黃光室",
    "量測區",
    "辦公區",
    "頂樓"
];

// 含「其他」的完整清單（用於產編清點的位置選擇）
export const LOCATIONS_WITH_OTHER = [...LOCATIONS, "其他"];
