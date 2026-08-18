import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const required = [
  'SEED_STEWARD_PASSWORD',
  'SEED_FINANCE_PASSWORD',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
  'JWT_SECRET',
  'CORS_ORIGIN',
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`e2e missing required env ${key}. Copy backend/.env.example to backend/.env`);
  }
}
