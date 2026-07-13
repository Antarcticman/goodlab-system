/**
 * GOODLAB — 人員管理模組
 * Phase 4：從 script.js 抽出人員管理相關邏輯。
 * 所有方法透過 mixin 混入 app 物件，因此使用 this. 存取共享狀態。
 */
import { db, doc, setDoc, updateDoc } from './firebase.js';
import { formatDateForInput, calculateGrade } from './utils.js';
import { showNotification, closeModal } from './ui.js';

export const membersModule = {

    // === 人員列表渲染 ===
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
            const statusDisplay = isAlumni
                ? '<span class="member-status is-alumni"><i class="ph ph-graduation-cap" aria-hidden="true"></i>已畢</span>'
                : this.calculateGrade(m.Enrollment_Date, m.Degree);
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

    // === 人員狀態切換 UI ===
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

    // === 人員 Modal 開啟 ===
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
                document.getElementById('Bind_Status').value = "已綁定";
                document.getElementById('btn-unbind').classList.remove('hidden');
            } else {
                document.getElementById('Bind_Status').value = "未綁定";
                document.getElementById('btn-unbind').classList.add('hidden');
            }
        } else {
            document.getElementById('m-modal-title').innerText = "新增成員";
            if (btnDel) btnDel.classList.add('hidden'); 
            document.getElementById('Student_ID').disabled = false;
            document.getElementById('Bind_Status').value = "未綁定";
            document.getElementById('btn-unbind').classList.add('hidden');
            this.setMemberStatus('Active');
            document.getElementById('Role').value = 'User';
        }
        if (modal) modal.classList.remove('hidden');
    },

    // === 解除 Google 綁定 ===
    unbindMember: async function() {
        const id = document.getElementById('Student_ID').value;
        if (!confirm("確定要解除這位成員的 Google 綁定嗎？\n他下次登入時需要重新輸入學號。")) return;
        
        try {
            await updateDoc(doc(db, "members", id), {
                Google_UID: null // 清空 UID
            });
            document.getElementById('Bind_Status').value = "未綁定";
            document.getElementById('btn-unbind').classList.add('hidden');
            this.showNotification("已成功解除綁定");
        } catch (e) {
            this.showNotification("解除失敗：" + e.message, 'error');
        }
    },

    // === 儲存人員資料 ===
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
            this.showNotification("發生錯誤：" + e.message, 'error');
        } finally {
            btn.innerText = "儲存";
            btn.disabled = false;
        }
    },

    // === 離校日期 ↔ 狀態 自動連動 ===
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
    }
};
