import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  // Used once, at first boot, to seed the ClubSettings row if it doesn't exist yet.
  // Change the real password from the Settings screen afterward.
  ADMIN_INITIAL_PASSWORD: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = schema.parse(process.env);
