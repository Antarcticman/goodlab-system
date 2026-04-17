/**
 * GOODLAB v4.0 - 共用核心模組 (Shared Core Functions)
 * 負責全站統一的 UI 渲染、彈跳視窗、通知與基礎架構。
 */

export const UI = {
    /**
     * 全站統一的 Toast 通知
     * @param {string} msg - 顯示訊息
     * @param {string} type - 'info' | 'success' | 'error' | 'warning'
     */
    showToast: function(msg, type = 'info', duration = 3000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // 搭配 Phosphor Icons 顯示對應圖示
        const iconMap = {
            'success': '<i class="ph ph-check-circle"></i>',
            'error': '<i class="ph ph-warning-circle"></i>',
            'warning': '<i class="ph ph-warning"></i>',
            'info': '<i class="ph ph-info"></i>'
        };
        
        toast.innerHTML = `<div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.2rem;">${iconMap[type] || iconMap.info}</span>
            <span>${msg}</span>
        </div>`;
        
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fadeOut');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * 關閉彈跳視窗共用邏輯
     */
    closeModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    },

    /**
     * 全站統一的資料表渲染引擎
     * @param {Object} config - 表格設定物件
     * @param {string} config.containerId - 要渲染的目標 <tbody> ID
     * @param {Array} config.data - 資料陣列
     * @param {Array} config.columns - 欄位定義 [{ label, width, align, render(row) }]
     * @param {string} config.emptyMessage - 無資料時的提示文字
     * @param {Function} config.onRowClick - (可選) 點擊整列時觸發的事件
     */
    renderTable: function(config) {
        const { containerId, data, columns, emptyMessage = "查無資料", onRowClick } = config;
        const tbody = document.getElementById(containerId);
        if (!tbody) {
            console.error(`找不到表格容器: ${containerId}`);
            return;
        }

        // 處理無資料狀態
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${columns.length}" class="empty-state" style="text-align:center; padding: 30px; color: var(--text-muted);"><i class="ph ph-folder-open" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>${emptyMessage}</td></tr>`;
            return;
        }

        // 渲染資料列
        const rowsHtml = data.map((row, index) => {
            const cellsHtml = columns.map(col => {
                const alignStyle = col.align ? `text-align: ${col.align};` : '';
                const widthStyle = col.width ? `width: ${col.width};` : '';
                // ★ 新增：支援 className (用來掛載 hide-mobile)
                const classAttr = col.className ? `class="${col.className}"` : '';
                const cellContent = col.render ? col.render(row) : (row[col.key] || '-');
                return `<td style="${alignStyle} ${widthStyle}" ${classAttr}>${cellContent}</td>`;
            }).join('');

            const cursorStyle = onRowClick ? 'cursor: pointer;' : '';
            return `<tr data-index="${index}" style="${cursorStyle}">${cellsHtml}</tr>`;
        }).join('');

        tbody.innerHTML = rowsHtml;

        // 綁定點擊事件 (避免直接在 HTML 寫 onclick 導致全域變數污染)
        if (onRowClick) {
            const rows = tbody.querySelectorAll('tr[data-index]');
            rows.forEach(tr => {
                tr.addEventListener('click', (e) => {
                    // 避免點擊到按鈕時觸發整列的事件
                    if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
                    const rowIndex = tr.getAttribute('data-index');
                    onRowClick(data[rowIndex], tr);
                });
            });
        }
    },

    /**
     * 統一的彈跳視窗生成器 (自動填入標題與內容)
     * @param {Object} config - 視窗設定物件
     * @param {string} config.modalId - 模態框容器 ID
     * @param {string} config.title - 視窗標題
     * @param {Function} config.onOpen - 視窗打開後執行的回呼函式 (用於填寫表單資料)
     */
    openModal: function(config) {
        const { modalId, title, onOpen } = config;
        const modal = document.getElementById(modalId);
        if (!modal) return;

        // 設定標題
        const titleEl = modal.querySelector('.modal-header h3');
        if (titleEl && title) titleEl.innerText = title;

        // 執行外部傳入的表單重置或資料回填邏輯
        if (typeof onOpen === 'function') {
            onOpen(modal);
        }

        // 顯示視窗
        modal.classList.remove('hidden');
    }
};