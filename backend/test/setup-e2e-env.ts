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

// The e2e suite writes real rows (batches, vouchers, source files) and does
// not fully clean up after itself. Because it loads backend/.env, running it
// locally would aim it straight at the working database — which is how test
// fixtures once ended up visible in the app during a live review.
//
// In CI the database is a throwaway service container, so it is allowed
// through untouched. Locally you must point it somewhere disposable:
//   createdb shankara_erp_e2e && E2E_DATABASE_NAME=shankara_erp_e2e npm run test:e2e
if (!process.env.CI) {
  const scratch = process.env.E2E_DATABASE_NAME;
  if (scratch) {
    process.env.DATABASE_NAME = scratch;
  } else if (process.env.E2E_ALLOW_MAIN_DB !== '1') {
    throw new Error(
      `Refusing to run e2e against "${process.env.DATABASE_NAME}" — this suite leaves test data behind.\n` +
        `Use a throwaway database instead:\n` +
        `  E2E_DATABASE_NAME=shankara_erp_e2e npm run test:e2e\n` +
        `(create it once with: docker exec shankara-postgres createdb -U ${process.env.DATABASE_USER} shankara_erp_e2e)\n` +
        `To override deliberately, set E2E_ALLOW_MAIN_DB=1.`,
    );
  }
}
