import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import fs from 'fs';
import * as schema from './schema.ts';

const { Pool } = pkg;

// Function to create a new connection pool.
export const createPool = () => {
  let host = process.env.SQL_HOST;
  const isCloudRun = process.env.NODE_ENV === 'production' || !fs.existsSync('/app/cloudsql');
  const defaultConnectionName = 'neat-artwork-t6rpq:europe-west2:ai-studio-6dc1df12';

  console.log(`[DB-POOL] Initial host from env: "${host}", isCloudRun: ${isCloudRun}`);

  // 1. If SQL_HOST is not provided, try to auto-discover it
  if (!host) {
    console.log(`[DB-POOL] SQL_HOST is empty. Attempting auto-discovery...`);
    
    const findSocketInDir = (baseDir: string): string | null => {
      try {
        if (fs.existsSync(baseDir)) {
          const files = fs.readdirSync(baseDir);
          const connectionDir = files.find(f => f.includes(':'));
          if (connectionDir) {
            return `${baseDir}/${connectionDir}`;
          }
        }
      } catch (e: any) {
        console.error(`[DB-POOL] Error searching in ${baseDir}:`, e.message);
      }
      return null;
    };

    let discovered = isCloudRun ? findSocketInDir('/cloudsql') : findSocketInDir('/app/cloudsql');
    if (!discovered) {
      discovered = isCloudRun ? findSocketInDir('/app/cloudsql') : findSocketInDir('/cloudsql');
    }

    if (discovered) {
      host = discovered;
      console.log(`[DB-POOL] Auto-discovered host: "${host}"`);
    }
  }

  // 2. If host is still empty, use the hardcoded fallback
  if (!host) {
    console.log(`[DB-POOL] No host found. Using hardcoded fallback connection: "${defaultConnectionName}"`);
    host = defaultConnectionName;
  }

  // 3. Format host to be a proper absolute socket path depending on what exists on disk
  const cleanName = host.includes('/') ? host.split('/').pop() : host;
  const appPath = `/app/cloudsql/${cleanName}`;
  const nativePath = `/cloudsql/${cleanName}`;

  if (fs.existsSync(appPath)) {
    host = appPath;
  } else if (fs.existsSync(nativePath)) {
    host = nativePath;
  } else {
    // Fallback: if neither exists yet, default to the directory that exists
    if (fs.existsSync('/app/cloudsql')) {
      host = appPath;
    } else {
      host = nativePath;
    }
  }

  console.log(`[DB-POOL] Final resolved host for node-postgres connection: "${host}"`);

  return new Pool({
    host: host,
    user: process.env.SQL_USER || 'ai_studio_app_user',
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME || 'cloud_sql_development_database',
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
