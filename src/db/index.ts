import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import fs from 'fs';
import * as schema from './schema.ts';

const { Pool } = pkg;

// Function to create a new connection pool.
export const createPool = () => {
  let host = process.env.SQL_HOST;

  // Resilient path translation: translate workspace-specific `/app/cloudsql/` 
  // to native Cloud Run `/cloudsql/` path if `/app/cloudsql/` is not present
  if (host && host.startsWith('/app/cloudsql/')) {
    const nativeCloudRunPath = host.replace('/app/cloudsql/', '/cloudsql/');
    if (!fs.existsSync(host) && fs.existsSync(nativeCloudRunPath)) {
      console.log(`[DB-POOL] Target socket path ${host} not found. Using Cloud Run native path: ${nativeCloudRunPath}`);
      host = nativeCloudRunPath;
    } else if (!fs.existsSync(host)) {
      console.log(`[DB-POOL] Socket path ${host} does not exist. Defaulting to: ${nativeCloudRunPath}`);
      host = nativeCloudRunPath;
    }
  }

  return new Pool({
    host: host,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
  });
};

// Create a pool instance.
const pool = createPool();

// Prevent unhandled pool-level errors from crashing the application
pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });
