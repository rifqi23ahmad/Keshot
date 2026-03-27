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

    // Close button
    document.getElementById('mainButton').addEventListener('click', () => {
        tg.close();
    });
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
        tg.sendData(JSON.stringify({ action: 'cmd_history' }));
        tg.close();
    }
};

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

async function fetchDashboardData(telegramId) {
    try {
        const response = await fetch(`/api/dashboard?telegramId=${telegramId}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

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

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>Gagal memuat data. Pastikan Anda sudah terdaftar di bot.</p></div>';
    }
}
