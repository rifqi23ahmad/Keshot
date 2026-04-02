// public/js/actions.js
import { state, setState } from './state.js';
import { clearLocalStorageCache, getSkeletonHTML } from './utils.js';
import { fetchDashboardApi, fetchHistoryMonthApi, fetchHistoryWeekApi, updateTransactionApi, deleteTransactionApi } from './api.js';
import { renderDashboard, renderHistory, updateDateDisplay } from './ui.js';

export async function loadHistoryData() {
    const telegramId = state.tg?.initDataUnsafe?.user?.id;
    if (!telegramId) return;

    const listEl = document.getElementById('fullHistoryList');

    state.currentHistoryFetchId++;
    const fetchId = state.currentHistoryFetchId;

    let cacheKey;

    if (state.historyMode === 'month') {
        const month = state.historyDate.getMonth() + 1;
        const year = state.historyDate.getFullYear();
        cacheKey = `hist_${telegramId}_${year}_${month}`;
    } else {
        cacheKey = `hist_week_${telegramId}_${state.weekOffset}`;
    }

    // Show from cache optimistically
    const cachedStr = localStorage.getItem(cacheKey);
    if (cachedStr) {
        renderHistory(JSON.parse(cachedStr));
    } else {
        if (listEl) listEl.innerHTML = getSkeletonHTML(8);
        const hIn = document.getElementById('historyIncome');
        const hEx = document.getElementById('historyExpense');
        if (hIn) hIn.textContent = 'Menghitung...';
        if (hEx) hEx.textContent = 'Menghitung...';
    }

    try {
        let data;
        if (state.historyMode === 'month') {
            const month = state.historyDate.getMonth() + 1;
            const year = state.historyDate.getFullYear();
            data = await fetchHistoryMonthApi(telegramId, year, month);
        } else {
            data = await fetchHistoryWeekApi(telegramId, state.weekOffset);
        }

        if (fetchId !== state.currentHistoryFetchId) return;

        localStorage.setItem(cacheKey, JSON.stringify(data));
        renderHistory(data);
    } catch (e) {
        if (fetchId !== state.currentHistoryFetchId) return;
        
        if (e.message.includes('403_FORBIDDEN')) {
            if (listEl) listEl.innerHTML = '<div class="empty-state"><p>⚠️ Akses ditolak. Anda belum join grup.</p></div>';
            localStorage.removeItem(cacheKey);
            document.getElementById('historyIncome').textContent = 'Rp 0';
            document.getElementById('historyExpense').textContent = 'Rp 0';
            return;
        }

        console.error(e);
        if (!localStorage.getItem(cacheKey)) {
            if (listEl) listEl.innerHTML = '<div class="empty-state"><p>Gagal memuat riwayat.</p></div>';
            document.getElementById('historyIncome').textContent = 'Rp 0';
            document.getElementById('historyExpense').textContent = 'Rp 0';
        }
    }
}

export async function fetchDashboardData(telegramId) {
    const cacheKey = `dash_${telegramId}`;
    try {
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) {
            renderDashboard(JSON.parse(cachedStr));
        } else {
            document.getElementById('transactionList').innerHTML = getSkeletonHTML(5);
        }

        const data = await fetchDashboardApi(telegramId);
        
        localStorage.setItem(cacheKey, JSON.stringify(data));
        renderDashboard(data);

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        if (error.message.includes('403_FORBIDDEN')) {
            document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>⚠️ Lho kok bisa ke sini? Anda harus join grup dulu ya!</p></div>';
            localStorage.removeItem(cacheKey);
            document.getElementById('totalBalance').textContent = 'Rp 0';
            document.getElementById('totalIncome').textContent = 'Rp 0';
            document.getElementById('totalExpense').textContent = 'Rp 0';
            return;
        }

        if (!localStorage.getItem(cacheKey)) {
            document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>Gagal memuat data. Pastikan Anda sudah terdaftar di bot.</p></div>';
        }
    }
}

export const WebAppActions = {
    triggerIncome: () => {
        state.tg.sendData(JSON.stringify({ action: 'cmd_add_income' }));
        state.tg.close();
    },
    triggerExpense: () => {
        state.tg.sendData(JSON.stringify({ action: 'cmd_add_expense' }));
        state.tg.close();
    },
    triggerHistory: () => {
        WebAppActions.switchView('history');
    },
    switchView: (view) => {
        if (view === state.currentView) return;
        const dash = document.getElementById('dashboardView');
        const hist = document.getElementById('historyView');
        
        if (view === 'history') {
            dash.style.display = 'none';
            hist.style.display = 'flex';
            setState('currentView', 'history');
            if (state.tg.MainButton) state.tg.MainButton.setText('Kembali ke Dashboard');
            else { const btn = document.getElementById('mainButton'); if (btn) btn.textContent = 'Kembali ke Dashboard'; }
            loadHistoryData();
        } else {
            hist.style.display = 'none';
            dash.style.display = 'flex';
            setState('currentView', 'dashboard');
            if (state.tg.MainButton) state.tg.MainButton.setText('Tutup Dashboard');
            else { const btn = document.getElementById('mainButton'); if (btn) btn.textContent = 'Tutup Dashboard'; }
        }
    },

    changeDate: (delta) => {
        if (state.historyMode === 'month') {
            state.historyDate.setMonth(state.historyDate.getMonth() + delta);
        } else {
            setState('weekOffset', state.weekOffset + delta);
        }
        updateDateDisplay();
        loadHistoryData();
    },

    changeMonth: (delta) => {
        WebAppActions.changeDate(delta);
    },

    setHistoryMode: (mode) => {
        if (state.historyMode === mode) return;
        setState('historyMode', mode);

        setState('historyDate', new Date());
        setState('weekOffset', 0);

        document.getElementById('btnModeMonth')?.classList.toggle('active', mode === 'month');
        document.getElementById('btnModeWeek')?.classList.toggle('active', mode === 'week');

        updateDateDisplay();
        loadHistoryData();
    },

    openEditModal: (transaction) => {
        const daysDiff = (Date.now() - new Date(transaction.created_at)) / (1000 * 60 * 60 * 24);
        if (daysDiff > 30) {
            state.tg.showAlert('Transaksi ini sudah lebih dari 30 hari dan tidak bisa diedit.');
            return;
        }

        setState('currentEditId', transaction.id);

        document.getElementById('editType').value = transaction.type;
        document.getElementById('editAmount').value = transaction.amount;
        document.getElementById('editCategory').value = transaction.category || '';
        document.getElementById('editNote').value = transaction.note || '';

        document.getElementById('editModal').classList.add('active');
    },

    closeEditModal: () => {
        document.getElementById('editModal').classList.remove('active');
        setState('currentEditId', null);
    },

    saveEdit: async () => {
        if (!state.currentEditId) return;

        const telegramId = state.tg.initDataUnsafe?.user?.id;
        if (!telegramId) return;

        const type = document.getElementById('editType').value;
        const amount = parseFloat(document.getElementById('editAmount').value);
        const category = document.getElementById('editCategory').value.trim();
        const note = document.getElementById('editNote').value.trim();

        if (!amount || amount <= 0) {
            state.tg.showAlert('Nominal harus lebih dari 0.');
            return;
        }

        const saveBtn = document.getElementById('btnSaveEdit');
        saveBtn.textContent = 'Menyimpan...';
        saveBtn.disabled = true;

        try {
            await updateTransactionApi(state.currentEditId, telegramId, type, amount, category, note);

            clearLocalStorageCache(telegramId);
            WebAppActions.closeEditModal();

            if (state.currentView === 'history') {
                loadHistoryData();
            }
            fetchDashboardData(telegramId);

            state.tg.showAlert('✅ Transaksi berhasil diperbarui!');
        } catch (e) {
            console.error(e);
            state.tg.showAlert(e.message || 'Terjadi kesalahan koneksi.');
        } finally {
            saveBtn.textContent = 'Simpan';
            saveBtn.disabled = false;
        }
    },

    deleteTransaction: async () => {
        if (!state.currentEditId) return;

        const telegramId = state.tg.initDataUnsafe?.user?.id;
        if (!telegramId) return;

        state.tg.showConfirm('Apakah Anda yakin ingin menghapus transaksi ini?', async (confirmed) => {
            if (!confirmed) return;

            const delBtn = document.getElementById('btnDelete');
            const originalText = delBtn.textContent;
            delBtn.textContent = 'Menghapus...';
            delBtn.disabled = true;

            try {
                await deleteTransactionApi(state.currentEditId, telegramId);

                clearLocalStorageCache(telegramId);
                WebAppActions.closeEditModal();

                if (state.currentView === 'history') {
                    loadHistoryData();
                }
                fetchDashboardData(telegramId);

                if (state.tg.HapticFeedback) state.tg.HapticFeedback.notificationOccurred('success');
            } catch (e) {
                console.error(e);
                state.tg.showAlert(e.message || 'Terjadi kesalahan koneksi.');
            } finally {
                if (delBtn) {
                    delBtn.textContent = originalText;
                    delBtn.disabled = false;
                }
            }
        });
    }
};
