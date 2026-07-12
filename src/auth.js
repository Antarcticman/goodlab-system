/**
 * GOODLAB — 認證與權限模組
 * Phase 4：處理 Google 登入/登出、學號綁定、角色檢查與側邊欄 UI 控制。
 */
import { auth, provider, db, doc, updateDoc, signInWithPopup, onAuthStateChanged, signOut } from './firebase.js';
import { showNotification, closeModal } from './ui.js';

export const authModule = {

    // === 登入 ===
    login: async function() {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            this.showNotification("登入失敗: " + error.message, 'error');
        }
    },

    // === 登出 ===
    logout: async function() {
        try {
            await signOut(auth);
        } catch (error) {
            this.showNotification("登出失敗", 'error');
        }
    },

    // === 監聽登入狀態 ===
    setupAuthListener: function() {
        onAuthStateChanged(auth, (user) => {
            const previousUid = this.currentUser ? this.currentUser.uid : null;
            this.currentUser = user;
            this.currentMember = null;
            this.currentRole = 'Guest';

            if (user) {
                if (previousUid !== user.uid) this.membersLoaded = false;
                this.syncRealtimeListeners('Guest');
            } else {
                this.membersLoaded = false;
                this.data.members = [];
                this.syncRealtimeListeners('Anonymous');
            }

            this.checkUserRole();
        });
    },

    // === 權限中控室 (解決非同步時間差) ===
    checkUserRole: function() {
        const userInfo = document.getElementById('user-info');
        const btnLogin = document.getElementById('btn-login');
        const btnLogout = document.getElementById('btn-logout');

        // 1. 完全沒登入 Google
        if (!this.currentUser) {
            this.currentRole = 'Guest';
            this.currentMember = null;
            if(userInfo) userInfo.innerText = "";
            if(btnLogin) btnLogin.classList.remove('hidden');
            if(btnLogout) btnLogout.classList.add('hidden');
            this.updateSidebarUI();
            this.switchTab('welcome');
            return;
        }

        // 2. 登入中但成員資料還沒跑完
        if (!this.membersLoaded) {
            if(userInfo) userInfo.innerText = "正在確認使用權限...";
            if(btnLogin) btnLogin.classList.add('hidden');
            if(btnLogout) btnLogout.classList.remove('hidden');
            return;
        }

        // 3. 已經登入 Google，切換按鈕
        if(btnLogin) btnLogin.classList.add('hidden');
        if(btnLogout) btnLogout.classList.remove('hidden');

        const memberData = this.data.members.find(m => m.Google_UID === this.currentUser.uid);

        if (memberData) {
            // 已綁定成功 (User / Admin)
            this.currentRole = memberData.Role || 'User';
            this.currentMember = memberData; // Phase 5: 儲存完整 member 資料
            const roleLabel = this.currentRole === 'Admin' ? '管理員' : '成員';
            if(userInfo) userInfo.innerText = `${memberData.Name_Ch} · ${roleLabel}`;
            closeModal('bind-modal');
            this.syncRealtimeListeners(this.currentRole);
        } else {
            // 已登入但未綁定學號 ➔ 視為 Guest
            this.currentRole = 'Guest';
            this.currentMember = null;
            if(userInfo) userInfo.innerText = `${this.currentUser.displayName || 'Google 使用者'} · 尚未綁定`;
            this.syncRealtimeListeners('Guest');
            this.switchTab('welcome');
            // 彈出強制綁定視窗
            const bindModal = document.getElementById('bind-modal');
            if (bindModal) bindModal.classList.remove('hidden');
        }
        this.updateSidebarUI();
        if (this.currentMember) {
            const activePage = document.querySelector('.page-section.active');
            const activeTab = activePage ? activePage.id.replace('page-', '') : '';
            if (!this.getAllowedTabs().includes(activeTab) || activeTab === 'welcome') this.routeFromHash();
            this.renderOverview();
        }
    },

    // === 自訂綁定視窗邏輯：取消綁定 ===
    cancelBinding: function() {
        // 使用者拒絕綁定，直接強制踢出系統
        signOut(auth).then(() => {
            closeModal('bind-modal');
            this.showNotification("已取消綁定，帳號已登出。", "info");
            // 登出後 Firebase 會自動觸發 onAuthStateChanged 變成 Guest 狀態
        }).catch(e => {
            this.showNotification("登出失敗: " + e.message, "error");
        });
    },

    // === 自訂綁定視窗邏輯：送出綁定 ===
    submitBinding: async function() {
        const studentId = document.getElementById('Bind_Input_ID').value.trim().toUpperCase();
        if (!studentId) {
            this.showNotification("請輸入學號！", "warning");
            return;
        }

        // 從資料庫找這個學號
        const member = this.data.members.find(m => m.Student_ID.toUpperCase() === studentId);

        if (!member) {
            this.showNotification("此學號不在系統名單內，請聯絡管理員建檔。", "error");
            return;
        }

        // ★ 安全檢查：此學號是否已被別的 Google 帳號綁走了？
        if (member.Google_UID && member.Google_UID !== this.currentUser.uid) {
            this.showNotification("🚫 綁定失敗：此學號已被其他 Google 帳戶使用！", "error");
            return;
        }

        try {
            const btn = document.getElementById('btn-submit-bind');
            btn.innerText = "綁定中...";
            btn.disabled = true;

            // 寫入 Google UID 完成綁定
            await updateDoc(doc(db, "members", member.Student_ID), { 
                Google_UID: this.currentUser.uid 
            });

            this.showNotification("綁定成功！權限已解鎖。", "success");
            closeModal('bind-modal');
            
            // 重新整理身分與 UI
            this.checkUserRole(); 
        } catch (e) {
            this.showNotification("寫入失敗: " + e.message, "error");
        } finally {
            document.getElementById('btn-submit-bind').disabled = false;
            document.getElementById('btn-submit-bind').innerText = "確認綁定";
        }
    },

    // === 側邊欄與手機 UI 動態控制 (Phase 5: 8 頁面) ===
    updateSidebarUI: function() {
        document.body.classList.toggle('guest-mode', this.currentRole === 'Guest');
        // 定義所有導覽按鈕 [桌面版ID, 手機版selector]
        const navIds = ['overview', 'logs', 'routine', 'duty', 'inventory', 'accounting', 'members', 'employment', 'instruments'];
        
        const navMap = {};
        navIds.forEach(id => {
            navMap[id] = [
                document.getElementById('nav-btn-' + id),
                ...document.querySelectorAll('.mobile-nav-item[onclick*="' + id + '"], .mobile-drawer-item[onclick*="' + id + '"]')
            ];
        });

        // 預設：全部物理隱藏 (display: none)
        Object.values(navMap).forEach(arr => { 
            arr.forEach(el => { if(el) el.style.display = 'none'; }); 
        });

        if (this.currentRole === 'Admin') {
            // Admin：全部解鎖
            Object.values(navMap).forEach(arr => { 
                arr.forEach(el => { if(el) el.style.display = 'flex'; }); 
            });
        } else if (this.currentRole === 'User') {
            // User：可看總覽、儀器、維修、產編、值日生與人員
            ['overview', 'instruments', 'logs', 'inventory', 'duty', 'members'].forEach(id => {
                navMap[id].forEach(el => { if(el) el.style.display = 'flex'; });
            });
        }
        // Guest：什麼都不做，畫面上只會剩下預設顯示的「人員管理」

        // 手機版「更多」按鈕永遠可見（非 Guest 時）
        const moreBtn = document.getElementById('mobile-more-btn');
        if (moreBtn) {
            moreBtn.style.display = (this.currentRole !== 'Guest') ? 'flex' : 'none';
        }
    },

    // === 頁面說明 Modal ===
    openHelpModal: function() {
        // 抓取目前 active 的 page id，例如 'page-members' -> 'members'
        const activePage = document.querySelector('.page-section.active');
        if (!activePage) return;
        
        const tabName = activePage.id.replace('page-', '');
        const content = this.helpDocs[tabName] || "<p>目前頁面暫無說明。</p>";
        
        document.getElementById('help-modal-body').innerHTML = content;
        
        // 這裡因為沒有填寫表單的需求，直接把 hidden 拿掉即可
        document.getElementById('help-modal').classList.remove('hidden');
    }
};
