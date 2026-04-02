// public/js/ui.js
import { state } from './state.js';
import { formatRupiah, formatRelativeTime, getWeekRange, getIconForApp } from './utils.js';

export function updateDateDisplay() {
    const now = new Date();
    const displayEl = document.getElementById('currentDateDisplay');
    const nextBtn = document.getElementById('nextDateBtn');

    if (state.historyMode === 'month') {
        const isCurrentMonth = state.historyDate.getMonth() === now.getMonth() && state.historyDate.getFullYear() === now.getFullYear();

        if (nextBtn) {
            nextBtn.disabled = isCurrentMonth;
            nextBtn.style.opacity = isCurrentMonth ? '0.5' : '1';
        }

        if (displayEl) {
            if (isCurrentMonth) {
                displayEl.textContent = 'Bulan Ini';
            } else {
                const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
                displayEl.textContent = `${monthNames[state.historyDate.getMonth()]} ${state.historyDate.getFullYear()}`;
            }
        }
    } else {
        // Weekly mode
        const isCurrentWeek = state.weekOffset === 0;

        if (nextBtn) {
            nextBtn.disabled = isCurrentWeek;
            nextBtn.style.opacity = isCurrentWeek ? '0.5' : '1';
        }

        if (displayEl) {
            if (isCurrentWeek) {
                displayEl.textContent = 'Minggu Ini';
            } else if (state.weekOffset === -1) {
                displayEl.textContent = 'Minggu Lalu';
            } else {
                // Calculate and show date range
                const { monday, sunday } = getWeekRange(state.weekOffset);
                const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                const fmt = (d) => `${d.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()]}`;
                displayEl.textContent = `${fmt(monday)} – ${fmt(sunday)}`;
            }
        }
    }
}

export function renderHistory(data) {
    const labelIncome = state.historyMode === 'week' ? 'income' : 'monthlyIncome';
    const labelExpense = state.historyMode === 'week' ? 'expense' : 'monthlyExpense';

    const hIn = document.getElementById('historyIncome');
    const hEx = document.getElementById('historyExpense');
    if (hIn) hIn.textContent = formatRupiah(data[labelIncome] || 0);
    if (hEx) hEx.textContent = formatRupiah(data[labelExpense] || 0);

    const listEl = document.getElementById('fullHistoryList');
    if (!data.transactions || data.transactions.length === 0) {
        if (listEl) listEl.innerHTML = '<div class="empty-state"><p>Belum ada transaksi di periode ini.</p></div>';
        return;
    }

    const now = new Date();

    if (listEl) {
        listEl.innerHTML = data.transactions.map(t => {
            const daysDiff = (now - new Date(t.created_at)) / (1000 * 60 * 60 * 24);
            const canEdit = daysDiff <= 30;

            const tStr = JSON.stringify(t).replace(/"/g, '&quot;');
            return `
            <div class="transaction-item" ${canEdit ? `onclick="WebAppActions.openEditModal(${tStr})"` : ''} style="${canEdit ? '' : 'opacity: 0.55; cursor: default;'}">
                <div class="t-left">
                    <div class="t-icon">${getIconForApp(t.category, t.type)}</div>
                    <div class="t-info">
                        <span class="t-title">${t.category || (t.type === 'income' ? 'Pemasukan' : 'Pengeluaran')}</span>
                        <span class="t-date">${t.note ? t.note + ' • ' : ''}${formatRelativeTime(t.created_at)}</span>
                    </div>
                </div>
                <div class="t-amount ${t.type}">
                    ${t.type === 'income' ? '+' : '-'} ${formatRupiah(t.amount)}
                </div>
            </div>
        `;
        }).join('');
    }
}

export function renderDashboard(data) {
    document.getElementById('totalBalance').textContent = formatRupiah(data.totalBalance);
    document.getElementById('totalIncome').textContent = formatRupiah(data.totalIncome);
    document.getElementById('totalExpense').textContent = formatRupiah(data.totalExpense);

    const transactionList = document.getElementById('transactionList');
    
    if (!data.recentTransactions || data.recentTransactions.length === 0) {
        transactionList.innerHTML = '<div class="empty-state"><p>Belum ada transaksi.</p></div>';
        return;
    }

    const now = new Date();

    transactionList.innerHTML = data.recentTransactions.map(t => {
        const daysDiff = (now - new Date(t.created_at)) / (1000 * 60 * 60 * 24);
        const canEdit = daysDiff <= 30;

        const tStr = JSON.stringify(t).replace(/"/g, '&quot;');
        return `
        <div class="transaction-item" ${canEdit ? `onclick="WebAppActions.openEditModal(${tStr})"` : ''} style="${canEdit ? '' : 'opacity: 0.55; cursor: default;'}">
            <div class="t-left">
                <div class="t-icon">${getIconForApp(t.category, t.type)}</div>
                <div class="t-info">
                    <span class="t-title">${t.category || (t.type === 'income' ? 'Pemasukan' : 'Pengeluaran')}</span>
                    <span class="t-date">${t.note ? t.note + ' • ' : ''}${formatRelativeTime(t.created_at)}</span>
                </div>
            </div>
            <div class="t-amount ${t.type}">
                ${t.type === 'income' ? '+' : '-'} ${formatRupiah(t.amount)}
            </div>
        </div>
    `;
    }).join('');
}
