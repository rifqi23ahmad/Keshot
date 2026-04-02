// public/js/api.js

export async function fetchDashboardApi(telegramId) {
    const response = await fetch(`/api/dashboard?telegramId=${telegramId}`);
    if (response.status === 403) {
        throw new Error('403_FORBIDDEN_DASHBOARD');
    }
    if (!response.ok) throw new Error('NETWORK_ERROR');
    return response.json();
}

export async function fetchHistoryMonthApi(telegramId, year, month) {
    const response = await fetch(`/api/history?telegramId=${telegramId}&month=${month}&year=${year}`);
    if (response.status === 403) {
        throw new Error('403_FORBIDDEN_HISTORY');
    }
    if (!response.ok) throw new Error('NETWORK_ERROR');
    return response.json();
}

export async function fetchHistoryWeekApi(telegramId, offset) {
    const response = await fetch(`/api/history/weekly?telegramId=${telegramId}&offset=${offset}`);
    if (response.status === 403) {
        throw new Error('403_FORBIDDEN_HISTORY');
    }
    if (!response.ok) throw new Error('NETWORK_ERROR');
    return response.json();
}

export async function updateTransactionApi(id, telegramId, type, amount, category, note) {
    const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId, type, amount, category, note })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan perubahan.');
    }
    return data;
}

export async function deleteTransactionApi(id, telegramId) {
    const res = await fetch(`/api/transactions/${id}?telegramId=${telegramId}`, {
        method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Gagal menghapus transaksi.');
    }
    return data;
}
