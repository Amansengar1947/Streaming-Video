import { buildApp } from './app.js';
import { config } from './config.js';

async function main() {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: config.port,
      host: config.host,
    });
    app.log.info(`Server running at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, closing server...`);
      await app.close();
      process.exit(0);
    });
  }
}

main();
