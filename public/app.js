let currentView = 'dashboard';
let historyDate = new Date();

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;

// Expand to full height
tg.expand();

// Apply theme if dark
if (tg.colorScheme === 'dark') {
    document.body.classList.add('theme-dark');
}
tg.onEvent('themeChanged', function() {
    if (tg.colorScheme === 'dark') document.body.classList.add('theme-dark');
    else document.body.classList.remove('theme-dark');
});

document.addEventListener('DOMContentLoaded', () => {
    // Set User Data
    const userNameElement = document.getElementById('userName');
    const userAvatarElement = document.getElementById('userAvatar');
    
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        userNameElement.textContent = user.first_name;
        userAvatarElement.textContent = user.first_name.charAt(0).toUpperCase();
        
        // Fetch real data from server
        fetchDashboardData(user.id);
    } else {
        // Fallback or dev mode
        document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>Gagal memuat profil Telegram.</p></div>';
    }

    // MainButton Setup
    if (tg.MainButton) {
        const fallbackBtn = document.getElementById('mainButton');
        if (fallbackBtn) fallbackBtn.style.display = 'none'; // Sembunyikan tombol duplikat

        tg.MainButton.setText('Tutup Dashboard');
        tg.MainButton.show();
        tg.MainButton.onClick(() => {
            if (currentView === 'dashboard') tg.close();
            else WebAppActions.switchView('dashboard');
        });
    }

    // HTML Close button fallback
    const mainBtn = document.getElementById('mainButton');
    if (mainBtn) {
        mainBtn.addEventListener('click', () => {
            if (currentView === 'dashboard') tg.close();
            else WebAppActions.switchView('dashboard');
        });
    }
});

// Mock interactions that send data back to the bot
const WebAppActions = {
    triggerIncome: () => {
        tg.sendData(JSON.stringify({ action: 'cmd_add_income' }));
        tg.close();
    },
    triggerExpense: () => {
        tg.sendData(JSON.stringify({ action: 'cmd_add_expense' }));
        tg.close();
    },
    triggerHistory: () => {
        WebAppActions.switchView('history');
    },
    switchView: (view) => {
        if (view === currentView) return;
        const dash = document.getElementById('dashboardView');
        const hist = document.getElementById('historyView');
        
        if (view === 'history') {
            dash.style.display = 'none';
            hist.style.display = 'flex';
            currentView = 'history';
            if (tg.MainButton) {
                tg.MainButton.setText('Kembali ke Dashboard');
            } else {
                const btn = document.getElementById('mainButton');
                if (btn) btn.textContent = 'Kembali ke Dashboard';
            }
            loadHistoryData();
        } else {
            hist.style.display = 'none';
            dash.style.display = 'flex';
            currentView = 'dashboard';
            if (tg.MainButton) {
                tg.MainButton.setText('Tutup Dashboard');
            } else {
                const btn = document.getElementById('mainButton');
                if (btn) btn.textContent = 'Tutup Dashboard';
            }
        }
    },
    changeMonth: (delta) => {
        historyDate.setMonth(historyDate.getMonth() + delta);
        updateMonthDisplay();
        loadHistoryData();
    }
};

function updateMonthDisplay() {
    const now = new Date();
    const isCurrentMonth = historyDate.getMonth() === now.getMonth() && historyDate.getFullYear() === now.getFullYear();
    
    const nextBtn = document.getElementById('nextMonthBtn');
    if (nextBtn) {
        nextBtn.disabled = isCurrentMonth;
        nextBtn.style.opacity = isCurrentMonth ? '0.5' : '1';
    }
    
    const display = document.getElementById('currentMonthDisplay');
    if (display) {
        if (isCurrentMonth) {
            display.textContent = 'Bulan Ini';
        } else {
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            display.textContent = `${monthNames[historyDate.getMonth()]} ${historyDate.getFullYear()}`;
        }
    }
}

function renderHistory(data) {
    const hIn = document.getElementById('historyIncome');
    const hEx = document.getElementById('historyExpense');
    if (hIn) hIn.textContent = formatRupiah(data.monthlyIncome || 0);
    if (hEx) hEx.textContent = formatRupiah(data.monthlyExpense || 0);

    const listEl = document.getElementById('fullHistoryList');
    if (!data.transactions || data.transactions.length === 0) {
        if (listEl) listEl.innerHTML = '<div class="empty-state"><p>Belum ada transaksi di bulan ini.</p></div>';
        return;
    }

    if (listEl) {
        listEl.innerHTML = data.transactions.map(t => `
            <div class="transaction-item">
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
        `).join('');
    }
}

let currentHistoryFetchId = 0;

async function loadHistoryData() {
    const telegramId = tg.initDataUnsafe?.user?.id;
    if (!telegramId) return;

    const month = historyDate.getMonth() + 1;
    const year = historyDate.getFullYear();
    const cacheKey = `hist_${telegramId}_${year}_${month}`;
    const listEl = document.getElementById('fullHistoryList');

    // Mencegah Race Condition jika user klik bulan dengan sangat cepat
    currentHistoryFetchId++;
    const fetchId = currentHistoryFetchId;

    // Optimistic UI Caching (Zero Delay)
    const cachedStr = localStorage.getItem(cacheKey);
    if (cachedStr) {
        renderHistory(JSON.parse(cachedStr));
    } else {
        if (listEl) listEl.innerHTML = '<div class="empty-state"><p>Mensinkronisasi riwayat...</p></div>';
        const hIn = document.getElementById('historyIncome');
        const hEx = document.getElementById('historyExpense');
        if (hIn) hIn.textContent = 'Menghitung...';
        if (hEx) hEx.textContent = 'Menghitung...';
    }

    try {
        const response = await fetch(`/api/history?telegramId=${telegramId}&month=${month}&year=${year}`);
        
        // PENTING: Jika pengguna sudah pindah bulan lain saat menunggu data ini
        // Batalkan proses rendering agar tidak tertimpa data lama
        if (fetchId !== currentHistoryFetchId) return;

        if (response.status === 403) {
            if (listEl) listEl.innerHTML = '<div class="empty-state"><p>⚠️ Akses ditolak. Anda belum join grup.</p></div>';
            localStorage.removeItem(cacheKey); // Hapus memori bocor
            const hIn = document.getElementById('historyIncome');
            const hEx = document.getElementById('historyExpense');
            if (hIn) hIn.textContent = 'Rp 0';
            if (hEx) hEx.textContent = 'Rp 0';
            return;
        }
        
        const data = await response.json();
        
        if (fetchId !== currentHistoryFetchId) return;

        localStorage.setItem(cacheKey, JSON.stringify(data));
        renderHistory(data);
    } catch (e) {
        if (fetchId !== currentHistoryFetchId) return;
        console.error(e);
        if (!localStorage.getItem(cacheKey)) {
            if (listEl) listEl.innerHTML = '<div class="empty-state"><p>Gagal memuat riwayat.</p></div>';
            const hIn = document.getElementById('historyIncome');
            const hEx = document.getElementById('historyExpense');
            if (hIn) hIn.textContent = 'Rp 0';
            if (hEx) hEx.textContent = 'Rp 0';
        }
    }
}

function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
}

function getIconForApp(category, type) {
    if (type === 'income') return '💼';
    const catLower = category ? category.toLowerCase() : '';
    if (catLower.includes('makan') || catLower.includes('food')) return '🍕';
    if (catLower.includes('kopi') || catLower.includes('coffee')) return '☕️';
    if (catLower.includes('belanja') || catLower.includes('shopping')) return '🛒';
    if (catLower.includes('transport')) return '🚗';
    return type === 'income' ? '💰' : '💸';
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit' });
    
    if (diffDays === 0 && now.getDate() === date.getDate()) {
        return `Hari Ini, ${timeStr}`;
    } else if (diffDays === 1 || (diffDays === 0 && now.getDate() !== date.getDate())) {
        return `Kemarin, ${timeStr}`;
    } else {
        return `${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${timeStr}`;
    }
}

function renderDashboard(data) {
    document.getElementById('totalBalance').textContent = formatRupiah(data.totalBalance);
    document.getElementById('totalIncome').textContent = formatRupiah(data.totalIncome);
    document.getElementById('totalExpense').textContent = formatRupiah(data.totalExpense);

    const transactionList = document.getElementById('transactionList');
    
    if (!data.recentTransactions || data.recentTransactions.length === 0) {
        transactionList.innerHTML = '<div class="empty-state"><p>Belum ada transaksi.</p></div>';
        return;
    }

    transactionList.innerHTML = data.recentTransactions.map(t => `
        <div class="transaction-item">
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
    `).join('');
}

async function fetchDashboardData(telegramId) {
    const cacheKey = `dash_${telegramId}`;
    try {
        // Optimistic UI Caching (Zero Delay)
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) {
            renderDashboard(JSON.parse(cachedStr));
        } else {
            document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>Mensinkronisasi dengan server...</p></div>';
        }

        const response = await fetch(`/api/dashboard?telegramId=${telegramId}`);
        if (response.status === 403) {
            document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>⚠️ Lho kok bisa ke sini? Anda harus join grup dulu ya!</p></div>';
            localStorage.removeItem(cacheKey); // Hapus memori bocor
            document.getElementById('totalBalance').textContent = 'Rp 0';
            document.getElementById('totalIncome').textContent = 'Rp 0';
            document.getElementById('totalExpense').textContent = 'Rp 0';
            return;
        }
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        localStorage.setItem(cacheKey, JSON.stringify(data));
        renderDashboard(data);

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        if (!localStorage.getItem(cacheKey)) {
            document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>Gagal memuat data. Pastikan Anda sudah terdaftar di bot.</p></div>';
        }
    }
}
