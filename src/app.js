const webhookRoutes = require('./routes/webhook');

/**
 * Builds and configures the Fastify server instance.
 * Database-free minimal version.
 * @param {import('fastify').FastifyInstance} server
 */
async function buildApp(server) {
  // Global Error Handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  // Register Webhook Routes
  await server.register(webhookRoutes, { prefix: '/' });
}

module.exports = buildApp;
