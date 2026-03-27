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

  // Register API Routes for Mini App
  const apiRoutes = require('./routes/api');
  await server.register(apiRoutes, { prefix: '/api' });

  // Serve static files for the Telegram Mini App
  const path = require('path');
  await server.register(require('@fastify/static'), {
    root: path.join(__dirname, '../public'),
    prefix: '/app/',
  });
}

module.exports = buildApp;
