/**
 * GOODLAB — 實驗室 Routine 模組
 *
 * 資料模型（向下相容 interval_days）：
 * routines/{id}: {
 *   name, category, interval_value, interval_unit, interval_days,
 *   last_done, next_due, remind_days, url, notes, created_at, updated_at
 * }
 */
import { db, doc, setDoc, deleteDoc } from './firebase.js';
import { ROUTINE_CATEGORIES } from './constants.js';
import { generateId } from './utils.js';

const UNIT_LABELS = { day: '天', month: '月', year: '年' };

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getInterval(routine = {}) {
    const explicitValue = parseInt(routine.interval_value, 10);
    const explicitUnit = routine.interval_unit;
    if (explicitValue > 0 && UNIT_LABELS[explicitUnit]) {
        return { value: explicitValue, unit: explicitUnit };
    }

    const legacyDays = Math.max(1, parseInt(routine.interval_days, 10) || 30);
    if (legacyDays % 365 === 0) return { value: legacyDays / 365, unit: 'year' };
    if (legacyDays % 30 === 0) return { value: legacyDays / 30, unit: 'month' };
    return { value: legacyDays, unit: 'day' };
}

function intervalToDays(value, unit) {
    if (unit === 'year') return value * 365;
    if (unit === 'month') return value * 30;
    return value;
}

function addInterval(dateValue, routine) {
    const date = dateValue instanceof Date ? new Date(dateValue) : parseLocalDate(dateValue);
    if (!date) return '';
    const { value, unit } = getInterval(routine);

    if (unit === 'day') {
        date.setDate(date.getDate() + value);
    } else if (unit === 'month') {
        const originalDay = date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() + value);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(originalDay, lastDay));
    } else {
        const originalMonth = date.getMonth();
        const originalDay = date.getDate();
        date.setDate(1);
        date.setFullYear(date.getFullYear() + value);
        date.setMonth(originalMonth);
        const lastDay = new Date(date.getFullYear(), originalMonth + 1, 0).getDate();
        date.setDate(Math.min(originalDay, lastDay));
    }

    return toLocalDateString(date);
}

export const routineModule = {
    routineView: 'overview',

    getUpcomingRoutines: function(limit = 5) {
        return [...this.data.routines]
            .filter(routine => routine.next_due)
            .sort((a, b) => a.next_due.localeCompare(b.next_due))
            .slice(0, limit);
    },

    getRoutineIntervalLabel: function(routine) {
        const interval = getInterval(routine);
        return `${interval.value} ${UNIT_LABELS[interval.unit]}`;
    },

    renderRoutine: function() {
        const container = document.getElementById('routine-content');
        if (!container) return;

        if (this.currentRole !== 'Admin') {
            container.innerHTML = `<div class="empty-state"><i class="ph-fill ph-lock-key" aria-hidden="true"></i>此頁面僅限 Admin 檢視</div>`;
            return;
        }

        if (this.routineView === 'edit') this._renderRoutineEdit(container);
        else this._renderRoutineOverview(container);
    },

    _renderRoutineOverview: function(container) {
        const routines = this.data.routines;
        const today = toLocalDateString(new Date());
        const grouped = {};
        ROUTINE_CATEGORIES.forEach(category => { grouped[category] = []; });
        routines.forEach(routine => {
            const category = routine.category || '未分類';
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push(routine);
        });

        let html = `
            <div class="section-toolbar">
                <h2>Routine 總覽</h2>
                <button class="btn btn-primary btn-sm" onclick="app.routineView='edit'; app.renderRoutine();">
                    <i class="ph ph-pencil-simple" aria-hidden="true"></i> 編輯 Routine
                </button>
            </div>`;

        Object.entries(grouped).forEach(([category, items]) => {
            if (!items.length) return;
            items.sort((a, b) => (a.next_due || '9999-12-31').localeCompare(b.next_due || '9999-12-31'));
            html += `<div class="duty-card routine-group">
                <div class="duty-card-header"><h3>${escapeHtml(category)}</h3></div>
                <div class="table-container"><table class="routine-table">
                    <thead><tr>
                        <th class="routine-complete-column">完成</th>
                        <th>項目</th>
                        <th>週期</th>
                        <th>上次更新</th>
                        <th>下次更新</th>
                        <th>狀態</th>
                    </tr></thead><tbody>`;

            items.forEach(routine => {
                const dueDate = parseLocalDate(routine.next_due);
                const todayDate = parseLocalDate(today);
                const daysUntil = dueDate ? Math.round((dueDate - todayDate) / 86400000) : null;
                const warnDays = routine.remind_days || [7, 3, 0];
                const warningThreshold = Math.max(...warnDays, 0);
                let statusClass = 'routine-status-ok';
                let statusIcon = 'ph-check-circle';
                let statusText = '正常';

                if (daysUntil !== null && daysUntil < 0) {
                    statusClass = 'routine-status-overdue';
                    statusIcon = 'ph-warning-circle';
                    statusText = `逾期 ${Math.abs(daysUntil)} 天`;
                } else if (daysUntil === 0) {
                    statusClass = 'routine-status-warn';
                    statusIcon = 'ph-clock';
                    statusText = '今天到期';
                } else if (daysUntil !== null && daysUntil <= warningThreshold) {
                    statusClass = 'routine-status-warn';
                    statusIcon = 'ph-clock';
                    statusText = `${daysUntil} 天後`;
                }

                const safeName = escapeHtml(routine.name);
                const safeUrl = /^https?:\/\//i.test(routine.url || '') ? escapeHtml(routine.url) : '';
                const nameHtml = safeUrl
                    ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeName}</a>`
                    : this._linkifyText(safeName);

                html += `<tr>
                    <td class="routine-complete-column">
                        <input type="checkbox" aria-label="將 ${safeName} 標記為今天完成" onchange="app.completeRoutine('${routine._id}')">
                    </td>
                    <td>${nameHtml}${routine.notes ? `<div class="routine-notes">${this._linkifyText(escapeHtml(routine.notes))}</div>` : ''}</td>
                    <td>${this.getRoutineIntervalLabel(routine)}</td>
                    <td class="date-cell">${routine.last_done || '-'}</td>
                    <td class="date-cell">${routine.next_due || '-'}</td>
                    <td><span class="${statusClass}"><i class="ph ${statusIcon}" aria-hidden="true"></i> ${statusText}</span></td>
                </tr>`;
            });

            html += '</tbody></table></div></div>';
        });

        if (!routines.length) html += '<div class="empty-state"><i class="ph ph-folder-open" aria-hidden="true"></i>尚無 Routine 項目</div>';
        container.innerHTML = html;
    },

    _renderRoutineEdit: function(container) {
        const rows = [...this.data.routines]
            .sort((a, b) => (a.next_due || '9999-12-31').localeCompare(b.next_due || '9999-12-31'))
            .map(routine => `<tr>
                <td>${escapeHtml(routine.name)}</td>
                <td>${this.getRoutineIntervalLabel(routine)}</td>
                <td class="date-cell">${routine.last_done || '-'}</td>
                <td class="date-cell">${routine.next_due || '-'}</td>
                <td class="table-actions">
                    <button class="btn btn-sm btn-secondary" aria-label="編輯 ${escapeHtml(routine.name)}" onclick="app.openRoutineEditModal('${routine._id}')"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>
                    <button class="btn btn-sm btn-secondary btn-icon-danger" aria-label="刪除 ${escapeHtml(routine.name)}" onclick="app.deleteRoutineItem('${routine._id}')"><i class="ph ph-trash" aria-hidden="true"></i></button>
                </td>
            </tr>`).join('');

        container.innerHTML = `
            <div class="section-toolbar">
                <h2>Routine 編輯</h2>
                <div class="toolbar-actions">
                    <button class="btn btn-secondary btn-sm" onclick="app.routineView='overview'; app.renderRoutine();"><i class="ph ph-arrow-left" aria-hidden="true"></i> 返回總覽</button>
                    <button class="btn btn-primary btn-sm" onclick="app.openRoutineEditModal()"><i class="ph ph-plus" aria-hidden="true"></i> 新增項目</button>
                </div>
            </div>
            <div class="table-container"><table class="routine-table">
                <thead><tr><th>項目</th><th>週期</th><th>上次更新</th><th>下次更新</th><th>操作</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" class="empty">尚無項目</td></tr>'}</tbody>
            </table></div>`;
    },

    _linkifyText: function(text) {
        if (!text) return '';
        return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    },

    completeRoutine: async function(id) {
        const routine = this.data.routines.find(item => item._id === id);
        if (!routine) return;
        const today = toLocalDateString(new Date());

        try {
            await setDoc(doc(db, 'routines', id), {
                last_done: today,
                next_due: addInterval(today, routine),
                updated_at: new Date().toISOString()
            }, { merge: true });
            this.showNotification('已更新完成日期', 'success');
        } catch (error) {
            this.showNotification('更新失敗：' + error.message, 'error');
        }
    },

    openRoutineEditModal: function(id) {
        const routine = id ? this.data.routines.find(item => item._id === id) : null;
        const interval = getInterval(routine || {});
        const categoryOptions = ROUTINE_CATEGORIES.map(category =>
            `<option value="${escapeHtml(category)}" ${routine?.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`
        ).join('');

        document.getElementById('routine-edit-modal')?.remove();
        this.modalReturnFocus?.delete('routine-edit-modal');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'routine-edit-modal';
        modal.innerHTML = `
            <div class="modal-content routine-edit-dialog">
                <div class="modal-header">
                    <h3>${routine ? '編輯' : '新增'} Routine 項目</h3>
                    <span class="close" onclick="app.closeModal('routine-edit-modal')">&times;</span>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="routine-edit-id" value="${id || ''}">
                    <div class="form-group"><label for="routine-name">項目</label><input type="text" id="routine-name" value="${escapeHtml(routine?.name || '')}" required></div>
                    <div class="form-group"><label for="routine-category">分類</label><select id="routine-category">${categoryOptions}</select></div>
                    <div class="form-row-two">
                        <div class="form-group"><label for="routine-interval-value">週期</label><input type="number" id="routine-interval-value" value="${interval.value}" min="1" required></div>
                        <div class="form-group"><label for="routine-interval-unit">單位</label><select id="routine-interval-unit">
                            <option value="day" ${interval.unit === 'day' ? 'selected' : ''}>天</option>
                            <option value="month" ${interval.unit === 'month' ? 'selected' : ''}>月</option>
                            <option value="year" ${interval.unit === 'year' ? 'selected' : ''}>年</option>
                        </select></div>
                    </div>
                    <div class="form-row-two">
                        <div class="form-group"><label for="routine-last-done">上次更新日期</label><input type="date" id="routine-last-done" value="${routine?.last_done || ''}"></div>
                        <div class="form-group"><label for="routine-next-due">下次更新日期</label><input type="date" id="routine-next-due" value="${routine?.next_due || ''}"></div>
                    </div>
                    <div class="form-group"><label for="routine-remind">提前提醒天數</label><input type="text" id="routine-remind" value="${escapeHtml((routine?.remind_days || [7, 3, 0]).join(','))}" aria-describedby="routine-remind-help"><div id="routine-remind-help" class="form-help">用逗號分隔，例如 7,3,0。</div></div>
                    <div class="form-group"><label for="routine-url">相關連結（選填）</label><input type="url" id="routine-url" value="${escapeHtml(routine?.url || '')}"></div>
                    <div class="form-group"><label for="routine-notes">備註（選填）</label><textarea id="routine-notes" rows="4">${escapeHtml(routine?.notes || '')}</textarea></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="app.closeModal('routine-edit-modal')">取消</button>
                    <button class="btn btn-primary" id="btn-save-routine" onclick="app.saveRoutineItem()">儲存</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    saveRoutineItem: async function() {
        const editId = document.getElementById('routine-edit-id').value;
        const id = editId || generateId('RTN');
        const existing = editId ? this.data.routines.find(item => item._id === editId) : null;
        const name = document.getElementById('routine-name').value.trim();
        const intervalValue = Math.max(1, parseInt(document.getElementById('routine-interval-value').value, 10) || 1);
        const intervalUnit = document.getElementById('routine-interval-unit').value;
        const lastDone = document.getElementById('routine-last-done').value || null;
        let nextDue = document.getElementById('routine-next-due').value || null;
        const remindDays = document.getElementById('routine-remind').value
            .split(',').map(value => parseInt(value.trim(), 10)).filter(Number.isFinite);

        if (!name) {
            this.showNotification('請輸入項目名稱', 'warning');
            document.getElementById('routine-name').focus();
            return;
        }
        if (!nextDue && lastDone) nextDue = addInterval(lastDone, { interval_value: intervalValue, interval_unit: intervalUnit });

        const payload = {
            name,
            category: document.getElementById('routine-category').value,
            interval_value: intervalValue,
            interval_unit: intervalUnit,
            interval_days: intervalToDays(intervalValue, intervalUnit),
            last_done: lastDone,
            next_due: nextDue,
            remind_days: remindDays.length ? remindDays : [7, 3, 0],
            url: document.getElementById('routine-url').value.trim() || null,
            notes: document.getElementById('routine-notes').value.trim() || null,
            created_at: existing?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const button = document.getElementById('btn-save-routine');
        button.disabled = true;
        button.textContent = '儲存中...';
        try {
            await setDoc(doc(db, 'routines', id), payload, { merge: true });
            this.closeModal('routine-edit-modal');
            this.showNotification('已儲存', 'success');
        } catch (error) {
            this.showNotification('儲存失敗：' + error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = '儲存';
        }
    },

    deleteRoutineItem: async function(id) {
        if (!confirm('確定要刪除此 Routine 項目？')) return;
        try {
            await deleteDoc(doc(db, 'routines', id));
            this.showNotification('已刪除', 'success');
        } catch (error) {
            this.showNotification('刪除失敗：' + error.message, 'error');
        }
    }
};
