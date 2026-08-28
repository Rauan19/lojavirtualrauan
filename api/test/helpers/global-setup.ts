import { execSync } from 'child_process';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './env';

/**
 * Cria (se preciso) o banco de teste e aplica as migrations.
 * Roda uma vez antes de toda a suíte e2e.
 */
export default async function globalSetup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '').split('?')[0];

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const exists = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  );
  if (exists.rowCount === 0) {
    // identificador não pode ser parametrizado; dbName vem da nossa própria env
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  }
  await client.end();

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
