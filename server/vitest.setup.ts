// Runs before any test file (and before env.ts's own `dotenv/config` import)
// so the test suite always talks to the dedicated local test database, never
// the one .env points local dev at.
import { config } from 'dotenv';

config({ path: '.env.test', override: true });
