let currentView = 'dashboard';
let historyDate = new Date();

// Weekly mode state: offset 0 = minggu ini, -1 = minggu lalu, dst
let historyMode = 'month'; // 'month' | 'week'
let weekOffset = 0;

// Edit state
let currentEditId = null;

// Initialize Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();

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
        document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>Gagal memuat profil Telegram.</p></div>';
    }

    // MainButton Setup
    if (tg.MainButton) {
        const fallbackBtn = document.getElementById('mainButton');
        if (fallbackBtn) fallbackBtn.style.display = 'none';

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

    // Close modal when clicking overlay background
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) WebAppActions.closeEditModal();
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
            if (tg.MainButton) tg.MainButton.setText('Kembali ke Dashboard');
            else { const btn = document.getElementById('mainButton'); if (btn) btn.textContent = 'Kembali ke Dashboard'; }
            loadHistoryData();
        } else {
            hist.style.display = 'none';
            dash.style.display = 'flex';
            currentView = 'dashboard';
            if (tg.MainButton) tg.MainButton.setText('Tutup Dashboard');
            else { const btn = document.getElementById('mainButton'); if (btn) btn.textContent = 'Tutup Dashboard'; }
        }
    },

    // Unified date navigation (works for both monthly & weekly)
    changeDate: (delta) => {
        if (historyMode === 'month') {
            historyDate.setMonth(historyDate.getMonth() + delta);
        } else {
            weekOffset += delta;
        }
        updateDateDisplay();
        loadHistoryData();
    },

    // Old alias kept for backward compatibility (HTML might still call this)
    changeMonth: (delta) => {
        WebAppActions.changeDate(delta);
    },

    setHistoryMode: (mode) => {
        if (historyMode === mode) return;
        historyMode = mode;

        // Reset navigation states
        historyDate = new Date();
        weekOffset = 0;

        // Toggle active button style
        document.getElementById('btnModeMonth')?.classList.toggle('active', mode === 'month');
        document.getElementById('btnModeWeek')?.classList.toggle('active', mode === 'week');

        updateDateDisplay();
        loadHistoryData();
    },

    // Edit Modal Controls
    openEditModal: (transaction) => {
        const daysDiff = (Date.now() - new Date(transaction.created_at)) / (1000 * 60 * 60 * 24);
        if (daysDiff > 30) {
            tg.showAlert('Transaksi ini sudah lebih dari 30 hari dan tidak bisa diedit.');
            return;
        }

        currentEditId = transaction.id;

        document.getElementById('editType').value = transaction.type;
        document.getElementById('editAmount').value = transaction.amount;
        document.getElementById('editCategory').value = transaction.category || '';
        document.getElementById('editNote').value = transaction.note || '';

        document.getElementById('editModal').classList.add('active');
    },

    closeEditModal: () => {
        document.getElementById('editModal').classList.remove('active');
        currentEditId = null;
    },

    saveEdit: async () => {
        if (!currentEditId) return;

        const telegramId = tg.initDataUnsafe?.user?.id;
        if (!telegramId) return;

        const type = document.getElementById('editType').value;
        const amount = parseFloat(document.getElementById('editAmount').value);
        const category = document.getElementById('editCategory').value.trim();
        const note = document.getElementById('editNote').value.trim();

        if (!amount || amount <= 0) {
            tg.showAlert('Nominal harus lebih dari 0.');
            return;
        }

        const saveBtn = document.getElementById('btnSaveEdit');
        saveBtn.textContent = 'Menyimpan...';
        saveBtn.disabled = true;

        try {
            const res = await fetch(`/api/transactions/${currentEditId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId, type, amount, category, note })
            });

            const data = await res.json();

            if (!res.ok) {
                tg.showAlert(data.error || 'Gagal menyimpan perubahan.');
                return;
            }

            // Invalidate caches so data fresh saat refresh
            clearLocalStorageCache(telegramId);

            WebAppActions.closeEditModal();

            // Reload data yang tampil saat ini
            if (currentView === 'history') {
                loadHistoryData();
            }
            fetchDashboardData(telegramId);

            tg.showAlert('✅ Transaksi berhasil diperbarui!');
        } catch (e) {
            console.error(e);
            tg.showAlert('Terjadi kesalahan koneksi.');
        } finally {
            saveBtn.textContent = 'Simpan';
            saveBtn.disabled = false;
        }
    },

    deleteTransaction: async () => {
        if (!currentEditId) return;

        const telegramId = tg.initDataUnsafe?.user?.id;
        if (!telegramId) return;

        tg.showConfirm('Apakah Anda yakin ingin menghapus transaksi ini?', async (confirmed) => {
            if (!confirmed) return;

            const delBtn = document.getElementById('btnDelete');
            const originalText = delBtn.textContent;
            delBtn.textContent = 'Menghapus...';
            delBtn.disabled = true;

            try {
                const res = await fetch(`/api/transactions/${currentEditId}?telegramId=${telegramId}`, {
                    method: 'DELETE'
                });

                const data = await res.json();

                if (!res.ok) {
                    tg.showAlert(data.error || 'Gagal menghapus transaksi.');
                    return;
                }

                // Invalidate caches
                clearLocalStorageCache(telegramId);

                WebAppActions.closeEditModal();

                // Reload current view
                if (currentView === 'history') {
                    loadHistoryData();
                }
                fetchDashboardData(telegramId);

                // Small toast/notification
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            } catch (e) {
                console.error(e);
                tg.showAlert('Terjadi kesalahan koneksi.');
            } finally {
                if (delBtn) {
                    delBtn.textContent = originalText;
                    delBtn.disabled = false;
                }
            }
        });
    }
};

function clearLocalStorageCache(telegramId) {
    // Hapus semua cache terkait user ini
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(`_${telegramId}`)) keysToDelete.push(key);
    }
    // Also clear id-based keys
    keysToDelete.push(`dash_${telegramId}`);
    keysToDelete.forEach(k => localStorage.removeItem(k));
}

// ============================================================
// DATE DISPLAY
// ============================================================
function updateDateDisplay() {
    const now = new Date();
    const displayEl = document.getElementById('currentDateDisplay');
    const nextBtn = document.getElementById('nextDateBtn');

    if (historyMode === 'month') {
        const isCurrentMonth = historyDate.getMonth() === now.getMonth() && historyDate.getFullYear() === now.getFullYear();

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
                displayEl.textContent = `${monthNames[historyDate.getMonth()]} ${historyDate.getFullYear()}`;
            }
        }
    } else {
        // Weekly mode
        const isCurrentWeek = weekOffset === 0;

        if (nextBtn) {
            nextBtn.disabled = isCurrentWeek;
            nextBtn.style.opacity = isCurrentWeek ? '0.5' : '1';
        }

        if (displayEl) {
            if (isCurrentWeek) {
                displayEl.textContent = 'Minggu Ini';
            } else if (weekOffset === -1) {
                displayEl.textContent = 'Minggu Lalu';
            } else {
                // Calculate and show date range
                const { monday, sunday } = getWeekRange(weekOffset);
                const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                const fmt = (d) => `${d.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()]}`;
                displayEl.textContent = `${fmt(monday)} – ${fmt(sunday)}`;
            }
        }
    }
}

function getWeekRange(offset) {
    const now = new Date();
    const currentDay = now.getDay(); // 0=Sun..6=Sat
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);

    const targetMonday = new Date(monday.getTime() + offset * 7 * 24 * 60 * 60 * 1000);
    const sunday = new Date(targetMonday.getTime() + 6 * 24 * 60 * 60 * 1000);
    sunday.setHours(23, 59, 59, 999);
    return { monday: targetMonday, sunday };
}

// ============================================================
// RENDER HISTORY (Monthly & Weekly)
// ============================================================
function renderHistory(data) {
    const labelIncome = historyMode === 'week' ? 'income' : 'monthlyIncome';
    const labelExpense = historyMode === 'week' ? 'expense' : 'monthlyExpense';

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

            return `
            <div class="transaction-item" ${canEdit ? `onclick="WebAppActions.openEditModal(${JSON.stringify(t).replace(/"/g, '&quot;')})"` : ''} style="${canEdit ? '' : 'opacity: 0.55; cursor: default;'}">
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

let currentHistoryFetchId = 0;

async function loadHistoryData() {
    const telegramId = tg.initDataUnsafe?.user?.id;
    if (!telegramId) return;

    const listEl = document.getElementById('fullHistoryList');

    currentHistoryFetchId++;
    const fetchId = currentHistoryFetchId;

    let url;
    let cacheKey;

    if (historyMode === 'month') {
        const month = historyDate.getMonth() + 1;
        const year = historyDate.getFullYear();
        cacheKey = `hist_${telegramId}_${year}_${month}`;
        url = `/api/history?telegramId=${telegramId}&month=${month}&year=${year}`;
    } else {
        cacheKey = `hist_week_${telegramId}_${weekOffset}`;
        url = `/api/history/weekly?telegramId=${telegramId}&offset=${weekOffset}`;
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
        const response = await fetch(url);

        if (fetchId !== currentHistoryFetchId) return;

        if (response.status === 403) {
            if (listEl) listEl.innerHTML = '<div class="empty-state"><p>⚠️ Akses ditolak. Anda belum join grup.</p></div>';
            localStorage.removeItem(cacheKey);
            document.getElementById('historyIncome').textContent = 'Rp 0';
            document.getElementById('historyExpense').textContent = 'Rp 0';
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
            document.getElementById('historyIncome').textContent = 'Rp 0';
            document.getElementById('historyExpense').textContent = 'Rp 0';
        }
    }
}

// ============================================================
// FORMATTING HELPERS
// ============================================================
function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
}

function getSkeletonHTML(count = 3) {
    let html = '';
    for(let i=0; i<count; i++) {
        html += `
        <div class="transaction-item" style="pointer-events: none; border-bottom: 1px solid transparent;">
            <div class="t-left" style="width: 100%;">
                <div class="t-icon skeleton-pulse" style="background: transparent;"></div>
                <div class="t-info" style="width: 100%; gap: 8px;">
                    <div class="skeleton-pulse" style="width: 120px; max-width: 60%; height: 14px; border-radius: 4px;"></div>
                    <div class="skeleton-pulse" style="width: 80px; max-width: 40%; height: 10px; border-radius: 4px;"></div>
                </div>
            </div>
            <div class="skeleton-pulse" style="width: 100px; height: 16px; border-radius: 4px;"></div>
        </div>`;
    }
    return html;
}

function getIconForApp(category, type) {
    const catLower = category ? category.toLowerCase() : '';
    if (catLower.includes('makan') || catLower.includes('food')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg>`;
    if (catLower.includes('kopi') || catLower.includes('coffee')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"></path><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>`;
    if (catLower.includes('belanja') || catLower.includes('shopping')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`;
    if (catLower.includes('transport')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a2 2 0 0 0-1.6-.8H8.3a2 2 0 0 0-1.6.8L4 11l-5.16.86a1 1 0 0 0-.84.99V16h3m10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"></path></svg>`;
    if (catLower.includes('scan')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 17.5v-11"></path></svg>`;
    if (catLower.includes('gaji') || type === 'income') return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`;
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>`;
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

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard(data) {
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

        return `
        <div class="transaction-item" ${canEdit ? `onclick="WebAppActions.openEditModal(${JSON.stringify(t).replace(/"/g, '&quot;')})"` : ''} style="${canEdit ? '' : 'opacity: 0.55; cursor: default;'}">
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

async function fetchDashboardData(telegramId) {
    const cacheKey = `dash_${telegramId}`;
    try {
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) {
            renderDashboard(JSON.parse(cachedStr));
        } else {
            document.getElementById('transactionList').innerHTML = getSkeletonHTML(5);
        }

        const response = await fetch(`/api/dashboard?telegramId=${telegramId}`);
        if (response.status === 403) {
            document.getElementById('transactionList').innerHTML = '<div class="empty-state"><p>⚠️ Lho kok bisa ke sini? Anda harus join grup dulu ya!</p></div>';
            localStorage.removeItem(cacheKey);
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
