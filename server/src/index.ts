import { buildApp } from './app.js';
import { ensureClubSettings } from './modules/auth/auth.service.js';
import { env } from './env.js';

const app = buildApp();

await ensureClubSettings();

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    console.log(`server listening on :${env.PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
