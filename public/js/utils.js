// public/js/utils.js

export function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
}

export function formatRelativeTime(dateString) {
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

export function getSkeletonHTML(count = 3) {
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

export function getIconForApp(category, type) {
    const catLower = category ? category.toLowerCase() : '';
    if (catLower.includes('makan') || catLower.includes('food')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg>`;
    if (catLower.includes('kopi') || catLower.includes('coffee')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"></path><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>`;
    if (catLower.includes('belanja') || catLower.includes('shopping')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`;
    if (catLower.includes('transport')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a2 2 0 0 0-1.6-.8H8.3a2 2 0 0 0-1.6.8L4 11l-5.16.86a1 1 0 0 0-.84.99V16h3m10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"></path></svg>`;
    if (catLower.includes('scan')) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"></path><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 17.5v-11"></path></svg>`;
    if (catLower.includes('gaji') || type === 'income') return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`;
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>`;
}

export function getWeekRange(offset) {
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

export function clearLocalStorageCache(telegramId) {
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
