/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import { DatabaseSchema, User, Transfer, SystemLog, PropertyListing, PropertyAcquisition, PaymentObligation, PropertyType, OperationType, LocationScope, DeferredPaymentConfig, BankLoan, AmortizationRow, LoanStatus, UpcomingPaymentItem, MachineryItem, MachineryAcquisition, MachineryLineOption, JobListing, HiredEmployee, PayrollRecord, TaxObligation, ElectricityContract, ElectricityBill, NaveFloorPlan, ElectricityPropertyBreakdown, TelecomContract, TelecomInvoice, OfficePurchaseOrder, OfficePurchaseOrderItem, RawMaterialAnnouncement, RawMaterialOrder, RawMaterialInventory } from './src/types.js';
import { SPANISH_REGIONS, PROPERTY_IMAGES, generateLandPercentage, generateLocation, calculateRealisticPrice, getRandomElement, getRandomInt } from './src/lib/realEstateData.js';
import { TELECOM_PLANS, OFFICE_STORE_CATALOG } from './src/lib/officeStoreData.js';

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
      dbPool.end().catch(() => {});
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
    idleTimeoutMillis: 5000,
    max: 3
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

async function safeDbQuery(text: string, params?: any[], retries = 3): Promise<pg.QueryResult<any> | null> {
  if (!dbPool) return null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await dbPool.query(text, params);
    } catch (err: any) {
      const isConnError = err?.message?.includes('EMAXCONNSESSION') || err?.message?.includes('max clients') || err?.code === '57P01';
      if (isConnError && attempt < retries) {
        await new Promise(r => setTimeout(r, 250 * attempt));
        continue;
      }
      throw err;
    }
  }
  return null;
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

function formatNumber(val: number | null | undefined, decimals: number = 2): string {
  if (val === null || val === undefined || isNaN(val)) {
    return (0).toFixed(decimals).replace('.', ',');
  }
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const fixed = absVal.toFixed(decimals);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const result = decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
  return isNegative ? `-${result}` : result;
}

function formatCurrency(val: number | null | undefined): string {
  return `${formatNumber(val, 2)} €`;
}

// Realistic corporate real estate vendors & financial creditors
export const REALISTIC_CORPORATE_SELLERS = [
  { id: 'corp-1', name: 'Inmobiliaria Polígonos de España S.A.', account: 'ES210001000299887711' },
  { id: 'corp-2', name: 'Patrimonio Empresarial e Industrial S.L.', account: 'ES210001000299887722' },
  { id: 'corp-3', name: 'Fondo de Arrendamientos Comerciales S.A.', account: 'ES210001000299887733' },
  { id: 'corp-4', name: 'Corporación Logística Castellana S.L.', account: 'ES210001000299887744' },
  { id: 'corp-5', name: 'Promotora de Espacios Comerciales S.A.', account: 'ES210001000299887755' },
];

// Create tables "cuentas", "movimientos", "inmuebles", "adquisiciones", "obligaciones_pago", "ofertas_empleo", "empleados_contratados", "registros_nomina", "obligaciones_fiscales"
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
        saldo NUMERIC(12, 2) NOT NULL DEFAULT 0,
        usuario TEXT,
        password TEXT,
        account_number TEXT,
        role TEXT
      );

      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS usuario TEXT;
      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS password TEXT;
      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS account_number TEXT;
      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS role TEXT;

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

      CREATE TABLE IF NOT EXISTS maquinaria_adquisiciones (
        id VARCHAR(255) PRIMARY KEY,
        maquinaria_id VARCHAR(255) NOT NULL,
        linea_titulo TEXT NOT NULL,
        categoria VARCHAR(50) NOT NULL,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        precio_base NUMERIC(12, 2) NOT NULL,
        precio_financiado NUMERIC(12, 2) NOT NULL,
        importe_iva NUMERIC(12, 2) NOT NULL,
        precio_total NUMERIC(12, 2) NOT NULL,
        entrada_pagada NUMERIC(12, 2) NOT NULL,
        saldo_pendiente NUMERIC(12, 2) NOT NULL,
        metodo_pago VARCHAR(50) NOT NULL,
        numero_cuotas INT,
        fecha_compra TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        dias_montaje INT NOT NULL DEFAULT 5,
        fecha_fin_montaje TIMESTAMPTZ NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'en_montaje',
        nave_instalada_id VARCHAR(255) NOT NULL,
        nave_instalada_titulo TEXT NOT NULL,
        personal_requerido INT NOT NULL,
        potencia_kw NUMERIC(10, 2) NOT NULL,
        capacidad_produccion_unidades_hora INT NOT NULL,
        equipamiento JSONB
      );

      CREATE TABLE IF NOT EXISTS ofertas_empleo (
        id VARCHAR(255) PRIMARY KEY,
        titulo TEXT NOT NULL,
        nombre_empleado TEXT NOT NULL,
        genero VARCHAR(50) NOT NULL,
        sueldo_bruto_mensual NUMERIC(12, 2) NOT NULL,
        edad INT NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'disponible',
        alumno_id VARCHAR(255),
        alumno_nombre TEXT,
        fecha_contratacion TIMESTAMPTZ,
        avatar_url TEXT,
        fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS empleados_contratados (
        id VARCHAR(255) PRIMARY KEY,
        oferta_id VARCHAR(255) NOT NULL,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        nombre_empleado TEXT NOT NULL,
        genero VARCHAR(50) NOT NULL,
        sueldo_bruto_mensual NUMERIC(12, 2) NOT NULL,
        edad INT NOT NULL,
        fecha_contratacion TIMESTAMPTZ NOT NULL,
        maquinaria_asignada_id VARCHAR(255),
        turno INT DEFAULT 1,
        avatar_url TEXT
      );

      CREATE TABLE IF NOT EXISTS registros_nomina (
        id VARCHAR(255) PRIMARY KEY,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        fecha_nomina TIMESTAMPTZ NOT NULL,
        mes INT NOT NULL,
        anio INT NOT NULL,
        num_empleados INT NOT NULL,
        total_bruto NUMERIC(12, 2) NOT NULL,
        total_ss_empleado NUMERIC(12, 2) NOT NULL,
        total_irpf NUMERIC(12, 2) NOT NULL,
        total_liquido NUMERIC(12, 2) NOT NULL,
        total_ss_empresa NUMERIC(12, 2) NOT NULL,
        es_proporcional BOOLEAN DEFAULT FALSE,
        fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS obligaciones_fiscales (
        id VARCHAR(255) PRIMARY KEY,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        concepto TEXT NOT NULL,
        importe NUMERIC(12, 2) NOT NULL,
        fecha_vencimiento TIMESTAMPTZ NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
        fecha_pago TIMESTAMPTZ,
        nomina_id VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS contratos_electricos (
        id VARCHAR(255) PRIMARY KEY,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        potencia_contratada_kw NUMERIC(10, 2) NOT NULL,
        nombre_tarifa TEXT NOT NULL,
        precio_kw_dia NUMERIC(10, 4) NOT NULL,
        precio_kwh NUMERIC(10, 4) NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'active',
        fecha_contrato TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        cups_code TEXT
      );

      CREATE TABLE IF NOT EXISTS planos_distribucion_naves (
        id VARCHAR(255) PRIMARY KEY,
        inmueble_id VARCHAR(255) NOT NULL,
        alumno_id VARCHAR(255) NOT NULL,
        zona_maquinaria_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
        zona_almacen_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
        zona_admin_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
        zona_libre_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
        num_almacenes INT NOT NULL DEFAULT 2,
        fecha_actualizacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contratos_telecom (
        id VARCHAR(255) PRIMARY KEY,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        plan_id VARCHAR(255) NOT NULL,
        plan_nombre TEXT NOT NULL,
        proveedor TEXT NOT NULL,
        inmueble_id VARCHAR(255),
        inmueble_titulo TEXT,
        precio_mensual NUMERIC(12, 2) NOT NULL,
        fecha_contrato TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        numero_telefono TEXT,
        estado VARCHAR(50) NOT NULL DEFAULT 'active',
        velocidad_mbps INT,
        lineas_moviles INT
      );

      CREATE TABLE IF NOT EXISTS facturas_telecom (
        id VARCHAR(255) PRIMARY KEY,
        numero_factura TEXT NOT NULL,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        empresa_nombre TEXT,
        nif_cif TEXT,
        contrato_id VARCHAR(255) NOT NULL,
        plan_nombre TEXT NOT NULL,
        proveedor TEXT NOT NULL,
        mes INT NOT NULL,
        anio INT NOT NULL,
        fecha_emision TIMESTAMPTZ NOT NULL,
        fecha_vencimiento TIMESTAMPTZ NOT NULL,
        subtotal NUMERIC(12, 2) NOT NULL,
        tipo_iva NUMERIC(5, 2) NOT NULL,
        importe_iva NUMERIC(12, 2) NOT NULL,
        importe_total NUMERIC(12, 2) NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'pagado',
        fecha_pago TIMESTAMPTZ,
        conceptos JSONB,
        metodo_pago TEXT
      );

      CREATE TABLE IF NOT EXISTS pedidos_oficina (
        id VARCHAR(255) PRIMARY KEY,
        numero_pedido TEXT NOT NULL,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        empresa_nombre TEXT,
        nif_cif TEXT,
        fecha_compra TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        items JSONB NOT NULL,
        subtotal NUMERIC(12, 2) NOT NULL,
        tipo_iva NUMERIC(5, 2) NOT NULL,
        importe_iva NUMERIC(12, 2) NOT NULL,
        importe_total NUMERIC(12, 2) NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'completado_pagado',
        metodo_pago TEXT
      );
    `);
    console.log('[Supabase DB] Tables verified/created.');
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
async function syncAccountToSupabase(id: string, alumno: string, saldo: number, usuario?: string, password?: string, accountNumber?: string, role?: string) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET 
         alumno = EXCLUDED.alumno, 
         saldo = EXCLUDED.saldo,
         usuario = COALESCE(EXCLUDED.usuario, cuentas.usuario),
         password = COALESCE(EXCLUDED.password, cuentas.password),
         account_number = COALESCE(EXCLUDED.account_number, cuentas.account_number),
         role = COALESCE(EXCLUDED.role, cuentas.role)`,
      [id, alumno, saldo, usuario || null, password || null, accountNumber || null, role || 'student']
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing account to Supabase:', e);
  }
}

async function deleteAccountFromSupabase(id: string, username?: string, name?: string) {
  if (!dbPool) return;
  try {
    const uname = (username || id).toLowerCase();
    const studentName = (name || id).toLowerCase();

    await safeDbQuery('DELETE FROM cuentas WHERE id = $1 OR LOWER(usuario) = $2 OR LOWER(alumno) = $3', [id, uname, studentName]);
    await safeDbQuery('DELETE FROM movimientos WHERE cuenta_id = $1', [id]);
    await safeDbQuery('DELETE FROM adquisiciones WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM obligaciones_pago WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM prestamos WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM maquinaria_adquisiciones WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM ofertas_empleo WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM empleados_contratados WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM registros_nomina WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM obligaciones_fiscales WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM contratos_electricos WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM planos_distribucion_naves WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM contratos_telecom WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM facturas_telecom WHERE alumno_id = $1', [id]);
    await safeDbQuery('DELETE FROM pedidos_oficina WHERE alumno_id = $1', [id]);
  } catch (e) {
    console.error('[Supabase DB] Error deleting account and related data from Supabase:', e);
  }
}

async function syncMovimientoToSupabase(id: string, cuentaId: string, tipo: string, importe: number, fecha: string, concepto: string) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
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
    await safeDbQuery(
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
    await safeDbQuery('DELETE FROM inmuebles WHERE id = $1', [id]);
  } catch (e) {
    console.error('[Supabase DB] Error deleting property from Supabase:', e);
  }
}

async function syncAcquisitionToSupabase(acq: PropertyAcquisition) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
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
    await safeDbQuery(
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
    await safeDbQuery(
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

async function syncMachineryToSupabase(mac: MachineryAcquisition) {
  if (!dbPool) return;
  try {
    const lineTitleVal = mac.lineTitle || mac.title || mac.optionTitle || 'Línea de Maquinaria';
    const deferredPriceVal = mac.deferredPrice || mac.financedPrice || mac.basePrice || 0;
    const installmentCountVal = mac.installmentCount || mac.installmentsCount || null;
    const purchaseDateVal = mac.purchaseDate ? new Date(mac.purchaseDate) : new Date();
    const assemblyDaysVal = mac.assemblyDays || 5;
    const assemblyFinishDateVal = (mac.assemblyFinishDate || mac.assemblyEndDate) ? new Date(mac.assemblyFinishDate || mac.assemblyEndDate!) : new Date();
    const installedNaveIdVal = mac.installedNaveId || mac.installedAtNaveId || mac.installationNaveId || '';
    const installedNaveTitleVal = mac.installedNaveTitle || mac.installedAtNaveTitle || mac.installationNaveTitle || 'Nave Industrial';
    const requiredStaffVal = mac.requiredStaff || 5;
    const powerKwVal = mac.powerKw || mac.requiredPowerKW || 35;
    const capacityVal = mac.productionCapacityUnitsPerHour || 60;
    const equipmentVal = JSON.stringify(mac.equipmentList || mac.equipment || []);

    await safeDbQuery(
      `INSERT INTO maquinaria_adquisiciones (
        id, maquinaria_id, linea_titulo, categoria, alumno_id, alumno_nombre,
        precio_base, precio_financiado, importe_iva, precio_total, entrada_pagada, saldo_pendiente,
        metodo_pago, numero_cuotas, fecha_compra, dias_montaje, fecha_fin_montaje, estado,
        nave_instalada_id, nave_instalada_titulo, personal_requerido, potencia_kw,
        capacidad_produccion_unidades_hora, equipamiento
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (id) DO UPDATE SET
        saldo_pendiente = EXCLUDED.saldo_pendiente,
        estado = EXCLUDED.estado,
        fecha_fin_montaje = EXCLUDED.fecha_fin_montaje`,
      [
        mac.id,
        mac.machineryId || 'machinery',
        lineTitleVal,
        mac.category || 'metal_hierro',
        mac.studentId,
        mac.studentName || 'Estudiante',
        mac.basePrice || 0,
        deferredPriceVal,
        mac.ivaAmount || 0,
        mac.totalPrice || 0,
        mac.downPaymentPaid || 0,
        mac.pendingBalance || 0,
        mac.paymentMethod || 'contado',
        installmentCountVal,
        purchaseDateVal,
        assemblyDaysVal,
        assemblyFinishDateVal,
        mac.status || 'montaje',
        installedNaveIdVal,
        installedNaveTitleVal,
        requiredStaffVal,
        powerKwVal,
        capacityVal,
        equipmentVal
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing machinery acquisition to Supabase:', e);
  }
}

async function syncJobListingToSupabase(job: JobListing) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO ofertas_empleo (id, titulo, nombre_empleado, genero, sueldo_bruto_mensual, edad, estado, alumno_id, alumno_nombre, fecha_contratacion, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         titulo = EXCLUDED.titulo,
         nombre_empleado = EXCLUDED.nombre_empleado,
         genero = EXCLUDED.genero,
         sueldo_bruto_mensual = EXCLUDED.sueldo_bruto_mensual,
         edad = EXCLUDED.edad,
         estado = EXCLUDED.estado,
         alumno_id = EXCLUDED.alumno_id,
         alumno_nombre = EXCLUDED.alumno_nombre,
         fecha_contratacion = EXCLUDED.fecha_contratacion,
         avatar_url = EXCLUDED.avatar_url`,
      [job.id, job.title, job.employeeName, job.gender, job.grossSalaryMonthly, job.age, job.status, job.hiredByStudentId || null, job.hiredByStudentName || null, job.hiredAtDate || null, job.avatarUrl || null]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing job listing:', e);
  }
}

async function syncHiredEmployeeToSupabase(emp: HiredEmployee) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO empleados_contratados (id, oferta_id, alumno_id, alumno_nombre, nombre_empleado, genero, sueldo_bruto_mensual, edad, fecha_contratacion, maquinaria_asignada_id, turno, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         alumno_id = EXCLUDED.alumno_id,
         alumno_nombre = EXCLUDED.alumno_nombre,
         nombre_empleado = EXCLUDED.nombre_empleado,
         genero = EXCLUDED.genero,
         sueldo_bruto_mensual = EXCLUDED.sueldo_bruto_mensual,
         edad = EXCLUDED.edad,
         fecha_contratacion = EXCLUDED.fecha_contratacion,
         maquinaria_asignada_id = EXCLUDED.maquinaria_asignada_id,
         turno = EXCLUDED.turno,
         avatar_url = EXCLUDED.avatar_url`,
      [emp.id, emp.jobListingId, emp.studentId, emp.studentName, emp.employeeName, emp.gender, emp.grossSalaryMonthly, emp.age, emp.hireDate, emp.assignedMachineryId || null, emp.shift || 1, emp.avatarUrl || null]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing hired employee:', e);
  }
}

async function syncPayrollRecordToSupabase(pr: PayrollRecord) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO registros_nomina (id, alumno_id, alumno_nombre, fecha_nomina, mes, anio, num_empleados, total_bruto, total_ss_empleado, total_irpf, total_liquido, total_ss_empresa, es_proporcional)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [pr.id, pr.studentId, pr.studentName, pr.payrollDate, pr.periodMonth, pr.periodYear, pr.employeeCount, pr.totalGrossSalary, pr.totalEmployeeSS, pr.totalEmployeeIRPF, pr.totalNetSalaryPaid, pr.totalCompanySS, pr.isProportional]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing payroll record:', e);
  }
}

async function syncTaxObligationToSupabase(to: TaxObligation) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO obligaciones_fiscales (id, alumno_id, alumno_nombre, tipo, concepto, importe, fecha_vencimiento, estado, fecha_pago, nomina_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         estado = EXCLUDED.estado,
         fecha_pago = EXCLUDED.fecha_pago`,
      [to.id, to.studentId, to.studentName, to.type, to.concept, to.amount, to.dueDate, to.status, to.paidDate || null, to.payrollRecordId || null]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing tax obligation:', e);
  }
}

async function syncElectricityContractToSupabase(contract: ElectricityContract) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO contratos_electricos (
        id, alumno_id, alumno_nombre, potencia_contratada_kw, nombre_tarifa,
        precio_kw_dia, precio_kwh, estado, fecha_contrato, cups_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        potencia_contratada_kw = EXCLUDED.potencia_contratada_kw,
        estado = EXCLUDED.estado`,
      [
        contract.id,
        contract.studentId,
        contract.studentName || 'Estudiante',
        contract.contractedPowerKw,
        contract.tariffName || 'IberLuz 3.0TD Industrial',
        contract.pricePerKwDay || 0.11,
        contract.pricePerKwh || 0.14,
        contract.status || 'active',
        contract.contractDate ? new Date(contract.contractDate) : new Date(),
        contract.cupsCode || ''
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing electricity contract to Supabase:', e);
  }
}

async function syncFloorPlanToSupabase(plan: NaveFloorPlan) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO planos_distribucion_naves (
        id, inmueble_id, alumno_id, zona_maquinaria_m2, zona_almacen_m2,
        zona_admin_m2, zona_libre_m2, num_almacenes, fecha_actualizacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        inmueble_id = EXCLUDED.inmueble_id,
        zona_maquinaria_m2 = EXCLUDED.zona_maquinaria_m2,
        zona_almacen_m2 = EXCLUDED.zona_almacen_m2,
        zona_admin_m2 = EXCLUDED.zona_admin_m2,
        zona_libre_m2 = EXCLUDED.zona_libre_m2,
        num_almacenes = EXCLUDED.num_almacenes,
        fecha_actualizacion = EXCLUDED.fecha_actualizacion`,
      [
        plan.id,
        plan.propertyId || plan.acquisitionId || '',
        plan.studentId,
        plan.machineryZoneM2 || 0,
        plan.storageZoneM2 || 0,
        plan.adminZoneM2 || 0,
        plan.freeZoneM2 || 0,
        plan.warehousesCount || 2,
        plan.updatedAt ? new Date(plan.updatedAt) : new Date()
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing floor plan to Supabase:', e);
  }
}

async function syncTelecomContractToSupabase(contract: TelecomContract) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO contratos_telecom (
        id, alumno_id, alumno_nombre, plan_id, plan_nombre, proveedor,
        inmueble_id, inmueble_titulo, precio_mensual, fecha_contrato,
        numero_telefono, estado, velocidad_mbps, lineas_moviles
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        estado = EXCLUDED.estado,
        inmueble_id = EXCLUDED.inmueble_id,
        inmueble_titulo = EXCLUDED.inmueble_titulo`,
      [
        contract.id,
        contract.studentId,
        contract.studentName || 'Estudiante',
        contract.planId,
        contract.planName,
        contract.provider,
        contract.propertyId || null,
        contract.propertyTitle || null,
        contract.monthlyPrice,
        contract.contractDate ? new Date(contract.contractDate) : new Date(),
        contract.phoneNumber || null,
        contract.status || 'active',
        contract.speedMbps || null,
        contract.mobileLinesCount || null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing telecom contract to Supabase:', e);
  }
}

async function syncTelecomInvoiceToSupabase(invoice: TelecomInvoice) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO facturas_telecom (
        id, numero_factura, alumno_id, alumno_nombre, empresa_nombre, nif_cif,
        contrato_id, plan_nombre, proveedor, mes, anio, fecha_emision,
        fecha_vencimiento, subtotal, tipo_iva, importe_iva, importe_total,
        estado, fecha_pago, conceptos, metodo_pago
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (id) DO UPDATE SET
        estado = EXCLUDED.estado,
        fecha_pago = EXCLUDED.fecha_pago`,
      [
        invoice.id,
        invoice.invoiceNumber,
        invoice.studentId,
        invoice.studentName,
        invoice.companyName || invoice.studentName,
        invoice.nifCif || null,
        invoice.contractId,
        invoice.planName,
        invoice.provider,
        invoice.periodMonth,
        invoice.periodYear,
        new Date(invoice.issueDate),
        new Date(invoice.dueDate),
        invoice.subtotal,
        invoice.ivaRate || 21,
        invoice.ivaAmount,
        invoice.totalAmount,
        invoice.status || 'pagado',
        invoice.paidDate ? new Date(invoice.paidDate) : null,
        JSON.stringify(invoice.items || []),
        invoice.paymentMethod || null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing telecom invoice to Supabase:', e);
  }
}

async function syncOfficeOrderToSupabase(order: OfficePurchaseOrder) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO pedidos_oficina (
        id, numero_pedido, alumno_id, alumno_nombre, empresa_nombre, nif_cif,
        fecha_compra, items, subtotal, tipo_iva, importe_iva, importe_total,
        estado, metodo_pago
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        estado = EXCLUDED.estado`,
      [
        order.id,
        order.orderNumber,
        order.studentId,
        order.studentName,
        order.companyName || order.studentName,
        order.nifCif || null,
        new Date(order.purchaseDate),
        JSON.stringify(order.items || []),
        order.subtotal,
        order.ivaRate || 21,
        order.ivaAmount,
        order.totalAmount,
        order.status || 'completado_pagado',
        order.paymentMethod || 'banco'
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing office order to Supabase:', e);
  }
}

async function syncAllToSupabase(db: DatabaseSchema) {
  if (!dbPool) return;
  try {
    for (const user of db.users) {
      if (user.role === 'student') {
        await syncAccountToSupabase(user.id, user.name, user.balance, user.username, user.password, user.accountNumber, user.role);
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
    if (db.machineryAcquisitions) {
      for (const mac of db.machineryAcquisitions) {
        await syncMachineryToSupabase(mac);
      }
    }
    if (db.jobListings) {
      for (const job of db.jobListings) {
        await syncJobListingToSupabase(job);
      }
    }
    if (db.hiredEmployees) {
      for (const emp of db.hiredEmployees) {
        await syncHiredEmployeeToSupabase(emp);
      }
    }
    if (db.payrollRecords) {
      for (const pr of db.payrollRecords) {
        await syncPayrollRecordToSupabase(pr);
      }
    }
    if (db.taxObligations) {
      for (const tax of db.taxObligations) {
        await syncTaxObligationToSupabase(tax);
      }
    }
    if (db.electricityContracts) {
      for (const c of db.electricityContracts) {
        await syncElectricityContractToSupabase(c);
      }
    }
    if (db.naveFloorPlans) {
      for (const fp of db.naveFloorPlans) {
        await syncFloorPlanToSupabase(fp);
      }
    }
    if (db.telecomContracts) {
      for (const tc of db.telecomContracts) {
        await syncTelecomContractToSupabase(tc);
      }
    }
    if (db.telecomInvoices) {
      for (const ti of db.telecomInvoices) {
        await syncTelecomInvoiceToSupabase(ti);
      }
    }
    if (db.officeOrders) {
      for (const oo of db.officeOrders) {
        await syncOfficeOrderToSupabase(oo);
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
      const resCuentas = await client.query('SELECT id, alumno, saldo, usuario, password, account_number, role FROM cuentas');
      
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

      let resMachinery: any = { rows: [] };
      try {
        resMachinery = await client.query('SELECT * FROM maquinaria_adquisiciones ORDER BY fecha_compra DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Maquinaria table select warning:', e);
      }

      let resJobs: any = { rows: [] };
      try {
        resJobs = await client.query('SELECT * FROM ofertas_empleo ORDER BY fecha_creacion DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Ofertas empleo table select warning:', e);
      }

      let resEmployees: any = { rows: [] };
      try {
        resEmployees = await client.query('SELECT * FROM empleados_contratados ORDER BY fecha_contratacion DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Empleados contratados table select warning:', e);
      }

      let resPayrolls: any = { rows: [] };
      try {
        resPayrolls = await client.query('SELECT * FROM registros_nomina ORDER BY fecha_nomina DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Registros nomina table select warning:', e);
      }

      let resTaxes: any = { rows: [] };
      try {
        resTaxes = await client.query('SELECT * FROM obligaciones_fiscales ORDER BY fecha_vencimiento ASC');
      } catch (e) {
        console.warn('[Supabase Restore] Obligaciones fiscales table select warning:', e);
      }

      let resContracts: any = { rows: [] };
      try {
        resContracts = await client.query('SELECT * FROM contratos_electricos ORDER BY fecha_contrato DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Contratos electricos table select warning:', e);
      }

      let resFloorPlans: any = { rows: [] };
      try {
        resFloorPlans = await client.query('SELECT * FROM planos_distribucion_naves ORDER BY fecha_actualizacion DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Planos distribucion naves table select warning:', e);
      }

      let resTelContracts: any = { rows: [] };
      try {
        resTelContracts = await client.query('SELECT * FROM contratos_telecom ORDER BY fecha_contrato DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Contratos telecom table select warning:', e);
      }

      let resTelInvoices: any = { rows: [] };
      try {
        resTelInvoices = await client.query('SELECT * FROM facturas_telecom ORDER BY fecha_emision DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Facturas telecom table select warning:', e);
      }

      let resOfficeOrders: any = { rows: [] };
      try {
        resOfficeOrders = await client.query('SELECT * FROM pedidos_oficina ORDER BY fecha_compra DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Pedidos oficina table select warning:', e);
      }

      const db = readDb();

      // Synchronize students and balances from Supabase "cuentas" (Supabase is source of truth)
      const restoredUsers: User[] = [];
      const existingTeacher = db.users.find(u => u.role === 'teacher' || u.id === 'profesor-1');
      const teacherUser: User = existingTeacher || {
        id: 'profesor-1',
        username: 'pupdaniel',
        password: '1987',
        role: 'teacher',
        name: 'Profesor de Contabilidad',
        accountNumber: 'ES000000000000000000',
        balance: 0
      };
      restoredUsers.push(teacherUser);

      for (const row of resCuentas.rows) {
        const rowId = String(row.id);
        const rowAlumno = String(row.alumno);
        const rowSaldo = Number(row.saldo);
        const rowUsuario = row.usuario ? String(row.usuario) : undefined;
        const rowPassword = row.password ? String(row.password) : undefined;
        const rowAccount = row.account_number ? String(row.account_number) : undefined;
        const rowRole = row.role ? String(row.role) : 'student';

        if (rowRole === 'teacher' || rowId === teacherUser.id) {
          teacherUser.balance = rowSaldo;
          if (rowUsuario) teacherUser.username = rowUsuario;
          if (rowPassword) teacherUser.password = rowPassword;
        } else {
          restoredUsers.push({
            id: rowId,
            username: rowUsuario || rowAlumno.toLowerCase().replace(/[^a-z0-9]/gi, ''),
            password: rowPassword || '123',
            role: 'student',
            name: rowAlumno,
            accountNumber: rowAccount || generateIBAN(),
            balance: rowSaldo
          });
        }
      }
      db.users = restoredUsers;

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

      // Reconstruct db.machineryAcquisitions from Supabase "maquinaria_adquisiciones"
      if (resMachinery.rows.length > 0) {
        db.machineryAcquisitions = resMachinery.rows.map(row => {
          const equip = row.equipamiento ? (typeof row.equipamiento === 'string' ? JSON.parse(row.equipamiento) : row.equipamiento) : [];
          return {
            id: String(row.id),
            studentId: String(row.alumno_id),
            studentName: String(row.alumno_nombre),
            machineryId: String(row.maquinaria_id),
            category: String(row.categoria) as any,
            lineTitle: String(row.linea_titulo),
            title: String(row.linea_titulo),
            optionTitle: String(row.linea_titulo),
            lathesCount: 1,
            productionCapacityUnitsPerHour: Number(row.capacidad_produccion_unidades_hora || 60),
            imageUrl: row.categoria === 'metal_hierro' 
              ? 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=1000'
              : 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1000',
            basePrice: Number(row.precio_base),
            financedPrice: Number(row.precio_financiado || row.precio_base),
            deferredPrice: Number(row.precio_financiado || row.precio_base),
            ivaAmount: Number(row.importe_iva),
            totalPrice: Number(row.precio_total),
            downPaymentPaid: Number(row.entrada_pagada),
            pendingBalance: Number(row.saldo_pendiente),
            paymentMethod: String(row.metodo_pago) as any,
            installmentsCount: row.numero_cuotas ? Number(row.numero_cuotas) : undefined,
            installmentCount: row.numero_cuotas ? Number(row.numero_cuotas) : undefined,
            purchaseDate: new Date(row.fecha_compra).toISOString(),
            assemblyDays: Number(row.dias_montaje || 5),
            assemblyEndDate: row.fecha_fin_montaje ? new Date(row.fecha_fin_montaje).toISOString() : new Date().toISOString(),
            assemblyFinishDate: row.fecha_fin_montaje ? new Date(row.fecha_fin_montaje).toISOString() : new Date().toISOString(),
            status: (row.estado === 'en_montaje' || row.estado === 'montaje') ? 'montaje' : (row.estado === 'pendiente_energia' ? 'pendiente_energia' : 'operativa'),
            installedAtNaveId: String(row.nave_instalada_id),
            installedNaveId: String(row.nave_instalada_id),
            installationNaveId: String(row.nave_instalada_id),
            installedAtNaveTitle: String(row.nave_instalada_titulo),
            installedNaveTitle: String(row.nave_instalada_titulo),
            installationNaveTitle: String(row.nave_instalada_titulo),
            installationSurfaceM2: 300,
            requiredStaff: Number(row.personal_requerido || 5),
            requiredPowerKW: Number(row.potencia_kw || 35),
            powerKw: Number(row.potencia_kw || 35),
            equipmentList: equip,
            equipment: equip
          };
        });
      } else if (db.machineryAcquisitions && db.machineryAcquisitions.length > 0) {
        console.log(`[Supabase Sync] Syncing ${db.machineryAcquisitions.length} local machinery acquisitions to Supabase...`);
        for (const mac of db.machineryAcquisitions) {
          await syncMachineryToSupabase(mac);
        }
      }

      // Reconstruct db.jobListings from Supabase "ofertas_empleo"
      if (resJobs.rows.length > 0) {
        db.jobListings = resJobs.rows.map((row: any) => ({
          id: String(row.id),
          title: String(row.titulo),
          employeeName: String(row.nombre_empleado),
          gender: row.genero as 'hombre' | 'mujer',
          grossSalaryMonthly: Number(row.sueldo_bruto_mensual),
          age: Number(row.edad),
          status: row.estado as 'disponible' | 'contratado',
          hiredByStudentId: row.alumno_id ? String(row.alumno_id) : undefined,
          hiredByStudentName: row.alumno_nombre ? String(row.alumno_nombre) : undefined,
          hiredAtDate: row.fecha_contratacion ? new Date(row.fecha_contratacion).toISOString() : undefined,
          avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
          createdAt: row.fecha_creacion ? new Date(row.fecha_creacion).toISOString() : new Date().toISOString()
        }));
      }

      // Reconstruct db.hiredEmployees from Supabase "empleados_contratados"
      if (resEmployees.rows.length > 0) {
        db.hiredEmployees = resEmployees.rows.map((row: any) => ({
          id: String(row.id),
          jobListingId: String(row.oferta_id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          employeeName: String(row.nombre_empleado),
          gender: row.genero as 'hombre' | 'mujer',
          grossSalaryMonthly: Number(row.sueldo_bruto_mensual),
          age: Number(row.edad),
          hireDate: new Date(row.fecha_contratacion).toISOString(),
          assignedMachineryId: row.maquinaria_asignada_id ? String(row.maquinaria_asignada_id) : undefined,
          shift: Number(row.turno || 1),
          avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined
        }));
      }

      // Reconstruct db.payrollRecords from Supabase "registros_nomina"
      if (resPayrolls.rows.length > 0) {
        db.payrollRecords = resPayrolls.rows.map((row: any) => ({
          id: String(row.id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          payrollDate: new Date(row.fecha_nomina).toISOString(),
          periodMonth: Number(row.mes),
          periodYear: Number(row.anio),
          employeeCount: Number(row.num_empleados),
          totalGrossSalary: Number(row.total_bruto),
          totalEmployeeSS: Number(row.total_ss_empleado),
          totalEmployeeIRPF: Number(row.total_irpf),
          totalNetSalaryPaid: Number(row.total_liquido),
          totalCompanySS: Number(row.total_ss_empresa),
          isProportional: Boolean(row.es_proporcional),
          status: 'paid',
          createdAt: row.fecha_creacion ? new Date(row.fecha_creacion).toISOString() : new Date().toISOString()
        }));
      }

      // Reconstruct db.taxObligations from Supabase "obligaciones_fiscales"
      if (resTaxes.rows.length > 0) {
        db.taxObligations = resTaxes.rows.map((row: any) => ({
          id: String(row.id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          type: row.tipo as 'irpf' | 'ss_employee' | 'ss_company',
          concept: String(row.concepto),
          amount: Number(row.importe),
          dueDate: new Date(row.fecha_vencimiento).toISOString(),
          status: row.estado as 'pendiente' | 'pagado',
          paidDate: row.fecha_pago ? new Date(row.fecha_pago).toISOString() : undefined,
          payrollRecordId: row.nomina_id ? String(row.nomina_id) : undefined
        }));
      }

      // Reconstruct db.electricityContracts from Supabase "contratos_electricos"
      if (resContracts.rows.length > 0) {
        db.electricityContracts = resContracts.rows.map((row: any) => ({
          id: String(row.id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          contractedPowerKw: Number(row.potencia_contratada_kw),
          tariffName: String(row.nombre_tarifa || 'IberLuz 3.0TD Industrial'),
          pricePerKwDay: Number(row.precio_kw_dia || 0.11),
          pricePerKwh: Number(row.precio_kwh || 0.14),
          status: String(row.estado) as 'active' | 'cancelled',
          contractDate: row.fecha_contrato ? new Date(row.fecha_contrato).toISOString() : new Date().toISOString(),
          cupsCode: String(row.cups_code || '')
        }));
      }

      // Reconstruct db.naveFloorPlans from Supabase "planos_distribucion_naves"
      if (resFloorPlans.rows.length > 0) {
        db.naveFloorPlans = resFloorPlans.rows.map((row: any) => ({
          id: String(row.id),
          propertyId: String(row.inmueble_id),
          studentId: String(row.alumno_id),
          machineryZoneM2: Number(row.zona_maquinaria_m2),
          storageZoneM2: Number(row.zona_almacen_m2),
          adminZoneM2: Number(row.zona_admin_m2),
          freeZoneM2: Number(row.zona_libre_m2),
          warehousesCount: Number(row.num_almacenes || 2),
          updatedAt: row.fecha_actualizacion ? new Date(row.fecha_actualizacion).toISOString() : new Date().toISOString()
        }));
      }

      // Reconstruct db.telecomContracts from Supabase "contratos_telecom"
      if (resTelContracts.rows.length > 0) {
        db.telecomContracts = resTelContracts.rows.map((row: any) => ({
          id: String(row.id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          planId: String(row.plan_id),
          planName: String(row.plan_nombre),
          provider: String(row.proveedor),
          monthlyPrice: Number(row.precio_mensual),
          speedMbps: Number(row.velocidad_mbps || 0),
          mobileLinesCount: Number(row.lineas_moviles || 0),
          propertyId: row.inmueble_id ? String(row.inmueble_id) : '',
          propertyTitle: row.inmueble_titulo ? String(row.inmueble_titulo) : '',
          phoneNumber: row.numero_telefono ? String(row.numero_telefono) : undefined,
          status: String(row.estado) as 'active' | 'cancelled',
          contractDate: row.fecha_contrato ? new Date(row.fecha_contrato).toISOString() : new Date().toISOString()
        }));
      }

      // Reconstruct db.telecomInvoices from Supabase "facturas_telecom"
      if (resTelInvoices.rows.length > 0) {
        db.telecomInvoices = resTelInvoices.rows.map((row: any) => ({
          id: String(row.id),
          invoiceNumber: String(row.numero_factura),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          companyName: String(row.empresa_nombre || row.alumno_nombre),
          nifCif: String(row.nif_cif || ''),
          contractId: String(row.contrato_id),
          planName: String(row.plan_nombre),
          provider: String(row.proveedor),
          periodMonth: Number(row.mes),
          periodYear: Number(row.anio),
          issueDate: new Date(row.fecha_emision).toISOString(),
          dueDate: new Date(row.fecha_vencimiento).toISOString(),
          subtotal: Number(row.subtotal),
          ivaRate: Number(row.tipo_iva || 21),
          ivaAmount: Number(row.importe_iva),
          totalAmount: Number(row.importe_total),
          status: String(row.estado) as 'pagado' | 'pendiente',
          paidDate: row.fecha_pago ? new Date(row.fecha_pago).toISOString() : undefined,
          items: row.conceptos ? (typeof row.conceptos === 'string' ? JSON.parse(row.conceptos) : row.conceptos) : [],
          paymentMethod: row.metodo_pago ? String(row.metodo_pago) : 'Transferencia Bancaria Directa'
        }));
      }

      // Reconstruct db.officeOrders from Supabase "pedidos_oficina"
      if (resOfficeOrders.rows.length > 0) {
        db.officeOrders = resOfficeOrders.rows.map((row: any) => ({
          id: String(row.id),
          orderNumber: String(row.numero_pedido),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          companyName: String(row.empresa_nombre || row.alumno_nombre),
          nifCif: String(row.nif_cif || ''),
          purchaseDate: new Date(row.fecha_compra).toISOString(),
          items: row.items ? (typeof row.items === 'string' ? JSON.parse(row.items) : row.items) : [],
          subtotal: Number(row.subtotal),
          ivaRate: Number(row.tipo_iva || 21),
          ivaAmount: Number(row.importe_iva),
          totalAmount: Number(row.importe_total),
          status: String(row.estado) as 'completado_pagado',
          paymentMethod: row.metodo_pago ? String(row.metodo_pago) : 'banco'
        }));
      }

      db.isSeed = false;
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
      console.log(`[Supabase Restore] Successfully restored ${resCuentas.rows.length} accounts, ${restoredTransfers.length} transfers, ${db.properties.length} properties, ${db.acquisitions.length} acquisitions, ${db.paymentObligations.length} obligations, ${resLoans.rows.length} loans, ${resJobs.rows.length} jobs, ${resEmployees.rows.length} employees, ${resPayrolls.rows.length} payrolls, ${resTaxes.rows.length} taxes, ${resContracts.rows.length} electricity contracts, ${resFloorPlans.rows.length} floor plans from Supabase!`);
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
    req.url.startsWith('/acquisitions') ||
    req.url.startsWith('/machinery') ||
    req.url.startsWith('/loans') ||
    req.url.startsWith('/reset-simulation')
  );

  if (shouldRewrite) {
    req.url = '/api' + req.url;
  }
  next();
});

function getDefaultSeedRawMaterialAnnouncements(): RawMaterialAnnouncement[] {
  return [
    {
      id: 'rm-hierro',
      materialType: 'hierro',
      title: 'Fragmentos de Hierro',
      presentation: 'Pallet de 1.000 kg (Fragmentos)',
      unitWeightKg: 1000,
      isPallet: true,
      pricePerUnit: 450,
      description: 'Materia prima metálica de alta calidad para producción en Línea de Varilla y Punta. Presentación en palet de 1.000 kg.',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rm-metal',
      materialType: 'metal',
      title: 'Fragmentos de Metal',
      presentation: 'Pallet de 1.000 kg (Fragmentos)',
      unitWeightKg: 1000,
      isPallet: true,
      pricePerUnit: 520,
      description: 'Fragmentos metálicos para aleación y varillas de destornilladores. Presentación en palet de 1.000 kg.',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rm-plastico',
      materialType: 'plastico',
      title: 'Pellets de Plástico',
      presentation: 'Pallet de 1.000 kg (40 sacos de 25 kg)',
      unitWeightKg: 1000,
      isPallet: true,
      pricePerUnit: 380,
      description: 'Polímero plástico en pellets para inyección de mangos. 40 sacos de 25 kg por palet (total 1.000 kg).',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'rm-epoxi',
      materialType: 'epoxi',
      title: 'Pegamento Epoxi',
      presentation: 'Lata de 5 kg',
      unitWeightKg: 5,
      isPallet: false,
      pricePerUnit: 45,
      description: 'Resina y pegamento epoxi bicomponente de grado industrial para ensamblaje final. Lata de 5 kg.',
      updatedAt: new Date().toISOString()
    }
  ];
}

function checkAndCalculateProduction(db: DatabaseSchema, studentId: string) {
  if (!db.rawMaterialInventories) db.rawMaterialInventories = [];
  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];

  const now = new Date();

  // Auto-deliver approved orders when time has passed
  for (const ord of db.rawMaterialOrders) {
    if (ord.studentId === studentId && ord.status === 'aprobado') {
      const delivTime = ord.estimatedDeliveryAt ? new Date(ord.estimatedDeliveryAt) : now;
      if (now >= delivTime) {
        ord.status = 'entregado';
        ord.deliveredAt = now.toISOString();

        let inv = db.rawMaterialInventories.find(i => i.studentId === studentId);
        if (!inv) {
          inv = {
            studentId,
            ironKg: 0,
            metalKg: 0,
            plasticKg: 0,
            epoxiKg: 0,
            producedRodsUnits: 0,
            producedScrewdriversUnits: 0,
            lastCalculatedAt: now.toISOString(),
            updatedAt: now.toISOString()
          };
          db.rawMaterialInventories.push(inv);
        }

        if (ord.materialType === 'hierro') inv.ironKg += ord.totalKg;
        if (ord.materialType === 'metal') inv.metalKg += ord.totalKg;
        if (ord.materialType === 'plastico') inv.plasticKg += ord.totalKg;
        if (ord.materialType === 'epoxi') inv.epoxiKg += ord.totalKg;
        inv.updatedAt = now.toISOString();
      }
    }
  }

  let inv = db.rawMaterialInventories.find(i => i.studentId === studentId);
  if (!inv) {
    inv = {
      studentId,
      ironKg: 0,
      metalKg: 0,
      plasticKg: 0,
      epoxiKg: 0,
      producedRodsUnits: 0,
      producedScrewdriversUnits: 0,
      lastCalculatedAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    db.rawMaterialInventories.push(inv);
  }

  const lastTime = new Date(inv.lastCalculatedAt || now);
  const elapsedMs = now.getTime() - lastTime.getTime();
  const hoursElapsed = Math.min(24, Math.max(0, elapsedMs / (1000 * 60))); // 1 min real = 1 hour simulated

  if (hoursElapsed > 0.05) {
    const machinery = (db.machineryAcquisitions || []).filter(m => m.studentId === studentId && m.status !== 'montaje');
    const line1 = machinery.find(m => m.category === 'metal_hierro');
    const line2 = machinery.find(m => m.category === 'plastico_montaje' || m.category === 'plastico_ensamblaje');

    const numLines = machinery.length;
    const reqWh = numLines === 1 ? 2 : 3;

    const electricityContracts = (db.electricityContracts || []).filter(e => e.studentId === studentId && e.status === 'active');
    const hasElectricity = electricityContracts.length > 0;

    const ownedForklifts = (db.purchasedVehicles || []).filter(v => v.studentId === studentId && v.vehicleType === 'carretilla_elevadora').length;
    const hasForklifts = ownedForklifts >= reqWh;

    const hiredEmployees = (db.hiredEmployees || []).filter(e => e.studentId === studentId);
    const carretilleros = hiredEmployees.filter(e => e.role === 'carretillero');
    let missingWhCarretillero = false;
    for (let wh = 1; wh <= reqWh; wh++) {
      if (!carretilleros.some(e => e.assignedWarehouseIndex === wh)) {
        missingWhCarretillero = true;
        break;
      }
    }
    const hasCarretilleros = !missingWhCarretillero;

    // Line 1 calculation
    if (line1 && hasElectricity && hasForklifts && hasCarretilleros) {
      const line1Ops = hiredEmployees.filter(e => e.assignedMachineryId === line1.id);
      const mOps = line1Ops.filter(e => (e.shift || 1) === 1).length;
      const aOps = line1Ops.filter(e => e.shift === 2).length;
      const nOps = line1Ops.filter(e => e.shift === 3).length;

      const activeShiftsCount = [mOps >= 5, aOps >= 5, nOps >= 5].filter(Boolean).length;

      if (activeShiftsCount > 0) {
        const potentialUnits1 = Math.floor(hoursElapsed * activeShiftsCount * 100);
        const availableRawKg = inv.ironKg + inv.metalKg;
        const maxUnitsFromRaw = Math.floor(availableRawKg / 0.0495);

        const actualProduced1 = Math.min(potentialUnits1, maxUnitsFromRaw);
        if (actualProduced1 > 0) {
          const neededKg = actualProduced1 * 0.0495;
          if (inv.ironKg >= neededKg) {
            inv.ironKg -= neededKg;
          } else {
            const rem = neededKg - inv.ironKg;
            inv.ironKg = 0;
            inv.metalKg = Math.max(0, inv.metalKg - rem);
          }
          inv.producedRodsUnits += actualProduced1;
        }
      }
    }

    // Line 2 calculation
    if (line2 && hasElectricity && hasForklifts && hasCarretilleros) {
      const line2Ops = hiredEmployees.filter(e => e.assignedMachineryId === line2.id);
      const mOps = line2Ops.filter(e => (e.shift || 1) === 1).length;
      const aOps = line2Ops.filter(e => e.shift === 2).length;
      const nOps = line2Ops.filter(e => e.shift === 3).length;

      const activeShiftsCount = [mOps >= 5, aOps >= 5, nOps >= 5].filter(Boolean).length;

      if (activeShiftsCount > 0) {
        const ratePerHour = line1 ? 100 : 120;
        const potentialUnits2 = Math.floor(hoursElapsed * activeShiftsCount * ratePerHour);

        const maxUnitsFromRods = inv.producedRodsUnits;
        const maxUnitsFromPlastic = Math.floor(inv.plasticKg / 0.0275);
        const maxUnitsFromEpoxi = Math.floor(inv.epoxiKg / 0.0005);

        const actualProduced2 = Math.min(potentialUnits2, maxUnitsFromRods, maxUnitsFromPlastic, maxUnitsFromEpoxi);
        if (actualProduced2 > 0) {
          inv.producedRodsUnits -= actualProduced2;
          inv.plasticKg = Math.max(0, inv.plasticKg - actualProduced2 * 0.0275);
          inv.epoxiKg = Math.max(0, inv.epoxiKg - actualProduced2 * 0.0005);
          inv.producedScrewdriversUnits += actualProduced2;
        }
      }
    }

    inv.lastCalculatedAt = now.toISOString();
    inv.updatedAt = now.toISOString();
  }

  return inv;
}

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

function calcGrossForStudentMonth(studentId: string, targetMonth: number, targetYear: number, db: DatabaseSchema): number {
  const emps = (db.hiredEmployees || []).filter(e => e.studentId === studentId);
  let totalGross = 0;
  for (const emp of emps) {
    if (!emp.hireDate) {
      totalGross += emp.grossSalaryMonthly;
      continue;
    }
    const parts = emp.hireDate.split('T')[0].split('-');
    const hireYear = parseInt(parts[0], 10);
    const hireMonth = parseInt(parts[1], 10);
    const hireDay = parseInt(parts[2], 10);

    if (targetYear < hireYear || (targetYear === hireYear && targetMonth < hireMonth)) {
      continue; // Not hired yet in targetMonth
    }
    if (hireYear === targetYear && hireMonth === targetMonth) {
      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
      const daysWorked = Math.max(1, daysInMonth - hireDay + 1);
      totalGross += (emp.grossSalaryMonthly / daysInMonth) * daysWorked;
    } else {
      totalGross += emp.grossSalaryMonthly;
    }
  }
  return Math.round(totalGross * 100) / 100;
}

function normalizeAndFixTaxObligations(db: DatabaseSchema) {
  if (!db.taxObligations) return;
  for (const tax of db.taxObligations) {
    if (tax.status !== 'pendiente') continue;

    const d = new Date(tax.dueDate);
    let changed = false;

    // 1. Fix TGSS SS obligations -> must be due on the 20th of the month
    if ((tax.type as string) === 'ss_employee' || (tax.type as string) === 'ss_company' || (tax.type as string) === 'ss' || (tax.type as string) === 'seguridad_social') {
      if (d.getDate() !== 20) {
        d.setDate(20);
        tax.dueDate = d.toISOString();
        changed = true;
      }
      const match = tax.concept.match(/(\d{1,2})\/(\d{4})/);
      let targetMonth = d.getMonth() === 0 ? 12 : d.getMonth();
      let targetYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
      if (match) {
        targetMonth = parseInt(match[1], 10);
        targetYear = parseInt(match[2], 10);
      }

      const mGross = calcGrossForStudentMonth(tax.studentId, targetMonth, targetYear, db);

      if (tax.type === 'ss_employee') {
        const newConcept = `Cuotas Seguridad Social Trabajador (6,48%) Mes ${targetMonth}/${targetYear}`;
        if (tax.concept !== newConcept) {
          tax.concept = newConcept;
          changed = true;
        }
        if (mGross > 0) {
          const expectedSS = Math.round(mGross * 0.0648 * 100) / 100;
          if (tax.amount !== expectedSS) {
            tax.amount = expectedSS;
            changed = true;
          }
        }
      } else if (tax.type === 'ss_company') {
        const newConcept = `Aportación patronal Seguridad Social (75%) Mes ${targetMonth}/${targetYear}`;
        if (tax.concept !== newConcept) {
          tax.concept = newConcept;
          changed = true;
        }
        if (mGross > 0) {
          const expectedSSComp = Math.round(mGross * 0.75 * 100) / 100;
          if (tax.amount !== expectedSSComp) {
            tax.amount = expectedSSComp;
            changed = true;
          }
        }
      }
    }

    // 2. Fix AEAT IRPF obligations -> must be due on 15th of month following quarter (Jan 15, Apr 15, Jul 15, Oct 15)
    if (tax.type === 'irpf') {
      const month = d.getMonth(); // 0-indexed
      let correctMonth = 9; // Oct 15 default for Q3
      let correctYear = d.getFullYear();
      let qNum = 3;

      if (month === 7 || month === 9) { // August or Oct -> Q3 IRPF -> October 15
        correctMonth = 9;
        qNum = 3;
      } else if (month === 10 || month === 0) { // November or Jan -> Q4 IRPF -> January 15
        correctMonth = 0;
        correctYear = d.getFullYear();
        qNum = 4;
      } else if (month === 1 || month === 3) { // February or Apr -> Q1 IRPF -> April 15
        correctMonth = 3;
        qNum = 1;
      } else if (month === 4 || month === 6) { // May or Jul -> Q2 IRPF -> July 15
        correctMonth = 6;
        qNum = 2;
      }

      if (d.getDate() !== 15 || d.getMonth() !== correctMonth) {
        const fixedDate = new Date(correctYear, correctMonth, 15, 9, 0, 0);
        tax.dueDate = fixedDate.toISOString();
        changed = true;
      }

      const refYear = correctMonth === 0 ? correctYear - 1 : correctYear;
      const newConcept = `Retenciones IRPF de nóminas (17%) Trimestre Q${qNum} ${refYear}`;
      if (tax.concept !== newConcept) {
        tax.concept = newConcept;
        changed = true;
      }

      const qGross = calcGrossForStudentMonth(tax.studentId, (qNum - 1) * 3 + 1, refYear, db) +
                     calcGrossForStudentMonth(tax.studentId, (qNum - 1) * 3 + 2, refYear, db) +
                     calcGrossForStudentMonth(tax.studentId, (qNum - 1) * 3 + 3, refYear, db);

      if (qGross > 0) {
        const expectedIRPF = Math.round(qGross * 0.17 * 100) / 100;
        if (tax.amount !== expectedIRPF) {
          tax.amount = expectedIRPF;
          changed = true;
        }
      }
    }

    if (changed) {
      syncTaxObligationToSupabase(tax).catch(e => console.error(e));
    }
  }

  // Consolidation: merge duplicate pending obligations for same studentId + type + dueDate
  const pendingMap = new Map<string, TaxObligation>();
  const toRemoveIds = new Set<string>();

  for (const tax of db.taxObligations) {
    if (tax.status !== 'pendiente') continue;
    const key = `${tax.studentId}-${tax.type}-${tax.dueDate}`;
    if (!pendingMap.has(key)) {
      pendingMap.set(key, tax);
    } else {
      const existing = pendingMap.get(key)!;
      existing.amount = Math.round((existing.amount + tax.amount) * 100) / 100;
      toRemoveIds.add(tax.id);
      syncTaxObligationToSupabase(existing).catch(e => console.error(e));
    }
  }

  if (toRemoveIds.size > 0) {
    db.taxObligations = db.taxObligations.filter(t => !toRemoveIds.has(t.id));
  }
}

function checkAndProcessAutomatedPayrollAndTaxes(db: DatabaseSchema) {
  if (!db.hiredEmployees) db.hiredEmployees = [];
  if (!db.payrollRecords) db.payrollRecords = [];
  if (!db.taxObligations) db.taxObligations = [];
  if (!db.jobListings) db.jobListings = [];

  normalizeAndFixTaxObligations(db);

  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1; // 1 - 12
  const currentYear = now.getFullYear();

  // 1. Process Payroll on day 26 or later
  if (currentDay >= 26) {
    const studentsWithEmployees = new Set(db.hiredEmployees.map(e => e.studentId));

    for (const studentId of studentsWithEmployees) {
      const student = db.users.find(u => u.id === studentId && u.role === 'student');
      if (!student) continue;

      const alreadyProcessed = db.payrollRecords.some(
        pr => pr.studentId === studentId && pr.periodMonth === currentMonth && pr.periodYear === currentYear
      );

      if (!alreadyProcessed) {
        const myEmployees = db.hiredEmployees.filter(e => e.studentId === studentId);
        if (myEmployees.length === 0) continue;

        let totalGross = 0;
        let isProportionalPayroll = false;

        for (const emp of myEmployees) {
          if (emp.hireDate) {
            const parts = emp.hireDate.split('T')[0].split('-');
            const hireYear = parseInt(parts[0], 10);
            const hireMonth = parseInt(parts[1], 10);
            const hireDay = parseInt(parts[2], 10);

            if (hireMonth === currentMonth && hireYear === currentYear) {
              isProportionalPayroll = true;
              const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
              const daysWorked = Math.max(1, daysInMonth - hireDay + 1);
              totalGross += (emp.grossSalaryMonthly / daysInMonth) * daysWorked;
            } else if (hireYear < currentYear || (hireYear === currentYear && hireMonth < currentMonth)) {
              totalGross += emp.grossSalaryMonthly;
            }
          } else {
            totalGross += emp.grossSalaryMonthly;
          }
        }

        totalGross = Math.round(totalGross * 100) / 100;
        const totalEmployeeIRPF = Math.round(totalGross * 0.17 * 100) / 100;
        const totalEmployeeSS = Math.round(totalGross * 0.0648 * 100) / 100;
        const totalNetPaid = Math.round((totalGross - totalEmployeeIRPF - totalEmployeeSS) * 100) / 100;
        const totalCompanySS = Math.round(totalGross * 0.75 * 100) / 100;

        student.balance = Math.round((student.balance - totalNetPaid) * 100) / 100;
        syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));

        const txId = generateId('tx');
        const transfer: Transfer = {
          id: txId,
          senderId: student.id,
          senderName: student.name,
          senderAccount: student.accountNumber,
          receiverId: 'empleados-nomina',
          receiverName: 'Personal Empleado / Nóminas',
          receiverAccount: 'ES000000000000000000',
          amount: totalNetPaid,
          concept: `Pago automático de nóminas del mes ${currentMonth}/${currentYear} (${myEmployees.length} empleados)`,
          timestamp: now.toISOString()
        };
        db.transfers.unshift(transfer);
        syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalNetPaid, now.toISOString(), transfer.concept).catch(e => console.error(e));

        const prId = generateId('payroll');
        const newPR: PayrollRecord = {
          id: prId,
          studentId: student.id,
          studentName: student.name,
          payrollDate: now.toISOString(),
          periodMonth: currentMonth,
          periodYear: currentYear,
          employeeCount: myEmployees.length,
          totalGrossSalary: totalGross,
          totalEmployeeSS: totalEmployeeSS,
          totalEmployeeIRPF: totalEmployeeIRPF,
          totalNetSalaryPaid: totalNetPaid,
          totalCompanySS: totalCompanySS,
          isProportional: isProportionalPayroll,
          status: 'paid',
          createdAt: now.toISOString()
        };
        db.payrollRecords.push(newPR);
        syncPayrollRecordToSupabase(newPR).catch(e => console.error(e));

        // TGSS SS due date: 20th of following month
        let nextMonth = currentMonth + 1;
        let nextYear = currentYear;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear += 1;
        }
        const ssDueDateObj = new Date(nextYear, nextMonth - 1, 20, 9, 0, 0);

        // AEAT IRPF due date: 15th of first month of following quarter
        let qNum = 1;
        let irpfDueDateObj: Date;
        if (currentMonth >= 10) {
          qNum = 4;
          irpfDueDateObj = new Date(currentYear + 1, 0, 15, 9, 0, 0); // Jan 15 next year
        } else if (currentMonth >= 7) {
          qNum = 3;
          irpfDueDateObj = new Date(currentYear, 9, 15, 9, 0, 0); // Oct 15
        } else if (currentMonth >= 4) {
          qNum = 2;
          irpfDueDateObj = new Date(currentYear, 6, 15, 9, 0, 0); // Jul 15
        } else {
          qNum = 1;
          irpfDueDateObj = new Date(currentYear, 3, 15, 9, 0, 0); // Apr 15
        }

        const ssEmpObl: TaxObligation = {
          id: generateId('tax'),
          studentId: student.id,
          studentName: student.name,
          type: 'ss_employee',
          concept: `Cuotas Seguridad Social Trabajador (6,48%) Mes ${currentMonth}/${currentYear}`,
          amount: totalEmployeeSS,
          dueDate: ssDueDateObj.toISOString(),
          status: 'pendiente',
          payrollRecordId: prId
        };

        const ssCompObl: TaxObligation = {
          id: generateId('tax'),
          studentId: student.id,
          studentName: student.name,
          type: 'ss_company',
          concept: `Aportación patronal Seguridad Social (75%) Mes ${currentMonth}/${currentYear}`,
          amount: totalCompanySS,
          dueDate: ssDueDateObj.toISOString(),
          status: 'pendiente',
          payrollRecordId: prId
        };

        db.taxObligations.push(ssEmpObl, ssCompObl);
        syncTaxObligationToSupabase(ssEmpObl).catch(e => console.error(e));
        syncTaxObligationToSupabase(ssCompObl).catch(e => console.error(e));

        const existingIrpf = db.taxObligations.find(t => 
          t.studentId === student.id && 
          t.type === 'irpf' && 
          t.status === 'pendiente' && 
          new Date(t.dueDate).getFullYear() === irpfDueDateObj.getFullYear() && 
          new Date(t.dueDate).getMonth() === irpfDueDateObj.getMonth()
        );

        if (existingIrpf) {
          existingIrpf.amount = Math.round((existingIrpf.amount + totalEmployeeIRPF) * 100) / 100;
          existingIrpf.concept = `Retenciones IRPF de nóminas (17%) Trimestre Q${qNum} ${currentYear}`;
          syncTaxObligationToSupabase(existingIrpf).catch(e => console.error(e));
        } else {
          const irpfObl: TaxObligation = {
            id: generateId('tax'),
            studentId: student.id,
            studentName: student.name,
            type: 'irpf',
            concept: `Retenciones IRPF de nóminas (17%) Trimestre Q${qNum} ${currentYear}`,
            amount: totalEmployeeIRPF,
            dueDate: irpfDueDateObj.toISOString(),
            status: 'pendiente',
            payrollRecordId: prId
          };
          db.taxObligations.push(irpfObl);
          syncTaxObligationToSupabase(irpfObl).catch(e => console.error(e));
        }

        db.systemLogs.unshift({
          id: generateId('log'),
          action: 'PAYROLL_AUTOMATED',
          details: `Nóminas pagadas automáticamente para ${student.name}: Líquido ${totalNetPaid}€ (${myEmployees.length} empleados). Generadas deudas con Hacienda (IRPF: ${totalEmployeeIRPF}€) y Seguridad Social (Empleado: ${totalEmployeeSS}€, Empresa: ${totalCompanySS}€).`,
          timestamp: now.toISOString(),
          studentId: student.id,
          studentName: student.name
        });
      }
    }
  }

  // 2. Process Tax Obligations on day 1 or later
  if (currentDay >= 1) {
    const pendingTaxes = db.taxObligations.filter(t => t.status === 'pendiente' && new Date(t.dueDate) <= now);
    for (const tax of pendingTaxes) {
      const student = db.users.find(u => u.id === tax.studentId && u.role === 'student');
      if (!student) continue;

      student.balance = Math.round((student.balance - tax.amount) * 100) / 100;
      tax.status = 'pagado';
      tax.paidDate = now.toISOString();

      syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));
      syncTaxObligationToSupabase(tax).catch(e => console.error(e));

      const txId = generateId('tx');
      const receiverName = tax.type === 'irpf' ? 'Agencia Tributaria - Hacienda Pública' : 'Tesorería General de la Seguridad Social';
      const transfer: Transfer = {
        id: txId,
        senderId: student.id,
        senderName: student.name,
        senderAccount: student.accountNumber,
        receiverId: tax.type === 'irpf' ? 'hacienda' : 'seguridad-social',
        receiverName: receiverName,
        receiverAccount: 'ES000000000000000000',
        amount: tax.amount,
        concept: `Pago automático de ${tax.concept}`,
        timestamp: now.toISOString()
      };
      db.transfers.unshift(transfer);
      syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', tax.amount, now.toISOString(), transfer.concept).catch(e => console.error(e));

      db.systemLogs.unshift({
        id: generateId('log'),
        action: 'TAX_AUTOMATED_PAYMENT',
        details: `Pago automático fiscal realizado por ${student.name}: ${tax.concept} por importe de ${tax.amount}€`,
        timestamp: now.toISOString(),
        studentId: student.id,
        studentName: student.name
      });
    }
  }
}

function calculateElectricityForStudent(studentId: string, month: number, year: number, db: DatabaseSchema): ElectricityBill | null {
  const student = db.users.find(u => u.id === studentId);
  if (!student) return null;

  const studentAcquisitions = (db.acquisitions || []).filter(a => a.studentId === studentId);
  const studentMachinery = (db.machineryAcquisitions || []).filter(m => m.studentId === studentId);
  const studentEmployees = (db.hiredEmployees || []).filter(e => e.studentId === studentId);
  const contract = (db.electricityContracts || []).find(c => c.studentId === studentId && c.status === 'active');

  if (!contract) return null;

  let totalMachineryKw = 0;
  let totalMachineryKwhMonth = 0;
  let maxShifts = 0;

  studentMachinery.forEach(m => {
    const mKw = m.requiredPowerKW || m.powerKw || (m.category === 'metal_hierro' ? 35 : 25);
    totalMachineryKw += mKw;

    const assigned = studentEmployees.filter(e => e.assignedMachineryId === m.id || e.assignedMachineryTitle === m.title);
    const shifts = Math.max(1, Math.min(3, assigned.length));
    if (shifts > maxShifts) maxShifts = shifts;

    const h = shifts * 8 * 20;
    totalMachineryKwhMonth += mKw * h;
  });

  if (studentMachinery.length > 0 && maxShifts === 0) maxShifts = 1;

  let totalLightingKwhMonth = 0;
  let totalComputersKwhMonth = 0;
  let totalHvacKwhMonth = 0;

  const propertyBreakdown: ElectricityPropertyBreakdown[] = [];

  studentAcquisitions.forEach(prop => {
    const pType = prop.propertyType || prop.type || '';
    const isNave = pType === 'nave_industrial' || prop.propertyTitle?.toLowerCase().includes('nave');
    const isLocal = pType === 'local_comercial' || prop.propertyTitle?.toLowerCase().includes('local');
    const isAlmacen = pType === 'almacen' || prop.propertyTitle?.toLowerCase().includes('almacén');

    const surface = prop.surfaceM2 || 500;
    let propLightingKwh = 0;
    let propHvacKwh = 0;
    let propPcKwh = 0;
    let propMachineryKwh = 0;

    if (isNave) {
      const naveShifts = maxShifts || 1;
      propLightingKwh = surface * naveShifts * 1.0;
      totalLightingKwhMonth += propLightingKwh;

      const adminSurf = Math.round(surface * 0.10);
      propHvacKwh = adminSurf * 0.060 * 160;
      totalHvacKwhMonth += propHvacKwh;

      propPcKwh = 2 * 0.10 * 160;
      totalComputersKwhMonth += propPcKwh;

      propMachineryKwh = totalMachineryKwhMonth;
    } else if (isLocal) {
      propLightingKwh = surface * 0.015 * 160;
      totalLightingKwhMonth += propLightingKwh;

      propHvacKwh = surface * 0.060 * 160;
      totalHvacKwhMonth += propHvacKwh;

      propPcKwh = 1 * 0.10 * 160;
      totalComputersKwhMonth += propPcKwh;
    } else if (isAlmacen) {
      propLightingKwh = surface * 0.006 * 160;
      totalLightingKwhMonth += propLightingKwh;

      propPcKwh = 1 * 0.10 * 160;
      totalComputersKwhMonth += propPcKwh;
    }

    const propTotalKwh = Math.round(propMachineryKwh + propLightingKwh + propHvacKwh + propPcKwh);
    propertyBreakdown.push({
      propertyId: prop.propertyId || prop.id,
      propertyTitle: prop.propertyTitle || 'Inmueble',
      propertyType: pType,
      surfaceM2: surface,
      machineryCount: studentMachinery.length,
      activeShifts: maxShifts,
      kwhMachinery: Math.round(propMachineryKwh),
      kwhLighting: Math.round(propLightingKwh),
      kwhComputers: Math.round(propPcKwh),
      kwhHvac: Math.round(propHvacKwh),
      totalKwh: propTotalKwh,
      kwPowerEstimate: contract.contractedPowerKw,
      costEstimate: Math.round(propTotalKwh * contract.pricePerKwh * 100) / 100
    });
  });

  const totalKwh = Math.round(totalMachineryKwhMonth + totalLightingKwhMonth + totalComputersKwhMonth + totalHvacKwhMonth);
  const daysInMonth = new Date(year, month, 0).getDate();

  const contractDate = new Date(contract.contractDate || Date.now());
  const cYear = contractDate.getFullYear();
  const cMonth = contractDate.getMonth() + 1; // 1-indexed

  // Do not generate bills for periods prior to the month/year the contract was created!
  if (year < cYear || (year === cYear && month < cMonth)) {
    return null;
  }

  let startDay = 1;
  if (year === cYear && month === cMonth) {
    startDay = contractDate.getDate();
  }

  const activeDays = Math.max(1, daysInMonth - startDay + 1);
  const daysFactor = activeDays / daysInMonth;

  const totalKwhBill = Math.round(totalKwh * daysFactor);
  const powerAmount = Math.round(contract.contractedPowerKw * activeDays * contract.pricePerKwDay * 100) / 100;
  const energyAmount = Math.round(totalKwhBill * contract.pricePerKwh * 100) / 100;
  const equipmentRental = Math.round(0.85 * daysFactor * 100) / 100;

  const taxableBase = Math.round((powerAmount + energyAmount + equipmentRental) * 100) / 100;
  const electricityTax = Math.round((taxableBase * 0.0511269632) * 100) / 100;
  const subtotalWithTax = Math.round((taxableBase + electricityTax) * 100) / 100;
  const ivaAmount = Math.round((subtotalWithTax * 0.21) * 100) / 100;
  const totalAmount = Math.round((subtotalWithTax + ivaAmount) * 100) / 100;

  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const dueDateObj = new Date(nextYear, nextMonth - 1, 5, 9, 0, 0);

  const billNumber = `IBL-${year}-${month < 10 ? '0' + month : month}-${studentId.slice(-4).toUpperCase()}`;

  const startDayStr = startDay < 10 ? '0' + startDay : `${startDay}`;
  const monthStr = month < 10 ? '0' + month : `${month}`;

  return {
    id: generateId('elec_bill'),
    studentId: student.id,
    studentName: student.name,
    contractId: contract.id,
    billNumber,
    periodMonth: month,
    periodYear: year,
    startDate: `${year}-${monthStr}-${startDayStr}`,
    endDate: `${year}-${monthStr}-${daysInMonth}`,
    daysCount: activeDays,
    contractedPowerKw: contract.contractedPowerKw,
    pricePerKwDay: contract.pricePerKwDay,
    powerAmount,
    totalKwh: totalKwhBill,
    pricePerKwh: contract.pricePerKwh,
    energyAmount,
    equipmentRental,
    taxableBase,
    electricityTax,
    subtotalWithTax,
    ivaRate: 21,
    ivaAmount,
    totalAmount,
    dueDate: dueDateObj.toISOString(),
    status: 'pendiente',
    createdAt: new Date().toISOString(),
    cupsCode: contract.cupsCode,
    companyName: student.name,
    cifNif: student.nifCif || 'B-98765432',
    propertyBreakdown
  };
}

function checkAndProcessAutomatedElectricity(db: DatabaseSchema) {
  if (!db.electricityContracts) db.electricityContracts = [];
  if (!db.electricityBills) db.electricityBills = [];

  // Filter out any erroneous bills for period months prior to contract creation, and refund if paid
  const validBills: ElectricityBill[] = [];
  for (const bill of db.electricityBills) {
    const contract = db.electricityContracts.find(c => c.studentId === bill.studentId && c.status === 'active');
    if (contract) {
      const cDate = new Date(contract.contractDate || Date.now());
      const cYear = cDate.getFullYear();
      const cMonth = cDate.getMonth() + 1;
      if (bill.periodYear < cYear || (bill.periodYear === cYear && bill.periodMonth < cMonth)) {
        if (bill.status === 'pagado') {
          const student = db.users.find(u => u.id === bill.studentId);
          if (student) {
            student.balance = Math.round((student.balance + bill.totalAmount) * 100) / 100;
            syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));
          }
          if (db.transfers) {
            db.transfers = db.transfers.filter(t => !t.concept.includes(`factura de electricidad IberLuz Mes ${bill.periodMonth}/${bill.periodYear}`));
          }
        }
        continue; // Skip invalid bill
      }
    }
    validBills.push(bill);
  }
  db.electricityBills = validBills;

  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = currentYear - 1;
  }

  // 1. Generate bill for previous month if not existing
  for (const contract of db.electricityContracts.filter(c => c.status === 'active')) {
    const existingBill = db.electricityBills.find(
      b => b.studentId === contract.studentId && b.periodMonth === prevMonth && b.periodYear === prevYear
    );

    if (!existingBill) {
      const newBill = calculateElectricityForStudent(contract.studentId, prevMonth, prevYear, db);
      if (newBill) {
        db.electricityBills.push(newBill);
      }
    }
  }

  // 2. On day 5 or later of month: Process payment for unpaid electricity bills automatically
  if (currentDay >= 5) {
    const pendingBills = db.electricityBills.filter(
      b => b.status === 'pendiente' && new Date(b.dueDate) <= now
    );

    for (const bill of pendingBills) {
      const student = db.users.find(u => u.id === bill.studentId && u.role === 'student');
      if (!student) continue;

      student.balance = Math.round((student.balance - bill.totalAmount) * 100) / 100;
      bill.status = 'pagado';
      bill.paidDate = now.toISOString();

      syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));

      const txId = generateId('tx');
      const transfer: Transfer = {
        id: txId,
        senderId: student.id,
        senderName: student.name,
        senderAccount: student.accountNumber,
        receiverId: 'iberluz-comercializadora',
        receiverName: 'IberLuz Comercializadora S.A.',
        receiverAccount: 'ES210001000299887722',
        amount: bill.totalAmount,
        concept: `Pago domiciliado de factura de electricidad IberLuz Mes ${bill.periodMonth}/${bill.periodYear} (Nº ${bill.billNumber})`,
        timestamp: now.toISOString()
      };
      db.transfers.unshift(transfer);
      syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', bill.totalAmount, now.toISOString(), transfer.concept).catch(e => console.error(e));

      db.systemLogs.unshift({
        id: generateId('log'),
        action: 'ELECTRICITY_AUTOMATED_PAYMENT',
        details: `Pago automático de electricidad IberLuz realizado para ${student.name}: Factura ${bill.billNumber} por importe de ${bill.totalAmount}€`,
        timestamp: now.toISOString(),
        studentId: student.id,
        studentName: student.name
      });
    }
  }
}

function checkAndProcessAutomatedTelecom(db: DatabaseSchema) {
  if (!db.telecomContracts) db.telecomContracts = [];
  if (!db.telecomInvoices) db.telecomInvoices = [];

  const now = new Date();
  const activeContracts = db.telecomContracts.filter(c => c.status === 'active');

  for (const contract of activeContracts) {
    const student = db.users.find(u => u.id === contract.studentId && u.role === 'student');
    if (!student) continue;

    const cDate = new Date(contract.contractDate);
    const startYear = cDate.getFullYear();
    const startMonth = cDate.getMonth() + 1; // 1-indexed

    // 1. Clean up any premature invoices created on contract sign-up date before the 1st of the following month
    const prematureInvoices = db.telecomInvoices.filter(inv => {
      if (inv.contractId !== contract.id) return false;
      const invDate = new Date(inv.issueDate);
      const firstDueOfContract = new Date(startYear, startMonth, 1, 0, 0, 0); // 1st of month following contract month
      return invDate < firstDueOfContract;
    });

    for (const premInv of prematureInvoices) {
      student.balance = Math.round((student.balance + premInv.totalAmount) * 100) / 100;
      syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));

      db.telecomInvoices = db.telecomInvoices.filter(i => i.id !== premInv.id);

      if (db.transfers) {
        db.transfers = db.transfers.filter(t => !(t.senderId === student.id && t.amount === premInv.totalAmount && t.concept.includes(premInv.invoiceNumber)));
      }
    }

    // 2. Process billing for any completed month where payment is due (due on 1st of month M+1)
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;

    let curY = startYear;
    let curM = startMonth;

    while (curY < nowYear || (curY === nowYear && curM <= nowMonth)) {
      // Due date for service month (curY, curM) is 1st of month (curM + 1)
      const paymentDueDate = new Date(curY, curM, 1, 9, 0, 0);

      // Only process if paymentDueDate is on or before now
      if (now >= paymentDueDate) {
        const existingInvoice = db.telecomInvoices.find(
          inv => inv.contractId === contract.id && inv.periodMonth === curM && inv.periodYear === curY
        );

        if (!existingInvoice) {
          const daysInMonth = new Date(curY, curM, 0).getDate();
          let baseAmount = contract.monthlyPrice;
          let isProrated = false;
          let activeDays = daysInMonth;

          if (curY === startYear && curM === startMonth) {
            const startDay = cDate.getDate();
            activeDays = Math.max(1, daysInMonth - startDay + 1);
            baseAmount = Math.round((contract.monthlyPrice * (activeDays / daysInMonth)) * 100) / 100;
            isProrated = true;
          }

          const ivaAmount = Math.round((baseAmount * 0.21) * 100) / 100;
          const totalAmount = Math.round((baseAmount + ivaAmount) * 100) / 100;

          const invoiceNumber = `TEL-${curY}-${String(curM).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
          const invoiceConcept = isProrated
            ? `Cuota proporcional de Servicio ${contract.planName} (${activeDays}/${daysInMonth} días del mes de alta ${curM}/${curY})`
            : `Cuota Mensual de Servicio ${contract.planName} (Mes ${curM}/${curY})`;

          const invoice: TelecomInvoice = {
            id: generateId('tel_inv'),
            invoiceNumber,
            studentId: student.id,
            studentName: student.name,
            companyName: student.name,
            nifCif: 'B-' + Math.floor(10000000 + Math.random() * 90000000),
            contractId: contract.id,
            planName: contract.planName,
            provider: contract.provider,
            periodMonth: curM,
            periodYear: curY,
            issueDate: paymentDueDate.toISOString(),
            dueDate: paymentDueDate.toISOString(),
            subtotal: baseAmount,
            ivaRate: 21,
            ivaAmount,
            totalAmount,
            status: 'pagado',
            paidDate: paymentDueDate.toISOString(),
            items: [
              {
                concept: invoiceConcept,
                amount: baseAmount
              }
            ],
            paymentMethod: 'Adeudo directo automático en cuenta (1 de mes)'
          };

          db.telecomInvoices.unshift(invoice);
          syncTelecomInvoiceToSupabase(invoice).catch(e => console.error(e));

          student.balance = Math.round((student.balance - totalAmount) * 100) / 100;
          syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));

          const txId = generateId('tx');
          const transfer: Transfer = {
            id: txId,
            senderId: student.id,
            senderName: student.name,
            senderAccount: student.accountNumber,
            receiverId: 'telecom-provider',
            receiverName: contract.provider,
            receiverAccount: 'ES880004000199223344',
            amount: totalAmount,
            concept: `Pago domiciliado cuota telecomunicaciones ${contract.planName} (${curM}/${curY})`,
            timestamp: paymentDueDate.toISOString()
          };
          if (!db.transfers) db.transfers = [];
          db.transfers.unshift(transfer);
          syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalAmount, paymentDueDate.toISOString(), transfer.concept).catch(e => console.error(e));

          if (!db.systemLogs) db.systemLogs = [];
          db.systemLogs.unshift({
            id: generateId('log'),
            action: 'TELECOM_AUTOMATED_PAYMENT',
            details: `Cobro mensual automático de telecomunicaciones ${contract.planName} para ${student.name}: ${totalAmount}€ (IVA incl.)`,
            timestamp: paymentDueDate.toISOString(),
            studentId: student.id,
            studentName: student.name
          });
        }
      }

      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }
  }
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
      transfers: [],
      systemLogs: [],
      properties: getDefaultSeedProperties(),
      acquisitions: [],
      paymentObligations: [],
      loans: [],
      machineryAcquisitions: [],
      jobListings: [],
      hiredEmployees: [],
      payrollRecords: [],
      taxObligations: [],
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
    if (!db.machineryAcquisitions) db.machineryAcquisitions = [];
    if (!db.jobListings) db.jobListings = [];
    if (!db.hiredEmployees) db.hiredEmployees = [];
    if (!db.payrollRecords) db.payrollRecords = [];
    if (!db.taxObligations) db.taxObligations = [];
    if (!db.electricityContracts) db.electricityContracts = [];
    if (!db.electricityBills) db.electricityBills = [];
    if (!db.naveFloorPlans) db.naveFloorPlans = [];
    if (!db.telecomContracts) db.telecomContracts = [];
    if (!db.telecomInvoices) db.telecomInvoices = [];
    if (!db.officeOrders) db.officeOrders = [];
    if (!db.purchasedVehicles) db.purchasedVehicles = [];
    if (!db.rawMaterialAnnouncements || db.rawMaterialAnnouncements.length === 0) {
      db.rawMaterialAnnouncements = getDefaultSeedRawMaterialAnnouncements();
    }
    if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
    if (!db.rawMaterialInventories) db.rawMaterialInventories = [];

    checkAndProcessAutomatedPayrollAndTaxes(db);
    checkAndProcessAutomatedElectricity(db);
    checkAndProcessAutomatedTelecom(db);

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
    syncAccountToSupabase(newUser.id, newUser.name, newUser.balance, newUser.username, newUser.password, newUser.accountNumber, newUser.role).catch(e => console.error(e));
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
    syncAccountToSupabase(user.id, user.name, user.balance, user.username, user.password, user.accountNumber, user.role).catch(e => console.error(e));
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
  const { amount, actionType, concept } = req.body; // actionType: 'add' | 'subtract' | 'set'

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

  let transferAmount = changeValue;
  let isAdd = true;

  if (actionType === 'add') {
    user.balance = Number((user.balance + changeValue).toFixed(2));
    isAdd = true;
  } else if (actionType === 'subtract') {
    user.balance = Number(Math.max(0, user.balance - changeValue).toFixed(2));
    isAdd = false;
  } else if (actionType === 'set') {
    const diff = changeValue - user.balance;
    user.balance = Number(Math.max(0, changeValue).toFixed(2));
    if (diff >= 0) {
      isAdd = true;
      transferAmount = Number(diff.toFixed(2));
    } else {
      isAdd = false;
      transferAmount = Number(Math.abs(diff).toFixed(2));
    }
  }

  // Create forced transaction transfer record
  const defaultConcept = concept && concept.trim() !== '' 
    ? concept.trim() 
    : (isAdd ? 'Abono forzado de fondos por Administración Docente' : 'Cobro forzado de fondos por Administración Docente');

  const teacherIBAN = 'ES99 0000 0000 0000 0000 0000';

  if (transferAmount > 0) {
    const forcedTransfer: Transfer = {
      id: generateId('tx'),
      senderId: isAdd ? 'teacher-admin' : user.id,
      senderName: isAdd ? 'Administración Docente / Profesor' : user.name,
      senderAccount: isAdd ? teacherIBAN : user.accountNumber,
      receiverId: isAdd ? user.id : 'teacher-admin',
      receiverName: isAdd ? user.name : 'Administración Docente / Profesor',
      receiverAccount: isAdd ? user.accountNumber : teacherIBAN,
      amount: transferAmount,
      concept: defaultConcept,
      timestamp: new Date().toISOString()
    };
    db.transfers.unshift(forcedTransfer);
  }

  if (user.role === 'student') {
    syncAccountToSupabase(user.id, user.name, user.balance).catch(e => console.error(e));
  }

  const newLog: SystemLog = {
    id: generateId('log'),
    action: 'BALANCE_ADJUSTMENT',
    details: `Transacción forzada (${isAdd ? 'Ingreso' : 'Deducción'}) para ${user.name}. Concepto: "${defaultConcept}". Importe: ${transferAmount} €, Anterior: ${oldBalance} €, Nuevo: ${user.balance} €`,
    timestamp: new Date().toISOString()
  };
  db.systemLogs.unshift(newLog);

  writeDb(db);
  res.json({ user });
});

// Delete user account (Teacher only)
app.delete('/api/users/:id', async (req, res) => {
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

  // Clean all student-owned records from local db memory
  if (db.acquisitions) db.acquisitions = db.acquisitions.filter(a => a.studentId !== id);
  if (db.paymentObligations) db.paymentObligations = db.paymentObligations.filter(o => o.studentId !== id);
  if (db.loans) db.loans = db.loans.filter(l => l.studentId !== id);
  if (db.machineryAcquisitions) db.machineryAcquisitions = db.machineryAcquisitions.filter(m => m.studentId !== id);
  if (db.hiredEmployees) db.hiredEmployees = db.hiredEmployees.filter(e => e.studentId !== id);
  if (db.payrollRecords) db.payrollRecords = db.payrollRecords.filter(p => p.studentId !== id);
  if (db.taxObligations) db.taxObligations = db.taxObligations.filter(t => t.studentId !== id);
  if (db.electricityContracts) db.electricityContracts = db.electricityContracts.filter(c => c.studentId !== id);
  if (db.naveFloorPlans) db.naveFloorPlans = db.naveFloorPlans.filter(fp => fp.studentId !== id);
  if (db.telecomContracts) db.telecomContracts = db.telecomContracts.filter(tc => tc.studentId !== id);
  if (db.telecomInvoices) db.telecomInvoices = db.telecomInvoices.filter(ti => ti.studentId !== id);
  if (db.officeOrders) db.officeOrders = db.officeOrders.filter(oo => oo.studentId !== id);
  if (db.jobListings) {
    db.jobListings = db.jobListings.map(j => {
      if (j.hiredByStudentId === id) {
        return { ...j, status: 'disponible', hiredByStudentId: undefined, hiredByStudentName: undefined, hiredAtDate: undefined };
      }
      return j;
    });
  }

  await deleteAccountFromSupabase(id, user.username, user.name);

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
      error: `Operación denegada: Tu cuenta tiene pagos vencidos impagados por un total de ${formatCurrency(senderStatus.totalOverdueAmount)} (incluyendo el 5% de interés de demora). Tu cuenta no puede quedar en números rojos. Las salidas manuales de dinero están bloqueadas hasta regularizar tu saldo.`
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

// Get acquisitions (filtered by studentId if query parameter provided)
app.get('/api/acquisitions', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  let acquisitions = db.acquisitions || [];
  if (studentId) {
    acquisitions = acquisitions.filter(a => a.studentId === String(studentId));
  }
  res.json({ success: true, acquisitions });
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
      error: `Operación de compra/alquiler bloqueada: Tienes vencimientos impagados pendientes por un total de ${formatCurrency(studentStatus.totalOverdueAmount)} (incluyendo el 5% de interés de demora). Tu cuenta no puede quedar en números rojos. Las salidas manuales de dinero están bloqueadas hasta regularizar tu saldo.`
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
        error: `Saldo insuficiente. Se requieren ${formatCurrency(initialPaymentTotal)} (Fianza de 2 meses: ${formatCurrency(depositAmount)} + 1er Mes con IVA: ${formatCurrency(monthlyRentTotal)})`
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
      message: `¡Contrato de alquiler formalizado con éxito! Se han deducido ${formatCurrency(initialPaymentTotal)} de fianza y primer mes de alquiler (IVA incl.).`,
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
          error: `Saldo insuficiente para la compra al contado. Se requieren ${formatCurrency(totalPrice)} (Precio Base: ${formatCurrency(basePrice)} + IVA 21%: ${formatCurrency(ivaAmount)})`
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
        message: `¡Compra al contado completada con éxito! Has adquirido la propiedad por ${formatCurrency(totalPrice)} (IVA 21% incl.).`,
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
          error: `Saldo insuficiente para la entrada inicial y liquidación de IVA. Se requieren ${formatCurrency(initialCashRequired)} (Entrada ${downPaymentPercent}%: ${formatCurrency(downPaymentBase)} + IVA Total 21%: ${formatCurrency(ivaAmount)})`
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
        message: `¡Compra aplazada formalizada! Se han abonado ${formatCurrency(initialCashRequired)} de entrada e IVA, y se han emitido ${count} ${instrumentLabel}s de ${formatNumber(installmentAmount)} €/mes.`,
        acquisition,
        updatedBalance: student.balance
      });
    }
  }

  return res.status(400).json({ error: 'Operación no válida.' });
});

// ================= MACHINERY CATALOG & ENDPOINTS =================

const MACHINERY_CATALOG: MachineryItem[] = [
  {
    id: 'mac-metal-hierro',
    category: 'metal_hierro',
    title: 'Línea de Fabricación de Metal / Hierro (Varilla y Punta)',
    description: 'Línea industrial completa para la fabricación de la varilla de acero y la punta de precisión de los destornilladores.',
    imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=1000',
    equipment: [
      'Horno de inducción',
      'Prensa de forja',
      'Torno CNC de 2 ejes',
      'Horno de temple',
      'Pulidora / Afiladora',
      'Equipo de control de calidad'
    ],
    requiredSurfaceM2: 240,
    rawMaterialWarehouseM2: 30,
    finishedProductWarehouseM2: 30,
    totalRequiredM2: 300,
    requiredStaff: 5,
    powerKw: 35,
    assemblyDays: 5,
    options: [
      {
        id: 'opt-1-lathe',
        lathesCount: 1,
        title: 'Línea Estándar (1 Torno CNC de 2 ejes)',
        productionCapacityUnitsPerHour: 60,
        basePrice: 104000
      },
      {
        id: 'opt-2-lathes',
        lathesCount: 2,
        title: 'Línea de Alta Capacidad (2 Tornos CNC de 2 ejes)',
        productionCapacityUnitsPerHour: 100,
        basePrice: 110000
      }
    ]
  },
  {
    id: 'mac-plastico-ensamblaje',
    category: 'plastico_ensamblaje',
    title: 'Línea de Inyección de Plástico y Ensamblaje Final',
    description: 'Línea automatizada para la inyección del mango plástico de polímero, marcado láser y ensamblaje final.',
    imageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1000',
    equipment: [
      'Secador de granza',
      'Refrigerador de agua (Chiller)',
      'Prensa de inyección',
      'Marcado láser de marca y referencia'
    ],
    requiredSurfaceM2: 180,
    rawMaterialWarehouseM2: 30,
    finishedProductWarehouseM2: 30,
    totalRequiredM2: 240,
    requiredStaff: 5,
    powerKw: 33,
    assemblyDays: 5,
    options: [
      {
        id: 'opt-plastic-std',
        lathesCount: 0,
        title: 'Línea Inyectora y Marcado Láser',
        productionCapacityUnitsPerHour: 120,
        basePrice: 102000
      }
    ]
  }
];

// GET machinery catalog
app.get('/api/machinery/catalog', (req, res) => {
  res.json({ success: true, catalog: MACHINERY_CATALOG });
});

// BUY machinery line
app.post('/api/machinery/buy', (req, res) => {
  const { studentId, machineryId, optionId, targetNaveId, paymentMethod } = req.body;
  const db = readDb();

  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Estudiante no encontrado' });
  }

  // Check for automatic payments and overdue debt blocking
  processStudentAutomaticPayments(db, studentId);
  const studentStatus = getStudentPaymentStatus(db, studentId);
  if (studentStatus.isBlocked) {
    return res.status(400).json({
      error: `Operación de compra de maquinaria bloqueada: Tienes vencimientos impagados pendientes por un total de ${formatCurrency(studentStatus.totalOverdueAmount)} (incluyendo el 5% de interés de demora). Tu cuenta no puede quedar en números rojos. Las salidas manuales de dinero están bloqueadas hasta regularizar tu saldo.`
    });
  }

  const machinery = MACHINERY_CATALOG.find(m => m.id === machineryId);
  if (!machinery) {
    return res.status(404).json({ error: 'Línea de maquinaria no encontrada en el catálogo' });
  }

  const option = machinery.options.find(o => o.id === optionId);
  if (!option) {
    return res.status(404).json({ error: 'Opción de configuración de maquinaria no encontrada' });
  }

  // Validation: Student MUST own or rent an Industrial Nave suitable for this machinery
  const acquisitions = db.acquisitions.filter(a => a.studentId === studentId);
  const targetAcquisition = acquisitions.find(a => a.id === targetNaveId || a.propertyId === targetNaveId);

  if (!targetAcquisition) {
    return res.status(400).json({
      error: `Para comprar esta maquinaria se requiere obligatoriamente disponer de una Nave Industrial de al menos ${machinery.totalRequiredM2} m² (superficie de producción + 2 almacenes de 30 m²). Por favor, adquiere o alquila una Nave Industrial adecuada antes de continuar.`
    });
  }

  if (targetAcquisition.propertyType !== 'nave_industrial') {
    const typeLabel = targetAcquisition.propertyType === 'local_comercial' ? 'Local Comercial' : targetAcquisition.propertyType === 'almacen' ? 'Almacén' : 'Inmueble';
    return res.status(400).json({
      error: `Requisito de Ubicación Incumplido: El inmueble seleccionado "${targetAcquisition.propertyTitle}" es un ${typeLabel}. La maquinaria industrial de fabricación SOLO puede ser instalada dentro de una NAVE INDUSTRIAL.`
    });
  }

  // Calculate existing occupied m² in this Nave Industrial by all installed machinery lines
  const existingMachinery = (db.machineryAcquisitions || []).filter(
    m => m.studentId === studentId && (
      m.installationNaveId === targetAcquisition.id || 
      m.installationNaveId === targetAcquisition.propertyId ||
      m.installedAtNaveId === targetAcquisition.id ||
      m.installedNaveId === targetAcquisition.id
    )
  );
  const occupiedSurfaceM2 = existingMachinery.reduce((sum, m) => {
    const cat = MACHINERY_CATALOG.find(c => c.id === m.machineryId);
    const reqM2 = m.totalRequiredM2 || m.requiredSurfaceM2 || (cat ? cat.totalRequiredM2 : 270);
    return sum + reqM2;
  }, 0);
  const availableSurfaceM2 = targetAcquisition.surfaceM2 - occupiedSurfaceM2;

  if (availableSurfaceM2 < machinery.totalRequiredM2) {
    return res.status(400).json({
      error: `Superficie Insuficiente en la Nave Industrial: La nave "${targetAcquisition.propertyTitle}" dispone de ${targetAcquisition.surfaceM2} m² en total. Actualmente tiene instalada(s) ${existingMachinery.length} máquina(s) ocupando un total de ${occupiedSurfaceM2} m², por lo que solo quedan libres ${availableSurfaceM2} m². La nueva línea de maquinaria "${machinery.title}" requiere de ${machinery.totalRequiredM2} m² (${machinery.requiredSurfaceM2} m² de línea + 2 almacenes de 30 m²). Por favor, adquiere o alquila una nueva Nave Industrial.`
    });
  }

  const vendorName = 'Maquinarias e Instalaciones Industriales S.A.';
  const vendorAccount = 'ES210001000299887799';
  const now = new Date();

  // Check electricity supply contract power requirements
  const elecContract = (db.electricityContracts || []).find(c => c.studentId === student.id && c.status === 'active');
  const studentMachinery = (db.machineryAcquisitions || []).filter(m => m.studentId === student.id);
  const totalMachineryPowerNeeded = studentMachinery.reduce((sum, m) => sum + (m.requiredPowerKW || m.powerKw || 35), 0) + (machinery.requiredPowerKW || 35);
  const totalPowerNeeded = totalMachineryPowerNeeded + 10; // 10 kW for basic nave lighting & HVAC

  const isPowerContracted = elecContract && elecContract.contractedPowerKw >= totalPowerNeeded;
  const initialMachineryStatus = isPowerContracted ? 'montaje' : 'pendiente_energia';

  // Calculate 5-day assembly finish date if electricity is available
  const assemblyFinishDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  if (paymentMethod === 'contado') {
    // CASH PURCHASE
    const basePrice = option.basePrice;
    const ivaAmount = Number((basePrice * 0.21).toFixed(2));
    const totalPrice = Number((basePrice + ivaAmount).toFixed(2));

    if (student.balance < totalPrice) {
      return res.status(400).json({
        error: `Saldo insuficiente para compra al contado. Se requieren ${formatCurrency(totalPrice)} (Precio Base Llave en Mano: ${formatCurrency(basePrice)} + IVA 21%: ${formatCurrency(ivaAmount)})`
      });
    }

    // Deduct total cash payment
    student.balance = Number((student.balance - totalPrice).toFixed(2));

    // Transfer record
    const newTransfer: Transfer = {
      id: generateId('tx'),
      senderId: student.id,
      senderName: student.name,
      senderAccount: student.accountNumber,
      receiverId: 'corp-maquinaria-proveedor',
      receiverName: vendorName,
      receiverAccount: vendorAccount,
      amount: totalPrice,
      concept: `Compra al contado + IVA 21% de ${machinery.title} (${option.title})`,
      timestamp: now.toISOString()
    };
    db.transfers.unshift(newTransfer);

    // Create Machinery Acquisition Record
    const machAcq: MachineryAcquisition = {
      id: generateId('mac-acq'),
      studentId: student.id,
      studentName: student.name,
      machineryId: machinery.id,
      category: machinery.category,
      lineTitle: machinery.title,
      title: machinery.title,
      optionTitle: option.title,
      lathesCount: option.lathesCount,
      productionCapacityUnitsPerHour: option.productionCapacityUnitsPerHour,
      imageUrl: machinery.imageUrl,
      basePrice,
      financedPrice: basePrice,
      deferredPrice: basePrice,
      ivaAmount,
      totalPrice,
      paymentMethod: 'contado',
      downPaymentPaid: totalPrice,
      pendingBalance: 0,
      totalRequiredM2: machinery.totalRequiredM2,
      requiredSurfaceM2: machinery.requiredSurfaceM2,
      installationNaveId: targetAcquisition.id,
      installedAtNaveId: targetAcquisition.id,
      installedNaveId: targetAcquisition.id,
      installationNaveTitle: targetAcquisition.propertyTitle,
      installedAtNaveTitle: targetAcquisition.propertyTitle,
      installedNaveTitle: targetAcquisition.propertyTitle,
      installationSurfaceM2: targetAcquisition.surfaceM2,
      purchaseDate: now.toISOString(),
      assemblyDays: 5,
      assemblyEndDate: isPowerContracted ? assemblyFinishDate.toISOString() : '',
      assemblyFinishDate: isPowerContracted ? assemblyFinishDate.toISOString() : '',
      status: initialMachineryStatus,
      requiredStaff: machinery.requiredStaff || 5,
      requiredPowerKW: machinery.requiredPowerKW || 35,
      powerKw: machinery.requiredPowerKW || 35,
      equipmentList: machinery.equipmentList || machinery.equipment || [],
      equipment: machinery.equipmentList || machinery.equipment || []
    };

    if (!db.machineryAcquisitions) db.machineryAcquisitions = [];
    db.machineryAcquisitions.unshift(machAcq);

    writeDb(db);

    // Sync to Supabase
    syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
    syncMachineryToSupabase(machAcq).catch(e => console.error(e));
    syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', totalPrice, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));

    const statusMsg = isPowerContracted
      ? `¡Adquisición de maquinaria al contado completada! Importe abonado: ${formatCurrency(totalPrice)} (IVA incl.). La maquinaria ha iniciado el periodo de montaje de 5 días en ${targetAcquisition.propertyTitle}.`
      : `¡Adquisición de maquinaria al contado completada! Importe abonado: ${formatCurrency(totalPrice)} (IVA incl.). ⚠️ ATENCIÓN: El montaje NO se ha iniciado porque no has contratado la potencia de energía eléctrica suficiente (${totalPowerNeeded} kW requeridos vs ${elecContract ? elecContract.contractedPowerKw : 0} kW contratados). La maquinaria permanecerá almacenada sin montar hasta que contrates la luz en el apartado de Energía.`;

    return res.json({
      success: true,
      message: statusMsg,
      machineryAcquisition: machAcq,
      updatedBalance: student.balance
    });
  } else if (paymentMethod === 'aplazado_pagares') {
    // DEFERRED PAYMENT (+10% surcharge, 40% down payment + 100% IVA, 60% in 24 monthly promissory notes)
    const basePriceWithSurcharge = Number((option.basePrice * 1.10).toFixed(2));
    const ivaAmount = Number((basePriceWithSurcharge * 0.21).toFixed(2));
    const totalPriceWithSurchargeAndIva = Number((basePriceWithSurcharge + ivaAmount).toFixed(2));

    const downPaymentBase = Number((basePriceWithSurcharge * 0.40).toFixed(2));
    const initialCashRequired = Number((downPaymentBase + ivaAmount).toFixed(2));
    const pendingBaseBalance = Number((basePriceWithSurcharge - downPaymentBase).toFixed(2)); // 60% of base

    if (student.balance < initialCashRequired) {
      return res.status(400).json({
        error: `Saldo insuficiente para la entrada inicial de la maquinaria. Se requieren ${formatCurrency(initialCashRequired)} (Entrada del 40%: ${formatCurrency(downPaymentBase)} + Total IVA 21%: ${formatCurrency(ivaAmount)})`
      });
    }

    const count = 24;
    const installmentAmount = Number((pendingBaseBalance / count).toFixed(2));

    // Deduct initial cash payment
    student.balance = Number((student.balance - initialCashRequired).toFixed(2));

    // Transfer record for down payment
    const newTransfer: Transfer = {
      id: generateId('tx'),
      senderId: student.id,
      senderName: student.name,
      senderAccount: student.accountNumber,
      receiverId: 'corp-maquinaria-proveedor',
      receiverName: vendorName,
      receiverAccount: vendorAccount,
      amount: initialCashRequired,
      concept: `Entrada (40%) + Total IVA 21% (+10% recargo aplazamiento) de ${machinery.title}`,
      timestamp: now.toISOString()
    };
    db.transfers.unshift(newTransfer);

    // Create Machinery Acquisition Record
    const machAcqId = generateId('mac-acq');
    const machAcq: MachineryAcquisition = {
      id: machAcqId,
      studentId: student.id,
      studentName: student.name,
      machineryId: machinery.id,
      category: machinery.category,
      lineTitle: machinery.title,
      title: machinery.title,
      optionTitle: option.title,
      lathesCount: option.lathesCount,
      productionCapacityUnitsPerHour: option.productionCapacityUnitsPerHour,
      imageUrl: machinery.imageUrl,
      basePrice: basePriceWithSurcharge,
      financedPrice: basePriceWithSurcharge,
      deferredPrice: basePriceWithSurcharge,
      ivaAmount,
      totalPrice: totalPriceWithSurchargeAndIva,
      paymentMethod: 'aplazado_pagares',
      downPaymentPaid: initialCashRequired,
      pendingBalance: pendingBaseBalance,
      installmentsCount: count,
      installmentCount: count,
      installmentMonthlyAmount: installmentAmount,
      totalRequiredM2: machinery.totalRequiredM2,
      requiredSurfaceM2: machinery.requiredSurfaceM2,
      installationNaveId: targetAcquisition.id,
      installedAtNaveId: targetAcquisition.id,
      installedNaveId: targetAcquisition.id,
      installationNaveTitle: targetAcquisition.propertyTitle,
      installedAtNaveTitle: targetAcquisition.propertyTitle,
      installedNaveTitle: targetAcquisition.propertyTitle,
      installationSurfaceM2: targetAcquisition.surfaceM2,
      purchaseDate: now.toISOString(),
      assemblyDays: 5,
      assemblyEndDate: isPowerContracted ? assemblyFinishDate.toISOString() : '',
      assemblyFinishDate: isPowerContracted ? assemblyFinishDate.toISOString() : '',
      status: initialMachineryStatus,
      requiredStaff: machinery.requiredStaff || 5,
      requiredPowerKW: machinery.requiredPowerKW || 35,
      powerKw: machinery.requiredPowerKW || 35,
      equipmentList: machinery.equipmentList || machinery.equipment || [],
      equipment: machinery.equipmentList || machinery.equipment || []
    };

    if (!db.machineryAcquisitions) db.machineryAcquisitions = [];
    db.machineryAcquisitions.unshift(machAcq);

    // Generate 24 promissory notes payment obligations
    const generatedObligations: PaymentObligation[] = [];
    for (let i = 1; i <= count; i++) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (i * 30));

      const ob: PaymentObligation = {
        id: generateId('obl'),
        acquisitionId: machAcqId,
        studentId: student.id,
        studentName: student.name,
        propertyTitle: `${machinery.title} (${option.title})`,
        type: 'pagare',
        amount: installmentAmount,
        dueDate: dueDate.toISOString(),
        status: 'pendiente',
        installmentNumber: i,
        totalInstallments: count
      };
      db.paymentObligations.push(ob);
      generatedObligations.push(ob);
    }

    writeDb(db);

    // Sync to Supabase
    syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
    syncMachineryToSupabase(machAcq).catch(e => console.error(e));
    syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', initialCashRequired, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));
    for (const ob of generatedObligations) {
      syncObligationToSupabase(ob).catch(e => console.error(e));
    }

    const defStatusMsg = isPowerContracted
      ? `¡Compra aplazada de maquinaria formalizada! Se han abonado ${formatCurrency(initialCashRequired)} de entrada e IVA, y se han emitido 24 pagarés mensuales de ${formatNumber(installmentAmount)} €/mes. El montaje de 5 días ha comenzado en ${targetAcquisition.propertyTitle}.`
      : `¡Compra aplazada de maquinaria formalizada! Se han abonado ${formatCurrency(initialCashRequired)} de entrada e IVA, y emitido 24 pagarés mensuales. ⚠️ ATENCIÓN: El montaje NO se ha iniciado por falta de potencia/luz contratada (${totalPowerNeeded} kW requeridos). Contrata la potencia necesaria en Energía para iniciar el montaje.`;

    return res.json({
      success: true,
      message: defStatusMsg,
      machineryAcquisition: machAcq,
      updatedBalance: student.balance
    });
  }

  return res.status(400).json({ error: 'Forma de pago no válida.' });
});

// Get Company Financial & Property Assets (Mi Empresa Dashboard)
app.get('/api/company/:studentId', (req, res) => {
  let studentId = req.params.studentId;
  if (studentId === 'dashboard' && req.query.studentId) {
    studentId = String(req.query.studentId);
  }
  const db = readDb();

  const user = db.users.find(u => u.id === studentId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario / Empresa no encontrada' });
  }

  const acquisitions = db.acquisitions.filter(a => a.studentId === studentId);
  const obligations = db.paymentObligations
    .filter(o => o.studentId === studentId)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const loans = (db.loans || []).filter(l => l.studentId === studentId && l.status === 'active');
  const machineryAcquisitions = (db.machineryAcquisitions || []).filter(m => m.studentId === studentId);

  // Update machinery status if assembly finished
  let statusChanged = false;
  const now = new Date();
  for (const m of machineryAcquisitions) {
    if (m.status === 'montaje') {
      const finishDate = new Date(m.assemblyFinishDate);
      if (now >= finishDate) {
        m.status = 'operativa';
        statusChanged = true;
        syncMachineryToSupabase(m).catch(e => console.error(e));
      }
    }
  }
  if (statusChanged) {
    writeDb(db);
  }

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

  let totalMachineryAssetsValue = 0;
  for (const m of machineryAcquisitions) {
    totalMachineryAssetsValue += m.basePrice;
  }

  const annualBuildingDepreciation = Number((totalBuildingValue * 0.02).toFixed(2)); // 2% amortización contable oficial de construcción en España

  // 1. Payment Obligations (Pagarés, letras de cambio y cuotas de compra aplazada)
  // Las cuotas de alquiler de meses posteriores son compromisos de gasto corriente, no deudas financieras acumulativas.
  const pendingDebtObligations = obligations.filter(o => o.status === 'pendiente' && o.type !== 'cuota_alquiler');
  const totalObligationsPendingAmount = Number(pendingDebtObligations.reduce((acc, o) => acc + o.amount, 0).toFixed(2));

  // 2. Bank Loans (Préstamos hipotecarios activos)
  let totalLoansPendingAmount = 0;
  let totalLoansPendingPrincipal = 0;

  for (const loan of loans) {
    const unpaidRows = (loan.schedule || []).filter(r => !r.paid);
    const pendingPaymentsSum = unpaidRows.reduce((acc, r) => acc + r.payment, 0);
    const pendingPrincipalSum = unpaidRows.reduce((acc, r) => acc + r.principal, 0);
    totalLoansPendingAmount += pendingPaymentsSum;
    totalLoansPendingPrincipal += pendingPrincipalSum;
  }

  totalLoansPendingAmount = Number(totalLoansPendingAmount.toFixed(2));
  totalLoansPendingPrincipal = Number(totalLoansPendingPrincipal.toFixed(2));

  // 3. Total Combined Pending Debt (including pending tax/SS obligations)
  const studentHiredEmployees = (db.hiredEmployees || []).filter(e => e.studentId === studentId);
  const studentPayrollRecords = (db.payrollRecords || []).filter(p => p.studentId === studentId);
  const studentTaxObligations = (db.taxObligations || []).filter(t => t.studentId === studentId);

  const totalPendingTaxAmount = Number(studentTaxObligations.filter(t => t.status === 'pendiente').reduce((acc, t) => acc + t.amount, 0).toFixed(2));
  const totalPendingObligations = Number((totalObligationsPendingAmount + totalLoansPendingAmount + totalPendingTaxAmount).toFixed(2));

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
      totalMachineryAssetsValue: Number(totalMachineryAssetsValue.toFixed(2)),
      annualBuildingDepreciation,
      totalObligationsPendingAmount,
      totalLoansPendingAmount,
      totalLoansPendingPrincipal,
      totalPendingTaxAmount,
      totalPendingObligations,
      totalMonthlyRentCommitments,
      activeLoansCount: loans.length,
      machineryCount: machineryAcquisitions.length,
      hiredEmployeesCount: studentHiredEmployees.length,
      purchasedVehiclesCount: (db.purchasedVehicles || []).filter(v => v.studentId === studentId).length
    },
    acquisitions,
    obligations,
    loans,
    machineryAcquisitions,
    hiredEmployees: studentHiredEmployees,
    purchasedVehicles: (db.purchasedVehicles || []).filter(v => v.studentId === studentId),
    payrollRecords: studentPayrollRecords,
    taxObligations: studentTaxObligations
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

  const isDueDateReached = new Date(obligation.dueDate) <= new Date();
  if (!isDueDateReached && obligation.status !== 'vencido') {
    return res.status(400).json({ error: 'No está permitido abonar pagos aplazados antes de su fecha de vencimiento.' });
  }

  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Estudiante no encontrado' });
  }

  if (student.balance < obligation.amount) {
    return res.status(400).json({
      error: `Saldo insuficiente para atender el vencimiento. Saldo actual: ${formatCurrency(student.balance)}, Vencimiento: ${formatCurrency(obligation.amount)}`
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

  const machAcq = (db.machineryAcquisitions || []).find(m => m.id === obligation.acquisitionId);
  if (machAcq && machAcq.pendingBalance && machAcq.pendingBalance > 0) {
    machAcq.pendingBalance = Math.max(0, Number((machAcq.pendingBalance - obligation.amount).toFixed(2)));
  }

  writeDb(db);

  // Sync to Supabase
  syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
  syncObligationToSupabase(obligation).catch(e => console.error(e));
  syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', obligation.amount, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));
  if (acq) {
    syncAcquisitionToSupabase(acq).catch(e => console.error(e));
  }
  if (machAcq) {
    syncMachineryToSupabase(machAcq).catch(e => console.error(e));
  }

  res.json({
    success: true,
    message: `¡Atención al vencimiento completada con éxito! Se han abonado ${formatCurrency(obligation.amount)} correspondiente al ${instrumentName}.`,
    updatedBalance: student.balance,
    paidObligation: obligation
  });
});

// Pay due tax obligation (IRPF or Social Security)
app.post('/api/taxes/pay', (req, res) => {
  const { taxId, studentId } = req.body;
  const db = readDb();

  if (!db.taxObligations) db.taxObligations = [];
  const tax = db.taxObligations.find(t => t.id === taxId && t.studentId === studentId);
  if (!tax) {
    return res.status(404).json({ error: 'Obligación fiscal no encontrada' });
  }

  if (tax.status === 'pagado') {
    return res.status(400).json({ error: 'Esta obligación fiscal ya ha sido liquidada' });
  }

  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Estudiante no encontrado' });
  }

  if (student.balance < tax.amount) {
    return res.status(400).json({
      error: `Saldo insuficiente para liquidar este impuesto. Saldo actual: ${formatCurrency(student.balance)}, Importe a ingresar: ${formatCurrency(tax.amount)}`
    });
  }

  // Deduct from bank balance
  student.balance = Number((student.balance - tax.amount).toFixed(2));

  const receiverName = tax.type === 'irpf' 
    ? 'Agencia Tributaria - Hacienda (AEAT)' 
    : 'Tesorería General de la Seguridad Social (TGSS)';
  const receiverAccount = tax.type === 'irpf' 
    ? 'ES00 0000 AEAT 0000 0000 0000' 
    : 'ES00 0000 TGSS 0000 0000 0000';

  // Create Transfer record
  const newTransfer: Transfer = {
    id: generateId('tx'),
    senderId: student.id,
    senderName: student.name,
    senderAccount: student.accountNumber,
    receiverId: 'organismo-oficial',
    receiverName,
    receiverAccount,
    amount: tax.amount,
    concept: `Liquidación Tributaria / SS: ${tax.concept}`,
    timestamp: new Date().toISOString()
  };
  db.transfers.unshift(newTransfer);

  // Mark tax obligation as paid
  tax.status = 'pagado';
  tax.paidDate = new Date().toISOString();

  writeDb(db);

  // Sync to Supabase
  syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
  syncTaxObligationToSupabase(tax).catch(e => console.error(e));
  syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', tax.amount, newTransfer.timestamp, newTransfer.concept).catch(e => console.error(e));

  return res.json({
    success: true,
    message: `¡Liquidación tributaria completada con éxito! Se han abonado ${formatCurrency(tax.amount)} a ${receiverName}.`,
    tax,
    updatedBalance: student.balance
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
            let concept = `Atención a vencimiento de ${instrumentName}: ${ob.propertyTitle}`;
            if (ob.type === 'alquiler' || ob.type === 'cuota_alquiler') {
              concept = `Cuota de alquiler n.º ${ob.installmentNumber || 1} de ${ob.propertyTitle}`;
            } else if (ob.type === 'compra' || ob.type === 'compra_inmueble') {
              concept = `Pago aplazado de compra de ${ob.propertyTitle} (Cuota ${ob.installmentNumber || 1}/${ob.totalInstallments || 12})`;
            } else if (ob.type === 'maquinaria' || (ob.propertyTitle && (ob.propertyTitle.toLowerCase().includes('línea') || ob.propertyTitle.toLowerCase().includes('maquina') || ob.propertyTitle.toLowerCase().includes('máquina')))) {
              concept = `Pago aplazado de la máquina ${ob.propertyTitle} (Cuota ${ob.installmentNumber || 1}/${ob.totalInstallments || 24})`;
            }

            pendingItems.push({
              id: ob.id,
              sourceType: 'obligation',
              dueDate: dDate,
              principal,
              penaltyInterest: penalty,
              totalRequired,
              concept,
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
                const periodNum = row.period || (row as any).installmentNumber || 1;

                pendingItems.push({
                  id: `${loan.id}-row-${periodNum}`,
                  sourceType: 'loan',
                  dueDate: dDate,
                  principal,
                  penaltyInterest: penalty,
                  totalRequired,
                  concept: `Cuota ${periodNum}/${loan.termMonths} de préstamo hipotecario (${loan.collateral?.propertyTitle || 'Garantía inmobiliaria'})`,
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

          const machAcq = (db.machineryAcquisitions || []).find(m => m.id === ob.acquisitionId);
          if (machAcq && machAcq.pendingBalance && machAcq.pendingBalance > 0) {
            machAcq.pendingBalance = Math.max(0, Number((machAcq.pendingBalance - ob.amount).toFixed(2)));
            syncMachineryToSupabase(machAcq).catch(e => console.error(e));
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
  const thirtyFiveDaysLater = new Date(now.getTime() + 35 * 86400 * 1000);

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
        } else if (dDate <= thirtyFiveDaysLater) {
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
            } else if (dDate <= thirtyFiveDaysLater) {
              upcoming30DaysItems.push(item);
            }
          }
        }
      }
    }
  }

  // 3. Tax Obligations (IRPF & Seguridad Social)
  if (db.taxObligations) {
    for (const tax of db.taxObligations) {
      if (tax.studentId === studentId && tax.status !== 'pagado') {
        const dDate = new Date(tax.dueDate);
        const principal = tax.amount;
        const penalty = dDate <= now ? Number((principal * 0.05).toFixed(2)) : 0;
        const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

        const isIRPF = tax.type === 'irpf';
        const title = isIRPF ? 'AEAT - Hacienda (Retención IRPF)' : 'TGSS - Seguridad Social';

        const item: UpcomingPaymentItem = {
          id: tax.id,
          sourceType: 'tax',
          type: isIRPF ? 'impuesto_irpf' : 'impuesto_ss',
          title,
          concept: tax.concept,
          dueDate: tax.dueDate,
          principalAmount: principal,
          penaltyInterest: penalty,
          totalAmount: Number((principal + penalty).toFixed(2)),
          isOverdue: dDate <= now,
          daysRemaining: daysRem,
          installmentInfo: 'Liquidación Tributaria / SS'
        };

        if (dDate <= now) {
          overdueItems.push(item);
        } else if (dDate <= thirtyFiveDaysLater) {
          upcoming30DaysItems.push(item);
        }
      }
    }
  }

  // 4. Upcoming Payroll & Derived Tax Obligations (Nóminas el día 1 del mes siguiente y tributos el 20 TGSS / 15 AEAT)
  const studentEmps = (db.hiredEmployees || []).filter(e => e.studentId === studentId);
  if (studentEmps.length > 0) {
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-indexed

    // Check current month and next 2 months
    for (let mOffset = 0; mOffset <= 2; mOffset++) {
      const refDate = new Date(curYear, curMonth + mOffset, 1, 9, 0, 0);
      const targetYear = refDate.getFullYear();
      const targetMonth = refDate.getMonth() + 1; // 1-indexed

      // Net payroll due date is 1st of following month
      const netPayDate = new Date(targetYear, targetMonth, 1, 9, 0, 0);

      let monthGross = 0;
      let empIdx = 0;

      for (const emp of studentEmps) {
        empIdx++;
        let empGross = 0;

        if (!emp.hireDate) {
          empGross = emp.grossSalaryMonthly;
        } else {
          const parts = emp.hireDate.split('T')[0].split('-');
          const hireYear = parseInt(parts[0], 10);
          const hireMonth = parseInt(parts[1], 10);
          const hireDay = parseInt(parts[2], 10);

          if (targetYear < hireYear || (targetYear === hireYear && targetMonth < hireMonth)) {
            continue; // Not hired yet
          }
          if (hireYear === targetYear && hireMonth === targetMonth) {
            const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
            const daysWorked = Math.max(1, daysInMonth - hireDay + 1);
            empGross = (emp.grossSalaryMonthly / daysInMonth) * daysWorked;
          } else {
            empGross = emp.grossSalaryMonthly;
          }
        }

        monthGross += empGross;

        const eIRPF = Math.round(empGross * 0.17 * 100) / 100;
        const eSSEmp = Math.round(empGross * 0.0648 * 100) / 100;
        const eNet = Math.round((empGross - eIRPF - eSSEmp) * 100) / 100;

        // 4a. Individual Net Payroll payment per employee on Day 1 of following month
        if (netPayDate >= now && netPayDate <= thirtyFiveDaysLater && eNet > 0) {
          const daysRem = Math.ceil((netPayDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
          upcoming30DaysItems.push({
            id: `payroll-${studentId}-${emp.id || empIdx}-${targetYear}-${targetMonth}`,
            sourceType: 'payroll',
            type: 'cuota_nomina',
            title: `Nómina neta (${emp.employeeName || (emp as any).name || 'Empleado'})`,
            concept: `Nómina neta - ${emp.employeeName || (emp as any).name || 'Empleado'} (Mes ${targetMonth}/${targetYear})`,
            dueDate: netPayDate.toISOString(),
            principalAmount: eNet,
            penaltyInterest: 0,
            totalAmount: eNet,
            isOverdue: false,
            daysRemaining: daysRem,
            installmentInfo: `Día 1 del mes siguiente`
          });
        }
      }

      monthGross = Math.round(monthGross * 100) / 100;
      if (monthGross <= 0) continue;

      const totalEmployeeIRPF = Math.round(monthGross * 0.17 * 100) / 100;
      const totalEmployeeSS = Math.round(monthGross * 0.0648 * 100) / 100;
      const totalCompanySS = Math.round(monthGross * 0.75 * 100) / 100;

      // 4b. TGSS SS Tax Obligations due on 20th of following month - SEPARATED (Employee 6.48% & Company 75%)
      const ssDueDate = new Date(targetYear, targetMonth, 20, 9, 0, 0); // 20th of month after targetMonth
      if (ssDueDate >= now && ssDueDate <= thirtyFiveDaysLater) {
        const daysRem = Math.ceil((ssDueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        const followingMonthNum = ssDueDate.getMonth() + 1;
        const followingYearNum = ssDueDate.getFullYear();

        const hasSsEmpInDb = (db.taxObligations || []).some(t => 
          t.studentId === studentId && 
          ((t.type as string) === 'ss_employee' || (t.type as string) === 'ss') && 
          new Date(t.dueDate).getFullYear() === followingYearNum && 
          new Date(t.dueDate).getMonth() === ssDueDate.getMonth()
        );

        if (!hasSsEmpInDb && totalEmployeeSS > 0) {
          upcoming30DaysItems.push({
            id: `payroll-ss-emp-${studentId}-${targetYear}-${targetMonth}`,
            sourceType: 'tax',
            type: 'impuesto_ss_emp',
            title: `TGSS - Seg. Social Empleado (6,48%)`,
            concept: `Cuotas Seguridad Social Trabajador (6,48%) Mes ${targetMonth}/${targetYear}`,
            dueDate: ssDueDate.toISOString(),
            principalAmount: totalEmployeeSS,
            penaltyInterest: 0,
            totalAmount: totalEmployeeSS,
            isOverdue: false,
            daysRemaining: daysRem,
            installmentInfo: `Día 20 del mes siguiente`
          });
        }

        const hasSsCompInDb = (db.taxObligations || []).some(t => 
          t.studentId === studentId && 
          (t.type as string) === 'ss_company' && 
          new Date(t.dueDate).getFullYear() === followingYearNum && 
          new Date(t.dueDate).getMonth() === ssDueDate.getMonth()
        );

        if (!hasSsCompInDb && totalCompanySS > 0) {
          upcoming30DaysItems.push({
            id: `payroll-ss-comp-${studentId}-${targetYear}-${targetMonth}`,
            sourceType: 'tax',
            type: 'impuesto_ss_comp',
            title: `TGSS - Seg. Social Empresa (75%)`,
            concept: `Aportación patronal Seguridad Social (75%) Mes ${targetMonth}/${targetYear}`,
            dueDate: ssDueDate.toISOString(),
            principalAmount: totalCompanySS,
            penaltyInterest: 0,
            totalAmount: totalCompanySS,
            isOverdue: false,
            daysRemaining: daysRem,
            installmentInfo: `Día 20 del mes siguiente`
          });
        }
      }

      // 4c. Quarterly AEAT IRPF Tax Obligation due on 15th of first month of following quarter
      let irpfDueDate: Date;
      let qNum = 1;
      if (targetMonth >= 10) {
        qNum = 4;
        irpfDueDate = new Date(targetYear + 1, 0, 15, 9, 0, 0); // Jan 15 next year
      } else if (targetMonth >= 7) {
        qNum = 3;
        irpfDueDate = new Date(targetYear, 9, 15, 9, 0, 0); // Oct 15
      } else if (targetMonth >= 4) {
        qNum = 2;
        irpfDueDate = new Date(targetYear, 6, 15, 9, 0, 0); // Jul 15
      } else {
        qNum = 1;
        irpfDueDate = new Date(targetYear, 3, 15, 9, 0, 0); // Apr 15
      }

      if (irpfDueDate >= now && irpfDueDate <= thirtyFiveDaysLater) {
        const daysRem = Math.ceil((irpfDueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        const dueYearNum = irpfDueDate.getFullYear();
        const dueMonthNum = irpfDueDate.getMonth();

        const hasIrpfInDb = (db.taxObligations || []).some(t => 
          t.studentId === studentId && 
          t.type === 'irpf' && 
          new Date(t.dueDate).getFullYear() === dueYearNum && 
          new Date(t.dueDate).getMonth() === dueMonthNum
        );

        const qGross = calcGrossForStudentMonth(studentId, (qNum - 1) * 3 + 1, targetYear, db) +
                       calcGrossForStudentMonth(studentId, (qNum - 1) * 3 + 2, targetYear, db) +
                       calcGrossForStudentMonth(studentId, (qNum - 1) * 3 + 3, targetYear, db);
        const fullQuarterIRPF = Math.round(qGross * 0.17 * 100) / 100;

        if (!hasIrpfInDb && fullQuarterIRPF > 0) {
          // Avoid duplicate entry if loop processes multiple months of same quarter
          const existingIrpfIndex = upcoming30DaysItems.findIndex(item => item.id.startsWith(`payroll-irpf-${studentId}-q${qNum}-${targetYear}`));
          if (existingIrpfIndex >= 0) {
            upcoming30DaysItems[existingIrpfIndex].principalAmount = fullQuarterIRPF;
            upcoming30DaysItems[existingIrpfIndex].totalAmount = fullQuarterIRPF;
          } else {
            upcoming30DaysItems.push({
              id: `payroll-irpf-${studentId}-q${qNum}-${targetYear}`,
              sourceType: 'tax',
              type: 'impuesto_irpf',
              title: `AEAT - Hacienda (Retención IRPF Q${qNum})`,
              concept: `Retenciones IRPF de nóminas (17%) Trimestre Q${qNum} ${targetYear}`,
              dueDate: irpfDueDate.toISOString(),
              principalAmount: fullQuarterIRPF,
              penaltyInterest: 0,
              totalAmount: fullQuarterIRPF,
              isOverdue: false,
              daysRemaining: daysRem,
              installmentInfo: `Día 15 del mes siguiente al trimestre Q${qNum}`
            });
          }
        }
      }
    }
  }

  // 5. Active Telecom Contracts (Adeudo directo el día 1 del mes siguiente)
  if (db.telecomContracts) {
    const activeContracts = db.telecomContracts.filter(c => c.studentId === studentId && c.status === 'active');
    for (const contract of activeContracts) {
      const cDate = new Date(contract.contractDate);
      const startYear = cDate.getFullYear();
      const startMonth = cDate.getMonth() + 1; // 1-indexed

      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1; // 1-indexed

      // Check current month and next month
      for (let mOffset = 0; mOffset <= 1; mOffset++) {
        const targetRef = new Date(curYear, (curMonth - 1) + mOffset, 1);
        const targetYear = targetRef.getFullYear();
        const targetMonth = targetRef.getMonth() + 1;

        if (targetYear < startYear || (targetYear === startYear && targetMonth < startMonth)) {
          continue; // Contract not started yet in targetMonth/targetYear
        }

        const hasInvoice = (db.telecomInvoices || []).some(
          inv => inv.contractId === contract.id && inv.periodMonth === targetMonth && inv.periodYear === targetYear
        );

        if (!hasInvoice) {
          const dueDate = new Date(targetYear, targetMonth, 1, 9, 0, 0); // 1st of month following targetMonth
          if (dueDate >= now && dueDate <= thirtyFiveDaysLater) {
            const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
            let baseAmount = contract.monthlyPrice;
            let isProrated = false;
            let activeDays = daysInMonth;

            if (targetYear === startYear && targetMonth === startMonth) {
              const startDay = cDate.getDate();
              activeDays = Math.max(1, daysInMonth - startDay + 1);
              baseAmount = Math.round((contract.monthlyPrice * (activeDays / daysInMonth)) * 100) / 100;
              isProrated = true;
            }

            const ivaAmount = Math.round((baseAmount * 0.21) * 100) / 100;
            const totalAmount = Math.round((baseAmount + ivaAmount) * 100) / 100;
            const daysRem = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

            upcoming30DaysItems.push({
              id: `telecom-${contract.id}-${targetYear}-${targetMonth}`,
              sourceType: 'telecom' as any,
              type: 'cuota_telecom' as any,
              title: `Fibra y Teléfono (${contract.planName})`,
              concept: isProrated 
                ? `Cuota proporcional de telecomunicaciones (${activeDays}/${daysInMonth} días) - ${contract.planName}`
                : `Cuota mensual de telecomunicaciones - ${contract.planName} (Mes ${targetMonth}/${targetYear})`,
              dueDate: dueDate.toISOString(),
              principalAmount: totalAmount,
              penaltyInterest: 0,
              totalAmount: totalAmount,
              isOverdue: false,
              daysRemaining: daysRem,
              installmentInfo: 'Día 1 del mes siguiente'
            });
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
      responseMessage = `El banco ha concedido automáticamente una oferta por ${formatCurrency(offeredAmount)} (máximo 80% del valor de tasación de la garantía de ${formatCurrency(apprVal)}). Por favor, revisa las condiciones y acepta la oferta para ingresar el importe.`;
    } else {
      responseMessage = `¡Tu solicitud de préstamo por ${formatCurrency(offeredAmount)} ha sido pre-aprobada automáticamente al 80% LTV! Revisa las condiciones y la tabla de amortización para formalizarlo.`;
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
      error: `Saldo insuficiente para abonar la comisión de apertura del 1 por mil (${formatCurrency(loan.openingFee)}). Saldo disponible actual: ${formatCurrency(student.balance)}.`
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
    message: `¡Préstamo de ${formatCurrency(loan.offeredAmount)} formalizado! Se ha ingresado el principal en tu cuenta y cobrado ${formatCurrency(loan.openingFee)} de comisión de apertura (1‰).`,
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

// ================= STUDENT CHANGE PASSWORD =================
app.put('/api/student/change-password', (req, res) => {
  const { studentId, currentPassword, newPassword } = req.body;
  if (!studentId || !newPassword) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  const db = readDb();
  const user = db.users.find(u => u.id === studentId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (currentPassword && user.password && currentPassword.trim() !== user.password) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }

  user.password = newPassword.trim();
  syncAccountToSupabase(user.id, user.name, user.balance, user.username, user.password, user.accountNumber, user.role).catch(e => console.error(e));

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'CHANGE_PASSWORD',
    details: `El usuario ${user.name} (${user.username}) ha cambiado su contraseña`,
    timestamp: new Date().toISOString(),
    studentId: user.id,
    studentName: user.name
  });

  writeDb(db);
  res.json({ success: true, message: 'Contraseña actualizada correctamente' });
});

// ================= JOB FORUM (FORO DE EMPLEO) ENDPOINTS =================
app.get('/api/job-listings', (req, res) => {
  const db = readDb();
  res.json({ success: true, jobListings: db.jobListings || [] });
});

app.post('/api/teacher/job-listings/batch', (req, res) => {
  const { count, gender, minSalary, maxSalary, minAge, maxAge, role } = req.body;

  const numCount = Math.max(1, Math.min(Number(count) || 5, 50));
  const numMinSalary = Math.max(800, Number(minSalary) || 1200);
  const numMaxSalary = Math.max(numMinSalary, Number(maxSalary) || 2500);
  const numMinAge = Math.max(18, Number(minAge) || 20);
  const numMaxAge = Math.max(numMinAge, Number(maxAge) || 60);

  const maleNames = ['Carlos', 'Javier', 'Alejandro', 'Manuel', 'David', 'Pablo', 'Álvaro', 'Diego', 'Gonzalo', 'Sergio', 'Fernando', 'Marcos', 'Hugo', 'Daniel', 'Adrián', 'Lucas', 'Mateo', 'Rubén', 'Jorge', 'Iván'];
  const femaleNames = ['Ana', 'María', 'Carmen', 'Laura', 'Marta', 'Paula', 'Lucía', 'Sofía', 'Elena', 'Alba', 'Isabel', 'Cristina', 'Beatriz', 'Patricia', 'Andrea', 'Sara', 'Nuria', 'Rocío', 'Silvia', 'Sonia'];
  const surnames = ['García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez'];

  const maleAvatar = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop';
  const femaleAvatar = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop';

  const db = readDb();
  if (!db.jobListings) db.jobListings = [];

  const createdJobs: JobListing[] = [];

  for (let i = 0; i < numCount; i++) {
    let chosenGender: 'hombre' | 'mujer' = 'hombre';
    if (gender === 'hombre') {
      chosenGender = 'hombre';
    } else if (gender === 'mujer') {
      chosenGender = 'mujer';
    } else {
      chosenGender = Math.random() > 0.5 ? 'hombre' : 'mujer';
    }

    const first = chosenGender === 'hombre'
      ? maleNames[Math.floor(Math.random() * maleNames.length)]
      : femaleNames[Math.floor(Math.random() * femaleNames.length)];
    const sur1 = surnames[Math.floor(Math.random() * surnames.length)];
    const sur2 = surnames[Math.floor(Math.random() * surnames.length)];
    const fullName = `${first} ${sur1} ${sur2}`;

    const salary = Math.floor(Math.random() * (numMaxSalary - numMinSalary + 1)) + numMinSalary;
    const age = Math.floor(Math.random() * (numMaxAge - numMinAge + 1)) + numMinAge;

    let chosenRole: 'operario' | 'camionero' | 'carretillero' = 'operario';
    if (role === 'camionero' || role === 'carretillero' || role === 'operario') {
      chosenRole = role;
    } else {
      const rand = Math.random();
      if (rand < 0.6) chosenRole = 'operario';
      else if (rand < 0.8) chosenRole = 'camionero';
      else chosenRole = 'carretillero';
    }

    let jobTitle = 'Operario Industrial';
    if (chosenRole === 'camionero') jobTitle = 'Camionero / Conductor Logístico';
    if (chosenRole === 'carretillero') jobTitle = 'Carretillero / Operador de Almacén';

    const newJob: JobListing = {
      id: generateId('job'),
      title: jobTitle,
      role: chosenRole,
      employeeName: fullName,
      gender: chosenGender,
      grossSalaryMonthly: salary,
      age: age,
      status: 'disponible',
      avatarUrl: chosenGender === 'hombre' ? maleAvatar : femaleAvatar,
      createdAt: new Date().toISOString()
    };

    db.jobListings.unshift(newJob);
    createdJobs.push(newJob);
    syncJobListingToSupabase(newJob).catch(e => console.error(e));
  }

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'CREATE_JOB_LISTINGS_BATCH',
    details: `Publicadas ${createdJobs.length} ofertas de empleo en Foro de Empleo (Sueldos: ${numMinSalary}-${numMaxSalary}€, Edades: ${numMinAge}-${numMaxAge})`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ success: true, count: createdJobs.length, createdJobs });
});

app.delete('/api/teacher/job-listings/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.jobListings = (db.jobListings || []).filter(j => j.id !== id);
  if (dbPool) {
    dbPool.query('DELETE FROM ofertas_empleo WHERE id = $1', [id]).catch(e => console.error(e));
  }
  writeDb(db);
  res.json({ success: true, message: 'Oferta de empleo eliminada' });
});

app.delete('/api/teacher/job-listings', (req, res) => {
  const db = readDb();
  db.jobListings = (db.jobListings || []).filter(j => j.status === 'contratado');
  if (dbPool) {
    dbPool.query("DELETE FROM ofertas_empleo WHERE estado = 'disponible'").catch(e => console.error(e));
  }
  writeDb(db);
  res.json({ success: true, message: 'Todas las ofertas disponibles han sido eliminadas' });
});

app.post('/api/jobs/:id/hire', (req, res) => {
  const { id } = req.params;
  const { studentId } = req.body;

  const db = readDb();
  if (!db.jobListings) db.jobListings = [];
  if (!db.hiredEmployees) db.hiredEmployees = [];

  const job = db.jobListings.find(j => j.id === id);
  if (!job) return res.status(404).json({ error: 'Oferta de empleo no encontrada' });
  if (job.status !== 'disponible') return res.status(400).json({ error: 'Esta oferta de empleo ya ha sido contratada' });

  const student = db.users.find(u => u.id === studentId && u.role === 'student');
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  const now = new Date().toISOString();

  job.status = 'contratado';
  job.hiredByStudentId = student.id;
  job.hiredByStudentName = student.name;
  job.hiredAtDate = now;

  const newHired: HiredEmployee = {
    id: generateId('emp'),
    jobListingId: job.id,
    studentId: student.id,
    studentName: student.name,
    employeeName: job.employeeName,
    role: job.role || 'operario',
    gender: job.gender,
    grossSalaryMonthly: job.grossSalaryMonthly,
    age: job.age,
    hireDate: now,
    avatarUrl: job.avatarUrl
  };

  db.hiredEmployees.push(newHired);

  syncJobListingToSupabase(job).catch(e => console.error(e));
  syncHiredEmployeeToSupabase(newHired).catch(e => console.error(e));

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'HIRE_EMPLOYEE',
    details: `El alumno ${student.name} ha contratado a ${job.employeeName} (Sueldo Bruto: ${job.grossSalaryMonthly}€/mes, Edad: ${job.age})`,
    timestamp: now,
    studentId: student.id,
    studentName: student.name
  });

  writeDb(db);
  res.json({ success: true, employee: newHired, job });
});

app.get('/api/student/employees', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const list = (db.hiredEmployees || []).filter(e => e.studentId === studentId);
  res.json({ success: true, employees: list });
});

app.put('/api/student/employees/:id/assign-machinery', (req, res) => {
  const { id } = req.params;
  const { machineryId, shift } = req.body;

  const db = readDb();
  if (!db.hiredEmployees) db.hiredEmployees = [];

  const emp = db.hiredEmployees.find(e => e.id === id);
  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

  if (machineryId) {
    const mac = (db.machineryAcquisitions || []).find(m => m.id === machineryId || m.machineryId === machineryId);
    emp.assignedMachineryId = mac ? mac.id : machineryId;
    emp.assignedMachineryTitle = mac ? (mac.title || mac.lineTitle) : undefined;
  } else {
    emp.assignedMachineryId = undefined;
    emp.assignedMachineryTitle = undefined;
  }

  if (shift !== undefined) {
    emp.shift = Number(shift) || 1;
  }

  syncHiredEmployeeToSupabase(emp).catch(e => console.error(e));
  writeDb(db);
  res.json({ success: true, employee: emp });
});

// ================= TEACHER ASSET ADMINISTRATION & DELETES =================
app.delete('/api/obligations/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const ob = db.paymentObligations.find(o => o.id === id);
  if (!ob) return res.status(404).json({ error: 'Obligación no encontrada' });

  db.paymentObligations = db.paymentObligations.filter(o => o.id !== id);
  if (dbPool) {
    dbPool.query('DELETE FROM obligaciones_pago WHERE id = $1', [id]).catch(e => console.error(e));
  }

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'DELETE_OBLIGATION',
    details: `Profesor ha eliminado la deuda / obligación ${ob.id} de ${ob.studentName}`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ success: true, message: 'Deuda eliminada' });
});

app.delete('/api/acquisitions/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const acq = db.acquisitions.find(a => a.id === id);
  if (!acq) return res.status(404).json({ error: 'Inmueble no encontrado' });

  db.acquisitions = db.acquisitions.filter(a => a.id !== id);
  if (dbPool) {
    dbPool.query('DELETE FROM adquisiciones WHERE id = $1', [id]).catch(e => console.error(e));
  }

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'DELETE_ACQUISITION',
    details: `Profesor ha eliminado la adquisición ${acq.propertyTitle} de ${acq.studentName}`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ success: true, message: 'Inmueble eliminado' });
});

app.put('/api/acquisitions/:id', (req, res) => {
  const { id } = req.params;
  const { basePrice, propertyTitle, location, landPercentage, monthlyRent } = req.body;
  const db = readDb();
  const acq = db.acquisitions.find(a => a.id === id);
  if (!acq) return res.status(404).json({ error: 'Inmueble no encontrado' });

  if (basePrice !== undefined) acq.basePrice = Number(basePrice);
  if (propertyTitle) acq.propertyTitle = propertyTitle;
  if (location) acq.location = location;
  if (landPercentage !== undefined) acq.landPercentage = Number(landPercentage);
  if (monthlyRent !== undefined) acq.monthlyRent = Number(monthlyRent);

  syncAcquisitionToSupabase(acq).catch(e => console.error(e));
  writeDb(db);
  res.json({ success: true, acquisition: acq });
});

app.delete('/api/machinery/acquisitions/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  if (!db.machineryAcquisitions) db.machineryAcquisitions = [];
  const mac = db.machineryAcquisitions.find(m => m.id === id);
  if (!mac) return res.status(404).json({ error: 'Maquinaria no encontrada' });

  db.machineryAcquisitions = db.machineryAcquisitions.filter(m => m.id !== id);
  if (dbPool) {
    dbPool.query('DELETE FROM maquinaria_adquisiciones WHERE id = $1', [id]).catch(e => console.error(e));
  }

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'DELETE_MACHINERY',
    details: `Profesor ha eliminado la adquisición de maquinaria ${mac.title || mac.lineTitle} de ${mac.studentName}`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ success: true, message: 'Maquinaria eliminada' });
});

app.put('/api/machinery/acquisitions/:id', (req, res) => {
  const { id } = req.params;
  const { basePrice, status, requiredStaff } = req.body;
  const db = readDb();
  if (!db.machineryAcquisitions) db.machineryAcquisitions = [];
  const mac = db.machineryAcquisitions.find(m => m.id === id);
  if (!mac) return res.status(404).json({ error: 'Maquinaria no encontrada' });

  if (basePrice !== undefined) mac.basePrice = Number(basePrice);
  if (status) mac.status = status;
  if (requiredStaff !== undefined) mac.requiredStaff = Number(requiredStaff);

  syncMachineryToSupabase(mac).catch(e => console.error(e));
  writeDb(db);
  res.json({ success: true, machinery: mac });
});

app.delete('/api/loans/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const loan = db.loans.find(l => l.id === id);
  if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });

  db.loans = db.loans.filter(l => l.id !== id);
  if (dbPool) {
    dbPool.query('DELETE FROM prestamos WHERE id = $1', [id]).catch(e => console.error(e));
  }

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'DELETE_LOAN',
    details: `Profesor ha eliminado el préstamo ${loan.id} de ${loan.studentName}`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ success: true, message: 'Préstamo eliminado' });
});

app.put('/api/loans/:id', (req, res) => {
  const { id } = req.params;
  const { offeredAmount, annualInterestRate, termMonths, status } = req.body;
  const db = readDb();
  const loan = db.loans.find(l => l.id === id);
  if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });

  if (offeredAmount !== undefined) loan.offeredAmount = Number(offeredAmount);
  if (annualInterestRate !== undefined) loan.annualInterestRate = Number(annualInterestRate);
  if (termMonths !== undefined) loan.termMonths = Number(termMonths);
  if (status) loan.status = status;

  syncLoanToSupabase(loan).catch(e => console.error(e));
  writeDb(db);
  res.json({ success: true, loan });
});

// ================= ELECTRICITY & FLOOR PLAN ENDPOINTS =================
app.get('/api/electricity/contracts', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const contracts = (db.electricityContracts || []).filter(c => c.studentId === studentId && c.status === 'active');
  res.json({ success: true, contracts });
});

app.get('/api/electricity/contract', (req, res) => {
  const { studentId, propertyId } = req.query;
  const db = readDb();
  const allContracts = (db.electricityContracts || []).filter(c => c.studentId === studentId && c.status === 'active');
  let contract = null;
  if (propertyId) {
    contract = allContracts.find(c => c.propertyId === propertyId || c.id === propertyId) || null;
  } else {
    contract = allContracts[0] || null;
  }
  res.json({ success: true, contract: contract || null, contracts: allContracts });
});

app.post('/api/electricity/contract', (req, res) => {
  const { studentId, propertyId, acquisitionId, propertyTitle, contractedPowerKw, powerKw } = req.body;
  const db = readDb();
  const student = db.users.find(u => u.id === studentId);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  if (!db.electricityContracts) db.electricityContracts = [];

  const targetPropId = propertyId || acquisitionId || '';
  const targetPropTitle = propertyTitle || '';
  const pKw = Number(contractedPowerKw || powerKw) || 30;

  // Find existing active contract for this student and property
  let contract = db.electricityContracts.find(c =>
    c.studentId === studentId && c.status === 'active' && (
      (targetPropId && (c.propertyId === targetPropId || c.id === targetPropId)) ||
      (targetPropTitle && c.propertyTitle && c.propertyTitle.toLowerCase().trim() === targetPropTitle.toLowerCase().trim())
    )
  );

  // Fallback: If no property-specific contract found, but there's a contract without propertyId and targetPropId is provided
  if (!contract && targetPropId) {
    contract = db.electricityContracts.find(c => c.studentId === studentId && c.status === 'active' && !c.propertyId);
  }

  if (contract) {
    contract.contractedPowerKw = pKw;
    if (targetPropId) contract.propertyId = targetPropId;
    if (targetPropTitle) contract.propertyTitle = targetPropTitle;
  } else {
    const cups = `ES003140${Math.floor(1000000000 + Math.random() * 9000000000)}F`;
    contract = {
      id: generateId('elec_contract'),
      studentId: student.id,
      studentName: student.name,
      propertyId: targetPropId,
      propertyTitle: targetPropTitle,
      contractedPowerKw: pKw,
      tariffName: 'IberLuz 3.0TD Industrial',
      pricePerKwDay: 0.11,
      pricePerKwh: 0.14,
      status: 'active',
      contractDate: new Date().toISOString(),
      cupsCode: cups
    };
    db.electricityContracts.push(contract);
  }

  // Unblock machinery that was waiting for electricity/power
  const studentMachinery = (db.machineryAcquisitions || []).filter(m => m.studentId === studentId);
  // Calculate total contracted power across all properties
  const totalContractedPower = db.electricityContracts
    .filter(c => c.studentId === studentId && c.status === 'active')
    .reduce((sum, c) => sum + (c.contractedPowerKw || 0), 0);

  const totalMachineryPowerNeeded = studentMachinery.reduce((sum, m) => sum + (m.requiredPowerKW || m.powerKw || 35), 0);
  const totalPowerNeeded = totalMachineryPowerNeeded + 10;

  let unblockedCount = 0;
  if (totalContractedPower >= totalPowerNeeded) {
    const now = new Date();
    const finishDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    for (const m of studentMachinery) {
      if (m.status === 'pendiente_energia') {
        m.status = 'montaje';
        m.assemblyFinishDate = finishDate.toISOString();
        m.assemblyEndDate = finishDate.toISOString();
        unblockedCount++;
        syncMachineryToSupabase(m).catch(e => console.error(e));
      }
    }
  }

  checkAndProcessAutomatedElectricity(db);
  syncElectricityContractToSupabase(contract).catch(e => console.error(e));
  writeDb(db);

  const message = unblockedCount > 0 
    ? `¡Suministro eléctrico contratado (${pKw} kW)! Se ha iniciado automáticamente el periodo de montaje de 5 días para ${unblockedCount} línea(s) de maquinaria.`
    : `¡Suministro eléctrico de ${pKw} kW contratado correctamente!`;

  res.json({ success: true, contract, message, unblockedCount });
});

app.get('/api/electricity/bills', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const bills = (db.electricityBills || []).filter(b => b.studentId === studentId);
  bills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, bills });
});

app.get('/api/electricity/floor-plans', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const plans = (db.naveFloorPlans || []).filter(p => p.studentId === studentId);
  res.json({ success: true, floorPlans: plans });
});

app.post('/api/electricity/floor-plan', (req, res) => {
  const { studentId, propertyId, acquisitionId, propertyTitle, machineryZoneM2, storageZoneM2, adminZoneM2, freeZoneM2, warehousesCount } = req.body;
  const db = readDb();

  if (!db.naveFloorPlans) db.naveFloorPlans = [];

  const targetPropId = propertyId || acquisitionId || '';

  let plan = db.naveFloorPlans.find(p => p.studentId === studentId && (
    (p.propertyId && targetPropId && String(p.propertyId) === String(targetPropId)) ||
    (p.acquisitionId && targetPropId && String(p.acquisitionId) === String(targetPropId)) ||
    (p.propertyId && propertyId && String(p.propertyId) === String(propertyId)) ||
    (p.acquisitionId && acquisitionId && String(p.acquisitionId) === String(acquisitionId)) ||
    (p.propertyTitle && propertyTitle && p.propertyTitle.toLowerCase().trim() === propertyTitle.toLowerCase().trim())
  ));

  if (plan) {
    plan.propertyId = propertyId || plan.propertyId || targetPropId;
    if (acquisitionId) plan.acquisitionId = acquisitionId;
    if (propertyTitle) plan.propertyTitle = propertyTitle;
    plan.machineryZoneM2 = Number(machineryZoneM2) || 0;
    plan.storageZoneM2 = Number(storageZoneM2) || 0;
    plan.adminZoneM2 = Number(adminZoneM2) || 0;
    plan.freeZoneM2 = Number(freeZoneM2) || 0;
    plan.warehousesCount = Number(warehousesCount) || 2;
    plan.updatedAt = new Date().toISOString();
  } else {
    plan = {
      id: generateId('floor_plan'),
      propertyId: targetPropId,
      acquisitionId: acquisitionId || targetPropId,
      propertyTitle: propertyTitle || '',
      studentId,
      machineryZoneM2: Number(machineryZoneM2) || 0,
      storageZoneM2: Number(storageZoneM2) || 0,
      adminZoneM2: Number(adminZoneM2) || 0,
      freeZoneM2: Number(freeZoneM2) || 0,
      warehousesCount: Number(warehousesCount) || 2,
      updatedAt: new Date().toISOString()
    };
    db.naveFloorPlans.push(plan);
  }

  syncFloorPlanToSupabase(plan).catch(e => console.error(e));
  writeDb(db);
  res.json({ success: true, floorPlan: plan });
});

// ================= TELECOM & OFFICE STORE ENDPOINTS =================

// TELECOM API ENDPOINTS
app.get('/api/telecom/plans', (req, res) => {
  res.json({ success: true, plans: TELECOM_PLANS });
});

app.get('/api/telecom/contracts', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const contracts = (db.telecomContracts || []).filter(c => c.studentId === studentId && c.status === 'active');
  res.json({ success: true, contracts });
});

app.get('/api/telecom/invoices', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const invoices = (db.telecomInvoices || []).filter(i => i.studentId === studentId);
  invoices.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
  res.json({ success: true, invoices });
});

app.post('/api/telecom/contract', (req, res) => {
  const { studentId, planId, propertyId, propertyTitle } = req.body;
  const db = readDb();

  const student = db.users.find(u => u.id === studentId);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  const plan = TELECOM_PLANS.find(p => p.id === planId);
  if (!plan) return res.status(404).json({ error: 'Plan de telecomunicaciones no encontrado' });

  if (!db.telecomContracts) db.telecomContracts = [];
  if (!db.telecomInvoices) db.telecomInvoices = [];

  // Deactivate any existing active telecom contracts for this student
  db.telecomContracts.forEach(c => {
    if (c.studentId === studentId) {
      c.status = 'cancelled';
    }
  });

  const now = new Date();
  const contract: TelecomContract = {
    id: generateId('tel_contract'),
    studentId: student.id,
    studentName: student.name,
    planId: plan.id,
    planName: plan.name,
    provider: plan.provider,
    monthlyPrice: plan.monthlyPrice,
    speedMbps: plan.speedMbps,
    mobileLinesCount: plan.mobileLinesCount,
    propertyId: propertyId || '',
    propertyTitle: propertyTitle || '',
    status: 'active',
    contractDate: now.toISOString()
  };

  db.telecomContracts.push(contract);
  syncTelecomContractToSupabase(contract).catch(e => console.error(e));

  writeDb(db);

  const cMonth = now.getMonth() + 1;
  const cYear = now.getFullYear();
  const daysInMonth = new Date(cYear, cMonth, 0).getDate();
  const startDay = now.getDate();
  const activeDays = Math.max(1, daysInMonth - startDay + 1);
  const baseAmount = Math.round((plan.monthlyPrice * (activeDays / daysInMonth)) * 100) / 100;
  const ivaAmount = Math.round((baseAmount * 0.21) * 100) / 100;
  const totalProrated = Math.round((baseAmount + ivaAmount) * 100) / 100;

  const nextMonthRef = new Date(cYear, cMonth, 1);
  const nextMonthStr = nextMonthRef.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  res.json({
    success: true,
    contract,
    newBalance: student.balance,
    message: `Servicio ${plan.name} contratado con éxito. El servicio queda activo inmediatamente. La primera cuota proporcional (${activeDays}/${daysInMonth} días: ${totalProrated.toFixed(2)} € IVA incl.) se cargará automáticamente en tu cuenta el 1 de ${nextMonthStr}.`
  });
});

// OFFICE STORE API ENDPOINTS
app.get('/api/office-store/orders', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const orders = (db.officeOrders || []).filter(o => o.studentId === studentId);
  orders.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
  res.json({ success: true, orders });
});

app.post('/api/office-store/checkout', (req, res) => {
  const { studentId, cartItems } = req.body;
  const db = readDb();

  const student = db.users.find(u => u.id === studentId);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'La cesta de la compra está vacía' });
  }

  const detailedItems: OfficePurchaseOrderItem[] = [];
  let subtotal = 0;

  for (const ci of cartItems) {
    const catalogItem = OFFICE_STORE_CATALOG.find(i => i.id === ci.itemId);
    if (!catalogItem) continue;
    const qty = Number(ci.quantity) || 1;
    const itemTotal = catalogItem.price * qty;
    subtotal += itemTotal;

    detailedItems.push({
      itemId: catalogItem.id,
      itemName: catalogItem.name,
      category: catalogItem.category,
      categoryLabel: catalogItem.categoryLabel,
      unitPrice: catalogItem.price,
      quantity: qty,
      totalPrice: itemTotal,
      imageUrl: catalogItem.imageUrl
    });
  }

  if (detailedItems.length === 0) {
    return res.status(400).json({ error: 'No se encontraron los productos especificados' });
  }

  const ivaAmount = Math.round((subtotal * 0.21) * 100) / 100;
  const totalAmount = Math.round((subtotal + ivaAmount) * 100) / 100;

  if (student.balance < totalAmount) {
    return res.status(400).json({
      error: `Saldo insuficiente para realizar el pedido. Total pedido: ${totalAmount.toFixed(2)} € (IVA incl.), Saldo disponible: ${student.balance.toFixed(2)} €.`
    });
  }

  if (!db.officeOrders) db.officeOrders = [];

  const now = new Date();
  const orderNumber = `OFF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(10000 + Math.random() * 90000)}`;

  const order: OfficePurchaseOrder = {
    id: generateId('off_ord'),
    orderNumber,
    studentId: student.id,
    studentName: student.name,
    companyName: student.name,
    nifCif: 'B-' + Math.floor(10000000 + Math.random() * 90000000),
    purchaseDate: now.toISOString(),
    items: detailedItems,
    subtotal,
    ivaRate: 21,
    ivaAmount,
    totalAmount,
    status: 'completado_pagado',
    paymentMethod: 'banco'
  };

  db.officeOrders.unshift(order);

  syncOfficeOrderToSupabase(order).catch(e => console.error(e));

  // Deduct from student balance
  student.balance = Math.round((student.balance - totalAmount) * 100) / 100;
  syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));

  const txId = generateId('tx');
  const transfer: Transfer = {
    id: txId,
    senderId: student.id,
    senderName: student.name,
    senderAccount: student.accountNumber,
    receiverId: 'ofimatica-suministros',
    receiverName: 'Suministros OfiTech S.L.',
    receiverAccount: 'ES910002000588776655',
    amount: totalAmount,
    concept: `Compra de mobiliario/informática - Pedido Nº ${orderNumber}`,
    timestamp: now.toISOString()
  };
  db.transfers.unshift(transfer);
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalAmount, now.toISOString(), transfer.concept).catch(e => console.error(e));

  writeDb(db);

  res.json({
    success: true,
    order,
    newBalance: student.balance,
    message: `Pedido Nº ${orderNumber} realizado con éxito. Cargados ${totalAmount.toFixed(2)} € (IVA incl.) en cuenta.`
  });
});

// ================= VEHICLE DEALERSHIP ENDPOINTS =================
app.get('/api/student/vehicles', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const list = (db.purchasedVehicles || []).filter(v => v.studentId === studentId);
  res.json({ success: true, vehicles: list });
});

app.post('/api/vehicles/buy', (req, res) => {
  const { studentId, vehicleType, title, basePrice, paymentMethod } = req.body;
  const db = readDb();

  const student = db.users.find(u => u.id === studentId);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  const bPrice = Number(basePrice) || 0;
  if (bPrice <= 0) return res.status(400).json({ error: 'Precio inválido' });

  const ivaAmount = Math.round((bPrice * 0.21) * 100) / 100;
  const totalPrice = Math.round((bPrice + ivaAmount) * 100) / 100;

  if (student.balance < totalPrice) {
    return res.status(400).json({
      error: `Saldo insuficiente. Total con IVA (21%): ${totalPrice.toFixed(2)} €, Saldo disponible: ${student.balance.toFixed(2)} €.`
    });
  }

  if (!db.purchasedVehicles) db.purchasedVehicles = [];

  const now = new Date();
  let img = '/images/vehicles/carretilla_elevadora.jpg';
  if (vehicleType === 'camion_trailer') img = '/images/vehicles/camion_trailer.jpg';
  if (vehicleType === 'coche_empresa') img = '/images/vehicles/coche_empresa.jpg';

  const vehicle: any = {
    id: generateId('veh'),
    studentId: student.id,
    studentName: student.name,
    vehicleType: vehicleType || 'carretilla_elevadora',
    title: title || 'Vehículo Corporativo',
    basePrice: bPrice,
    ivaAmount,
    totalPrice,
    paymentMethod: paymentMethod || 'contado',
    purchaseDate: now.toISOString(),
    status: 'activo',
    imageUrl: img
  };

  db.purchasedVehicles.unshift(vehicle);

  // Deduct balance
  student.balance = Math.round((student.balance - totalPrice) * 100) / 100;
  syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));

  const txId = generateId('tx');
  const transfer: Transfer = {
    id: txId,
    senderId: student.id,
    senderName: student.name,
    senderAccount: student.accountNumber,
    receiverId: 'concesionario-vehiculos',
    receiverName: 'Concesionario Industrial AutoCorp S.L.',
    receiverAccount: 'ES880004000998877661',
    amount: totalPrice,
    concept: `Adquisición de vehículo (${title}) - Pago al contado`,
    timestamp: now.toISOString()
  };
  db.transfers.unshift(transfer);
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalPrice, now.toISOString(), transfer.concept).catch(e => console.error(e));

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'BUY_VEHICLE',
    details: `El alumno ${student.name} ha comprado un vehículo "${title}" por ${totalPrice.toFixed(2)}€ (IVA incl.)`,
    timestamp: now.toISOString(),
    studentId: student.id,
    studentName: student.name
  });

  writeDb(db);

  res.json({
    success: true,
    vehicle,
    newBalance: student.balance,
    message: `Vehículo "${title}" adquirido con éxito por ${totalPrice.toFixed(2)} € (IVA incl.).`
  });
});

app.put('/api/student/employees/:id/assign-vehicle', (req, res) => {
  const { id } = req.params;
  const { vehicleId, warehouseIndex, shift } = req.body;

  const db = readDb();
  if (!db.hiredEmployees) db.hiredEmployees = [];

  const emp = db.hiredEmployees.find(e => e.id === id);
  if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

  if (vehicleId) {
    const veh = (db.purchasedVehicles || []).find(v => v.id === vehicleId);
    emp.assignedVehicleId = veh ? veh.id : vehicleId;
    emp.assignedVehicleTitle = veh ? veh.title : undefined;
  } else {
    emp.assignedVehicleId = undefined;
    emp.assignedVehicleTitle = undefined;
  }

  if (warehouseIndex !== undefined) {
    emp.assignedWarehouseIndex = Number(warehouseIndex) || undefined;
  }

  if (shift !== undefined) {
    emp.shift = Number(shift) || 1;
  }

  writeDb(db);
  res.json({ success: true, employee: emp });
});

// RAW MATERIALS & STUDENT LEVEL API ENDPOINTS

app.put('/api/teacher/students/:studentId/level', (req, res) => {
  const { studentId } = req.params;
  const { level } = req.body;
  const db = readDb();

  const user = db.users.find(u => u.id === studentId);
  if (!user) return res.status(404).json({ error: 'Alumno no encontrado' });

  user.level = Number(level) as 1 | 2 | 3;
  writeDb(db);
  res.json({ success: true, level: user.level, user });
});

app.get('/api/raw-materials/announcements', (req, res) => {
  const db = readDb();
  res.json({ success: true, announcements: db.rawMaterialAnnouncements || [] });
});

app.put('/api/raw-materials/announcements/:id', (req, res) => {
  const { id } = req.params;
  const { pricePerUnit, title, description, presentation } = req.body;
  const db = readDb();

  if (!db.rawMaterialAnnouncements) db.rawMaterialAnnouncements = getDefaultSeedRawMaterialAnnouncements();
  const ann = db.rawMaterialAnnouncements.find(a => a.id === id);
  if (!ann) return res.status(404).json({ error: 'Anuncio de materia prima no encontrado' });

  if (pricePerUnit !== undefined) ann.pricePerUnit = Number(pricePerUnit);
  if (title) ann.title = title;
  if (description) ann.description = description;
  if (presentation) ann.presentation = presentation;
  ann.updatedAt = new Date().toISOString();

  writeDb(db);
  res.json({ success: true, announcement: ann });
});

app.get('/api/raw-materials/orders', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];

  let orders = db.rawMaterialOrders;
  if (studentId) {
    orders = orders.filter(o => o.studentId === String(studentId));
  }
  orders.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  res.json({ success: true, orders });
});

app.post('/api/raw-materials/orders', (req, res) => {
  const { studentId, announcementId, quantity, needsTransport, pickupVehicleId } = req.body;
  const db = readDb();

  const student = db.users.find(u => u.id === studentId);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  const studentLevel = student.level || 1;
  if (studentLevel !== 1) {
    return res.status(403).json({
      error: `Acceso restringido: Tu empresa está clasificada en Nivel ${studentLevel}. Solo las empresas de Nivel 1 pueden comprar materias primas.`
    });
  }

  const ann = (db.rawMaterialAnnouncements || []).find(a => a.id === announcementId);
  if (!ann) return res.status(404).json({ error: 'Materia prima no encontrada' });

  const qty = Math.max(1, Number(quantity) || 1);
  const requestedPallets = ann.isPallet ? qty : 0;

  const floorPlans = (db.naveFloorPlans || []).filter(f => f.studentId === studentId);
  let totalWarehouseM2 = floorPlans.reduce((sum, f) => sum + (f.storageZoneM2 || 0), 0);
  if (totalWarehouseM2 === 0) {
    const acquisitions = (db.acquisitions || []).filter(a => a.studentId === studentId && a.operation === 'compra');
    totalWarehouseM2 = acquisitions.reduce((sum, a) => sum + Math.round((a.surfaceM2 || 0) * 0.25), 0) || 30;
  }

  const maxPalletsAllowed = Math.floor((totalWarehouseM2 / 30) * 25);

  const existingOrders = (db.rawMaterialOrders || []).filter(o => o.studentId === studentId && ['pendiente', 'aprobado', 'entregado'].includes(o.status));
  const currentPallets = existingOrders.reduce((sum, o) => {
    const oAnn = (db.rawMaterialAnnouncements || []).find(a => a.id === o.announcementId);
    return sum + (oAnn?.isPallet ? o.quantity : 0);
  }, 0);

  if (requestedPallets > 0 && (currentPallets + requestedPallets) > maxPalletsAllowed) {
    return res.status(400).json({
      error: `Exceso de capacidad de almacenamiento: Tienes ${totalWarehouseM2} m² de almacén de materias primas (límite: ${maxPalletsAllowed} pallets). Tienes actualmente ${currentPallets} pallets y no puedes superar los ${maxPalletsAllowed} pallets en total.`
    });
  }

  if (!needsTransport) {
    const ownedTruck = (db.purchasedVehicles || []).find(v => v.studentId === studentId && v.vehicleType === 'camion_trailer');
    const hiredTruckDriver = (db.hiredEmployees || []).find(e => e.studentId === studentId && e.role === 'camionero');

    if (!ownedTruck || !hiredTruckDriver) {
      return res.status(400).json({
        error: 'Para recoger la materia prima en la sede del vendedor sin transporte contratado, debes poseer un Camión Tráiler y tener contratado a un camionero.'
      });
    }
  }

  const basePrice = Math.round((ann.pricePerUnit * qty) * 100) / 100;
  const ivaAmount = Math.round((basePrice * 0.21) * 100) / 100;

  const totalKg = ann.unitWeightKg * qty;
  let transportCost = 0;
  if (needsTransport) {
    transportCost = Math.round((60 + totalKg * 0.08) * 100) / 100;
  }

  const totalAmount = Math.round((basePrice + ivaAmount + transportCost) * 100) / 100;

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];

  const now = new Date();
  const order: RawMaterialOrder = {
    id: generateId('rmord'),
    studentId,
    studentName: student.name,
    announcementId: ann.id,
    materialType: ann.materialType,
    materialTitle: ann.title,
    quantity: qty,
    unitWeightKg: ann.unitWeightKg,
    totalKg,
    basePrice,
    ivaAmount,
    transportCost,
    totalAmount,
    needsTransport: !!needsTransport,
    deliveryAddress: 'Polígono Industrial San Fernando, Av. de la Industria 14, San Fernando de Henares (Sede Vendedor)',
    pickupVehicleId: pickupVehicleId || undefined,
    status: 'pendiente',
    requestedAt: now.toISOString()
  };

  db.rawMaterialOrders.unshift(order);

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'SOLICITUD_MATERIA_PRIMA',
    details: `El alumno ${student.name} ha solicitado ${qty} u. de "${ann.title}" por un total de ${totalAmount.toFixed(2)} € (Pendiente de aprobación).`,
    timestamp: now.toISOString(),
    studentId: student.id,
    studentName: student.name
  });

  writeDb(db);

  res.json({
    success: true,
    order,
    message: `Solicitud de compra realizada con éxito. Pendiente de aprobación por el Profesor.`
  });
});

app.post('/api/raw-materials/orders/:id/approve', (req, res) => {
  const { id } = req.params;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (order.status !== 'pendiente') {
    return res.status(400).json({ error: `La solicitud ya está en estado "${order.status}".` });
  }

  const student = db.users.find(u => u.id === order.studentId);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  if (student.balance < order.totalAmount) {
    return res.status(400).json({
      error: `El alumno no tiene saldo suficiente (${student.balance.toFixed(2)} €) para cubrir el coste de ${order.totalAmount.toFixed(2)} €.`
    });
  }

  student.balance = Math.round((student.balance - order.totalAmount) * 100) / 100;

  const now = new Date();
  order.status = 'aprobado';
  order.approvedAt = now.toISOString();
  order.estimatedDeliveryAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

  const txId = generateId('tx');
  const transfer: Transfer = {
    id: txId,
    senderId: student.id,
    senderName: student.name,
    senderAccount: student.accountNumber,
    receiverId: 'proveedor-materia-prima',
    receiverName: 'Suministros Industriales S.A.',
    receiverAccount: 'ES990001000988776655',
    amount: order.totalAmount,
    concept: `Compra de Materia Prima (${order.materialTitle} x${order.quantity})`,
    timestamp: now.toISOString()
  };
  db.transfers.unshift(transfer);
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', order.totalAmount, now.toISOString(), transfer.concept).catch(e => console.error(e));

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'APROBAR_MATERIA_PRIMA',
    details: `El Profesor ha aprobado el pedido de materia prima "${order.materialTitle}" para ${student.name} por ${order.totalAmount.toFixed(2)} €.`,
    timestamp: now.toISOString(),
    studentId: student.id,
    studentName: student.name
  });

  writeDb(db);

  res.json({
    success: true,
    order,
    message: `Solicitud aprobada y pago de ${order.totalAmount.toFixed(2)} € descontado.`
  });
});

app.post('/api/raw-materials/orders/:id/reject', (req, res) => {
  const { id } = req.params;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  order.status = 'rechazado';
  writeDb(db);

  res.json({ success: true, order, message: 'Solicitud de materia prima rechazada.' });
});

app.post('/api/raw-materials/orders/:id/deliver', (req, res) => {
  const { id } = req.params;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const now = new Date();
  order.status = 'entregado';
  order.deliveredAt = now.toISOString();

  if (!db.rawMaterialInventories) db.rawMaterialInventories = [];
  let inv = db.rawMaterialInventories.find(i => i.studentId === order.studentId);
  if (!inv) {
    inv = {
      studentId: order.studentId,
      ironKg: 0,
      metalKg: 0,
      plasticKg: 0,
      epoxiKg: 0,
      producedRodsUnits: 0,
      producedScrewdriversUnits: 0,
      lastCalculatedAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    db.rawMaterialInventories.push(inv);
  }

  if (order.materialType === 'hierro') inv.ironKg += order.totalKg;
  if (order.materialType === 'metal') inv.metalKg += order.totalKg;
  if (order.materialType === 'plastico') inv.plasticKg += order.totalKg;
  if (order.materialType === 'epoxi') inv.epoxiKg += order.totalKg;
  inv.updatedAt = now.toISOString();

  writeDb(db);

  res.json({ success: true, order, inventory: inv, message: 'Materia prima entregada y registrada en almacén.' });
});

app.get('/api/raw-materials/inventory/:studentId', (req, res) => {
  const { studentId } = req.params;
  const db = readDb();

  const inv = checkAndCalculateProduction(db, studentId);
  writeDb(db);

  res.json({ success: true, inventory: inv });
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
