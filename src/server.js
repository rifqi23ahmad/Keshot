const Fastify = require('fastify');
const buildApp = require('./app');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

let prisma;
if (Fastify.prisma) {
  prisma = Fastify.prisma;
} else {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
}
Fastify.prisma = prisma; // Attach to Fastify global to avoid connection leaks

async function start() {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      // Pino pretty is only required in dev, Railway standard out handles normal pino output well
    }
  });

  try {
    // Await app building (registering plugins, routes, etc.)
    await buildApp(server, prisma);

    const port = process.env.PORT || 3000;
    // Listen on 0.0.0.0 to work properly in environments like Railway/Docker
    await server.listen({ port, host: '0.0.0.0' });
    
    server.log.info(`Server is running on port ${port}`);

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
