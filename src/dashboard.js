/**
 * GOODLAB — 總覽與公告模組
 *
 * bulletins/meeting：本學期 Meeting 固定資訊
 * bulletins/{id}：一般公告
 */
import { db, doc, setDoc, deleteDoc } from './firebase.js';
import { DUTY_CLEANING_TASKS, DUTY_SUPPLY_ITEMS, DUTY_NOTES } from './constants.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);

const safeUrl = value => {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? escapeHtml(url) : '';
};

const localDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const displayDate = value => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' });
};

export const dashboardModule = {
    overviewEditorOpen: false,
    overviewNoticeEditId: null,

    _getVisibleBulletins: function() {
        const today = localDateString();
        return [...(this.data.bulletins || [])]
            .filter(item => item.published === true && (!item.expires_on || item.expires_on >= today))
            .sort((a, b) => {
                if (a.kind !== b.kind) return a.kind === 'meeting' ? -1 : 1;
                if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
                if (a.priority !== b.priority) return a.priority === 'important' ? -1 : 1;
                return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
            });
    },

    _getLatestDutyHandoff: function() {
        return [...this.data.duty_records]
            .filter(record => record.submitted && String(record.note || '').trim())
            .sort((a, b) => String(b.submitted_at || b._id || '').localeCompare(String(a.submitted_at || a._id || '')))[0] || null;
    },

    _getOverviewDutyData: function() {
        const result = typeof this._getCurrentDutyPerson === 'function' ? this._getCurrentDutyPerson() : null;
        const record = result?.record || null;
        const assignedTo = result?.assignedTo || record?.assigned_to || record?.scheduled_to || '';
        const isCurrentUser = Boolean(this.currentMember?.Student_ID && this.currentMember.Student_ID === assignedTo);
        const completedCount = record
            ? [...DUTY_CLEANING_TASKS.map(task => Boolean(record.cleaning?.[task.id])),
               ...DUTY_SUPPLY_ITEMS.map(item => Boolean(record.supplies?.[item.id]))].filter(Boolean).length
            : 0;
        const totalCount = DUTY_CLEANING_TASKS.length + DUTY_SUPPLY_ITEMS.length;

        let nextMember = null;
        if (result?.roster?.length) {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + 7);
            const nextWeekId = this._getDutyWeekId(nextDate);
            const nextRecord = this.data.duty_records.find(item => item._id === nextWeekId);
            const nextId = nextRecord?.assigned_to || nextRecord?.scheduled_to;
            nextMember = nextId
                ? result.roster.find(member => member.Student_ID === nextId)
                : this._getNextDutyMember(result.roster, result.scheduledTo || assignedTo);
        }

        return {
            result,
            record,
            assignedTo,
            isCurrentUser,
            completedCount,
            totalCount,
            nextMember,
            submitted: Boolean(record?.submitted)
        };
    },

    _getOverviewTasks: function(dutyData) {
        const tasks = [];
        const memberId = this.currentMember?.Student_ID;
        const settings = this.data.inventory.find(item => item.Property_ID === '_SETTINGS_');
        const inventoryOpen = Boolean(settings?.IsOpen);

        if (dutyData.record?.substitute_pending === memberId) {
            tasks.push({
                icon: 'ph-swap',
                title: '有一筆值日代班邀請',
                detail: '前往值日生頁面確認是否接受。',
                action: "app.switchTab('duty')",
                label: '查看邀請',
                tone: 'warning'
            });
        }

        if (dutyData.isCurrentUser && !dutyData.submitted) {
            tasks.push({
                icon: 'ph-broom',
                title: '本週由你負責值日',
                detail: `已完成 ${dutyData.completedCount}/${dutyData.totalCount} 項`,
                action: "app.switchTab('duty')",
                label: dutyData.completedCount ? '繼續處理' : '開始處理',
                tone: 'primary'
            });
        }

        if (inventoryOpen) {
            const pendingCount = this.data.inventory.filter(item =>
                item.Property_ID !== '_SETTINGS_' && item.Status !== 'Checked'
            ).length;
            tasks.push({
                icon: 'ph-list-checks',
                title: '產編清點目前開放中',
                detail: pendingCount ? `尚有 ${pendingCount} 筆未完成` : '目前項目皆已完成',
                action: "app.switchTab('inventory')",
                label: '前往清點',
                tone: pendingCount ? 'warning' : 'success'
            });
        }

        return tasks;
    },

    _renderOverviewTasks: function(tasks) {
        if (!tasks.length) return '';

        const rows = tasks.map(task => `<div class="overview-task overview-task-${task.tone}">
                <span class="overview-task-icon"><i class="ph ${task.icon}" aria-hidden="true"></i></span>
                <span class="overview-task-copy"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.detail)}</span></span>
                <button type="button" class="btn btn-secondary btn-sm" onclick="${task.action}">${escapeHtml(task.label)}</button>
            </div>`).join('');

        return `<section class="overview-panel" aria-labelledby="overview-task-heading">
            <div class="overview-panel-header"><div><h3 id="overview-task-heading">我的待辦</h3><p>只顯示與你有關的工作</p></div></div>
            <div class="overview-task-list">${rows}</div>
        </section>`;
    },

    _renderBulletins: function(isAdmin) {
        const bulletins = this._getVisibleBulletins();
        const meeting = bulletins.find(item => item.kind === 'meeting');
        const notices = bulletins.filter(item => item.kind !== 'meeting');

        const meetingHtml = meeting ? `<article class="overview-meeting">
            <span class="overview-bulletin-icon"><i class="ph ph-calendar-dots" aria-hidden="true"></i></span>
            <div class="overview-bulletin-copy">
                <div class="overview-bulletin-title"><strong>${escapeHtml(meeting.title || '本學期 Meeting')}</strong><span class="status-badge status-badge-info">固定資訊</span></div>
                <div class="overview-meeting-meta">
                    ${meeting.schedule ? `<span><i class="ph ph-clock" aria-hidden="true"></i>${escapeHtml(meeting.schedule)}</span>` : ''}
                    ${meeting.location ? `<span><i class="ph ph-map-pin" aria-hidden="true"></i>${escapeHtml(meeting.location)}</span>` : ''}
                </div>
                ${meeting.content ? `<p>${escapeHtml(meeting.content).replace(/\n/g, '<br>')}</p>` : ''}
                ${safeUrl(meeting.link_url) ? `<a class="overview-inline-link" href="${safeUrl(meeting.link_url)}" target="_blank" rel="noopener noreferrer"><i class="ph ph-arrow-square-out" aria-hidden="true"></i>${escapeHtml(meeting.link_label || '開啟 Meeting 連結')}</a>` : ''}
            </div>
        </article>` : '';

        const noticeHtml = notices.map(item => `<article class="overview-notice ${item.priority === 'important' ? 'is-important' : ''}">
            <span class="overview-bulletin-icon"><i class="ph ${item.priority === 'important' ? 'ph-warning-circle' : 'ph-megaphone'}" aria-hidden="true"></i></span>
            <div class="overview-bulletin-copy">
                <div class="overview-bulletin-title"><strong>${escapeHtml(item.title)}</strong>${item.priority === 'important' ? '<span class="status-badge status-badge-warning">重要</span>' : ''}</div>
                ${item.content ? `<p>${escapeHtml(item.content).replace(/\n/g, '<br>')}</p>` : ''}
                <div class="overview-notice-meta">
                    ${item.expires_on ? `<span>顯示至 ${displayDate(item.expires_on)}</span>` : ''}
                    ${safeUrl(item.link_url) ? `<a class="overview-inline-link" href="${safeUrl(item.link_url)}" target="_blank" rel="noopener noreferrer"><i class="ph ph-arrow-square-out" aria-hidden="true"></i>${escapeHtml(item.link_label || '開啟相關連結')}</a>` : ''}
                </div>
            </div>
        </article>`).join('');

        const emptyHtml = !meetingHtml && !noticeHtml
            ? '<div class="overview-empty-compact">目前沒有公告。</div>'
            : '';

        return `<section class="overview-panel" aria-labelledby="overview-bulletin-heading">
            <div class="overview-panel-header">
                <div><h3 id="overview-bulletin-heading">實驗室公告</h3><p>包含本學期 Meeting 與近期通知</p></div>
                ${isAdmin ? `<button type="button" class="btn btn-secondary btn-sm" onclick="app.toggleOverviewEditor()"><i class="ph ph-pencil-simple" aria-hidden="true"></i>${this.overviewEditorOpen ? '關閉編輯' : '管理公告'}</button>` : ''}
            </div>
            <div class="overview-bulletin-list">${meetingHtml}${noticeHtml}${emptyHtml}</div>
            ${isAdmin && this.overviewEditorOpen ? this._renderOverviewEditor() : ''}
        </section>`;
    },

    _renderDutySummary: function(dutyData) {
        const currentName = dutyData.result?.member?.Name_Ch || '尚未排定';
        const statusLabel = dutyData.submitted ? '本週已完成' : '尚未提交';
        const statusClass = dutyData.submitted ? 'status-badge-success' : 'status-badge-warning';
        const handoff = this._getLatestDutyHandoff();
        const handoffName = handoff ? this.getMemberName(handoff.assigned_to || handoff.scheduled_to) : '';

        return `<section class="overview-panel" aria-labelledby="overview-duty-heading">
            <div class="overview-panel-header">
                <div><h3 id="overview-duty-heading">值日資訊</h3><p>本週輪值與最近交接</p></div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.switchTab('duty')">查看工作</button>
            </div>
            <div class="overview-duty-summary">
                <div class="overview-duty-person"><span>本週值日生</span><strong>${escapeHtml(currentName)}</strong><span class="status-badge ${statusClass}">${statusLabel}</span></div>
                <div class="overview-duty-person"><span>下週預計</span><strong>${escapeHtml(dutyData.nextMember?.Name_Ch || '尚未排定')}</strong></div>
            </div>
            ${handoff ? `<div class="overview-handoff">
                <span class="overview-bulletin-icon"><i class="ph ph-note" aria-hidden="true"></i></span>
                <div><strong>最近值日交接</strong><p>${escapeHtml(handoff.note).replace(/\n/g, '<br>')}</p><span>${escapeHtml(handoffName)} · ${displayDate(handoff.week_start || handoff._id)}</span></div>
            </div>` : ''}
        </section>`;
    },

    _renderRoutineSummary: function(isAdmin) {
        const routines = typeof this.getUpcomingRoutines === 'function'
            ? this.getUpcomingRoutines(isAdmin ? 6 : 5)
            : [];
        const today = localDateString();
        const rows = routines.map(routine => {
            let stateClass = 'routine-status-ok';
            let stateText = routine.next_due || '未設定日期';
            if (routine.next_due && routine.next_due < today) {
                stateClass = 'routine-status-overdue';
                stateText = `${routine.next_due} · 已逾期`;
            } else if (routine.next_due === today) {
                stateClass = 'routine-status-warn';
                stateText = `${routine.next_due} · 今天`;
            }

            const body = `<span>${escapeHtml(routine.name)}</span><span class="${stateClass}">${escapeHtml(stateText)}</span>`;
            if (isAdmin) return `<button type="button" class="overview-routine-row" onclick="app.switchTab('routine')">${body}</button>`;
            const url = safeUrl(routine.url);
            return url
                ? `<a class="overview-routine-row" href="${url}" target="_blank" rel="noopener noreferrer">${body}</a>`
                : `<div class="overview-routine-row is-static">${body}</div>`;
        }).join('');

        return `<section class="overview-panel" aria-labelledby="overview-routine-heading">
            <div class="overview-panel-header">
                <div><h3 id="overview-routine-heading">${isAdmin ? '近期實驗室行事' : '近期行事'}</h3><p>依日期排序</p></div>
                ${isAdmin ? '<button class="btn btn-secondary btn-sm" onclick="app.switchTab(\'routine\')">查看全部</button>' : ''}
            </div>
            <div class="overview-routine-list">${rows || '<div class="overview-empty-compact">目前沒有近期事項。</div>'}</div>
        </section>`;
    },

    _renderQuickLinks: function() {
        const vendorResource = DUTY_NOTES.find(note => note.link)?.link;
        return `<section class="overview-panel" aria-labelledby="overview-links-heading">
            <div class="overview-panel-header"><div><h3 id="overview-links-heading">常用入口</h3><p>快速進入常用工作與資料</p></div></div>
            <div class="overview-shortcuts">
                <button type="button" onclick="app.openLogModal()"><i class="ph ph-warning-octagon" aria-hidden="true"></i><span><strong>回報設備問題</strong><small>新增問題回報</small></span></button>
                <button type="button" onclick="app.switchTab('duty')"><i class="ph ph-broom" aria-hidden="true"></i><span><strong>值日生工作</strong><small>清潔與耗材清點</small></span></button>
                <button type="button" onclick="app.switchTab('inventory')"><i class="ph ph-list-checks" aria-hidden="true"></i><span><strong>產編清點</strong><small>查看或進行盤點</small></span></button>
                <button type="button" onclick="app.switchTab('instruments')"><i class="ph ph-microscope" aria-hidden="true"></i><span><strong>儀器設備</strong><small>查詢儀器資料</small></span></button>
                ${vendorResource ? `<a href="${safeUrl(vendorResource.url)}" target="_blank" rel="noopener noreferrer"><i class="ph ph-address-book" aria-hidden="true"></i><span><strong>廠商聯絡資料</strong><small>${escapeHtml(vendorResource.label)}</small></span></a>` : ''}
            </div>
        </section>`;
    },

    _renderOverviewEditor: function() {
        const meeting = this.data.bulletins.find(item => item._id === 'meeting' || item.kind === 'meeting') || {};
        const editing = this.overviewNoticeEditId
            ? this.data.bulletins.find(item => item._id === this.overviewNoticeEditId) || {}
            : {};
        const notices = [...this.data.bulletins]
            .filter(item => item.kind !== 'meeting')
            .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
            .map(item => `<li>
                <div><strong>${escapeHtml(item.title || '未命名公告')}</strong><span>${item.published ? '顯示中' : '未發布'}${item.expires_on ? ` · 至 ${displayDate(item.expires_on)}` : ''}</span></div>
                <div class="toolbar-actions">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="app.editOverviewNotice('${item._id}')"><i class="ph ph-pencil-simple" aria-hidden="true"></i>編輯</button>
                    <button type="button" class="btn btn-secondary btn-sm btn-icon-danger" onclick="app.deleteOverviewNotice('${item._id}')"><i class="ph ph-trash" aria-hidden="true"></i>刪除</button>
                </div>
            </li>`).join('');

        return `<div class="overview-editor">
            <section class="overview-editor-block" aria-labelledby="meeting-editor-heading">
                <div class="overview-editor-heading"><div><h4 id="meeting-editor-heading">本學期 Meeting</h4><p>儲存後會固定顯示在公告最上方。</p></div></div>
                <div class="overview-editor-grid">
                    <div class="form-group"><label for="meeting-title">標題</label><input id="meeting-title" type="text" value="${escapeHtml(meeting.title || '本學期 Meeting')}"></div>
                    <div class="form-group"><label for="meeting-schedule">時間</label><input id="meeting-schedule" type="text" value="${escapeHtml(meeting.schedule || '')}" placeholder="例如：每週三 14:00–16:00"></div>
                    <div class="form-group"><label for="meeting-location">地點</label><input id="meeting-location" type="text" value="${escapeHtml(meeting.location || '')}" placeholder="例如：電機二館 301"></div>
                    <div class="form-group"><label for="meeting-link-url">相關連結（選填）</label><input id="meeting-link-url" type="url" value="${escapeHtml(meeting.link_url || '')}"></div>
                    <div class="form-group overview-editor-wide"><label for="meeting-content">補充說明（選填）</label><textarea id="meeting-content" rows="3">${escapeHtml(meeting.content || '')}</textarea></div>
                    <label class="overview-check overview-editor-wide"><input id="meeting-published" type="checkbox" ${meeting.published !== false ? 'checked' : ''}>顯示於一般成員總覽</label>
                </div>
                <div class="overview-editor-actions"><button type="button" class="btn btn-primary" id="btn-save-meeting" onclick="app.saveMeetingInfo()">儲存 Meeting</button></div>
            </section>

            <section class="overview-editor-block" aria-labelledby="notice-editor-heading">
                <div class="overview-editor-heading"><div><h4 id="notice-editor-heading">${this.overviewNoticeEditId ? '編輯公告' : '新增公告'}</h4><p>可設定重要、置頂與自動下架日期。</p></div></div>
                <div class="overview-editor-grid">
                    <div class="form-group overview-editor-wide"><label for="notice-title">標題</label><input id="notice-title" type="text" value="${escapeHtml(editing.title || '')}"></div>
                    <div class="form-group overview-editor-wide"><label for="notice-content">內容</label><textarea id="notice-content" rows="4">${escapeHtml(editing.content || '')}</textarea></div>
                    <div class="form-group"><label for="notice-priority">重要程度</label><select id="notice-priority"><option value="normal" ${editing.priority !== 'important' ? 'selected' : ''}>一般</option><option value="important" ${editing.priority === 'important' ? 'selected' : ''}>重要</option></select></div>
                    <div class="form-group"><label for="notice-expires">下架日期（選填）</label><input id="notice-expires" type="date" value="${escapeHtml(editing.expires_on || '')}"></div>
                    <div class="form-group"><label for="notice-link-label">連結文字（選填）</label><input id="notice-link-label" type="text" value="${escapeHtml(editing.link_label || '')}"></div>
                    <div class="form-group"><label for="notice-link-url">連結網址（選填）</label><input id="notice-link-url" type="url" value="${escapeHtml(editing.link_url || '')}"></div>
                    <label class="overview-check"><input id="notice-pinned" type="checkbox" ${editing.pinned ? 'checked' : ''}>置頂顯示</label>
                    <label class="overview-check"><input id="notice-published" type="checkbox" ${editing.published !== false ? 'checked' : ''}>發布給一般成員</label>
                </div>
                <div id="overview-notice-error" class="form-error" role="alert"></div>
                <div class="overview-editor-actions">
                    ${this.overviewNoticeEditId ? '<button type="button" class="btn btn-secondary" onclick="app.cancelOverviewNoticeEdit()">取消編輯</button>' : ''}
                    <button type="button" class="btn btn-primary" id="btn-save-notice" onclick="app.saveOverviewNotice()">${this.overviewNoticeEditId ? '更新公告' : '新增公告'}</button>
                </div>
                <ul class="overview-admin-notice-list">${notices || '<li class="overview-empty-compact">尚未建立公告。</li>'}</ul>
            </section>
        </div>`;
    },

    renderOverview: function() {
        const container = document.getElementById('overview-content');
        const greeting = document.getElementById('overview-greeting');
        if (!container || !this.currentMember) return;

        const isAdmin = this.currentRole === 'Admin';
        const dutyData = this._getOverviewDutyData();
        const tasks = this._getOverviewTasks(dutyData);

        greeting.textContent = isAdmin
            ? `${this.currentMember.Name_Ch}，以下是目前實驗室資料摘要。`
            : `${this.currentMember.Name_Ch}，這裡整理了本週資訊與需要你處理的事項。`;

        if (isAdmin) {
            const accounting = typeof this.getAccountingSummary === 'function' ? this.getAccountingSummary() : null;
            const openLogs = this.data.logs.filter(item => item.Status === 'Open').length;
            container.innerHTML = `
                <div class="overview-kpis">
                    <button class="overview-card overview-card-action" onclick="app.switchTab('accounting')">
                        <span class="overview-card-icon"><i class="ph ph-wallet" aria-hidden="true"></i></span>
                        <span class="overview-card-body"><span class="overview-card-label">帳務可用餘額</span><strong>$${(accounting?.totalBalance || 0).toLocaleString('zh-TW')}</strong><span>戶頭與現金合計</span></span>
                    </button>
                    <button class="overview-card overview-card-action" onclick="app.switchTab('logs')">
                        <span class="overview-card-icon overview-card-icon-danger"><i class="ph ph-wrench" aria-hidden="true"></i></span>
                        <span class="overview-card-body"><span class="overview-card-label">待處理維修</span><strong>${openLogs}</strong><span>查看維修紀錄</span></span>
                    </button>
                    <button class="overview-card overview-card-action" onclick="app.switchTab('duty')">
                        <span class="overview-card-icon overview-card-icon-success"><i class="ph ph-broom" aria-hidden="true"></i></span>
                        <span class="overview-card-body"><span class="overview-card-label">本週值日生</span><strong class="overview-card-name">${escapeHtml(dutyData.result?.member?.Name_Ch || '尚未排定')}</strong><span>${dutyData.submitted ? '本週已完成' : '查看本週工作'}</span></span>
                    </button>
                </div>
                ${this._renderBulletins(true)}
                <div class="overview-two-column">${this._renderRoutineSummary(true)}${this._renderDutySummary(dutyData)}</div>`;
            return;
        }

        container.innerHTML = `
            ${this._renderOverviewTasks(tasks)}
            ${this._renderBulletins(false)}
            <div class="overview-two-column">${this._renderDutySummary(dutyData)}${this._renderRoutineSummary(false)}</div>
            ${this._renderQuickLinks()}`;
    },

    toggleOverviewEditor: function() {
        if (this.currentRole !== 'Admin') return;
        this.overviewEditorOpen = !this.overviewEditorOpen;
        if (!this.overviewEditorOpen) this.overviewNoticeEditId = null;
        this.renderOverview();
    },

    editOverviewNotice: function(id) {
        if (this.currentRole !== 'Admin') return;
        this.overviewNoticeEditId = id;
        this.overviewEditorOpen = true;
        this.renderOverview();
        document.getElementById('notice-title')?.focus();
    },

    cancelOverviewNoticeEdit: function() {
        this.overviewNoticeEditId = null;
        this.renderOverview();
    },

    saveMeetingInfo: async function() {
        if (this.currentRole !== 'Admin') return;
        const button = document.getElementById('btn-save-meeting');
        const payload = {
            kind: 'meeting',
            title: document.getElementById('meeting-title')?.value.trim() || '本學期 Meeting',
            schedule: document.getElementById('meeting-schedule')?.value.trim() || '',
            location: document.getElementById('meeting-location')?.value.trim() || '',
            content: document.getElementById('meeting-content')?.value.trim() || '',
            link_url: document.getElementById('meeting-link-url')?.value.trim() || '',
            link_label: '開啟 Meeting 連結',
            published: Boolean(document.getElementById('meeting-published')?.checked),
            pinned: true,
            priority: 'normal',
            updated_at: new Date().toISOString(),
            updated_by: this.currentMember.Student_ID
        };

        if (button) { button.disabled = true; button.textContent = '儲存中…'; }
        try {
            await setDoc(doc(db, 'bulletins', 'meeting'), payload, { merge: true });
            this.showNotification('Meeting 資訊已儲存', 'success');
        } catch (error) {
            this.showNotification('Meeting 儲存失敗：' + error.message, 'error');
        } finally {
            if (button) { button.disabled = false; button.textContent = '儲存 Meeting'; }
        }
    },

    saveOverviewNotice: async function() {
        if (this.currentRole !== 'Admin') return;
        const title = document.getElementById('notice-title')?.value.trim() || '';
        const content = document.getElementById('notice-content')?.value.trim() || '';
        const errorElement = document.getElementById('overview-notice-error');
        if (!title || !content) {
            if (errorElement) errorElement.textContent = '請填寫公告標題與內容。';
            (!title ? document.getElementById('notice-title') : document.getElementById('notice-content'))?.focus();
            return;
        }

        const existing = this.overviewNoticeEditId
            ? this.data.bulletins.find(item => item._id === this.overviewNoticeEditId)
            : null;
        const id = this.overviewNoticeEditId || this.generateId('NTC');
        const button = document.getElementById('btn-save-notice');
        const payload = {
            kind: 'announcement',
            title,
            content,
            priority: document.getElementById('notice-priority')?.value || 'normal',
            expires_on: document.getElementById('notice-expires')?.value || null,
            link_label: document.getElementById('notice-link-label')?.value.trim() || '',
            link_url: document.getElementById('notice-link-url')?.value.trim() || '',
            pinned: Boolean(document.getElementById('notice-pinned')?.checked),
            published: Boolean(document.getElementById('notice-published')?.checked),
            created_at: existing?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: this.currentMember.Student_ID
        };

        if (button) { button.disabled = true; button.textContent = '儲存中…'; }
        try {
            await setDoc(doc(db, 'bulletins', id), payload, { merge: true });
            this.overviewNoticeEditId = null;
            this.showNotification(existing ? '公告已更新' : '公告已新增', 'success');
        } catch (error) {
            this.showNotification('公告儲存失敗：' + error.message, 'error');
        } finally {
            if (button) { button.disabled = false; button.textContent = existing ? '更新公告' : '新增公告'; }
        }
    },

    deleteOverviewNotice: async function(id) {
        if (this.currentRole !== 'Admin' || !confirm('確定要刪除這則公告？')) return;
        try {
            await deleteDoc(doc(db, 'bulletins', id));
            if (this.overviewNoticeEditId === id) this.overviewNoticeEditId = null;
            this.showNotification('公告已刪除', 'success');
        } catch (error) {
            this.showNotification('公告刪除失敗：' + error.message, 'error');
        }
    }
};
