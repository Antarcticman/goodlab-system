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
            this.currentUser = user;
            this.checkUserRole(); // 狀態改變時，交給中控室檢查
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
            if(userInfo) userInfo.innerText = ""; // 沒登入不顯示文字
            if(btnLogin) btnLogin.classList.remove('hidden');
            if(btnLogout) btnLogout.classList.add('hidden');
            this.updateSidebarUI();
            this.switchTab('members'); // 強制待在人員頁面
            return;
        }

        // 2. 登入中但資料還沒跑完，維持安靜
        if (!this.membersLoaded) return;

        // 3. 已經登入 Google，切換按鈕
        if(btnLogin) btnLogin.classList.add('hidden');
        if(btnLogout) btnLogout.classList.remove('hidden');

        const memberData = this.data.members.find(m => m.Google_UID === this.currentUser.uid);

        if (memberData) {
            // 已綁定成功 (User / Admin)
            this.currentRole = memberData.Role || 'User';
            if(userInfo) userInfo.innerText = `👤 ${memberData.Name_Ch} (${this.currentRole})`;
            closeModal('bind-modal');
        } else {
            // 已登入但未綁定學號 ➔ 視為 Guest
            this.currentRole = 'Guest';
            if(userInfo) userInfo.innerText = `👤 ${this.currentUser.displayName} (未認證)`;
            this.switchTab('members');
            // 彈出強制綁定視窗
            const bindModal = document.getElementById('bind-modal');
            if (bindModal) bindModal.classList.remove('hidden');
        }
        this.updateSidebarUI();
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

    // === 側邊欄與手機 UI 動態控制 ===
    updateSidebarUI: function() {
        const navMap = {
            // ★ 同時抓取「電腦版 ID」與「手機版 onclick 屬性」的按鈕
            'instruments': [document.getElementById('nav-btn-instruments'), document.querySelector('.mobile-nav-item[onclick*="instruments"]')],
            'logs': [document.getElementById('nav-btn-logs'), document.querySelector('.mobile-nav-item[onclick*="logs"]')],
            'accounting': [document.getElementById('nav-btn-accounting'), document.querySelector('.mobile-nav-item[onclick*="accounting"]')],
            'inventory': [document.getElementById('nav-btn-inventory'), document.querySelector('.mobile-nav-item[onclick*="inventory"]')]
        };

        // 預設：全部物理隱藏 (display: none)
        Object.values(navMap).forEach(arr => { 
            arr.forEach(el => { if(el) el.style.display = 'none'; }); 
        });

        if (this.currentRole === 'Admin') {
            // Admin：全部按鈕解鎖
            Object.values(navMap).forEach(arr => { 
                arr.forEach(el => { if(el) el.style.display = 'flex'; }); 
            });
        } else if (this.currentRole === 'User') {
            // User：只能看到「儀器」與「產編」
            navMap['instruments'].forEach(el => { if(el) el.style.display = 'flex'; });
            navMap['inventory'].forEach(el => { if(el) el.style.display = 'flex'; });
        }
        // Guest：什麼都不做，畫面上只會剩下預設顯示的「人員管理」
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
