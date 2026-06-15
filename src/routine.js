/**
 * GOODLAB — 實驗室 Routine 模組 (Phase 5)
 * 
 * 週期性維護任務管理（僅 Admin）。
 * 資料模型：
 *   routines/{id}: { name, category, interval_days, last_done, next_due,
 *                    remind_days: [7, 3, 0], url, notes, created_at }
 */
import { db, doc, setDoc, deleteDoc } from './firebase.js';
import { ROUTINE_CATEGORIES } from './constants.js';
import { generateId } from './utils.js';

export const routineModule = {

    routineView: 'overview', // 'overview' | 'edit'

    // === 主渲染 ===
    renderRoutine: function() {
        const container = document.getElementById('routine-content');
        if (!container) return;

        if (this.currentRole !== 'Admin') {
            container.innerHTML = `<div style="text-align:center; padding:50px; color:var(--text-muted);">
                <i class="ph-fill ph-lock-key" style="font-size:3rem; margin-bottom:10px; display:block;"></i>
                此頁面僅限 Admin 檢視</div>`;
            return;
        }

        if (this.routineView === 'edit') {
            this._renderRoutineEdit(container);
        } else {
            this._renderRoutineOverview(container);
        }
    },

    // === 總覽頁 ===
    _renderRoutineOverview: function(container) {
        const routines = this.data.routines;
        const today = new Date().toISOString().split('T')[0];

        // 依分類分組
        const grouped = {};
        ROUTINE_CATEGORIES.forEach(cat => { grouped[cat] = []; });
        routines.forEach(r => {
            const cat = r.category || '未分類';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(r);
        });

        let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h2 style="margin:0; font-size:1.3rem;">Routine 總覽</h2>
            <button class="btn btn-primary btn-sm" onclick="app.routineView='edit'; app.renderRoutine();">
                <i class="ph ph-pencil-simple"></i> 編輯模式
            </button>
        </div>`;

        Object.keys(grouped).forEach(cat => {
            if (grouped[cat].length === 0) return;

            html += `<div class="duty-card">
                <div class="duty-card-header"><h3>${cat}</h3></div>
                <div class="table-container">
                <table class="routine-table">
                    <thead><tr>
                        <th style="width:40px;"></th>
                        <th>項目名稱</th>
                        <th class="hide-mobile">週期</th>
                        <th>上次完成</th>
                        <th>下次到期</th>
                        <th class="hide-mobile">狀態</th>
                    </tr></thead>
                    <tbody>`;

            grouped[cat].forEach(r => {
                const overdue = r.next_due && r.next_due <= today;
                const warnDays = r.remind_days || [7, 3, 0];
                const daysUntil = r.next_due ? Math.ceil((new Date(r.next_due) - new Date()) / 86400000) : null;
                
                let statusCls = 'routine-status-ok';
                let statusText = '✅ 正常';
                if (overdue) { statusCls = 'routine-status-overdue'; statusText = '🔴 已逾期'; }
                else if (daysUntil !== null && daysUntil <= warnDays[0]) { statusCls = 'routine-status-warn'; statusText = `⚠️ ${daysUntil} 天後`; }

                // URL 辨識
                const nameHtml = r.url 
                    ? `<a href="${r.url}" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:underline;">${r.name}</a>`
                    : this._linkifyText(r.name);

                html += `<tr>
                    <td style="text-align:center;">
                        <input type="checkbox" style="width:18px; height:18px; cursor:pointer; accent-color:var(--success);"
                            onchange="app.completeRoutine('${r._id}')" title="標記為已完成">
                    </td>
                    <td>
                        ${nameHtml}
                        ${r.notes ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px; white-space:pre-line; line-height:1.5; padding:6px 8px; background:#f8fafc; border-radius:6px; border-left:2px solid var(--border-color);">${this._linkifyText(r.notes)}</div>` : ''}
                    </td>
                    <td class="hide-mobile">每 ${r.interval_days || '-'} 天</td>
                    <td>${r.last_done || '-'}</td>
                    <td>${r.next_due || '-'}</td>
                    <td class="hide-mobile"><span class="${statusCls}">${statusText}</span></td>
                </tr>`;
            });

            html += `</tbody></table></div></div>`;
        });

        if (routines.length === 0) {
            html += `<div style="text-align:center; padding:40px; color:var(--text-muted);">
                <i class="ph ph-folder-open" style="font-size:2rem; display:block; margin-bottom:10px;"></i>
                尚無 Routine 項目，請切換到編輯模式新增</div>`;
        }

        container.innerHTML = html;
    },

    // === 編輯頁 ===
    _renderRoutineEdit: function(container) {
        const routines = this.data.routines;

        const catOptions = ROUTINE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

        let tableRows = routines.map(r => `
            <tr>
                <td>${r.name}</td>
                <td class="hide-mobile">${r.category || '-'}</td>
                <td class="hide-mobile">${r.interval_days || '-'}</td>
                <td class="hide-mobile">${(r.remind_days || [7,3,0]).join(', ')}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-secondary" onclick="app.openRoutineEditModal('${r._id}')"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn btn-sm btn-secondary" style="color:var(--danger);" onclick="app.deleteRoutineItem('${r._id}')"><i class="ph ph-trash"></i></button>
                </td>
            </tr>`).join('');

        if (routines.length === 0) {
            tableRows = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">尚無項目</td></tr>`;
        }

        container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h2 style="margin:0; font-size:1.3rem;">Routine 編輯</h2>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary btn-sm" onclick="app.routineView='overview'; app.renderRoutine();">
                    <i class="ph ph-arrow-left"></i> 返回總覽
                </button>
                <button class="btn btn-primary btn-sm" onclick="app.openRoutineEditModal()">
                    <i class="ph ph-plus"></i> 新增項目
                </button>
            </div>
        </div>
        <div class="table-container">
            <table class="routine-table">
                <thead><tr>
                    <th>項目名稱</th>
                    <th class="hide-mobile">分類</th>
                    <th class="hide-mobile">週期(天)</th>
                    <th class="hide-mobile">提醒(天前)</th>
                    <th style="width:120px; text-align:center;">操作</th>
                </tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>`;
    },

    // === URL 自動辨識 ===
    _linkifyText: function(text) {
        if (!text) return '';
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener" style="color:var(--primary);">$1</a>');
    },

    // === 打勾完成 Routine ===
    completeRoutine: async function(id) {
        const routine = this.data.routines.find(r => r._id === id);
        if (!routine) return;

        const today = new Date().toISOString().split('T')[0];
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + (routine.interval_days || 30));

        try {
            await setDoc(doc(db, 'routines', id), {
                ...routine,
                _id: undefined, // 不存 _id
                last_done: today,
                next_due: nextDue.toISOString().split('T')[0]
            }, { merge: true });
            this.showNotification('✅ 已更新完成日期', 'success');
        } catch (e) {
            this.showNotification('❌ 更新失敗: ' + e.message, 'error');
        }
    },

    // === 新增/編輯 Modal ===
    openRoutineEditModal: function(id) {
        const routine = id ? this.data.routines.find(r => r._id === id) : null;
        const catOptions = ROUTINE_CATEGORIES.map(c => 
            `<option value="${c}" ${routine && routine.category === c ? 'selected' : ''}>${c}</option>`
        ).join('');

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'routine-edit-modal';
        modal.innerHTML = `
        <div class="modal-content" style="max-width:500px;">
            <div class="modal-header">
                <h3>${routine ? '編輯' : '新增'} Routine 項目</h3>
                <span class="close" onclick="app.closeModal('routine-edit-modal'); document.getElementById('routine-edit-modal')?.remove();">&times;</span>
            </div>
            <div class="modal-body">
                <input type="hidden" id="routine-edit-id" value="${id || ''}">
                <div class="form-group">
                    <label>項目名稱</label>
                    <input type="text" id="routine-name" value="${routine ? routine.name : ''}" placeholder="例如：ALD 月維護">
                </div>
                <div class="form-group">
                    <label>分類</label>
                    <select id="routine-category">${catOptions}</select>
                </div>
                <div class="form-group">
                    <label>週期 (天)</label>
                    <input type="number" id="routine-interval" value="${routine ? routine.interval_days : 30}" min="1">
                </div>
                <div class="form-group">
                    <label>提醒 (幾天前，逗號分隔)</label>
                    <input type="text" id="routine-remind" value="${routine ? (routine.remind_days || [7,3,0]).join(',') : '7,3,0'}" placeholder="7,3,0">
                </div>
                <div class="form-group">
                    <label>相關連結 (選填)</label>
                    <input type="url" id="routine-url" value="${routine ? (routine.url || '') : ''}" placeholder="https://...">
                </div>
                <div class="form-group">
                    <label>備註 / 步驟說明 (選填)</label>
                    <textarea id="routine-notes" rows="4" placeholder="例如：\n1. 關閉 valve\n2. 擦拭腕部..." style="resize:vertical; width:100%; font-family:inherit;">${routine ? (routine.notes || '') : ''}</textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="app.closeModal('routine-edit-modal'); document.getElementById('routine-edit-modal')?.remove();">取消</button>
                <button class="btn btn-primary" onclick="app.saveRoutineItem()">儲存</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    },

    saveRoutineItem: async function() {
        const editId = document.getElementById('routine-edit-id').value;
        const id = editId || generateId('RTN');
        const name = document.getElementById('routine-name').value.trim();
        if (!name) { this.showNotification('請輸入項目名稱', 'warning'); return; }

        const existing = editId ? this.data.routines.find(r => r._id === editId) : null;
        const remindStr = document.getElementById('routine-remind').value;
        const remindDays = remindStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

        const payload = {
            name,
            category: document.getElementById('routine-category').value,
            interval_days: parseInt(document.getElementById('routine-interval').value) || 30,
            remind_days: remindDays.length > 0 ? remindDays : [7, 3, 0],
            url: document.getElementById('routine-url').value.trim() || null,
            notes: document.getElementById('routine-notes').value.trim() || null,
            last_done: existing ? existing.last_done : null,
            next_due: existing ? existing.next_due : null,
            created_at: existing ? existing.created_at : new Date().toISOString()
        };

        try {
            await setDoc(doc(db, 'routines', id), payload);
            this.closeModal('routine-edit-modal');
            document.getElementById('routine-edit-modal')?.remove();
            this.showNotification('✅ 已儲存', 'success');
        } catch (e) {
            this.showNotification('❌ 儲存失敗: ' + e.message, 'error');
        }
    },

    deleteRoutineItem: async function(id) {
        if (!confirm('確定要刪除此 Routine 項目？')) return;
        try {
            await deleteDoc(doc(db, 'routines', id));
            this.showNotification('已刪除', 'success');
        } catch (e) {
            this.showNotification('❌ 刪除失敗: ' + e.message, 'error');
        }
    }
};
