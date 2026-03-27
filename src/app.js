const rateLimit = require('@fastify/rate-limit');
const webhookRoutes = require('./routes/webhook');

/**
 * Builds and configures the Fastify server instance.
 * @param {import('fastify').FastifyInstance} server 
 * @param {import('@prisma/client').PrismaClient} prisma 
 */
async function buildApp(server, prisma) {
  // Decorate server with prisma to be accessible in routes/services
  server.decorate('prisma', prisma);

  // Global Error Handler
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    // Don't leak details to the caller
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  // Setup Rate Limiting Plugin
  // Rate limiting based on Telegram ID (we will extract this in a custom key generator)
  await server.register(rateLimit, {
    max: 10,
    timeWindow: '5 seconds',
    keyGenerator: (request) => {
      // Try to extract telegram_id from the incoming webhook payload 
      // This defends against abusive/spamming Telegram updates
      if (request.body && request.body.message && request.body.message.from) {
        return request.body.message.from.id.toString();
      }
      return request.ip; // Fallback to IP 
    },
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, try again later.'
      };
    }
  });

  // Register Webhook Routes
  await server.register(webhookRoutes, { prefix: '/' });

}

module.exports = buildApp;
