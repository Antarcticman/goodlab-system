const GAS_URL = "https://script.google.com/macros/s/AKfycbzBKHQn213TIdw-EDMt7FUuvZFPkHn_YWv_s6LvFziGuxFJP2_6hOlc6JBXuomwg1LJ-g/exec"; 

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
        this.fetchData();
        this.setupModalEvents();
        this.setupAutoStatus(); 
        this.setupLogAutoStatus();
        this.updateFilterUI();
        this.updateAccFilterUI();
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

    fetchData: async function() {
        // 設定 Loading
        ['member-grid', 'inst-tbody', 'log-tbody', 'acc-tbody'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                // 根據表格欄位數調整 colspan
                const cols = id === 'inst-tbody' ? 6 : id === 'log-tbody' ? 8 : id === 'acc-tbody' ? 8 : 1;
                el.innerHTML = id === 'member-grid' ? '<div class="loading">讀取中...</div>' : `<tr><td colspan="${cols}" class="loading">資料讀取中...</td></tr>`;
            }
        });

        try {
            const res = await fetch(`${GAS_URL}?action=getAllData`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            
            this.data.members = json.members || [];
            this.data.instruments = json.instruments || [];
            this.data.logs = json.logs || [];
            this.data.accounting = json.accounting || []; // 新增

            this.renderMembers();
            this.renderInstruments();
            this.renderLogs();
            this.renderAccounting(); // 新增
            this.calcDashboard(); // 新增：計算金額

        } catch (e) {
            console.error(e);
            alert("讀取失敗：" + e.message);
        }
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
        let balance = 0;
        let payable = 0;
        let receivable = 0;

        this.data.accounting.forEach(acc => {
            const amt = parseFloat(acc.Amount) || 0;
            const isFund = acc.Payer === 'Fund';
            const isRecharged = !!acc.Recharge_Date; // 有日期=True
            const isPaidBack = !!acc.Payback_Date;   // 有日期=True

            // 1. 計算餘額 (Balance)
            // 邏輯：存入 + 學校已回沖的錢 - 公積金直接付出去的 - 公積金還給學生的
            if (acc.Type === 'Deposit') {
                balance += amt;
            } else if (acc.Type === 'School') {
                if (isRecharged) balance += Math.abs(amt); // 學校還錢進來了 (+)
                if (isFund) balance -= Math.abs(amt);      // 公積金先付的 (-)
                if (!isFund && isPaidBack) balance -= Math.abs(amt); // 還給學生 (-)
            } else if (acc.Type === 'Lab') {
                if (isFund) balance -= Math.abs(amt);      // 內帳公積金付 (-)
                if (!isFund && isPaidBack) balance -= Math.abs(amt); // 內帳還學生 (-)
            }

            // 2. 計算待還代墊 (Payable) -> Payer是學生 且 還沒Payback
            if (!isFund && !isPaidBack) {
                payable += Math.abs(amt);
            }

            // 3. 計算等待回沖 (Receivable) -> Type是School 且 還沒Recharge
            if (acc.Type === 'School' && !isRecharged) {
                receivable += Math.abs(amt);
            }
        });

        // 更新 UI
        document.getElementById('val-balance').innerText = "$" + balance.toLocaleString();
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
        const inputs = document.querySelectorAll('#acc-modal input, #acc-modal select, #acc-modal textarea');
        
        this.fillPayerSelect('Acc_Payer');
        inputs.forEach(el => el.value = ''); // 清空所有欄位 (包含新的 textarea)

        if (id) {
            document.getElementById('a-modal-title').innerText = "編輯帳務";
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

        } else {
            document.getElementById('a-modal-title').innerText = "新增帳務";
            const now = new Date();
            const timeCode = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
            document.getElementById('Txn_ID').value = `ACC_${timeCode}`;
            document.getElementById('Acc_Date').value = this.formatDateForInput(new Date());
            document.getElementById('Acc_Type').value = 'School';
            document.getElementById('Acc_Payer').value = 'Fund';
        }
        
        this.handleAccTypeChange();
        this.handleAccPayerChange();

        modal.classList.remove('hidden');
    },

    // UI 連動：類型改變時，隱藏/顯示回沖日期
    handleAccTypeChange: function() {
        const type = document.getElementById('Acc_Type').value;
        const divRecharge = document.getElementById('grp-recharge');
        // 只有 School 需要回沖日期
        divRecharge.style.visibility = (type === 'School') ? 'visible' : 'hidden';
    },

    // UI 連動：付款人改變時，隱藏/顯示還款日期
    handleAccPayerChange: function() {
        const payer = document.getElementById('Acc_Payer').value;
        const divPayback = document.getElementById('grp-payback');
        // 如果是 Fund 付的，就不需要還款日期
        divPayback.style.visibility = (payer === 'Fund') ? 'hidden' : 'visible';
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
            
            // ★ 新增：傳送備註資料 (Key 必須跟 Google Sheet 的標題一樣)
            Remark: document.getElementById('Acc_Remark').value
        };

        if (!payload.Description || !payload.Amount) { alert("請填寫項目和金額"); return; }

        if(!confirm("確定儲存帳務？")) return;
        const btn = document.getElementById('btn-save-a');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ type: "saveAccounting", data: payload })
            });
            alert("儲存成功！");
            this.closeModal('acc-modal');
            this.fetchData();
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
        const inputs = document.querySelectorAll('#inst-modal input, #inst-modal select');
        
        this.fillMemberSelect('Manager_ID');

        const locSelect = modal.querySelector('#Location');
        const locations = [...new Set(this.data.instruments.map(i => i.Location))].filter(Boolean).sort();
        locSelect.innerHTML = '<option value="">請選擇區域</option>' + 
            locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');

        inputs.forEach(el => el.value = '');
        
        if (id) {
            document.getElementById('i-modal-title').innerText = "編輯儀器";
            const inst = this.data.instruments.find(x => x.Instrument_ID === id);
            
            inputs.forEach(el => {
                if (el.id && inst[el.id] !== undefined) {
                    let val = inst[el.id];
                    if (el.id === 'Is_Active') val = String(val).toUpperCase(); 
                    el.value = val;
                }
            });
            document.getElementById('Instrument_ID').disabled = true;
        } else {
            document.getElementById('i-modal-title').innerText = "新增儀器";
            document.getElementById('Instrument_ID').disabled = false;
            document.getElementById('Is_Active').value = 'TRUE';
        }
        modal.classList.remove('hidden');
    },

    saveInstrument: async function() {
        const id = document.getElementById('Instrument_ID').value;
        if (!id) { alert("請輸入儀器 ID"); return; }
        const payload = {};
        document.querySelectorAll('#inst-modal input, #inst-modal select').forEach(el => payload[el.id] = el.value);

        if(!confirm("確定儲存儀器資料？")) return;
        const btn = document.getElementById('btn-save-i');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ type: "saveInstrument", data: payload })
            });
            alert("儲存成功！");
            this.closeModal('inst-modal');
            this.fetchData();
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

    renderLogs: function() {
        const tbody = document.getElementById('log-tbody');
        const term = document.getElementById('search-log').value.toLowerCase();
        const statusFilter = this.logFilterStatus;

        let filtered = this.data.logs.filter(log => {
            const inst = this.data.instruments.find(i => i.Instrument_ID === log.Instrument_ID);
            const instName = inst ? inst.Name : log.Instrument_ID;
            
            const text = (log.Problem_Desc + instName + log.Log_ID).toLowerCase();
            const matchText = text.includes(term);
            const matchStatus = statusFilter === 'All' ? true : log.Status === statusFilter;
            
            return matchText && matchStatus;
        });

        filtered.sort((a, b) => {
            if (a.Status !== b.Status) return a.Status === 'Open' ? -1 : 1; 
            if (a.Urgency !== b.Urgency) return b.Urgency - a.Urgency; 
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
        
        this.fillMemberSelect('Owner_ID');

        const locSelect = document.getElementById('Log_Location_Filter');
        const locations = [...new Set(this.data.instruments.map(i => i.Location))].filter(Boolean);
        locSelect.innerHTML = '<option value="">請選擇...</option>' + 
            locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');

        inputs.forEach(el => el.value = '');

        if (id) {
            document.getElementById('l-modal-title').innerText = "編輯維修紀錄";
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

        if(!confirm("確定儲存紀錄？")) return;
        const btn = document.getElementById('btn-save-l');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ type: "saveLog", data: payload })
            });
            alert("儲存成功！");
            this.closeModal('log-modal');
            this.fetchData();
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
        inputs.forEach(el => el.value = '');

        if (id) {
            document.getElementById('m-modal-title').innerText = "編輯成員";
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

        if(!confirm("確定儲存成員資料？")) return;
        const btn = document.getElementById('btn-save-m');
        btn.innerText = "儲存中...";
        btn.disabled = true;

        try {
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ type: "saveMember", data: payload })
            });
            alert("儲存成功！");
            this.closeModal('member-modal');
            this.fetchData();
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

document.addEventListener("DOMContentLoaded", () => app.init());