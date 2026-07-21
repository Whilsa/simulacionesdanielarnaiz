import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import * as schema from './schema.ts';

const { Pool } = pkg;

// Fallback JSON-based database path
const DB_FILE = path.join(process.cwd(), 'db.json');

interface LocalDb {
  users: any[];
  transfers: any[];
  systemLogs: any[];
  defaultInitialBalance: number;
}

let localDb: LocalDb = {
  users: [],
  transfers: [],
  systemLogs: [],
  defaultInitialBalance: 1000
};

// Sync load on startup
function loadLocalDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      localDb = {
        users: Array.isArray(data.users) ? data.users : [],
        transfers: Array.isArray(data.transfers) ? data.transfers : [],
        systemLogs: Array.isArray(data.systemLogs) ? data.systemLogs : [],
        defaultInitialBalance: typeof data.defaultInitialBalance === 'number' ? data.defaultInitialBalance : 1000
      };
      console.log(`[DB-FALLBACK] Loaded local database from db.json. Users: ${localDb.users.length}, Transfers: ${localDb.transfers.length}`);
    } else {
      console.log(`[DB-FALLBACK] db.json does not exist. Initializing empty fallback database.`);
    }
  } catch (err: any) {
    console.error('[DB-FALLBACK] Error loading db.json:', err.message);
  }
}

// Sync save to disk
function saveLocalDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(localDb, null, 2), 'utf-8');
    console.log(`[DB-FALLBACK] Saved local database to db.json. Users: ${localDb.users.length}`);
  } catch (err: any) {
    console.error('[DB-FALLBACK] Error saving db.json:', err.message);
  }
}

// Map column name to JS camelCase property
function mapColumnToProperty(col: string): string {
  if (col === 'account_number') return 'accountNumber';
  if (col === 'sender_id') return 'senderId';
  if (col === 'sender_name') return 'senderName';
  if (col === 'sender_account') return 'senderAccount';
  if (col === 'receiver_id') return 'receiverId';
  if (col === 'receiver_name') return 'receiverName';
  if (col === 'receiver_account') return 'receiverAccount';
  if (col === 'created_at') return 'createdAt';
  if (col === 'system_logs') return 'systemLogs';
  return col;
}

// Execute fallbacks for compiled SQL queries
export async function executeFallbackSQL(sql: string, params: any[]): Promise<any> {
  const normSql = sql.replace(/\s+/g, ' ').trim();
  console.log(`[DB-FALLBACK] Executing fallback SQL: "${normSql}" with params:`, params);

  // 1. SELECT
  if (normSql.toLowerCase().startsWith('select')) {
    let tableName = '';
    const tableMatch = normSql.match(/from\s+"([^"]+)"/i);
    if (tableMatch) {
      tableName = tableMatch[1];
    } else {
      throw new Error(`Could not parse table name from SELECT: ${normSql}`);
    }

    let source: any[] = [];
    if (tableName === 'users') source = localDb.users;
    else if (tableName === 'transfers') source = localDb.transfers;
    else if (tableName === 'system_logs') source = localDb.systemLogs;
    else if (tableName === 'config') {
      source = [{ key: 'defaultInitialBalance', value: String(localDb.defaultInitialBalance) }];
    }

    let filtered = [...source];

    // users.username = $1 and users.id <> $2
    const andNeMatch = normSql.match(/where\s*\(\s*"users"\."username"\s*=\s*\$(\d+)\s+and\s+"users"\."id"\s*<>\s*\$(\d+)\s*\)/i);
    if (andNeMatch) {
      const uVal = params[Number(andNeMatch[1]) - 1];
      const idVal = params[Number(andNeMatch[2]) - 1];
      filtered = filtered.filter(u => u.username === uVal && u.id !== idVal);
    }
    // transfers.sender_id = $1 or transfers.receiver_id = $2
    else if (normSql.match(/where\s*\(\s*"transfers"\."sender_id"\s*=\s*\$(\d+)\s+or\s+"transfers"\."receiver_id"\s*=\s*\$(\d+)\s*\)/i)) {
      const orMatch = normSql.match(/where\s*\(\s*"transfers"\."sender_id"\s*=\s*\$(\d+)\s+or\s+"transfers"\."receiver_id"\s*=\s*\$(\d+)\s*\)/i)!;
      const sVal = params[Number(orMatch[1]) - 1];
      const rVal = params[Number(orMatch[2]) - 1];
      filtered = filtered.filter(t => t.senderId === sVal || t.receiverId === rVal);
    }
    // users.username = $1
    else if (normSql.match(/where\s+"users"\."username"\s*=\s*\$(\d+)/i)) {
      const m = normSql.match(/where\s+"users"\."username"\s*=\s*\$(\d+)/i)!;
      const uVal = params[Number(m[1]) - 1];
      filtered = filtered.filter(u => u.username === uVal);
    }
    // users.id = $1
    else if (normSql.match(/where\s+"users"\."id"\s*=\s*\$(\d+)/i)) {
      const m = normSql.match(/where\s+"users"\."id"\s*=\s*\$(\d+)/i)!;
      const idVal = params[Number(m[1]) - 1];
      filtered = filtered.filter(u => u.id === idVal);
    }
    // users.role = $1
    else if (normSql.match(/where\s+"users"\."role"\s*=\s*\$(\d+)/i)) {
      const m = normSql.match(/where\s+"users"\."role"\s*=\s*\$(\d+)/i)!;
      const roleVal = params[Number(m[1]) - 1];
      filtered = filtered.filter(u => u.role === roleVal);
    }
    // config.key = $1
    else if (normSql.match(/where\s+"config"\."key"\s*=\s*\$(\d+)/i)) {
      const m = normSql.match(/where\s+"config"\."key"\s*=\s*\$(\d+)/i)!;
      const keyVal = params[Number(m[1]) - 1];
      filtered = filtered.filter(c => c.key === keyVal);
    }

    if (tableName === 'system_logs' || tableName === 'transfers') {
      filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    const limitMatch = normSql.match(/limit\s*(?:\$(\d+)|(\d+))/i);
    if (limitMatch) {
      const limitVal = limitMatch[1] ? params[Number(limitMatch[1]) - 1] : Number(limitMatch[2]);
      filtered = filtered.slice(0, limitVal);
    }

    return filtered;
  }

  // 2. INSERT
  if (normSql.toLowerCase().startsWith('insert')) {
    const insertMatch = normSql.match(/insert\s+into\s+"([^"]+)"\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i);
    if (!insertMatch) {
      throw new Error(`Could not parse INSERT query: ${normSql}`);
    }

    const tableName = insertMatch[1];
    const columns = insertMatch[2].split(',').map(c => c.trim().replace(/"/g, ''));
    const valuesPlaceholder = insertMatch[3].split(',').map(v => v.trim());

    const newItem: any = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const prop = mapColumnToProperty(col);
      const valStr = valuesPlaceholder[i];
      if (valStr.startsWith('$')) {
        const pIdx = Number(valStr.replace('$', '')) - 1;
        newItem[prop] = params[pIdx];
      } else {
        newItem[prop] = valStr.replace(/'/g, '');
      }
    }

    if (tableName === 'config') {
      if (newItem.key === 'defaultInitialBalance') {
        localDb.defaultInitialBalance = Number(newItem.value) || 1000;
        saveLocalDb();
      }
      return [newItem];
    }

    let targetArray: any[] = [];
    if (tableName === 'users') targetArray = localDb.users;
    else if (tableName === 'transfers') targetArray = localDb.transfers;
    else if (tableName === 'system_logs') targetArray = localDb.systemLogs;

    const existingIdx = targetArray.findIndex(item => item.id === newItem.id);
    if (existingIdx !== -1) {
      if (normSql.toLowerCase().includes('do update')) {
        targetArray[existingIdx] = { ...targetArray[existingIdx], ...newItem };
      }
    } else {
      targetArray.push(newItem);
    }

    saveLocalDb();
    return [newItem];
  }

  // 3. UPDATE
  if (normSql.toLowerCase().startsWith('update')) {
    const updateMatch = normSql.match(/update\s+"([^"]+)"\s+set\s+(.+?)\s+where\s+(.+)$/i);
    if (!updateMatch) {
      throw new Error(`Could not parse UPDATE: ${normSql}`);
    }

    const tableName = updateMatch[1];
    const setClause = updateMatch[2];
    const whereClause = updateMatch[3];

    const setPairs = setClause.split(',').map(s => s.trim());
    const updates: any = {};
    for (const pair of setPairs) {
      const parts = pair.split('=').map(p => p.trim());
      const col = parts[0].replace(/"/g, '');
      const prop = mapColumnToProperty(col);
      const valStr = parts[1];
      if (valStr.startsWith('$')) {
        const paramIdx = Number(valStr.replace('$', '')) - 1;
        updates[prop] = params[paramIdx];
      } else {
        updates[prop] = valStr.replace(/'/g, '');
      }
    }

    const idMatch = whereClause.match(/"users"\."id"\s*=\s*\$(\d+)/i);
    const roleMatch = whereClause.match(/"users"\."role"\s*=\s*\$(\d+)/i);

    if (idMatch) {
      const idVal = params[Number(idMatch[1]) - 1];
      if (tableName === 'users') {
        localDb.users = localDb.users.map((u: any) => {
          if (u.id === idVal) {
            return { ...u, ...updates };
          }
          return u;
        });
      }
    } else if (roleMatch) {
      const roleVal = params[Number(roleMatch[1]) - 1];
      if (tableName === 'users') {
        localDb.users = localDb.users.map((u: any) => {
          if (u.role === roleVal) {
            return { ...u, ...updates };
          }
          return u;
        });
      }
    }

    saveLocalDb();
    return { affectedRows: 1 };
  }

  // 4. DELETE
  if (normSql.toLowerCase().startsWith('delete')) {
    const deleteMatch = normSql.match(/delete\s+from\s+"([^"]+)"(?:\s+where\s+(.+))?/i);
    if (!deleteMatch) {
      throw new Error(`Could not parse DELETE: ${normSql}`);
    }

    const tableName = deleteMatch[1];
    const whereClause = deleteMatch[2];

    if (!whereClause) {
      if (tableName === 'users') localDb.users = [];
      else if (tableName === 'transfers') localDb.transfers = [];
      else if (tableName === 'system_logs') localDb.systemLogs = [];
    } else {
      const idMatch = whereClause.match(/"users"\."id"\s*=\s*\$(\d+)/i);
      const roleMatch = whereClause.match(/"users"\."role"\s*=\s*\$(\d+)/i);

      if (idMatch) {
        const idVal = params[Number(idMatch[1]) - 1];
        if (tableName === 'users') {
          localDb.users = localDb.users.filter((u: any) => u.id !== idVal);
        }
      } else if (roleMatch) {
        const roleVal = params[Number(roleMatch[1]) - 1];
        if (tableName === 'users') {
          localDb.users = localDb.users.filter((u: any) => u.role !== roleVal);
        }
      }
    }

    saveLocalDb();
    return { affectedRows: 1 };
  }

  throw new Error(`Unsupported fallback SQL operation: ${normSql}`);
}

// Load database immediately on startup
loadLocalDb();

// Function to create a new connection pool.
export const createPool = () => {
  let host = process.env.SQL_HOST;
  if (host === 'undefined' || host === 'null') {
    host = undefined;
  }
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
const rawDb = drizzle(pool, { schema });

// Wrap a query builder in a thenable QueryProxy to capture connection errors at runtime
function wrapQueryBuilder(qb: any) {
  return {
    ...qb,
    then: async function(resolve: any, reject: any) {
      try {
        const result = await qb;
        return resolve(result);
      } catch (err: any) {
        console.warn('[DB-FALLBACK] SQL query failed. Attempting local JSON fallback. Error:', err.message);
        try {
          if (typeof qb.toSQL !== 'function') {
            throw new Error('Query builder does not have toSQL() method');
          }
          const { sql, params } = qb.toSQL();
          const fallbackResult = await executeFallbackSQL(sql, params);
          return resolve(fallbackResult);
        } catch (fallbackErr: any) {
          console.error('[DB-FALLBACK] Local JSON query also failed:', fallbackErr.message);
          return reject(err); // reject with original error
        }
      }
    }
  };
}

// Transparent Proxy wrapper around the Drizzle db instance
export const db = new Proxy(rawDb, {
  get(target, prop, receiver) {
    if (prop === 'transaction') {
      return async function(callback: (tx: any) => Promise<any>) {
        try {
          // Attempt the real PostgreSQL transaction first
          return await target.transaction(async (tx: any) => {
            const proxiedTx = new Proxy(tx, {
              get(txTarget, txProp, txReceiver) {
                const txVal = Reflect.get(txTarget, txProp, txReceiver);
                if (typeof txVal === 'function') {
                  return function(...txArgs: any[]) {
                    const txResult = txVal.apply(txTarget, txArgs);
                    if (txResult && (typeof txResult.toSQL === 'function' || typeof txResult.then === 'function')) {
                      return wrapQueryBuilder(txResult);
                    }
                    return txResult;
                  };
                }
                return txVal;
              }
            });
            return await callback(proxiedTx);
          });
        } catch (err: any) {
          console.warn('[DB-FALLBACK] Transaction failed, running against JSON fallback. Error:', err.message);
          // Run the callback with a mock transaction client that executes queries directly via our SQL fallback
          const mockTx = {
            select: () => {
              const selectObj: any = {
                from: () => selectObj,
                where: () => selectObj,
                limit: () => selectObj,
                orderBy: () => selectObj,
                then: async (res: any) => res(await executeFallbackSQL('SELECT', []))
              };
              return selectObj;
            },
            insert: () => {
              const insertObj: any = {
                values: () => insertObj,
                onConflictDoNothing: () => insertObj,
                onConflictDoUpdate: () => insertObj,
                then: async (res: any) => res(await executeFallbackSQL('INSERT', []))
              };
              return insertObj;
            },
            update: () => {
              const updateObj: any = {
                set: () => updateObj,
                where: () => updateObj,
                then: async (res: any) => res(await executeFallbackSQL('UPDATE', []))
              };
              return updateObj;
            },
            delete: () => {
              const deleteObj: any = {
                where: () => deleteObj,
                then: async (res: any) => res(await executeFallbackSQL('DELETE', []))
              };
              return deleteObj;
            }
          };
          return await callback(mockTx);
        }
      };
    }

    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return function(...args: any[]) {
        const result = value.apply(target, args);
        if (result && (typeof result.toSQL === 'function' || typeof result.then === 'function')) {
          return wrapQueryBuilder(result);
        }
        return result;
      };
    }
    return value;
  }
}) as any;
