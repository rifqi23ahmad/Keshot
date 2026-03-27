const botController = require('../controllers/botController');

async function webhookRoutes(server, options) {

  server.post('/webhook', async (request, reply) => {
    const updateId = request.body && request.body.update_id;
    const hasMessage = !!(request.body && request.body.message);

    server.log.info({ msg: '[WEBHOOK] Received update', update_id: updateId, has_message: hasMessage });

    // Return 200 immediately so Telegram does not retry
    reply.code(200).send({ ok: true });

    // Process asynchronously — never blocks the response
    setImmediate(async () => {
      try {
        await botController.handleUpdate(server, request.body);
      } catch (err) {
        server.log.error(err, '[WEBHOOK] Unhandled error in async processing');
      }
    });
  });

}

module.exports = webhookRoutes;
