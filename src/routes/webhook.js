const botController = require('../controllers/botController');

async function webhookRoutes(server, options) {

  // Middleware / Pre-handler to validate the Secret Token
  const verifySecretToken = async (request, reply) => {
    const rawToken = request.headers['x-telegram-bot-api-secret-token'];
    const expectedToken = process.env.TELEGRAM_SECRET_TOKEN;

    if (!expectedToken) {
      server.log.error('TELEGRAM_SECRET_TOKEN is not configured in environment!');
      return reply.code(500).send({ error: 'Server misconfiguration' });
    }

    if (rawToken !== expectedToken) {
      server.log.warn('Unauthorized webhook payload attempted.');
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };

  /**
   * POST /webhook
   * Target endpoint for Telegram updates.
   */
  server.post('/webhook', { preHandler: verifySecretToken }, async (request, reply) => {
    // 2. Process logic asynchronously to prevent duplicate deliveries and thread blocking
    setImmediate(async () => {
      try {
        await botController.handleUpdate(server, request.body);
      } catch (err) {
        server.log.error(err, 'Error in async background update processing');
      }
    });

    // 1. Instantly return 200 OK to Telegram so it doesn't retry
    return reply.code(200).send({ ok: true });
  });

}

module.exports = webhookRoutes;
