require('dotenv').config();

const { TELEGRAM_BOT_TOKEN, WEBHOOK_URL, TELEGRAM_SECRET_TOKEN } = process.env;

if (!TELEGRAM_BOT_TOKEN || !WEBHOOK_URL || !TELEGRAM_SECRET_TOKEN) {
  console.error("❌ Missing required environment variables in .env file.");
  console.error("Please ensure TELEGRAM_BOT_TOKEN, WEBHOOK_URL, and TELEGRAM_SECRET_TOKEN are set.");
  process.exit(1);
}

const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

let safeWebhookUrl = WEBHOOK_URL;
if (!safeWebhookUrl.startsWith('http')) {
  safeWebhookUrl = `https://${safeWebhookUrl}`;
}

// Ensure we don't double append /webhook
let baseUrl = safeWebhookUrl;
if (baseUrl.endsWith('/webhook')) {
  baseUrl = baseUrl.slice(0, -8); // remove '/webhook'
}
if (baseUrl.endsWith('/')) {
  baseUrl = baseUrl.slice(0, -1); // remove trailing slash
}

const webhookEndpoint = `${baseUrl}/webhook`;

async function setupWebhook() {
  console.log(`📡 Setting webhook to: ${webhookEndpoint}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookEndpoint,
        secret_token: TELEGRAM_SECRET_TOKEN,
        drop_pending_updates: true // Good practice when restarting with a new webhook
      })
    });

    const data = await response.json();

    if (data.ok) {
      console.log('✅ Webhook successfully configured!');
      console.log(data.description);
    } else {
      console.error('❌ Failed to set webhook:');
      console.error(data);
    }
  } catch (error) {
    console.error('❌ Network error while setting webhook:');
    console.error(error.message);
  }
}

setupWebhook();
