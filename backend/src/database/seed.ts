import { DataSource } from 'typeorm';
import { AppDataSource } from './data-source';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';

async function seed() {
  config();
  await AppDataSource.initialize();

  const users = [
    {
      email: 'steward@shankara.local',
      displayName: 'System Steward',
      role: 'steward',
      passwordKey: 'SEED_STEWARD_PASSWORD',
      companyId: null,
    },
    {
      email: 'finance@shankara.local',
      displayName: 'Finance Team',
      role: 'finance',
      passwordKey: 'SEED_FINANCE_PASSWORD',
      companyId: null,
    },
    {
      email: 'branch@shankara.local',
      displayName: 'Branch User',
      role: 'branch',
      passwordKey: 'SEED_BRANCH_PASSWORD',
      companyId: 'SHANKARA_HYD',
    },
  ];

  for (const user of users) {
    const rawPassword = process.env[user.passwordKey];
    if (!rawPassword) {
      console.warn(`Skipping seed for ${user.email} because ${user.passwordKey} is not set in .env`);
      continue;
    }

    const hash = await bcrypt.hash(rawPassword, 10);

    await AppDataSource.query(
      `
      INSERT INTO app_user (email, password_hash, display_name, role, company_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        company_id = EXCLUDED.company_id
      `,
      [user.email, hash, user.displayName, user.role, user.companyId]
    );
    console.log(`Seeded user: ${user.email}`);
  }

  await AppDataSource.destroy();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
