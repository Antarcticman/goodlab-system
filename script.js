const GAS_URL = "https://script.google.com/macros/s/AKfycbzBKHQn213TIdw-EDMt7FUuvZFPkHn_YWv_s6LvFziGuxFJP2_6hOlc6JBXuomwg1LJ-g/exec"; 

const app = {
    members: [],

    init: function() {
        this.fetchData();
        this.setupAutoStatus();
        this.setupModalEvents();
    },

    setupModalEvents: function() {
        const modal = document.getElementById('modal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) this.closeModal();
        });
    },

    setupAutoStatus: function() {
        const leaveInput = document.getElementById('Leave_Date');
        const statusSelect = document.getElementById('Status');
        leaveInput.addEventListener('change', function() {
            if (this.value) statusSelect.value = 'Alumni';
        });
        statusSelect.addEventListener('change', function() {
            if (this.value === 'Active') leaveInput.value = '';
        });
    },

    fetchData: async function() {
        const grid = document.getElementById('member-grid');
        grid.innerHTML = '<div class="loading">資料讀取中...</div>';
        try {
            const res = await fetch(`${GAS_URL}?action=getAllData`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            this.members = json.members || [];
            this.renderMembers();
        } catch (e) {
            console.error(e);
            grid.innerHTML = `<div class="error">讀取失敗：${e.message}</div>`;
        }
    },

    renderMembers: function() {
        const grid = document.getElementById('member-grid');
        const term = document.getElementById('search-input').value.toLowerCase();
        
        const filtered = this.members.filter(m => {
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
            
            let statusDisplay = "";
            if (isAlumni) {
                // 【改動 1】判斷學位簡稱
                let degreeShort = "";
                if (m.Degree === "PhD") degreeShort = "博";
                else if (m.Degree === "Master") degreeShort = "碩";
                else if (m.Degree === "Undergrad") degreeShort = "大";
                
                // 結合年份與學位顯示
                if (m.Leave_Date && m.Leave_Date !== "-") {
                    const year = new Date(m.Leave_Date).getFullYear();
                    statusDisplay = `${year} ${degreeShort}畢 🎓`;
                } else {
                    statusDisplay = `已${degreeShort}畢 🎓`;
                }
            } else {
                statusDisplay = this.calculateGrade(m.Enrollment_Date, m.Degree);
            }

            // 【改動 2】Email 行加入後方的複製 icon (📋) 並調整結構
            return `
            <div class="card ${isAlumni ? 'alumni' : ''}" onclick="app.openModal('${m.Student_ID}')">
                <div class="card-header-row">
                    <span class="role-badge ${m.Role}">${m.Role}</span>
                    <span class="status-text ${m.Status}">${m.Status}</span>
                </div>
                <h3>${m.Name_Ch} <small>${m.Name_En} ${m.Surname_En}</small></h3>
                <div class="card-body">
                    <p><span class="icon">🆔</span> ${m.Student_ID}</p>
                    <p><span class="icon">📅</span> ${statusDisplay}</p>
                    <p><span class="icon">🏫</span> ${m.Department}</p>
                    
                    <div class="email-row" onclick="app.copyEmail(event, '${m.Email}')" title="點擊複製信箱">
                        <span class="icon start-icon">📧</span> 
                        <span class="email-text">${m.Email}</span>
                        <span class="icon copy-btn-icon">📋</span> </div>

                </div>
            </div>`;
        }).join('');
    },

    copyEmail: function(event, email) {
        event.stopPropagation();
        if (!email || email === "-") return;
        
        navigator.clipboard.writeText(email).then(() => {
            const el = event.currentTarget;
            el.classList.add('copied'); // 加入 CSS class 來做視覺回饋
            setTimeout(() => {
                el.classList.remove('copied');
            }, 1500);
        }).catch(err => {
            console.error('複製失敗', err);
            alert("複製失敗，請手動複製");
        });
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
        if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    openModal: function(id = null) {
        const modal = document.getElementById('modal');
        const inputs = document.querySelectorAll('.modal-body input, .modal-body select');
        inputs.forEach(el => el.value = '');

        if (id) {
            document.getElementById('modal-title').innerText = "編輯成員";
            const m = this.members.find(x => x.Student_ID === id);
            inputs.forEach(el => {
                if(el.id && m[el.id] !== undefined) { 
                    const val = m[el.id];
                    if (val && val !== "-") {
                        if (el.type === 'date') el.value = this.formatDateForInput(val);
                        else el.value = val;
                    }
                }
            });
            document.getElementById('Student_ID').disabled = true;
        } else {
            document.getElementById('modal-title').innerText = "新增成員";
            document.getElementById('Student_ID').disabled = false;
            document.getElementById('Status').value = 'Active';
            document.getElementById('Role').value = 'User';
        }
        modal.classList.remove('hidden');
    },

    closeModal: function() {
        document.getElementById('modal').classList.add('hidden');
    },

    saveMember: async function() {
        const id = document.getElementById('Student_ID').value;
        if (!id) { alert("請輸入學號"); return; }
        const payload = {};
        document.querySelectorAll('.modal-body input, .modal-body select').forEach(el => {
            payload[el.id] = el.value;
        });
        if(!confirm("確定儲存？")) return;
        const btn = document.getElementById('btn-save');
        btn.innerText = "儲存中...";
        btn.disabled = true;
        try {
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ type: "saveMember", data: payload })
            });
            alert("儲存成功！");
            this.closeModal();
            this.fetchData();
        } catch (e) {
            alert("錯誤: " + e.message);
        } finally {
            btn.innerText = "儲存";
            btn.disabled = false;
        }
    }
};

document.addEventListener("DOMContentLoaded", () => app.init());