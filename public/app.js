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
    }

    // Mock functionality: Render some dummy transactions if no real API exists yet
    // In the future, this should fetch from an endpoint on the Fastify server.
    renderDummyData();

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

function renderDummyData() {
    // For now, let's display some aesthetically pleasing dummy data
    document.getElementById('totalBalance').textContent = 'Rp 3.500.000';
    document.getElementById('totalIncome').textContent = 'Rp 5.000.000';
    document.getElementById('totalExpense').textContent = 'Rp 1.500.000';

    const transactionList = document.getElementById('transactionList');
    transactionList.innerHTML = `
        <div class="transaction-item">
            <div class="t-left">
                <div class="t-icon">🛒</div>
                <div class="t-info">
                    <span class="t-title">Belanja Bulanan</span>
                    <span class="t-date">Hari Ini, 10:30</span>
                </div>
            </div>
            <div class="t-amount expense">- Rp 500.000</div>
        </div>
        <div class="transaction-item">
            <div class="t-left">
                <div class="t-icon">💼</div>
                <div class="t-info">
                    <span class="t-title">Gaji Bulanan</span>
                    <span class="t-date">Kemarin, 09:00</span>
                </div>
            </div>
            <div class="t-amount income">+ Rp 5.000.000</div>
        </div>
        <div class="transaction-item">
            <div class="t-left">
                <div class="t-icon">☕️</div>
                <div class="t-info">
                    <span class="t-title">Kopi</span>
                    <span class="t-date">Kemarin, 15:45</span>
                </div>
            </div>
            <div class="t-amount expense">- Rp 35.000</div>
        </div>
    `;
}
