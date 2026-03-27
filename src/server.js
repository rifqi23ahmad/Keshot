const Fastify = require('fastify');
const buildApp = require('./app');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

// Prisma 7 requires a driver adapter for direct DB connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function start() {
  // Trust Railway's upstream proxy so we don't drop connections / rate limit the proxy's IP
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    trustProxy: true 
  });

  // Simple Health Check Endpoint for Railway Edge
  server.get('/', async (request, reply) => {
    return { status: 'healthy', bot: 'Keshot' };
  });

  try {
    // Await app building (registering plugins, routes, etc.)
    await buildApp(server, prisma);

    // Cast port definitively to Number to avoid node bind errors
    const port = parseInt(process.env.PORT || '3000', 10);
    // Bind to 0.0.0.0 to support IPv4 routing on Railway Edge
    await server.listen({ port: port, host: '0.0.0.0' });
    
    server.log.info(`Server is running securely on port ${port}`);

    // ── Webhook startup check ─────────────────────────────────────────────
    // Hit Telegram's getWebhookInfo to confirm webhook is correctly registered.
    // A 200 response with the correct URL here means Telegram can reach us.
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const infoUrl = `https://api.telegram.org/bot${token}/getWebhookInfo`;
      const https = require('https');

      const webhookInfo = await new Promise((resolve, reject) => {
        https.get(infoUrl, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            server.log.info(`[WEBHOOK CHECK] Telegram API HTTP status: ${res.statusCode}`);
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
        }).on('error', reject);
      });

      if (webhookInfo.ok) {
        const info = webhookInfo.result;
        server.log.info(`[WEBHOOK CHECK] ✅ url: ${info.url}`);
        server.log.info(`[WEBHOOK CHECK] pending_update_count: ${info.pending_update_count}`);
        server.log.info(`[WEBHOOK CHECK] has_custom_certificate: ${info.has_custom_certificate}`);
        if (info.last_error_message) {
          server.log.warn(`[WEBHOOK CHECK] ⚠️  last_error_message: ${info.last_error_message}`);
          server.log.warn(`[WEBHOOK CHECK] last_error_date: ${new Date(info.last_error_date * 1000).toISOString()}`);
        } else {
          server.log.info('[WEBHOOK CHECK] No error reported by Telegram 🎉');
        }
        if (!info.url) {
          server.log.warn('[WEBHOOK CHECK] ⚠️  Webhook URL is EMPTY — bot will not receive updates!');
        }
      } else {
        server.log.error(`[WEBHOOK CHECK] ❌ Telegram responded not-ok: ${JSON.stringify(webhookInfo)}`);
      }
    } catch (webhookCheckErr) {
      server.log.error(webhookCheckErr, '[WEBHOOK CHECK] Failed to call getWebhookInfo');
    }
    // ─────────────────────────────────────────────────────────────────────

    // Graceful Shutdown configurations
    const gracefulShutdown = async (signal) => {
      server.log.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await server.close();
        await prisma.$disconnect();
        server.log.info('Closed server and DB connections. Exiting.');
        process.exit(0);
      } catch (err) {
        server.log.error(err, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (err) {
    server.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

start();
