import { config as loadEnv } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(serverRoot, '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Configure DATABASE_URL no ambiente privado da API mobile.');

const migrationDirectory = path.join(serverRoot, 'independent/migrations');
const migrations = (await readdir(migrationDirectory))
  .filter(name => /^\d{4}-[a-z0-9-]+\.sql$/i.test(name))
  .sort();
if (migrations.length === 0) throw new Error('No independent mobile API migrations were found.');
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5000,
});
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  for (const filename of migrations) {
    await client.query(await readFile(path.join(migrationDirectory, filename), 'utf8'));
  }
  await client.query('COMMIT');
  console.log(`Applied ${migrations.length} independent mobile API migration(s).`);
} catch (error) {
  if (client) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Mobile API migration failed and rollback also failed.');
    }
  }
  throw error;
} finally {
  client?.release();
  await pool.end();
}
