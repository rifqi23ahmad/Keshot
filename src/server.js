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
    // Bind to '::' to support both IPv6 and IPv4 networks on Railway's container runner
    await server.listen({ port: port, host: '::' });
    
    server.log.info(`Server is running securely on port ${port}`);

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
