const botController = require('../controllers/botController');

async function webhookRoutes(server, options) {

  // Middleware / Pre-handler to validate the Secret Token
  const verifySecretToken = async (request, reply) => {
    const rawToken = request.headers['x-telegram-bot-api-secret-token'];
    const expectedToken = process.env.TELEGRAM_SECRET_TOKEN;

    server.log.info({
      msg: '[TRACE] verifySecretToken called',
      secretTokenEnvSet: !!expectedToken,
      headerMatches: rawToken === expectedToken,
      rawTokenLength: rawToken ? rawToken.length : 0
    });

    if (!expectedToken) {
      server.log.error('[TRACE] TELEGRAM_SECRET_TOKEN is not configured in environment!');
      return reply.code(500).send({ error: 'Server misconfiguration' });
    }

    if (rawToken !== expectedToken) {
      server.log.warn('[TRACE] Unauthorized webhook payload — token mismatch. Returning 401.');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    server.log.info('[TRACE] Secret token verified OK ✅');
  };

  /**
   * POST /webhook
   * Target endpoint for Telegram updates.
   */
  server.post('/webhook', { preHandler: verifySecretToken }, async (request, reply) => {
    server.log.info('[TRACE] Webhook handler entered — about to send 200 and dispatch async');

    // 2. Process logic asynchronously to prevent duplicate deliveries and thread blocking
    setImmediate(async () => {
      server.log.info('[TRACE] setImmediate fired — processing update');
      try {
        await botController.handleUpdate(server, request.body);
        server.log.info('[TRACE] handleUpdate completed OK');
      } catch (err) {
        server.log.error(err, '[TRACE] Error in async background update processing');
      }
    });

    // 1. Instantly return 200 OK to Telegram so it doesn't retry
    server.log.info('[TRACE] Sending 200 OK to Telegram');
    return reply.code(200).send({ ok: true });
  });

}

module.exports = webhookRoutes;
