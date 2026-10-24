import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8788),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  PUBLIC_APP_ORIGIN: z.string().url().default('http://localhost:5174'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  FOUNDER_EMAIL: z.string().email(),
  FOUNDER_PASSWORD: z.string().min(12),
  HERMES_ENABLED: z.enum(['true','false']).default('false').transform(v=>v==='true'),
  HERMES_BIN: z.string().default('hermes'),
  HERMES_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(180000),
  HERMES_WORKSPACE: z.string().default('./agent-workspace'),
  PUBLIC_AGENT_EXECUTION_ENABLED: z.enum(['true','false']).default('false').transform(v=>v==='true')
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const config = parsed.data;
