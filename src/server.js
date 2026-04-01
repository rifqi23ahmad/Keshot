const Fastify = require('fastify');
const buildApp = require('./app');

async function start() {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    trustProxy: true
  });

  // Simple Health Check Endpoint for Railway
  server.get('/', async (request, reply) => {
    return { status: 'healthy', bot: 'Keshot' };
  });

  // External Cron Trigger Endpoint
  server.get('/cron/reminders', async (request, reply) => {
    // 1. Verifikasi Secret agar orang asing tidak panggil endpoint ini sembarangan
    const { secret } = request.query;
    if (secret !== process.env.CRON_SECRET) {
      server.log.warn('Unauthorized cron trigger attempt');
      return reply.code(403).send({ error: 'Unauthorized' });
    }
    
    // 2. Jalankan pengecekan secara asinkron
    const schedulerService = require('./services/schedulerService');
    setImmediate(() => schedulerService.checkAndSend(server));
    
    // 3. Langsung kirim response OK (agar layanan cron pihak ketiga tidak timeout)
    return { status: 'ok', msg: 'Reminder check triggered via external cron' };
  });

  try {
    const rotator = require('./lib/geminiKeyRotator');
    await rotator.initKeys();
    server.log.info('Gemini Key Rotator Initialized');

    await buildApp(server);
    
    // Set Bot Commands Scope to Private Chats only
    const telegramService = require('./services/telegramService');
    await telegramService.setBotCommands(server);

    // Start reminder scheduler (setelah server terkonfigurasi)
    const schedulerService = require('./services/schedulerService');
    schedulerService.start(server);
    
    // Check and announce new releases if any
    const releaseAnnouncer = require('./services/releaseAnnouncer');
    setImmediate(() => releaseAnnouncer.checkAndAnnounceRelease(server));

    const port = process.env.PORT;
    if (!port) throw new Error('PORT environment variable is not set');
    await server.listen({ port: Number(port), host: '0.0.0.0' });

    server.log.info(`Server is running on port ${port}`);

    // Graceful Shutdown
    const gracefulShutdown = async (signal) => {
      server.log.info(`Received ${signal}, shutting down...`);
      try {
        await server.close();
        server.log.info('Server closed. Exiting.');
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
    process.exit(1);
  }
}

start();
