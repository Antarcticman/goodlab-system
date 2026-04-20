// === script.js 最上方 ===
// 1. 引入 Firebase 模組
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { UI } from "./shared.js";
// 2. 填入你的專屬金鑰
const firebaseConfig = {
  apiKey: "AIzaSyBdgqZaW2jdJHTbKplPur2R6JxDyjb02PU",
  authDomain: "goodlab-system.firebaseapp.com",
  projectId: "goodlab-system",
  storageBucket: "goodlab-system.firebasestorage.app",
  messagingSenderId: "21810534435",
  appId: "1:21810534435:web:b1feeb465d4371c7f57996"
};

// 3. 初始化資料庫
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// 初始化登入模組
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

// 4. 原本的 app 結構
const app = {
    data: { members: [], instruments: [], logs: [], accounting: [], inventory: [] },
    invSortState: { key: 'Property_ID', direction: 'asc' },
    tempLinkedPropId: null,
    currentEditingInstTags: [],
    // ★ 新增：用來暫存預覽的匯入資料
    tempImportPayloads: [],
    // === 統一資料庫 ID 生成邏輯 (YYYYMMDDHHMMSS_隨機數) ===
    generateId: function(prefix) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const rand = Math.floor(Math.random() * 900) + 100; // 加入 100~999 隨機數
        return `${prefix}_${yyyy}${mm}${dd}${hh}${min}${ss}_${rand}`;
    },

    closeModal: function(modalId) {
        UI.closeModal(modalId);
    },
    sortState: { key: 'Location', direction: 'asc' }, // 儀器用的
    logSortState: { key: 'Date_Reported', direction: 'desc' }, // ★ 新增：維修紀錄用的
    logFilterStatus: 'Open',
    accFilterStatus: 'All',
    invFilterStatus: 'All',

    init: function() {
        this.setupRealtimeListeners(); // ★ 改成呼叫這個新的監聽器
        this.setupModalEvents();
        this.setupAutoStatus(); 
        this.setupLogAutoStatus();
        this.updateFilterUI();
        this.updateAccFilterUI();
        this.setupAuthListener();
    },
    // === 登入狀態變數 ===
    currentUser: null,
    currentRole: 'Guest', // 'Guest', 'User', 'Admin'
    membersLoaded: false, // ★ 新增：確保資料庫載入完成的標記

    // === 登入/登出函式 ===
    login: async function() {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            this.showNotification("登入失敗: " + e.message, 'error');
        }
    },

    logout: async function() {
        try {
            await signOut(auth);
        } catch (error) {
            this.showNotification("登出失敗", 'error');
        }
    },

    // ================= 頁面說明文案庫 (SOP) =================
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
                    <br>請直接上傳學校提供之 Excel 原檔。系統會自動略過前 6 行表頭，請務必確認第 7 行包含以下精確標題字眼：
                    <ul style="list-style-type: circle; margin-top: 4px; margin-bottom: 8px; color: var(--text-muted);">
                        <li><strong>財物編號、校號、附件：</strong>此三欄系統會自動結合成「唯一識別碼」(如 31011-00-00)。</li>
                        <li><strong>財物名稱、廠牌、型式(或形式)、單價、取得日期、年限：</strong>這些硬體規格將被系統抓取建檔。</li>
                    </ul>
                </li>
                <li><strong>實體位置維護與保留：</strong>
                    <br>產編具備獨立的「實驗區域」與「細項位置（備註）」。每次匯入新年度 Excel 時，<span style="color: var(--success); font-weight: bold;">系統會自動保留您過往建置的區域與備註資料</span>，絕不會被學校的原檔覆蓋，請安心匯入。
                </li>
                <li><strong>儀器綁定操作：</strong>
                    <ul>
                        <li><span style="color: var(--primary); font-weight: 600;">藍色按鈕：</span>尚未綁定。點擊可將產編歸屬至現有儀器或建立為新機台。</li>
                        <li><span style="color: var(--danger); font-weight: 600;">紅色按鈕：</span>已綁定。點擊可解除關聯，解除後不會影響該產編的實體位置紀錄。</li>
                    </ul>
                </li>
            </ul>`
    },

    openHelpModal: function() {
        // 抓取目前 active 的 page id，例如 'page-members' -> 'members'
        const activePage = document.querySelector('.page-section.active');
        if (!activePage) return;
        
        const tabName = activePage.id.replace('page-', '');
        const content = this.helpDocs[tabName] || "<p>目前頁面暫無說明。</p>";
        
        document.getElementById('help-modal-body').innerHTML = content;
        
        // 這裡因為沒有填寫表單的需求，直接把 hidden 拿掉即可
        document.getElementById('help-modal').classList.remove('hidden');
    },

    // === 監聽登入狀態 ===
    setupAuthListener: function() {
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            this.checkUserRole(); // 狀態改變時，交給中控室檢查
        });
    },

    // === 權限中控室 (解決非同步時間差) ===
    checkUserRole: function() {
        const btnLogin = document.getElementById('btn-login');
        const btnLogout = document.getElementById('btn-logout');
        const userInfo = document.getElementById('user-info');

        // 1. 如果沒有登入
        if (!this.currentUser) {
            this.currentRole = 'Guest';
            btnLogin.classList.remove('hidden');
            btnLogout.classList.add('hidden');
            userInfo.innerText = "尚未登入";
            this.updateUIByRole();
            return;
        }

        // 2. 如果登入了，但資料庫名單還沒下載完，先卡住等待
        if (!this.membersLoaded) {
            userInfo.innerText = "讀取權限中...";
            return; // 等等 onSnapshot 下載完會自動再呼叫一次這裡
        }

        // 3. 雙方都準備好了，開始比對
        btnLogin.classList.add('hidden');
        btnLogout.classList.remove('hidden');

        const memberData = this.data.members.find(m => m.Google_UID === this.currentUser.uid);

        if (memberData) {
            // 找到綁定資料：顯示權限並解鎖
            this.currentRole = memberData.Role === 'Admin' ? 'Admin' : 'User';
            userInfo.innerText = `👤 ${memberData.Name_Ch} (${this.currentRole})`;
            this.closeModal('bind-modal'); // 萬一視窗開著就關掉
        } else {
            // 找不到綁定資料：視為訪客並跳出專屬 Modal
            this.currentRole = 'Guest';
            userInfo.innerText = `👤 ${this.currentUser.displayName} (未綁定)`;
            document.getElementById('bind-modal').classList.remove('hidden');
        }

        this.updateUIByRole();
    },

    // === 新增：自訂綁定視窗邏輯 ===
    cancelBinding: function() {
        this.closeModal('bind-modal');
        this.showNotification("已取消綁定，你目前將以「訪客」身分瀏覽。", "info");
    },

    submitBinding: async function() {
        const input = document.getElementById('Bind_Input_ID').value.trim().toLowerCase();
        if (!input) {
            this.showNotification("⚠️ 請輸入學號", "error");
            return;
        }

        const member = this.data.members.find(m => m.Student_ID.toLowerCase() === input);
        
        if (!member) {
            this.showNotification("❌ 找不到此學號！請確認是否輸入正確。", "error");
            await this.logout();
            this.closeModal('bind-modal');
            return;
        }

        if (member.Google_UID) {
            this.showNotification("❌ 這個學號已經被其他 Google 帳號綁定了！", "error");
            await this.logout();
            this.closeModal('bind-modal');
            return;
        }

        // 開始寫入綁定資料
        const btn = document.getElementById('btn-submit-bind');
        btn.innerText = "綁定中...";
        btn.disabled = true;

        try {
            await updateDoc(doc(db, "members", member.Student_ID), {
                Google_UID: this.currentUser.uid
            });
            
            this.showNotification("🎉 綁定成功！畫面即將重整...", 'success');
            setTimeout(() => window.location.reload(), 1500); 
        } catch (e) {
            this.showNotification("❌ 綁定失敗: " + e.message, 'error');
            btn.innerText = "確認綁定";
            btn.disabled = false;
        }
    },

    // === 根據權限隱藏/顯示按鈕 ===
    updateUIByRole: function() {
        const isAdmin = this.currentRole === 'Admin';
        
        // 1. 上方的「新增」按鈕直接變灰 Disabled
        document.querySelectorAll('.admin-only').forEach(el => {
            el.disabled = !isAdmin; 
        });

        // 2. 導覽列的限制按鈕變灰 Disabled
        const accNavBtn = document.getElementById('nav-accounting');
        const invNavBtn = document.getElementById('nav-inventory');
        if (accNavBtn) accNavBtn.disabled = !isAdmin;
        if (invNavBtn) invNavBtn.disabled = !isAdmin;

        // 防呆：如果權限不足卻在 Admin 專屬頁面，自動切換回人員頁面
        const currentPage = document.querySelector('.page-section.active');
        if (currentPage && (currentPage.id === 'page-accounting' || currentPage.id === 'page-inventory') && !isAdmin) {
            this.switchTab('members'); 
        }

        // 4. 重新渲染所有表格 (帶入按鈕禁用邏輯)
        this.renderMembers();
        this.renderInstruments();
        this.renderLogs();
        this.renderAccounting();
    },

    // ================= 共用刪除邏輯 =================
    deleteRecord: async function(collectionName, id, modalId) {
        if(!confirm("⚠️ 確定要永久刪除這筆資料嗎？刪除後無法復原！")) return;
        
        const btn = document.getElementById(`btn-del-${modalId.charAt(0)}`);
        if (btn) { btn.innerText = "刪除中..."; btn.disabled = true; }

        try {
            // 執行資料刪除
            // (註：因綁定陣列存在於儀器文件中，刪除儀器即自動解除與產編之關聯，
            // 且不會更動產編原本的「實驗區域」與「細項位置」紀錄)
            await deleteDoc(doc(db, collectionName, id));
            
            this.closeModal(modalId);
            this.showNotification("刪除成功", 'success');
        } catch (e) {
            this.showNotification("❌ 刪除失敗: " + e.message, 'error');
        } finally {
            if (btn) { btn.innerText = "刪除"; btn.disabled = false; }
        }
    },

    fillMemberSelect: function(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const options = this.data.members.filter(m => m.Status === 'Active').map(m => `<option value="${m.Student_ID}">${m.Name_Ch}</option>`).join('');
        select.innerHTML = '<option value="">(請選擇)</option>' + options;
    },

    fillPayerSelect: function(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const members = this.data.members.filter(m => m.Status === 'Active').map(m => `<option value="${m.Student_ID}">${m.Name_Ch}</option>`).join('');
        // 公積金排第一個
        select.innerHTML = `<option value="Fund">🏦 公積金戶頭 (Fund)</option>` + members;
    },

    // ================= Firebase 即時連線 =================
    setupRealtimeListeners: function() {
        // 設定 Loading 畫面
        ['member-tbody', 'inst-tbody', 'log-tbody', 'acc-tbody'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                const cols = id === 'inst-tbody' ? 6 : id === 'log-tbody' ? 8 : id === 'acc-tbody' ? 8 : (id === 'member-tbody' ? 6 : 1);
                el.innerHTML = `<tr><td colspan="${cols}" class="loading" style="text-align:center; padding:20px;">與 Firebase 連線中...</td></tr>`;
            }
        });

        // 1. 即時監聽公積金 (Accounting)
        onSnapshot(collection(db, "accounting"), (snapshot) => {
            this.data.accounting = snapshot.docs.map(doc => doc.data());
            this.renderAccounting();
            this.calcDashboard();
        });

        // 2. 即時監聽人員 (Members)
        onSnapshot(collection(db, "members"), (snapshot) => {
            this.data.members = snapshot.docs.map(doc => doc.data());
            this.membersLoaded = true; // ★ 標記載入完成
            this.renderMembers();
            this.checkUserRole(); // ★ 資料來了，重新檢查一次權限
        });

        // 3. 即時監聽儀器 (Instruments)
        onSnapshot(collection(db, "instruments"), (snapshot) => {
            this.data.instruments = snapshot.docs.map(doc => doc.data());
            this.renderInstruments();
        });

        // 4. 即時監聽維修紀錄 (Logs)
        onSnapshot(collection(db, "logs"), (snapshot) => {
            this.data.logs = snapshot.docs.map(doc => doc.data());
            this.renderLogs();
        });

        // 5. 即時監聽產編清點 (Inventory)
        onSnapshot(collection(db, "inventory"), (snapshot) => {
            this.data.inventory = snapshot.docs.map(doc => doc.data());
            this.renderInventory();
        });
    },

    // === 頁面與側邊欄切換邏輯 (SaaS 新版) ===
    switchTab: function(tabId) {
        // 1. 切換主內容區的顯示 (隱藏所有，顯示目標)
        document.querySelectorAll('.page-section').forEach(s => {
            s.classList.remove('active');
        });
        const targetPage = document.getElementById('page-' + tabId);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // 2. 更新電腦版「側邊欄」的發亮狀態
        document.querySelectorAll('.nav-item').forEach(btn => {
            // 利用 onclick 屬性來判斷按鈕歸屬，防呆不報錯
            const isMatch = btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId);
            btn.classList.toggle('active', isMatch);
        });

        // 3. 更新「手機版」底部導覽的發亮狀態
        document.querySelectorAll('.mobile-nav-item').forEach(btn => {
            const isMatch = btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId);
            btn.classList.toggle('active', isMatch);
        });

        // 4. 更新頂部標題
        const titleMap = {
            'members': '人員管理',
            'instruments': '儀器設備',
            'logs': '維修紀錄',
            'accounting': '公積金報帳',
            'inventory': '產編清點'
        };
        const titleEl = document.getElementById('current-page-title');
        if (titleEl) {
            titleEl.innerText = titleMap[tabId] || '實驗室管理';
        }

        // 5. 觸發對應頁面的資料渲染，確保畫面有東西
        if (tabId === 'inventory' && typeof this.renderInventory === 'function') this.renderInventory();
        if (tabId === 'instruments' && typeof this.renderInstruments === 'function') this.renderInstruments();
        if (tabId === 'logs' && typeof this.renderLogs === 'function') this.renderLogs();
        if (tabId === 'accounting' && typeof this.renderAccounting === 'function') this.renderAccounting();
        // 如果你有 renderMembers，這裡也會安全呼叫
        if (tabId === 'members' && typeof this.renderMembers === 'function') this.renderMembers();
    },

    // ================= 💰 公積金管理邏輯 (全新) =================

    setAccFilter: function(status) {
        this.accFilterStatus = status;
        this.updateAccFilterUI();
        this.renderAccounting();
    },

    updateAccFilterUI: function() {
        document.querySelectorAll('.filter-chip[data-acc-val]').forEach(btn => {
            if (btn.dataset.accVal === this.accFilterStatus) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    },

    // 計算儀表板數字
    calcDashboard: function() {
        let bankBalance = 0; // 戶頭
        let cashBalance = 0; // 現金
        let payable = 0;     // 待還代墊
        let receivable = 0;  // 等待回沖

        this.data.accounting.forEach(acc => {
            const amt = Math.abs(parseFloat(acc.Amount) || 0);
            const isFund = acc.Payer === 'Fund';
            const isRecharged = !!acc.Recharge_Date;
            const isPaidBack = !!acc.Payback_Date;
            const source = acc.Fund_Source || 'Bank'; // 這筆交易動用的是 Bank 還是 Cash

            // --- 狀態統計 ---
            if (!isFund && !isPaidBack) payable += amt;
            if (acc.Type === 'School' && !isRecharged) receivable += amt;

            // --- 餘額計算 ---
            if (acc.Type === 'Deposit') {
                bankBalance += amt; // 老師匯錢通常直接進戶頭
            } 
            else if (acc.Type === 'Withdrawal') {
                bankBalance -= amt; // 戶頭減少
                cashBalance += amt; // 現金增加
            } 
            else if (acc.Type === 'School' || acc.Type === 'Lab') {
                // 如果是公積金付錢 (或是已經還錢給代墊學生)
                if (isFund || (!isFund && isPaidBack)) {
                    if (source === 'Cash') cashBalance -= amt;
                    else bankBalance -= amt;
                }
                // 學校回沖的錢，一律進戶頭
                if (acc.Type === 'School' && isRecharged) {
                    bankBalance += amt;
                }
            }
        });

        // 更新 UI
        const totalBalance = bankBalance + cashBalance;
        document.getElementById('val-balance').innerText = "$" + totalBalance.toLocaleString();
        document.getElementById('val-bank').innerText = "$" + bankBalance.toLocaleString();
        document.getElementById('val-cash').innerText = "$" + cashBalance.toLocaleString();
        
        document.getElementById('val-payable').innerText = "$" + payable.toLocaleString();
        document.getElementById('val-receivable').innerText = "$" + receivable.toLocaleString();
    },

    // 顯示欠款明細 (Alert 簡易版)
    showDebtsDetail: function() {
        const debts = {};
        this.data.accounting.forEach(acc => {
            if (acc.Payer !== 'Fund' && !acc.Payback_Date) {
                const name = this.getMemberName(acc.Payer);
                debts[name] = (debts[name] || 0) + Math.abs(acc.Amount);
            }
        });
        
        if (Object.keys(debts).length === 0) {
            this.showNotification("目前沒有欠任何人錢！🎉", 'success');
            return;
        }

        let msg = "<strong>待還款明細：</strong><br>";
        for (let [name, amt] of Object.entries(debts)) {
            msg += `${name}: $${amt}<br>`;
        }
        // 第三個參數 5000 代表這則通知會停留 5 秒讓你看清楚
        this.showNotification(msg, 'info', 5000); 
    },

    renderAccounting: function() {
        const tbody = document.getElementById('acc-tbody');
        if(!tbody) return;
        const searchEl = document.getElementById('search-acc');
        const term = searchEl ? searchEl.value.toLowerCase() : ''; // ★ 安全防呆
        const filter = this.accFilterStatus;

        let filtered = this.data.accounting.filter(acc => {
            const payerName = this.getMemberName(acc.Payer);
            const text = (acc.Description + payerName + acc.Type).toLowerCase();
            if (!text.includes(term)) return false;
            const isDebt = (acc.Payer !== 'Fund' && !acc.Payback_Date);
            const isWait = (acc.Type === 'School' && !acc.Recharge_Date);
            if (filter === 'Debt') return isDebt;
            if (filter === 'Wait') return isWait;
            return true;
        });

        filtered.sort((a, b) => new Date(b.Date) - new Date(a.Date));
        if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty">查無紀錄</td></tr>'; return; }

        tbody.innerHTML = filtered.map(acc => {
            const payerName = this.getMemberName(acc.Payer);
            const amt = parseFloat(acc.Amount);
            const isFund = acc.Payer === 'Fund';
            let statusIcon = '<i class="ph-fill ph-circle" style="color: var(--success); font-size:1.2rem;"></i>'; 
            if (!isFund && !acc.Payback_Date) statusIcon = '<i class="ph-fill ph-circle" style="color: var(--danger); font-size:1.2rem;"></i>'; 
            else if (acc.Type === 'School' && !acc.Recharge_Date) statusIcon = '<i class="ph-fill ph-circle" style="color: var(--warning); font-size:1.2rem;"></i>';
            
            const dateRecharge = acc.Recharge_Date ? this.formatDateForInput(acc.Recharge_Date) : `<span class="date-empty">等待</span>`;
            const datePayback = isFund ? `<span class="date-empty">-</span>` : (acc.Payback_Date ? this.formatDateForInput(acc.Payback_Date) : `<span style="color:#dc3545">未還款</span>`);
            const showRecharge = (acc.Type === 'Lab' || acc.Type === 'Deposit') ? '<span class="date-empty">-</span>' : dateRecharge;

            // ★ 加上 hide-mobile 配合 HTML 的簡化，並加入 mobile-truncate
            return `
            <tr onclick="app.openAccModal('${acc.Txn_ID}')" style="cursor:pointer">
                <td style="text-align:center; font-size:1.2rem;">${statusIcon}</td>
                <td>${this.formatDateForInput(acc.Date).substring(5)}</td> <td>
                    <div class="mobile-truncate" title="${acc.Description}">${acc.Description}</div>
                    <br><small style="color:#888">${this.getAccTypeName(acc.Type)}</small>
                </td>
                <td style="text-align:right; font-weight:bold;" class="${amt >= 0 ? 'amount-pos' : 'amount-neg'}">${amt}</td>
                <td class="hide-mobile">${payerName}</td>
                <td class="hide-mobile">${showRecharge}</td>
                <td class="hide-mobile">${datePayback}</td>
                <td style="text-align:center;"><button class="btn btn-sm btn-secondary">✏️</button></td>
            </tr>`;
        }).join('');
    },

    // 輔助：取得中文類型
    getAccTypeName: function(type) {
        if(type === 'School') return '<i class="ph ph-buildings"></i> 報帳';
        if(type === 'Lab') return '<i class="ph ph-flask"></i> 內帳';
        if(type === 'Deposit') return '<i class="ph ph-download-simple"></i> 匯入';
        if(type === 'Withdrawal') return '<i class="ph ph-money"></i> 提款';
        return type;
    },

    // 輔助：取得成員名字 (或是 Fund)
    getMemberName: function(id) {
        if (!id) return '';
        if (id === 'Fund') return '🏦 公積金';
        // ★ 雙重比對：同時支援 Student_ID 或 Google_UID 尋找
        const m = this.data.members.find(x => x.Student_ID === id || x.Google_UID === id);
        return m ? m.Name_Ch : id;
    },

    openAccModal: function(id = null) {
        if (this.currentRole !== 'Admin') return;
        const modal = document.getElementById('acc-modal');
        const btnDel = document.getElementById('btn-del-a');
        const inputs = document.querySelectorAll('#acc-modal input, #acc-modal select, #acc-modal textarea');
        
        this.fillPayerSelect('Acc_Payer');
        inputs.forEach(el => el.value = '');

        if (id) {
            document.getElementById('a-modal-title').innerText = "編輯帳務";
            if (btnDel) btnDel.classList.remove('hidden');
            const acc = this.data.accounting.find(x => x.Txn_ID === id);
            
            document.getElementById('Txn_ID').value = acc.Txn_ID;
            document.getElementById('Acc_Type').value = acc.Type;
            document.getElementById('Acc_Date').value = this.formatDateForInput(acc.Date);
            document.getElementById('Acc_Description').value = acc.Description;
            document.getElementById('Acc_Amount').value = acc.Amount;
            document.getElementById('Acc_Payer').value = acc.Payer;
            document.getElementById('Recharge_Date').value = this.formatDateForInput(acc.Recharge_Date);
            document.getElementById('Payback_Date').value = this.formatDateForInput(acc.Payback_Date);
        } else {
            document.getElementById('a-modal-title').innerText = "新增帳務";
            if (btnDel) btnDel.classList.add('hidden');
            const now = new Date();
            document.getElementById('Txn_ID').value = this.generateId('ACC');
            document.getElementById('Acc_Date').value = this.formatDateForInput(new Date());
            document.getElementById('Acc_Type').value = 'School';
            document.getElementById('Acc_Payer').value = 'Fund';
        }
        
        this.handleAccTypeChange();
        this.handleAccPayerChange();
        if (modal) modal.classList.remove('hidden');
    },

    // 控制扣款來源按鈕的 UI 與取值
    setFundSource: function(source) {
        const fsInput = document.getElementById('Fund_Source');
        if (fsInput) fsInput.value = source;
        
        const btnBank = document.getElementById('btn-fs-bank');
        const btnCash = document.getElementById('btn-fs-cash');
        if (btnBank) {
            if(source === 'Bank') btnBank.classList.add('active'); else btnBank.classList.remove('active');
        }
        if (btnCash) {
            if(source === 'Cash') btnCash.classList.add('active-success'); else btnCash.classList.remove('active-success');
        }
    },

    // UI 連動：類型改變時
    handleAccTypeChange: function() {
        const type = document.getElementById('Acc_Type').value;
        const divRecharge = document.getElementById('grp-recharge');
        const payerSelect = document.getElementById('Acc_Payer');
        const descInput = document.getElementById('Acc_Description');
        
        // 只有 School 需要回沖日期
        divRecharge.style.visibility = (type === 'School') ? 'visible' : 'hidden';

        // ★ 自動化防呆：提款或匯入時，自動填寫名稱並鎖定
        if (type === 'Withdrawal') {
            descInput.value = "🏧 銀行提款";
            this.setFundSource('Bank');
        } else if (type === 'Deposit') {
            descInput.value = "💰 匯入公積金";
        } else {
            // 切換回報帳/內帳時，清空預設字
            if(descInput.value === "🏧 銀行提款" || descInput.value === "💰 匯入公積金") {
                descInput.value = "";
            }
        }

        // 如果是提款或匯入，強制 Payer 鎖定為 Fund
        if (type === 'Withdrawal' || type === 'Deposit') {
            payerSelect.value = 'Fund';
            payerSelect.disabled = true;
        } else {
            payerSelect.disabled = false;
        }
        this.handleAccPayerChange(); 
    },

    handleAccPayerChange: function() {
        const payer = document.getElementById('Acc_Payer').value;
        const type = document.getElementById('Acc_Type').value;
        const divPayback = document.getElementById('grp-payback');
        const divFundSource = document.getElementById('grp-fund-source');

        // ★ 改用 display 來動態切換，讓兩者完美共用同一格空間
        if (payer === 'Fund' || type === 'Deposit' || type === 'Withdrawal') {
            divPayback.style.display = 'none';
        } else {
            divPayback.style.display = 'flex';
        }

        if (type === 'Deposit' || type === 'Withdrawal') {
            divFundSource.style.display = 'none';
        } else if (payer === 'Fund') {
            divFundSource.style.display = 'flex';
        } else {
            divFundSource.style.display = 'none'; 
        }
    },

    saveAccounting: async function() {
        let rawAmount = parseFloat(document.getElementById('Acc_Amount').value);
        const type = document.getElementById('Acc_Type').value;

        if (isNaN(rawAmount)) rawAmount = 0;

        // 自動正負號邏輯
        if (type === 'School' || type === 'Lab') {
            rawAmount = -Math.abs(rawAmount); 
        } else {
            rawAmount = Math.abs(rawAmount);  
        }

        const fundSourceVal = document.getElementById('Fund_Source').value || 'Bank';

        const payload = {
            Txn_ID: document.getElementById('Txn_ID').value,
            Type: type,
            Date: document.getElementById('Acc_Date').value,
            Description: document.getElementById('Acc_Description').value,
            Amount: rawAmount,
            Payer: document.getElementById('Acc_Payer').value,
            Recharge_Date: document.getElementById('Recharge_Date').value,
            Payback_Date: document.getElementById('Payback_Date').value,
            Invoice_Link: document.getElementById('Invoice_Link').value,
            Remark: document.getElementById('Acc_Remark').value,
            // ★ 新增這行：記錄是從戶頭還是現金扣款 (預設 Bank)
            Fund_Source: fundSourceVal
        };

        if (!payload.Description || !payload.Amount) { this.showNotification("⚠️ 請填寫項目和金額", 'error'); return; }

        const btn = document.getElementById('btn-save-a');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            // ★ Firebase 寫入語法
            await setDoc(doc(db, "accounting", payload.Txn_ID), payload);
            
            this.closeModal('acc-modal');
            // 注意：這裡把 this.fetchData(); 刪掉了！
        } catch (e) {
            this.showNotification("❌ 發生錯誤: " + e.message, 'error');
        } finally {
            btn.innerText = "儲存";
            btn.disabled = false;
        }
    },
    
    // ================= 儀器管理邏輯 (修改處) =================

    sortInstruments: function(key) {
        if (this.sortState.key === key) {
            this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.key = key;
            this.sortState.direction = 'asc';
        }
        this.renderInstruments();
    },

    sortLogs: function(key) {
        if (this.logSortState.key === key) {
            this.logSortState.direction = this.logSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.logSortState.key = key;
            this.logSortState.direction = 'asc'; // 預設升冪
        }
        this.renderLogs();
    },

    // === 1. 儀器渲染 ===
    renderInstruments: function() {
        const term = document.getElementById('search-inst').value.toLowerCase();
        const locFilter = document.getElementById('filter-inst-location').value;
        const isAdmin = this.currentRole === 'Admin';

        let filtered = this.data.instruments.filter(inst => {
            const matchText = (String(inst.Name || '') + String(inst.Instrument_ID || '')).toLowerCase().includes(term);
            const matchLoc = (locFilter === "" || inst.Location === locFilter); // ★ 區域過濾判斷
            return matchText && matchLoc;
        });

        const sortKey = this.sortState.key;
        const dir = this.sortState.direction === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
            let valA = a[sortKey] || ''; let valB = b[sortKey] || '';
            if (sortKey === 'Is_Active') { valA = a.Is_Active ? 1 : 0; valB = b.Is_Active ? 1 : 0; }
            return valA > valB ? dir : (valA < valB ? -dir : 0);
        });

        UI.renderTable({
            containerId: 'inst-tbody',
            data: filtered,
            columns: [
                { 
                    width: '80px', align: 'center', 
                    render: row => {
                        const color = row.Is_Active ? 'var(--success)' : 'var(--danger)';
                        const title = row.Is_Active ? '正常運作' : '報廢停用';
                        return `<i class="ph-fill ph-circle" style="color:${color}; font-size:1.2rem;" title="${title}"></i>`;
                    } 
                },
                { 
                    render: row => {
                        let html = `<strong>${row.Name}</strong>`;
                        if (row.Linked_Property_IDs && row.Linked_Property_IDs.length > 0) {
                            html += `<div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">`;
                            row.Linked_Property_IDs.forEach(pid => {
                                html += `<span style="background: #e2e8f0; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; color: #475569;"><i class="ph ph-tag"></i> ${pid}</span>`;
                            });
                            html += `</div>`;
                        }
                        return html;
                    }
                },
                { width: '120px', render: row => row.Location },
                { width: '150px', className: 'hide-mobile', render: row => row.Vendor_Info || '-' },
                { width: '120px', className: 'hide-mobile', render: row => this.getMemberName(row.Manager_ID) },
                { width: '80px', align: 'center', render: row => `<button onclick="event.stopPropagation(); app.openInstModal('${row.Instrument_ID}')" class="btn btn-sm btn-secondary" ${isAdmin?'':'disabled'}><i class="ph ph-pencil-simple"></i></button>` }
            ],
            emptyMessage: "查無符合的儀器資料",
            onRowClick: (rowData, tr) => this.toggleInstLogs(rowData, tr)
        });
    },

    // === 2. 點擊展開儀器維修歷史 (In-Memory Cache 實作) ===
    toggleInstLogs: function(instData, tr) {
        // 如果已經展開了，就關閉它
        const nextTr = tr.nextElementSibling;
        if (nextTr && nextTr.classList.contains('sub-row')) {
            nextTr.remove(); 
            return;
        }

        // 關閉其他已展開的面板 (保持畫面乾淨)
        document.querySelectorAll('.sub-row').forEach(el => el.remove());

        // 從記憶體中過濾該儀器的所有 logs (零延遲、不消耗 Firebase 讀取數)
        const logs = this.data.logs.filter(log => log.Instrument_ID === instData.Instrument_ID);
        
        // 組合子面板 HTML
        let logsHtml = `<div style="padding: 15px; background: var(--bg-hover); border-radius: var(--radius-sm); border-left: 4px solid var(--primary); margin: 5px 0;">`;
        
        if (logs.length === 0) {
            logsHtml += `<div style="color: var(--text-muted); font-size: 0.9rem;"><i class="ph ph-info"></i> 此儀器目前無任何維修紀錄。</div>`;
        } else {
            logsHtml += `<strong style="display:block; margin-bottom:10px; font-size:0.95rem; color:var(--primary);"><i class="ph ph-clock-counter-clockwise"></i> 歷史維修紀錄 (${logs.length} 筆)</strong>`;
            
            // ★ 加入 table-layout: fixed，並為欄位分配精準比例
            logsHtml += `<table style="width:100%; font-size:0.9rem; margin:0; background: white; box-shadow: var(--shadow-sm); table-layout: fixed;">`;
            // ★ 修改表頭：給解決方案加上 hide-mobile
            logsHtml += `<tr style="background: #f1f5f9;">
                <th style="padding: 8px; width: 100px;">日期</th>
                <th style="padding: 8px; width: auto;">問題描述</th>
                <th style="padding: 8px; width: 30%;" class="hide-mobile">解決方案</th>
                <th style="padding: 8px; width: 80px; text-align: center;">狀態</th>
            </tr>`;
            
            logs.sort((a,b) => new Date(b.Date_Reported) - new Date(a.Date_Reported)).forEach(log => {
                const isClosed = log.Status === 'Closed';
                const color = isClosed ? 'var(--success)' : 'var(--danger)';
                const titleText = isClosed ? '已結案' : '待處理';
                const statusIcon = `<span style="color: ${color};" title="${titleText}"><i class="ph-fill ph-circle" style="font-size:1.2rem;"></i></span>`;
                
                const dateFormatted = log.Date_Reported ? log.Date_Reported.split('T')[0].split(' ')[0] : '-';

                // ★ 修改行資料：讓整行可點擊，加入 mobile-truncate 與 hide-mobile
                logsHtml += `<tr style="cursor: pointer;" onclick="app.openLogModal('${log.Log_ID}', true)" title="點擊檢視詳細紀錄">
                    <td style="padding: 8px; border-bottom: 1px solid var(--border-color);">${dateFormatted}</td>
                    <td style="padding: 8px; border-bottom: 1px solid var(--border-color);">
                        <div class="mobile-truncate" style="max-width: 150px;">${log.Problem_Desc}</div>
                    </td>
                    <td style="padding: 8px; border-bottom: 1px solid var(--border-color);" class="hide-mobile">${log.Solution || '-'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid var(--border-color); text-align: center;">${statusIcon}</td>
                </tr>`;
            });
            logsHtml += `</table>`;
        }
        logsHtml += `</div>`;

        // 插入子列到表格中
        const subTr = document.createElement('tr');
        subTr.className = 'sub-row';
        subTr.innerHTML = `<td colspan="6" style="padding: 0; border: none;">${logsHtml}</td>`;
        tr.after(subTr);
    },

    updateLocationFilter: function() {
        const select = document.getElementById('filter-location');
        if (select.options.length > 1) return;

        const locations = [...new Set(this.data.instruments.map(i => i.Location))].filter(Boolean);
        locations.sort().forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc;
            opt.innerText = loc;
            select.appendChild(opt);
        });
    },

    // === Modal 內的產編標籤系統 ===
    renderModalInstTags: function() {
        const container = document.getElementById('Modal_Linked_Tags');
        if (!container) return;

        if (this.currentEditingInstTags.length === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; padding: 20px; text-align: center; border: 1px dashed var(--border-color); border-radius: 8px;">目前無關聯的產編</div>';
            return;
        }

        container.innerHTML = this.currentEditingInstTags.map(pid => {
            const invItem = this.data.inventory.find(inv => inv.Property_ID === pid);
            const propName = invItem ? invItem.Name : '未知財產名稱';

            return `
            <div class="inv-tag">
                <span class="inv-tag-name">${propName}</span>
                <span class="inv-tag-id">${pid}</span>
                <i class="inv-tag-remove ph ph-x" onclick="app.removeModalInstTag('${pid}')"></i>
            </div>`;
        }).join('');
    },

    removeModalInstTag: function(pid) {
        const instId = document.getElementById('Instrument_ID').value;
        // 如果是「新增儀器」狀態 (尚未存入資料庫)，只需從記憶體中移除
        if (!instId || instId.startsWith('INST_')) {
            const existingInst = this.data.instruments.find(i => i.Instrument_ID === instId);
            if (!existingInst) {
                this.currentEditingInstTags = this.currentEditingInstTags.filter(id => id !== pid);
                this.renderModalInstTags();
                return;
            }
        }
        // 如果是編輯既有儀器，則呼叫強大的解綁引擎
        this.unlinkProperty(pid, instId);
    },

    // ★ 全新：雙向解綁引擎
    unlinkProperty: async function(propId, instId) {
        if (this.currentRole !== 'Admin') return;
        if (!confirm(`確定要解除產編 [${propId}] 的綁定嗎？\n解除後，該產編將回到「未分配」狀態。`)) return;

        try {
            // 1. 從儀器中拔除陣列
            const inst = this.data.instruments.find(i => i.Instrument_ID === instId);
            if (inst) {
                const updatedTags = (inst.Linked_Property_IDs || []).filter(id => id !== propId);
                await updateDoc(doc(db, "instruments", instId), { Linked_Property_IDs: updatedTags });
            }
            // 2. 清空產編的實驗室地點
            await updateDoc(doc(db, "inventory", propId), { Location: "" });

            this.showNotification("✅ 已成功解除綁定！", 'success');

            // 3. 畫面同步：如果目前正開著編輯視窗，即時移除該標籤
            if (this.currentEditingInstTags && this.currentEditingInstTags.includes(propId)) {
                this.currentEditingInstTags = this.currentEditingInstTags.filter(id => id !== propId);
                this.renderModalInstTags();
            }
            this.renderInventory();
        } catch (e) {
            this.showNotification("解除綁定失敗: " + e.message, 'error');
        }
    },

    // === 儀器狀態專用控制函式 (新增) ===
    setInstActive: function(isActive) {
        document.getElementById('Is_Active').value = isActive ? 'TRUE' : 'FALSE';
        const btnTrue = document.getElementById('btn-inst-active-true');
        const btnFalse = document.getElementById('btn-inst-active-false');
        
        if (isActive) {
            if(btnTrue) { 
                btnTrue.classList.add('active-success'); 
                btnTrue.innerHTML = '<i class="ph-fill ph-check-circle"></i> 正常運作'; 
            }
            if(btnFalse) { 
                btnFalse.classList.remove('active-danger'); 
                btnFalse.innerHTML = '<i class="ph ph-x-circle"></i> 報廢停用'; 
            }
        } else {
            if(btnFalse) { 
                btnFalse.classList.add('active-danger'); 
                btnFalse.innerHTML = '<i class="ph-fill ph-x-circle"></i> 報廢停用'; 
            }
            if(btnTrue) { 
                btnTrue.classList.remove('active-success'); 
                btnTrue.innerHTML = '<i class="ph ph-check-circle"></i> 正常運作'; 
            }
        }
    },

    // === 更新 openInstModal (確保打開時按鈕顏色正確) ===
    openInstModal: function(id = null) {
        if (this.currentRole !== 'Admin') return;
        const modal = document.getElementById('inst-modal');
        const btnDel = document.getElementById('btn-del-i');
        const inputs = document.querySelectorAll('#inst-modal input, #inst-modal select');
        
        this.fillMemberSelect('Manager_ID');
        const locSelect = modal.querySelector('#Location');
        const locations = [...new Set(this.data.instruments.map(i => i.Location))].filter(Boolean).sort();
        locSelect.innerHTML = '<option value="">請選擇區域</option>' + locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');

        inputs.forEach(el => el.value = '');
        
        if (id) {
            document.getElementById('i-modal-title').innerText = "編輯儀器";
            if (btnDel) btnDel.classList.remove('hidden');
            const inst = this.data.instruments.find(x => x.Instrument_ID === id);
            this.currentEditingInstTags = inst.Linked_Property_IDs ? [...inst.Linked_Property_IDs] : [];

            inputs.forEach(el => {
                if (el.id && inst[el.id] !== undefined) el.value = inst[el.id];
            });
            // ★ 強制寫入 ID
            document.getElementById('Instrument_ID').value = id;
            this.setInstActive(inst.Is_Active);
        } else {
            document.getElementById('i-modal-title').innerText = "新增儀器";
            if (btnDel) btnDel.classList.add('hidden');
            this.currentEditingInstTags = []; 
            document.getElementById('Instrument_ID').value = this.generateId('INST');
            this.setInstActive(true);
        }
        
        this.renderModalInstTags();
        modal.classList.remove('hidden');
    },

    saveInstrument: async function() {
        const id = document.getElementById('Instrument_ID').value;
        if (!id) { alert("請輸入儀器 ID"); return; }
        
        const payload = {};
        // ★ 修復核心：強制手動將 ID 寫入，避免被過濾器漏掉
        payload.Instrument_ID = id;

        // 抓取其他表單內容，略過舊的 Property_ID 與手動處理過的 Instrument_ID
        document.querySelectorAll('#inst-modal input, #inst-modal select').forEach(el => {
            if (el.id && el.id !== 'Property_ID' && el.id !== 'Instrument_ID') {
                let val = el.value;
                // 強制轉回 Boolean
                if (el.id === 'Is_Active') val = (val === 'TRUE');
                payload[el.id] = val;
            }
        });

        // 寫入我們編輯好的標籤陣列
        payload.Linked_Property_IDs = this.currentEditingInstTags;

        // 如果是從產編盤點按「下一步」帶過來的，一併加入陣列
        if (this.tempLinkedPropId && !payload.Linked_Property_IDs.includes(this.tempLinkedPropId)) {
            payload.Linked_Property_IDs.push(this.tempLinkedPropId);
        }

        const btn = document.getElementById('btn-save-i');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            // ★ 修復：使用絕對存在的 id 變數作為文件路徑
            await setDoc(doc(db, "instruments", id), payload);
            
            this.closeModal('inst-modal');
            this.showNotification("儀器儲存成功", "success");
            if (typeof this.renderInstruments === 'function') this.renderInstruments();
            this.renderInventory();
        } catch (e) {
            this.showNotification("發生錯誤: " + e.message, 'error');
        } finally {
            btn.innerText = "儲存";
            btn.disabled = false;
            this.tempLinkedPropId = null;
            this.currentEditingInstTags = [];
        }
    },

    // ================= Log 管理邏輯 (保留不變) =================

    setLogFilter: function(status) {
        this.logFilterStatus = status;
        this.updateFilterUI();
        this.renderLogs();
    },

    updateFilterUI: function() {
        document.querySelectorAll('.filter-chip').forEach(btn => {
            if (btn.dataset.val === this.logFilterStatus) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    updateLogLocationFilter: function() {
        const select = document.getElementById('filter-log-location');
        if (!select || select.options.length > 1) return; // 如果已經有選項就不重複加

        // 從儀器清單抓出所有不重複的地點
        const locations = [...new Set(this.data.instruments.map(i => i.Location))].filter(Boolean);
        locations.sort().forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc;
            opt.innerText = loc;
            select.appendChild(opt);
        });
    },

    // === 3. 維修紀錄渲染 ===
    renderLogs: function() {
        const searchEl = document.getElementById('search-log');
        const term = searchEl ? searchEl.value.toLowerCase() : ''; // ★ 安全防呆
        const statusFilter = this.logFilterStatus;
        const locFilterEl = document.getElementById('filter-log-location');
        const locFilter = locFilterEl ? locFilterEl.value : '';
        const isAdmin = this.currentRole === 'Admin';

        this.updateLogLocationFilter();

        let filtered = this.data.logs.filter(log => {
            const inst = this.data.instruments.find(i => i.Instrument_ID === log.Instrument_ID);
            const instName = inst ? inst.Name : log.Instrument_ID;
            const instLoc = inst ? inst.Location : ""; 
            
            const text = (log.Problem_Desc + instName + log.Log_ID).toLowerCase();
            const matchText = text.includes(term);
            const matchStatus = statusFilter === 'All' ? true : log.Status === statusFilter;
            const matchLoc = locFilter ? instLoc === locFilter : true;
            
            return matchText && matchStatus && matchLoc;
        });

        // 排序邏輯
        const sortKey = this.logSortState.key;
        const dir = this.logSortState.direction === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
            let valA = a[sortKey] || '';
            let valB = b[sortKey] || '';
            
            if (sortKey === 'Date_Reported') {
                return (new Date(valA) - new Date(valB)) * dir;
            }
            return valA > valB ? dir : (valA < valB ? -dir : 0);
        });

        UI.renderTable({
            containerId: 'log-tbody',
            data: filtered,
            columns: [
                { 
                    width: '80px', align: 'center', 
                    render: row => {
                        const isClosed = row.Status === 'Closed';
                        const color = isClosed ? 'var(--success)' : 'var(--danger)';
                        const titleText = isClosed ? '已結案' : '待處理';
                        const cursor = isAdmin ? 'cursor: pointer;' : 'cursor: default;';
                        
                        return `<span style="color: ${color}; ${cursor}" 
                                      onclick="event.stopPropagation(); ${isAdmin ? `app.quickResolve('${row.Log_ID}')` : ''}" 
                                      title="${isAdmin ? '點擊切換狀態 (' + titleText + ')' : titleText}">
                                    <i class="ph-fill ph-circle" style="font-size:1.2rem;"></i>
                                </span>`;
                    }
                },
                { width: '80px', align: 'center', render: row => `<span style="color:${this.getUrgencyColor(row.Urgency)}; font-weight:bold;">${row.Urgency}</span>` },
                { 
                    width: '110px', 
                    // ★ 日期格式化：只取前面的 YYYY-MM-DD
                    render: row => row.Date_Reported ? row.Date_Reported.split('T')[0].split(' ')[0] : '-' 
                },
                { width: '150px', render: row => {
                    const inst = this.data.instruments.find(i => i.Instrument_ID === row.Instrument_ID);
                    return inst ? inst.Name : '-';
                }},
                { className: 'hide-mobile', render: row => row.Problem_Desc },
                { className: 'hide-mobile', render: row => `<span style="color:var(--success);">${row.Solution || '-'}</span>` },
                { width: '100px', className: 'hide-mobile', render: row => this.getMemberName(row.Owner_ID || row.Reporter_ID || row.Reporter) },
                { width: '80px', align: 'center', render: row => `<button onclick="event.stopPropagation(); app.openLogModal('${row.Log_ID}')" class="btn btn-sm btn-secondary" ${isAdmin?'':'disabled'}><i class="ph ph-pencil-simple"></i></button>` }
            ],
            emptyMessage: "目前沒有任何符合的維修紀錄"
        });
    },

    getUrgencyColor: function(u) {
        if(u >= 5) return '#dc3545'; 
        if(u >= 3) return '#fd7e14'; 
        return '#198754'; 
    },

    quickResolve: function(id) {
        this.openLogModal(id);
        const statusSelect = document.getElementById('Log_Status');
        if (statusSelect.value === 'Open') {
            statusSelect.value = 'Closed';
            statusSelect.dispatchEvent(new Event('change')); 
        }
    },

    openLogModal: function(data = null) {
        const modalId = 'log-modal';
        const title = data ? '編輯維修紀錄' : '回報維修問題';
        const isAdmin = this.currentRole === 'Admin';
        
        // 初始化區域選單 (對應你的 HTML ID: Log_Location_Filter)
        const locSelect = document.getElementById('Log_Location_Filter');
        const areas = ["多腔體區", "機房", "製程區", "黃光室", "量測區", "辦公區", "頂樓", "其他"];
        locSelect.innerHTML = '<option value="">選擇區域...</option>' + 
            areas.map(a => `<option value="${a}">${a}</option>`).join('');

        // 判斷是否為鎖定狀態
        const isLocked = data && data.Status === 'Closed' && !isAdmin;

        if (data) {
            // 編輯模式：填入舊資料
            document.getElementById('Log_ID').value = data.Log_ID;
            document.getElementById('Problem_Desc').value = data.Problem_Desc || '';
            document.getElementById('Solution').value = data.Solution || '';
            document.getElementById('Log_Status').value = data.Status || 'Open';
            
            // 還原火焰數量
            this.setUrgency(data.Urgency || 3);

            // ★ 反查機制：因為 Log 資料庫沒存地點，所以拿儀器 ID 去找地點
            let instLoc = '';
            const inst = this.data.instruments.find(i => i.Instrument_ID === data.Instrument_ID);
            if (inst) instLoc = inst.Location;
            
            locSelect.value = instLoc;

            // ★ 觸發過濾器，並帶入地點與儀器 ID
            this.filterLogInstruments(instLoc, data.Instrument_ID);
        } else {
            // 新增模式：清空所有欄位
            document.getElementById('Log_ID').value = this.generateId('LOG');
            locSelect.value = '';
            document.getElementById('Problem_Desc').value = '';
            document.getElementById('Solution').value = '';
            document.getElementById('Log_Status').value = 'Open';
            
            // 預設 3 把火
            this.setUrgency(3);
            
            // 清空儀器選單
            this.filterLogInstruments('', '');
        }

        // ==========================================
        // 權限防呆鎖定 (Security & UI Locks)
        // ==========================================
        locSelect.disabled = isLocked;
        document.getElementById('Log_Instrument_ID').disabled = isLocked;
        document.getElementById('Problem_Desc').readOnly = isLocked;
        
        // 只有 Admin 或未結案時能改狀態跟寫解決方案
        document.getElementById('Log_Status').disabled = !isAdmin; 
        const canEditSolution = isAdmin || (data && data.Status !== 'Closed');
        document.getElementById('Solution').readOnly = !canEditSolution;

        // ★ 修復：正確鎖定「火焰圖示」，讓它無法被點擊
        const urgencyDiv = document.getElementById('urgency-rating');
        if (urgencyDiv) {
            urgencyDiv.style.pointerEvents = isLocked ? 'none' : 'auto';
            urgencyDiv.style.opacity = isLocked ? '0.6' : '1';
        }

        // 隱藏儲存按鈕
        const saveBtn = document.getElementById('btn-save-l');
        if (saveBtn) saveBtn.style.display = isLocked ? 'none' : 'block';

        UI.openModal({ modalId, title });
    },

    filterLogInstruments: function(targetArea = null, targetInstId = null) {
        const locSelect = document.getElementById('Log_Location_Filter');
        const instSelect = document.getElementById('Log_Instrument_ID');

        // 如果有傳入 targetArea (開窗時)，優先使用；否則抓畫面上的值 (onchange 時)
        const loc = targetArea !== null ? targetArea : locSelect.value;
        
        if (!loc) {
            instSelect.innerHTML = '<option value="">請先選擇實驗區域...</option>';
            return;
        }

        // 過濾出該區域「未報廢」的儀器
        const filteredInsts = this.data.instruments.filter(i => i.Is_Active && i.Location === loc);
        
        if (filteredInsts.length === 0) {
            instSelect.innerHTML = '<option value="">該區域無設備...</option>';
        } else {
            instSelect.innerHTML = '<option value="">請選擇故障儀器...</option>' + 
                filteredInsts.map(i => `<option value="${i.Instrument_ID}">${i.Name}</option>`).join('');
        }

        // 如果有指定特定的儀器 (編輯模式)，則自動選取它
        if (targetInstId) {
            instSelect.value = targetInstId;
        }
    },

    setupLogAutoStatus: function() {
        const statusSelect = document.getElementById('Log_Status');
        const dateResolved = document.getElementById('Date_Resolved');
        if (!statusSelect || !dateResolved) return; // ★ 安全防呆
        
        statusSelect.addEventListener('change', function() {
            if (this.value === 'Closed') {
                if (!dateResolved.value) dateResolved.value = app.formatDateForInput(new Date());
            } else {
                dateResolved.value = '';
            }
        });
    },

    saveLog: async function() {
        const payload = {};
        document.querySelectorAll('#log-modal input, #log-modal select, #log-modal textarea').forEach(el => {
            let key = el.id;
            if (key.startsWith('Log_') && key !== 'Log_ID') {
                key = key.replace('Log_', '');
            }
            if (key === 'Log_Location_Filter') return; 
            payload[key] = el.value;
        });

        if (!payload.Instrument_ID) { alert("請選擇儀器"); return; }
        if (!payload.Problem_Desc) { alert("請填寫問題描述"); return; }

        const btn = document.getElementById('btn-save-l');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            await setDoc(doc(db, "logs", payload.Log_ID), payload);
            this.closeModal('log-modal');
            this.showNotification("維修紀錄儲存成功", "success");
            // 若有需要，可以在此補上 this.renderLogs(); 讓畫面自動更新
        } catch (e) {
            this.showNotification("❌ 發生錯誤: " + e.message, 'error');
        } finally {
            btn.innerText = "儲存";
            btn.disabled = false;
        }
    },

    // ================= 人員管理邏輯 (保留不變) =================

    renderMembers: function() {
        const tbody = document.getElementById('member-tbody');
        if (!tbody) return;
        const searchEl = document.getElementById('search-member');
        const term = searchEl ? searchEl.value.toLowerCase() : '';
        const isAdmin = this.currentRole === 'Admin';
        
        let filtered = this.data.members.filter(m => (m.Name_Ch + m.Name_En + m.Student_ID).toLowerCase().includes(term));
        filtered.sort((a, b) => {
            if (a.Status !== b.Status) return a.Status === 'Active' ? -1 : 1;
            return a.Student_ID.localeCompare(b.Student_ID);
        });

        if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty">查無資料</td></tr>'; return; }

        tbody.innerHTML = filtered.map(m => {
            const isAlumni = m.Status === 'Alumni';
            const degreeShort = m.Degree === "PhD" ? "博" : (m.Degree === "Master" ? "碩" : "大");
            const statusDisplay = isAlumni ? `🎓 已畢` : this.calculateGrade(m.Enrollment_Date, m.Degree);
            const adminBadge = m.Role === 'Admin' ? `<span class="role-badge Admin">Admin</span>` : '';

            return `
            <tr ${isAdmin ? `onclick="app.openMemberModal('${m.Student_ID}')" style="cursor:pointer;"` : ''}>
                <td style="width:80px; text-align:center;">${statusDisplay}</td>
                <td><strong>${m.Name_Ch}</strong> <br><small style="color:var(--secondary);" class="hide-mobile">${m.Name_En || ''}</small></td>
                <td class="hide-mobile">${m.Student_ID}</td>
                <td class="hide-mobile">${m.Department}</td>
                <td>${adminBadge}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-secondary" ${isAdmin?'':'disabled'}><i class="ph ph-pencil-simple"></i></button>
                </td>
            </tr>`;
        }).join('');
    },

    // === 自訂 UI 切換按鈕邏輯 ===

    // 1. 人員狀態切換
    setMemberStatus: function(status) {
        document.getElementById('Status').value = status;
        const btnActive = document.getElementById('btn-status-active');
        const btnAlumni = document.getElementById('btn-status-alumni');
        
        if(status === 'Active') {
            if(btnActive) btnActive.classList.add('active-success');
            if(btnAlumni) btnAlumni.classList.remove('active-danger');
        } else {
            if(btnAlumni) btnAlumni.classList.add('active-danger');
            if(btnActive) btnActive.classList.remove('active-success');
        }
    },

    // 2. 維修紀錄狀態切換
    setLogFormStatus: function(status) {
        document.getElementById('Log_Status').value = status;
        const btnOpen = document.getElementById('btn-log-open');
        const btnClosed = document.getElementById('btn-log-closed');
        const dateResolved = document.getElementById('Date_Resolved');
        
        if(status === 'Open') {
            if(btnOpen) btnOpen.classList.add('active-danger');
            if(btnClosed) btnClosed.classList.remove('active-success');
            if(dateResolved) dateResolved.value = '';
        } else {
            if(btnClosed) btnClosed.classList.add('active-success');
            if(btnOpen) btnOpen.classList.remove('active-danger');
            if (dateResolved && !dateResolved.value) dateResolved.value = app.formatDateForInput(new Date());
        }
    },

    // 3. 火焰評分特效
    setUrgency: function(level) {
        document.getElementById('Urgency').value = level;
        const fires = document.querySelectorAll('#urgency-rating .ph-fire');
        fires.forEach((fire, index) => {
            if (index < level) {
                fire.style.color = 'var(--danger)'; 
            } else {
                fire.style.color = '#e2e8f0'; // 灰色代表未點燃
            }
        });
    },

    openMemberModal: function(id = null) {
        if (this.currentRole !== 'Admin') return;
        const modal = document.getElementById('member-modal');
        // ★ 修復：正確抓取所有 input
        const inputs = document.querySelectorAll('#member-modal input, #member-modal select');
        const btnDel = document.getElementById('btn-del-m'); 
        
        inputs.forEach(el => el.value = '');

        if (id) {
            document.getElementById('m-modal-title').innerText = "編輯成員";
            if (btnDel) btnDel.classList.remove('hidden'); 
            
            const m = this.data.members.find(x => x.Student_ID === id);
            inputs.forEach(el => {
                if(el.id && m[el.id] !== undefined) { 
                    let val = m[el.id];
                    if (val && val !== "-") {
                        if (el.type === 'date') el.value = this.formatDateForInput(val);
                        else if (el.id === 'Student_ID' || el.id === 'Email') el.value = val.toLowerCase();
                        else el.value = val;
                    }
                }
            });
            document.getElementById('Student_ID').disabled = true;
            this.setMemberStatus(m.Status || 'Active');

            if (m.Google_UID) {
                document.getElementById('Bind_Status').value = "✅ 已綁定";
                document.getElementById('btn-unbind').classList.remove('hidden');
            } else {
                document.getElementById('Bind_Status').value = "❌ 未綁定";
                document.getElementById('btn-unbind').classList.add('hidden');
            }
        } else {
            document.getElementById('m-modal-title').innerText = "新增成員";
            if (btnDel) btnDel.classList.add('hidden'); 
            document.getElementById('Student_ID').disabled = false;
            document.getElementById('Bind_Status').value = "❌ 未綁定";
            document.getElementById('btn-unbind').classList.add('hidden');
            this.setMemberStatus('Active');
            document.getElementById('Role').value = 'User';
        }
        if (modal) modal.classList.remove('hidden');
    },

    unbindMember: async function() {
        const id = document.getElementById('Student_ID').value;
        if (!confirm("確定要解除這位成員的 Google 綁定嗎？\n他下次登入時需要重新輸入學號。")) return;
        
        try {
            await updateDoc(doc(db, "members", id), {
                Google_UID: null // 清空 UID
            });
            document.getElementById('Bind_Status').value = "❌ 未綁定";
            document.getElementById('btn-unbind').classList.add('hidden');
            this.showNotification("✅ 已成功解除綁定！");
        } catch (e) {
            this.showNotification("❌ 解除失敗: " + e.message, 'error');
        }
    },

    saveMember: async function() {
        const idInput = document.getElementById('Student_ID');
        const id = idInput.value.trim().toLowerCase();
        if (!id) { alert("請輸入學號"); return; }
        
        const payload = {};
        document.querySelectorAll('#member-modal input, #member-modal select').forEach(el => {
            let val = el.value.trim();
            if (el.id === 'Email' || el.id === 'Student_ID') val = val.toLowerCase();
            payload[el.id] = val;
        });
        payload['Student_ID'] = id;

        const btn = document.getElementById('btn-save-m');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            await setDoc(doc(db, "members", payload.Student_ID), payload);
            this.closeModal('member-modal');
        } catch (e) {
            this.showNotification("❌ 發生錯誤: " + e.message, 'error');
        } finally {
            btn.innerText = "儲存";
            btn.disabled = false;
        }
    },

    setupAutoStatus: function() {
        const leaveInput = document.getElementById('Leave_Date');
        const statusSelect = document.getElementById('Status');
        if(!leaveInput || !statusSelect) return;
        
        leaveInput.addEventListener('change', function() {
            if (this.value) statusSelect.value = 'Alumni';
        });
        statusSelect.addEventListener('change', function() {
            if (this.value === 'Active') leaveInput.value = '';
        });
    },

    // ================= 通知系統 =================
    showNotification: function(msg, type = 'info', duration = 3000) {
        let container = document.getElementById('toast-container');
        // 如果 HTML 裡沒有容器，就自動建一個
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${msg}</span>`;
        container.appendChild(toast);

        // 設定時間到自動淡出並刪除
        setTimeout(() => {
            toast.classList.add('fadeOut');
            setTimeout(() => toast.remove(), 300); // 等待淡出動畫播完
        }, duration);
    },
    // ================= 共用工具 =================

    closeModal: function(modalId) {
        const m = document.getElementById(modalId);
        if (m) m.classList.add('hidden'); // 加入防呆
    },

    setupModalEvents: function() {
        ['member-modal', 'inst-modal', 'log-modal', 'acc-modal', 'help-modal'].forEach(id => {
            const modal = document.getElementById(id);
            if(modal) modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(id); });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ['member-modal', 'inst-modal', 'log-modal', 'acc-modal'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el && !el.classList.contains('hidden')) this.closeModal(id);
                });
            }
        });
    },

    copyEmail: function(event, email) {
        event.stopPropagation();
        if (!email || email === "-") return;
        const targetBtn = event.currentTarget;
        const showSuccess = () => {
            targetBtn.classList.add('copied');
            const icon = targetBtn.querySelector('.copy-btn-icon');
            const originalIcon = icon.innerText;
            icon.innerText = "✅";
            setTimeout(() => {
                targetBtn.classList.remove('copied');
                icon.innerText = originalIcon;
            }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(email).then(showSuccess).catch(() => this.fallbackCopy(email, showSuccess));
        } else {
            this.fallbackCopy(email, showSuccess);
        }
    },

    fallbackCopy: function(text, successCallback) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "0";
        textArea.style.top = "0";
        textArea.style.width = "2em";
        textArea.style.height = "2em";
        textArea.style.padding = "0";
        textArea.style.border = "none";
        textArea.style.outline = "none";
        textArea.style.boxShadow = "none";
        textArea.style.background = "transparent";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            if (document.execCommand('copy')) successCallback();
            else alert("請手動複製");
        } catch (err) {
            alert("複製失敗");
        } finally {
            document.body.removeChild(textArea);
        }
    },

    calculateGrade: function(enrollDateStr, degree) {
        if (!enrollDateStr || enrollDateStr === "-") return "未知";
        const start = new Date(enrollDateStr);
        const now = new Date();
        const monthDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        if (monthDiff < 0) return "新生";
        const semester = Math.floor(monthDiff / 6) + 1;
        const year = Math.ceil(semester / 2);
        const term = (semester % 2 === 1) ? "上" : "下";
        let prefix = "";
        if (degree === "PhD") prefix = "博";
        else if (degree === "Master") prefix = "碩";
        else prefix = "大";
        return `${prefix}${year}${term}`;
    },

    formatDateForInput: function(dateStr) {
        if (!dateStr || dateStr === "-") return "";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    // ================= 產編清點邏輯 (Phase 1.3) =================

    setInvFilter: function(status) {
        this.invFilterStatus = status;
        document.querySelectorAll('.filter-chip[data-inv-val]').forEach(btn => {
            if (btn.dataset.invVal === status) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        this.renderInventory();
    },

    // ================= 產編清點與橋接邏輯 (最終版) =================

    // === Excel 兩階段匯入：階段一 (預覽解析) ===
    previewExcel: function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                // 跳過前 6 行合併儲存格，將第 7 行視為標題
                const rows = XLSX.utils.sheet_to_json(firstSheet, { range: 6, defval: "" });

                const existingMap = new Map();
                this.data.inventory.forEach(item => existingMap.set(item.Property_ID, item));

                this.tempImportPayloads = []; // 清空暫存
                const tbody = document.getElementById('import-preview-tbody');
                tbody.innerHTML = ''; // 清空表格

                rows.forEach(row => {
                    if (!row['財物編號'] || !row['校號']) return;

                    const propId = `${String(row['財物編號']).trim()}-${String(row['校號']).trim()}-${row['附件'] ? String(row['附件']).trim() : '00'}`;
                    const existingItem = existingMap.get(propId);

                    const payload = {
                        Property_ID: propId,
                        Name: row['財物名稱'] ? String(row['財物名稱']).trim() : '',
                        Brand: row['廠牌'] ? String(row['廠牌']).trim() : '',
                        Model: (row['型式'] || row['形式']) ? String(row['型式'] || row['形式']).trim() : '',
                        Price: row['單價'] ? Number(row['單價']) : 0,
                        Acquire_Date: row['取得日期'] ? String(row['取得日期']).trim() : '',
                        Lifespan: row['年限'] ? String(row['年限']).trim() : ''
                    };

                    // 判斷是新增還是更新
                    let actionText = '';
                    let actionColor = '';

                    if (existingItem) {
                        payload.Location = existingItem.Location || '';
                        payload.Personal_Remark = existingItem.Personal_Remark || '';
                        payload.Status = existingItem.Status || 'Pending';
                        payload.Checked_By = existingItem.Checked_By || null;
                        actionText = '更新 (保留客製區域)';
                        actionColor = 'var(--secondary)';
                    } else {
                        payload.Location = '';
                        payload.Personal_Remark = '';
                        payload.Status = 'Pending';
                        payload.Checked_By = null;
                        actionText = '全新建立';
                        actionColor = 'var(--success)';
                    }

                    this.tempImportPayloads.push(payload);

                    // 畫出預覽列
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="padding: 6px 8px; border-bottom: 1px solid var(--border-color); font-family: monospace;">${payload.Property_ID}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid var(--border-color);">${payload.Name}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-muted);">${payload.Brand} / ${payload.Model}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid var(--border-color); color: ${actionColor}; font-weight: bold; font-size: 0.85rem;">${actionText}</td>
                    `;
                    tbody.appendChild(tr);
                });

                document.getElementById('preview-count').innerText = this.tempImportPayloads.length;
                UI.openModal({ modalId: 'import-preview-modal', title: '確認匯入資料 (預覽)' });

            } catch (error) {
                console.error("Excel 解析失敗:", error);
                this.showNotification("檔案解析失敗，請確認是否為符合格式的 Excel 檔。", 'error');
            } finally {
                event.target.value = ''; // 允許重複上傳
            }
        };
        reader.readAsArrayBuffer(file);
    },

    // === Excel 兩階段匯入：階段二 (確認寫入資料庫) ===
    confirmImport: async function() {
        if (this.tempImportPayloads.length === 0) {
            this.showNotification("沒有可寫入的資料！", 'warning');
            return;
        }

        const btn = document.getElementById('btn-confirm-import');
        btn.innerText = "寫入中...";
        btn.disabled = true;

        try {
            const batch = writeBatch(db);
            this.tempImportPayloads.forEach(payload => {
                const docRef = doc(db, "inventory", payload.Property_ID);
                batch.set(docRef, payload, { merge: true });
            });

            await batch.commit();
            
            this.showNotification(`🎉 成功寫入 ${this.tempImportPayloads.length} 筆產編資料！`, 'success');
            app.closeModal('import-preview-modal');
            this.renderInventory();

        } catch (error) {
            console.error("寫入 Firebase 失敗:", error);
            this.showNotification("寫入失敗: " + error.message, 'error');
        } finally {
            btn.innerText = "確認並寫入系統";
            btn.disabled = false;
            this.tempImportPayloads = []; // 寫入完畢後清空暫存
        }
    },

    // === 產編排序與渲染 ===
    sortInventory: function(key) {
        if (this.invSortState.key === key) {
            this.invSortState.direction = this.invSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.invSortState.key = key;
            this.invSortState.direction = 'asc';
        }
        this.renderInventory();
    },

    // === 畫面渲染 (含廠牌副標題與資訊按鈕) ===
    renderInventory: function() {
        const term = document.getElementById('search-inv').value.toLowerCase();
        const statusFilter = this.invFilterStatus || 'All';
        const locFilter = document.getElementById('filter-inv-location') ? document.getElementById('filter-inv-location').value : '';
        const isAdmin = this.currentRole === 'Admin';
        const standardLocs = ["多腔體區", "機房", "製程區", "黃光室", "量測區", "辦公區", "頂樓"];

        let filtered = this.data.inventory.filter(item => {
            const text = (
                String(item.Property_ID || '') + 
                String(item.Name || '') + 
                String(item.Location || '') + 
                String(item.Personal_Remark || '')
            ).toLowerCase();
            
            const matchText = text.includes(term);
            const matchStatus = statusFilter === 'All' ? true : item.Status === statusFilter;
            
            let matchLoc = true;
            if (locFilter === '其他') {
                matchLoc = item.Location && !standardLocs.includes(item.Location);
            } else if (locFilter) {
                matchLoc = item.Location === locFilter;
            }
            return matchText && matchStatus && matchLoc;
        });

        const sortKey = this.invSortState.key;
        const dir = this.invSortState.direction === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
            let valA = a[sortKey] || '';
            let valB = b[sortKey] || '';
            return valA > valB ? dir : (valA < valB ? -dir : 0);
        });

        UI.renderTable({
            containerId: 'inv-tbody',
            data: filtered,
            columns: [
                { 
                    width: '80px', align: 'center', 
                    render: row => {
                        const isChecked = row.Status === 'Checked';
                        const color = isChecked ? 'var(--success)' : 'var(--danger)';
                        const titleText = isChecked ? '已盤點' : '未盤點';
                        
                        let checkerName = '';
                        if (isChecked && row.Checked_By) {
                            const name = this.getMemberName(row.Checked_By);
                            checkerName = name === row.Checked_By ? '未知人員' : name;
                        }
                        
                        return `<div style="text-align:center; ${isAdmin?'cursor: pointer;':''}" 
                                     onclick="event.stopPropagation(); app.toggleInvStatus('${row.Property_ID}', '${row.Status}')"
                                     title="${isAdmin ? '點擊切換 (' + titleText + ')' : titleText}">
                                    <div style="line-height: 1;"><i class="ph-fill ph-circle" style="color: ${color}; font-size: 1.3rem;"></i></div>
                                    ${checkerName ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${checkerName}</div>` : ''}
                                </div>`;
                    }
                },
                { width: '150px', render: row => `<strong style="font-family: monospace;">${row.Property_ID}</strong>` },
                { 
                    // 財物名稱 (含廠牌/型式副標題)
                    render: row => {
                        const linkedInst = this.data.instruments.find(inst => 
                            inst.Linked_Property_IDs && inst.Linked_Property_IDs.includes(row.Property_ID)
                        );
                        
                        let html = `<div style="font-weight: 600; color: var(--text-main); line-height: 1.4;">${row.Name || '未命名'}</div>`;
                        
                        if (row.Brand || row.Model) {
                            const brandText = row.Brand ? row.Brand : '';
                            const modelText = row.Model ? row.Model : '';
                            html += `<div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 2px;">${brandText} ${modelText}</div>`;
                        }
                        
                        if (linkedInst) {
                            html += `<div style="margin-top: 4px;">
                                        <span style="background: #f1f5f9; color: var(--secondary); font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color); display: inline-flex; align-items: center; gap: 4px;">
                                            <i class="ph ph-link"></i> 已綁定至：${linkedInst.Name}
                                        </span>
                                     </div>`;
                        }
                        return html;
                    }
                },
                { 
                    width: '120px', 
                    render: row => {
                        return `<div style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;" 
                                     onclick="event.stopPropagation(); app.openInvLocationModal('${row.Property_ID}')" title="點擊編輯區域">
                                    <span>${row.Location || '-'}</span>
                                    <i class="ph ph-pencil-simple" style="color: var(--primary); opacity: 0.3;"></i>
                                </div>`;
                    }
                },
                { 
                    width: '200px', 
                    render: row => {
                        const text = row.Personal_Remark || '<span style="color:#aaa; font-style:italic;">點擊編輯...</span>';
                        return `<div style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;" 
                                    onclick="event.stopPropagation(); app.openInvRemarkModal('${row.Property_ID}')" title="點擊編輯細項位置">
                                    <span>${text}</span>
                                    <i class="ph ph-pencil-simple" style="color: var(--primary); opacity: 0.6;"></i>
                                </div>`;
                    }
                },
                { 
                    width: '110px', align: 'center', 
                    // 操作按鈕 (資訊 + 連結/解綁)
                    render: row => {
                        const linkedInst = this.data.instruments.find(inst => 
                            inst.Linked_Property_IDs && inst.Linked_Property_IDs.includes(row.Property_ID)
                        );
                        
                        const infoBtn = `<button onclick="event.stopPropagation(); app.openInvDetailsModal('${row.Property_ID}')" 
                                            class="btn btn-sm btn-secondary" title="查看詳細資料" style="padding: 4px 8px;">
                                            <i class="ph ph-info"></i>
                                         </button>`;

                        let linkBtn = '';
                        if (linkedInst) {
                            linkBtn = `<button onclick="event.stopPropagation(); app.unlinkProperty('${row.Property_ID}', '${linkedInst.Instrument_ID}')" 
                                            class="btn btn-sm btn-danger" title="解除綁定" ${isAdmin?'':'disabled'} style="padding: 4px 8px;">
                                        <i class="ph ph-link-break"></i>
                                    </button>`;
                        } else {
                            linkBtn = `<button onclick="event.stopPropagation(); app.openLinkModal('${row.Property_ID}')" 
                                            class="btn btn-sm btn-primary" title="新增關聯" ${isAdmin?'':'disabled'} style="padding: 4px 8px;">
                                        <i class="ph ph-link"></i>
                                    </button>`;
                        }

                        return `<div style="display: flex; justify-content: center; gap: 6px;">${infoBtn}${linkBtn}</div>`;
                    }
                }
            ],
            emptyMessage: "目前沒有盤點資料！",
            onRowClick: (rowData) => { if (isAdmin) app.toggleInvStatus(rowData.Property_ID, rowData.Status); }
        });
    },

    openInvLocationModal: function(propId) {
        if (this.currentRole !== 'Admin') return;
        const item = this.data.inventory.find(i => i.Property_ID === propId);
        if (!item) return;
        document.getElementById('Loc_Prop_ID').value = propId;
        document.getElementById('Loc_Select_Value').value = item.Location || '其他';
        UI.openModal({ modalId: 'inv-loc-modal', title: '編輯實驗區域' });
    },

    saveInvLocation: async function() {
        const propId = document.getElementById('Loc_Prop_ID').value;
        const newLoc = document.getElementById('Loc_Select_Value').value;
        try {
            await updateDoc(doc(db, "inventory", propId), { Location: newLoc });
            app.closeModal('inv-loc-modal');
            this.showNotification("區域已更新", 'success');

            // ★ 補上這行：強制更新產編畫面
            this.renderInventory(); 
        } catch (e) {
            this.showNotification("更新失敗", 'error');
        }
    },

    // 點擊切換盤點狀態 (這支 Function 之前被你漏掉了)
    toggleInvStatus: async function(propId, currentStatus) {
        if (this.currentRole !== 'Admin') return;
        const newStatus = currentStatus === 'Pending' ? 'Checked' : 'Pending';
        const checkedBy = newStatus === 'Checked' ? this.currentUser.uid : null;
        try {
            await updateDoc(doc(db, "inventory", propId), { 
                Status: newStatus,
                Checked_By: checkedBy 
            });
        } catch (e) {
            this.showNotification("狀態更新失敗: " + e.message, 'error');
        }
    },

    // 編輯備註 Modal (這支 Function 之前也被漏掉了)
    openInvRemarkModal: function(propId) {
        if (this.currentRole !== 'Admin') return;
        const item = this.data.inventory.find(i => i.Property_ID === propId);
        if (!item) return;
        
        document.getElementById('Remark_Prop_ID').value = propId;
        document.getElementById('Remark_Text').value = item.Personal_Remark || '';
        UI.openModal({ modalId: 'remark-modal', title: '編輯細項位置' });
    },

    saveInvRemark: async function() {
        const propId = document.getElementById('Remark_Prop_ID').value;
        const text = document.getElementById('Remark_Text').value.trim();
        try {
            await updateDoc(doc(db, "inventory", propId), { Personal_Remark: text });
            app.closeModal('remark-modal');
            this.showNotification("備註已更新", 'success');
            
            // ★ 補上這行：強制更新產編畫面
            this.renderInventory(); 
        } catch (e) {
            this.showNotification("更新失敗: " + e.message, 'error');
        }
    },

    // === 產編詳細資訊 Modal ===
    openInvDetailsModal: function(propId) {
        const item = this.data.inventory.find(i => i.Property_ID === propId);
        if (!item) return;

        const formatMoney = (num) => {
            return num ? new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(num) : '無紀錄';
        };

        const tbody = document.getElementById('inv-details-tbody');
        
        const labelStyle = "padding: 10px 8px; color: var(--text-muted); width: 100px; white-space: nowrap; vertical-align: top;";
        const valueStyle = "padding: 10px 8px; word-break: break-word; vertical-align: top;";

        tbody.innerHTML = `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="${labelStyle}">財產編號</td>
                <td style="${valueStyle} font-family: monospace; font-weight: bold;">${item.Property_ID}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="${labelStyle}">財物名稱</td>
                <td style="${valueStyle} font-weight: bold;">${item.Name || '-'}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="${labelStyle}">廠牌 / 型式</td>
                <td style="${valueStyle}">${item.Brand || '-'} / ${item.Model || '-'}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="${labelStyle}">取得單價</td>
                <td style="${valueStyle} color: var(--danger); font-weight: bold;">${formatMoney(item.Price)}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="${labelStyle}">取得日期</td>
                <td style="${valueStyle}">${item.Acquire_Date || '-'}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="${labelStyle}">使用年限</td>
                <td style="${valueStyle}">${item.Lifespan ? item.Lifespan + ' 年' : '-'}</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="${labelStyle}">實驗區域</td>
                <td style="${valueStyle} color: var(--primary); font-weight: 600;">${item.Location || '-'}</td>
            </tr>
            <tr>
                <td style="${labelStyle}">細項備註</td>
                <td style="${valueStyle}">${item.Personal_Remark || '-'}</td>
            </tr>
        `;

        UI.openModal({ modalId: 'inv-details-modal', title: '財產詳細資訊' });
    },
    // === Excel 匯出功能 (補回遺失的函式) ===
    exportInventoryExcel: function() {
        if (this.data.inventory.length === 0) {
            this.showNotification("目前沒有資料可以匯出！", "warning");
            return;
        }

        // 將 JSON 資料格式化為學校盤點所需的結構
        const exportData = this.data.inventory.map(item => {
            const parts = item.Property_ID.split('-');
            const part1 = parts[0] || '';
            const part2 = parts[1] || '';
            const part3 = parts[2] || '';

            return {
                '財物編號': part1,
                '校號': part2,
                '附件': part3,
                '財物名稱': item.Name || '',
                '廠牌': item.Brand || '',
                '型式': item.Model || '',
                '單價': item.Price || '',
                '取得日期': item.Acquire_Date || '',
                '年限': item.Lifespan || '',
                '實驗區域(系統)': item.Location || '',
                '細項備註(系統)': item.Personal_Remark || '',
                '盤點狀態': item.Status === 'Checked' ? 'V' : '',
                '盤點人': item.Checked_By ? this.getMemberName(item.Checked_By) : ''
            };
        });

        // 建立工作表與下載
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "實驗室盤點結果");

        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `實驗室盤點結果_${today}.xlsx`);
        this.showNotification("Excel 匯出成功！", "success");
    },

    // === 全新橋接關聯 UX ===
    openLinkModal: function(propId) {
        if (this.currentRole !== 'Admin') return;
        const item = this.data.inventory.find(i => i.Property_ID === propId);
        if (!item) return;

        document.getElementById('Link_Prop_ID').value = propId;
        document.getElementById('Link_Prop_Name').innerText = item.Name;
        document.getElementById('Link_Prop_Code').innerText = propId;
        document.getElementById('Link_New_Name').value = item.Name; 
        document.getElementById('Link_Location').value = ''; 

        // ★ 修復：呼叫新的 selectLinkMode 取代舊的 Radio 點擊
        this.selectLinkMode('existing');

        UI.openModal({ modalId: 'link-modal', title: '產編關聯作業' });
    },

    // ★ 全新的切換模式邏輯 (對應 HTML 的按鈕)
    selectLinkMode: function(mode) {
        document.getElementById('Link_Mode_Selected').value = mode;
        
        // 視覺特效：切換 active 狀態
        const btnExisting = document.getElementById('mode-btn-existing');
        const btnNew = document.getElementById('mode-btn-new');
        if (btnExisting) btnExisting.classList.toggle('active', mode === 'existing');
        if (btnNew) btnNew.classList.toggle('active', mode === 'new');

        // 切換下方顯示區塊
        if (mode === 'existing') {
            document.getElementById('link-existing-section').classList.remove('hidden');
            document.getElementById('link-new-section').classList.add('hidden');
            document.getElementById('btn-link-existing').classList.remove('hidden');
            document.getElementById('btn-link-new').classList.add('hidden');
            this.onLinkLocationChange();
        } else {
            document.getElementById('link-existing-section').classList.add('hidden');
            document.getElementById('link-new-section').classList.remove('hidden');
            document.getElementById('btn-link-existing').classList.add('hidden');
            document.getElementById('btn-link-new').classList.remove('hidden');
        }
    },

    onLinkLocationChange: function() {
        // ★ 這裡改從隱藏的 Input 抓取目前的模式
        const mode = document.getElementById('Link_Mode_Selected').value;
        if (mode !== 'existing') return;

        const loc = document.getElementById('Link_Location').value;
        const select = document.getElementById('Link_Select_Inst');
        
        if (!loc) {
            select.innerHTML = '<option value="">請先選擇上方區域...</option>';
            return;
        }

        const availableInsts = this.data.instruments.filter(i => i.Is_Active && i.Location === loc);
        if (availableInsts.length === 0) {
            select.innerHTML = '<option value="">此區域目前沒有任何儀器！</option>';
        } else {
            select.innerHTML = '<option value="">請選擇儀器...</option>';
            availableInsts.forEach(inst => {
                select.innerHTML += `<option value="${inst.Instrument_ID}">${inst.Name}</option>`;
            });
        }
    },

    submitLinkInst: async function() {
        const propId = document.getElementById('Link_Prop_ID').value;
        const mode = document.getElementById('Link_Mode_Selected').value;
        const loc = document.getElementById('Link_Location').value;
        
        if (!loc) {
            this.showNotification("請先選擇實驗室區域！", "warning");
            return;
        }

        if (mode === 'existing') {
            const instId = document.getElementById('Link_Select_Inst').value;
            if (!instId) {
                this.showNotification("請選擇要連結的儀器！", "warning");
                return;
            }
            try {
                await updateDoc(doc(db, "instruments", instId), { Linked_Property_IDs: arrayUnion(propId) });
                await updateDoc(doc(db, "inventory", propId), { Location: loc });
                this.showNotification("成功關聯！", 'success');
                app.closeModal('link-modal');

                // ★ 補上這行：強制更新產編畫面
                this.renderInventory(); 
            } catch (e) { this.showNotification("錯誤: " + e.message, 'error'); }
        } else {
            const newName = document.getElementById('Link_New_Name').value.trim();
            if (!newName) {
                this.showNotification("請輸入名稱！", "warning");
                return;
            }
            this.tempLinkedPropId = propId; 
            app.closeModal('link-modal');
            this.openInstModal(); 
            
            // 自動帶入產編號碼與名稱
            setTimeout(() => {
                const nameInput = document.getElementById('Name') || document.getElementById('Inst_Name'); 
                const locInput = document.getElementById('Location') || document.getElementById('Inst_Location'); 
                const idInput = document.getElementById('Instrument_ID') || document.getElementById('Inst_ID');
                
                if (nameInput) nameInput.value = newName;
                if (locInput) locInput.value = loc;
                if (idInput) idInput.value = this.generateId('INST');
                
                this.showNotification("已自動帶入產編、名稱與區域！", "info");
            }, 150);
        }
    },
};

// ================= 全域 UX 監聽器 =================
// 支援按 ESC 鍵關閉 Modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(m => app.closeModal(m.id));
    }
});
// 支援點擊 Modal 黑色半透明背景關閉
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        app.closeModal(e.target.id);
    }
});

window.app = app;

document.addEventListener("DOMContentLoaded", () => app.init());
