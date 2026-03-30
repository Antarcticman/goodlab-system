// === script.js 最上方 ===
// 1. 引入 Firebase 模組
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
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

// 4. 原本的 app 結構
const app = {
    data: {
        members: [],
        instruments: [],
        logs: [],
        accounting: []
    },
    sortState: { key: 'Location', direction: 'asc' },
    logFilterStatus: 'Open',
    accFilterStatus: 'All',

    init: function() {
        this.setupRealtimeListeners(); // ★ 改成呼叫這個新的監聽器
        this.setupModalEvents();
        this.setupAutoStatus(); 
        this.setupLogAutoStatus();
        this.updateFilterUI();
        this.updateAccFilterUI();
    },

    // ================= 共用刪除邏輯 =================
    deleteRecord: async function(collectionName, id, modalId) {
        if(!confirm("⚠️ 確定要永久刪除這筆資料嗎？刪除後無法復原！")) return;
        try {
            await deleteDoc(doc(db, collectionName, id));
            this.closeModal(modalId);
        } catch (e) {
            alert("刪除失敗: " + e.message);
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
        ['member-grid', 'inst-tbody', 'log-tbody', 'acc-tbody'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                const cols = id === 'inst-tbody' ? 6 : id === 'log-tbody' ? 8 : id === 'acc-tbody' ? 8 : 1;
                el.innerHTML = id === 'member-grid' ? '<div class="loading">與 Firebase 連線中...</div>' : `<tr><td colspan="${cols}" class="loading">與 Firebase 連線中...</td></tr>`;
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
            this.renderMembers();
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
    },

    switchTab: function(tabName) {
        document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

        const target = document.getElementById(`page-${tabName}`);
        if(target) { target.classList.remove('hidden'); target.classList.add('active'); }
        
        // 對應按鈕 Index: members=0, instruments=1, logs=2, accounting=3
        const map = { 'members': 0, 'instruments': 1, 'logs': 2, 'accounting': 3 };
        const btns = document.querySelectorAll('.nav-btn');
        if(btns[map[tabName]]) btns[map[tabName]].classList.add('active');
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
            alert("目前沒有欠任何人錢！🎉");
            return;
        }

        let msg = "待還款明細：\n----------------\n";
        for (let [name, amt] of Object.entries(debts)) {
            msg += `${name}: $${amt}\n`;
        }
        alert(msg);
    },

    renderAccounting: function() {
        const tbody = document.getElementById('acc-tbody');
        const term = document.getElementById('search-acc').value.toLowerCase();
        const filter = this.accFilterStatus;

        let filtered = this.data.accounting.filter(acc => {
            // 搜尋文字
            const payerName = this.getMemberName(acc.Payer);
            const text = (acc.Description + payerName + acc.Type).toLowerCase();
            if (!text.includes(term)) return false;

            // 狀態篩選
            const isDebt = (acc.Payer !== 'Fund' && !acc.Payback_Date); // 欠人錢
            const isWait = (acc.Type === 'School' && !acc.Recharge_Date); // 等回沖

            if (filter === 'Debt') return isDebt;
            if (filter === 'Wait') return isWait;
            return true;
        });

        // 排序：日期新到舊
        filtered.sort((a, b) => new Date(b.Date) - new Date(a.Date));

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">查無紀錄</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(acc => {
            const payerName = this.getMemberName(acc.Payer);
            const amt = parseFloat(acc.Amount);
            const isFund = acc.Payer === 'Fund';
            
            // 狀態燈號邏輯
            let statusIcon = "🟢"; // 預設正常
            if (!isFund && !acc.Payback_Date) statusIcon = "🔴"; // 欠學生錢 = 紅燈 (最緊急)
            else if (acc.Type === 'School' && !acc.Recharge_Date) statusIcon = "🟡"; // 錢還在學校 = 黃燈 (次要)
            
            // 日期顯示 (有日期顯示日期，沒日期顯示狀態文字)
            const dateRecharge = acc.Recharge_Date ? this.formatDateForInput(acc.Recharge_Date) : `<span class="date-empty">等待回沖</span>`;
            const datePayback = isFund ? `<span class="date-empty">-</span>` : (acc.Payback_Date ? this.formatDateForInput(acc.Payback_Date) : `<span class="date-empty" style="color:#dc3545">尚未還款</span>`);
            
            // 特別處理內帳/Deposit的顯示
            const showRecharge = (acc.Type === 'Lab' || acc.Type === 'Deposit') ? '<span class="date-empty">-</span>' : dateRecharge;

            return `
            <tr onclick="app.openAccModal('${acc.Txn_ID}')" style="cursor:pointer">
                <td style="text-align:center; font-size:1.2rem;">${statusIcon}</td>
                <td>${this.formatDateForInput(acc.Date)}</td>
                <td>
                    ${acc.Description} 
                    <br><small style="color:#888">${this.getAccTypeName(acc.Type)}</small>
                </td>
                <td style="text-align:right" class="${amt >= 0 ? 'amount-pos' : 'amount-neg'}">${amt}</td>
                <td>${payerName}</td>
                <td>${showRecharge}</td>
                <td>${datePayback}</td>
                <td style="text-align:center;">
                    <button onclick="event.stopPropagation(); app.openAccModal('${acc.Txn_ID}')" class="btn btn-sm btn-secondary">✏️</button>
                </td>
            </tr>`;
        }).join('');
    },

    // 輔助：取得中文類型
    getAccTypeName: function(type) {
        if(type === 'School') return '🏫 報帳';
        if(type === 'Lab') return '🧪 內帳';
        if(type === 'Deposit') return '💰 匯入';
        if(type === 'Withdrawal') return '🏧 提款'; // ★ 補上這行
        return type;
    },

    // 輔助：取得成員名字 (或是 Fund)
    getMemberName: function(id) {
        if (id === 'Fund') return '🏦 公積金';
        const m = this.data.members.find(x => x.Student_ID === id);
        return m ? m.Name_Ch : id;
    },

    openAccModal: function(id = null) {
        const modal = document.getElementById('acc-modal');
        const btnDel = document.getElementById('btn-del-a');
        const inputs = document.querySelectorAll('#acc-modal input, #acc-modal select, #acc-modal textarea');
        
        this.fillPayerSelect('Acc_Payer');
        inputs.forEach(el => {
            if(el.type === 'radio') {
                el.checked = false; // radio 只取消勾選，不刪除 value
            } else {
                el.value = '';
            }
        });

        if (id) {
            document.getElementById('a-modal-title').innerText = "編輯帳務";
            btnDel.classList.remove('hidden');
            const acc = this.data.accounting.find(x => x.Txn_ID === id);
            
            // 回填資料
            document.getElementById('Txn_ID').value = acc.Txn_ID;
            document.getElementById('Acc_Type').value = acc.Type;
            document.getElementById('Acc_Date').value = this.formatDateForInput(acc.Date);
            document.getElementById('Acc_Description').value = acc.Description;
            document.getElementById('Acc_Amount').value = acc.Amount;
            document.getElementById('Acc_Payer').value = acc.Payer;
            document.getElementById('Recharge_Date').value = this.formatDateForInput(acc.Recharge_Date);
            document.getElementById('Payback_Date').value = this.formatDateForInput(acc.Payback_Date);
            document.getElementById('Invoice_Link').value = acc.Invoice_Link || '';
            
            // ★ 新增：回填備註
            document.getElementById('Acc_Remark').value = acc.Remark || '';
            const fs = acc.Fund_Source || 'Bank';
            this.setFundSource(fs);

        } else {
            document.getElementById('a-modal-title').innerText = "新增帳務";
            btnDel.classList.add('hidden');
            const now = new Date();
            const timeCode = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
            document.getElementById('Txn_ID').value = `ACC_${timeCode}`;
            document.getElementById('Acc_Date').value = this.formatDateForInput(new Date());
            document.getElementById('Acc_Type').value = 'School';
            document.getElementById('Acc_Payer').value = 'Fund';
            this.setFundSource('Bank');
        }
        
        this.handleAccTypeChange();
        this.handleAccPayerChange();

        modal.classList.remove('hidden');
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
            if(source === 'Cash') btnCash.classList.add('active'); else btnCash.classList.remove('active');
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

        if (!payload.Description || !payload.Amount) { alert("請填寫項目和金額"); return; }

        const btn = document.getElementById('btn-save-a');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            // ★ Firebase 寫入語法
            await setDoc(doc(db, "accounting", payload.Txn_ID), payload);
            
            this.closeModal('acc-modal');
            // 注意：這裡把 this.fetchData(); 刪掉了！
        } catch (e) {
            alert("錯誤: " + e.message);
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

    renderInstruments: function() {
        const tbody = document.getElementById('inst-tbody');
        const term = document.getElementById('search-inst').value.toLowerCase();
        const locFilter = document.getElementById('filter-location').value;

        this.updateLocationFilter();

        let filtered = this.data.instruments.filter(inst => {
            const text = (inst.Name + inst.Instrument_ID + (inst.Vendor_Info||"")).toLowerCase();
            const matchText = text.includes(term);
            const matchLoc = locFilter ? inst.Location === locFilter : true;
            return matchText && matchLoc;
        });

        const { key, direction } = this.sortState;
        filtered.sort((a, b) => {
            let valA = a[key] || "";
            let valB = b[key] || "";
            
            if (key === 'Manager_ID') {
                const mA = this.data.members.find(m => m.Student_ID === valA);
                const mB = this.data.members.find(m => m.Student_ID === valB);
                valA = mA ? mA.Name_Ch : valA;
                valB = mB ? mB.Name_Ch : valB;
            }
            if (key === 'Is_Active') {
                valA = String(valA).toUpperCase();
                valB = String(valB).toUpperCase();
            }
            if (direction === 'asc') {
                return valA.localeCompare(valB, "zh-Hant");
            } else {
                return valB.localeCompare(valA, "zh-Hant");
            }
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty">查無儀器資料</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(inst => {
            const isActive = String(inst.Is_Active).toUpperCase() === 'TRUE';
            const manager = this.data.members.find(m => m.Student_ID === inst.Manager_ID);
            const managerName = manager ? manager.Name_Ch : (inst.Manager_ID || '-');
            const vendor = inst.Vendor_Info || '-';

            return `
            <tr>
                <td>
                    <span class="mobile-status">
                        ${isActive ? ' 🟢' : ' 🔴'}
                    </span>
                </td>
                <td style="font-weight:600">${inst.Name}</td>
                <td>${inst.Location}</td>
                <td style="color:#666; font-size:0.9em;">${vendor}</td>
                <td>${managerName}</td>
                <td>
                    <button onclick="app.openInstModal('${inst.Instrument_ID}')" class="btn btn-sm btn-secondary" style="white-space:nowrap;">✏️</button>
                </td>
            </tr>
            `;
        }).join('');
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

    openInstModal: function(id = null) {
        const modal = document.getElementById('inst-modal');
        const btnDel = document.getElementById('btn-del-i');
        const inputs = document.querySelectorAll('#inst-modal input, #inst-modal select');
        
        this.fillMemberSelect('Manager_ID');

        const locSelect = modal.querySelector('#Location');
        const locations = [...new Set(this.data.instruments.map(i => i.Location))].filter(Boolean).sort();
        locSelect.innerHTML = '<option value="">請選擇區域</option>' + 
            locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');

        inputs.forEach(el => el.value = '');
        
        if (id) {
            document.getElementById('i-modal-title').innerText = "編輯儀器";
            if (btnDel) btnDel.classList.remove('hidden');
            
            const inst = this.data.instruments.find(x => x.Instrument_ID === id);
            inputs.forEach(el => {
                if (el.id && inst[el.id] !== undefined) {
                    let val = inst[el.id];
                    if (el.id === 'Is_Active') val = String(val).toUpperCase(); 
                    el.value = val;
                }
            });
        } else {
            document.getElementById('i-modal-title').innerText = "新增儀器";
            if (btnDel) btnDel.classList.add('hidden');
            // 自動產生含秒數與亂碼的 ID
            const now = new Date();
            const timeCode = now.getFullYear() + 
                String(now.getMonth()+1).padStart(2,'0') + 
                String(now.getDate()).padStart(2,'0') + 
                String(now.getHours()).padStart(2,'0') + 
                String(now.getMinutes()).padStart(2,'0') +
                String(now.getSeconds()).padStart(2,'0');
            const randomCode = Math.floor(Math.random() * 900) + 100;
            
            document.getElementById('Instrument_ID').value = `INST_${timeCode}_${randomCode}`;
            document.getElementById('Is_Active').value = 'TRUE';
        }
        modal.classList.remove('hidden');
    },

    saveInstrument: async function() {
        const id = document.getElementById('Instrument_ID').value;
        if (!id) { alert("請輸入儀器 ID"); return; }
        const payload = {};
        document.querySelectorAll('#inst-modal input, #inst-modal select').forEach(el => payload[el.id] = el.value);

        const btn = document.getElementById('btn-save-i');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            await setDoc(doc(db, "instruments", payload.Instrument_ID), payload);
            
            this.closeModal('inst-modal');
        } catch (e) {
            alert("錯誤: " + e.message);
        } finally {
            btn.innerText = "儲存";
            btn.disabled = false;
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

    renderLogs: function() {
        const tbody = document.getElementById('log-tbody');
        const term = document.getElementById('search-log').value.toLowerCase();
        const statusFilter = this.logFilterStatus;
        const locFilter = document.getElementById('filter-log-location').value; // ★ 1. 取得選擇的地點

        this.updateLogLocationFilter(); // ★ 2. 確保下拉選單有選項

        let filtered = this.data.logs.filter(log => {
            const inst = this.data.instruments.find(i => i.Instrument_ID === log.Instrument_ID);
            const instName = inst ? inst.Name : log.Instrument_ID;
            const instLoc = inst ? inst.Location : ""; // ★ 取得該儀器的地點
            
            const text = (log.Problem_Desc + instName + log.Log_ID).toLowerCase();
            const matchText = text.includes(term);
            const matchStatus = statusFilter === 'All' ? true : log.Status === statusFilter;
            const matchLoc = locFilter ? instLoc === locFilter : true; // ★ 3. 判斷地點是否符合
            
            return matchText && matchStatus && matchLoc;
        });

        // ★ 4. 更改排序邏輯：純看日期往下排 (新 -> 舊)，拿掉嚴重程度的排序
        filtered.sort((a, b) => {
            // 如果你還是希望「未解決(Open)」的單子優先置頂，可以把下面這行解除註解：
            // if (a.Status !== b.Status) return a.Status === 'Open' ? -1 : 1; 
            
            return new Date(b.Date_Reported) - new Date(a.Date_Reported); 
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">查無紀錄</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(log => {
            const isOpen = log.Status === 'Open';
            const inst = this.data.instruments.find(i => i.Instrument_ID === log.Instrument_ID);
            const instDisplay = inst ? `${inst.Name} <br><small style='color:#666'>${inst.Location}</small>` : log.Instrument_ID;
            const owner = this.data.members.find(m => m.Student_ID === log.Owner_ID);
            const ownerName = owner ? owner.Name_Ch : (log.Owner_ID || '-');
            const dateDisplay = this.formatDateForInput(log.Date_Reported);

            return `
            <tr class="log-row ${isOpen ? 'open' : 'closed'}" onclick="app.openLogModal('${log.Log_ID}')" style="cursor:pointer;">
                <td style="text-align:center;">
                    <button class="resolve-btn ${!isOpen ? 'checked' : ''}" 
                        onclick="event.stopPropagation(); app.quickResolve('${log.Log_ID}')" 
                        title="${isOpen ? '點擊解決' : '已解決'}">
                        ${isOpen ? '' : '✔'}
                    </button>
                </td>
                <td style="color:${this.getUrgencyColor(log.Urgency)}; font-weight:bold;">
                    ${log.Urgency}
                </td>
                <td>${dateDisplay}</td> 
                <td>${instDisplay}</td>
                <td style="max-width:250px;">${log.Problem_Desc}</td>
                <td style="max-width:250px; color:#198754;">${log.Solution || ''}</td>
                <td>${ownerName}</td>
                <td>
                    <button onclick="event.stopPropagation(); app.openLogModal('${log.Log_ID}')" class="btn btn-sm btn-secondary">✏️</button>
                </td>
            </tr>
            `;
        }).join('');
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

    openLogModal: function(id = null) {
        const modal = document.getElementById('log-modal');
        const inputs = document.querySelectorAll('#log-modal input, #log-modal select, #log-modal textarea');
        const btnDel = document.getElementById('btn-del-l')
        this.fillMemberSelect('Owner_ID');

        const locSelect = document.getElementById('Log_Location_Filter');
        const locations = [...new Set(this.data.instruments.map(i => i.Location))].filter(Boolean);
        locSelect.innerHTML = '<option value="">請選擇...</option>' + 
            locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');

        inputs.forEach(el => el.value = '');

        if (id) {
            document.getElementById('l-modal-title').innerText = "編輯維修紀錄";
            btnDel.classList.remove('hidden');
            const log = this.data.logs.find(x => x.Log_ID === id);
            
            inputs.forEach(el => {
                const key = el.id.replace('Log_', ''); 
                if (log[el.id] !== undefined) el.value = log[el.id]; 
                if (log[key] !== undefined) el.value = log[key]; 
                
                if (el.type === 'date') {
                    const dateVal = log[el.id] || log[key];
                    el.value = this.formatDateForInput(dateVal);
                }
            });

            const inst = this.data.instruments.find(i => i.Instrument_ID === log.Instrument_ID);
            if (inst) {
                locSelect.value = inst.Location;
                this.filterLogInstruments(); 
                document.getElementById('Log_Instrument_ID').value = log.Instrument_ID; 
            }

        } else {
            document.getElementById('l-modal-title').innerText = "回報問題";
            btnDel.classList.add('hidden');
            const now = new Date();
            const timeCode = now.getFullYear() +
                String(now.getMonth()+1).padStart(2,'0') +
                String(now.getDate()).padStart(2,'0') +
                String(now.getHours()).padStart(2,'0') +
                String(now.getMinutes()).padStart(2,'0');
            document.getElementById('Log_ID').value = `LOG_${timeCode}`;
            
            document.getElementById('Log_Status').value = 'Open';
            document.getElementById('Date_Reported').value = this.formatDateForInput(new Date());
            document.getElementById('Urgency').value = '3';
        }

        modal.classList.remove('hidden');
    },

    filterLogInstruments: function() {
        const loc = document.getElementById('Log_Location_Filter').value;
        const instSelect = document.getElementById('Log_Instrument_ID');
        
        if (!loc) {
            instSelect.innerHTML = '<option value="">請先選擇地點</option>';
            return;
        }

        const filteredInsts = this.data.instruments.filter(i => i.Location === loc);
        instSelect.innerHTML = filteredInsts.map(i => 
            `<option value="${i.Instrument_ID}">${i.Name}</option>`
        ).join('');
    },

    setupLogAutoStatus: function() {
        const statusSelect = document.getElementById('Log_Status');
        const dateResolved = document.getElementById('Date_Resolved');

        statusSelect.addEventListener('change', function() {
            if (this.value === 'Closed') {
                if (!dateResolved.value) {
                    dateResolved.value = app.formatDateForInput(new Date());
                }
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
        } catch (e) {
            alert("錯誤: " + e.message);
        } finally {
            btn.innerText = "儲存";
            btn.disabled = false;
        }
    },

    // ================= 人員管理邏輯 (保留不變) =================

    renderMembers: function() {
        const grid = document.getElementById('member-grid');
        const term = document.getElementById('search-member').value.toLowerCase();
        
        const filtered = this.data.members.filter(m => {
            const text = (m.Name_Ch + m.Name_En + m.Student_ID).toLowerCase();
            return text.includes(term);
        });

        filtered.sort((a, b) => {
            if (a.Status !== b.Status) return a.Status === 'Active' ? -1 : 1;
            return a.Student_ID.localeCompare(b.Student_ID);
        });

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="empty">查無資料</div>';
            return;
        }

        grid.innerHTML = filtered.map(m => {
            const isAlumni = m.Status === 'Alumni';
            const studentIdLower = m.Student_ID.toLowerCase();
            const emailLower = (m.Email || "").toLowerCase();
            
            // 狀態與學位顯示邏輯
            let statusDisplay = "";
            let degreeShort = "";
            if (m.Degree === "PhD") degreeShort = "博";
            else if (m.Degree === "Master") degreeShort = "碩";
            else if (m.Degree === "Undergrad") degreeShort = "大";

            if (isAlumni) {
                if (m.Leave_Date && m.Leave_Date !== "-") {
                    const year = new Date(m.Leave_Date).getFullYear();
                    statusDisplay = `🎓 ${year} ${degreeShort}畢`;
                } else {
                    statusDisplay = `🎓 已${degreeShort}畢`;
                }
            } else {
                statusDisplay = this.calculateGrade(m.Enrollment_Date, m.Degree);
            }

            // Email 區塊邏輯
            let emailHtml = "";
            if (!isAlumni) {
                emailHtml = `
                <div class="email-row" onclick="app.copyEmail(event, '${emailLower}')" title="點擊複製信箱">
                    <span class="icon start-icon">📧</span> 
                    <span class="email-text">${emailLower}</span>
                    <span class="icon copy-btn-icon">📋</span>
                </div>`;
            }

            // ★ 修改重點：只顯示 Admin 標籤
            const adminBadge = (m.Role === 'Admin') 
                ? `<span class="role-badge Admin">Admin</span>` 
                : '';

            return `
            <div class="card ${isAlumni ? 'alumni' : ''}" onclick="app.openMemberModal('${m.Student_ID}')">
                
                <div class="card-header-flex">
                    <h3>
                        ${m.Name_Ch} 
                        <small style="color:#888; font-weight:normal; font-size:0.85em; display:block; margin-top:2px;">
                            ${m.Name_En} ${m.Surname_En}
                        </small>
                    </h3>
                    ${adminBadge}
                </div>

                <div class="card-body">
                    <p><span class="icon">🆔</span> ${studentIdLower}</p>
                    <p><span class="icon">📅</span> ${statusDisplay}</p>
                    <p><span class="icon">🏫</span> ${m.Department}</p>
                    ${emailHtml}
                </div>
            </div>`;
        }).join('');
    },

    openMemberModal: function(id = null) {
        const modal = document.getElementById('member-modal');
        const inputs = document.querySelectorAll('#member-modal input, #member-modal select');
        const btnDel = document.getElementById('btn-del-m');
        inputs.forEach(el => el.value = '');

        if (id) {
            document.getElementById('m-modal-title').innerText = "編輯成員";
            btnDel.classList.remove('hidden');
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
        } else {
            document.getElementById('m-modal-title').innerText = "新增成員";
            btnDel.classList.add('hidden');
            document.getElementById('Student_ID').disabled = false;
            document.getElementById('Status').value = 'Active';
            document.getElementById('Role').value = 'User';
        }
        modal.classList.remove('hidden');
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
            alert("錯誤: " + e.message);
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

    // ================= 共用工具 =================

    closeModal: function(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    },

    setupModalEvents: function() {
        ['member-modal', 'inst-modal', 'log-modal', 'acc-modal'].forEach(id => {
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
    }
};

window.app = app;

document.addEventListener("DOMContentLoaded", () => app.init());
