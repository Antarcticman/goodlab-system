const GAS_URL = "https://script.google.com/macros/s/AKfycbzBKHQn213TIdw-EDMt7FUuvZFPkHn_YWv_s6LvFziGuxFJP2_6hOlc6JBXuomwg1LJ-g/exec"; 

const app = {
    data: {
        members: [],
        instruments: [],
        logs: []
    },
    sortState: { key: 'Location', direction: 'asc' },
    logFilterStatus: 'Open',

    init: function() {
        this.fetchData();
        this.setupModalEvents();
        this.setupAutoStatus(); 
        this.setupLogAutoStatus();
        this.updateFilterUI();
    },

    fillMemberSelect: function(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const options = this.data.members
            .filter(m => m.Status === 'Active')
            .map(m => `<option value="${m.Student_ID}">${m.Name_Ch}</option>`)
            .join('');
        select.innerHTML = '<option value="">(請選擇)</option>' + options;
    },

    fetchData: async function() {
        const mGrid = document.getElementById('member-grid');
        if(mGrid) mGrid.innerHTML = '<div class="loading">資料讀取中...</div>';

        const iBody = document.getElementById('inst-tbody');
        if(iBody) iBody.innerHTML = '<tr><td colspan="6" class="loading">資料讀取中...</td></tr>';

        const lBody = document.getElementById('log-tbody');
        if(lBody) lBody.innerHTML = '<tr><td colspan="8" class="loading">資料讀取中...</td></tr>';

        try {
            const res = await fetch(`${GAS_URL}?action=getAllData`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            
            this.data.members = json.members || [];
            this.data.instruments = json.instruments || [];
            this.data.logs = json.logs || [];

            this.renderMembers();
            this.renderInstruments();
            this.renderLogs();

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
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
        
        const map = { 'members': 0, 'instruments': 1, 'logs': 2 };
        const btns = document.querySelectorAll('.nav-btn');
        if(btns[map[tabName]]) btns[map[tabName]].classList.add('active');
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
                    <span class="desktop-status status-badge ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? 'Active' : 'Stop'}
                    </span>
                    <span class="mobile-status">
                        ${isActive ? '🟢' : '🔴'}
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
        ['member-modal', 'inst-modal', 'log-modal'].forEach(id => {
            const modal = document.getElementById(id);
            if(!modal) return;
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal(id);
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ['member-modal', 'inst-modal', 'log-modal'].forEach(id => {
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