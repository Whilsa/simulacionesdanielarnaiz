import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import fs from 'fs';
import * as schema from './schema.ts';

const { Pool } = pkg;

// Function to create a new connection pool.
export const createPool = () => {
  let host = process.env.SQL_HOST;
  const isCloudRun = !fs.existsSync('/app/cloudsql');

  console.log(`[DB-POOL] Initial host from env: "${host}", isCloudRun: ${isCloudRun}`);

  // Fallback: If host is undefined or empty, try to auto-discover it
  if (!host) {
    console.log(`[DB-POOL] SQL_HOST is empty. Attempting auto-discovery...`);
    
    const findSocketInDir = (baseDir: string): string | null => {
      try {
        if (fs.existsSync(baseDir)) {
          const files = fs.readdirSync(baseDir);
          // Look for a directory or file that contains ':' (standard Cloud SQL connection name format)
          const connectionDir = files.find(f => f.includes(':'));
          if (connectionDir) {
            const resolvedPath = `${baseDir}/${connectionDir}`;
            console.log(`[DB-POOL] Auto-discovered connection socket path in ${baseDir}: "${resolvedPath}"`);
            return resolvedPath;
          }
        }
      } catch (e: any) {
        console.error(`[DB-POOL] Error searching in ${baseDir}:`, e.message);
      }
      return null;
    };

    // Try /cloudsql first if on Cloud Run, otherwise try /app/cloudsql first
    let discovered = isCloudRun ? findSocketInDir('/cloudsql') : findSocketInDir('/app/cloudsql');
    if (!discovered) {
      discovered = isCloudRun ? findSocketInDir('/app/cloudsql') : findSocketInDir('/cloudsql');
    }

    if (discovered) {
      host = discovered;
    }
  }

  // Format host path appropriately based on environment
  if (host) {
    if (isCloudRun) {
      // On Cloud Run (production), force using native /cloudsql/ socket path
      if (host.startsWith('/app/cloudsql/')) {
        host = host.replace('/app/cloudsql/', '/cloudsql/');
      } else if (!host.startsWith('/cloudsql/') && host.includes(':')) {
        host = `/cloudsql/${host}`;
      }
    } else {
      // In development workspace, use /app/cloudsql/ or fallback to /cloudsql/
      if (host.startsWith('/cloudsql/')) {
        const workspacePath = host.replace('/cloudsql/', '/app/cloudsql/');
        if (fs.existsSync(workspacePath)) {
          host = workspacePath;
        }
      } else if (host.startsWith('/app/cloudsql/')) {
        const nativeCloudRunPath = host.replace('/app/cloudsql/', '/cloudsql/');
        if (!fs.existsSync(host) && fs.existsSync(nativeCloudRunPath)) {
          host = nativeCloudRunPath;
        }
      } else if (host.includes(':')) {
        const workspacePath = `/app/cloudsql/${host}`;
        const nativeCloudRunPath = `/cloudsql/${host}`;
        if (fs.existsSync(workspacePath)) {
          host = workspacePath;
        } else if (fs.existsSync(nativeCloudRunPath)) {
          host = nativeCloudRunPath;
        } else {
          host = workspacePath;
        }
      }
    }
  }

  console.log(`[DB-POOL] Resolved host for connection: "${host}"`);

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
