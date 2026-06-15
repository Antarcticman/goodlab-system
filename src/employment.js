/**
 * GOODLAB — 學生聘僱模組 (Phase 5)
 * 
 * 計畫管理 + 聘僱紀錄 + 甘特圖 + Excel 匯出（僅 Admin）。
 * 資料模型：
 *   projects/{id}: { name, end_date }
 *   employments/{id}: { student_id, project_id, monthly_salary, hire_salary,
 *                       months, period, actual_monthly, remark, budget }
 */
import { db, doc, setDoc, deleteDoc } from './firebase.js';
import { generateId } from './utils.js';

export const employmentModule = {

    empView: 'list', // 'list' | 'gantt'

    // === 主渲染 ===
    renderEmployment: function() {
        const container = document.getElementById('employment-content');
        if (!container) return;

        if (this.currentRole !== 'Admin') {
            container.innerHTML = `<div style="text-align:center; padding:50px; color:var(--text-muted);">
                <i class="ph-fill ph-lock-key" style="font-size:3rem; margin-bottom:10px; display:block;"></i>
                此頁面僅限 Admin 檢視</div>`;
            return;
        }

        const projects = this.data.projects || [];
        const employments = this.data.employments || [];

        // 頁面模式切換（列表 / 甘特圖）
        const viewToggle = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
            <h2 style="margin:0; font-size:1.3rem;">學生聘僱管理</h2>
            <div style="display:flex; gap:8px;">
                <div class="filter-group">
                    <button class="btn-filter ${this.empView === 'list' ? 'active' : ''}" onclick="app.empView='list'; app.renderEmployment();">
                        <i class="ph ph-list"></i> 列表
                    </button>
                    <button class="btn-filter ${this.empView === 'gantt' ? 'active' : ''}" onclick="app.empView='gantt'; app.renderEmployment();">
                        <i class="ph ph-chart-bar-horizontal"></i> 甘特圖
                    </button>
                </div>
                <button class="btn btn-primary btn-sm" onclick="app.openProjectModal()">
                    <i class="ph ph-folder-plus"></i> 管理計畫
                </button>
                <button class="btn btn-primary btn-sm" onclick="app.openEmploymentModal()">
                    <i class="ph ph-plus"></i> 新增聘僱
                </button>
                <button class="btn btn-secondary btn-sm" onclick="app.exportEmploymentExcel()" style="color:var(--success); border-color:var(--success);">
                    <i class="ph ph-download-simple"></i> 匯出
                </button>
            </div>
        </div>`;

        if (this.empView === 'gantt') {
            container.innerHTML = viewToggle + this._renderGantt(projects, employments);
        } else {
            container.innerHTML = viewToggle + this._renderEmpList(projects, employments);
        }
    },

    // === 列表模式 ===
    _renderEmpList: function(projects, employments) {
        if (employments.length === 0) {
            return `<div style="text-align:center; padding:40px; color:var(--text-muted);">
                <i class="ph ph-folder-open" style="font-size:2rem; display:block; margin-bottom:10px;"></i>
                尚無聘僱紀錄</div>`;
        }

        const rows = employments.map(e => {
            const student = this.data.members.find(m => m.Student_ID === e.student_id);
            const project = projects.find(p => p._id === e.project_id);
            const budget = (e.hire_salary || 0) * (e.months || 0);

            return `<tr onclick="app.openEmploymentModal('${e._id}')" style="cursor:pointer;">
                <td>${student ? student.Name_Ch : e.student_id}</td>
                <td class="hide-mobile">${e.remark || '-'}</td>
                <td>${project ? project.name : '-'}</td>
                <td class="hide-mobile" style="text-align:right;">${(e.actual_monthly || 0).toLocaleString()}</td>
                <td style="text-align:right;">${(e.hire_salary || 0).toLocaleString()}</td>
                <td class="hide-mobile" style="text-align:center;">${e.months || '-'}</td>
                <td style="text-align:right;">${budget.toLocaleString()}</td>
                <td class="hide-mobile">${e.period || '-'}</td>
            </tr>`;
        }).join('');

        return `<div class="table-container"><table>
            <thead><tr>
                <th>姓名</th>
                <th class="hide-mobile">備註</th>
                <th>聘任計畫</th>
                <th class="hide-mobile" style="text-align:right;">實際月薪</th>
                <th style="text-align:right;">聘僱月薪</th>
                <th class="hide-mobile" style="text-align:center;">月數</th>
                <th style="text-align:right;">預算金額</th>
                <th class="hide-mobile">聘僱期間</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    },

    // === 甘特圖模式 ===
    _renderGantt: function(projects, employments) {
        if (employments.length === 0) {
            return `<div style="text-align:center; padding:40px; color:var(--text-muted);">
                尚無聘僱資料可繪製甘特圖</div>`;
        }

        // 推算顯示範圍：以當前月份為中心，前後各 3 個月（共 7 個月）
        const now = new Date();
        const months = [];
        for (let i = -3; i <= 3; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            months.push({
                year: d.getFullYear(),
                month: d.getMonth() + 1,
                label: `${d.getFullYear() - 1911}.${d.getMonth() + 1}`,
                key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            });
        }

        // 依學生分組
        const studentMap = {};
        employments.forEach(e => {
            if (!studentMap[e.student_id]) studentMap[e.student_id] = [];
            studentMap[e.student_id].push(e);
        });

        const colCount = months.length + 1; // +1 for name column
        const headerCells = months.map(m => `<div class="gantt-header-cell">${m.label}</div>`).join('');

        let rowsHtml = '';
        const planColors = {};
        let colorIdx = 0;
        const colorClasses = ['plan-1', 'plan-2', 'plan-3', 'plan-4'];

        Object.keys(studentMap).forEach(sid => {
            const student = this.data.members.find(m => m.Student_ID === sid);
            const name = student ? student.Name_Ch : sid;
            const emps = studentMap[sid];

            rowsHtml += `<div class="gantt-row" style="display:grid; grid-template-columns: 100px repeat(${months.length}, 1fr);">`;
            rowsHtml += `<div class="gantt-name">${name}</div>`;

            months.forEach(m => {
                // 找是否有這個月份的聘僱
                const match = emps.find(e => {
                    if (!e.period) return false;
                    // 解析 period 格式，如 "113.5-114.4"
                    const parts = e.period.split('-');
                    if (parts.length !== 2) return false;
                    const [sy, sm] = parts[0].split('.').map(Number);
                    const [ey, em] = parts[1].split('.').map(Number);
                    const startY = sy + 1911; const endY = ey + 1911;
                    const startKey = `${startY}-${String(sm).padStart(2, '0')}`;
                    const endKey = `${endY}-${String(em).padStart(2, '0')}`;
                    return m.key >= startKey && m.key <= endKey;
                });

                if (match) {
                    const project = projects.find(p => p._id === match.project_id);
                    const pName = project ? project.name : '?';
                    if (!planColors[pName]) {
                        planColors[pName] = colorClasses[colorIdx % colorClasses.length];
                        colorIdx++;
                    }
                    rowsHtml += `<div class="gantt-bar ${planColors[pName]}" title="${pName}: ${(match.hire_salary || 0).toLocaleString()}/月">${(match.hire_salary || 0).toLocaleString()}</div>`;
                } else {
                    rowsHtml += `<div></div>`;
                }
            });

            rowsHtml += `</div>`;
        });

        // 圖例
        const legendHtml = Object.keys(planColors).map(name => 
            `<span style="display:inline-flex; align-items:center; gap:4px; margin-right:12px;">
                <span class="gantt-bar ${planColors[name]}" style="width:14px; height:14px; min-height:14px; padding:0; border-radius:4px;"></span>
                <span style="font-size:0.8rem;">${name}</span>
            </span>`
        ).join('');

        return `<div class="gantt-container">
            <div style="margin-bottom:12px;">${legendHtml}</div>
            <div class="gantt-grid" style="grid-template-columns: 100px repeat(${months.length}, 1fr);">
                <div class="gantt-header-cell">姓名</div>
                ${headerCells}
                ${rowsHtml}
            </div>
        </div>`;
    },

    // === 計畫管理 Modal ===
    openProjectModal: function() {
        const projects = this.data.projects || [];
        const rows = projects.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>${p.end_date || '-'}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-secondary" style="color:var(--danger);" onclick="app.deleteProject('${p._id}')"><i class="ph ph-trash"></i></button>
                </td>
            </tr>`).join('') || `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">尚無計畫</td></tr>`;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'project-modal';
        modal.innerHTML = `
        <div class="modal-content" style="max-width:500px;">
            <div class="modal-header">
                <h3><i class="ph ph-folder-open"></i> 計畫管理</h3>
                <span class="close" onclick="app.closeModal('project-modal'); document.getElementById('project-modal')?.remove();">&times;</span>
            </div>
            <div class="modal-body">
                <table class="routine-table" style="margin-bottom:16px;">
                    <thead><tr><th>計畫名稱</th><th>結束日期</th><th style="width:60px;">操作</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <hr style="margin:16px 0;">
                <h4 style="margin-bottom:8px;">新增計畫</h4>
                <div class="form-group">
                    <label>計畫名稱</label>
                    <input type="text" id="new-project-name" placeholder="例如：中科計畫4">
                </div>
                <div class="form-group">
                    <label>結束日期</label>
                    <input type="date" id="new-project-end">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="app.closeModal('project-modal'); document.getElementById('project-modal')?.remove();">關閉</button>
                <button class="btn btn-primary" onclick="app.saveProject()">新增</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    },

    saveProject: async function() {
        const name = document.getElementById('new-project-name').value.trim();
        if (!name) { this.showNotification('請輸入計畫名稱', 'warning'); return; }
        const id = generateId('PRJ');
        try {
            await setDoc(doc(db, 'projects', id), {
                name,
                end_date: document.getElementById('new-project-end').value || null
            });
            this.closeModal('project-modal');
            document.getElementById('project-modal')?.remove();
            this.showNotification('✅ 計畫已新增', 'success');
        } catch (e) {
            this.showNotification('❌ 新增失敗: ' + e.message, 'error');
        }
    },

    deleteProject: async function(id) {
        if (!confirm('確定刪除此計畫？相關聘僱紀錄不會被刪除。')) return;
        try {
            await deleteDoc(doc(db, 'projects', id));
            this.showNotification('已刪除', 'success');
            // 重新渲染 project modal
            this.closeModal('project-modal');
            document.getElementById('project-modal')?.remove();
            this.openProjectModal();
        } catch (e) {
            this.showNotification('❌ 刪除失敗: ' + e.message, 'error');
        }
    },

    // === 聘僱紀錄 Modal ===
    openEmploymentModal: function(id) {
        const emp = id ? this.data.employments.find(e => e._id === id) : null;
        const projects = this.data.projects || [];
        const members = this.data.members.filter(m => m.Status === 'Active');

        const today = new Date().toISOString().split('T')[0];
        const projOptions = projects
            .filter(p => !p.end_date || p.end_date >= today || (emp && emp.project_id === p._id))
            .map(p => `<option value="${p._id}" ${emp && emp.project_id === p._id ? 'selected' : ''}>${p.name}</option>`)
            .join('');
        const memberOptions = members
            .map(m => `<option value="${m.Student_ID}" ${emp && emp.student_id === m.Student_ID ? 'selected' : ''}>${m.Name_Ch} (${m.Student_ID})</option>`)
            .join('');

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'employment-modal';
        modal.innerHTML = `
        <div class="modal-content" style="max-width:550px;">
            <div class="modal-header">
                <h3>${emp ? '編輯' : '新增'}聘僱紀錄</h3>
                <span class="close" onclick="app.closeModal('employment-modal'); document.getElementById('employment-modal')?.remove();">&times;</span>
            </div>
            <div class="modal-body">
                <input type="hidden" id="emp-edit-id" value="${id || ''}">
                <div class="form-group">
                    <label>學生</label>
                    <select id="emp-student" ${emp ? 'disabled' : ''}>${memberOptions}</select>
                </div>
                <div class="form-group">
                    <label>聘任計畫</label>
                    <select id="emp-project">${projOptions}</select>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label>實際月薪</label>
                        <input type="number" id="emp-actual" value="${emp ? emp.actual_monthly : ''}" placeholder="12000">
                    </div>
                    <div class="form-group">
                        <label>聘僱月薪</label>
                        <input type="number" id="emp-salary" value="${emp ? emp.hire_salary : ''}" placeholder="6000">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label>聘僱月份數</label>
                        <input type="number" id="emp-months" value="${emp ? emp.months : ''}" placeholder="4" min="1">
                    </div>
                    <div class="form-group">
                        <label>聘僱期間 (民國)</label>
                        <input type="text" id="emp-period" value="${emp ? emp.period || '' : ''}" placeholder="113.5-114.4">
                    </div>
                </div>
                <div class="form-group">
                    <label>備註</label>
                    <input type="text" id="emp-remark" value="${emp ? emp.remark || '' : ''}" placeholder="例如：碩一4000">
                </div>
            </div>
            <div class="modal-footer" style="justify-content:space-between;">
                ${emp ? `<button class="btn btn-secondary" style="color:var(--danger);" onclick="app.deleteEmployment('${id}')"><i class="ph ph-trash"></i> 刪除</button>` : '<div></div>'}
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-secondary" onclick="app.closeModal('employment-modal'); document.getElementById('employment-modal')?.remove();">取消</button>
                    <button class="btn btn-primary" onclick="app.saveEmployment()">儲存</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    },

    saveEmployment: async function() {
        const editId = document.getElementById('emp-edit-id').value;
        const id = editId || generateId('EMP');
        const studentId = document.getElementById('emp-student').value;
        if (!studentId) { this.showNotification('請選擇學生', 'warning'); return; }

        const hireSalary = parseInt(document.getElementById('emp-salary').value) || 0;
        const months = parseInt(document.getElementById('emp-months').value) || 0;

        const payload = {
            student_id: studentId,
            project_id: document.getElementById('emp-project').value,
            actual_monthly: parseInt(document.getElementById('emp-actual').value) || 0,
            hire_salary: hireSalary,
            months: months,
            budget: hireSalary * months,
            period: document.getElementById('emp-period').value.trim(),
            remark: document.getElementById('emp-remark').value.trim()
        };

        try {
            await setDoc(doc(db, 'employments', id), payload);
            this.closeModal('employment-modal');
            document.getElementById('employment-modal')?.remove();
            this.showNotification('✅ 已儲存', 'success');
        } catch (e) {
            this.showNotification('❌ 儲存失敗: ' + e.message, 'error');
        }
    },

    deleteEmployment: async function(id) {
        if (!confirm('確定刪除此聘僱紀錄？')) return;
        try {
            await deleteDoc(doc(db, 'employments', id));
            this.closeModal('employment-modal');
            document.getElementById('employment-modal')?.remove();
            this.showNotification('已刪除', 'success');
        } catch (e) {
            this.showNotification('❌ 刪除失敗: ' + e.message, 'error');
        }
    },

    // === Excel 匯出 ===
    exportEmploymentExcel: function() {
        const employments = this.data.employments || [];
        const projects = this.data.projects || [];
        if (employments.length === 0) {
            this.showNotification('沒有聘僱資料可匯出', 'warning');
            return;
        }

        const rows = employments.map(e => {
            const student = this.data.members.find(m => m.Student_ID === e.student_id);
            const project = projects.find(p => p._id === e.project_id);
            return {
                '學號': student ? student.Student_ID : e.student_id,
                '身份證字號': '', // 系統不存，留空
                '姓名': student ? student.Name_Ch : '',
                '備註': e.remark || '',
                '聘任計畫': project ? project.name : '',
                '實際月薪': e.actual_monthly || 0,
                '聘僱月薪': e.hire_salary || 0,
                '聘僱月份': e.months || 0,
                '預算金額': e.budget || 0,
                '聘僱期間': e.period || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '聘僱資料');
        XLSX.writeFile(wb, `GOODLAB_聘僱_${new Date().toISOString().split('T')[0]}.xlsx`);
        this.showNotification('✅ Excel 已匯出', 'success');
    }
};
