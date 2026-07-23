/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import { DatabaseSchema, User, Transfer, SystemLog, PropertyListing, PropertyAcquisition, PaymentObligation, PropertyType, OperationType, LocationScope, DeferredPaymentConfig, BankLoan, AmortizationRow, LoanStatus, UpcomingPaymentItem } from './src/types.js';
import { SPANISH_REGIONS, PROPERTY_IMAGES, generateLandPercentage, generateLocation, calculateRealisticPrice, getRandomElement, getRandomInt } from './src/lib/realEstateData.js';

const { Pool } = pg;
const SERVER_INSTANCE_ID = 'inst-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'db.json');

// Bypass self-signed TLS/SSL certificate checks for Supabase pooler connections
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Supabase PostgreSQL Pool Initialization
const DEFAULT_SUPABASE_URL = 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
let dbPool: pg.Pool | null = null;

function initPgPool(url: string) {
  if (dbPool) {
    try {
      dbPool.end();
    } catch (e) {}
  }

  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  dbPool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined
    },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10
  });

  process.env.DATABASE_URL = url;
  console.log('[Supabase DB] PostgreSQL pool configured automatically with DATABASE_URL.');

  // Trigger table initialization & restore from Supabase asynchronously
  initSupabaseTables().then(res => {
    if (res.success) {
      restoreFromSupabase().catch(e => console.error('[Supabase Auto Restore Error]', e));
    }
  }).catch(e => console.error('[Supabase Table Init Error]', e));
}

const initialDbUrl = process.env.DATABASE_URL || DEFAULT_SUPABASE_URL;
try {
  initPgPool(initialDbUrl);
} catch (err) {
  console.error('[Supabase DB] Error creating PG pool:', err);
}

function maskDbUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '••••••••';
    }
    return parsed.toString();
  } catch (e) {
    return url.replace(/:([^:@]+)@/, ':••••••••@');
  }
}

// Realistic corporate real estate vendors & financial creditors
export const REALISTIC_CORPORATE_SELLERS = [
  { id: 'corp-1', name: 'Inmobiliaria Polígonos de España S.A.', account: 'ES210001000299887711' },
  { id: 'corp-2', name: 'Patrimonio Empresarial e Industrial S.L.', account: 'ES210001000299887722' },
  { id: 'corp-3', name: 'Fondo de Arrendamientos Comerciales S.A.', account: 'ES210001000299887733' },
  { id: 'corp-4', name: 'Corporación Logística Castellana S.L.', account: 'ES210001000299887744' },
  { id: 'corp-5', name: 'Promotora de Espacios Comerciales S.A.', account: 'ES210001000299887755' },
];

// Create tables "cuentas", "movimientos", "inmuebles", "adquisiciones", and "obligaciones_pago" if they do not exist
async function initSupabaseTables(): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!dbPool) {
    return { success: false, error: 'DATABASE_URL no está configurada' };
  }
  let client;
  try {
    client = await dbPool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS cuentas (
        id VARCHAR(255) PRIMARY KEY,
        alumno VARCHAR(255) NOT NULL,
        saldo NUMERIC(12, 2) NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS movimientos (
        id VARCHAR(255) PRIMARY KEY,
        cuenta_id VARCHAR(255) NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        importe NUMERIC(12, 2) NOT NULL DEFAULT 0,
        fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        concepto TEXT
      );

      CREATE TABLE IF NOT EXISTS inmuebles (
        id VARCHAR(255) PRIMARY KEY,
        titulo TEXT NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        operacion VARCHAR(50) NOT NULL,
        superficie_m2 NUMERIC(10, 2) NOT NULL,
        precio NUMERIC(12, 2) NOT NULL,
        precio_m2 NUMERIC(10, 2) NOT NULL,
        porcentaje_suelo NUMERIC(5, 2) NOT NULL,
        comunidad TEXT,
        municipio TEXT,
        direccion TEXT,
        imagen_url TEXT,
        estado VARCHAR(50) NOT NULL DEFAULT 'available',
        propietario_id VARCHAR(255),
        propietario_nombre TEXT,
        config_pago_aplazado JSONB,
        fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS adquisiciones (
        id VARCHAR(255) PRIMARY KEY,
        inmueble_id VARCHAR(255) NOT NULL,
        inmueble_titulo TEXT NOT NULL,
        inmueble_tipo VARCHAR(50) NOT NULL,
        operacion VARCHAR(50) NOT NULL,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        superficie_m2 NUMERIC(10, 2) NOT NULL,
        ubicacion TEXT,
        imagen_url TEXT,
        porcentaje_suelo NUMERIC(5, 2) NOT NULL,
        precio_base NUMERIC(12, 2) NOT NULL,
        importe_iva NUMERIC(12, 2) NOT NULL,
        precio_total NUMERIC(12, 2) NOT NULL,
        fecha_compra TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        metodo_pago VARCHAR(50) NOT NULL,
        alquiler_mensual NUMERIC(12, 2),
        proximo_pago_alquiler TIMESTAMPTZ,
        entrada_pagada NUMERIC(12, 2),
        saldo_pendiente NUMERIC(12, 2)
      );

      CREATE TABLE IF NOT EXISTS obligaciones_pago (
        id VARCHAR(255) PRIMARY KEY,
        adquisicion_id VARCHAR(255) NOT NULL,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        inmueble_titulo TEXT NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        importe NUMERIC(12, 2) NOT NULL,
        fecha_vencimiento TIMESTAMPTZ NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
        fecha_pago TIMESTAMPTZ,
        numero_cuota INT,
        total_cuotas INT
      );

      CREATE TABLE IF NOT EXISTS prestamos (
        id VARCHAR(255) PRIMARY KEY,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        alumno_cuenta VARCHAR(255),
        importe_solicitado NUMERIC(12, 2) NOT NULL,
        importe_ofrecido NUMERIC(12, 2) NOT NULL,
        importe_concedido NUMERIC(12, 2),
        plazo_meses INT NOT NULL,
        tipo_interes NUMERIC(5, 2) NOT NULL,
        euribor NUMERIC(5, 2) NOT NULL,
        diferencial NUMERIC(5, 2) NOT NULL,
        comision_apertura NUMERIC(12, 2) NOT NULL,
        cuota_mensual NUMERIC(12, 2) NOT NULL,
        garantia_tipo VARCHAR(50) NOT NULL,
        garantia_inmueble_id VARCHAR(255),
        garantia_inmueble_titulo TEXT,
        garantia_superficie_m2 NUMERIC(10, 2),
        garantia_valor_tasacion NUMERIC(12, 2) NOT NULL,
        estado VARCHAR(50) NOT NULL,
        requiere_profesor BOOLEAN NOT NULL DEFAULT FALSE,
        notas_profesor TEXT,
        fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        fecha_aceptacion TIMESTAMPTZ,
        tabla_amortizacion JSONB
      );
    `);
    console.log('[Supabase DB] Tables "cuentas", "movimientos", "inmuebles", "adquisiciones", "obligaciones_pago", "prestamos" verified/created.');
    return { success: true, message: 'Tablas de Supabase creadas o verificadas con éxito.' };
  } catch (error: any) {
    console.error('[Supabase DB] Error initializing tables in Supabase:', error);
    return { success: false, error: error.message || String(error) };
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Sync helper functions for Supabase
async function syncAccountToSupabase(id: string, alumno: string, saldo: number) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `INSERT INTO cuentas (id, alumno, saldo)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET alumno = EXCLUDED.alumno, saldo = EXCLUDED.saldo`,
      [id, alumno, saldo]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing account to Supabase:', e);
  }
}

async function deleteAccountFromSupabase(id: string) {
  if (!dbPool) return;
  try {
    await dbPool.query('DELETE FROM cuentas WHERE id = $1', [id]);
  } catch (e) {
    console.error('[Supabase DB] Error deleting account from Supabase:', e);
  }
}

async function syncMovimientoToSupabase(id: string, cuentaId: string, tipo: string, importe: number, fecha: string, concepto: string) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `INSERT INTO movimientos (id, cuenta_id, tipo, importe, fecha, concepto)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [id, cuentaId, tipo, importe, new Date(fecha), concepto]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing movement to Supabase:', e);
  }
}

async function syncPropertyToSupabase(prop: PropertyListing) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `INSERT INTO inmuebles (id, titulo, tipo, operacion, superficie_m2, precio, precio_m2, porcentaje_suelo, comunidad, municipio, direccion, imagen_url, estado, propietario_id, propietario_nombre, config_pago_aplazado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET 
         estado = EXCLUDED.estado, 
         propietario_id = EXCLUDED.propietario_id, 
         propietario_nombre = EXCLUDED.propietario_nombre, 
         precio = EXCLUDED.precio`,
      [
        prop.id,
        prop.title,
        prop.type,
        prop.operation,
        prop.surfaceM2,
        prop.price,
        prop.pricePerM2,
        prop.landPercentage,
        prop.community,
        prop.municipality,
        prop.address,
        prop.imageUrl,
        prop.status,
        prop.ownerId || 'corp-1',
        prop.ownerName || 'Inmobiliaria Polígonos de España S.A.',
        prop.deferredPaymentConfig ? JSON.stringify(prop.deferredPaymentConfig) : null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing property to Supabase:', e);
  }
}

async function deletePropertyFromSupabase(id: string) {
  if (!dbPool) return;
  try {
    await dbPool.query('DELETE FROM inmuebles WHERE id = $1', [id]);
  } catch (e) {
    console.error('[Supabase DB] Error deleting property from Supabase:', e);
  }
}

async function syncAcquisitionToSupabase(acq: PropertyAcquisition) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `INSERT INTO adquisiciones (id, inmueble_id, inmueble_titulo, inmueble_tipo, operacion, alumno_id, alumno_nombre, superficie_m2, ubicacion, imagen_url, porcentaje_suelo, precio_base, importe_iva, precio_total, fecha_compra, metodo_pago, alquiler_mensual, proximo_pago_alquiler, entrada_pagada, saldo_pendiente)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (id) DO UPDATE SET 
         saldo_pendiente = EXCLUDED.saldo_pendiente,
         proximo_pago_alquiler = EXCLUDED.proximo_pago_alquiler`,
      [
        acq.id,
        acq.propertyId,
        acq.propertyTitle,
        acq.propertyType,
        acq.operation,
        acq.studentId,
        acq.studentName,
        acq.surfaceM2,
        acq.location,
        acq.imageUrl,
        acq.landPercentage,
        acq.basePrice,
        acq.ivaAmount,
        acq.totalPrice,
        new Date(acq.purchaseDate),
        acq.paymentMethod,
        acq.monthlyRent || null,
        acq.nextRentDueDate ? new Date(acq.nextRentDueDate) : null,
        acq.downPaymentPaid || null,
        acq.pendingBalance !== undefined ? acq.pendingBalance : null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing acquisition to Supabase:', e);
  }
}

async function syncObligationToSupabase(ob: PaymentObligation) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `INSERT INTO obligaciones_pago (id, adquisicion_id, alumno_id, alumno_nombre, inmueble_titulo, tipo, importe, fecha_vencimiento, estado, fecha_pago, numero_cuota, total_cuotas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET 
         estado = EXCLUDED.estado, 
         fecha_pago = EXCLUDED.fecha_pago`,
      [
        ob.id,
        ob.acquisitionId,
        ob.studentId,
        ob.studentName,
        ob.propertyTitle,
        ob.type,
        ob.amount,
        new Date(ob.dueDate),
        ob.status,
        ob.paidDate ? new Date(ob.paidDate) : null,
        ob.installmentNumber || 1,
        ob.totalInstallments || 1
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing obligation to Supabase:', e);
  }
}

async function syncLoanToSupabase(loan: BankLoan) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `INSERT INTO prestamos (
        id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido, importe_concedido,
        plazo_meses, tipo_interes, euribor, diferencial, comision_apertura, cuota_mensual,
        garantia_tipo, garantia_inmueble_id, garantia_inmueble_titulo, garantia_superficie_m2, garantia_valor_tasacion,
        estado, requiere_profesor, notas_profesor, fecha_creacion, fecha_aceptacion, tabla_amortizacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (id) DO UPDATE SET
        importe_ofrecido = EXCLUDED.importe_ofrecido,
        importe_concedido = EXCLUDED.importe_concedido,
        plazo_meses = EXCLUDED.plazo_meses,
        tipo_interes = EXCLUDED.tipo_interes,
        comision_apertura = EXCLUDED.comision_apertura,
        cuota_mensual = EXCLUDED.cuota_mensual,
        estado = EXCLUDED.estado,
        notas_profesor = EXCLUDED.notas_profesor,
        fecha_aceptacion = EXCLUDED.fecha_aceptacion,
        tabla_amortizacion = EXCLUDED.tabla_amortizacion`,
      [
        loan.id,
        loan.studentId,
        loan.studentName,
        loan.studentAccount,
        loan.requestedAmount,
        loan.offeredAmount,
        loan.approvedAmount || null,
        loan.termMonths,
        loan.annualInterestRate,
        loan.euriborRate,
        loan.spread,
        loan.openingFee,
        loan.monthlyPayment,
        loan.collateral.type,
        loan.collateral.propertyId || null,
        loan.collateral.propertyTitle || null,
        loan.collateral.surfaceM2 || null,
        loan.collateral.appraisalValue,
        loan.status,
        loan.requiresTeacherApproval,
        loan.teacherNotes || null,
        new Date(loan.createdAt),
        loan.acceptedAt ? new Date(loan.acceptedAt) : null,
        JSON.stringify(loan.schedule)
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing loan to Supabase:', e);
  }
}

async function syncAllToSupabase(db: DatabaseSchema) {
  if (!dbPool) return;
  try {
    for (const user of db.users) {
      if (user.role === 'student') {
        await syncAccountToSupabase(user.id, user.name, user.balance);
      }
    }
    for (const tx of db.transfers) {
      await syncMovimientoToSupabase(tx.id + '-out', tx.senderId, 'TRANSFER_OUT', tx.amount, tx.timestamp, tx.concept);
      await syncMovimientoToSupabase(tx.id + '-in', tx.receiverId, 'TRANSFER_IN', tx.amount, tx.timestamp, tx.concept);
    }
    if (db.properties) {
      for (const prop of db.properties) {
        await syncPropertyToSupabase(prop);
      }
    }
    if (db.acquisitions) {
      for (const acq of db.acquisitions) {
        await syncAcquisitionToSupabase(acq);
      }
    }
    if (db.paymentObligations) {
      for (const ob of db.paymentObligations) {
        await syncObligationToSupabase(ob);
      }
    }
    if (db.loans) {
      for (const loan of db.loans) {
        await syncLoanToSupabase(loan);
      }
    }
  } catch (e) {
    console.error('[Supabase DB] Error in full Supabase sync:', e);
  }
}

// Restore data from Supabase into application state (Supabase as source of truth)
async function restoreFromSupabase(): Promise<{ restoredUsers: number; restoredMovements: number }> {
  if (!dbPool) return { restoredUsers: 0, restoredMovements: 0 };
  try {
    const client = await dbPool.connect();
    try {
      const resCuentas = await client.query('SELECT id, alumno, saldo FROM cuentas');
      
      // If Supabase has NO records, seed Supabase with current db.json state
      if (resCuentas.rows.length === 0) {
        console.log('[Supabase Sync] Supabase "cuentas" table is empty. Seeding Supabase with local data...');
        const currentDb = readDb();
        await syncAllToSupabase(currentDb);
        return { restoredUsers: 0, restoredMovements: 0 };
      }

      console.log(`[Supabase Restore] Found ${resCuentas.rows.length} accounts in Supabase. Restoring to application database...`);
      const resMov = await client.query('SELECT id, cuenta_id, tipo, importe, fecha, concepto FROM movimientos ORDER BY fecha DESC');
      const resInm = await client.query('SELECT * FROM inmuebles ORDER BY fecha_creacion DESC');
      const resAcq = await client.query('SELECT * FROM adquisiciones ORDER BY fecha_compra DESC');
      const resObl = await client.query('SELECT * FROM obligaciones_pago ORDER BY fecha_vencimiento ASC');
      let resLoans: any = { rows: [] };
      try {
        resLoans = await client.query('SELECT * FROM prestamos ORDER BY fecha_creacion DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Prestamos table select warning:', e);
      }

      const db = readDb();

      // Synchronize students and balances from Supabase "cuentas"
      for (const row of resCuentas.rows) {
        const rowId = String(row.id);
        const rowAlumno = String(row.alumno);
        const rowSaldo = Number(row.saldo);

        let user = db.users.find(u => u.id === rowId || u.name.toLowerCase() === rowAlumno.toLowerCase());
        if (user) {
          user.balance = rowSaldo;
          user.name = rowAlumno;
        } else {
          // Add student if missing locally
          const newUser: User = {
            id: rowId,
            username: rowAlumno.toLowerCase().replace(/[^a-z0-9]/gi, ''),
            password: '123',
            role: 'student',
            name: rowAlumno,
            accountNumber: generateIBAN(),
            balance: rowSaldo
          };
          db.users.push(newUser);
        }
      }

      // Reconstruct db.transfers from "movimientos"
      const outMovs = resMov.rows.filter(r => r.tipo === 'TRANSFER_OUT');
      const inMovs = resMov.rows.filter(r => r.tipo === 'TRANSFER_IN');

      const restoredTransfers: Transfer[] = [];

      for (const outRow of outMovs) {
        const txId = String(outRow.id).replace(/-out$/, '');
        const sender = db.users.find(u => u.id === outRow.cuenta_id);
        const matchingIn = inMovs.find(inRow => 
          String(inRow.id) === txId + '-in' || 
          (inRow.concepto === outRow.concepto && Number(inRow.importe) === Number(outRow.importe) && Math.abs(new Date(inRow.fecha).getTime() - new Date(outRow.fecha).getTime()) < 5000)
        );
        const receiver = matchingIn ? db.users.find(u => u.id === matchingIn.cuenta_id) : undefined;

        restoredTransfers.push({
          id: txId,
          senderId: sender ? sender.id : outRow.cuenta_id,
          senderName: sender ? sender.name : (outRow.cuenta_id || 'Alumno'),
          senderAccount: sender ? sender.accountNumber : 'ES000000000000000000',
          receiverId: receiver ? receiver.id : (matchingIn ? matchingIn.cuenta_id : 'corp-1'),
          receiverName: receiver ? receiver.name : 'Inmobiliaria / Entidad Mercantil',
          receiverAccount: receiver ? receiver.accountNumber : 'ES210001000299887711',
          amount: Number(outRow.importe),
          concept: outRow.concepto || 'Transferencia',
          timestamp: new Date(outRow.fecha).toISOString()
        });
      }

      if (restoredTransfers.length > 0) {
        db.transfers = restoredTransfers;
      }

      // Reconstruct db.properties from Supabase "inmuebles"
      if (resInm.rows.length > 0) {
        db.properties = resInm.rows.map(row => ({
          id: String(row.id),
          title: String(row.titulo),
          type: String(row.tipo) as PropertyType,
          operation: String(row.operacion) as OperationType,
          surfaceM2: Number(row.superficie_m2),
          price: Number(row.precio),
          pricePerM2: Number(row.precio_m2),
          ivaRate: 0.21,
          landPercentage: Number(row.porcentaje_suelo),
          locationScope: 'municipio',
          community: row.comunidad || 'Comunidad de Madrid',
          municipality: row.municipio || 'Madrid',
          address: row.direccion || 'Calle Principal, Nº 1',
          imageUrl: row.imagen_url || PROPERTY_IMAGES.local_comercial[0],
          status: row.estado as ('available' | 'sold' | 'rented'),
          ownerId: row.propietario_id || 'corp-1',
          ownerName: row.propietario_nombre || 'Inmobiliaria Polígonos de España S.A.',
          deferredPaymentConfig: row.config_pago_aplazado ? (typeof row.config_pago_aplazado === 'string' ? JSON.parse(row.config_pago_aplazado) : row.config_pago_aplazado) : undefined,
          createdTimestamp: row.fecha_creacion ? new Date(row.fecha_creacion).toISOString() : new Date().toISOString()
        }));
      }

      // Reconstruct db.acquisitions from Supabase "adquisiciones"
      if (resAcq.rows.length > 0) {
        db.acquisitions = resAcq.rows.map(row => ({
          id: String(row.id),
          propertyId: String(row.inmueble_id),
          propertyTitle: String(row.inmueble_titulo),
          propertyType: String(row.inmueble_tipo) as PropertyType,
          operation: String(row.operacion) as OperationType,
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          surfaceM2: Number(row.superficie_m2),
          location: String(row.ubicacion),
          imageUrl: String(row.imagen_url),
          landPercentage: Number(row.porcentaje_suelo),
          basePrice: Number(row.precio_base),
          ivaAmount: Number(row.importe_iva),
          totalPrice: Number(row.precio_total),
          purchaseDate: new Date(row.fecha_compra).toISOString(),
          paymentMethod: String(row.metodo_pago) as any,
          monthlyRent: row.alquiler_mensual ? Number(row.alquiler_mensual) : undefined,
          nextRentDueDate: row.proximo_pago_alquiler ? new Date(row.proximo_pago_alquiler).toISOString() : undefined,
          downPaymentPaid: row.entrada_pagada ? Number(row.entrada_pagada) : undefined,
          pendingBalance: row.saldo_pendiente ? Number(row.saldo_pendiente) : undefined
        }));
      }

      // Reconstruct db.paymentObligations from Supabase "obligaciones_pago"
      if (resObl.rows.length > 0) {
        db.paymentObligations = resObl.rows.map(row => ({
          id: String(row.id),
          acquisitionId: String(row.adquisicion_id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          propertyTitle: String(row.inmueble_titulo),
          type: String(row.tipo) as any,
          amount: Number(row.importe),
          dueDate: new Date(row.fecha_vencimiento).toISOString(),
          status: String(row.estado) as ('pendiente' | 'pagado'),
          paidDate: row.fecha_pago ? new Date(row.fecha_pago).toISOString() : undefined,
          installmentNumber: Number(row.numero_cuota || 1),
          totalInstallments: Number(row.total_cuotas || 1)
        }));
      }

      // Reconstruct db.loans from Supabase "prestamos"
      if (resLoans.rows.length > 0) {
        db.loans = resLoans.rows.map(row => ({
          id: String(row.id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          studentAccount: String(row.alumno_cuenta || ''),
          requestedAmount: Number(row.importe_solicitado),
          offeredAmount: Number(row.importe_ofrecido),
          approvedAmount: row.importe_concedido ? Number(row.importe_concedido) : undefined,
          termMonths: Number(row.plazo_meses),
          annualInterestRate: Number(row.tipo_interes),
          euriborRate: Number(row.euribor || 3.50),
          spread: Number(row.diferencial || 1.00),
          openingFee: Number(row.comision_apertura),
          monthlyPayment: Number(row.cuota_mensual),
          collateral: {
            type: String(row.garantia_tipo) as ('property' | 'private_residence'),
            propertyId: row.garantia_inmueble_id ? String(row.garantia_inmueble_id) : undefined,
            propertyTitle: row.garantia_inmueble_titulo ? String(row.garantia_inmueble_titulo) : undefined,
            surfaceM2: Number(row.garantia_superficie_m2 || 0),
            appraisalValue: Number(row.garantia_valor_tasacion)
          },
          status: String(row.estado) as any,
          requiresTeacherApproval: Boolean(row.requiere_profesor),
          teacherNotes: row.notas_profesor ? String(row.notas_profesor) : undefined,
          createdAt: row.fecha_creacion ? new Date(row.fecha_creacion).toISOString() : new Date().toISOString(),
          acceptedAt: row.fecha_aceptacion ? new Date(row.fecha_aceptacion).toISOString() : undefined,
          schedule: row.tabla_amortizacion ? (typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion) : []
        }));
      }

      db.isSeed = false;
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
      console.log(`[Supabase Restore] Successfully restored ${resCuentas.rows.length} accounts, ${restoredTransfers.length} transfers, ${db.properties.length} properties, ${db.acquisitions.length} acquisitions, ${db.paymentObligations.length} obligations, and ${resLoans.rows.length} loans from Supabase!`);
      return { restoredUsers: resCuentas.rows.length, restoredMovements: resMov.rows.length };
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[Supabase Restore Error]', e);
    return { restoredUsers: 0, restoredMovements: 0 };
  }
}

// Middleware to parse JSON
app.use(express.json());

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
    req.url.startsWith('/properties') ||
    req.url.startsWith('/company') ||
    req.url.startsWith('/obligations') ||
    req.url.startsWith('/reset-simulation')
  );

  if (shouldRewrite) {
    req.url = '/api' + req.url;
  }
  next();
});

function getDefaultSeedProperties(): PropertyListing[] {
  return [
    {
      id: 'inm-1',
      title: 'Nave Industrial Diáfana en Polígono Industrial',
      type: 'nave_industrial',
      operation: 'compra',
      surfaceM2: 850,
      price: 765000,
      pricePerM2: 900,
      ivaRate: 0.21,
      landPercentage: 65,
      locationScope: 'municipio',
      community: 'Comunidad de Madrid',
      municipality: 'Getafe',
      address: 'Polígono Industrial Los Olivos, Nº 14, Getafe',
      imageUrl: PROPERTY_IMAGES.nave_industrial[0],
      status: 'available',
      ownerId: REALISTIC_CORPORATE_SELLERS[0].id,
      ownerName: REALISTIC_CORPORATE_SELLERS[0].name,
      deferredPaymentConfig: {
        allowed: true,
        minDownPaymentPercent: 20,
        installmentsCount: 12,
        instrument: 'pagare',
        interestRatePercent: 0
      },
      createdTimestamp: new Date().toISOString()
    },
    {
      id: 'inm-2',
      title: 'Local Comercial Esquina de Gran Afluencia',
      type: 'local_comercial',
      operation: 'alquiler',
      surfaceM2: 180,
      price: 2400,
      pricePerM2: 13.33,
      ivaRate: 0.21,
      landPercentage: 60,
      locationScope: 'municipio',
      community: 'Cataluña',
      municipality: 'Barcelona',
      address: 'Calle Comercio, Nº 42, Barcelona',
      imageUrl: PROPERTY_IMAGES.local_comercial[0],
      status: 'available',
      ownerId: REALISTIC_CORPORATE_SELLERS[2].id,
      ownerName: REALISTIC_CORPORATE_SELLERS[2].name,
      createdTimestamp: new Date().toISOString()
    },
    {
      id: 'inm-3',
      title: 'Almacén Logístico con Muelles de Carga',
      type: 'almacen',
      operation: 'compra',
      surfaceM2: 1200,
      price: 840000,
      pricePerM2: 700,
      ivaRate: 0.21,
      landPercentage: 70,
      locationScope: 'municipio',
      community: 'Comunitat Valenciana',
      municipality: 'Paterna',
      address: 'Avenida del Euro, Nº 8, Paterna',
      imageUrl: PROPERTY_IMAGES.almacen[0],
      status: 'available',
      ownerId: REALISTIC_CORPORATE_SELLERS[3].id,
      ownerName: REALISTIC_CORPORATE_SELLERS[3].name,
      deferredPaymentConfig: {
        allowed: true,
        minDownPaymentPercent: 25,
        installmentsCount: 12,
        instrument: 'letra_cambio',
        interestRatePercent: 0
      },
      createdTimestamp: new Date().toISOString()
    },
    {
      id: 'inm-4',
      title: 'Nave Industrial Acondicionada',
      type: 'nave_industrial',
      operation: 'alquiler',
      surfaceM2: 600,
      price: 3200,
      pricePerM2: 5.33,
      ivaRate: 0.21,
      landPercentage: 58,
      locationScope: 'municipio',
      community: 'Andalucía',
      municipality: 'Sevilla',
      address: 'Polígono Empresarial Norte, Nº 22, Sevilla',
      imageUrl: PROPERTY_IMAGES.nave_industrial[1],
      status: 'available',
      ownerId: REALISTIC_CORPORATE_SELLERS[1].id,
      ownerName: REALISTIC_CORPORATE_SELLERS[1].name,
      createdTimestamp: new Date().toISOString()
    },
    {
      id: 'inm-5',
      title: 'Local Comercial Reformado',
      type: 'local_comercial',
      operation: 'compra',
      surfaceM2: 140,
      price: 392000,
      pricePerM2: 2800,
      ivaRate: 0.21,
      landPercentage: 68,
      locationScope: 'municipio',
      community: 'País Vasco',
      municipality: 'Bilbao',
      address: 'Calle del Carmen, Nº 5, Bilbao',
      imageUrl: PROPERTY_IMAGES.local_comercial[1],
      status: 'available',
      ownerId: REALISTIC_CORPORATE_SELLERS[4].id,
      ownerName: REALISTIC_CORPORATE_SELLERS[4].name,
      deferredPaymentConfig: {
        allowed: true,
        minDownPaymentPercent: 30,
        installmentsCount: 6,
        instrument: 'pagare',
        interestRatePercent: 0
      },
      createdTimestamp: new Date().toISOString()
    }
  ];
}

// Initialize / Get Database Helper
function readDb(): DatabaseSchema {
  if (!fs.existsSync(DB_FILE)) {
    const defaultDb: DatabaseSchema = {
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
          timestamp: new Date(Date.now() - 3600000 * 5).toISOString()
        }
      ],
      systemLogs: [
        {
          id: 'log-seed',
          action: 'CREATE_USER',
          details: 'Sistema iniciado y cuentas preestablecidas creadas.',
          timestamp: new Date().toISOString()
        }
      ],
      properties: getDefaultSeedProperties(),
      acquisitions: [],
      paymentObligations: [],
      loans: [],
      defaultInitialBalance: 1000,
      isSeed: true
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf-8');
    return defaultDb;
  }

  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(data) as DatabaseSchema;

    if (!db.properties || db.properties.length === 0) {
      db.properties = getDefaultSeedProperties();
    }
    if (!db.acquisitions) db.acquisitions = [];
    if (!db.paymentObligations) db.paymentObligations = [];
    if (!db.loans) db.loans = [];

    let teacher = db.users.find(u => u.role === 'teacher' || u.id === 'profesor-1');
    if (teacher) {
      if (teacher.username !== 'pupdaniel' || teacher.password !== '1987') {
        teacher.username = 'pupdaniel';
        teacher.password = '1987';
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
      }
    } else {
      db.users.unshift({
        id: 'profesor-1',
        username: 'pupdaniel',
        password: '1987',
        role: 'teacher',
        name: 'Profesor de Contabilidad',
        accountNumber: 'ES000000000000000000',
        balance: 0
      });
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    }
    return db;
  } catch (error) {
    console.error("Error reading database, recreating default:", error);
    const defaultDb: DatabaseSchema = {
      users: [
        {
          id: 'profesor-1',
          username: 'pupdaniel',
          password: '1987',
          role: 'teacher',
          name: 'Profesor de Contabilidad',
          accountNumber: 'ES000000000000000000',
          balance: 0
        }
      ],
      transfers: [],
      systemLogs: [],
      properties: getDefaultSeedProperties(),
      acquisitions: [],
      paymentObligations: [],
      loans: [],
      defaultInitialBalance: 1000,
      isSeed: true
    };
    return defaultDb;
  }
}

function writeDb(db: DatabaseSchema) {
  db.isSeed = false;
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  syncAllToSupabase(db).catch(err => {
    console.error('[Supabase Sync Error]', err);
  });
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

// ---------------- API ENDPOINTS ----------------

// Supabase Status Endpoint
app.get('/api/supabase-status', async (req, res) => {
  if (!dbPool) {
    return res.json({ 
      connected: false, 
      message: 'DATABASE_URL no está configurada',
      dbUrlMasked: ''
    });
  }
  try {
    const client = await dbPool.connect();
    try {
      const resCuentas = await client.query('SELECT COUNT(*) FROM cuentas');
      const resMov = await client.query('SELECT COUNT(*) FROM movimientos');
      res.json({
        connected: true,
        cuentasCount: Number(resCuentas.rows[0].count),
        movimientosCount: Number(resMov.rows[0].count),
        dbUrlMasked: maskDbUrl(process.env.DATABASE_URL)
      });
    } finally {
      client.release();
    }
  } catch (e: any) {
    res.json({ 
      connected: false, 
      error: e.message || String(e),
      dbUrlMasked: maskDbUrl(process.env.DATABASE_URL)
    });
  }
});

// Supabase Connect / Reconfigure Endpoint
app.post('/api/supabase-connect', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ success: false, error: 'Proporciona una URL válida (DATABASE_URL)' });
  }

  const cleanUrl = url.trim();
  try {
    initPgPool(cleanUrl);
    const tableInit = await initSupabaseTables();
    if (!tableInit.success) {
      return res.status(500).json({ success: false, error: tableInit.error });
    }

    const restoreRes = await restoreFromSupabase();

    // Verify record counts
    let cuentasCount = 0;
    let movimientosCount = 0;
    if (dbPool) {
      const client = await dbPool.connect();
      try {
        const cRes = await client.query('SELECT COUNT(*) FROM cuentas');
        const mRes = await client.query('SELECT COUNT(*) FROM movimientos');
        cuentasCount = Number(cRes.rows[0].count);
        movimientosCount = Number(mRes.rows[0].count);
      } finally {
        client.release();
      }
    }

    res.json({
      success: true,
      message: '¡Conectado a Supabase correctamente! Datos cargados y sincronizados desde la base de datos.',
      cuentasCount,
      movimientosCount,
      dbUrlMasked: maskDbUrl(cleanUrl)
    });
  } catch (e: any) {
    console.error('[Supabase Connect Error]', e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

// Supabase Manual Sync Endpoint
app.post('/api/supabase-sync', async (req, res) => {
  if (!dbPool) {
    return res.status(400).json({ success: false, error: 'DATABASE_URL no está configurada' });
  }
  try {
    const tableInit = await initSupabaseTables();
    if (!tableInit.success) {
      return res.status(500).json({ success: false, error: tableInit.error });
    }

    const restoreRes = await restoreFromSupabase();

    let cuentasCount = 0;
    let movimientosCount = 0;
    const client = await dbPool.connect();
    try {
      const cRes = await client.query('SELECT COUNT(*) FROM cuentas');
      const mRes = await client.query('SELECT COUNT(*) FROM movimientos');
      cuentasCount = Number(cRes.rows[0].count);
      movimientosCount = Number(mRes.rows[0].count);
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: 'Sincronización y restauración con Supabase completada con éxito.',
      cuentasCount,
      movimientosCount
    });
  } catch (e: any) {
    console.error('[Supabase Sync Error]', e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

// Authenticate / Login
const loginHandler = (req: express.Request, res: express.Response) => {
  const { username, password } = req.body;
  
  console.log('[LOGIN] Request received. Username:', username, 'Password:', password ? '****' : 'empty');

  // Log to database systemLogs for diagnostic tracking
  try {
    const db = readDb();
    const newLog: SystemLog = {
      id: generateId('log-debug'),
      action: 'LOGIN_ATTEMPT',
      details: `Intento de acceso recibido: usuario "${username || 'vacío'}".`,
      timestamp: new Date().toISOString()
    };
    db.systemLogs.unshift(newLog);
    writeDb(db);
  } catch (e) {
    console.error('Failed to write login attempt log:', e);
  }

  if (!username || !password) {
    console.log('[LOGIN] Failed: Missing username or password');
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const db = readDb();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

  if (!user) {
    console.log('[LOGIN] Failed: Credentials do not match any active user');
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  console.log('[LOGIN] Success! Matched user:', user.name, 'Role:', user.role);

  // Exclude password from response
  const { password: _, ...userWithoutPassword } = user;
  res.json({ user: userWithoutPassword });
};

app.post('/api/login', loginHandler);
app.post('/api/auth/login', loginHandler);
app.post('/api/acceso', loginHandler);
app.post('/api/entrar', loginHandler);
app.post('/acceso', loginHandler);
app.post('/entrar', loginHandler);
app.post('/login', loginHandler);

// Get users list
// Note: If teacher, returns full details (with passwords so they can hand them out!).
// If student, returns limited public info (name, username, accountNumber) for transfer targets.
app.get('/api/users', (req, res) => {
  const role = req.query.role as string;
  const db = readDb();

  if (role === 'teacher') {
    res.json({ users: db.users, instanceId: SERVER_INSTANCE_ID, isSeed: db.isSeed || false, supabaseConnected: !!dbPool });
  } else {
    // Only return students and filter out password/admin details
    const publicStudents = db.users
      .filter(u => u.role === 'student')
      .map(({ password: _, ...u }) => u);
    res.json({ users: publicStudents });
  }
});

// Create new bank user account (Teacher only)
app.post('/api/users', (req, res) => {
  const { name, username, password, initialBalance } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña son requeridos' });
  }

  const db = readDb();
  const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());
  
  if (exists) {
    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }

  const newUser: User = {
    id: generateId('user'),
    username: username.toLowerCase().trim(),
    password: password.trim(),
    role: 'student',
    name: name.trim(),
    accountNumber: generateIBAN(),
    balance: Number(initialBalance) || 0
  };

  db.users.push(newUser);
  if (newUser.role === 'student') {
    syncAccountToSupabase(newUser.id, newUser.name, newUser.balance).catch(e => console.error(e));
  }

  const newLog: SystemLog = {
    id: generateId('log'),
    action: 'CREATE_USER',
    details: `Cuenta creada: ${newUser.name} (${newUser.username}) con saldo inicial de ${newUser.balance} €`,
    timestamp: new Date().toISOString()
  };
  db.systemLogs.unshift(newLog);

  writeDb(db);
  res.status(201).json({ user: newUser });
});

// Update user details (Teacher only)
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, username, password } = req.body;

  const db = readDb();
  const userIndex = db.users.findIndex(u => u.id === id);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const user = db.users[userIndex];
  
  if (username && username.toLowerCase().trim() !== user.username) {
    const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase().trim() && u.id !== id);
    if (exists) {
      return res.status(400).json({ error: 'El nombre de usuario ya está tomado' });
    }
    user.username = username.toLowerCase().trim();
  }

  if (name) user.name = name.trim();
  if (password) user.password = password.trim();

  if (user.role === 'student') {
    syncAccountToSupabase(user.id, user.name, user.balance).catch(e => console.error(e));
  }

  const newLog: SystemLog = {
    id: generateId('log'),
    action: 'UPDATE_USER',
    details: `Detalles de cuenta actualizados: ${user.name} (${user.username})`,
    timestamp: new Date().toISOString()
  };
  db.systemLogs.unshift(newLog);

  writeDb(db);
  res.json({ user });
});

// Adjust balance of a user (Teacher only)
app.put('/api/users/:id/adjust-balance', (req, res) => {
  const { id } = req.params;
  const { amount, actionType } = req.body; // actionType: 'add' | 'subtract' | 'set'

  if (amount === undefined || isNaN(Number(amount))) {
    return res.status(400).json({ error: 'Cantidad inválida' });
  }

  const db = readDb();
  const userIndex = db.users.findIndex(u => u.id === id);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const user = db.users[userIndex];
  const oldBalance = user.balance;
  const changeValue = Number(amount);

  if (actionType === 'add') {
    user.balance += changeValue;
  } else if (actionType === 'subtract') {
    user.balance = Math.max(0, user.balance - changeValue);
  } else if (actionType === 'set') {
    user.balance = Math.max(0, changeValue);
  }

  if (user.role === 'student') {
    syncAccountToSupabase(user.id, user.name, user.balance).catch(e => console.error(e));
  }

  const newLog: SystemLog = {
    id: generateId('log'),
    action: 'BALANCE_ADJUSTMENT',
    details: `Ajuste de saldo para ${user.name}. Tipo: ${actionType}, Cantidad: ${changeValue} €, Anterior: ${oldBalance} €, Nuevo: ${user.balance} €`,
    timestamp: new Date().toISOString()
  };
  db.systemLogs.unshift(newLog);

  writeDb(db);
  res.json({ user });
});

// Delete user account (Teacher only)
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;

  const db = readDb();
  const user = db.users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  if (user.role === 'teacher') {
    return res.status(400).json({ error: 'No se puede eliminar la cuenta del profesor principal' });
  }

  db.users = db.users.filter(u => u.id !== id);
  deleteAccountFromSupabase(id).catch(e => console.error(e));

  const newLog: SystemLog = {
    id: generateId('log'),
    action: 'DELETE_USER',
    details: `Cuenta eliminada: ${user.name} (${user.username}), saldo restante de ${user.balance} €`,
    timestamp: new Date().toISOString()
  };
  db.systemLogs.unshift(newLog);

  writeDb(db);
  res.json({ success: true, message: 'Usuario eliminado exitosamente' });
});

// Create transfer between students
app.post('/api/transfers', (req, res) => {
  const { senderId, receiverId, amount, concept } = req.body;

  if (!senderId || !receiverId || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Datos de transferencia inválidos o cantidad menor/igual a cero' });
  }

  if (senderId === receiverId) {
    return res.status(400).json({ error: 'No puedes hacerte una transferencia a ti mismo' });
  }

  const db = readDb();

  // Process automatic payments for sender first
  processStudentAutomaticPayments(db, senderId);
  const senderStatus = getStudentPaymentStatus(db, senderId);
  if (senderStatus.isBlocked) {
    return res.status(400).json({
      error: `Operación denegada: Tu cuenta tiene pagos vencidos impagados por un total de ${senderStatus.totalOverdueAmount.toLocaleString('es-ES')} € (incluyendo el 5% de interés de demora). Tu cuenta no puede quedar en números rojos. Las salidas manuales de dinero están bloqueadas hasta regularizar tu saldo.`
    });
  }

  const senderIndex = db.users.findIndex(u => u.id === senderId);
  const receiverIndex = db.users.findIndex(u => u.id === receiverId);

  if (senderIndex === -1) {
    return res.status(404).json({ error: 'Emisor no encontrado' });
  }
  if (receiverIndex === -1) {
    return res.status(404).json({ error: 'Destinatario no encontrado' });
  }

  const sender = db.users[senderIndex];
  const receiver = db.users[receiverIndex];
  const transferAmount = Number(amount);

  if (sender.balance < transferAmount) {
    return res.status(400).json({ error: 'Saldo insuficiente para completar la transferencia' });
  }

  // Deduct from sender and add to receiver
  sender.balance = Number((sender.balance - transferAmount).toFixed(2));
  receiver.balance = Number((receiver.balance + transferAmount).toFixed(2));

  // Process automatic payments for receiver in case incoming funds settle overdue debt
  if (receiver.role === 'student') {
    processStudentAutomaticPayments(db, receiver.id);
  }

  const newTransfer: Transfer = {
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

  db.transfers.unshift(newTransfer);
  writeDb(db);

  // Sync balances and transfer movements to Supabase PostgreSQL
  if (sender.role === 'student') syncAccountToSupabase(sender.id, sender.name, sender.balance).catch(e => console.error(e));
  if (receiver.role === 'student') syncAccountToSupabase(receiver.id, receiver.name, receiver.balance).catch(e => console.error(e));
  syncMovimientoToSupabase(newTransfer.id + '-out', sender.id, 'TRANSFER_OUT', transferAmount, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));
  syncMovimientoToSupabase(newTransfer.id + '-in', receiver.id, 'TRANSFER_IN', transferAmount, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));

  res.json({ success: true, transfer: newTransfer, senderBalance: sender.balance });
});

// Get transfers
app.get('/api/transfers', (req, res) => {
  const { userId, role } = req.query;
  const db = readDb();

  if (role === 'teacher') {
    res.json({ transfers: db.transfers });
  } else if (userId) {
    // Filter transfers involving this user as either sender or receiver
    const filtered = db.transfers.filter(tx => tx.senderId === userId || tx.receiverId === userId);
    res.json({ transfers: filtered });
  } else {
    res.status(400).json({ error: 'Se requiere userId o rol para ver el historial' });
  }
});

// Get system logs (Teacher only)
app.get('/api/logs', (req, res) => {
  const db = readDb();
  res.json({ logs: db.systemLogs });
});

// Reset simulation (Teacher only)
app.post('/api/reset-simulation', (req, res) => {
  const { keepUsers, defaultBalance } = req.body;
  const db = readDb();
  
  const initialBalanceValue = defaultBalance !== undefined ? Number(defaultBalance) : 1000;
  db.defaultInitialBalance = initialBalanceValue;

  if (keepUsers) {
    // Reset balances of all students to defaultBalance
    db.users = db.users.map(u => {
      if (u.role === 'student') {
        return { ...u, balance: initialBalanceValue };
      }
      return u;
    });
    // Clear all transfers
    db.transfers = [];
  } else {
    // Completely clear all student accounts and transactions
    db.users = db.users.filter(u => u.role === 'teacher');
    db.transfers = [];
  }

  // Create reset log
  const newLog: SystemLog = {
    id: generateId('log'),
    action: 'RESET_SIMULATION',
    details: `Simulación reiniciada. ¿Se mantuvieron usuarios?: ${keepUsers ? 'Sí (saldos restablecidos a ' + initialBalanceValue + ' €)' : 'No (todas las cuentas de alumnos eliminadas)'}`,
    timestamp: new Date().toISOString()
  };
  
  db.systemLogs = [newLog];
  writeDb(db);

  res.json({ success: true, message: 'La simulación se ha reiniciado correctamente' });
});

// Download full backup (Teacher only)
app.get('/api/backup', (req, res) => {
  try {
    const db = readDb();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=egobey_backup.json');
    res.send(JSON.stringify(db, null, 2));
  } catch (error: any) {
    res.status(500).json({ error: 'Error al generar la copia de seguridad: ' + error.message });
  }
});

// Restore full backup (Teacher only)
app.post('/api/restore', (req, res) => {
  try {
    const backup = req.body;
    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({ error: 'Formato de copia de seguridad inválido.' });
    }
    
    // Structure validation
    if (!Array.isArray(backup.users) || !Array.isArray(backup.transfers) || !Array.isArray(backup.systemLogs)) {
      return res.status(400).json({ error: 'La copia de seguridad no contiene la estructura requerida (users, transfers, systemLogs).' });
    }

    // Ensure there is a teacher, and preserve credentials
    let teacher = backup.users.find((u: any) => u.role === 'teacher' || u.id === 'profesor-1');
    if (!teacher) {
      backup.users.unshift({
        id: 'profesor-1',
        username: 'pupdaniel',
        password: '1987',
        role: 'teacher',
        name: 'Profesor de Contabilidad',
        accountNumber: 'ES000000000000000000',
        balance: 0
      });
    } else {
      teacher.username = 'pupdaniel';
      teacher.password = '1987';
    }

    writeDb(backup);

    // Append restoration log
    const db = readDb();
    const newLog: SystemLog = {
      id: generateId('log'),
      action: 'RESET_SIMULATION', // Using compatible system action
      details: 'Copia de seguridad restaurada de forma exitosa por el profesor.',
      timestamp: new Date().toISOString()
    };
    db.systemLogs.unshift(newLog);
    writeDb(db);

    res.json({ success: true, message: 'Copia de seguridad restaurada con éxito.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al restaurar la copia de seguridad: ' + error.message });
  }
});

// ================= REAL ESTATE & COMPANY PORTAL API ENDPOINTS =================

// Get all property listings
app.get('/api/properties', (req, res) => {
  const db = readDb();
  res.json({ properties: db.properties || [] });
});

// Publish single property or batch/group of properties (Teacher only)
app.post('/api/properties', (req, res) => {
  const { mode, property, batch } = req.body;
  const db = readDb();

  if (mode === 'single' && property) {
    const ownerName = property.ownerName && property.ownerName !== 'Profesor de Contabilidad' 
      ? property.ownerName 
      : REALISTIC_CORPORATE_SELLERS[0].name;

    const newProperty: PropertyListing = {
      id: generateId('inm'),
      title: property.title || 'Inmueble Comercial',
      type: property.type || 'local_comercial',
      operation: property.operation || 'compra',
      surfaceM2: Number(property.surfaceM2) || 150,
      price: Number(property.price) || 200000,
      pricePerM2: Number((Number(property.price) / Number(property.surfaceM2)).toFixed(2)),
      ivaRate: 0.21,
      landPercentage: Number(property.landPercentage) || generateLandPercentage(),
      locationScope: property.locationScope || 'municipio',
      community: property.community || 'Comunidad de Madrid',
      municipality: property.municipality || 'Madrid',
      address: property.address || `Calle Principal, Nº 12, ${property.municipality || 'Madrid'}`,
      imageUrl: property.imageUrl || getRandomElement(PROPERTY_IMAGES[property.type as PropertyType] || PROPERTY_IMAGES.local_comercial),
      status: 'available',
      ownerId: property.ownerId || REALISTIC_CORPORATE_SELLERS[0].id,
      ownerName,
      deferredPaymentConfig: property.deferredPaymentConfig,
      createdTimestamp: new Date().toISOString()
    };

    db.properties.unshift(newProperty);
    writeDb(db);
    syncPropertyToSupabase(newProperty).catch(e => console.error(e));

    return res.status(201).json({ success: true, message: 'Anuncio publicado exitosamente.', properties: [newProperty] });
  }

  if (mode === 'batch' && batch) {
    const count = Math.min(20, Math.max(1, Number(batch.count) || 3));
    const createdProperties: PropertyListing[] = [];

    for (let i = 0; i < count; i++) {
      const type: PropertyType = batch.type || getRandomElement(['nave_industrial', 'almacen', 'local_comercial']);
      const operation: OperationType = batch.operation || getRandomElement(['compra', 'alquiler']);
      const surfaceMin = Number(batch.surfaceMin) || 100;
      const surfaceMax = Number(batch.surfaceMax) || 300;
      const surfaceM2 = getRandomInt(surfaceMin, surfaceMax);

      const location = generateLocation(
        batch.locationScope || 'espana',
        batch.community,
        batch.municipality
      );

      let price: number;
      let pricePerM2: number;

      if (batch.priceMode === 'manual' && batch.manualPrice) {
        price = Number(batch.manualPrice);
        pricePerM2 = Number((price / surfaceM2).toFixed(2));
      } else {
        const calculated = calculateRealisticPrice(type, operation, surfaceM2, location.priceMultiplier);
        price = calculated.basePrice;
        pricePerM2 = calculated.pricePerM2;
      }

      const landPercentage = batch.manualLandPercentage ? Number(batch.manualLandPercentage) : generateLandPercentage();

      const typeLabels: Record<PropertyType, string> = {
        nave_industrial: 'Nave Industrial',
        almacen: 'Almacén Logístico',
        local_comercial: 'Local Comercial'
      };

      const title = `${typeLabels[type]} ${i + 1} de ${surfaceM2} m² en ${location.municipality}`;
      const imageUrl = getRandomElement(PROPERTY_IMAGES[type]);
      const randomVendor = REALISTIC_CORPORATE_SELLERS[i % REALISTIC_CORPORATE_SELLERS.length];

      const newProp: PropertyListing = {
        id: generateId('inm'),
        title,
        type,
        operation,
        surfaceM2,
        price,
        pricePerM2,
        ivaRate: 0.21,
        landPercentage,
        locationScope: batch.locationScope || 'espana',
        community: location.community,
        municipality: location.municipality,
        address: location.address,
        imageUrl,
        status: 'available',
        ownerId: randomVendor.id,
        ownerName: randomVendor.name,
        deferredPaymentConfig: operation === 'compra' && batch.deferredPaymentConfig?.allowed ? batch.deferredPaymentConfig : undefined,
        createdTimestamp: new Date().toISOString()
      };

      db.properties.unshift(newProp);
      createdProperties.push(newProp);
      syncPropertyToSupabase(newProp).catch(e => console.error(e));
    }

    writeDb(db);
    return res.status(201).json({ success: true, message: `Se han publicado ${createdProperties.length} anuncios correctamente.`, properties: createdProperties });
  }

  return res.status(400).json({ error: 'Configuración de publicación no válida.' });
});

// Delete property listing (Teacher only)
app.delete('/api/properties/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  
  const index = db.properties.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Anuncio de inmueble no encontrado' });
  }

  db.properties.splice(index, 1);
  writeDb(db);
  deletePropertyFromSupabase(id).catch(e => console.error(e));

  res.json({ success: true, message: 'Anuncio eliminado correctamente.' });
});

// Buy or Rent Property (Student Action)
app.post('/api/properties/buy-rent', (req, res) => {
  const { propertyId, studentId, useDeferredPayment } = req.body;
  const db = readDb();

  const property = db.properties.find(p => p.id === propertyId);
  if (!property) {
    return res.status(404).json({ error: 'Inmueble no encontrado' });
  }
  if (property.status !== 'available') {
    return res.status(400).json({ error: 'Este inmueble ya no se encuentra disponible' });
  }

  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Estudiante no encontrado' });
  }

  // Check for automatic payments and overdue debt blocking
  processStudentAutomaticPayments(db, studentId);
  const studentStatus = getStudentPaymentStatus(db, studentId);
  if (studentStatus.isBlocked) {
    return res.status(400).json({
      error: `Operación de compra/alquiler bloqueada: Tienes vencimientos impagados pendientes por un total de ${studentStatus.totalOverdueAmount.toLocaleString('es-ES')} € (incluyendo el 5% de interés de demora). Tu cuenta no puede quedar en números rojos. Las salidas manuales de dinero están bloqueadas hasta regularizar tu saldo.`
    });
  }

  const vendorName = property.ownerName && property.ownerName !== 'Profesor de Contabilidad' 
    ? property.ownerName 
    : 'Inmobiliaria Polígonos de España S.A.';
  const vendorId = property.ownerId && property.ownerId !== 'profesor-1' ? property.ownerId : 'corp-1';
  const vendorAccount = 'ES210001000299887711';

  const basePrice = property.price;
  const ivaAmount = Number((basePrice * property.ivaRate).toFixed(2));
  const totalPrice = Number((basePrice + ivaAmount).toFixed(2));

  // --- CASE 1: RENT (ALQUILER) ---
  if (property.operation === 'alquiler') {
    // Alquiler mensual + 21% IVA. Fianza inicial de 2 meses.
    const monthlyRentBase = basePrice;
    const monthlyIva = Number((monthlyRentBase * 0.21).toFixed(2));
    const monthlyRentTotal = Number((monthlyRentBase + monthlyIva).toFixed(2));

    const depositAmount = monthlyRentBase * 2; // Fianza
    const initialPaymentTotal = Number((depositAmount + monthlyRentTotal).toFixed(2));

    if (student.balance < initialPaymentTotal) {
      return res.status(400).json({
        error: `Saldo insuficiente. Se requieren ${initialPaymentTotal.toLocaleString('es-ES')} € (Fianza de 2 meses: ${depositAmount.toLocaleString('es-ES')} € + 1er Mes con IVA: ${monthlyRentTotal.toLocaleString('es-ES')} €)`
      });
    }

    // Deduct initial rent + deposit from student
    student.balance = Number((student.balance - initialPaymentTotal).toFixed(2));

    // Record transfer to realistic corporate vendor
    const newTransfer: Transfer = {
      id: generateId('tx'),
      senderId: student.id,
      senderName: student.name,
      senderAccount: student.accountNumber,
      receiverId: vendorId,
      receiverName: vendorName,
      receiverAccount: vendorAccount,
      amount: initialPaymentTotal,
      concept: `Alquiler e IVA (Fianza 2m + 1er mes): ${property.title}`,
      timestamp: new Date().toISOString()
    };
    db.transfers.unshift(newTransfer);

    // Create Acquisition record
    const acquisitionId = generateId('acq');
    const nextDueDate = new Date();
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    const acquisition: PropertyAcquisition = {
      id: acquisitionId,
      propertyId: property.id,
      propertyTitle: property.title,
      propertyType: property.type,
      operation: 'alquiler',
      studentId: student.id,
      studentName: student.name,
      surfaceM2: property.surfaceM2,
      location: `${property.address}, ${property.municipality}`,
      imageUrl: property.imageUrl,
      landPercentage: property.landPercentage,
      basePrice: monthlyRentBase,
      ivaAmount: monthlyIva,
      totalPrice: monthlyRentTotal,
      purchaseDate: new Date().toISOString(),
      paymentMethod: 'contado',
      monthlyRent: monthlyRentTotal,
      nextRentDueDate: nextDueDate.toISOString()
    };
    db.acquisitions.unshift(acquisition);

    // Schedule 11 remaining auto-domiciled monthly obligations
    const generatedObligations: PaymentObligation[] = [];
    for (let i = 1; i <= 11; i++) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i);

      const ob: PaymentObligation = {
        id: generateId('obl'),
        acquisitionId,
        studentId: student.id,
        studentName: student.name,
        propertyTitle: property.title,
        type: 'cuota_alquiler',
        amount: monthlyRentTotal,
        dueDate: dueDate.toISOString(),
        status: 'pendiente',
        installmentNumber: i + 1,
        totalInstallments: 12
      };
      db.paymentObligations.push(ob);
      generatedObligations.push(ob);
    }

    property.status = 'rented';
    writeDb(db);

    // Sync all new data to Supabase
    syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
    syncPropertyToSupabase(property).catch(e => console.error(e));
    syncAcquisitionToSupabase(acquisition).catch(e => console.error(e));
    syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', initialPaymentTotal, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));
    for (const ob of generatedObligations) {
      syncObligationToSupabase(ob).catch(e => console.error(e));
    }

    return res.json({
      success: true,
      message: `¡Contrato de alquiler formalizado con éxito! Se han deducido ${initialPaymentTotal.toLocaleString('es-ES')} € de fianza y primer mes de alquiler (IVA incl.).`,
      acquisition,
      updatedBalance: student.balance
    });
  }

  // --- CASE 2: PURCHASE (COMPRA) ---
  if (property.operation === 'compra') {
    const isDeferred = useDeferredPayment && property.deferredPaymentConfig?.allowed;

    if (!isDeferred) {
      // CASH PURCHASE (AL CONTADO)
      if (student.balance < totalPrice) {
        return res.status(400).json({
          error: `Saldo insuficiente para la compra al contado. Se requieren ${totalPrice.toLocaleString('es-ES')} € (Precio Base: ${basePrice.toLocaleString('es-ES')} € + IVA 21%: ${ivaAmount.toLocaleString('es-ES')} €)`
        });
      }

      // Deduct full amount
      student.balance = Number((student.balance - totalPrice).toFixed(2));

      // Record transfer to realistic corporate vendor
      const newTransfer: Transfer = {
        id: generateId('tx'),
        senderId: student.id,
        senderName: student.name,
        senderAccount: student.accountNumber,
        receiverId: vendorId,
        receiverName: vendorName,
        receiverAccount: vendorAccount,
        amount: totalPrice,
        concept: `Compra al contado + IVA 21%: ${property.title}`,
        timestamp: new Date().toISOString()
      };
      db.transfers.unshift(newTransfer);

      // Create Acquisition record
      const acquisition: PropertyAcquisition = {
        id: generateId('acq'),
        propertyId: property.id,
        propertyTitle: property.title,
        propertyType: property.type,
        operation: 'compra',
        studentId: student.id,
        studentName: student.name,
        surfaceM2: property.surfaceM2,
        location: `${property.address}, ${property.municipality}`,
        imageUrl: property.imageUrl,
        landPercentage: property.landPercentage,
        basePrice,
        ivaAmount,
        totalPrice,
        purchaseDate: new Date().toISOString(),
        paymentMethod: 'contado',
        downPaymentPaid: totalPrice,
        pendingBalance: 0
      };
      db.acquisitions.unshift(acquisition);

      property.status = 'sold';
      writeDb(db);

      // Sync all new data to Supabase
      syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
      syncPropertyToSupabase(property).catch(e => console.error(e));
      syncAcquisitionToSupabase(acquisition).catch(e => console.error(e));
      syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', totalPrice, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));

      return res.json({
        success: true,
        message: `¡Compra al contado completada con éxito! Has adquirido la propiedad por ${totalPrice.toLocaleString('es-ES')} € (IVA 21% incl.).`,
        acquisition,
        updatedBalance: student.balance
      });
    } else {
      // DEFERRED PAYMENT (PAGO APLAZADO CON PAGARÉ / LETRA DE CAMBIO / CUOTAS)
      const config = property.deferredPaymentConfig!;
      const downPaymentPercent = config.minDownPaymentPercent || 20;
      const downPaymentBase = (basePrice * downPaymentPercent) / 100;
      const initialCashRequired = Number((downPaymentBase + ivaAmount).toFixed(2));

      if (student.balance < initialCashRequired) {
        return res.status(400).json({
          error: `Saldo insuficiente para la entrada inicial y liquidación de IVA. Se requieren ${initialCashRequired.toLocaleString('es-ES')} € (Entrada ${downPaymentPercent}%: ${downPaymentBase.toLocaleString('es-ES')} € + IVA Total 21%: ${ivaAmount.toLocaleString('es-ES')} €)`
        });
      }

      const pendingBaseBalance = Number((basePrice - downPaymentBase).toFixed(2));
      const count = config.installmentsCount || 12;
      const installmentAmount = Number((pendingBaseBalance / count).toFixed(2));

      // Deduct initial cash payment
      student.balance = Number((student.balance - initialCashRequired).toFixed(2));

      const instrumentLabel = config.instrument === 'pagare'
        ? 'Pagaré'
        : config.instrument === 'letra_cambio'
        ? 'Letra de Cambio'
        : 'Cuota Aplazada';

      // Record transfer for initial down payment & tax
      const newTransfer: Transfer = {
        id: generateId('tx'),
        senderId: student.id,
        senderName: student.name,
        senderAccount: student.accountNumber,
        receiverId: vendorId,
        receiverName: vendorName,
        receiverAccount: vendorAccount,
        amount: initialCashRequired,
        concept: `Entrada (${downPaymentPercent}%) + Total IVA 21%: ${property.title}`,
        timestamp: new Date().toISOString()
      };
      db.transfers.unshift(newTransfer);

      // Create Acquisition record
      const acquisitionId = generateId('acq');
      const acquisition: PropertyAcquisition = {
        id: acquisitionId,
        propertyId: property.id,
        propertyTitle: property.title,
        propertyType: property.type,
        operation: 'compra',
        studentId: student.id,
        studentName: student.name,
        surfaceM2: property.surfaceM2,
        location: `${property.address}, ${property.municipality}`,
        imageUrl: property.imageUrl,
        landPercentage: property.landPercentage,
        basePrice,
        ivaAmount,
        totalPrice,
        purchaseDate: new Date().toISOString(),
        paymentMethod: config.instrument === 'pagare' ? 'aplazado_pagare' : config.instrument === 'letra_cambio' ? 'aplazado_letra' : 'aplazado_cuotas',
        downPaymentPaid: initialCashRequired,
        pendingBalance: pendingBaseBalance
      };
      db.acquisitions.unshift(acquisition);

      // Generate deferred payment obligations
      const generatedObligations: PaymentObligation[] = [];
      for (let i = 1; i <= count; i++) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (i * 30));

        const ob: PaymentObligation = {
          id: generateId('obl'),
          acquisitionId,
          studentId: student.id,
          studentName: student.name,
          propertyTitle: property.title,
          type: config.instrument === 'pagare' ? 'pagare' : config.instrument === 'letra_cambio' ? 'letra_cambio' : 'cuota_compra',
          amount: installmentAmount,
          dueDate: dueDate.toISOString(),
          status: 'pendiente',
          installmentNumber: i,
          totalInstallments: count
        };
        db.paymentObligations.push(ob);
        generatedObligations.push(ob);
      }

      property.status = 'sold';
      writeDb(db);

      // Sync all new data to Supabase
      syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
      syncPropertyToSupabase(property).catch(e => console.error(e));
      syncAcquisitionToSupabase(acquisition).catch(e => console.error(e));
      syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', initialCashRequired, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));
      for (const ob of generatedObligations) {
        syncObligationToSupabase(ob).catch(e => console.error(e));
      }

      return res.json({
        success: true,
        message: `¡Compra aplazada formalizada! Se han abonado ${initialCashRequired.toLocaleString('es-ES')} € de entrada e IVA, y se han emitido ${count} ${instrumentLabel}s de ${installmentAmount.toLocaleString('es-ES')} €/mes.`,
        acquisition,
        updatedBalance: student.balance
      });
    }
  }

  return res.status(400).json({ error: 'Operación no válida.' });
});

// Get Company Financial & Property Assets (Mi Empresa Dashboard)
app.get('/api/company/:studentId', (req, res) => {
  const { studentId } = req.params;
  const db = readDb();

  const user = db.users.find(u => u.id === studentId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario / Empresa no encontrada' });
  }

  const acquisitions = db.acquisitions.filter(a => a.studentId === studentId);
  const obligations = db.paymentObligations.filter(o => o.studentId === studentId);

  const ownedProperties = acquisitions.filter(a => a.operation === 'compra');
  const rentedProperties = acquisitions.filter(a => a.operation === 'alquiler');

  let totalRealEstateAssetsValue = 0;
  let totalLandValue = 0;
  let totalBuildingValue = 0;

  for (const prop of ownedProperties) {
    const base = prop.basePrice;
    const landPart = (base * prop.landPercentage) / 100;
    const buildingPart = base - landPart;

    totalRealEstateAssetsValue += base;
    totalLandValue += landPart;
    totalBuildingValue += buildingPart;
  }

  const annualBuildingDepreciation = Number((totalBuildingValue * 0.02).toFixed(2)); // 2% amortización contable oficial de construcción en España

  const pendingObligations = obligations.filter(o => o.status === 'pendiente');
  const totalPendingObligations = Number(pendingObligations.reduce((acc, o) => acc + o.amount, 0).toFixed(2));

  const totalMonthlyRentCommitments = Number(rentedProperties.reduce((acc, r) => acc + (r.monthlyRent || 0), 0).toFixed(2));

  res.json({
    company: {
      id: user.id,
      name: user.name,
      username: user.username,
      accountNumber: user.accountNumber,
      balance: user.balance,
      role: user.role
    },
    summary: {
      bankBalance: user.balance,
      ownedPropertiesCount: ownedProperties.length,
      rentedPropertiesCount: rentedProperties.length,
      totalRealEstateAssetsValue: Number(totalRealEstateAssetsValue.toFixed(2)),
      totalLandValue: Number(totalLandValue.toFixed(2)),
      totalBuildingValue: Number(totalBuildingValue.toFixed(2)),
      annualBuildingDepreciation,
      totalPendingObligations,
      totalMonthlyRentCommitments
    },
    acquisitions,
    obligations
  });
});

// Pay due obligation (Promissory note / Bill of exchange / Rent installment)
app.post('/api/obligations/pay', (req, res) => {
  const { obligationId, studentId } = req.body;
  const db = readDb();

  const obligation = db.paymentObligations.find(o => o.id === obligationId && o.studentId === studentId);
  if (!obligation) {
    return res.status(404).json({ error: 'Obligación de pago no encontrada' });
  }

  if (obligation.status === 'pagado') {
    return res.status(400).json({ error: 'Esta obligación ya ha sido abonada anteriormente' });
  }

  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Estudiante no encontrado' });
  }

  if (student.balance < obligation.amount) {
    return res.status(400).json({
      error: `Saldo insuficiente para atender el vencimiento. Saldo actual: ${student.balance.toLocaleString('es-ES')} €, Vencimiento: ${obligation.amount.toLocaleString('es-ES')} €`
    });
  }

  // Deduct from bank balance
  student.balance = Number((student.balance - obligation.amount).toFixed(2));

  // Instrument type name
  const instrumentName = obligation.type === 'pagare'
    ? 'Pagaré'
    : obligation.type === 'letra_cambio'
    ? 'Letra de Cambio'
    : 'Cuota / Alquiler';

  // Create Transfer record
  const newTransfer: Transfer = {
    id: generateId('tx'),
    senderId: student.id,
    senderName: student.name,
    senderAccount: student.accountNumber,
    receiverId: 'corp-tenedor-efectos',
    receiverName: 'Tenedor de Efectos Comerciales S.A.',
    receiverAccount: 'ES210001000299887755',
    amount: obligation.amount,
    concept: `Atención a vencimiento de ${instrumentName} (${obligation.installmentNumber || 1}/${obligation.totalInstallments || 1}): ${obligation.propertyTitle}`,
    timestamp: new Date().toISOString()
  };
  db.transfers.unshift(newTransfer);

  // Mark obligation as paid
  obligation.status = 'pagado';
  obligation.paidDate = new Date().toISOString();

  // Update acquisition pending balance if applicable
  const acq = db.acquisitions.find(a => a.id === obligation.acquisitionId);
  if (acq && acq.pendingBalance && acq.pendingBalance > 0) {
    acq.pendingBalance = Math.max(0, Number((acq.pendingBalance - obligation.amount).toFixed(2)));
  }

  writeDb(db);

  // Sync to Supabase
  syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
  syncObligationToSupabase(obligation).catch(e => console.error(e));
  syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', obligation.amount, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));
  if (acq) {
    syncAcquisitionToSupabase(acq).catch(e => console.error(e));
  }

  res.json({
    success: true,
    message: `¡Atención al vencimiento completada con éxito! Se han abonado ${obligation.amount.toLocaleString('es-ES')} € correspondiente al ${instrumentName}.`,
    updatedBalance: student.balance,
    paidObligation: obligation
  });
});

// ---------------- LOAN MANAGEMENT SYSTEM ----------------

function calculateFrenchAmortization(
  principal: number,
  annualInterestRatePercent: number,
  termMonths: number,
  startDateISO: string = new Date().toISOString()
): { monthlyPayment: number; schedule: AmortizationRow[] } {
  const r = (annualInterestRatePercent / 100) / 12;
  let monthlyPayment = 0;
  if (r > 0) {
    monthlyPayment = principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
  } else {
    monthlyPayment = principal / termMonths;
  }
  monthlyPayment = Number(monthlyPayment.toFixed(2));

  let pendingBalance = principal;
  let totalAmortized = 0;
  const schedule: AmortizationRow[] = [];
  const baseDate = new Date(startDateISO);

  for (let k = 1; k <= termMonths; k++) {
    const dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + k, 0);
    const interest = Number((pendingBalance * r).toFixed(2));
    let principalPart = Number((monthlyPayment - interest).toFixed(2));

    if (k === termMonths) {
      principalPart = Number(pendingBalance.toFixed(2));
      monthlyPayment = Number((principalPart + interest).toFixed(2));
    }

    pendingBalance = Math.max(0, Number((pendingBalance - principalPart).toFixed(2)));
    totalAmortized = Number((totalAmortized + principalPart).toFixed(2));

    schedule.push({
      period: k,
      dueDate: dueDate.toISOString(),
      payment: monthlyPayment,
      interest,
      principal: principalPart,
      totalAmortized,
      pendingBalance,
      paid: false
    });
  }

  return { monthlyPayment, schedule };
}

function processStudentAutomaticPayments(db: DatabaseSchema, targetStudentId?: string) {
  const now = new Date();
  let modified = false;

  const students = targetStudentId 
    ? db.users.filter(u => u.id === targetStudentId && u.role === 'student')
    : db.users.filter(u => u.role === 'student');

  for (const student of students) {
    interface PendingItem {
      id: string;
      sourceType: 'obligation' | 'loan';
      dueDate: Date;
      principal: number;
      penaltyInterest: number;
      totalRequired: number;
      concept: string;
      obligationRef?: PaymentObligation;
      loanRef?: BankLoan;
      loanRowIndex?: number;
    }

    const pendingItems: PendingItem[] = [];

    // 1. Obligations
    if (db.paymentObligations) {
      for (const ob of db.paymentObligations) {
        if (ob.studentId === student.id && (ob.status === 'pendiente' || ob.status === 'vencido')) {
          const dDate = new Date(ob.dueDate);
          if (dDate <= now) {
            const principal = ob.amount;
            const penalty = Number((principal * 0.05).toFixed(2));
            const totalRequired = Number((principal + penalty).toFixed(2));
            const instrumentName = ob.type === 'pagare' ? 'Pagaré' : ob.type === 'letra_cambio' ? 'Letra de Cambio' : 'Cuota / Alquiler';

            pendingItems.push({
              id: ob.id,
              sourceType: 'obligation',
              dueDate: dDate,
              principal,
              penaltyInterest: penalty,
              totalRequired,
              concept: `Atención a vencimiento de ${instrumentName}: ${ob.propertyTitle}`,
              obligationRef: ob
            });
          }
        }
      }
    }

    // 2. Loans
    if (db.loans) {
      for (const loan of db.loans) {
        if (loan.studentId === student.id && loan.status === 'active') {
          loan.schedule.forEach((row, idx) => {
            if (!row.paid) {
              const dDate = new Date(row.dueDate);
              if (dDate <= now) {
                const principal = row.payment;
                const penalty = Number((principal * 0.05).toFixed(2));
                const totalRequired = Number((principal + penalty).toFixed(2));

                pendingItems.push({
                  id: `${loan.id}-row-${row.period}`,
                  sourceType: 'loan',
                  dueDate: dDate,
                  principal,
                  penaltyInterest: penalty,
                  totalRequired,
                  concept: `Cuota de préstamo hipotecario (${row.period}/${loan.termMonths}): Ref. ${loan.id}`,
                  loanRef: loan,
                  loanRowIndex: idx
                });
              }
            }
          });
        }
      }
    }

    // Sort items chronologically
    pendingItems.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    for (const item of pendingItems) {
      if (student.balance >= item.totalRequired) {
        student.balance = Number((student.balance - item.totalRequired).toFixed(2));
        modified = true;

        if (item.sourceType === 'obligation' && item.obligationRef) {
          const ob = item.obligationRef;
          ob.status = 'pagado';
          ob.paidDate = new Date().toISOString();
          ob.penaltyInterest = 0;
          ob.totalOverdueAmount = 0;

          const acq = db.acquisitions.find(a => a.id === ob.acquisitionId);
          if (acq && acq.pendingBalance && acq.pendingBalance > 0) {
            acq.pendingBalance = Math.max(0, Number((acq.pendingBalance - ob.amount).toFixed(2)));
            syncAcquisitionToSupabase(acq).catch(e => console.error(e));
          }

          const newTransfer: Transfer = {
            id: generateId('tx'),
            senderId: student.id,
            senderName: student.name,
            senderAccount: student.accountNumber,
            receiverId: 'corp-tenedor-efectos',
            receiverName: 'Tenedor de Efectos Comerciales S.A.',
            receiverAccount: 'ES210001000299887755',
            amount: item.totalRequired,
            concept: item.penaltyInterest > 0
              ? `${item.concept} (inc. 5% interés demora: +${item.penaltyInterest} €)`
              : item.concept,
            timestamp: new Date().toISOString()
          };
          db.transfers.unshift(newTransfer);

          syncObligationToSupabase(ob).catch(e => console.error(e));
          syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', item.totalRequired, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));
        } else if (item.sourceType === 'loan' && item.loanRef && item.loanRowIndex !== undefined) {
          const loan = item.loanRef;
          const row = loan.schedule[item.loanRowIndex];
          row.paid = true;
          row.paidDate = new Date().toISOString();
          row.isOverdue = false;
          row.penaltyInterest = 0;

          const newTransfer: Transfer = {
            id: generateId('tx'),
            senderId: student.id,
            senderName: student.name,
            senderAccount: student.accountNumber,
            receiverId: 'corp-banco-central',
            receiverName: 'Banco Central Hipotecario S.A.',
            receiverAccount: 'ES210001000299887700',
            amount: item.totalRequired,
            concept: item.penaltyInterest > 0
              ? `${item.concept} (inc. 5% interés demora: +${item.penaltyInterest} €)`
              : item.concept,
            timestamp: new Date().toISOString()
          };
          db.transfers.unshift(newTransfer);

          if (loan.schedule.every(r => r.paid)) {
            loan.status = 'paid_off';
          }

          syncLoanToSupabase(loan).catch(e => console.error(e));
          syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', item.totalRequired, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));
        }

        syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
      } else {
        // Insufficient balance -> mark overdue with 5% default interest
        if (item.sourceType === 'obligation' && item.obligationRef) {
          item.obligationRef.status = 'vencido';
          item.obligationRef.penaltyInterest = item.penaltyInterest;
          item.obligationRef.totalOverdueAmount = item.totalRequired;
          modified = true;
        } else if (item.sourceType === 'loan' && item.loanRef && item.loanRowIndex !== undefined) {
          item.loanRef.schedule[item.loanRowIndex].isOverdue = true;
          item.loanRef.schedule[item.loanRowIndex].penaltyInterest = item.penaltyInterest;
          modified = true;
        }
        break;
      }
    }
  }

  if (modified) {
    writeDb(db);
  }
}

function processLoanPayments(db: DatabaseSchema) {
  processStudentAutomaticPayments(db);
}

function getStudentPaymentStatus(db: DatabaseSchema, studentId: string) {
  const student = db.users.find(u => u.id === studentId);
  const currentBalance = student ? student.balance : 0;
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 86400 * 1000);

  const overdueItems: UpcomingPaymentItem[] = [];
  const upcoming30DaysItems: UpcomingPaymentItem[] = [];

  // 1. Obligations
  if (db.paymentObligations) {
    for (const ob of db.paymentObligations) {
      if (ob.studentId === studentId && ob.status !== 'pagado') {
        const dDate = new Date(ob.dueDate);
        const instrumentName = ob.type === 'pagare' ? 'Pagaré' : ob.type === 'letra_cambio' ? 'Letra de Cambio' : 'Cuota / Alquiler';
        const principal = ob.amount;
        const penalty = Number((principal * 0.05).toFixed(2));
        const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

        const item: UpcomingPaymentItem = {
          id: ob.id,
          sourceType: 'obligation',
          type: ob.type,
          title: ob.propertyTitle,
          concept: `Domiciliación ${instrumentName}`,
          dueDate: ob.dueDate,
          principalAmount: principal,
          penaltyInterest: penalty,
          totalAmount: Number((principal + penalty).toFixed(2)),
          isOverdue: dDate <= now,
          daysRemaining: daysRem,
          installmentInfo: ob.installmentNumber ? `Cuota ${ob.installmentNumber}/${ob.totalInstallments || 12}` : undefined
        };

        if (dDate <= now) {
          overdueItems.push(item);
        } else if (dDate <= thirtyDaysLater) {
          upcoming30DaysItems.push(item);
        }
      }
    }
  }

  // 2. Loans
  if (db.loans) {
    for (const loan of db.loans) {
      if (loan.studentId === studentId && loan.status === 'active') {
        for (const row of loan.schedule) {
          if (!row.paid) {
            const dDate = new Date(row.dueDate);
            const principal = row.payment;
            const penalty = Number((principal * 0.05).toFixed(2));
            const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

            const item: UpcomingPaymentItem = {
              id: `${loan.id}-row-${row.period}`,
              sourceType: 'loan',
              type: 'cuota_prestamo',
              title: `Préstamo Hipotecario (Ref: ${loan.id})`,
              concept: `Cuota mensual de amortización ${row.period}/${loan.termMonths}`,
              dueDate: row.dueDate,
              principalAmount: principal,
              penaltyInterest: penalty,
              totalAmount: Number((principal + penalty).toFixed(2)),
              isOverdue: dDate <= now,
              daysRemaining: daysRem,
              installmentInfo: `Cuota ${row.period}/${loan.termMonths}`,
              loanId: loan.id
            };

            if (dDate <= now) {
              overdueItems.push(item);
            } else if (dDate <= thirtyDaysLater) {
              upcoming30DaysItems.push(item);
            }
          }
        }
      }
    }
  }

  upcoming30DaysItems.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  overdueItems.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const totalOverdueAmount = overdueItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalUpcoming30DaysAmount = upcoming30DaysItems.reduce((sum, item) => sum + item.principalAmount, 0);
  const projected30DaysTotal = totalOverdueAmount + totalUpcoming30DaysAmount;
  const isBlocked = overdueItems.length > 0;
  const insufficientProjectedBalance = currentBalance < projected30DaysTotal;

  return {
    isBlocked,
    totalOverdueAmount: Number(totalOverdueAmount.toFixed(2)),
    totalUpcoming30DaysAmount: Number(totalUpcoming30DaysAmount.toFixed(2)),
    overdueItems,
    upcoming30DaysItems,
    projected30DaysTotal: Number(projected30DaysTotal.toFixed(2)),
    currentBalance,
    insufficientProjectedBalance
  };
}

// GET upcoming payments for student
app.get('/api/student/upcoming-payments', (req, res) => {
  const { studentId } = req.query;
  if (!studentId || typeof studentId !== 'string') {
    return res.status(400).json({ error: 'studentId es requerido' });
  }

  const db = readDb();
  processStudentAutomaticPayments(db, studentId);
  const status = getStudentPaymentStatus(db, studentId);

  res.json({
    success: true,
    ...status
  });
});

// GET all loans or student's loans
app.get('/api/loans', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  processStudentAutomaticPayments(db, studentId ? String(studentId) : undefined);

  let loans = db.loans || [];
  if (studentId) {
    loans = loans.filter(l => l.studentId === studentId);
  }

  res.json({ success: true, loans });
});

// Student requests a loan
app.post('/api/loans/request', (req, res) => {
  const { studentId, requestedAmount, termMonths, collateralType, propertyId, surfaceM2, appraisalValue } = req.body;
  const db = readDb();

  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Estudiante no encontrado' });
  }

  const reqAmt = Number(requestedAmount);
  const termM = Number(termMonths);
  const apprVal = Number(appraisalValue);

  if (!reqAmt || reqAmt <= 0) {
    return res.status(400).json({ error: 'Debes indicar un importe solicitado válido' });
  }
  if (!termM || termM <= 0) {
    return res.status(400).json({ error: 'Debes indicar un plazo de devolución válido' });
  }
  if (!apprVal || apprVal <= 0) {
    return res.status(400).json({ error: 'Debes indicar un valor de tasación válido para la garantía' });
  }

  let collateralPropertyTitle: string | undefined;
  if (collateralType === 'property') {
    const acq = db.acquisitions.find(a => a.id === propertyId || a.propertyId === propertyId);
    if (!acq) {
      return res.status(400).json({ error: 'No se encontró el inmueble seleccionado como garantía' });
    }
    collateralPropertyTitle = acq.propertyTitle;
  }

  const euriborRate = 3.50;
  const spread = 1.00;
  const annualInterestRate = euriborRate + spread;

  const maxLtvAmount = Number((0.80 * apprVal).toFixed(2));
  const offeredAmount = Math.min(reqAmt, maxLtvAmount);

  const existingLoans = (db.loans || []).filter(l => l.studentId === studentId && ['active', 'offered', 'teacher_offered', 'pending_teacher'].includes(l.status));
  const hasAutoApprovedLoan = existingLoans.length > 0;

  let requiresTeacherApproval = false;
  let status: LoanStatus = 'offered';

  if (hasAutoApprovedLoan) {
    requiresTeacherApproval = true;
    status = 'pending_teacher';
  } else {
    status = 'offered';
  }

  const openingFee = Number((0.001 * offeredAmount).toFixed(2));
  const { monthlyPayment, schedule } = calculateFrenchAmortization(offeredAmount, annualInterestRate, termM);

  const newLoan: BankLoan = {
    id: generateId('prestamo'),
    studentId: student.id,
    studentName: student.name,
    studentAccount: student.accountNumber,
    requestedAmount: reqAmt,
    offeredAmount,
    termMonths: termM,
    annualInterestRate,
    euriborRate,
    spread,
    openingFee,
    monthlyPayment,
    collateral: {
      type: collateralType as ('property' | 'private_residence'),
      propertyId,
      propertyTitle: collateralPropertyTitle,
      surfaceM2: Number(surfaceM2 || 0),
      appraisalValue: apprVal
    },
    status,
    requiresTeacherApproval,
    createdAt: new Date().toISOString(),
    schedule
  };

  if (!db.loans) db.loans = [];
  db.loans.unshift(newLoan);
  writeDb(db);

  syncLoanToSupabase(newLoan).catch(e => console.error(e));

  let responseMessage = '';
  if (status === 'offered') {
    if (offeredAmount < reqAmt) {
      responseMessage = `El banco ha concedido automáticamente una oferta por ${offeredAmount.toLocaleString('es-ES')} € (máximo 80% del valor de tasación de la garantía de ${apprVal.toLocaleString('es-ES')} €). Por favor, revisa las condiciones y acepta la oferta para ingresar el importe.`;
    } else {
      responseMessage = `¡Tu solicitud de préstamo por ${offeredAmount.toLocaleString('es-ES')} € ha sido pre-aprobada automáticamente al 80% LTV! Revisa las condiciones y la tabla de amortización para formalizarlo.`;
    }
  } else {
    responseMessage = `Solicitud registrada. Al disponer ya de un préstamo previo concedido, esta segunda solicitud requiere la revisión y aprobación manual del Profesor.`;
  }

  res.status(201).json({
    success: true,
    message: responseMessage,
    loan: newLoan
  });
});

// Student accepts loan offer
app.post('/api/loans/:id/accept', (req, res) => {
  const { id } = req.params;
  const { studentId } = req.body;
  const db = readDb();

  const loan = (db.loans || []).find(l => l.id === id && l.studentId === studentId);
  if (!loan) {
    return res.status(404).json({ error: 'Préstamo no encontrado' });
  }

  if (loan.status !== 'offered' && loan.status !== 'teacher_offered') {
    return res.status(400).json({ error: 'Este préstamo no se encuentra pendiente de aceptación' });
  }

  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Estudiante no encontrado' });
  }

  if (student.balance < loan.openingFee) {
    return res.status(400).json({
      error: `Saldo insuficiente para abonar la comisión de apertura del 1 por mil (${loan.openingFee.toLocaleString('es-ES')} €). Saldo disponible actual: ${student.balance.toLocaleString('es-ES')} €.`
    });
  }

  student.balance = Number((student.balance - loan.openingFee).toFixed(2));
  student.balance = Number((student.balance + loan.offeredAmount).toFixed(2));

  loan.approvedAmount = loan.offeredAmount;
  loan.status = 'active';
  loan.acceptedAt = new Date().toISOString();

  const feeTransfer: Transfer = {
    id: generateId('tx'),
    senderId: student.id,
    senderName: student.name,
    senderAccount: student.accountNumber,
    receiverId: 'corp-banco-central',
    receiverName: 'Banco Central Hipotecario S.A. - Comisión Apertura (1‰)',
    receiverAccount: 'ES210001000299887700',
    amount: loan.openingFee,
    concept: `Comisión de apertura de préstamo hipotecario (1‰): Ref. ${loan.id}`,
    timestamp: new Date().toISOString()
  };

  const loanDisbursementTransfer: Transfer = {
    id: generateId('tx'),
    senderId: 'corp-banco-central',
    senderName: 'Banco Central Hipotecario S.A.',
    senderAccount: 'ES210001000299887700',
    receiverId: student.id,
    receiverName: student.name,
    receiverAccount: student.accountNumber,
    amount: loan.offeredAmount,
    concept: `Concesión e ingreso de préstamo hipotecario: Ref. ${loan.id}`,
    timestamp: new Date().toISOString()
  };

  db.transfers.unshift(feeTransfer);
  db.transfers.unshift(loanDisbursementTransfer);

  processLoanPayments(db);

  writeDb(db);

  syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
  syncLoanToSupabase(loan).catch(e => console.error(e));
  syncMovimientoToSupabase(feeTransfer.id + '-out', student.id, 'TRANSFER_OUT', loan.openingFee, feeTransfer.timestamp, feeTransfer.concept).catch(e => console.error(e));
  syncMovimientoToSupabase(loanDisbursementTransfer.id + '-in', student.id, 'TRANSFER_IN', loan.offeredAmount, loanDisbursementTransfer.timestamp, loanDisbursementTransfer.concept).catch(e => console.error(e));

  res.json({
    success: true,
    message: `¡Préstamo de ${loan.offeredAmount.toLocaleString('es-ES')} € formalizado! Se ha ingresado el principal en tu cuenta y cobrado ${loan.openingFee.toLocaleString('es-ES')} € de comisión de apertura (1‰).`,
    updatedBalance: student.balance,
    loan
  });
});

// Student rejects loan offer
app.post('/api/loans/:id/reject', (req, res) => {
  const { id } = req.params;
  const { studentId } = req.body;
  const db = readDb();

  const loan = (db.loans || []).find(l => l.id === id && l.studentId === studentId);
  if (!loan) {
    return res.status(404).json({ error: 'Préstamo no encontrado' });
  }

  loan.status = 'rejected';
  writeDb(db);

  syncLoanToSupabase(loan).catch(e => console.error(e));

  res.json({
    success: true,
    message: 'Oferta de préstamo rechazada correctamente.',
    loan
  });
});

// Teacher reviews / modifies / approves loan request
app.post('/api/teacher/loans/:id/review', (req, res) => {
  const { id } = req.params;
  const { action, offeredAmount, annualInterestRate, termMonths, teacherNotes } = req.body;
  const db = readDb();

  const loan = (db.loans || []).find(l => l.id === id);
  if (!loan) {
    return res.status(404).json({ error: 'Préstamo no encontrado' });
  }

  if (action === 'deny') {
    loan.status = 'denied_teacher';
    loan.teacherNotes = teacherNotes || 'Solicitud denegada por el Profesor.';
  } else {
    const finalAmount = offeredAmount ? Number(offeredAmount) : loan.offeredAmount;
    const finalRate = annualInterestRate ? Number(annualInterestRate) : loan.annualInterestRate;
    const finalTerm = termMonths ? Number(termMonths) : loan.termMonths;

    loan.offeredAmount = finalAmount;
    loan.annualInterestRate = finalRate;
    loan.termMonths = finalTerm;
    loan.openingFee = Number((0.001 * finalAmount).toFixed(2));
    loan.teacherNotes = teacherNotes || 'Condiciones revisadas y aprobadas por el Profesor.';

    const { monthlyPayment, schedule } = calculateFrenchAmortization(finalAmount, finalRate, finalTerm);
    loan.monthlyPayment = monthlyPayment;
    loan.schedule = schedule;
    loan.status = 'teacher_offered';
  }

  writeDb(db);
  syncLoanToSupabase(loan).catch(e => console.error(e));

  res.json({
    success: true,
    message: action === 'deny' ? 'Préstamo denegado.' : 'Préstamo aprobado con condiciones notificadas al alumno.',
    loan
  });
});

// ---------------- VITE MIDDLEWARE / FRONTEND SERVING ----------------

async function startServer() {
  // Create Supabase tables "cuentas" and "movimientos" if they do not exist
  await initSupabaseTables();
  await restoreFromSupabase().catch(e => console.error('[Supabase Startup Restore Error]', e));

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
