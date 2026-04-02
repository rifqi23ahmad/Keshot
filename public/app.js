import { state, setState } from './js/state.js';
import { WebAppActions, fetchDashboardData } from './js/actions.js';

// Expose to window for inline HTML handlers
window.WebAppActions = WebAppActions;

// Apply theme if dark
if (state.tg.colorScheme === 'dark') {
    document.body.classList.add('theme-dark');
}

state.tg.onEvent('themeChanged', function() {
    if (state.tg.colorScheme === 'dark') document.body.classList.add('theme-dark');
    else document.body.classList.remove('theme-dark');
});

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Telegram Web App
    state.tg.ready();
    state.tg.expand();
    
    // Set User Data
    const userNameElement = document.getElementById('userName');
    const userAvatarElement = document.getElementById('userAvatar');
    
    if (state.tg.initDataUnsafe && state.tg.initDataUnsafe.user) {
        const user = state.tg.initDataUnsafe.user;
        userNameElement.textContent = user.first_name;
        userAvatarElement.textContent = user.first_name.charAt(0).toUpperCase();
        
        // Fetch real data from server
        fetchDashboardData(user.id);
    } else {
        document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>Gagal memuat profil Telegram.</p></div>';
    }

    // MainButton Setup
    if (state.tg.MainButton) {
        const fallbackBtn = document.getElementById('mainButton');
        if (fallbackBtn) fallbackBtn.style.display = 'none';

        state.tg.MainButton.setText('Tutup Dashboard');
        state.tg.MainButton.show();
        state.tg.MainButton.onClick(() => {
            if (state.currentView === 'dashboard') state.tg.close();
            else WebAppActions.switchView('dashboard');
        });
    }

    // HTML Close button fallback
    const mainBtn = document.getElementById('mainButton');
    if (mainBtn) {
        mainBtn.addEventListener('click', () => {
            if (state.currentView === 'dashboard') state.tg.close();
            else WebAppActions.switchView('dashboard');
        });
    }

    // Close modal when clicking overlay background
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) WebAppActions.closeEditModal();
        });
    }
});
