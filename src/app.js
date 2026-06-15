/**
 * GOODLAB — 主應用程式協調器 (Phase 4)
 * 
 * 將所有功能模組混入 (mixin) 到單一 app 物件中，
 * 維持原有的 this.xxx 呼叫慣例，同時享有模組化帶來的可維護性。
 */

// === 基礎設施 ===
import { db, collection, onSnapshot, doc, deleteDoc } from './firebase.js';
import { showNotification, closeModal, populateLocationSelects, fillMemberSelect, fillPayerSelect, copyEmail } from './ui.js';
import { generateId, formatDateForInput, getMemberName, calculateGrade } from './utils.js';
import { LOCATIONS, LOCATIONS_WITH_OTHER } from './constants.js';

// === 功能模組 ===
import { authModule } from './auth.js';
import { membersModule } from './members.js';
import { instrumentsModule } from './instruments.js';
import { logsModule } from './logs.js';
import { accountingModule } from './accounting.js';
import { inventoryModule } from './inventory.js';

// === 主 App 物件 ===
const app = {
    // --- 共用狀態 ---
    data: { members: [], instruments: [], logs: [], accounting: [], inventory: [] },
    invSortState: { key: 'Property_ID', direction: 'asc' },
    tempLinkedPropId: null,
    currentEditingInstTags: [],
    currentInstIsActive: true,
    tempImportPayloads: [],
    sortState: { key: 'Location', direction: 'asc' },
    logSortState: { key: 'Date_Reported', direction: 'desc' },
    logFilterStatus: 'Open',
    accFilterStatus: 'All',
    invFilterStatus: 'All',
    currentUser: null,
    currentRole: 'Guest',
    membersLoaded: false,

    // --- 訪客遮罩 ---
    guestGuardHtml: `<tr><td colspan="10" style="text-align:center; padding: 50px 20px; background: #f8fafc;">
        <i class="ph-fill ph-lock-key" style="font-size: 3.5rem; color: #cbd5e1; margin-bottom: 15px; display: block;"></i>
        <div style="font-weight: 700; font-size: 1.2rem; color: var(--text-main);">權限不足，資料已鎖定</div>
        <div style="font-size: 0.95rem; color: var(--text-muted); margin-top: 6px;">請點擊右上角「Google 登入」並完成學號綁定，以解鎖實驗室機密資料。</div>
    </td></tr>`,

    // --- 頁面說明文案 ---
    helpDocs: {
        'members': `
            <h3 style="color: var(--primary); border-bottom: 2px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px;">人員管理與權限控制</h3>
            <p style="margin-bottom: 10px;">本模組負責管理實驗室成員資料、帳號綁定與系統操作權限。</p>
            <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                <li><strong>帳號綁定流程：</strong>新生需先由 Admin 於此處建立「學號」。新生使用 Google 帳號登入系統後，輸入該學號即可完成系統綁定。</li>
                <li><strong>資料不可變性：</strong>學號 (Student_ID) 為系統底層之唯一識別碼，建立存檔後即無法變更。</li>
                <li><strong>權限層級說明：</strong>
                    <ul>
                        <li><span style="color: var(--primary); font-weight: 600;">Admin：</span>具備全站最高權限，可進行資料增刪查改、產編匯入與公積金管理。</li>
                        <li><span style="color: var(--text-main); font-weight: 600;">User：</span>具備一般檢視權限，僅能回報維修紀錄及瀏覽公開資訊。</li>
                    </ul>
                </li>
            </ul>`,
        'instruments': `
            <h3 style="color: var(--primary); border-bottom: 2px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px;">儀器設備與資產管理</h3>
            <p style="margin-bottom: 10px;">本模組為實驗室硬體資產之核心資料庫，負責追蹤機台狀態與歷史履歷。</p>
            <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                <li><strong>跨系統關聯 (產編綁定)：</strong>編輯儀器時，右側可檢視並管理關聯之「學校財產編號」。一項儀器可包含多個產編（多對一架構）。</li>
                <li><strong>資料獨立性：</strong>解除產編綁定或刪除儀器時，產編原本的「物理位置 (實驗區域)」將被保留，不會被強制清空。</li>
                <li><strong>維修履歷整合：</strong>於列表中直接點擊任意儀器列，下方將即時展開該機台之歷史維修清單。</li>
            </ul>`,
        'logs': `
            <h3 style="color: var(--primary); border-bottom: 2px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px;">維修紀錄與除錯知識庫</h3>
            <p style="margin-bottom: 10px;">追蹤設備異常與維護進度，並作為未來交接之技術參考指南。</p>
            <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                <li><strong>報修標準作業：</strong>新增紀錄時，請先選擇「實驗區域」，系統將自動過濾出該區域之設備供您選擇。</li>
                <li><strong>狀態與緊急度：</strong>緊急度以 1 (最低) 至 5 (最高) 標示；Admin 可直接點擊列表左側之圖示，快速將案件切換為「已結案 (Closed)」。</li>
                <li><strong>知識庫建立：</strong>結案時請詳實填寫「解決方案」，以便未來發生相同異常時可快速檢索處置方式。</li>
            </ul>`,
        'accounting': `
            <h3 style="color: var(--primary); border-bottom: 2px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px;">公積金報帳系統</h3>
            <p style="margin-bottom: 10px;">監控銀行帳戶餘額、實驗室現金水位與代墊款項核銷進度。</p>
            <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                <li><strong>帳務燈號警示：</strong>
                    <ul>
                        <li><span style="color: var(--danger); font-weight: 600;">紅燈 (待還款)：</span>成員代墊款項，實驗室尚未以現金或匯款償還。</li>
                        <li><span style="color: var(--warning); font-weight: 600;">黃燈 (待回沖)：</span>已送出報帳程序，等待學校經費撥入銀行帳戶。</li>
                    </ul>
                </li>
                <li><strong>自動化防呆：</strong>輸入金額時一律填寫「正數」。系統將依據交易類型 (如：報帳、提款) 自動判斷並計算正負值。</li>
            </ul>`,
        'inventory': `
            <h3 style="color: var(--primary); border-bottom: 2px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px;">財產編號清點系統</h3>
            <p style="margin-bottom: 10px;">學校年度財產盤點與實驗室資產定位的自動化處理中心。</p>
            <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                <li><strong>匯入 Excel 規範與必要欄位：</strong>
                    <br>請直接上傳學校提供之 Excel 原檔。系統會自動略過前 6 行表頭。</li>
                <li><strong>盤點流程：</strong>Admin 開放盤點後，User 可點擊列表左側的燈號來切換「已盤/未盤」。</li>
                <li><strong>匯出功能：</strong>盤點完成後可匯出完整的 Excel 清冊。</li>
            </ul>`
    },

    // --- 工具函式（混入到 app 上，讓各模組可以透過 this. 呼叫）---
    generateId,
    formatDateForInput,
    calculateGrade,
    showNotification,
    closeModal,
    populateLocationSelects,
    fillMemberSelect: function(selectId) {
        fillMemberSelect(selectId, this.data.members);
    },
    fillPayerSelect: function(selectId) {
        fillPayerSelect(selectId, this.data.members);
    },
    getMemberName: function(id) {
        return getMemberName(this.data.members, id);
    },
    copyEmail,

    // --- 共用刪除邏輯 ---
    deleteRecord: async function(collectionName, id, modalId) {
        if (!confirm("⚠️ 確定要永久刪除這筆資料嗎？刪除後無法復原！")) return;
        
        const btn = document.getElementById(`btn-del-${modalId.charAt(0)}`);
        if (btn) { btn.innerText = "刪除中..."; btn.disabled = true; }

        try {
            await deleteDoc(doc(db, collectionName, id));
            this.closeModal(modalId);
            this.showNotification("刪除成功", 'success');
        } catch (e) {
            this.showNotification("❌ 刪除失敗: " + e.message, 'error');
        } finally {
            if (btn) { btn.innerText = "刪除"; btn.disabled = false; }
        }
    },

    // --- 頁面切換 ---
    switchTab: function(tabId) {
        if (this.currentRole === 'Guest' && tabId !== 'members') return;
        if (this.currentRole === 'User' && (tabId === 'logs' || tabId === 'accounting')) return;

        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
        const targetPage = document.getElementById('page-' + tabId);
        if (targetPage) targetPage.classList.add('active');

        document.querySelectorAll('.nav-item').forEach(btn => {
            const isMatch = btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId);
            btn.classList.toggle('active', isMatch);
        });

        document.querySelectorAll('.mobile-nav-item').forEach(btn => {
            const isMatch = btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId);
            btn.classList.toggle('active', isMatch);
        });

        const titleMap = {
            'members': '人員管理',
            'instruments': '儀器設備',
            'logs': '維修紀錄',
            'accounting': '公積金報帳',
            'inventory': '產編清點'
        };
        const titleEl = document.getElementById('current-page-title');
        if (titleEl) titleEl.innerText = titleMap[tabId] || '實驗室管理';

        if (tabId === 'inventory') this.renderInventory();
        if (tabId === 'instruments') this.renderInstruments();
        if (tabId === 'logs') this.renderLogs();
        if (tabId === 'accounting') this.renderAccounting();
        if (tabId === 'members') this.renderMembers();
    },

    // --- Firebase 即時連線 ---
    setupRealtimeListeners: function() {
        ['member-tbody', 'inst-tbody', 'log-tbody', 'acc-tbody'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const cols = id === 'inst-tbody' ? 6 : id === 'log-tbody' ? 8 : id === 'acc-tbody' ? 8 : (id === 'member-tbody' ? 6 : 1);
                el.innerHTML = `<tr><td colspan="${cols}" class="loading" style="text-align:center; padding:20px;">與 Firebase 連線中...</td></tr>`;
            }
        });

        onSnapshot(collection(db, "accounting"), (snapshot) => {
            this.data.accounting = snapshot.docs.map(doc => doc.data());
            this.renderAccounting();
            this.calcDashboard();
        });

        onSnapshot(collection(db, "members"), (snapshot) => {
            this.data.members = snapshot.docs.map(doc => doc.data());
            this.membersLoaded = true;
            this.renderMembers();
            this.checkUserRole();
        });

        onSnapshot(collection(db, "instruments"), (snapshot) => {
            this.data.instruments = snapshot.docs.map(doc => doc.data());
            this.renderInstruments();
        });

        onSnapshot(collection(db, "logs"), (snapshot) => {
            this.data.logs = snapshot.docs.map(doc => doc.data());
            this.renderLogs();
        });

        onSnapshot(collection(db, "inventory"), (snapshot) => {
            this.data.inventory = snapshot.docs.map(doc => doc.data());
            this.renderInventory();
        });
    },

    // --- Modal 事件 ---
    setupModalEvents: function() {
        // Phase 2: 移除了背景點擊關閉功能
    },

    // --- 初始化 ---
    init: function() {
        this.populateLocationSelects();
        this.setupRealtimeListeners();
        this.setupModalEvents();
        this.setupAutoStatus();
        this.setupLogAutoStatus();
        this.updateFilterUI();
        this.updateAccFilterUI();
        this.setupAuthListener();
    }
};

// === 混入所有功能模組 ===
Object.assign(app, authModule);
Object.assign(app, membersModule);
Object.assign(app, instrumentsModule);
Object.assign(app, logsModule);
Object.assign(app, accountingModule);
Object.assign(app, inventoryModule);

// === 全域 UX 監聽器 ===
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(m => app.closeModal(m.id));
    }
});

window.app = app;

document.addEventListener("DOMContentLoaded", () => app.init());
