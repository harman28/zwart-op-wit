import { buildApp } from './app.js';
import { env } from './env.js';

const app = buildApp();

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    console.log(`server listening on :${env.PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
