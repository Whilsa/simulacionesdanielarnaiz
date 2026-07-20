/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { DatabaseSchema, User, Transfer, SystemLog } from './src/types.js';
import { db } from './src/db/index.ts';
import { users, transfers, systemLogs, config } from './src/db/schema.ts';
import { eq, or, and, ne } from 'drizzle-orm';

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'db.json');

// Middleware to parse JSON
app.use(express.json());

// Diagnostic endpoint to debug Cloud SQL connection errors
app.get('/api/test-db', async (req, res) => {
  try {
    const userRecords = await db.select().from(users).limit(1);
    res.json({
      success: true,
      count: userRecords.length,
      env: {
        SQL_HOST: process.env.SQL_HOST,
        SQL_USER: process.env.SQL_USER,
        SQL_DB_NAME: process.env.SQL_DB_NAME,
        NODE_ENV: process.env.NODE_ENV
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      cause: error.cause ? { message: error.cause.message, code: error.cause.code, stack: error.cause.stack } : null,
      fullError: JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))),
      env: {
        SQL_HOST: process.env.SQL_HOST,
        SQL_USER: process.env.SQL_USER,
        SQL_DB_NAME: process.env.SQL_DB_NAME,
        NODE_ENV: process.env.NODE_ENV
      }
    });
  }
});

// Prevent any caching of API responses (crucial for real-time bank simulation across windows/devices)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// URL rewriting middleware to support endpoints without the '/api' prefix (bypass service worker caching)
app.use((req, res, next) => {
  const isApiRequest = req.url.startsWith('/api/');
  const shouldRewrite = !isApiRequest && (
    req.url === '/acceso' ||
    req.url === '/entrar' ||
    req.url === '/login' ||
    req.url.startsWith('/users') ||
    req.url.startsWith('/transfers') ||
    req.url.startsWith('/logs') ||
    req.url.startsWith('/reset-simulation')
  );

  if (shouldRewrite) {
    req.url = '/api' + req.url;
  }
  next();
});

// ---------------- DATABASE SEEDING & AUTO MIGRATION ----------------

async function initializeDatabase() {
  console.log('[DB-INIT] Checking PostgreSQL database state...');
  try {
    const existingUsers = await db.select().from(users).limit(1);
    
    if (existingUsers.length > 0) {
      console.log('[DB-INIT] Database already contains data. Skipping initial seeding.');
      return;
    }
    
    console.log('[DB-INIT] Database is empty. Initiating seeding / migration from db.json...');
    
    let sourceData: any = null;
    
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        sourceData = JSON.parse(raw);
        console.log('[DB-INIT] Loaded migration data from existing db.json');
      } catch (err) {
        console.error('[DB-INIT] Error reading db.json:', err);
      }
    }
    
    // Fallback to default seed if db.json is missing or invalid
    if (!sourceData || !Array.isArray(sourceData.users) || sourceData.users.length === 0) {
      console.log('[DB-INIT] No valid db.json found. Seeding default template...');
      sourceData = {
        users: [
          {
            id: 'profesor-1',
            username: 'pupdaniel',
            password: '1987',
            role: 'teacher',
            name: 'Profesor de Contabilidad',
            accountNumber: 'ES000000000000000000',
            balance: 0
          },
          {
            id: 'alumno-1',
            username: 'ana',
            password: '123',
            role: 'student',
            name: 'Ana López',
            accountNumber: 'ES910001000212345678',
            balance: 1000
          },
          {
            id: 'alumno-2',
            username: 'carlos',
            password: '123',
            role: 'student',
            name: 'Carlos Ruiz',
            accountNumber: 'ES910001000287654321',
            balance: 1000
          },
          {
            id: 'alumno-3',
            username: 'beatriz',
            password: '123',
            role: 'student',
            name: 'Beatriz Gómez',
            accountNumber: 'ES910001000244556677',
            balance: 1000
          }
        ],
        transfers: [
          {
            id: 'tx-seed-1',
            senderId: 'alumno-1',
            senderName: 'Ana López',
            senderAccount: 'ES910001000212345678',
            receiverId: 'alumno-2',
            receiverName: 'Carlos Ruiz',
            receiverAccount: 'ES910001000287654321',
            amount: 250,
            concept: 'Compra de mercaderías (Simulada)',
            timestamp: new Date(Date.now() - 3600000 * 2).toISOString()
          },
          {
            id: 'tx-seed-2',
            senderId: 'alumno-3',
            senderName: 'Beatriz Gómez',
            senderAccount: 'ES910001000244556677',
            receiverId: 'alumno-1',
            receiverName: 'Ana López',
            receiverAccount: 'ES910001000212345678',
            amount: 150,
            concept: 'Alquiler de local comercial (Simulado)',
            timestamp: new Date(Date.now() - 3600000).toISOString()
          }
        ],
        systemLogs: [
          {
            id: 'log-seed-1',
            action: 'RESET_SIMULATION',
            details: 'Banco Escolar Egobey inicializado con base de datos Cloud SQL persistente.',
            timestamp: new Date().toISOString()
          }
        ],
        defaultInitialBalance: 1000
      };
    }
    
    // 1. Insert config/settings
    const initialBal = sourceData.defaultInitialBalance !== undefined ? sourceData.defaultInitialBalance : 1000;
    await db.insert(config).values({
      key: 'defaultInitialBalance',
      value: String(initialBal)
    }).onConflictDoUpdate({
      target: config.key,
      set: { value: String(initialBal) }
    });
    
    // 2. Insert users
    if (Array.isArray(sourceData.users)) {
      for (const u of sourceData.users) {
        // Enforce teacher credentials "pupdaniel" / "1987"
        if (u.role === 'teacher' || u.id === 'profesor-1') {
          u.username = 'pupdaniel';
          u.password = '1987';
        }
        await db.insert(users).values({
          id: u.id,
          username: u.username.toLowerCase().trim(),
          password: u.password.trim(),
          role: u.role,
          name: u.name,
          accountNumber: u.accountNumber,
          balance: Number(u.balance) || 0
        }).onConflictDoNothing();
      }
    }
    
    // 3. Insert transfers
    if (Array.isArray(sourceData.transfers)) {
      for (const t of sourceData.transfers) {
        // Only insert if sender and receiver exist to prevent foreign key errors
        const senderCheck = await db.select().from(users).where(eq(users.id, t.senderId)).limit(1);
        const receiverCheck = await db.select().from(users).where(eq(users.id, t.receiverId)).limit(1);
        if (senderCheck.length > 0 && receiverCheck.length > 0) {
          await db.insert(transfers).values({
            id: t.id,
            senderId: t.senderId,
            senderName: t.senderName,
            senderAccount: t.senderAccount,
            receiverId: t.receiverId,
            receiverName: t.receiverName,
            receiverAccount: t.receiverAccount,
            amount: Number(t.amount),
            concept: t.concept || '',
            timestamp: t.timestamp
          }).onConflictDoNothing();
        }
      }
    }
    
    // 4. Insert logs
    if (Array.isArray(sourceData.systemLogs)) {
      for (const l of sourceData.systemLogs) {
        await db.insert(systemLogs).values({
          id: l.id,
          action: l.action,
          details: l.details,
          timestamp: l.timestamp
        }).onConflictDoNothing();
      }
    }
    
    console.log('[DB-INIT] Seeding completed successfully. Data migrated to Cloud SQL!');
  } catch (err) {
    console.error('[DB-INIT-FATAL] Failed to initialize database:', err);
  }
}

async function getFullDbState(): Promise<DatabaseSchema> {
  const allUsers = await db.select().from(users);
  const allTransfers = await db.select().from(transfers);
  const allLogs = await db.select().from(systemLogs);
  
  // Get default initial balance
  const cfg = await db.select().from(config).where(eq(config.key, 'defaultInitialBalance')).limit(1);
  const defaultInitialBalance = cfg.length > 0 ? Number(cfg[0].value) : 1000;
  
  return {
    users: allUsers as User[],
    transfers: allTransfers as Transfer[],
    systemLogs: allLogs as SystemLog[],
    defaultInitialBalance
  };
}

// Generate unique account number
function generateIBAN(): string {
  const bankCode = '0001';
  const branchCode = '0002';
  const controlDigits = Math.floor(10 + Math.random() * 90).toString(); // 2 digits
  const accountNumber = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
  return `ES${controlDigits}${bankCode}${branchCode}${accountNumber}`;
}

// Generate unique IDs
function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

// Format error messages with detailed inner cause if available (helpful for DrizzleQueryError debugging)
function formatErrorMessage(prefix: string, error: any): string {
  const message = error?.message || String(error);
  const causeMsg = error?.cause ? ` (Causa: ${error.cause.message || error.cause})` : '';
  return `${prefix}: ${message}${causeMsg}`;
}

// ---------------- API ENDPOINTS ----------------

// Authenticate / Login
const loginHandler = async (req: express.Request, res: express.Response) => {
  const { username, password } = req.body;
  
  console.log('[LOGIN] Request received. Username:', username, 'Password:', password ? '****' : 'empty');

  // Log to database systemLogs for diagnostic tracking
  try {
    await db.insert(systemLogs).values({
      id: generateId('log-debug'),
      action: 'LOGIN_ATTEMPT',
      details: `Intento de acceso recibido: usuario "${username || 'vacío'}".`,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to write login attempt log:', e);
  }

  if (!username || !password) {
    console.log('[LOGIN] Failed: Missing username or password');
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  try {
    const userRecords = await db.select().from(users).where(eq(users.username, username.toLowerCase().trim()));
    const user = userRecords.find(u => u.password === password.trim());

    if (!user) {
      console.log('[LOGIN] Failed: Credentials do not match any active user');
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    console.log('[LOGIN] Success! Matched user:', user.name, 'Role:', user.role);

    // Exclude password from response
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error: any) {
    console.error('[LOGIN-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error en el inicio de sesión', error) });
  }
};

app.post('/api/login', loginHandler);
app.post('/api/auth/login', loginHandler);
app.post('/api/acceso', loginHandler);
app.post('/api/entrar', loginHandler);
app.post('/acceso', loginHandler);
app.post('/entrar', loginHandler);
app.post('/login', loginHandler);

// Get users list
app.get('/api/users', async (req, res) => {
  const role = req.query.role as string;
  try {
    const allUsers = await db.select().from(users);
    if (role === 'teacher') {
      res.json({ users: allUsers });
    } else {
      // Only return students and filter out password/admin details
      const publicStudents = allUsers
        .filter(u => u.role === 'student')
        .map(({ password: _, ...u }) => u);
      res.json({ users: publicStudents });
    }
  } catch (error: any) {
    console.error('[GET-USERS-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al obtener usuarios', error) });
  }
});

// Create new bank user account (Teacher only)
app.post('/api/users', async (req, res) => {
  const { name, username, password, initialBalance } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña son requeridos' });
  }

  try {
    const normalizedUsername = username.toLowerCase().trim();
    const existing = await db.select().from(users).where(eq(users.username, normalizedUsername)).limit(1);
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }

    const newUser = {
      id: generateId('user'),
      username: normalizedUsername,
      password: password.trim(),
      role: 'student' as const,
      name: name.trim(),
      accountNumber: generateIBAN(),
      balance: Number(initialBalance) || 0
    };

    await db.insert(users).values(newUser);

    await db.insert(systemLogs).values({
      id: generateId('log'),
      action: 'CREATE_USER',
      details: `Cuenta creada: ${newUser.name} (${newUser.username}) con saldo inicial de ${newUser.balance} €`,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({ user: newUser });
  } catch (error: any) {
    console.error('[CREATE-USER-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al crear usuario', error) });
  }
});

// Update user details (Teacher only)
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, username, password } = req.body;

  try {
    const userRecords = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (userRecords.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userRecords[0];
    let newUsername = user.username;

    if (username && username.toLowerCase().trim() !== user.username) {
      const normalizedUsername = username.toLowerCase().trim();
      const existing = await db.select().from(users).where(
        and(
          eq(users.username, normalizedUsername),
          ne(users.id, id)
        )
      ).limit(1);
      
      if (existing.length > 0) {
        return res.status(400).json({ error: 'El nombre de usuario ya está tomado' });
      }
      newUsername = normalizedUsername;
    }

    const updatedName = name ? name.trim() : user.name;
    const updatedPassword = password ? password.trim() : user.password;

    await db.update(users).set({
      name: updatedName,
      username: newUsername,
      password: updatedPassword
    }).where(eq(users.id, id));

    await db.insert(systemLogs).values({
      id: generateId('log'),
      action: 'UPDATE_USER',
      details: `Detalles de cuenta actualizados: ${updatedName} (${newUsername})`,
      timestamp: new Date().toISOString()
    });

    res.json({ user: { ...user, name: updatedName, username: newUsername, password: updatedPassword } });
  } catch (error: any) {
    console.error('[UPDATE-USER-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al actualizar usuario', error) });
  }
});

// Adjust balance of a user (Teacher only)
app.put('/api/users/:id/adjust-balance', async (req, res) => {
  const { id } = req.params;
  const { amount, actionType } = req.body; // actionType: 'add' | 'subtract' | 'set'

  if (amount === undefined || isNaN(Number(amount))) {
    return res.status(400).json({ error: 'Cantidad inválida' });
  }

  try {
    const userRecords = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (userRecords.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userRecords[0];
    const oldBalance = user.balance;
    const changeValue = Number(amount);
    let newBalance = oldBalance;

    if (actionType === 'add') {
      newBalance += changeValue;
    } else if (actionType === 'subtract') {
      newBalance = Math.max(0, oldBalance - changeValue);
    } else if (actionType === 'set') {
      newBalance = Math.max(0, changeValue);
    }

    newBalance = Number(newBalance.toFixed(2));

    await db.update(users).set({ balance: newBalance }).where(eq(users.id, id));

    await db.insert(systemLogs).values({
      id: generateId('log'),
      action: 'BALANCE_ADJUSTMENT',
      details: `Ajuste de saldo para ${user.name}. Tipo: ${actionType}, Cantidad: ${changeValue} €, Anterior: ${oldBalance} €, Nuevo: ${newBalance} €`,
      timestamp: new Date().toISOString()
    });

    res.json({ user: { ...user, balance: newBalance } });
  } catch (error: any) {
    console.error('[ADJUST-BALANCE-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al ajustar saldo', error) });
  }
});

// Delete user account (Teacher only)
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const userRecords = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (userRecords.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userRecords[0];

    if (user.role === 'teacher') {
      return res.status(400).json({ error: 'No se puede eliminar la cuenta del profesor principal' });
    }

    await db.delete(users).where(eq(users.id, id));

    await db.insert(systemLogs).values({
      id: generateId('log'),
      action: 'DELETE_USER',
      details: `Cuenta eliminada: ${user.name} (${user.username}), saldo restante de ${user.balance} €`,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: 'Usuario eliminado exitosamente' });
  } catch (error: any) {
    console.error('[DELETE-USER-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al eliminar usuario', error) });
  }
});

// Create transfer between students
app.post('/api/transfers', async (req, res) => {
  const { senderId, receiverId, amount, concept } = req.body;

  if (!senderId || !receiverId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Datos de transferencia inválidos o cantidad menor/igual a cero' });
  }

  if (senderId === receiverId) {
    return res.status(400).json({ error: 'No puedes hacerte una transferencia a ti mismo' });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const senderRecords = await tx.select().from(users).where(eq(users.id, senderId)).limit(1);
      const receiverRecords = await tx.select().from(users).where(eq(users.id, receiverId)).limit(1);

      if (senderRecords.length === 0) {
        throw new Error('Emisor no encontrado');
      }
      if (receiverRecords.length === 0) {
        throw new Error('Destinatario no encontrado');
      }

      const sender = senderRecords[0];
      const receiver = receiverRecords[0];
      const transferAmount = Number(amount);

      if (sender.balance < transferAmount) {
        throw new Error('Saldo insuficiente para completar la transferencia');
      }

      const newSenderBalance = Number((sender.balance - transferAmount).toFixed(2));
      const newReceiverBalance = Number((receiver.balance + transferAmount).toFixed(2));

      await tx.update(users).set({ balance: newSenderBalance }).where(eq(users.id, senderId));
      await tx.update(users).set({ balance: newReceiverBalance }).where(eq(users.id, receiverId));

      const newTransfer = {
        id: generateId('tx'),
        senderId: sender.id,
        senderName: sender.name,
        senderAccount: sender.accountNumber,
        receiverId: receiver.id,
        receiverName: receiver.name,
        receiverAccount: receiver.accountNumber,
        amount: transferAmount,
        concept: concept ? concept.trim() : 'Transferencia inmediata',
        timestamp: new Date().toISOString()
      };

      await tx.insert(transfers).values(newTransfer);

      return { newTransfer, newSenderBalance };
    });

    res.json({ success: true, transfer: result.newTransfer, senderBalance: result.newSenderBalance });
  } catch (error: any) {
    console.error('[TRANSFER-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al completar la transferencia', error) });
  }
});

// Get transfers
app.get('/api/transfers', async (req, res) => {
  const { userId, role } = req.query;

  try {
    if (role === 'teacher') {
      const allTransfers = await db.select().from(transfers);
      allTransfers.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      res.json({ transfers: allTransfers });
    } else if (userId) {
      const filtered = await db.select().from(transfers).where(
        or(
          eq(transfers.senderId, userId as string),
          eq(transfers.receiverId, userId as string)
        )
      );
      filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      res.json({ transfers: filtered });
    } else {
      res.status(400).json({ error: 'Se requiere userId o rol para ver el historial' });
    }
  } catch (error: any) {
    console.error('[GET-TRANSFERS-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al obtener transferencias', error) });
  }
});

// Get system logs (Teacher only)
app.get('/api/logs', async (req, res) => {
  try {
    const allLogs = await db.select().from(systemLogs);
    allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ logs: allLogs });
  } catch (error: any) {
    console.error('[GET-LOGS-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al obtener registros', error) });
  }
});

// Reset simulation (Teacher only)
app.post('/api/reset-simulation', async (req, res) => {
  const { keepUsers, defaultBalance } = req.body;

  const initialBalanceValue = defaultBalance !== undefined ? Number(defaultBalance) : 1000;

  try {
    await db.transaction(async (tx) => {
      // 1. Update config table
      await tx.insert(config).values({
        key: 'defaultInitialBalance',
        value: String(initialBalanceValue)
      }).onConflictDoUpdate({
        target: config.key,
        set: { value: String(initialBalanceValue) }
      });

      // 2. Handle users & transfers
      if (keepUsers) {
        // Reset balances of all students
        await tx.update(users).set({ balance: initialBalanceValue }).where(eq(users.role, 'student'));
        // Clear all transfers
        await tx.delete(transfers);
      } else {
        // Completely clear all student accounts and transactions
        await tx.delete(users).where(eq(users.role, 'student'));
        await tx.delete(transfers);
      }

      // 3. Clear logs and create reset log
      await tx.delete(systemLogs);
      
      await tx.insert(systemLogs).values({
        id: generateId('log'),
        action: 'RESET_SIMULATION',
        details: `Simulación reiniciada. ¿Se mantuvieron usuarios?: ${keepUsers ? 'Sí (saldos restablecidos a ' + initialBalanceValue + ' €)' : 'No (todas las cuentas de alumnos eliminadas)'}`,
        timestamp: new Date().toISOString()
      });
    });

    res.json({ success: true, message: 'La simulación se ha reiniciado correctamente' });
  } catch (error: any) {
    console.error('[RESET-SIMULATION-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al reiniciar la simulación', error) });
  }
});

// Download full backup (Teacher only)
app.get('/api/backup', async (req, res) => {
  try {
    const fullDb = await getFullDbState();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=egobey_backup.json');
    res.send(JSON.stringify(fullDb, null, 2));
  } catch (error: any) {
    res.status(500).json({ error: formatErrorMessage('Error al generar la copia de seguridad', error) });
  }
});

// Restore full backup (Teacher only)
app.post('/api/restore', async (req, res) => {
  try {
    const backup = req.body;
    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({ error: 'Formato de copia de seguridad inválido.' });
    }
    
    // Structure validation
    if (!Array.isArray(backup.users) || !Array.isArray(backup.transfers) || !Array.isArray(backup.systemLogs)) {
      return res.status(400).json({ error: 'La copia de seguridad no contiene la estructura requerida (users, transfers, systemLogs).' });
    }

    await db.transaction(async (tx) => {
      // Clear existing records
      await tx.delete(transfers);
      await tx.delete(systemLogs);
      await tx.delete(users);

      // Re-insert configuration
      const initialBal = backup.defaultInitialBalance !== undefined ? backup.defaultInitialBalance : 1000;
      await tx.insert(config).values({
        key: 'defaultInitialBalance',
        value: String(initialBal)
      }).onConflictDoUpdate({
        target: config.key,
        set: { value: String(initialBal) }
      });

      // Re-insert users
      for (const u of backup.users) {
        // Enforce teacher credentials
        if (u.role === 'teacher' || u.id === 'profesor-1') {
          u.username = 'pupdaniel';
          u.password = '1987';
        }
        await tx.insert(users).values({
          id: u.id,
          username: u.username.toLowerCase().trim(),
          password: u.password.trim(),
          role: u.role,
          name: u.name,
          accountNumber: u.accountNumber,
          balance: Number(u.balance) || 0
        });
      }

      // Re-insert transfers
      for (const t of backup.transfers) {
        await tx.insert(transfers).values({
          id: t.id,
          senderId: t.senderId,
          senderName: t.senderName,
          senderAccount: t.senderAccount,
          receiverId: t.receiverId,
          receiverName: t.receiverName,
          receiverAccount: t.receiverAccount,
          amount: Number(t.amount),
          concept: t.concept || '',
          timestamp: t.timestamp
        });
      }

      // Re-insert logs
      for (const l of backup.systemLogs) {
        await tx.insert(systemLogs).values({
          id: l.id,
          action: l.action,
          details: l.details,
          timestamp: l.timestamp
        });
      }

      // Add restoration log
      await tx.insert(systemLogs).values({
        id: generateId('log'),
        action: 'RESET_SIMULATION',
        details: 'Copia de seguridad restaurada de forma exitosa por el profesor.',
        timestamp: new Date().toISOString()
      });
    });

    res.json({ success: true, message: 'Copia de seguridad restaurada con éxito.' });
  } catch (error: any) {
    console.error('[RESTORE-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error al restaurar la copia de seguridad', error) });
  }
});

// Automatic bi-directional synchronization endpoint (maintained for backwards compatibility, acts as full sync fetch)
app.post('/api/sync', async (req, res) => {
  try {
    const clientDb = req.body;
    const serverDb = await getFullDbState();

    if (!clientDb || typeof clientDb !== 'object' || !Array.isArray(clientDb.users) || !Array.isArray(clientDb.transfers)) {
      return res.json({ success: false, reason: 'formato_invalido', db: serverDb });
    }

    const serverStudentsCount = serverDb.users.filter(u => u.role === 'student').length;
    const clientStudentsCount = clientDb.users.filter((u: any) => u.role === 'student').length;

    const serverTransfersCount = serverDb.transfers.length;
    const clientTransfersCount = clientDb.transfers.length;

    const serverIsDefaultSeed = serverStudentsCount <= 3 && serverTransfersCount <= 2;
    const clientIsDefaultSeed = clientStudentsCount <= 3 && clientTransfersCount <= 2;

    const shouldOverwriteServer = 
      (serverIsDefaultSeed && !clientIsDefaultSeed) || 
      (clientStudentsCount > serverStudentsCount && !clientIsDefaultSeed);

    if (shouldOverwriteServer) {
      await db.transaction(async (tx) => {
        await tx.delete(transfers);
        await tx.delete(systemLogs);
        await tx.delete(users);

        const initialBal = clientDb.defaultInitialBalance !== undefined ? clientDb.defaultInitialBalance : 1000;
        await tx.insert(config).values({
          key: 'defaultInitialBalance',
          value: String(initialBal)
        }).onConflictDoUpdate({
          target: config.key,
          set: { value: String(initialBal) }
        });

        for (const u of clientDb.users) {
          if (u.role === 'teacher' || u.id === 'profesor-1') {
            u.username = 'pupdaniel';
            u.password = '1987';
          }
          await tx.insert(users).values({
            id: u.id,
            username: u.username.toLowerCase().trim(),
            password: u.password.trim(),
            role: u.role,
            name: u.name,
            accountNumber: u.accountNumber,
            balance: Number(u.balance) || 0
          });
        }

        for (const t of clientDb.transfers) {
          await tx.insert(transfers).values({
            id: t.id,
            senderId: t.senderId,
            senderName: t.senderName,
            senderAccount: t.senderAccount,
            receiverId: t.receiverId,
            receiverName: t.receiverName,
            receiverAccount: t.receiverAccount,
            amount: Number(t.amount),
            concept: t.concept || '',
            timestamp: t.timestamp
          });
        }

        const logsList = Array.isArray(clientDb.systemLogs) ? clientDb.systemLogs : [];
        for (const l of logsList) {
          await tx.insert(systemLogs).values({
            id: l.id,
            action: l.action,
            details: l.details,
            timestamp: l.timestamp
          });
        }
      });

      console.log(`[SYNC-AUTO] Server database recovered from client backup.`);
      const updatedServerDb = await getFullDbState();
      return res.json({ success: true, updated: true, db: updatedServerDb });
    } else {
      return res.json({ success: true, updated: false, db: serverDb });
    }
  } catch (error: any) {
    console.error('[SYNC-ERROR]', error);
    res.status(500).json({ error: formatErrorMessage('Error en sincronización automática', error) });
  }
});

// ---------------- VITE MIDDLEWARE / FRONTEND SERVING ----------------

async function startServer() {
  // Initialize Database state and migrator
  await initializeDatabase();

  // Vite integration for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Banco Escolar] Servidor corriendo en http://localhost:${PORT}`);
  });
}

startServer();
