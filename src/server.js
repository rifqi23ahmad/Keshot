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

  try {
    await buildApp(server);

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
