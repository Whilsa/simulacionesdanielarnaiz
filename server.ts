/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import { DatabaseSchema, User, Transfer, SystemLog, PropertyListing, PropertyAcquisition, PaymentObligation, PropertyType, OperationType, LocationScope, DeferredPaymentConfig, BankLoan, AmortizationRow, LoanStatus, UpcomingPaymentItem, MachineryItem, MachineryAcquisition, MachineryLineOption, JobListing, HiredEmployee, PayrollRecord, TaxObligation, ElectricityContract, ElectricityBill, NaveFloorPlan, ElectricityPropertyBreakdown, TelecomContract, TelecomInvoice, OfficePurchaseOrder, OfficePurchaseOrderItem, RelocationInvoice, PurchasedVehicle, RawMaterialAnnouncement, RawMaterialOrder, RawMaterialOrderItem, RawMaterialInventory, AppNotification, NegotiationHistoryEntry, MarketMessage, MarketInvoice, CompanyProfile, MarketContact, CourtLawsuit, CourtLawsuitType, CourtLawsuitSubtype, CourtAttachment, PromissoryNoteData } from './src/types.js';
import { SPANISH_REGIONS, PROPERTY_IMAGES, generateLandPercentage, generateLocation, calculateRealisticPrice, getRandomElement, getRandomInt } from './src/lib/realEstateData.js';
import { calculateSpanishDistanceKm, calculateUnifiedTransportCost } from './src/lib/spanishDistances.js';
import { TELECOM_PLANS, OFFICE_STORE_CATALOG } from './src/lib/officeStoreData.js';
import { numberToSpanishWords } from './src/lib/formatters.js';

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
        role TEXT,
        level INT DEFAULT 1
      );

      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS usuario TEXT;
      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS password TEXT;
      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS account_number TEXT;
      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS role TEXT;
      ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS level INT DEFAULT 1;

      CREATE TABLE IF NOT EXISTS movimientos (
        id VARCHAR(255) PRIMARY KEY,
        cuenta_id VARCHAR(255) NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        importe NUMERIC(12, 2) NOT NULL DEFAULT 0,
        fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        concepto TEXT,
        sender_id VARCHAR(255),
        sender_name TEXT,
        sender_account TEXT,
        receiver_id VARCHAR(255),
        receiver_name TEXT,
        receiver_account TEXT
      );

      ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS sender_id VARCHAR(255);
      ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS sender_name TEXT;
      ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS sender_account TEXT;
      ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS receiver_id VARCHAR(255);
      ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS receiver_name TEXT;
      ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS receiver_account TEXT;

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
        maquinaria_asignada_titulo TEXT,
        vehiculo_asignado_id VARCHAR(255),
        vehiculo_asignado_titulo TEXT,
        almacen_asignado_index INT,
        turno INT DEFAULT 1,
        avatar_url TEXT
      );

      CREATE TABLE IF NOT EXISTS vehiculos_comprados (
        id VARCHAR(255) PRIMARY KEY,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        vehiculo_tipo VARCHAR(50) NOT NULL,
        titulo TEXT NOT NULL,
        precio_base NUMERIC(12, 2) NOT NULL,
        importe_iva NUMERIC(12, 2) NOT NULL,
        precio_total NUMERIC(12, 2) NOT NULL,
        metodo_pago VARCHAR(50) NOT NULL,
        fecha_compra TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        conductor_asignado_id VARCHAR(255),
        conductor_asignado_nombre TEXT,
        turno_asignado INT,
        almacen_asignado_index INT,
        estado VARCHAR(50) NOT NULL DEFAULT 'activo',
        imagen_url TEXT
      );

      CREATE TABLE IF NOT EXISTS materias_primas_inventario (
        alumno_id VARCHAR(255) PRIMARY KEY,
        alumno_nombre TEXT,
        fragmentos_hierro_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
        fragmentos_metal_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
        pellets_plastico_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
        pegamento_epoxi_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
        varillas_punta INT NOT NULL DEFAULT 0,
        varillas_hierro_punta INT NOT NULL DEFAULT 0,
        varillas_metal_punta INT NOT NULL DEFAULT 0,
        productos_ensamblados INT NOT NULL DEFAULT 0,
        destornilladores_hierro INT NOT NULL DEFAULT 0,
        destornilladores_metal INT NOT NULL DEFAULT 0,
        line1_pending_hours NUMERIC(12, 6) NOT NULL DEFAULT 0,
        line2_pending_hours NUMERIC(12, 6) NOT NULL DEFAULT 0,
        desglose_almacenes JSONB,
        ultima_calculada TIMESTAMPTZ,
        fecha_actualizacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS materias_primas_pedidos (
        id VARCHAR(255) PRIMARY KEY,
        alumno_id VARCHAR(255) NOT NULL,
        alumno_nombre TEXT NOT NULL,
        announcement_id VARCHAR(255) NOT NULL,
        materia_tipo VARCHAR(50) NOT NULL,
        materia_titulo TEXT NOT NULL,
        cantidad NUMERIC(12, 2) NOT NULL,
        peso_unitario_kg NUMERIC(10, 2) NOT NULL,
        peso_total_kg NUMERIC(10, 2) NOT NULL,
        precio_base NUMERIC(12, 2) NOT NULL,
        importe_iva NUMERIC(12, 2) NOT NULL,
        coste_transporte NUMERIC(12, 2) NOT NULL,
        importe_total NUMERIC(12, 2) NOT NULL,
        necesita_transporte BOOLEAN NOT NULL DEFAULT TRUE,
        direccion_entrega TEXT,
        vehiculo_recogida_id VARCHAR(255),
        estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
        fecha_pedido TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        fecha_aprobado TIMESTAMPTZ,
        fecha_estimada_entrega TIMESTAMPTZ,
        fecha_entrega TIMESTAMPTZ,
        destination_nave_id VARCHAR(255)
      );

      ALTER TABLE empleados_contratados ADD COLUMN IF NOT EXISTS maquinaria_asignada_titulo TEXT;
      ALTER TABLE empleados_contratados ADD COLUMN IF NOT EXISTS vehiculo_asignado_id VARCHAR(255);
      ALTER TABLE empleados_contratados ADD COLUMN IF NOT EXISTS vehiculo_asignado_titulo TEXT;
      ALTER TABLE empleados_contratados ADD COLUMN IF NOT EXISTS almacen_asignado_index INT;
      ALTER TABLE empleados_contratados ADD COLUMN IF NOT EXISTS puesto VARCHAR(100);
      ALTER TABLE ofertas_empleo ADD COLUMN IF NOT EXISTS puesto VARCHAR(100);
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS items JSONB;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS seller_id VARCHAR(255);
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS seller_name TEXT;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS seller_level VARCHAR(50);
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS buyer_level VARCHAR(50);
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2) DEFAULT 0;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS insurance_fee NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS transport_method VARCHAR(50) DEFAULT 'vendedor_envio';
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS last_turn_user_id VARCHAR(255);
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS negotiation_history JSONB;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS invoice_number TEXT;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS inventory_credited BOOLEAN DEFAULT FALSE;
      ALTER TABLE materias_primas_pedidos ADD COLUMN IF NOT EXISTS destination_nave_id VARCHAR(255);
      ALTER TABLE materias_primas_pedidos ALTER COLUMN cantidad TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_pedidos ALTER COLUMN buyer_level TYPE VARCHAR(50);
      ALTER TABLE materias_primas_pedidos ALTER COLUMN seller_level TYPE VARCHAR(50);
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS varillas_hierro_punta INT NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS varillas_metal_punta INT NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS destornilladores_hierro INT NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS destornilladores_metal INT NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS rod_production_mode TEXT;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS varillas_punta_estrella INT NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS varillas_punta_plana INT NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS destornilladores_punta_estrella INT NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS destornilladores_punta_plana INT NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS line1_pending_hours NUMERIC(12, 6) NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS line2_pending_hours NUMERIC(12, 6) NOT NULL DEFAULT 0;
      ALTER TABLE materias_primas_inventario ADD COLUMN IF NOT EXISTS desglose_almacenes JSONB;
      ALTER TABLE materias_primas_inventario ALTER COLUMN varillas_punta TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN varillas_hierro_punta TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN varillas_metal_punta TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN productos_ensamblados TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN destornilladores_hierro TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN destornilladores_metal TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN varillas_punta_estrella TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN varillas_punta_plana TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN destornilladores_punta_estrella TYPE NUMERIC(12, 2);
      ALTER TABLE materias_primas_inventario ALTER COLUMN destornilladores_punta_plana TYPE NUMERIC(12, 2);

      CREATE TABLE IF NOT EXISTS market_messages (
        id VARCHAR(255) PRIMARY KEY,
        chat_id VARCHAR(255) NOT NULL,
        sender_id VARCHAR(255) NOT NULL,
        sender_name TEXT NOT NULL,
        recipient_id VARCHAR(255) NOT NULL,
        recipient_name TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        read BOOLEAN DEFAULT FALSE,
        type VARCHAR(50) DEFAULT 'text',
        invoice_data JSONB
      );
      ALTER TABLE market_messages ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;
      ALTER TABLE market_messages ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'text';
      ALTER TABLE market_messages ADD COLUMN IF NOT EXISTS invoice_data JSONB;
      ALTER TABLE vehiculos_comprados ADD COLUMN IF NOT EXISTS propiedad_asignada_id VARCHAR(255);
      ALTER TABLE vehiculos_comprados ADD COLUMN IF NOT EXISTS propiedad_asignada_titulo TEXT;
      ALTER TABLE vehiculos_comprados ADD COLUMN IF NOT EXISTS almacen_asignado_nombre TEXT;

      CREATE TABLE IF NOT EXISTS notificaciones (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        related_order_id VARCHAR(255),
        related_announcement_id VARCHAR(255)
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
        inmueble_id VARCHAR(255),
        titulo_inmueble TEXT,
        potencia_contratada_kw NUMERIC(10, 2) NOT NULL,
        nombre_tarifa TEXT NOT NULL,
        precio_kw_dia NUMERIC(10, 4) NOT NULL,
        precio_kwh NUMERIC(10, 4) NOT NULL,
        estado VARCHAR(50) NOT NULL DEFAULT 'active',
        fecha_contrato TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        cups_code TEXT
      );
      ALTER TABLE contratos_electricos ADD COLUMN IF NOT EXISTS inmueble_id VARCHAR(255);
      ALTER TABLE contratos_electricos ADD COLUMN IF NOT EXISTS titulo_inmueble TEXT;

      CREATE TABLE IF NOT EXISTS planos_distribucion_naves (
        id VARCHAR(255) PRIMARY KEY,
        inmueble_id VARCHAR(255) NOT NULL,
        alumno_id VARCHAR(255) NOT NULL,
        zona_maquinaria_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
        zona_almacen_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
        almacen_materias_primas_m2 NUMERIC(10, 2) DEFAULT 30,
        almacen_semiterminados_m2 NUMERIC(10, 2) DEFAULT 5,
        almacen_terminados_m2 NUMERIC(10, 2) DEFAULT 30,
        zona_admin_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
        zona_libre_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0,
        num_almacenes INT NOT NULL DEFAULT 2,
        adquisicion_id VARCHAR(255),
        titulo_inmueble TEXT,
        fecha_actualizacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE planos_distribucion_naves ADD COLUMN IF NOT EXISTS almacen_materias_primas_m2 NUMERIC(10, 2) DEFAULT 30;
      ALTER TABLE planos_distribucion_naves ADD COLUMN IF NOT EXISTS almacen_semiterminados_m2 NUMERIC(10, 2) DEFAULT 5;
      ALTER TABLE planos_distribucion_naves ADD COLUMN IF NOT EXISTS almacen_terminados_m2 NUMERIC(10, 2) DEFAULT 30;
      ALTER TABLE planos_distribucion_naves ADD COLUMN IF NOT EXISTS adquisicion_id VARCHAR(255);
      ALTER TABLE planos_distribucion_naves ADD COLUMN IF NOT EXISTS titulo_inmueble TEXT;

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

      CREATE TABLE IF NOT EXISTS anuncios_materia_prima (
        id VARCHAR(255) PRIMARY KEY,
        material_type VARCHAR(50) NOT NULL,
        title TEXT NOT NULL,
        presentation TEXT,
        unit_weight_kg NUMERIC(10, 2) NOT NULL DEFAULT 1000,
        is_pallet BOOLEAN NOT NULL DEFAULT TRUE,
        price_per_unit NUMERIC(12, 2) NOT NULL,
        description TEXT,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        duration_days VARCHAR(50),
        expiration_date TIMESTAMPTZ,
        stock VARCHAR(50),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        seller_id VARCHAR(255),
        seller_name TEXT,
        seller_level VARCHAR(50),
        seller_location TEXT,
        seller_municipality TEXT,
        seller_province TEXT,
        is_des_tornillo BOOLEAN DEFAULT FALSE,
        price_alert JSONB
      );
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS is_des_tornillo BOOLEAN DEFAULT FALSE;
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS price_alert JSONB;
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS seller_location TEXT;
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS seller_municipality TEXT;
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS seller_province TEXT;

      CREATE TABLE IF NOT EXISTS perfiles_empresa (
        id VARCHAR(255) PRIMARY KEY,
        student_id VARCHAR(255) UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,
        level INT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contactos_mercado (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        contact_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_contact UNIQUE (user_id, contact_id)
      );

      CREATE TABLE IF NOT EXISTS demandas_judiciales (
        id VARCHAR(255) PRIMARY KEY,
        numero_autos VARCHAR(255) UNIQUE NOT NULL,
        juzgado TEXT NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        subtipo VARCHAR(100),
        demandante_id VARCHAR(255) NOT NULL,
        demandante_nombre TEXT NOT NULL,
        demandante_nif TEXT,
        demandante_iban TEXT,
        demandado_id VARCHAR(255) NOT NULL,
        demandado_nombre TEXT NOT NULL,
        demandado_nif TEXT,
        demandado_iban TEXT,
        cuantia_reclamada NUMERIC(12, 2) NOT NULL,
        intereses_costas NUMERIC(12, 2) NOT NULL,
        cuantia_total NUMERIC(12, 2) NOT NULL,
        fecha_contrato TIMESTAMPTZ,
        descripcion_bienes TEXT,
        hechos TEXT,
        fundamentos_derecho TEXT,
        petitum TEXT,
        resumen_prueba TEXT,
        archivos_adjuntos JSONB,
        pedido_relacionado_id VARCHAR(255),
        pagare_numero VARCHAR(255),
        pagare_id VARCHAR(255),
        pagare_vencimiento TIMESTAMPTZ,
        pagare_datos JSONB,
        estado VARCHAR(50) NOT NULL,
        fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        fecha_admision TIMESTAMPTZ,
        notas_admision TEXT,
        fecha_resolucion TIMESTAMPTZ,
        notas_resolucion TEXT,
        comentarios_juez TEXT,
        transferencia_ejecucion_id VARCHAR(255),
        minuta_abogado NUMERIC(12, 2),
        minuta_iva NUMERIC(12, 2),
        minuta_total NUMERIC(12, 2),
        minuta_factura_num VARCHAR(255),
        embargo_fecha TIMESTAMPTZ,
        embargo_importe NUMERIC(12, 2),
        embargo_transfer_id VARCHAR(255),
        embargo_notas TEXT,
        contestacion_realizada BOOLEAN,
        contestacion_fecha TIMESTAMPTZ,
        contestacion_tipo VARCHAR(50),
        contestacion_hechos TEXT,
        contestacion_adjuntos JSONB,
        plazo_limite_contestacion TIMESTAMPTZ,
        minuta_demandado_base NUMERIC(12, 2),
        minuta_demandado_iva NUMERIC(12, 2),
        minuta_demandado_total NUMERIC(12, 2),
        minuta_demandado_factura_num VARCHAR(255)
      );

      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS contestacion_realizada BOOLEAN;
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS contestacion_fecha TIMESTAMPTZ;
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS contestacion_tipo VARCHAR(50);
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS contestacion_hechos TEXT;
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS contestacion_adjuntos JSONB;
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS plazo_limite_contestacion TIMESTAMPTZ;
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS minuta_demandado_base NUMERIC(12, 2);
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS minuta_demandado_iva NUMERIC(12, 2);
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS minuta_demandado_total NUMERIC(12, 2);
      ALTER TABLE demandas_judiciales ADD COLUMN IF NOT EXISTS minuta_demandado_factura_num VARCHAR(255);
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
async function syncAccountToSupabase(id: string, alumno: string, saldo: number, usuario?: string, password?: string, accountNumber?: string, role?: string, level?: number) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET 
         alumno = EXCLUDED.alumno, 
         saldo = EXCLUDED.saldo,
         usuario = COALESCE(EXCLUDED.usuario, cuentas.usuario),
         password = COALESCE(EXCLUDED.password, cuentas.password),
         account_number = COALESCE(EXCLUDED.account_number, cuentas.account_number),
         role = COALESCE(EXCLUDED.role, cuentas.role),
         level = COALESCE(EXCLUDED.level, cuentas.level)`,
      [id, alumno, saldo, usuario || null, password || null, accountNumber || null, role || 'student', level || 1]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing account to Supabase:', e);
  }
}

async function syncCompanyProfileToSupabase(profile: CompanyProfile) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO perfiles_empresa (id, student_id, company_name, description, logo_url, level, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         company_name = EXCLUDED.company_name,
         description = EXCLUDED.description,
         logo_url = EXCLUDED.logo_url,
         level = EXCLUDED.level,
         updated_at = EXCLUDED.updated_at`,
      [
        profile.id,
        profile.studentId,
        profile.companyName,
        profile.description || '',
        profile.logoUrl || '',
        profile.level || 1,
        profile.updatedAt || new Date().toISOString()
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing company profile to Supabase:', e);
  }
}

async function syncMarketContactToSupabase(contact: MarketContact) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO contactos_mercado (id, user_id, contact_id, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, contact_id) DO NOTHING`,
      [contact.id, contact.userId, contact.contactId, contact.createdAt || new Date().toISOString()]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing market contact to Supabase:', e);
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
    await safeDbQuery('DELETE FROM anuncios_materia_prima WHERE seller_id = $1', [id]);
    await safeDbQuery('DELETE FROM perfiles_empresa WHERE student_id = $1', [id]);
    await safeDbQuery('DELETE FROM contactos_mercado WHERE user_id = $1 OR contact_id = $1', [id]);
  } catch (e) {
    console.error('[Supabase DB] Error deleting account and related data from Supabase:', e);
  }
}

function parseSafeDate(d: any): Date {
  if (!d) return new Date();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseNullableSafeDate(d: any): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

async function syncMovimientoToSupabase(
  id: string,
  cuentaId: string,
  tipo: string,
  importe: number,
  fecha: string,
  concepto: string,
  txDetails?: {
    senderId?: string;
    senderName?: string;
    senderAccount?: string;
    receiverId?: string;
    receiverName?: string;
    receiverAccount?: string;
  }
) {
  if (!dbPool) return;
  try {
    const sId = txDetails?.senderId || (tipo === 'TRANSFER_OUT' ? cuentaId : undefined);
    const sName = txDetails?.senderName || undefined;
    const sAccount = txDetails?.senderAccount || undefined;
    const rId = txDetails?.receiverId || (tipo === 'TRANSFER_IN' ? cuentaId : undefined);
    const rName = txDetails?.receiverName || undefined;
    const rAccount = txDetails?.receiverAccount || undefined;

    await safeDbQuery(
      `INSERT INTO movimientos (id, cuenta_id, tipo, importe, fecha, concepto, sender_id, sender_name, sender_account, receiver_id, receiver_name, receiver_account)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         cuenta_id = EXCLUDED.cuenta_id,
         tipo = EXCLUDED.tipo,
         importe = EXCLUDED.importe,
         fecha = EXCLUDED.fecha,
         concepto = EXCLUDED.concepto,
         sender_id = COALESCE(EXCLUDED.sender_id, movimientos.sender_id),
         sender_name = COALESCE(EXCLUDED.sender_name, movimientos.sender_name),
         sender_account = COALESCE(EXCLUDED.sender_account, movimientos.sender_account),
         receiver_id = COALESCE(EXCLUDED.receiver_id, movimientos.receiver_id),
         receiver_name = COALESCE(EXCLUDED.receiver_name, movimientos.receiver_name),
         receiver_account = COALESCE(EXCLUDED.receiver_account, movimientos.receiver_account)`,
      [id, cuentaId, tipo, importe, parseSafeDate(fecha), concepto, sId || null, sName || null, sAccount || null, rId || null, rName || null, rAccount || null]
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
    await safeDbQuery('DELETE FROM inmuebles WHERE id = $1 OR id = $2', [String(id), isNaN(Number(id)) ? -1 : Number(id)]);
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
        parseSafeDate(acq.purchaseDate),
        acq.paymentMethod,
        acq.monthlyRent || null,
        parseNullableSafeDate(acq.nextRentDueDate),
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
        parseSafeDate(ob.dueDate),
        ob.status,
        parseNullableSafeDate(ob.paidDate),
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
        parseSafeDate(loan.createdAt),
        parseNullableSafeDate(loan.acceptedAt),
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
    const lineTitleVal = mac.lineTitle || mac.title || mac.optionTitle || 'Línea de maquinaria';
    const deferredPriceVal = mac.deferredPrice || mac.financedPrice || mac.basePrice || 0;
    const installmentCountVal = mac.installmentCount || mac.installmentsCount || null;
    const purchaseDateVal = parseSafeDate(mac.purchaseDate);
    const assemblyDaysVal = mac.assemblyDays || 5;
    const assemblyFinishDateVal = parseSafeDate(mac.assemblyFinishDate || mac.assemblyEndDate);
    const installedNaveIdVal = mac.installedNaveId || mac.installedAtNaveId || mac.installationNaveId || '';
    const installedNaveTitleVal = mac.installedNaveTitle || mac.installedAtNaveTitle || mac.installationNaveTitle || 'Nave industrial';
    const requiredStaffVal = mac.requiredStaff || 2;
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
    const roleVal = job.role || (job.title && (job.title.toLowerCase().includes('mozo') || job.title.toLowerCase().includes('almacen') || job.title.toLowerCase().includes('almacén')) ? 'mozo_almacen' : job.title && job.title.toLowerCase().includes('camionero') ? 'camionero' : job.title && job.title.toLowerCase().includes('carretillero') ? 'carretillero' : 'operario');
    await safeDbQuery(
      `INSERT INTO ofertas_empleo (id, titulo, puesto, nombre_empleado, genero, sueldo_bruto_mensual, edad, estado, alumno_id, alumno_nombre, fecha_contratacion, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         titulo = EXCLUDED.titulo,
         puesto = EXCLUDED.puesto,
         nombre_empleado = EXCLUDED.nombre_empleado,
         genero = EXCLUDED.genero,
         sueldo_bruto_mensual = EXCLUDED.sueldo_bruto_mensual,
         edad = EXCLUDED.edad,
         estado = EXCLUDED.estado,
         alumno_id = EXCLUDED.alumno_id,
         alumno_nombre = EXCLUDED.alumno_nombre,
         fecha_contratacion = EXCLUDED.fecha_contratacion,
         avatar_url = EXCLUDED.avatar_url`,
      [job.id, job.title, roleVal, job.employeeName, job.gender, job.grossSalaryMonthly, job.age, job.status, job.hiredByStudentId || null, job.hiredByStudentName || null, parseNullableSafeDate(job.hiredAtDate), job.avatarUrl || null]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing job listing:', e);
  }
}

async function syncHiredEmployeeToSupabase(emp: HiredEmployee) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO empleados_contratados (
        id, oferta_id, alumno_id, alumno_nombre, nombre_empleado, puesto, genero, sueldo_bruto_mensual, edad, fecha_contratacion,
        maquinaria_asignada_id, maquinaria_asignada_titulo, vehiculo_asignado_id, vehiculo_asignado_titulo, almacen_asignado_index, turno, avatar_url
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         alumno_id = EXCLUDED.alumno_id,
         alumno_nombre = EXCLUDED.alumno_nombre,
         nombre_empleado = EXCLUDED.nombre_empleado,
         puesto = EXCLUDED.puesto,
         genero = EXCLUDED.genero,
         sueldo_bruto_mensual = EXCLUDED.sueldo_bruto_mensual,
         edad = EXCLUDED.edad,
         fecha_contratacion = EXCLUDED.fecha_contratacion,
         maquinaria_asignada_id = EXCLUDED.maquinaria_asignada_id,
         maquinaria_asignada_titulo = EXCLUDED.maquinaria_asignada_titulo,
         vehiculo_asignado_id = EXCLUDED.vehiculo_asignado_id,
         vehiculo_asignado_titulo = EXCLUDED.vehiculo_asignado_titulo,
         almacen_asignado_index = EXCLUDED.almacen_asignado_index,
         turno = EXCLUDED.turno,
         avatar_url = EXCLUDED.avatar_url`,
      [
        emp.id,
        emp.jobListingId,
        emp.studentId,
        emp.studentName,
        emp.employeeName,
        emp.role || 'operario',
        emp.gender,
        emp.grossSalaryMonthly,
        emp.age,
        parseNullableSafeDate(emp.hireDate),
        emp.assignedMachineryId || null,
        emp.assignedMachineryTitle || null,
        emp.assignedVehicleId || null,
        emp.assignedVehicleTitle || null,
        emp.assignedWarehouseIndex !== undefined ? emp.assignedWarehouseIndex : null,
        emp.shift || 1,
        emp.avatarUrl || null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing hired employee:', e);
  }
}

async function syncVehicleToSupabase(veh: PurchasedVehicle) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO vehiculos_comprados (
        id, alumno_id, alumno_nombre, vehiculo_tipo, titulo,
        precio_base, importe_iva, precio_total, metodo_pago, fecha_compra,
        conductor_asignado_id, conductor_asignado_nombre, turno_asignado, almacen_asignado_index,
        propiedad_asignada_id, propiedad_asignada_titulo, almacen_asignado_nombre,
        estado, imagen_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (id) DO UPDATE SET
        conductor_asignado_id = EXCLUDED.conductor_asignado_id,
        conductor_asignado_nombre = EXCLUDED.conductor_asignado_nombre,
        turno_asignado = EXCLUDED.turno_asignado,
        almacen_asignado_index = EXCLUDED.almacen_asignado_index,
        propiedad_asignada_id = EXCLUDED.propiedad_asignada_id,
        propiedad_asignada_titulo = EXCLUDED.propiedad_asignada_titulo,
        almacen_asignado_nombre = EXCLUDED.almacen_asignado_nombre,
        estado = EXCLUDED.estado`,
      [
        veh.id,
        veh.studentId,
        veh.studentName,
        veh.vehicleType,
        veh.title,
        veh.basePrice,
        veh.ivaAmount,
        veh.totalPrice,
        veh.paymentMethod,
        parseSafeDate(veh.purchaseDate),
        veh.assignedDriverId || null,
        veh.assignedDriverName || null,
        veh.assignedShift || null,
        veh.assignedWarehouseIndex !== undefined ? veh.assignedWarehouseIndex : null,
        veh.assignedPropertyId || null,
        veh.assignedPropertyTitle || null,
        veh.assignedWarehouseName || null,
        veh.status || 'activo',
        veh.imageUrl || null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing vehicle to Supabase:', e);
  }
}

async function syncInventoryToSupabase(inv: RawMaterialInventory, studentName?: string) {
  if (!dbPool) return;
  try {
    const starRods = (inv as any).producedStarRodsUnits || (inv as any).producedIronRodsUnits || 0;
    const flatRods = (inv as any).producedFlatRodsUnits || (inv as any).producedMetalRodsUnits || 0;
    const totalRods = inv.producedRodsUnits ?? (starRods + flatRods);
    const starScrewdrivers = (inv as any).starScrewdriversUnits || (inv as any).ironScrewdriversUnits || 0;
    const flatScrewdrivers = (inv as any).flatScrewdriversUnits || (inv as any).metalScrewdriversUnits || 0;
    const totalScrewdrivers = inv.producedScrewdriversUnits ?? (starScrewdrivers + flatScrewdrivers);

    const desgloseJson = (inv as any).naveInventories && Object.keys((inv as any).naveInventories).length > 0
      ? JSON.stringify((inv as any).naveInventories)
      : null;

    await safeDbQuery(
      `INSERT INTO materias_primas_inventario (
        alumno_id, alumno_nombre, fragmentos_hierro_kg, fragmentos_metal_kg,
        pellets_plastico_kg, pegamento_epoxi_kg, rod_production_mode,
        varillas_punta, varillas_hierro_punta, varillas_metal_punta,
        varillas_punta_estrella, varillas_punta_plana,
        productos_ensamblados, destornilladores_hierro, destornilladores_metal,
        destornilladores_punta_estrella, destornilladores_punta_plana,
        line1_pending_hours, line2_pending_hours,
        desglose_almacenes,
        ultima_calculada, fecha_actualizacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      ON CONFLICT (alumno_id) DO UPDATE SET
        alumno_nombre = COALESCE(EXCLUDED.alumno_nombre, materias_primas_inventario.alumno_nombre),
        fragmentos_hierro_kg = EXCLUDED.fragmentos_hierro_kg,
        fragmentos_metal_kg = EXCLUDED.fragmentos_metal_kg,
        pellets_plastico_kg = EXCLUDED.pellets_plastico_kg,
        pegamento_epoxi_kg = EXCLUDED.pegamento_epoxi_kg,
        rod_production_mode = EXCLUDED.rod_production_mode,
        varillas_punta = EXCLUDED.varillas_punta,
        varillas_hierro_punta = EXCLUDED.varillas_hierro_punta,
        varillas_metal_punta = EXCLUDED.varillas_metal_punta,
        varillas_punta_estrella = EXCLUDED.varillas_punta_estrella,
        varillas_punta_plana = EXCLUDED.varillas_punta_plana,
        productos_ensamblados = EXCLUDED.productos_ensamblados,
        destornilladores_hierro = EXCLUDED.destornilladores_hierro,
        destornilladores_metal = EXCLUDED.destornilladores_metal,
        destornilladores_punta_estrella = EXCLUDED.destornilladores_punta_estrella,
        destornilladores_punta_plana = EXCLUDED.destornilladores_punta_plana,
        line1_pending_hours = EXCLUDED.line1_pending_hours,
        line2_pending_hours = EXCLUDED.line2_pending_hours,
        desglose_almacenes = EXCLUDED.desglose_almacenes,
        ultima_calculada = EXCLUDED.ultima_calculada,
        fecha_actualizacion = EXCLUDED.fecha_actualizacion`,
      [
        inv.studentId,
        studentName || 'Estudiante',
        inv.ironKg || 0,
        inv.metalKg || 0,
        inv.plasticKg || 0,
        inv.epoxiKg || 0,
        (inv as any).rodProductionMode || null,
        totalRods,
        starRods,
        flatRods,
        starRods,
        flatRods,
        totalScrewdrivers,
        starScrewdrivers,
        flatScrewdrivers,
        starScrewdrivers,
        flatScrewdrivers,
        (inv as any).line1PendingHours || 0,
        (inv as any).line2PendingHours || 0,
        desgloseJson,
        parseSafeDate(inv.lastCalculatedAt),
        new Date()
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing raw material inventory to Supabase:', e);
  }
}

async function syncRawMaterialOrderToSupabase(ord: RawMaterialOrder) {
  if (!dbPool) return;
  try {
    const itemsJson = ord.items && ord.items.length > 0 ? JSON.stringify(ord.items) : null;
    const historyJson = ord.negotiationHistory && ord.negotiationHistory.length > 0 ? JSON.stringify(ord.negotiationHistory) : null;
    await safeDbQuery(
      `INSERT INTO materias_primas_pedidos (
        id, alumno_id, alumno_nombre, announcement_id, materia_tipo, materia_titulo,
        cantidad, peso_unitario_kg, peso_total_kg, precio_base, importe_iva, coste_transporte,
        importe_total, necesita_transporte, direccion_entrega, vehiculo_recogida_id,
        estado, fecha_pedido, fecha_aprobado, fecha_estimada_entrega, fecha_entrega, items,
        seller_id, seller_name, seller_level, buyer_level, discount_percentage, insurance_fee,
        transport_method, last_turn_user_id, negotiation_history, shipped_at, invoiced_at, invoice_number, inventory_credited,
        destination_nave_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
      ON CONFLICT (id) DO UPDATE SET
        estado = EXCLUDED.estado,
        fecha_aprobado = EXCLUDED.fecha_aprobado,
        fecha_estimada_entrega = EXCLUDED.fecha_estimada_entrega,
        fecha_entrega = EXCLUDED.fecha_entrega,
        items = COALESCE(EXCLUDED.items, materias_primas_pedidos.items),
        precio_base = EXCLUDED.precio_base,
        importe_iva = EXCLUDED.importe_iva,
        coste_transporte = EXCLUDED.coste_transporte,
        importe_total = EXCLUDED.importe_total,
        discount_percentage = EXCLUDED.discount_percentage,
        insurance_fee = EXCLUDED.insurance_fee,
        transport_method = EXCLUDED.transport_method,
        last_turn_user_id = EXCLUDED.last_turn_user_id,
        negotiation_history = EXCLUDED.negotiation_history,
        shipped_at = EXCLUDED.shipped_at,
        invoiced_at = EXCLUDED.invoiced_at,
        invoice_number = EXCLUDED.invoice_number,
        inventory_credited = EXCLUDED.inventory_credited,
        destination_nave_id = EXCLUDED.destination_nave_id`,
      [
        ord.id,
        ord.studentId || '',
        ord.studentName || '',
        ord.announcementId || '',
        ord.materialType || 'hierro',
        ord.materialTitle || ord.note || (ord.items && ord.items[0] && ord.items[0].title) || 'Factura comercial',
        ord.quantity !== undefined && ord.quantity !== null ? Number(ord.quantity) : 1,
        ord.unitWeightKg || 0,
        ord.totalKg || 0,
        ord.basePrice || ord.subtotalAmount || 0,
        ord.ivaAmount || ord.vatAmount || 0,
        ord.transportCost || 0,
        ord.totalAmount || 0,
        ord.needsTransport !== undefined ? ord.needsTransport : true,
        ord.deliveryAddress || null,
        ord.pickupVehicleId || null,
        ord.status,
        parseSafeDate(ord.requestedAt),
        parseNullableSafeDate(ord.approvedAt),
        parseNullableSafeDate(ord.estimatedDeliveryAt),
        parseNullableSafeDate(ord.deliveredAt),
        itemsJson,
        ord.sellerId || null,
        ord.sellerName || null,
        ord.sellerLevel !== undefined && ord.sellerLevel !== null ? String(ord.sellerLevel) : null,
        ord.buyerLevel !== undefined && ord.buyerLevel !== null ? String(ord.buyerLevel) : null,
        ord.discountPercentage || 0,
        ord.insuranceFee || 0,
        ord.transportMethod || 'vendedor_envio',
        ord.lastTurnUserId || null,
        historyJson,
        parseNullableSafeDate(ord.shippedAt),
        parseNullableSafeDate(ord.invoicedAt),
        ord.invoiceNumber || null,
        ord.inventoryCredited || false,
        ord.destinationNaveId || null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing raw material order to Supabase:', e);
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
        precio_kw_dia, precio_kwh, estado, fecha_contrato, cups_code,
        inmueble_id, titulo_inmueble
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        potencia_contratada_kw = EXCLUDED.potencia_contratada_kw,
        estado = EXCLUDED.estado,
        inmueble_id = EXCLUDED.inmueble_id,
        titulo_inmueble = EXCLUDED.titulo_inmueble`,
      [
        contract.id,
        contract.studentId,
        contract.studentName || 'Estudiante',
        contract.contractedPowerKw,
        contract.tariffName || 'IberLuz 3.0TD Industrial',
        contract.pricePerKwDay || 0.11,
        contract.pricePerKwh || 0.14,
        contract.status || 'active',
        parseSafeDate(contract.contractDate),
        contract.cupsCode || '',
        contract.propertyId || null,
        contract.propertyTitle || null
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
        almacen_materias_primas_m2, almacen_semiterminados_m2, almacen_terminados_m2,
        zona_admin_m2, zona_libre_m2, num_almacenes, adquisicion_id, titulo_inmueble, fecha_actualizacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        inmueble_id = EXCLUDED.inmueble_id,
        zona_maquinaria_m2 = EXCLUDED.zona_maquinaria_m2,
        zona_almacen_m2 = EXCLUDED.zona_almacen_m2,
        almacen_materias_primas_m2 = EXCLUDED.almacen_materias_primas_m2,
        almacen_semiterminados_m2 = EXCLUDED.almacen_semiterminados_m2,
        almacen_terminados_m2 = EXCLUDED.almacen_terminados_m2,
        zona_admin_m2 = EXCLUDED.zona_admin_m2,
        zona_libre_m2 = EXCLUDED.zona_libre_m2,
        num_almacenes = EXCLUDED.num_almacenes,
        adquisicion_id = EXCLUDED.adquisicion_id,
        titulo_inmueble = EXCLUDED.titulo_inmueble,
        fecha_actualizacion = EXCLUDED.fecha_actualizacion`,
      [
        plan.id,
        plan.propertyId || plan.acquisitionId || '',
        plan.studentId,
        plan.machineryZoneM2 || 0,
        plan.storageZoneM2 || 0,
        plan.rawMaterialsStorageM2 !== undefined ? plan.rawMaterialsStorageM2 : 30,
        plan.semiFinishedStorageM2 !== undefined ? plan.semiFinishedStorageM2 : 5,
        plan.finishedGoodsStorageM2 !== undefined ? plan.finishedGoodsStorageM2 : 30,
        plan.adminZoneM2 || 0,
        plan.freeZoneM2 || 0,
        plan.warehousesCount || 2,
        plan.acquisitionId || '',
        plan.propertyTitle || '',
        parseSafeDate(plan.updatedAt)
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
        parseSafeDate(contract.contractDate),
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
        parseSafeDate(invoice.issueDate),
        parseSafeDate(invoice.dueDate),
        invoice.subtotal,
        invoice.ivaRate || 21,
        invoice.ivaAmount,
        invoice.totalAmount,
        invoice.status || 'pagado',
        parseNullableSafeDate(invoice.paidDate),
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
        parseSafeDate(order.purchaseDate),
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

async function syncRawMaterialAnnouncementToSupabase(ann: RawMaterialAnnouncement) {
  if (!dbPool) return;
  try {
    let sLevel: string | null = null;
    if (ann.sellerLevel !== undefined && ann.sellerLevel !== null) {
      sLevel = String(ann.sellerLevel);
    }
    let durDays: string = 'indefinido';
    if (ann.durationDays !== undefined && ann.durationDays !== null) {
      durDays = String(ann.durationDays);
    }
    let st: string = 'ilimitado';
    if (ann.stock !== undefined && ann.stock !== null) {
      st = String(ann.stock);
    }
    const priceAlertJson = ann.priceAlert ? JSON.stringify(ann.priceAlert) : null;
    const isDesTornilloVal = ann.isDesTornillo !== undefined ? !!ann.isDesTornillo : false;

    await safeDbQuery(
      `INSERT INTO anuncios_materia_prima (
        id, material_type, title, presentation, unit_weight_kg, is_pallet, price_per_unit,
        description, updated_at, duration_days, expiration_date, stock, active, seller_id, seller_name, seller_level,
        seller_location, seller_municipality, seller_province,
        is_des_tornillo, price_alert
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (id) DO UPDATE SET
        material_type = EXCLUDED.material_type,
        title = EXCLUDED.title,
        presentation = EXCLUDED.presentation,
        unit_weight_kg = EXCLUDED.unit_weight_kg,
        is_pallet = EXCLUDED.is_pallet,
        price_per_unit = EXCLUDED.price_per_unit,
        description = EXCLUDED.description,
        updated_at = EXCLUDED.updated_at,
        duration_days = EXCLUDED.duration_days,
        expiration_date = EXCLUDED.expiration_date,
        stock = EXCLUDED.stock,
        active = EXCLUDED.active,
        seller_id = EXCLUDED.seller_id,
        seller_name = EXCLUDED.seller_name,
        seller_level = EXCLUDED.seller_level,
        seller_location = EXCLUDED.seller_location,
        seller_municipality = EXCLUDED.seller_municipality,
        seller_province = EXCLUDED.seller_province,
        is_des_tornillo = EXCLUDED.is_des_tornillo,
        price_alert = EXCLUDED.price_alert`,
      [
        ann.id,
        ann.materialType,
        ann.title,
        ann.presentation || 'Pallet',
        ann.unitWeightKg || 1000,
        ann.isPallet !== undefined ? ann.isPallet : true,
        ann.pricePerUnit || 0,
        ann.description || '',
        parseSafeDate(ann.updatedAt),
        durDays,
        parseNullableSafeDate(ann.expirationDate),
        st,
        ann.active !== undefined ? ann.active : true,
        ann.sellerId || null,
        ann.sellerName || null,
        sLevel,
        ann.sellerLocation || null,
        ann.sellerMunicipality || null,
        ann.sellerProvince || null,
        isDesTornilloVal,
        priceAlertJson
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing raw material announcement to Supabase:', e);
  }
}

async function syncMarketMessageToSupabase(msg: MarketMessage) {
  if (!dbPool) return;
  try {
    const dataJson = msg.promissoryNoteData
      ? JSON.stringify(msg.promissoryNoteData)
      : (msg.invoiceData ? JSON.stringify(msg.invoiceData) : null);
    await safeDbQuery(
      `INSERT INTO market_messages (id, chat_id, sender_id, sender_name, recipient_id, recipient_name, content, timestamp, read, type, invoice_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         read = EXCLUDED.read,
         type = EXCLUDED.type,
         invoice_data = EXCLUDED.invoice_data`,
      [
        msg.id,
        msg.chatId,
        msg.senderId,
        msg.senderName,
        msg.recipientId,
        msg.recipientName,
        msg.content,
        parseSafeDate(msg.timestamp),
        msg.read || false,
        msg.type || 'text',
        dataJson
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing market message to Supabase:', e);
  }
}

async function deleteRawMaterialAnnouncementFromSupabase(id: string) {
  if (!dbPool) return;
  try {
    await safeDbQuery('DELETE FROM anuncios_materia_prima WHERE id = $1', [id]);
  } catch (e) {
    console.error('[Supabase DB] Error deleting raw material announcement from Supabase:', e);
  }
}

async function syncCourtLawsuitToSupabase(lawsuit: CourtLawsuit) {
  if (!dbPool) return;
  try {
    const attachmentsJson = lawsuit.attachments && lawsuit.attachments.length > 0 ? JSON.stringify(lawsuit.attachments) : null;
    const pagareDataJson = lawsuit.promissoryNoteData ? JSON.stringify(lawsuit.promissoryNoteData) : null;
    const defAttachmentsJson = lawsuit.defendantAnswerAttachments && lawsuit.defendantAnswerAttachments.length > 0 ? JSON.stringify(lawsuit.defendantAnswerAttachments) : null;

    await safeDbQuery(
      `INSERT INTO demandas_judiciales (
        id, numero_autos, juzgado, tipo, subtipo,
        demandante_id, demandante_nombre, demandante_nif, demandante_iban,
        demandado_id, demandado_nombre, demandado_nif, demandado_iban,
        cuantia_reclamada, intereses_costas, cuantia_total, fecha_contrato,
        descripcion_bienes, hechos, fundamentos_derecho, petitum, resumen_prueba,
        archivos_adjuntos, pedido_relacionado_id, pagare_numero, pagare_id,
        pagare_vencimiento, pagare_datos, estado, fecha_creacion, fecha_actualizacion,
        fecha_admision, notas_admision, fecha_resolucion, notas_resolucion, comentarios_juez,
        transferencia_ejecucion_id, minuta_abogado, minuta_iva, minuta_total, minuta_factura_num,
        embargo_fecha, embargo_importe, embargo_transfer_id, embargo_notas,
        contestacion_realizada, contestacion_fecha, contestacion_tipo, contestacion_hechos, contestacion_adjuntos,
        plazo_limite_contestacion, minuta_demandado_base, minuta_demandado_iva, minuta_demandado_total, minuta_demandado_factura_num
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47,
        $48, $49, $50, $51, $52, $53, $54, $55
      )
      ON CONFLICT (id) DO UPDATE SET
        numero_autos = EXCLUDED.numero_autos,
        juzgado = EXCLUDED.juzgado,
        tipo = EXCLUDED.tipo,
        subtipo = EXCLUDED.subtipo,
        demandante_id = EXCLUDED.demandante_id,
        demandante_nombre = EXCLUDED.demandante_nombre,
        demandante_nif = EXCLUDED.demandante_nif,
        demandante_iban = EXCLUDED.demandante_iban,
        demandado_id = EXCLUDED.demandado_id,
        demandado_nombre = EXCLUDED.demandado_nombre,
        demandado_nif = EXCLUDED.demandado_nif,
        demandado_iban = EXCLUDED.demandado_iban,
        cuantia_reclamada = EXCLUDED.cuantia_reclamada,
        intereses_costas = EXCLUDED.intereses_costas,
        cuantia_total = EXCLUDED.cuantia_total,
        fecha_contrato = EXCLUDED.fecha_contrato,
        descripcion_bienes = EXCLUDED.descripcion_bienes,
        hechos = EXCLUDED.hechos,
        fundamentos_derecho = EXCLUDED.fundamentos_derecho,
        petitum = EXCLUDED.petitum,
        resumen_prueba = EXCLUDED.resumen_prueba,
        archivos_adjuntos = EXCLUDED.archivos_adjuntos,
        pedido_relacionado_id = EXCLUDED.pedido_relacionado_id,
        pagare_numero = EXCLUDED.pagare_numero,
        pagare_id = EXCLUDED.pagare_id,
        pagare_vencimiento = EXCLUDED.pagare_vencimiento,
        pagare_datos = EXCLUDED.pagare_datos,
        estado = EXCLUDED.estado,
        fecha_actualizacion = EXCLUDED.fecha_actualizacion,
        fecha_admision = EXCLUDED.fecha_admision,
        notas_admision = EXCLUDED.notas_admision,
        fecha_resolucion = EXCLUDED.fecha_resolucion,
        notas_resolucion = EXCLUDED.notas_resolucion,
        comentarios_juez = EXCLUDED.comentarios_juez,
        transferencia_ejecucion_id = EXCLUDED.transferencia_ejecucion_id,
        minuta_abogado = EXCLUDED.minuta_abogado,
        minuta_iva = EXCLUDED.minuta_iva,
        minuta_total = EXCLUDED.minuta_total,
        minuta_factura_num = EXCLUDED.minuta_factura_num,
        embargo_fecha = EXCLUDED.embargo_fecha,
        embargo_importe = EXCLUDED.embargo_importe,
        embargo_transfer_id = EXCLUDED.embargo_transfer_id,
        embargo_notas = EXCLUDED.embargo_notas,
        contestacion_realizada = EXCLUDED.contestacion_realizada,
        contestacion_fecha = EXCLUDED.contestacion_fecha,
        contestacion_tipo = EXCLUDED.contestacion_tipo,
        contestacion_hechos = EXCLUDED.contestacion_hechos,
        contestacion_adjuntos = EXCLUDED.contestacion_adjuntos,
        plazo_limite_contestacion = EXCLUDED.plazo_limite_contestacion,
        minuta_demandado_base = EXCLUDED.minuta_demandado_base,
        minuta_demandado_iva = EXCLUDED.minuta_demandado_iva,
        minuta_demandado_total = EXCLUDED.minuta_demandado_total,
        minuta_demandado_factura_num = EXCLUDED.minuta_demandado_factura_num`,
      [
        lawsuit.id,
        lawsuit.caseNumber,
        lawsuit.courtName || 'Juzgado de 1ª Instancia e Instrucción Nº 1',
        lawsuit.type,
        lawsuit.subtype || null,
        lawsuit.plaintiffId,
        lawsuit.plaintiffName,
        lawsuit.plaintiffNif || null,
        lawsuit.plaintiffIban || null,
        lawsuit.defendantId,
        lawsuit.defendantName,
        lawsuit.defendantNif || null,
        lawsuit.defendantIban || null,
        lawsuit.claimedAmount || 0,
        lawsuit.interestAndCostsAmount || 0,
        lawsuit.totalClaimAmount || lawsuit.claimedAmount || 0,
        parseNullableSafeDate(lawsuit.contractDate),
        lawsuit.goodsDescription || '',
        lawsuit.facts || '',
        lawsuit.legalBasis || '',
        lawsuit.petitum || '',
        lawsuit.evidenceSummary || '',
        attachmentsJson,
        lawsuit.relatedOrderId || null,
        lawsuit.promissoryNoteNumber || null,
        lawsuit.promissoryNoteId || null,
        parseNullableSafeDate(lawsuit.promissoryNoteDueDate),
        pagareDataJson,
        lawsuit.status,
        parseSafeDate(lawsuit.createdAt),
        parseSafeDate(lawsuit.updatedAt),
        parseNullableSafeDate(lawsuit.admissionDate),
        lawsuit.admissionNotes || null,
        parseNullableSafeDate(lawsuit.resolutionDate),
        lawsuit.resolutionNotes || null,
        lawsuit.judgeComments || null,
        lawsuit.executionTransferId || null,
        lawsuit.lawyerFeeAmount || null,
        lawsuit.lawyerFeeIva || null,
        lawsuit.lawyerFeeTotal || null,
        lawsuit.lawyerFeeInvoiceNumber || null,
        parseNullableSafeDate(lawsuit.embargoDate),
        lawsuit.embargoAmount || null,
        lawsuit.embargoTransferId || null,
        lawsuit.embargoNotes || null,
        lawsuit.defendantAnswered || false,
        parseNullableSafeDate(lawsuit.defendantAnswerDate),
        lawsuit.defendantAnswerType || null,
        lawsuit.defendantAnswerFacts || null,
        defAttachmentsJson,
        parseNullableSafeDate(lawsuit.defendantDeadlineDate),
        lawsuit.defendantLawyerFeeAmount || null,
        lawsuit.defendantLawyerFeeIva || null,
        lawsuit.defendantLawyerFeeTotal || null,
        lawsuit.defendantLawyerFeeInvoiceNumber || null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing court lawsuit to Supabase:', e);
  }
}

async function syncAllToSupabase(db: DatabaseSchema) {
  if (!dbPool) return;
  try {
    for (const user of db.users) {
      if (user.role === 'student') {
        await syncAccountToSupabase(user.id, user.name, user.balance, user.username, user.password, user.accountNumber, user.role, user.level || 1);
      }
    }
    for (const tx of db.transfers) {
      await syncMovimientoToSupabase(tx.id + '-out', tx.senderId, 'TRANSFER_OUT', tx.amount, tx.timestamp, tx.concept, tx);
      await syncMovimientoToSupabase(tx.id + '-in', tx.receiverId, 'TRANSFER_IN', tx.amount, tx.timestamp, tx.concept, tx);
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
    if (db.purchasedVehicles) {
      for (const veh of db.purchasedVehicles) {
        await syncVehicleToSupabase(veh);
      }
    }
    if (db.rawMaterialInventories) {
      for (const inv of db.rawMaterialInventories) {
        const student = db.users.find(u => u.id === inv.studentId);
        await syncInventoryToSupabase(inv, student?.name);
      }
    }
    if (db.rawMaterialOrders) {
      for (const ord of db.rawMaterialOrders) {
        await syncRawMaterialOrderToSupabase(ord);
      }
    }
    if (db.rawMaterialAnnouncements) {
      for (const ann of db.rawMaterialAnnouncements) {
        await syncRawMaterialAnnouncementToSupabase(ann);
      }
    }
    if (db.companyProfiles) {
      for (const cp of db.companyProfiles) {
        await syncCompanyProfileToSupabase(cp);
      }
    }
    if (db.marketContacts) {
      for (const mc of db.marketContacts) {
        await syncMarketContactToSupabase(mc);
      }
    }
    if (db.marketMessages) {
      for (const msg of db.marketMessages) {
        await syncMarketMessageToSupabase(msg);
      }
    }
    if (db.courtLawsuits) {
      for (const lawsuit of db.courtLawsuits) {
        await syncCourtLawsuitToSupabase(lawsuit);
      }
    }
    if (db.notifications) {
      for (const notif of db.notifications) {
        await syncNotificationToSupabase(notif);
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
      const resCuentas = await client.query('SELECT id, alumno, saldo, usuario, password, account_number, role, level FROM cuentas');
      
      // If Supabase has NO records, seed Supabase with current db.json state
      if (resCuentas.rows.length === 0) {
        console.log('[Supabase Sync] Supabase "cuentas" table is empty. Seeding Supabase with local data...');
        const currentDb = readDb();
        await syncAllToSupabase(currentDb);
        return { restoredUsers: 0, restoredMovements: 0 };
      }

      console.log(`[Supabase Restore] Found ${resCuentas.rows.length} accounts in Supabase. Restoring to application database...`);
      const resMov = await client.query('SELECT * FROM movimientos ORDER BY fecha DESC');
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

      let resVehicles: any = { rows: [] };
      try {
        resVehicles = await client.query('SELECT * FROM vehiculos_comprados ORDER BY fecha_compra DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Vehiculos comprados table select warning:', e);
      }

      let resRawInventories: any = { rows: [] };
      try {
        resRawInventories = await client.query('SELECT * FROM materias_primas_inventario');
      } catch (e) {
        console.warn('[Supabase Restore] Materias primas inventario table select warning:', e);
      }

      let resRawOrders: any = { rows: [] };
      try {
        resRawOrders = await client.query('SELECT * FROM materias_primas_pedidos ORDER BY fecha_pedido DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Materias primas pedidos table select warning:', e);
      }

      let resRawAnnouncements: any = { rows: [] };
      try {
        resRawAnnouncements = await client.query('SELECT * FROM anuncios_materia_prima ORDER BY updated_at DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Anuncios materia prima table select warning:', e);
      }

      let resProfiles: any = { rows: [] };
      try {
        resProfiles = await client.query('SELECT * FROM perfiles_empresa ORDER BY updated_at DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Perfiles empresa table select warning:', e);
      }

      let resContacts: any = { rows: [] };
      try {
        resContacts = await client.query('SELECT * FROM contactos_mercado ORDER BY created_at DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Contactos mercado table select warning:', e);
      }

      let resMessages: any = { rows: [] };
      try {
        resMessages = await client.query('SELECT * FROM market_messages ORDER BY timestamp ASC');
      } catch (e) {
        console.warn('[Supabase Restore] Market messages table select warning:', e);
      }

      let resLawsuits: any = { rows: [] };
      try {
        resLawsuits = await client.query('SELECT * FROM demandas_judiciales ORDER BY fecha_creacion DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Demandas judiciales table select warning:', e);
      }

      let resNotif: any = { rows: [] };
      try {
        resNotif = await client.query('SELECT * FROM notificaciones ORDER BY created_at DESC');
      } catch (e) {
        console.warn('[Supabase Restore] Notificaciones table select warning:', e);
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
        const rowLevel = row.level ? (Number(row.level) as 1 | 2 | 3) : 1;

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
            balance: rowSaldo,
            level: rowLevel
          });
        }
      }

      // If no student accounts were retrieved from Supabase, preserve default students
      if (restoredUsers.filter(u => u.role === 'student').length === 0) {
        const defaultStudents: User[] = [
          {
            id: 'alumno-1',
            username: 'ana',
            password: '123',
            role: 'student',
            name: 'Ana López',
            accountNumber: 'ES910001000212345678',
            balance: 1000,
            level: 1
          },
          {
            id: 'alumno-2',
            username: 'carlos',
            password: '123',
            role: 'student',
            name: 'Carlos Ruiz',
            accountNumber: 'ES910001000287654321',
            balance: 1000,
            level: 1
          },
          {
            id: 'alumno-3',
            username: 'beatriz',
            password: '123',
            role: 'student',
            name: 'Beatriz Gómez',
            accountNumber: 'ES910001000244556677',
            balance: 1000,
            level: 1
          },
          {
            id: 'alumno-cliente01',
            username: 'cliente01',
            password: '123',
            role: 'student',
            name: 'Cliente 01',
            accountNumber: 'ES910001000299000001',
            balance: 1000,
            level: 1
          }
        ];
        restoredUsers.push(...defaultStudents);
        for (const st of defaultStudents) {
          syncAccountToSupabase(st.id, st.name, st.balance, st.username, st.password, st.accountNumber, st.role, st.level).catch(() => {});
        }
      }

      db.users = restoredUsers;

      // Reconstruct db.transfers from "movimientos"
      const outMovs = resMov.rows.filter(r => r.tipo === 'TRANSFER_OUT');
      const inMovs = resMov.rows.filter(r => r.tipo === 'TRANSFER_IN');

      const restoredTransfers: Transfer[] = [];
      const processedInIds = new Set<string>();

      for (const outRow of outMovs) {
        const txId = String(outRow.id).replace(/-out$/, '');
        const sender = db.users.find(u => u.id === outRow.cuenta_id);
        const matchingIn = inMovs.find(inRow => 
          String(inRow.id) === txId + '-in' || 
          (inRow.concepto === outRow.concepto && Number(inRow.importe) === Number(outRow.importe) && Math.abs(new Date(inRow.fecha).getTime() - new Date(outRow.fecha).getTime()) < 5000)
        );
        if (matchingIn) processedInIds.add(matchingIn.id);
        const receiver = matchingIn ? db.users.find(u => u.id === matchingIn.cuenta_id) : undefined;

        const senderId = outRow.sender_id || (sender ? sender.id : outRow.cuenta_id);
        const senderName = outRow.sender_name || (sender ? sender.name : (outRow.cuenta_id || 'Alumno'));
        const senderAccount = outRow.sender_account || (sender ? sender.accountNumber : 'ES000000000000000000');

        const receiverId = outRow.receiver_id || (matchingIn ? (matchingIn.receiver_id || matchingIn.cuenta_id) : (receiver ? receiver.id : 'corp-1'));
        const receiverName = outRow.receiver_name || (matchingIn ? matchingIn.receiver_name : (receiver ? receiver.name : 'Inmobiliaria / Entidad Mercantil'));
        const receiverAccount = outRow.receiver_account || (matchingIn ? matchingIn.receiver_account : (receiver ? receiver.accountNumber : 'ES210001000299887711'));

        restoredTransfers.push({
          id: txId,
          senderId,
          senderName,
          senderAccount,
          receiverId,
          receiverName,
          receiverAccount,
          amount: Number(outRow.importe),
          concept: outRow.concepto || 'Transferencia',
          timestamp: new Date(outRow.fecha).toISOString()
        });
      }

      for (const inRow of inMovs) {
        if (processedInIds.has(inRow.id)) continue;
        const txId = String(inRow.id).replace(/-in$/, '');
        const receiver = db.users.find(u => u.id === inRow.cuenta_id);
        const sender = db.users.find(u => u.id === inRow.sender_id);

        restoredTransfers.push({
          id: txId,
          senderId: inRow.sender_id || (sender ? sender.id : 'corp-banco-central'),
          senderName: inRow.sender_name || (sender ? sender.name : 'Banco Central Hipotecario S.A.'),
          senderAccount: inRow.sender_account || (sender ? sender.accountNumber : 'ES210001000299887700'),
          receiverId: inRow.receiver_id || inRow.cuenta_id,
          receiverName: inRow.receiver_name || (receiver ? receiver.name : (inRow.cuenta_id || 'Alumno')),
          receiverAccount: inRow.receiver_account || (receiver ? receiver.accountNumber : 'ES000000000000000000'),
          amount: Number(inRow.importe),
          concept: inRow.concepto || 'Transferencia',
          timestamp: new Date(inRow.fecha).toISOString()
        });
      }

      if (restoredTransfers.length > 0) {
        const seenTxIds = new Set<string>();
        const uniqueTransfers: Transfer[] = [];
        for (const tr of restoredTransfers) {
          if (!seenTxIds.has(tr.id)) {
            seenTxIds.add(tr.id);
            uniqueTransfers.push(tr);
          }
        }
        db.transfers = uniqueTransfers;
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

      // Reconstruct db.paymentObligations from Supabase "obligaciones_pago" (excluding promissory notes/pagarés which are manual student transfers)
      if (resObl.rows.length > 0) {
        db.paymentObligations = resObl.rows
          .filter(row => String(row.tipo) !== 'pagare' && !String(row.adquisicion_id || '').startsWith('promissory_'))
          .map(row => ({
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
            imageUrl: '/images/machinery/maquinaria_cnc.jpg',
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
            requiredStaff: Number(row.personal_requerido || 2),
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
        db.jobListings = resJobs.rows.map((row: any) => {
          const t = String(row.titulo || '').toLowerCase();
          const roleVal = row.puesto || row.rol || (t.includes('mozo') || t.includes('almacen') || t.includes('almacén') ? 'mozo_almacen' : t.includes('camionero') ? 'camionero' : t.includes('carretillero') ? 'carretillero' : 'operario');
          return {
            id: String(row.id),
            title: String(row.titulo),
            role: roleVal as any,
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
          };
        });
      }

      // Reconstruct db.hiredEmployees from Supabase "empleados_contratados"
      if (resEmployees.rows.length > 0) {
        db.hiredEmployees = resEmployees.rows.map((row: any) => ({
          id: String(row.id),
          jobListingId: String(row.oferta_id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          employeeName: String(row.nombre_empleado),
          role: (row.puesto || row.rol || 'operario') as any,
          gender: row.genero as 'hombre' | 'mujer',
          grossSalaryMonthly: Number(row.sueldo_bruto_mensual),
          age: Number(row.edad),
          hireDate: new Date(row.fecha_contratacion).toISOString(),
          assignedMachineryId: row.maquinaria_asignada_id ? String(row.maquinaria_asignada_id) : undefined,
          assignedMachineryTitle: row.maquinaria_asignada_titulo ? String(row.maquinaria_asignada_titulo) : undefined,
          assignedVehicleId: row.vehiculo_asignado_id ? String(row.vehiculo_asignado_id) : undefined,
          assignedVehicleTitle: row.vehiculo_asignado_titulo ? String(row.vehiculo_asignado_titulo) : undefined,
          assignedWarehouseIndex: row.almacen_asignado_index !== null && row.almacen_asignado_index !== undefined ? Number(row.almacen_asignado_index) : undefined,
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
          propertyId: row.inmueble_id ? String(row.inmueble_id) : undefined,
          propertyTitle: row.titulo_inmueble ? String(row.titulo_inmueble) : undefined,
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
          acquisitionId: row.adquisicion_id ? String(row.adquisicion_id) : String(row.inmueble_id),
          propertyTitle: row.titulo_inmueble ? String(row.titulo_inmueble) : '',
          studentId: String(row.alumno_id),
          machineryZoneM2: Number(row.zona_maquinaria_m2 || 0),
          storageZoneM2: Number(row.zona_almacen_m2 || 0),
          rawMaterialsStorageM2: row.almacen_materias_primas_m2 !== null && row.almacen_materias_primas_m2 !== undefined ? Number(row.almacen_materias_primas_m2) : 30,
          semiFinishedStorageM2: row.almacen_semiterminados_m2 !== null && row.almacen_semiterminados_m2 !== undefined ? Number(row.almacen_semiterminados_m2) : 5,
          finishedGoodsStorageM2: row.almacen_terminados_m2 !== null && row.almacen_terminados_m2 !== undefined ? Number(row.almacen_terminados_m2) : 30,
          adminZoneM2: Number(row.zona_admin_m2 || 0),
          freeZoneM2: Number(row.zona_libre_m2 || 0),
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
          paymentMethod: row.metodo_pago ? String(row.metodo_pago) : 'Transferencia bancaria directa'
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

      // Reconstruct db.purchasedVehicles from Supabase "vehiculos_comprados"
      if (resVehicles.rows.length > 0) {
        db.purchasedVehicles = resVehicles.rows.map((row: any) => ({
          id: String(row.id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          vehicleType: String(row.vehiculo_tipo) as any,
          title: String(row.titulo),
          basePrice: Number(row.precio_base),
          ivaAmount: Number(row.importe_iva),
          totalPrice: Number(row.precio_total),
          paymentMethod: String(row.metodo_pago) as any,
          purchaseDate: new Date(row.fecha_compra).toISOString(),
          assignedDriverId: row.conductor_asignado_id ? String(row.conductor_asignado_id) : undefined,
          assignedDriverName: row.conductor_asignado_nombre ? String(row.conductor_asignado_nombre) : undefined,
          assignedShift: row.turno_asignado ? Number(row.turno_asignado) : undefined,
          assignedWarehouseIndex: row.almacen_asignado_index !== null && row.almacen_asignado_index !== undefined ? Number(row.almacen_asignado_index) : undefined,
          assignedPropertyId: row.propiedad_asignada_id ? String(row.propiedad_asignada_id) : undefined,
          assignedPropertyTitle: row.propiedad_asignada_titulo ? String(row.propiedad_asignada_titulo) : undefined,
          assignedWarehouseName: row.almacen_asignado_nombre ? String(row.almacen_asignado_nombre) : undefined,
          status: String(row.estado) as 'activo' | 'mantenimiento',
          imageUrl: row.imagen_url ? String(row.imagen_url) : (row.vehiculo_tipo === 'camion_trailer' ? '/images/vehicles/camion_trailer.jpg' : row.vehiculo_tipo === 'coche_empresa' ? '/images/vehicles/coche_empresa.jpg' : '/images/vehicles/carretilla_elevadora.jpg')
        }));
      }

      // Reconstruct db.rawMaterialInventories from Supabase "materias_primas_inventario"
      if (resRawInventories.rows.length > 0) {
        db.rawMaterialInventories = resRawInventories.rows.map((row: any) => {
          let starRods = row.varillas_punta_estrella !== undefined && row.varillas_punta_estrella !== null ? Number(row.varillas_punta_estrella) : Number(row.varillas_hierro_punta || 0);
          let flatRods = row.varillas_punta_plana !== undefined && row.varillas_punta_plana !== null ? Number(row.varillas_punta_plana) : Number(row.varillas_metal_punta || 0);
          const totalRods = Number(row.varillas_punta || (starRods + flatRods));
          if (starRods === 0 && flatRods === 0 && totalRods > 0) {
            starRods = totalRods;
          }

          let starScrewdrivers = row.destornilladores_punta_estrella !== undefined && row.destornilladores_punta_estrella !== null ? Number(row.destornilladores_punta_estrella) : Number(row.destornilladores_hierro || 0);
          let flatScrewdrivers = row.destornilladores_punta_plana !== undefined && row.destornilladores_punta_plana !== null ? Number(row.destornilladores_punta_plana) : Number(row.destornilladores_metal || 0);
          const totalScrewdrivers = Number(row.productos_ensamblados || (starScrewdrivers + flatScrewdrivers));
          if (starScrewdrivers === 0 && flatScrewdrivers === 0 && totalScrewdrivers > 0) {
            starScrewdrivers = totalScrewdrivers;
          }

          let naveInventories: any = undefined;
          if (row.desglose_almacenes) {
            try {
              naveInventories = typeof row.desglose_almacenes === 'string' ? JSON.parse(row.desglose_almacenes) : row.desglose_almacenes;
            } catch (e) {
              console.error('[Supabase DB] Error parsing desglose_almacenes:', e);
            }
          }

          return {
            studentId: String(row.alumno_id),
            ironKg: Number(row.fragmentos_hierro_kg || 0),
            metalKg: Number(row.fragmentos_metal_kg || 0),
            plasticKg: Number(row.pellets_plastico_kg || 0),
            epoxiKg: Number(row.pegamento_epoxi_kg || 0),
            rodProductionMode: row.rod_production_mode || null,
            producedRodsUnits: totalRods,
            producedStarRodsUnits: starRods,
            producedFlatRodsUnits: flatRods,
            producedIronRodsUnits: starRods,
            producedMetalRodsUnits: flatRods,
            producedScrewdriversUnits: totalScrewdrivers,
            starScrewdriversUnits: starScrewdrivers,
            flatScrewdriversUnits: flatScrewdrivers,
            ironScrewdriversUnits: starScrewdrivers,
            metalScrewdriversUnits: flatScrewdrivers,
            line1PendingHours: Number(row.line1_pending_hours || 0),
            line2PendingHours: Number(row.line2_pending_hours || 0),
            naveInventories: naveInventories || undefined,
            lastCalculatedAt: row.ultima_calculada ? new Date(row.ultima_calculada).toISOString() : new Date().toISOString(),
            updatedAt: row.fecha_actualizacion ? new Date(row.fecha_actualizacion).toISOString() : new Date().toISOString()
          };
        });
      }

      // Reconstruct db.rawMaterialOrders from Supabase "materias_primas_pedidos"
      if (resRawOrders.rows.length > 0) {
        db.rawMaterialOrders = resRawOrders.rows.map((row: any) => ({
          id: String(row.id),
          studentId: String(row.alumno_id),
          studentName: String(row.alumno_nombre),
          announcementId: String(row.announcement_id),
          materialType: String(row.materia_tipo) as any,
          materialTitle: String(row.materia_titulo),
          quantity: Number(row.cantidad),
          unitWeightKg: Number(row.peso_unitario_kg),
          totalKg: Number(row.peso_total_kg),
          basePrice: Number(row.precio_base),
          ivaAmount: Number(row.importe_iva),
          transportCost: Number(row.coste_transporte),
          totalAmount: Number(row.importe_total),
          needsTransport: Boolean(row.necesita_transporte),
          deliveryAddress: String(row.direccion_entrega || ''),
          pickupVehicleId: row.vehiculo_recogida_id ? String(row.vehiculo_recogida_id) : undefined,
          status: String(row.estado) as any,
          requestedAt: row.fecha_pedido ? new Date(row.fecha_pedido).toISOString() : new Date().toISOString(),
          approvedAt: row.fecha_aprobado ? new Date(row.fecha_aprobado).toISOString() : undefined,
          shippedAt: row.shipped_at ? new Date(row.shipped_at).toISOString() : undefined,
          estimatedDeliveryAt: row.fecha_estimada_entrega ? new Date(row.fecha_estimada_entrega).toISOString() : undefined,
          deliveredAt: row.fecha_entrega ? new Date(row.fecha_entrega).toISOString() : undefined,
          invoicedAt: row.invoiced_at ? new Date(row.invoiced_at).toISOString() : undefined,
          invoiceNumber: row.invoice_number ? String(row.invoice_number) : undefined,
          items: row.items ? (typeof row.items === 'string' ? JSON.parse(row.items) : row.items) : undefined,
          sellerId: row.seller_id ? String(row.seller_id) : undefined,
          sellerName: row.seller_name ? String(row.seller_name) : undefined,
          sellerLevel: row.seller_level === 'official' ? 'official' : (row.seller_level ? Number(row.seller_level) : undefined),
          buyerLevel: row.buyer_level ? Number(row.buyer_level) : undefined,
          discountPercentage: row.discount_percentage ? Number(row.discount_percentage) : 0,
          insuranceFee: row.insurance_fee ? Number(row.insurance_fee) : 0,
          transportMethod: row.transport_method ? String(row.transport_method) as any : 'vendedor_envio',
          lastTurnUserId: row.last_turn_user_id ? String(row.last_turn_user_id) : undefined,
          negotiationHistory: row.negotiation_history ? (typeof row.negotiation_history === 'string' ? JSON.parse(row.negotiation_history) : row.negotiation_history) : undefined,
          inventoryCredited: row.inventory_credited !== null && row.inventory_credited !== undefined ? Boolean(row.inventory_credited) : (['entregado', 'finalizado', 'facturado'].includes(String(row.estado))),
          destinationNaveId: row.destination_nave_id ? String(row.destination_nave_id) : undefined
        }));
      }

      // Reconstruct db.rawMaterialAnnouncements from Supabase "anuncios_materia_prima"
      if (resRawAnnouncements.rows.length > 0) {
        db.rawMaterialAnnouncements = resRawAnnouncements.rows.map((row: any) => {
          let parsedLevel: number | 'official' | undefined = undefined;
          if (row.seller_level === 'official') {
            parsedLevel = 'official';
          } else if (row.seller_level) {
            const numLevel = Number(row.seller_level);
            if (!isNaN(numLevel)) parsedLevel = numLevel as any;
          }

          let parsedDuration: number | 'indefinido' = 'indefinido';
          if (row.duration_days && row.duration_days !== 'indefinido') {
            const numDur = Number(row.duration_days);
            if (!isNaN(numDur)) parsedDuration = numDur;
          }

          let parsedStock: number | 'ilimitado' = 'ilimitado';
          if (row.stock && row.stock !== 'ilimitado') {
            const numStock = Number(row.stock);
            if (!isNaN(numStock)) parsedStock = numStock;
          }

          let parsedPriceAlert: any = undefined;
          if (row.price_alert) {
            try {
              parsedPriceAlert = typeof row.price_alert === 'string' ? JSON.parse(row.price_alert) : row.price_alert;
            } catch (e) {
              console.warn('[Supabase Parse] price_alert JSON parse error:', e);
            }
          }

          return {
            id: String(row.id),
            materialType: String(row.material_type) as any,
            title: String(row.title),
            presentation: String(row.presentation || 'Pallet'),
            unitWeightKg: Number(row.unit_weight_kg || 1000),
            isPallet: Boolean(row.is_pallet),
            pricePerUnit: Number(row.price_per_unit || 0),
            description: String(row.description || ''),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            durationDays: parsedDuration,
            expirationDate: row.expiration_date ? new Date(row.expiration_date).toISOString() : undefined,
            stock: parsedStock,
            active: Boolean(row.active),
            sellerId: row.seller_id ? String(row.seller_id) : undefined,
            sellerName: row.seller_name ? String(row.seller_name) : undefined,
            sellerLevel: parsedLevel,
            sellerLocation: row.seller_location ? String(row.seller_location) : undefined,
            sellerMunicipality: row.seller_municipality ? String(row.seller_municipality) : undefined,
            sellerProvince: row.seller_province ? String(row.seller_province) : undefined,
            isDesTornillo: Boolean(row.is_des_tornillo),
            priceAlert: parsedPriceAlert
          };
        });
      } else if (db.rawMaterialAnnouncements && db.rawMaterialAnnouncements.length > 0) {
        console.log(`[Supabase Sync] Syncing ${db.rawMaterialAnnouncements.length} local announcements to Supabase...`);
        for (const ann of db.rawMaterialAnnouncements) {
          await syncRawMaterialAnnouncementToSupabase(ann);
        }
      }

      // Reconstruct db.companyProfiles
      if (resProfiles.rows.length > 0) {
        db.companyProfiles = resProfiles.rows.map((row: any) => ({
          id: String(row.id),
          studentId: String(row.student_id),
          companyName: String(row.company_name),
          description: String(row.description || ''),
          logoUrl: row.logo_url ? String(row.logo_url) : undefined,
          level: Number(row.level || 1),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
        }));
      }

      // Reconstruct db.marketContacts
      if (resContacts.rows.length > 0) {
        db.marketContacts = resContacts.rows.map((row: any) => ({
          id: String(row.id),
          userId: String(row.user_id),
          contactId: String(row.contact_id),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
        }));
      }

      // Reconstruct db.marketMessages
      if (resMessages.rows.length > 0) {
        db.marketMessages = resMessages.rows.map((row: any) => {
          const parsedData = row.invoice_data ? (typeof row.invoice_data === 'string' ? JSON.parse(row.invoice_data) : row.invoice_data) : undefined;
          const msgType = String(row.type || 'text');
          return {
            id: String(row.id),
            chatId: String(row.chat_id),
            senderId: String(row.sender_id),
            senderName: String(row.sender_name),
            recipientId: String(row.recipient_id),
            recipientName: String(row.recipient_name),
            content: String(row.content),
            timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
            read: Boolean(row.read),
            type: msgType as any,
            invoiceData: msgType === 'invoice' ? parsedData : undefined,
            promissoryNoteData: msgType === 'promissory_note' ? parsedData : undefined
          };
        });
      }

      // Reconstruct db.courtLawsuits from Supabase "demandas_judiciales"
      if (resLawsuits.rows.length > 0) {
        db.courtLawsuits = resLawsuits.rows.map((row: any) => {
          const atts = row.archivos_adjuntos
            ? (typeof row.archivos_adjuntos === 'string' ? JSON.parse(row.archivos_adjuntos) : row.archivos_adjuntos)
            : [];
          const pnData = row.pagare_datos
            ? (typeof row.pagare_datos === 'string' ? JSON.parse(row.pagare_datos) : row.pagare_datos)
            : undefined;

          return {
            id: String(row.id),
            caseNumber: String(row.numero_autos),
            courtName: String(row.juzgado || 'Juzgado de 1ª Instancia e Instrucción Nº 1'),
            type: String(row.tipo) as any,
            subtype: row.subtipo ? String(row.subtipo) as any : undefined,
            plaintiffId: String(row.demandante_id),
            plaintiffName: String(row.demandante_nombre),
            plaintiffNif: row.demandante_nif ? String(row.demandante_nif) : undefined,
            plaintiffIban: row.demandante_iban ? String(row.demandante_iban) : undefined,
            defendantId: String(row.demandado_id),
            defendantName: String(row.demandado_nombre),
            defendantNif: row.demandado_nif ? String(row.demandado_nif) : undefined,
            defendantIban: row.demandado_iban ? String(row.demandado_iban) : undefined,
            claimedAmount: Number(row.cuantia_reclamada || 0),
            interestAndCostsAmount: Number(row.intereses_costas || 0),
            totalClaimAmount: Number(row.cuantia_total || row.cuantia_reclamada || 0),
            contractDate: row.fecha_contrato ? new Date(row.fecha_contrato).toISOString() : undefined,
            goodsDescription: String(row.descripcion_bienes || ''),
            facts: String(row.hechos || ''),
            legalBasis: String(row.fundamentos_derecho || ''),
            petitum: String(row.petitum || ''),
            evidenceSummary: String(row.resumen_prueba || ''),
            attachments: atts,
            relatedOrderId: row.pedido_relacionado_id ? String(row.pedido_relacionado_id) : undefined,
            promissoryNoteNumber: row.pagare_numero ? String(row.pagare_numero) : undefined,
            promissoryNoteId: row.pagare_id ? String(row.pagare_id) : undefined,
            promissoryNoteDueDate: row.pagare_vencimiento ? new Date(row.pagare_vencimiento).toISOString() : undefined,
            promissoryNoteData: pnData,
            status: String(row.estado) as any,
            createdAt: row.fecha_creacion ? new Date(row.fecha_creacion).toISOString() : new Date().toISOString(),
            updatedAt: row.fecha_actualizacion ? new Date(row.fecha_actualizacion).toISOString() : new Date().toISOString(),
            admissionDate: row.fecha_admision ? new Date(row.fecha_admision).toISOString() : undefined,
            admissionNotes: row.notas_admision ? String(row.notas_admision) : undefined,
            resolutionDate: row.fecha_resolucion ? new Date(row.fecha_resolucion).toISOString() : undefined,
            resolutionNotes: row.notas_resolucion ? String(row.notas_resolucion) : undefined,
            judgeComments: row.comentarios_juez ? String(row.comentarios_juez) : undefined,
            executionTransferId: row.transferencia_ejecucion_id ? String(row.transferencia_ejecucion_id) : undefined,
            lawyerFeeAmount: row.minuta_abogado ? Number(row.minuta_abogado) : undefined,
            lawyerFeeIva: row.minuta_iva ? Number(row.minuta_iva) : undefined,
            lawyerFeeTotal: row.minuta_total ? Number(row.minuta_total) : undefined,
            lawyerFeeInvoiceNumber: row.minuta_factura_num ? String(row.minuta_factura_num) : undefined,
            embargoDate: row.embargo_fecha ? new Date(row.embargo_fecha).toISOString() : undefined,
            embargoAmount: row.embargo_importe ? Number(row.embargo_importe) : undefined,
            embargoTransferId: row.embargo_transfer_id ? String(row.embargo_transfer_id) : undefined,
            embargoNotes: row.embargo_notas ? String(row.embargo_notas) : undefined,
            defendantAnswered: Boolean(row.contestacion_realizada),
            defendantAnswerDate: row.contestacion_fecha ? new Date(row.contestacion_fecha).toISOString() : undefined,
            defendantAnswerType: row.contestacion_tipo ? String(row.contestacion_tipo) as any : undefined,
            defendantAnswerFacts: row.contestacion_hechos ? String(row.contestacion_hechos) : undefined,
            defendantAnswerAttachments: row.contestacion_adjuntos
              ? (typeof row.contestacion_adjuntos === 'string' ? JSON.parse(row.contestacion_adjuntos) : row.contestacion_adjuntos)
              : undefined,
            defendantDeadlineDate: row.plazo_limite_contestacion ? new Date(row.plazo_limite_contestacion).toISOString() : undefined,
            defendantLawyerFeeAmount: row.minuta_demandado_base ? Number(row.minuta_demandado_base) : undefined,
            defendantLawyerFeeIva: row.minuta_demandado_iva ? Number(row.minuta_demandado_iva) : undefined,
            defendantLawyerFeeTotal: row.minuta_demandado_total ? Number(row.minuta_demandado_total) : undefined,
            defendantLawyerFeeInvoiceNumber: row.minuta_demandado_factura_num ? String(row.minuta_demandado_factura_num) : undefined
          };
        });
      } else if (db.courtLawsuits && db.courtLawsuits.length > 0) {
        for (const lawsuit of db.courtLawsuits) {
          await syncCourtLawsuitToSupabase(lawsuit);
        }
      }

      // Reconstruct db.notifications from Supabase "notificaciones"
      if (resNotif.rows.length > 0) {
        db.notifications = resNotif.rows.map((row: any) => ({
          id: String(row.id),
          userId: String(row.user_id),
          title: String(row.title),
          message: String(row.message),
          type: String(row.type) as any,
          read: Boolean(row.read),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          relatedOrderId: row.related_order_id ? String(row.related_order_id) : undefined,
          relatedAnnouncementId: row.related_announcement_id ? String(row.related_announcement_id) : undefined
        }));
      } else if (db.notifications && db.notifications.length > 0) {
        for (const notif of db.notifications) {
          await syncNotificationToSupabase(notif);
        }
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

// Middleware to parse JSON and URL-encoded bodies with large payload support (e.g., PDF court attachments)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

async function syncNotificationToSupabase(notif: AppNotification) {
  if (!dbPool) return;
  try {
    await safeDbQuery(
      `INSERT INTO notificaciones (id, user_id, title, message, type, read, created_at, related_order_id, related_announcement_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET read = EXCLUDED.read`,
      [
        notif.id,
        notif.userId,
        notif.title,
        notif.message,
        notif.type,
        notif.read,
        new Date(notif.createdAt),
        notif.relatedOrderId || null,
        notif.relatedAnnouncementId || null
      ]
    );
  } catch (e) {
    console.error('[Supabase DB] Error syncing notification to Supabase:', e);
  }
}

function addNotification(
  db: DatabaseSchema,
  userId: string,
  title: string,
  message: string,
  type: AppNotification['type'],
  relatedOrderId?: string,
  relatedAnnouncementId?: string
) {
  if (!db.notifications) db.notifications = [];
  const notif: AppNotification = {
    id: generateId('notif'),
    userId,
    title,
    message,
    type,
    read: false,
    createdAt: new Date().toISOString(),
    relatedOrderId,
    relatedAnnouncementId
  };
  db.notifications.unshift(notif);
  syncNotificationToSupabase(notif).catch(e => console.error(e));
  return notif;
}

function getDefaultSeedRawMaterialAnnouncements(): RawMaterialAnnouncement[] {
  return [
    {
      id: 'rm-hierro',
      materialType: 'hierro',
      title: 'Fragmentos de hierro',
      presentation: 'Pallet de 1.000 kg (Fragmentos)',
      unitWeightKg: 1000,
      isPallet: true,
      pricePerUnit: 450,
      description: 'Materia prima metálica de alta calidad para producción en línea de varilla y punta. Presentación en palet de 1.000 kg.',
      updatedAt: new Date().toISOString(),
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Suministros Industriales S.A.',
      sellerLevel: 'official'
    },
    {
      id: 'rm-plastico',
      materialType: 'plastico',
      title: 'Pellets de plástico',
      presentation: 'Pallet de 1.000 kg (40 sacos de 25 kg)',
      unitWeightKg: 1000,
      isPallet: true,
      pricePerUnit: 380,
      description: 'Polímero plástico en pellets para inyección de mangos. 40 sacos de 25 kg por palet (total 1.000 kg).',
      updatedAt: new Date().toISOString(),
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Suministros Industriales S.A.',
      sellerLevel: 'official'
    },
    {
      id: 'rm-epoxi',
      materialType: 'epoxi',
      title: 'Pegamento epoxi',
      presentation: 'Lata de 5 kg',
      unitWeightKg: 5,
      isPallet: false,
      pricePerUnit: 45,
      description: 'Resina y pegamento epoxi bicomponente de grado industrial para ensamblaje final. Lata de 5 kg.',
      updatedAt: new Date().toISOString(),
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Suministros Industriales S.A.',
      sellerLevel: 'official'
    },
    {
      id: 'rm-des-tornillo-01',
      materialType: 'producto_final',
      title: 'Destornilladores M3 con Mango Ergonómico',
      presentation: 'Caja de 50 unidades',
      unitWeightKg: 0,
      isPallet: false,
      pricePerUnit: 120,
      description: 'Anuncio de prueba publicado por Alumno de Nivel 3.',
      updatedAt: new Date().toISOString(),
      sellerId: 'alumno-nivel-3-demo',
      sellerName: 'Industrias Metalúrgicas N3, S.L.',
      sellerLevel: 3,
      isDesTornillo: true,
      stock: 50,
      active: true
    }
  ];
}

function recalculateTotalInventory(inv: any) {
  if (!inv.naveInventories) return;
  let totalIron = 0, totalMetal = 0, totalPlastic = 0, totalEpoxi = 0;
  let totalStarRods = 0, totalFlatRods = 0, totalStarScrewdrivers = 0, totalFlatScrewdrivers = 0;

  for (const nInv of Object.values(inv.naveInventories) as any[]) {
    totalIron += (nInv.ironKg || 0);
    totalMetal += (nInv.metalKg || 0);
    totalPlastic += (nInv.plasticKg || 0);
    totalEpoxi += (nInv.epoxiKg || 0);
    totalStarRods += (nInv.producedStarRodsUnits || 0);
    totalFlatRods += (nInv.producedFlatRodsUnits || 0);
    totalStarScrewdrivers += (nInv.starScrewdriversUnits || nInv.ironScrewdriversUnits || 0);
    totalFlatScrewdrivers += (nInv.flatScrewdriversUnits || nInv.metalScrewdriversUnits || 0);
  }

  inv.ironKg = Math.round(totalIron * 1000) / 1000;
  inv.metalKg = Math.round(totalMetal * 1000) / 1000;
  inv.plasticKg = Math.round(totalPlastic * 1000) / 1000;
  inv.epoxiKg = Math.round(totalEpoxi * 1000) / 1000;
  inv.producedStarRodsUnits = totalStarRods;
  inv.producedFlatRodsUnits = totalFlatRods;
  inv.producedIronRodsUnits = totalStarRods;
  inv.producedMetalRodsUnits = totalFlatRods;
  inv.producedRodsUnits = totalStarRods + totalFlatRods;

  inv.starScrewdriversUnits = totalStarScrewdrivers;
  inv.flatScrewdriversUnits = totalFlatScrewdrivers;
  inv.ironScrewdriversUnits = totalStarScrewdrivers;
  inv.metalScrewdriversUnits = totalFlatScrewdrivers;
  inv.producedScrewdriversUnits = totalStarScrewdrivers + totalFlatScrewdrivers;
}

function deductRodsFromSellerInv(sellerInv: any, qtyToDeduct: number, title?: string) {
  if (!sellerInv) return;
  const isPlana = title ? (title.toLowerCase().includes('plana') || title.toLowerCase().includes('metal')) : false;
  const isEstrella = title ? (title.toLowerCase().includes('estrella') || title.toLowerCase().includes('hierro')) : false;

  if (!sellerInv.naveInventories || Object.keys(sellerInv.naveInventories).length === 0) {
    sellerInv.producedRodsUnits = Math.max(0, (sellerInv.producedRodsUnits || 0) - qtyToDeduct);
    if (isPlana) {
      sellerInv.producedFlatRodsUnits = Math.max(0, (sellerInv.producedFlatRodsUnits || sellerInv.producedMetalRodsUnits || 0) - qtyToDeduct);
      sellerInv.producedMetalRodsUnits = sellerInv.producedFlatRodsUnits;
    } else if (isEstrella) {
      sellerInv.producedStarRodsUnits = Math.max(0, (sellerInv.producedStarRodsUnits || sellerInv.producedIronRodsUnits || 0) - qtyToDeduct);
      sellerInv.producedIronRodsUnits = sellerInv.producedStarRodsUnits;
    } else {
      let starAvail = sellerInv.producedStarRodsUnits || sellerInv.producedIronRodsUnits || 0;
      let takeStar = Math.min(qtyToDeduct, starAvail);
      sellerInv.producedStarRodsUnits = starAvail - takeStar;
      sellerInv.producedIronRodsUnits = sellerInv.producedStarRodsUnits;
      let remaining = qtyToDeduct - takeStar;
      if (remaining > 0) {
        let flatAvail = sellerInv.producedFlatRodsUnits || sellerInv.producedMetalRodsUnits || 0;
        sellerInv.producedFlatRodsUnits = Math.max(0, flatAvail - remaining);
        sellerInv.producedMetalRodsUnits = sellerInv.producedFlatRodsUnits;
      }
    }
    return;
  }

  let remaining = qtyToDeduct;
  for (const naveKey of Object.keys(sellerInv.naveInventories)) {
    if (remaining <= 0) break;
    const nInv = sellerInv.naveInventories[naveKey];
    if (!nInv) continue;

    if (isPlana) {
      const avail = nInv.producedFlatRodsUnits || nInv.producedMetalRodsUnits || 0;
      const take = Math.min(remaining, avail);
      if (take > 0) {
        nInv.producedFlatRodsUnits = avail - take;
        nInv.producedMetalRodsUnits = nInv.producedFlatRodsUnits;
        nInv.producedRodsUnits = Math.max(0, (nInv.producedRodsUnits || 0) - take);
        remaining -= take;
      }
    } else if (isEstrella) {
      const avail = nInv.producedStarRodsUnits || nInv.producedIronRodsUnits || 0;
      const take = Math.min(remaining, avail);
      if (take > 0) {
        nInv.producedStarRodsUnits = avail - take;
        nInv.producedIronRodsUnits = nInv.producedStarRodsUnits;
        nInv.producedRodsUnits = Math.max(0, (nInv.producedRodsUnits || 0) - take);
        remaining -= take;
      }
    } else {
      let starAvail = nInv.producedStarRodsUnits || nInv.producedIronRodsUnits || 0;
      let takeStar = Math.min(remaining, starAvail);
      if (takeStar > 0) {
        nInv.producedStarRodsUnits = starAvail - takeStar;
        nInv.producedIronRodsUnits = nInv.producedStarRodsUnits;
        nInv.producedRodsUnits = Math.max(0, (nInv.producedRodsUnits || 0) - takeStar);
        remaining -= takeStar;
      }
      if (remaining > 0) {
        let flatAvail = nInv.producedFlatRodsUnits || nInv.producedMetalRodsUnits || 0;
        let takeFlat = Math.min(remaining, flatAvail);
        if (takeFlat > 0) {
          nInv.producedFlatRodsUnits = flatAvail - takeFlat;
          nInv.producedMetalRodsUnits = nInv.producedFlatRodsUnits;
          nInv.producedRodsUnits = Math.max(0, (nInv.producedRodsUnits || 0) - takeFlat);
          remaining -= takeFlat;
        }
      }
    }
  }

  if (remaining > 0) {
    const firstKey = Object.keys(sellerInv.naveInventories)[0];
    const nInv = sellerInv.naveInventories[firstKey];
    if (nInv) {
      if (isPlana) {
        nInv.producedFlatRodsUnits = Math.max(0, (nInv.producedFlatRodsUnits || 0) - remaining);
        nInv.producedMetalRodsUnits = nInv.producedFlatRodsUnits;
      } else if (isEstrella) {
        nInv.producedStarRodsUnits = Math.max(0, (nInv.producedStarRodsUnits || 0) - remaining);
        nInv.producedIronRodsUnits = nInv.producedStarRodsUnits;
      } else {
        nInv.producedStarRodsUnits = Math.max(0, (nInv.producedStarRodsUnits || 0) - remaining);
        nInv.producedIronRodsUnits = nInv.producedStarRodsUnits;
      }
      nInv.producedRodsUnits = Math.max(0, (nInv.producedRodsUnits || 0) - remaining);
    }
  }

  recalculateTotalInventory(sellerInv);
}

function deductScrewdriversFromSellerInv(sellerInv: any, qtyToDeduct: number, title?: string) {
  if (!sellerInv) return;
  if (!sellerInv.naveInventories || Object.keys(sellerInv.naveInventories).length === 0) {
    if ((sellerInv.starScrewdriversUnits || 0) + (sellerInv.flatScrewdriversUnits || 0) < (sellerInv.producedScrewdriversUnits || 0)) {
      const diff = (sellerInv.producedScrewdriversUnits || 0) - ((sellerInv.starScrewdriversUnits || 0) + (sellerInv.flatScrewdriversUnits || 0));
      sellerInv.starScrewdriversUnits = (sellerInv.starScrewdriversUnits || 0) + Math.ceil(diff / 2);
      sellerInv.flatScrewdriversUnits = (sellerInv.flatScrewdriversUnits || 0) + Math.floor(diff / 2);
      sellerInv.ironScrewdriversUnits = sellerInv.starScrewdriversUnits;
      sellerInv.metalScrewdriversUnits = sellerInv.flatScrewdriversUnits;
    }
    sellerInv.producedScrewdriversUnits = Math.max(0, (sellerInv.producedScrewdriversUnits || 0) - qtyToDeduct);
    const isPlana = title ? title.toLowerCase().includes('plana') : false;
    const isEstrella = title ? title.toLowerCase().includes('estrella') : false;
    if (isPlana) {
      sellerInv.flatScrewdriversUnits = Math.max(0, (sellerInv.flatScrewdriversUnits || sellerInv.metalScrewdriversUnits || 0) - qtyToDeduct);
      sellerInv.metalScrewdriversUnits = sellerInv.flatScrewdriversUnits;
    } else if (isEstrella) {
      sellerInv.starScrewdriversUnits = Math.max(0, (sellerInv.starScrewdriversUnits || sellerInv.ironScrewdriversUnits || 0) - qtyToDeduct);
      sellerInv.ironScrewdriversUnits = sellerInv.starScrewdriversUnits;
    } else {
      let starAvail = sellerInv.starScrewdriversUnits || sellerInv.ironScrewdriversUnits || 0;
      let takeStar = Math.min(qtyToDeduct, starAvail);
      sellerInv.starScrewdriversUnits = starAvail - takeStar;
      sellerInv.ironScrewdriversUnits = sellerInv.starScrewdriversUnits;
      let remaining = qtyToDeduct - takeStar;
      if (remaining > 0) {
        let flatAvail = sellerInv.flatScrewdriversUnits || sellerInv.metalScrewdriversUnits || 0;
        sellerInv.flatScrewdriversUnits = Math.max(0, flatAvail - remaining);
        sellerInv.metalScrewdriversUnits = sellerInv.flatScrewdriversUnits;
      }
    }
    return;
  }

  // Ensure star + flat in each nave matches producedScrewdriversUnits if needed
  for (const naveKey of Object.keys(sellerInv.naveInventories)) {
    const nInv = sellerInv.naveInventories[naveKey];
    if (!nInv) continue;
    const currentTotal = (nInv.starScrewdriversUnits || 0) + (nInv.flatScrewdriversUnits || 0);
    if ((nInv.producedScrewdriversUnits || 0) > currentTotal) {
      const diff = (nInv.producedScrewdriversUnits || 0) - currentTotal;
      nInv.starScrewdriversUnits = (nInv.starScrewdriversUnits || 0) + Math.ceil(diff / 2);
      nInv.flatScrewdriversUnits = (nInv.flatScrewdriversUnits || 0) + Math.floor(diff / 2);
      nInv.ironScrewdriversUnits = nInv.starScrewdriversUnits;
      nInv.metalScrewdriversUnits = nInv.flatScrewdriversUnits;
    }
  }

  const isPlana = title ? title.toLowerCase().includes('plana') : false;
  const isEstrella = title ? title.toLowerCase().includes('estrella') : false;
  let remaining = qtyToDeduct;

  for (const naveKey of Object.keys(sellerInv.naveInventories)) {
    if (remaining <= 0) break;
    const nInv = sellerInv.naveInventories[naveKey];
    if (!nInv) continue;

    if (isPlana) {
      const avail = nInv.flatScrewdriversUnits || nInv.metalScrewdriversUnits || 0;
      const take = Math.min(remaining, avail);
      if (take > 0) {
        nInv.flatScrewdriversUnits = avail - take;
        nInv.metalScrewdriversUnits = nInv.flatScrewdriversUnits;
        nInv.producedScrewdriversUnits = Math.max(0, (nInv.producedScrewdriversUnits || 0) - take);
        remaining -= take;
      }
    } else if (isEstrella) {
      const avail = nInv.starScrewdriversUnits || nInv.ironScrewdriversUnits || 0;
      const take = Math.min(remaining, avail);
      if (take > 0) {
        nInv.starScrewdriversUnits = avail - take;
        nInv.ironScrewdriversUnits = nInv.starScrewdriversUnits;
        nInv.producedScrewdriversUnits = Math.max(0, (nInv.producedScrewdriversUnits || 0) - take);
        remaining -= take;
      }
    } else {
      let starAvail = nInv.starScrewdriversUnits || nInv.ironScrewdriversUnits || 0;
      let takeStar = Math.min(remaining, starAvail);
      if (takeStar > 0) {
        nInv.starScrewdriversUnits = starAvail - takeStar;
        nInv.ironScrewdriversUnits = nInv.starScrewdriversUnits;
        nInv.producedScrewdriversUnits = Math.max(0, (nInv.producedScrewdriversUnits || 0) - takeStar);
        remaining -= takeStar;
      }
      if (remaining > 0) {
        let flatAvail = nInv.flatScrewdriversUnits || nInv.metalScrewdriversUnits || 0;
        let takeFlat = Math.min(remaining, flatAvail);
        if (takeFlat > 0) {
          nInv.flatScrewdriversUnits = flatAvail - takeFlat;
          nInv.metalScrewdriversUnits = nInv.flatScrewdriversUnits;
          nInv.producedScrewdriversUnits = Math.max(0, (nInv.producedScrewdriversUnits || 0) - takeFlat);
          remaining -= takeFlat;
        }
      }
    }
  }

  if (remaining > 0) {
    const firstKey = Object.keys(sellerInv.naveInventories)[0];
    const nInv = sellerInv.naveInventories[firstKey];
    if (nInv) {
      if (isPlana) {
        nInv.flatScrewdriversUnits = Math.max(0, (nInv.flatScrewdriversUnits || 0) - remaining);
        nInv.metalScrewdriversUnits = nInv.flatScrewdriversUnits;
      } else if (isEstrella) {
        nInv.starScrewdriversUnits = Math.max(0, (nInv.starScrewdriversUnits || 0) - remaining);
        nInv.ironScrewdriversUnits = nInv.starScrewdriversUnits;
      } else {
        nInv.starScrewdriversUnits = Math.max(0, (nInv.starScrewdriversUnits || 0) - remaining);
        nInv.ironScrewdriversUnits = nInv.starScrewdriversUnits;
      }
      nInv.producedScrewdriversUnits = Math.max(0, (nInv.producedScrewdriversUnits || 0) - remaining);
    }
  }

  recalculateTotalInventory(sellerInv);
}

function deductRawMaterialFromSellerInv(sellerInv: any, materialType: string, totalKg: number) {
  if (!sellerInv) return;
  if (!sellerInv.naveInventories || Object.keys(sellerInv.naveInventories).length === 0) {
    if (materialType === 'hierro') sellerInv.ironKg = Math.max(0, Math.round(((sellerInv.ironKg || 0) - totalKg) * 1000) / 1000);
    else if (materialType === 'metal') sellerInv.metalKg = Math.max(0, Math.round(((sellerInv.metalKg || 0) - totalKg) * 1000) / 1000);
    else if (materialType === 'plastico') sellerInv.plasticKg = Math.max(0, Math.round(((sellerInv.plasticKg || 0) - totalKg) * 1000) / 1000);
    else if (materialType === 'epoxi') sellerInv.epoxiKg = Math.max(0, Math.round(((sellerInv.epoxiKg || 0) - totalKg) * 1000) / 1000);
    return;
  }

  let remaining = totalKg;
  for (const naveKey of Object.keys(sellerInv.naveInventories)) {
    if (remaining <= 0) break;
    const nInv = sellerInv.naveInventories[naveKey];
    if (!nInv) continue;

    if (materialType === 'hierro') {
      const avail = nInv.ironKg || 0;
      const take = Math.min(remaining, avail);
      nInv.ironKg = Math.max(0, Math.round((avail - take) * 1000) / 1000);
      remaining -= take;
    } else if (materialType === 'metal') {
      const avail = nInv.metalKg || 0;
      const take = Math.min(remaining, avail);
      nInv.metalKg = Math.max(0, Math.round((avail - take) * 1000) / 1000);
      remaining -= take;
    } else if (materialType === 'plastico') {
      const avail = nInv.plasticKg || 0;
      const take = Math.min(remaining, avail);
      nInv.plasticKg = Math.max(0, Math.round((avail - take) * 1000) / 1000);
      remaining -= take;
    } else if (materialType === 'epoxi') {
      const avail = nInv.epoxiKg || 0;
      const take = Math.min(remaining, avail);
      nInv.epoxiKg = Math.max(0, Math.round((avail - take) * 1000) / 1000);
      remaining -= take;
    }
  }

  recalculateTotalInventory(sellerInv);
}

function processStockDeductionForOrder(db: DatabaseSchema, order: any) {
  if (!order) return;
  if (order.stockDeducted) return; // Prevent duplicate deductions
  order.stockDeducted = true;

  const sellerId = order.sellerId;
  const isStudentSeller = sellerId && sellerId !== 'proveedor-materia-prima' && sellerId !== 'profesor-1';

  // 1. Deduct from seller's inventory if seller is a student
  if (isStudentSeller) {
    const sellerInv = checkAndCalculateProduction(db, sellerId);
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        const itemTitle = (item.materialTitle || order.materialTitle || '').toLowerCase();
        if (itemTitle.includes('varilla')) {
          deductRodsFromSellerInv(sellerInv, item.quantity || (item.totalKg ? Math.round(item.totalKg / 0.1) : 0) || 0, item.materialTitle || order.materialTitle);
        } else if (item.materialType === 'producto_final' || itemTitle.includes('destornillador')) {
          deductScrewdriversFromSellerInv(sellerInv, item.quantity || (item.totalKg ? Math.round(item.totalKg / 0.1) : 0) || 0, item.materialTitle || order.materialTitle);
        } else {
          deductRawMaterialFromSellerInv(sellerInv, item.materialType, item.totalKg || item.quantity);
        }
      }
    } else {
      const orderQty = order.quantity || 1;
      const orderTitle = (order.materialTitle || '').toLowerCase();
      if (orderTitle.includes('varilla')) {
        deductRodsFromSellerInv(sellerInv, orderQty || (order.totalKg ? Math.round(order.totalKg / 0.1) : 0) || 0, order.materialTitle);
      } else if (order.materialType === 'producto_final' || orderTitle.includes('destornillador')) {
        deductScrewdriversFromSellerInv(sellerInv, orderQty || (order.totalKg ? Math.round(order.totalKg / 0.1) : 0) || 0, order.materialTitle);
      } else {
        deductRawMaterialFromSellerInv(sellerInv, order.materialType, order.totalKg || orderQty);
      }
    }
    sellerInv.updatedAt = new Date().toISOString();
    const sellerUser = db.users.find(u => u.id === sellerId);
    syncInventoryToSupabase(sellerInv, sellerUser?.name).catch(e => console.error(e));
  }

  // 2. Deduct stock from announcement(s)
  const itemsToDeduct: Array<{ announcementId?: string; materialTitle?: string; quantity: number }> = [];
  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      itemsToDeduct.push({
        announcementId: item.announcementId,
        materialTitle: item.materialTitle,
        quantity: item.quantity
      });
    }
  } else {
    itemsToDeduct.push({
      announcementId: order.announcementId,
      materialTitle: order.materialTitle,
      quantity: order.quantity || 1
    });
  }

  if (db.rawMaterialAnnouncements) {
    for (const item of itemsToDeduct) {
      let ann: any;
      if (item.announcementId) {
        ann = db.rawMaterialAnnouncements.find(a => a.id === item.announcementId);
      }
      if (!ann && item.materialTitle) {
        ann = db.rawMaterialAnnouncements.find(a => a.title === item.materialTitle);
      }

      if (ann) {
        const rawStock = ann.stock;
        if (rawStock !== undefined && rawStock !== null && rawStock !== 'ilimitado') {
          const currentStock = Number(rawStock);
          if (!isNaN(currentStock)) {
            const newStock = Math.max(0, currentStock - item.quantity);
            ann.stock = newStock;
            if (newStock <= 0) {
              ann.active = false;
            }
            ann.updatedAt = new Date().toISOString();
            syncRawMaterialAnnouncementToSupabase(ann).catch(e => console.error(e));
          }
        }
      }
    }
  }
}

function getShiftForSpainHour(hour: number): 1 | 2 | 3 {
  if (hour >= 6 && hour < 14) return 1; // Turno Mañana (06:00 - 14:00)
  if (hour >= 14 && hour < 22) return 2; // Turno Tarde (14:00 - 22:00)
  return 3; // Turno Noche (22:00 - 06:00)
}

function getSpainDayOfWeek(date: Date): number {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Europe/Madrid',
      weekday: 'short'
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const dayStr = formatter.format(date).toLowerCase();
    // 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'
    if (dayStr.startsWith('sun')) return 0;
    if (dayStr.startsWith('mon')) return 1;
    if (dayStr.startsWith('tue')) return 2;
    if (dayStr.startsWith('wed')) return 3;
    if (dayStr.startsWith('thu')) return 4;
    if (dayStr.startsWith('fri')) return 5;
    if (dayStr.startsWith('sat')) return 6;
    return date.getDay();
  } catch (e) {
    return date.getDay();
  }
}

function isSpainWeekend(date: Date): boolean {
  const day = getSpainDayOfWeek(date);
  return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
}

function getSpainHour(date: Date): number {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Europe/Madrid',
      hour: 'numeric',
      hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const hourStr = formatter.format(date);
    return parseInt(hourStr, 10) % 24;
  } catch (e) {
    return date.getHours();
  }
}

function checkAndCalculateProduction(db: DatabaseSchema, studentId: string) {
  if (!db.rawMaterialInventories) db.rawMaterialInventories = [];
  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];

  const now = new Date();

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

  if (!inv.naveInventories) {
    inv.naveInventories = {};
  }

  const studentNaves = (db.acquisitions || []).filter(a =>
    String(a.studentId) === String(studentId) &&
    (['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes(a.propertyType || a.type || '') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacen'))
  );

  const primaryNaveId = studentNaves.length > 0 ? studentNaves[0].id : 'default_nave';

  const getNaveInv = (nId: string) => {
    if (!inv!.naveInventories![nId]) {
      inv!.naveInventories![nId] = {
        ironKg: 0,
        metalKg: 0,
        plasticKg: 0,
        epoxiKg: 0,
        producedRodsUnits: 0,
        producedStarRodsUnits: 0,
        producedFlatRodsUnits: 0,
        producedScrewdriversUnits: 0,
        starScrewdriversUnits: 0,
        flatScrewdriversUnits: 0,
        ironScrewdriversUnits: 0,
        metalScrewdriversUnits: 0
      };
    }
    return inv!.naveInventories![nId];
  };

  if (studentNaves.length > 0) {
    for (const nave of studentNaves) {
      getNaveInv(nave.id);
    }
  } else {
    getNaveInv(primaryNaveId);
  }

  let totalNaveStockSum = 0;
  for (const nI of Object.values(inv.naveInventories) as any[]) {
    totalNaveStockSum += (nI.ironKg || 0) + (nI.metalKg || 0) + (nI.plasticKg || 0) + (nI.epoxiKg || 0) + (nI.producedRodsUnits || 0) + (nI.producedScrewdriversUnits || 0);
  }

  if (totalNaveStockSum === 0 && ((inv.ironKg || 0) + (inv.plasticKg || 0) + (inv.epoxiKg || 0) + (inv.producedRodsUnits || 0) + (inv.producedScrewdriversUnits || 0) > 0)) {
    const pN = getNaveInv(primaryNaveId);
    pN.ironKg = inv.ironKg || 0;
    pN.metalKg = inv.metalKg || 0;
    pN.plasticKg = inv.plasticKg || 0;
    pN.epoxiKg = inv.epoxiKg || 0;
    pN.producedRodsUnits = inv.producedRodsUnits || 0;
    pN.producedStarRodsUnits = (inv as any).producedStarRodsUnits || (inv as any).producedIronRodsUnits || 0;
    pN.producedFlatRodsUnits = (inv as any).producedFlatRodsUnits || (inv as any).producedMetalRodsUnits || 0;
    pN.producedScrewdriversUnits = inv.producedScrewdriversUnits || 0;
    pN.starScrewdriversUnits = (inv as any).starScrewdriversUnits || (inv as any).ironScrewdriversUnits || 0;
    pN.flatScrewdriversUnits = (inv as any).flatScrewdriversUnits || (inv as any).metalScrewdriversUnits || 0;
  }

  // 1. First, calculate production for elapsed time using EXISTING inventory prior to crediting new orders
  const lastTime = new Date(inv.lastCalculatedAt || now);
  const elapsedMs = now.getTime() - lastTime.getTime();
  const hoursElapsed = Math.min(24, Math.max(0, elapsedMs / (1000 * 3600))); // 1 real hour = 1 simulated hour

  if (hoursElapsed > 0.0001) {
    const machinery = (db.machineryAcquisitions || []).filter(m => String(m.studentId) === String(studentId) && m.status !== 'montaje');
    const electricityContracts = (db.electricityContracts || []).filter(e => String(e.studentId) === String(studentId) && e.status === 'active');
    const hasElectricity = electricityContracts.length > 0;

    const ownedForklifts = (db.purchasedVehicles || []).filter(v => String(v.studentId) === String(studentId) && v.vehicleType === 'carretilla_elevadora').length;
    const hiredEmployees = (db.hiredEmployees || []).filter(e => String(e.studentId) === String(studentId));

    const stepMs = Math.min(elapsedMs, 10 * 60 * 1000); // 10 minute steps max
    const numSteps = Math.ceil(elapsedMs / stepMs);
    const stepHours = (elapsedMs / numSteps) / 3600000;

    const navesToProcess = studentNaves.length > 0 ? studentNaves : [{ id: primaryNaveId, propertyTitle: 'Nave industrial' }];

    for (let i = 0; i < numSteps; i++) {
      const stepMidpoint = new Date(lastTime.getTime() + (i + 0.5) * (elapsedMs / numSteps));
      
      // CRITICAL RULE: Machines DO NOT produce on weekends (Saturday & Sunday).
      // Employee shifts are only applicable Monday through Friday inclusive.
      if (isSpainWeekend(stepMidpoint)) {
        continue;
      }

      const spainHour = getSpainHour(stepMidpoint);
      const shift = getShiftForSpainHour(spainHour);

      // Process production for each nave independently using its own warehouse stock!
      for (const naveObj of navesToProcess) {
        const nId = naveObj.id;
        const naveInv = getNaveInv(nId);

        const naveMachinery = machinery.filter(m => {
          const mNaveId = m.installedAtNaveId || m.installedNaveId || m.targetNaveId || primaryNaveId;
          return mNaveId === nId || (navesToProcess.length === 1 && !m.installedAtNaveId && !m.installedNaveId);
        });

        const naveForklifts = (db.purchasedVehicles || []).filter(v =>
          String(v.studentId) === String(studentId) &&
          v.vehicleType === 'carretilla_elevadora' &&
          (
            String(v.assignedPropertyId) === String(nId) ||
            (navesToProcess.length === 1 && (v.assignedWarehouseIndex !== undefined || !v.assignedPropertyId))
          )
        );
        const hasNaveForklift = naveForklifts.length >= 1;

        const opLine1Machines = naveMachinery.filter(m => m.category === 'metal_hierro' && (!m.relocationStatus || m.relocationStatus === 'completed'));
        const opLine2Machines = naveMachinery.filter(m => (m.category === 'plastico_montaje' || m.category === 'plastico_ensamblaje') && (!m.relocationStatus || m.relocationStatus === 'completed'));

        let line1Rate = 0;
        let line2Rate = 0;

        if (hasElectricity && hasNaveForklift) {
          const isAssignedToMac = (e: any, mac: any) => {
            if (e.assignedMachineryId) {
              return String(e.assignedMachineryId) === String(mac.id) || String(e.assignedMachineryId) === String(mac.machineryId);
            }
            if (e.assignedMachineryTitle) {
              return e.assignedMachineryTitle === mac.title || e.assignedMachineryTitle === mac.lineTitle || e.assignedMachineryTitle === mac.machineryTitle;
            }
            return false;
          };

          // Line 1 calculation for this nave (Metal / Hierro)
          if (opLine1Machines.length > 0) {
            let line1RateSum = 0;
            for (const mac of opLine1Machines) {
              const macOps = hiredEmployees.filter(e =>
                isAssignedToMac(e, mac) &&
                (Number(e.shift) || 1) === shift
              ).length;
              const reqStaff = Number(mac.requiredStaff) === 5 ? 2 : (Number(mac.requiredStaff) || 2);
              if (macOps >= reqStaff) {
                line1RateSum += (mac.productionCapacityUnitsPerHour || 100);
              }
            }
            line1Rate = line1RateSum;
          }

          // Line 2 calculation for this nave (Plástico / Montaje / Ensamblaje)
          if (opLine2Machines.length > 0) {
            let line2RateSum = 0;
            for (const mac of opLine2Machines) {
              const macOps = hiredEmployees.filter(e =>
                isAssignedToMac(e, mac) &&
                (Number(e.shift) || 1) === shift
              ).length;
              const reqStaff = Number(mac.requiredStaff) === 5 ? 2 : (Number(mac.requiredStaff) || 2);
              if (macOps >= reqStaff) {
                line2RateSum += (mac.productionCapacityUnitsPerHour || 120);
              }
            }
            line2Rate = line2RateSum;
          }
        }

        // --- LINE 1: Fabricación de Varillas ---
        if (line1Rate > 0) {
          const maxIronRods = Math.floor((naveInv.ironKg || 0) / 0.0495);
          if (maxIronRods > 0) {
            (naveInv as any).line1PendingHours = ((naveInv as any).line1PendingHours || 0) + stepHours;
            const potentialUnits1 = Math.floor(((naveInv as any).line1PendingHours || 0) * line1Rate);
            let unitsProduced1 = 0;

            const currentMode = (inv as any).rodProductionMode || (naveInv as any).rodProductionMode || 'estrella';
            if (potentialUnits1 > 0 && (currentMode === 'estrella' || currentMode === 'plana')) {
              const actualProduced = Math.min(potentialUnits1, maxIronRods);
              if (actualProduced > 0) {
                naveInv.ironKg = Math.max(0, Math.round((naveInv.ironKg - actualProduced * 0.0495) * 100000) / 100000);
                if (currentMode === 'estrella') {
                  naveInv.producedStarRodsUnits = (naveInv.producedStarRodsUnits || 0) + actualProduced;
                } else {
                  naveInv.producedFlatRodsUnits = (naveInv.producedFlatRodsUnits || 0) + actualProduced;
                }
                unitsProduced1 = actualProduced;
              }

              const consumedHours1 = unitsProduced1 / line1Rate;
              (naveInv as any).line1PendingHours = Math.max(0, ((naveInv as any).line1PendingHours || 0) - consumedHours1);
            }
          } else {
            // Missing raw material (iron) -> Line 1 cannot produce & pending hours do NOT accumulate while idle
            (naveInv as any).line1PendingHours = Math.min((naveInv as any).line1PendingHours || 0, 0.99 / line1Rate);
          }
          naveInv.producedRodsUnits = (naveInv.producedStarRodsUnits || 0) + (naveInv.producedFlatRodsUnits || 0);
        } else {
          (naveInv as any).line1PendingHours = Math.min((naveInv as any).line1PendingHours || 0, 0.99 / 100);
        }

        // --- LINE 2: Inyección de Plástico y Ensamblaje Final (Destornilladores) ---
        if (line2Rate > 0) {
          const totalRodsAvail = (naveInv.producedStarRodsUnits || 0) + (naveInv.producedFlatRodsUnits || 0);
          const maxUnitsFromPlastic = Math.floor((naveInv.plasticKg || 0) / 0.0275);
          const maxUnitsFromEpoxi = Math.floor((naveInv.epoxiKg || 0) / 0.0005);
          const maxPossibleAll = Math.min(totalRodsAvail, maxUnitsFromPlastic, maxUnitsFromEpoxi);

          if (maxPossibleAll > 0) {
            (naveInv as any).line2PendingHours = ((naveInv as any).line2PendingHours || 0) + stepHours;
            const potentialUnits2 = Math.floor(((naveInv as any).line2PendingHours || 0) * line2Rate);
            let unitsProduced2 = 0;

            if (potentialUnits2 > 0) {
              const maxPossible = Math.min(potentialUnits2, maxPossibleAll);
              if (maxPossible > 0) {
                let remToProduce = maxPossible;

                // 1. Consume Estrella rods first if available in this nave
                const starRods = naveInv.producedStarRodsUnits || 0;
                const useStar = Math.min(remToProduce, starRods);
                if (useStar > 0) {
                  naveInv.producedStarRodsUnits = starRods - useStar;
                  naveInv.starScrewdriversUnits = (naveInv.starScrewdriversUnits || 0) + useStar;
                  naveInv.ironScrewdriversUnits = (naveInv.ironScrewdriversUnits || 0) + useStar;
                  remToProduce -= useStar;
                  unitsProduced2 += useStar;
                }

                // 2. Consume Plana rods next if available in this nave
                if (remToProduce > 0) {
                  const flatRods = naveInv.producedFlatRodsUnits || 0;
                  const useFlat = Math.min(remToProduce, flatRods);
                  if (useFlat > 0) {
                    naveInv.producedFlatRodsUnits = flatRods - useFlat;
                    naveInv.flatScrewdriversUnits = (naveInv.flatScrewdriversUnits || 0) + useFlat;
                    naveInv.metalScrewdriversUnits = (naveInv.metalScrewdriversUnits || 0) + useFlat;
                    unitsProduced2 += useFlat;
                  }
                }

                if (unitsProduced2 > 0) {
                  naveInv.plasticKg = Math.max(0, Math.round((naveInv.plasticKg - unitsProduced2 * 0.0275) * 100000) / 100000);
                  naveInv.epoxiKg = Math.max(0, Math.round((naveInv.epoxiKg - unitsProduced2 * 0.0005) * 100000) / 100000);
                }
              }

              naveInv.producedRodsUnits = (naveInv.producedStarRodsUnits || 0) + (naveInv.producedFlatRodsUnits || 0);
              naveInv.producedScrewdriversUnits = (naveInv.starScrewdriversUnits || 0) + (naveInv.flatScrewdriversUnits || 0);

              const consumedHours2 = unitsProduced2 / line2Rate;
              (naveInv as any).line2PendingHours = Math.max(0, ((naveInv as any).line2PendingHours || 0) - consumedHours2);
            }
          } else {
            // Missing raw materials (no rods, or no plastic, or no epoxi) -> Line 2 cannot produce & pending hours do NOT accumulate while idle
            (naveInv as any).line2PendingHours = Math.min((naveInv as any).line2PendingHours || 0, 0.99 / line2Rate);
          }
        } else {
          (naveInv as any).line2PendingHours = Math.min((naveInv as any).line2PendingHours || 0, 0.99 / 120);
        }
      }
    }

    recalculateTotalInventory(inv);
    inv.lastCalculatedAt = now.toISOString();
    inv.updatedAt = now.toISOString();
  }

  // 2. NOW credit raw materials to student nave inventory for newly arrived/delivered orders
  for (const ord of db.rawMaterialOrders) {
    if (ord.studentId === studentId && ['aprobado', 'entregado', 'finalizado', 'facturado'].includes(ord.status)) {
      const ordBuyer = db.users.find(u => u.id === ord.studentId);
      const buyerLevel = ordBuyer?.level || 1;
      const isL1Raw = buyerLevel === 1 && (
        ['hierro', 'metal', 'plastico', 'epoxi'].includes(ord.materialType) ||
        ord.sellerId === 'proveedor-materia-prima' || ord.sellerId === 'profesor-1' ||
        (ord.items && ord.items.some(i => ['hierro', 'metal', 'plastico', 'epoxi'].includes(i.materialType))) ||
        (ord.materialType && ord.materialType !== 'producto_final')
      );

      const delivTime = ord.estimatedDeliveryAt ? new Date(ord.estimatedDeliveryAt) : now;
      const isReadyToDeliver = isL1Raw || now >= delivTime || ord.status !== 'aprobado';

      if (isReadyToDeliver && !ord.inventoryCredited) {
        if (ord.status === 'aprobado') {
          ord.status = 'entregado';
          ord.deliveredAt = ord.deliveredAt || now.toISOString();
        }
        ord.inventoryCredited = true;

        const destNaveId = (ord as any).destinationNaveId || (ord as any).targetNaveId || primaryNaveId;
        const targetNaveInv = getNaveInv(destNaveId);

        if (ord.items && ord.items.length > 0) {
          for (const item of ord.items) {
            const mType = item.materialType || ord.materialType;
            const itemTitleLower = (item.materialTitle || ord.materialTitle || '').toLowerCase();
            const isRods = itemTitleLower.includes('varilla') || (mType as string) === 'varilla';
            const isScrewdriver = itemTitleLower.includes('destornillador') || (!isRods && mType === 'producto_final');

            if (isRods) {
              const qty = item.quantity || (item.totalKg ? Math.round(item.totalKg / 0.1) : 0) || 0;
              if (itemTitleLower.includes('plana') || itemTitleLower.includes('metal')) {
                (targetNaveInv as any).producedFlatRodsUnits = ((targetNaveInv as any).producedFlatRodsUnits || 0) + qty;
                (targetNaveInv as any).producedMetalRodsUnits = ((targetNaveInv as any).producedMetalRodsUnits || 0) + qty;
              } else {
                (targetNaveInv as any).producedStarRodsUnits = ((targetNaveInv as any).producedStarRodsUnits || 0) + qty;
                (targetNaveInv as any).producedIronRodsUnits = ((targetNaveInv as any).producedIronRodsUnits || 0) + qty;
              }
              targetNaveInv.producedRodsUnits = (targetNaveInv.producedRodsUnits || 0) + qty;
            } else if (isScrewdriver) {
              const qty = item.quantity || (item.totalKg ? Math.round(item.totalKg / 0.1) : 0) || 0;
              if (itemTitleLower.includes('plana') || itemTitleLower.includes('metal')) {
                (targetNaveInv as any).flatScrewdriversUnits = ((targetNaveInv as any).flatScrewdriversUnits || 0) + qty;
                (targetNaveInv as any).metalScrewdriversUnits = ((targetNaveInv as any).metalScrewdriversUnits || 0) + qty;
              } else {
                (targetNaveInv as any).starScrewdriversUnits = ((targetNaveInv as any).starScrewdriversUnits || 0) + qty;
                (targetNaveInv as any).ironScrewdriversUnits = ((targetNaveInv as any).ironScrewdriversUnits || 0) + qty;
              }
              targetNaveInv.producedScrewdriversUnits = (targetNaveInv.producedScrewdriversUnits || 0) + qty;
            } else if (mType === 'hierro' || itemTitleLower.includes('hierro')) {
              targetNaveInv.ironKg = (targetNaveInv.ironKg || 0) + (item.totalKg || 0);
            } else if (mType === 'metal' || itemTitleLower.includes('metal')) {
              targetNaveInv.metalKg = (targetNaveInv.metalKg || 0) + (item.totalKg || 0);
            } else if (mType === 'plastico' || itemTitleLower.includes('plástico') || itemTitleLower.includes('plastico')) {
              targetNaveInv.plasticKg = (targetNaveInv.plasticKg || 0) + (item.totalKg || 0);
            } else if (mType === 'epoxi' || itemTitleLower.includes('epoxi')) {
              targetNaveInv.epoxiKg = (targetNaveInv.epoxiKg || 0) + (item.totalKg || 0);
            }
          }
        } else {
          const mType = ord.materialType;
          const titleLower = (ord.materialTitle || '').toLowerCase();
          const isRods = titleLower.includes('varilla') || (mType as string) === 'varilla';
          const isScrewdriver = titleLower.includes('destornillador') || (!isRods && mType === 'producto_final');

          if (isRods) {
            const qty = ord.quantity || (ord.totalKg ? Math.round(ord.totalKg / 0.1) : 0) || 0;
            if (titleLower.includes('plana') || titleLower.includes('metal')) {
              (targetNaveInv as any).producedFlatRodsUnits = ((targetNaveInv as any).producedFlatRodsUnits || 0) + qty;
              (targetNaveInv as any).producedMetalRodsUnits = ((targetNaveInv as any).producedMetalRodsUnits || 0) + qty;
            } else {
              (targetNaveInv as any).producedStarRodsUnits = ((targetNaveInv as any).producedStarRodsUnits || 0) + qty;
              (targetNaveInv as any).producedIronRodsUnits = ((targetNaveInv as any).producedIronRodsUnits || 0) + qty;
            }
            targetNaveInv.producedRodsUnits = (targetNaveInv.producedRodsUnits || 0) + qty;
          } else if (isScrewdriver) {
            const qty = ord.quantity || (ord.totalKg ? Math.round(ord.totalKg / 0.1) : 0) || 0;
            if (titleLower.includes('plana') || titleLower.includes('metal')) {
              (targetNaveInv as any).flatScrewdriversUnits = ((targetNaveInv as any).flatScrewdriversUnits || 0) + qty;
              (targetNaveInv as any).metalScrewdriversUnits = ((targetNaveInv as any).metalScrewdriversUnits || 0) + qty;
            } else {
              (targetNaveInv as any).starScrewdriversUnits = ((targetNaveInv as any).starScrewdriversUnits || 0) + qty;
              (targetNaveInv as any).ironScrewdriversUnits = ((targetNaveInv as any).ironScrewdriversUnits || 0) + qty;
            }
            targetNaveInv.producedScrewdriversUnits = (targetNaveInv.producedScrewdriversUnits || 0) + qty;
          } else if (mType === 'hierro' || titleLower.includes('hierro')) {
            targetNaveInv.ironKg = (targetNaveInv.ironKg || 0) + (ord.totalKg || 0);
          } else if (mType === 'metal' || titleLower.includes('metal')) {
            targetNaveInv.metalKg = (targetNaveInv.metalKg || 0) + (ord.totalKg || 0);
          } else if (mType === 'plastico' || titleLower.includes('plástico') || titleLower.includes('plastico')) {
            targetNaveInv.plasticKg = (targetNaveInv.plasticKg || 0) + (ord.totalKg || 0);
          } else if (mType === 'epoxi' || titleLower.includes('epoxi')) {
            targetNaveInv.epoxiKg = (targetNaveInv.epoxiKg || 0) + (ord.totalKg || 0);
          }
        }
        recalculateTotalInventory(inv);
        inv.updatedAt = now.toISOString();
        syncRawMaterialOrderToSupabase(ord).catch(e => console.error(e));
        syncInventoryToSupabase(inv, ordBuyer?.name).catch(e => console.error(e));
      }
    }
  }

  // Auto-correction for double-credited inventories
  if ((inv.producedRodsUnits || 0) === 0 && (inv.producedScrewdriversUnits || 0) === 0) {
    let deliveredIron = 0, deliveredMetal = 0, deliveredPlastic = 0, deliveredEpoxi = 0;
    const studentOrders = (db.rawMaterialOrders || []).filter(o => o.studentId === studentId && ['entregado', 'finalizado', 'facturado'].includes(o.status));
    for (const ord of studentOrders) {
      if (ord.items && ord.items.length > 0) {
        for (const item of ord.items) {
          const mType = item.materialType || ord.materialType;
          const tLower = (item.materialTitle || '').toLowerCase();
          if (mType === 'hierro' || tLower.includes('hierro')) deliveredIron += (item.totalKg || 0);
          else if (mType === 'metal' || tLower.includes('metal')) deliveredMetal += (item.totalKg || 0);
          else if (mType === 'plastico' || tLower.includes('plástico') || tLower.includes('plastico')) deliveredPlastic += (item.totalKg || 0);
          else if (mType === 'epoxi' || tLower.includes('epoxi')) deliveredEpoxi += (item.totalKg || 0);
        }
      } else {
        const mType = ord.materialType;
        const titleLower = (ord.materialTitle || '').toLowerCase();
        if (mType === 'hierro' || titleLower.includes('hierro')) deliveredIron += (ord.totalKg || 0);
        else if (mType === 'metal' || titleLower.includes('metal')) deliveredMetal += (ord.totalKg || 0);
        else if (mType === 'plastico' || titleLower.includes('plástico') || titleLower.includes('plastico')) deliveredPlastic += (ord.totalKg || 0);
        else if (mType === 'epoxi' || titleLower.includes('epoxi')) deliveredEpoxi += (ord.totalKg || 0);
      }
    }
    let corrected = false;
    const pN = getNaveInv(primaryNaveId);
    if (deliveredIron > 0 && pN.ironKg >= 1.8 * deliveredIron) { pN.ironKg = deliveredIron; corrected = true; }
    if (deliveredMetal > 0 && pN.metalKg >= 1.8 * deliveredMetal) { pN.metalKg = deliveredMetal; corrected = true; }
    if (deliveredPlastic > 0 && pN.plasticKg >= 1.8 * deliveredPlastic) { pN.plasticKg = deliveredPlastic; corrected = true; }
    if (deliveredEpoxi > 0 && pN.epoxiKg >= 1.8 * deliveredEpoxi) { pN.epoxiKg = deliveredEpoxi; corrected = true; }
    if (corrected) {
      recalculateTotalInventory(inv);
      const u = db.users.find(usr => usr.id === studentId);
      syncInventoryToSupabase(inv, u?.name).catch(e => console.error(e));
    }
  }

  return inv;
}

function getDefaultSeedProperties(): PropertyListing[] {
  return [
    {
      id: 'inm-1',
      title: 'Nave industrial diáfana en polígono industrial',
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
      title: 'Local comercial esquina de gran afluencia',
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
      title: 'Almacén logístico con muelles de carga',
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
      title: 'Nave industrial acondicionada',
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
      title: 'Local comercial reformado',
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
          receiverName: 'Personal empleado / nóminas',
          receiverAccount: 'ES000000000000000000',
          amount: totalNetPaid,
          concept: `Pago automático de nóminas del mes ${currentMonth}/${currentYear} (${myEmployees.length} empleados)`,
          timestamp: now.toISOString()
        };
        db.transfers.unshift(transfer);
        syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalNetPaid, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

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
      syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', tax.amount, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

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
      syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', bill.totalAmount, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

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
          syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalAmount, paymentDueDate.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

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

function sanitizeDbStrings(db: DatabaseSchema) {
  if (!db) return;
  const cleanStr = (s?: string) => {
    if (!s) return s;
    return s
      .replace(/Línea de Fabricación de Metal \/ Hierro \(Varilla y Punta\)/gi, 'Línea de fabricación de metal / hierro (varilla y punta)')
      .replace(/Línea de Inyección de Plástico y Ensamblaje Final/gi, 'Línea de inyección de plástico y ensamblaje final')
      .replace(/Línea de Fabricación de Metal/gi, 'Línea de fabricación de metal')
      .replace(/Línea de Inyección de Plástico/gi, 'Línea de inyección de plástico')
      .replace(/Línea Estándar \(1 Torno CNC de 2 ejes\)/gi, 'Línea estándar (1 torno CNC de 2 ejes)')
      .replace(/Línea de Alta Capacidad \(2 Tornos CNC de 2 ejes\)/gi, 'Línea de alta capacidad (2 tornos CNC de 2 ejes)')
      .replace(/Línea Inyectora y Marcado Láser/gi, 'Línea inyectora y marcado láser')
      .replace(/Carretilla Elevadora Contrapesada 2\.5T/gi, 'Carretilla elevadora contrapesada 2.5T')
      .replace(/Carretilla Elevadora Contrapesada/gi, 'Carretilla elevadora contrapesada')
      .replace(/Carretilla Elevadora/gi, 'Carretilla elevadora')
      .replace(/Nave Industrial Diáfana en Polígono Industrial/gi, 'Nave industrial diáfana en polígono industrial')
      .replace(/Nave Industrial Acondicionada/gi, 'Nave industrial acondicionada')
      .replace(/Nave Industrial/gi, 'Nave industrial')
      .replace(/Almacén Logístico con Muelles de Carga/gi, 'Almacén logístico con muelles de carga')
      .replace(/Almacén Logístico/gi, 'Almacén logístico')
      .replace(/Local Comercial Esquina de Gran Afluencia/gi, 'Local comercial esquina de gran afluencia')
      .replace(/Local Comercial Reformado/gi, 'Local comercial reformado')
      .replace(/Local Comercial/gi, 'Local comercial')
      .replace(/Al Contado/g, 'Al contado')
      .replace(/Varilla y Punta/gi, 'varilla y punta')
      .replace(/Ensamblaje Final/gi, 'ensamblaje final')
      .replace(/IRPF Retenido/gi, 'IRPF retenido')
      .replace(/Sueldo Bruto/gi, 'Sueldo bruto')
      .replace(/Sueldo Neto/gi, 'Sueldo neto')
      .replace(/SS Empleado/gi, 'SS empleado')
      .replace(/SS Empresa/gi, 'SS empresa')
      .replace(/Turno Asignado/gi, 'Turno asignado')
      .replace(/Mes de alta \(Incompleto\)/gi, 'Mes de alta (incompleto)')
      .replace(/Inmuebles Contratados/gi, 'Inmuebles contratados')
      .replace(/Contrato Activo/gi, 'Contrato activo')
      .replace(/Operario Industrial/gi, 'Operario industrial')
      .replace(/Camionero \/ Conductor Logístico/gi, 'Camionero / conductor logístico')
      .replace(/Camionero \/ Conductor/gi, 'Camionero / conductor')
      .replace(/Turno Mañana/gi, 'Turno mañana')
      .replace(/Turno Tarde/gi, 'Turno tarde')
      .replace(/Turno Noche/gi, 'Turno noche')
      .replace(/1 Turno/gi, '1 turno')
      .replace(/2 Turnos/gi, '2 turnos')
      .replace(/3 Turnos/gi, '3 turnos');
  };

  if (db.acquisitions) {
    db.acquisitions.forEach(a => {
      a.propertyTitle = cleanStr(a.propertyTitle) as string;
      if ((a as any).title) (a as any).title = cleanStr((a as any).title);
    });
  }
  if (db.properties) {
    db.properties.forEach(p => {
      p.title = cleanStr(p.title) as string;
    });
  }
  if (db.machineryAcquisitions) {
    db.machineryAcquisitions.forEach(m => {
      m.title = cleanStr(m.title) as string;
      if (m.lineTitle) m.lineTitle = cleanStr(m.lineTitle);
      if (m.optionTitle) m.optionTitle = cleanStr(m.optionTitle);
      if (m.installationNaveTitle) m.installationNaveTitle = cleanStr(m.installationNaveTitle);
    });
  }
  if (db.purchasedVehicles) {
    db.purchasedVehicles.forEach(v => {
      v.title = cleanStr(v.title) as string;
      if ((v as any).assignedNaveTitle) (v as any).assignedNaveTitle = cleanStr((v as any).assignedNaveTitle);
    });
  }
  if (db.paymentObligations) {
    db.paymentObligations.forEach(o => {
      o.propertyTitle = cleanStr(o.propertyTitle) as string;
      if ((o as any).concept) (o as any).concept = cleanStr((o as any).concept);
    });
  }
  if (db.jobListings) {
    db.jobListings.forEach(j => {
      j.title = cleanStr(j.title) as string;
    });
  }
  if (db.hiredEmployees) {
    db.hiredEmployees.forEach(e => {
      if (e.assignedMachineryTitle) e.assignedMachineryTitle = cleanStr(e.assignedMachineryTitle);
      if (e.assignedVehicleTitle) e.assignedVehicleTitle = cleanStr(e.assignedVehicleTitle);
      if ((e as any).jobTitle) (e as any).jobTitle = cleanStr((e as any).jobTitle);
    });
  }
  if (db.rawMaterialAnnouncements) {
    db.rawMaterialAnnouncements = db.rawMaterialAnnouncements.filter(
      a => a.id !== 'rm-metal' &&
           a.materialType !== 'metal' &&
           !((a.title || '').toLowerCase().includes('fragmentos de metal'))
    );
    db.rawMaterialAnnouncements.forEach(a => {
      if (a.title) a.title = cleanStr(a.title);
      if (a.description) a.description = cleanStr(a.description);
      if (a.presentation) a.presentation = cleanStr(a.presentation);
    });
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

    if (!db.properties) {
      db.properties = [];
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

    sanitizeDbStrings(db);

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

    // Ensure default students exist if no students exist in DB
    const studentUsers = db.users.filter(u => u.role === 'student');
    if (studentUsers.length === 0) {
      const defaultStudents: User[] = [
        {
          id: 'alumno-1',
          username: 'ana',
          password: '123',
          role: 'student',
          name: 'Ana López',
          accountNumber: 'ES910001000212345678',
          balance: 1000,
          level: 1
        },
        {
          id: 'alumno-2',
          username: 'carlos',
          password: '123',
          role: 'student',
          name: 'Carlos Ruiz',
          accountNumber: 'ES910001000287654321',
          balance: 1000,
          level: 1
        },
        {
          id: 'alumno-3',
          username: 'beatriz',
          password: '123',
          role: 'student',
          name: 'Beatriz Gómez',
          accountNumber: 'ES910001000244556677',
          balance: 1000,
          level: 1
        },
        {
          id: 'alumno-cliente01',
          username: 'cliente01',
          password: '123',
          role: 'student',
          name: 'Cliente 01',
          accountNumber: 'ES910001000299000001',
          balance: 1000,
          level: 1
        }
      ];
      db.users.push(...defaultStudents);
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
        },
        {
          id: 'alumno-1',
          username: 'ana',
          password: '123',
          role: 'student',
          name: 'Ana López',
          accountNumber: 'ES910001000212345678',
          balance: 1000,
          level: 1
        },
        {
          id: 'alumno-2',
          username: 'carlos',
          password: '123',
          role: 'student',
          name: 'Carlos Ruiz',
          accountNumber: 'ES910001000287654321',
          balance: 1000,
          level: 1
        },
        {
          id: 'alumno-3',
          username: 'beatriz',
          password: '123',
          role: 'student',
          name: 'Beatriz Gómez',
          accountNumber: 'ES910001000244556677',
          balance: 1000,
          level: 1
        },
        {
          id: 'alumno-cliente01',
          username: 'cliente01',
          password: '123',
          role: 'student',
          name: 'Cliente 01',
          accountNumber: 'ES910001000299000001',
          balance: 1000,
          level: 1
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

    const currentDb = readDb();
    await syncAllToSupabase(currentDb);

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
const loginHandler = async (req: express.Request, res: express.Response) => {
  const { username, password } = req.body;
  
  console.log('[LOGIN] Request received. Username:', username, 'Password:', password ? '****' : 'empty');

  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanPassword = String(password || '').trim();
  const strippedUsername = cleanUsername.replace(/[^a-z0-9]/gi, '');

  // Log to database systemLogs for diagnostic tracking
  try {
    const db = readDb();
    const newLog: SystemLog = {
      id: generateId('log-debug'),
      action: 'LOGIN_ATTEMPT',
      details: `Intento de acceso recibido: usuario "${cleanUsername || 'vacío'}".`,
      timestamp: new Date().toISOString()
    };
    db.systemLogs.unshift(newLog);
    writeDb(db);
  } catch (e) {
    console.error('Failed to write login attempt log:', e);
  }

  if (!cleanUsername || !cleanPassword) {
    console.log('[LOGIN] Failed: Missing username or password');
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  const db = readDb();
  let user = db.users.find(u => {
    const uName = (u.username || '').trim().toLowerCase();
    const uPass = (u.password || '').trim();
    const nameMatch = (u.name || '').trim().toLowerCase() === cleanUsername;
    const accountMatch = (u.accountNumber || '').trim().toLowerCase() === cleanUsername;
    const idMatch = (u.id || '').trim().toLowerCase() === cleanUsername;
    const strippedMatch = uName.replace(/[^a-z0-9]/gi, '') === strippedUsername;
    const isPasswordValid = uPass === cleanPassword || (!uPass && cleanPassword === '123');
    return (uName === cleanUsername || nameMatch || accountMatch || idMatch || strippedMatch) && isPasswordValid;
  });

  // If not found in local db, query Supabase directly if connected
  if (!user && dbPool) {
    try {
      const client = await dbPool.connect();
      try {
        const queryRes = await client.query(
          `SELECT * FROM cuentas WHERE LOWER(usuario) = $1 OR LOWER(alumno) = $1 OR LOWER(account_number) = $1 OR LOWER(id) = $1 LIMIT 1`,
          [cleanUsername]
        );
        if (queryRes.rows.length > 0) {
          const row = queryRes.rows[0];
          const dbPass = (row.password || '123').trim();
          if (dbPass === cleanPassword || (!row.password && cleanPassword === '123')) {
            const newUser: User = {
              id: String(row.id),
              name: String(row.alumno),
              username: row.usuario ? String(row.usuario) : cleanUsername,
              password: dbPass,
              role: (row.role as any) || 'student',
              accountNumber: row.account_number || generateIBAN(),
              balance: Number(row.saldo) || 0,
              level: row.level ? (Number(row.level) as 1 | 2 | 3) : 1
            };
            const existingIdx = db.users.findIndex(u => u.id === newUser.id);
            if (existingIdx >= 0) {
              db.users[existingIdx] = newUser;
            } else {
              db.users.push(newUser);
            }
            writeDb(db);
            user = newUser;
          }
        }
      } finally {
        client.release();
      }
    } catch (sbErr) {
      console.error('[Supabase Login Query Error]', sbErr);
    }
  }

  // Auto-provision standard student/client identifiers (e.g., cliente01, cliente02, alumno01, cliente1)
  if (!user) {
    const studentPattern = /^(cliente|alumno|student|estudiante|user)[-_ ]*0?(\d+)$/i;
    const match = cleanUsername.match(studentPattern);
    if (match && (cleanPassword === '123' || !cleanPassword)) {
      const prefix = match[1].toLowerCase().startsWith('c') ? 'Cliente' : 'Alumno';
      const numStr = match[2].padStart(2, '0');
      const newStudentName = `${prefix} ${numStr}`;
      const newStudentUser: User = {
        id: `alumno-${cleanUsername.replace(/[^a-z0-9]/gi, '')}`,
        username: cleanUsername,
        password: cleanPassword || '123',
        role: 'student',
        name: newStudentName,
        accountNumber: `ES910001000299${numStr.padStart(6, '0')}`,
        balance: db.defaultInitialBalance || 1000,
        level: 1
      };
      db.users.push(newStudentUser);
      writeDb(db);
      syncAccountToSupabase(
        newStudentUser.id,
        newStudentUser.name,
        newStudentUser.balance,
        newStudentUser.username,
        newStudentUser.password,
        newStudentUser.accountNumber,
        newStudentUser.role,
        newStudentUser.level
      ).catch(() => {});
      user = newStudentUser;
    }
  }

  if (!user) {
    console.log('[LOGIN] Failed: Credentials do not match any active user. Username tried:', cleanUsername);
    return res.status(401).json({ error: 'Credenciales inválidas. Comprueba tu usuario y contraseña.' });
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
const handleCreateUserRoute = (req: express.Request, res: express.Response) => {
  const { name, username, password, initialBalance, level } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña son requeridos' });
  }

  const db = readDb();
  const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());
  
  if (exists) {
    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }

  const userLevel = (level && [1, 2, 3].includes(Number(level))) ? (Number(level) as 1 | 2 | 3) : 1;

  const newUser: User = {
    id: generateId('user'),
    username: username.toLowerCase().trim(),
    password: password.trim(),
    role: 'student',
    name: name.trim(),
    accountNumber: generateIBAN(),
    balance: Number(initialBalance) || 0,
    level: userLevel
  };

  db.users.push(newUser);
  if (newUser.role === 'student') {
    syncAccountToSupabase(newUser.id, newUser.name, newUser.balance, newUser.username, newUser.password, newUser.accountNumber, newUser.role, newUser.level).catch(e => console.error(e));
  }

  const newLog: SystemLog = {
    id: generateId('log'),
    action: 'CREATE_USER',
    details: `Cuenta creada: ${newUser.name} (${newUser.username}) - Nivel ${newUser.level} con saldo inicial de ${newUser.balance} €`,
    timestamp: new Date().toISOString()
  };
  db.systemLogs.unshift(newLog);

  writeDb(db);
  res.status(201).json({ user: newUser });
};

app.post('/api/users', handleCreateUserRoute);
app.post('/users', handleCreateUserRoute);

// Update user details (Teacher only)
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, username, password, level } = req.body;

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
  if (level && [1, 2, 3].includes(Number(level))) {
    user.level = Number(level) as 1 | 2 | 3;
  }

  if (user.role === 'student') {
    syncAccountToSupabase(user.id, user.name, user.balance, user.username, user.password, user.accountNumber, user.role, user.level).catch(e => console.error(e));
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
  syncMovimientoToSupabase(newTransfer.id + '-out', sender.id, 'TRANSFER_OUT', transferAmount, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));
  syncMovimientoToSupabase(newTransfer.id + '-in', receiver.id, 'TRANSFER_IN', transferAmount, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));

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

// Execute full simulation reset
async function executeFullSimulationReset(keepUsers: boolean, defaultBalance: number) {
  const db = readDb();
  const initialBalanceValue = defaultBalance !== undefined ? Number(defaultBalance) : 1000;
  db.defaultInitialBalance = initialBalanceValue;

  if (keepUsers) {
    db.users = db.users.map(u => {
      if (u.role === 'student') {
        return { ...u, balance: initialBalanceValue, level: 1 };
      }
      return u;
    });
  } else {
    db.users = db.users.filter(u => u.role === 'teacher');
  }

  // Clear all activity, acquisitions, contracts, messages, and records
  db.transfers = [];
  db.properties = keepUsers ? getDefaultSeedProperties() : [];
  db.acquisitions = [];
  db.paymentObligations = [];
  db.loans = [];
  db.machineryAcquisitions = [];
  db.jobListings = [];
  db.hiredEmployees = [];
  db.payrollRecords = [];
  db.taxObligations = [];
  db.electricityContracts = [];
  db.electricityBills = [];
  db.naveFloorPlans = [];
  db.telecomContracts = [];
  db.telecomInvoices = [];
  db.officeOrders = [];
  db.relocationInvoices = [];
  db.purchasedVehicles = [];
  db.unifiedMonthlyInvoices = [];
  db.rawMaterialAnnouncements = getDefaultSeedRawMaterialAnnouncements();
  db.rawMaterialOrders = [];
  db.rawMaterialInventories = [];
  db.marketMessages = [];
  db.companyProfiles = [];
  db.marketContacts = [];
  db.notifications = [];

  const newLog: SystemLog = {
    id: generateId('log'),
    action: 'RESET_SIMULATION',
    details: `Simulación reiniciada por el profesor. ¿Se mantuvieron usuarios?: ${keepUsers ? 'Sí (saldos restablecidos a ' + initialBalanceValue + ' €)' : 'No (todas las cuentas de alumnos eliminadas)'}`,
    timestamp: new Date().toISOString()
  };

  db.systemLogs = [newLog];
  writeDb(db);

  if (dbPool) {
    try {
      if (keepUsers) {
        await safeDbQuery(`UPDATE cuentas SET saldo = $1, level = 1 WHERE role = 'student' OR (role IS NULL AND id != 'profesor-1')`, [initialBalanceValue]);
        const allowedIds = db.users.map(u => u.id);
        if (allowedIds.length > 0) {
          const placeholders = allowedIds.map((_, i) => `$${i + 1}`).join(',');
          await safeDbQuery(`DELETE FROM cuentas WHERE id NOT IN (${placeholders})`, allowedIds);
        }
      } else {
        await safeDbQuery(`DELETE FROM cuentas WHERE role = 'student' OR (role IS NULL AND id != 'profesor-1')`);
      }

      for (const u of db.users) {
        await syncAccountToSupabase(u.id, u.name, u.balance, u.username, u.password, u.accountNumber, u.role, u.level);
      }

      await safeDbQuery(`DELETE FROM movimientos`);
      await safeDbQuery(`DELETE FROM adquisiciones`);
      await safeDbQuery(`DELETE FROM obligaciones_pago`);
      await safeDbQuery(`DELETE FROM prestamos`);
      await safeDbQuery(`DELETE FROM maquinaria_adquisiciones`);
      await safeDbQuery(`DELETE FROM ofertas_empleo`);
      await safeDbQuery(`DELETE FROM empleados_contratados`);
      await safeDbQuery(`DELETE FROM registros_nomina`);
      await safeDbQuery(`DELETE FROM obligaciones_fiscales`);
      await safeDbQuery(`DELETE FROM contratos_electricos`);
      await safeDbQuery(`DELETE FROM planos_distribucion_naves`);
      await safeDbQuery(`DELETE FROM contratos_telecom`);
      await safeDbQuery(`DELETE FROM facturas_telecom`);
      await safeDbQuery(`DELETE FROM pedidos_oficina`);
      await safeDbQuery(`DELETE FROM vehiculos_comprados`);
      await safeDbQuery(`DELETE FROM materias_primas_inventario`);
      await safeDbQuery(`DELETE FROM materias_primas_pedidos`);
      await safeDbQuery(`DELETE FROM perfiles_empresa`);
      await safeDbQuery(`DELETE FROM contactos_mercado`);
      await safeDbQuery(`DELETE FROM market_messages`);
      await safeDbQuery(`DELETE FROM notificaciones`);

      await safeDbQuery(`DELETE FROM inmuebles`);
      for (const prop of db.properties) {
        await syncPropertyToSupabase(prop);
      }

      await safeDbQuery(`DELETE FROM anuncios_materia_prima`);
      for (const ann of db.rawMaterialAnnouncements) {
        await syncRawMaterialAnnouncementToSupabase(ann);
      }
    } catch (e) {
      console.error('[Supabase DB] Error al purgar la base de datos en reinicio:', e);
    }
  }
}

// Reset simulation (Teacher only)
app.post('/api/reset-simulation', async (req, res) => {
  try {
    const { keepUsers, defaultBalance } = req.body;
    await executeFullSimulationReset(keepUsers, defaultBalance);
    res.json({ success: true, message: 'La simulación se ha reiniciado correctamente' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al reiniciar la simulación: ' + error.message });
  }
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
        nave_industrial: 'Nave industrial',
        almacen: 'Almacén logístico',
        local_comercial: 'Local comercial'
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

// Delete ALL property listings (Teacher option)
app.delete('/api/properties', (req, res) => {
  const db = readDb();
  db.properties = [];
  writeDb(db);
  safeDbQuery('DELETE FROM inmuebles').catch(e => console.error('Error deleting all inmuebles:', e));
  res.json({ success: true, message: 'Todos los anuncios de inmuebles han sido eliminados correctamente.' });
});

// Delete property listing (Teacher only)
app.delete('/api/properties/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  
  const index = db.properties.findIndex(p => String(p.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ error: 'Anuncio de inmueble no encontrado' });
  }

  db.properties.splice(index, 1);
  writeDb(db);
  deletePropertyFromSupabase(String(id)).catch(e => console.error(e));

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
    syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', initialPaymentTotal, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));
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
      syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', totalPrice, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));

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
        ? 'Letra de cambio'
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
      syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', initialCashRequired, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));
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
    title: 'Línea de fabricación de metal / hierro (varilla y punta)',
    description: 'Línea industrial completa para la fabricación de la varilla de acero y la punta de precisión de los destornilladores.',
    imageUrl: '/images/machinery/maquinaria_cnc.jpg',
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
    requiredStaff: 2,
    powerKw: 35,
    assemblyDays: 5,
    options: [
      {
        id: 'opt-1-lathe',
        lathesCount: 1,
        title: 'Línea estándar (1 torno CNC de 2 ejes)',
        productionCapacityUnitsPerHour: 60,
        basePrice: 104000
      },
      {
        id: 'opt-2-lathes',
        lathesCount: 2,
        title: 'Línea de alta capacidad (2 tornos CNC de 2 ejes)',
        productionCapacityUnitsPerHour: 100,
        basePrice: 110000
      }
    ]
  },
  {
    id: 'mac-plastico-ensamblaje',
    category: 'plastico_ensamblaje',
    title: 'Línea de inyección de plástico y ensamblaje final',
    description: 'Línea automatizada para la inyección del mango plástico de polímero, marcado láser y ensamblaje final.',
    imageUrl: '/images/machinery/maquinaria_cnc.jpg',
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
    requiredStaff: 2,
    powerKw: 33,
    assemblyDays: 5,
    options: [
      {
        id: 'opt-plastic-std',
        lathesCount: 0,
        title: 'Línea inyectora y marcado láser',
        productionCapacityUnitsPerHour: 120,
        basePrice: 102000
      }
    ]
  }
];

function getNaveSurfaceBreakdownBackend(db: any, studentId: string, targetAcquisition: any) {
  const targetId = String(targetAcquisition.id);
  const propId = String(targetAcquisition.propertyId || '');
  const targetTitleLower = (targetAcquisition.propertyTitle || targetAcquisition.title || '').toLowerCase().trim();

  const existingMachinery = (db.machineryAcquisitions || []).filter(
    (m: any) => (m.studentId === studentId || String(m.studentId) === String(studentId)) && (
      (m.installationNaveId && (String(m.installationNaveId) === targetId || (propId && String(m.installationNaveId) === propId))) ||
      (m.installedAtNaveId && (String(m.installedAtNaveId) === targetId || (propId && String(m.installedAtNaveId) === propId))) ||
      (m.installedNaveId && (String(m.installedNaveId) === targetId || (propId && String(m.installedNaveId) === propId))) ||
      (m.propertyId && (String(m.propertyId) === targetId || (propId && String(m.propertyId) === propId))) ||
      (m.acquisitionId && (String(m.acquisitionId) === targetId || (propId && String(m.acquisitionId) === propId))) ||
      ((m.installationNaveTitle || m.installedAtNaveTitle || m.installedNaveTitle || '').toLowerCase().trim() === targetTitleLower)
    )
  );

  const occupiedMachineryM2 = existingMachinery.reduce((sum: number, m: any) => {
    if (m.requiredSurfaceM2 && m.requiredSurfaceM2 > 0) return sum + Number(m.requiredSurfaceM2);
    const cat = MACHINERY_CATALOG.find(c => c.id === m.machineryId);
    if (cat && cat.requiredSurfaceM2) return sum + Number(cat.requiredSurfaceM2);
    const title = (m.title || m.lineTitle || '').toLowerCase();
    const isMetal = m.category === 'metal_hierro' || title.includes('metal') || title.includes('hierro');
    return sum + (isMetal ? 240 : 180);
  }, 0);

  const totalNaveM2 = Number(targetAcquisition.surfaceM2 || targetAcquisition.superficie_m2 || targetAcquisition.m2) || 1000;

  const floorPlan = (db.naveFloorPlans || []).find((p: any) => 
    (p.studentId === studentId || String(p.studentId) === String(studentId)) && (
      (p.acquisitionId && String(p.acquisitionId) === targetId) ||
      (p.propertyId && propId && String(p.propertyId) === propId) ||
      (p.propertyId && String(p.propertyId) === targetId) ||
      (p.propertyTitle && targetTitleLower && p.propertyTitle.toLowerCase().trim() === targetTitleLower)
    )
  );

  let machineryZoneM2 = 0;
  let storageZoneM2 = 30;
  let adminZoneM2 = 0;
  let freeZoneM2 = 0;

  if (floorPlan) {
    machineryZoneM2 = Number(floorPlan.machineryZoneM2) || 0;
    storageZoneM2 = Number(floorPlan.storageZoneM2 ?? floorPlan.rawMaterialsStorageM2) || 30;
    adminZoneM2 = Number(floorPlan.adminZoneM2) || 0;
    freeZoneM2 = floorPlan.freeZoneM2 !== undefined 
      ? Number(floorPlan.freeZoneM2) 
      : Math.max(0, totalNaveM2 - (machineryZoneM2 + storageZoneM2 + adminZoneM2));
  } else {
    storageZoneM2 = 30;
    adminZoneM2 = 0;
    machineryZoneM2 = Math.max(occupiedMachineryM2, 0);
    freeZoneM2 = Math.max(0, totalNaveM2 - occupiedMachineryM2 - storageZoneM2 - adminZoneM2);
  }

  const freeInMachineryZone = Math.max(0, machineryZoneM2 - occupiedMachineryM2);
  const availableForMachineryM2 = freeInMachineryZone + freeZoneM2;

  return {
    totalNaveM2,
    existingMachinery,
    occupiedMachineryM2,
    machineryZoneM2,
    freeInMachineryZone,
    storageZoneM2,
    adminZoneM2,
    freeZoneM2,
    availableForMachineryM2,
    floorPlan
  };
}

function updateFloorPlanAfterMachineryAcquisition(db: any, studentId: string, targetAcquisition: any, newRequiredSurfaceM2: number) {
  const breakdown = getNaveSurfaceBreakdownBackend(db, studentId, targetAcquisition);
  const newTotalMachineryM2 = breakdown.occupiedMachineryM2; // already includes new machine

  if (breakdown.floorPlan) {
    if (newTotalMachineryM2 > breakdown.floorPlan.machineryZoneM2) {
      breakdown.floorPlan.machineryZoneM2 = newTotalMachineryM2;
      breakdown.floorPlan.freeZoneM2 = Math.max(
        0,
        breakdown.totalNaveM2 -
          newTotalMachineryM2 -
          (Number(breakdown.floorPlan.storageZoneM2) || 30) -
          (Number(breakdown.floorPlan.adminZoneM2) || 0)
      );
      breakdown.floorPlan.updatedAt = new Date().toISOString();
      syncFloorPlanToSupabase(breakdown.floorPlan).catch(e => console.error(e));
    }
  } else {
    const storageM2 = 30;
    const adminM2 = 0;
    const freeM2 = Math.max(0, breakdown.totalNaveM2 - newTotalMachineryM2 - storageM2 - adminM2);
    const newPlan: NaveFloorPlan = {
      id: generateId('floor_plan'),
      propertyId: targetAcquisition.propertyId || targetAcquisition.id,
      acquisitionId: targetAcquisition.id,
      propertyTitle: targetAcquisition.propertyTitle || 'Nave industrial',
      studentId,
      machineryZoneM2: newTotalMachineryM2,
      storageZoneM2: storageM2,
      rawMaterialsStorageM2: storageM2,
      semiFinishedStorageM2: 0,
      finishedGoodsStorageM2: 0,
      adminZoneM2: adminM2,
      freeZoneM2: freeM2,
      warehousesCount: 1,
      updatedAt: new Date().toISOString()
    };
    if (!db.naveFloorPlans) db.naveFloorPlans = [];
    db.naveFloorPlans.push(newPlan);
    syncFloorPlanToSupabase(newPlan).catch(e => console.error(e));
  }
}

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
      error: `Para comprar esta maquinaria se requiere obligatoriamente disponer de una nave industrial de al menos ${machinery.requiredSurfaceM2} m² (superficie de producción). Por favor, adquiere o alquila una nave industrial adecuada antes de continuar.`
    });
  }

  const pType = (targetAcquisition.propertyType || targetAcquisition.type || '').toLowerCase();
  const pTitle = (targetAcquisition.propertyTitle || targetAcquisition.title || '').toLowerCase();
  const isIndustrialNave = pType === 'nave_industrial' || pType.includes('nave') || pType === 'industrial' || pTitle.includes('nave');

  if (!isIndustrialNave) {
    const typeLabel = targetAcquisition.propertyType === 'local_comercial' ? 'Local comercial' : targetAcquisition.propertyType === 'almacen' ? 'Almacén' : 'Inmueble';
    return res.status(400).json({
      error: `Requisito de ubicación incumplido: El inmueble seleccionado "${targetAcquisition.propertyTitle}" es un ${typeLabel}. La maquinaria industrial de fabricación solo puede ser instalada dentro de una nave industrial.`
    });
  }

  // Calculate surface breakdown coherently with the floor plan
  const surfaceBreakdown = getNaveSurfaceBreakdownBackend(db, studentId, targetAcquisition);
  const requiredSurfaceM2 = machinery.requiredSurfaceM2 || (machinery.category === 'metal_hierro' ? 240 : 180);

  if (surfaceBreakdown.availableForMachineryM2 < requiredSurfaceM2) {
    return res.status(400).json({
      error: `Superficie insuficiente en la nave industrial: La nave "${targetAcquisition.propertyTitle}" dispone de ${surfaceBreakdown.totalNaveM2} m² en total. Actualmente tiene instalada(s) ${surfaceBreakdown.existingMachinery.length} máquina(s) ocupando un total de ${surfaceBreakdown.occupiedMachineryM2} m², almacén de ${surfaceBreakdown.storageZoneM2} m² y administración de ${surfaceBreakdown.adminZoneM2} m². En el plano quedan ${surfaceBreakdown.availableForMachineryM2} m² disponibles para maquinaria (${surfaceBreakdown.freeInMachineryZone} m² libres en la zona de maquinaria + ${surfaceBreakdown.freeZoneM2} m² de superficie diáfana/libre). La nueva línea "${machinery.title}" requiere ${requiredSurfaceM2} m². Por favor, amplía la superficie diáfana en el plano de distribución o adquiere una nueva nave industrial.`
    });
  }

  const vendorName = 'Maquinarias e Instalaciones Industriales S.A.';
  const vendorAccount = 'ES210001000299887799';
  const now = new Date();

  // Check electricity supply contract power requirements for the target property
  const targetPropId = String(targetAcquisition.id);
  const targetPropTitle = (targetAcquisition.propertyTitle || '').toLowerCase().trim();

  const elecContract = (db.electricityContracts || []).find(c => c.studentId === student.id && c.status === 'active' && (
    (targetPropId && (c.propertyId === targetPropId || c.id === targetPropId)) ||
    (targetPropTitle && c.propertyTitle && c.propertyTitle.toLowerCase().trim() === targetPropTitle)
  )) || (db.electricityContracts || []).find(c => c.studentId === student.id && c.status === 'active' && !c.propertyId);

  // Machinery assigned to THIS nave
  const targetNaveMachinery = (db.machineryAcquisitions || []).filter(m => {
    if (m.studentId !== student.id) return false;
    const mNaveId = String(m.installedAtNaveId || m.installedNaveId || m.installationNaveId || m.propertyId || m.acquisitionId || '');
    if (mNaveId && mNaveId === targetPropId) return true;
    const mNaveTitle = (m.installationNaveTitle || m.installedAtNaveTitle || m.installedNaveTitle || m.naveInstaladaTitulo || '').toLowerCase().trim();
    if (mNaveTitle && targetPropTitle && (mNaveTitle === targetPropTitle || mNaveTitle.includes(targetPropTitle) || targetPropTitle.includes(mNaveTitle))) return true;
    return false;
  });

  const totalMachineryPowerNeeded = targetNaveMachinery.reduce((sum, m) => sum + (m.requiredPowerKW || m.powerKw || 35), 0) + (machinery.requiredPowerKW || 35);
  const totalPowerNeeded = totalMachineryPowerNeeded + 10; // 10 kW for basic nave lighting & HVAC

  const isPowerContracted = elecContract && elecContract.contractedPowerKw >= totalPowerNeeded;
  const initialMachineryStatus = isPowerContracted ? 'montaje' : 'pendiente_energia';

  // Calculate 8-hour assembly finish date if electricity is available
  const assemblyFinishDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);

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
      requiredStaff: machinery.requiredStaff || 2,
      requiredPowerKW: machinery.requiredPowerKW || 35,
      powerKw: machinery.requiredPowerKW || 35,
      equipmentList: machinery.equipmentList || machinery.equipment || [],
      equipment: machinery.equipmentList || machinery.equipment || []
    };

    if (!db.machineryAcquisitions) db.machineryAcquisitions = [];
    db.machineryAcquisitions.unshift(machAcq);

    // Update or create floor plan coherently
    updateFloorPlanAfterMachineryAcquisition(db, student.id, targetAcquisition, requiredSurfaceM2);

    writeDb(db);

    // Sync to Supabase
    syncAccountToSupabase(student.id, student.name, student.balance).catch(e => console.error(e));
    syncMachineryToSupabase(machAcq).catch(e => console.error(e));
    syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', totalPrice, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));

    const statusMsg = isPowerContracted
      ? `¡Adquisición de maquinaria al contado completada! Importe abonado: ${formatCurrency(totalPrice)} (IVA incl.). La maquinaria ha iniciado el periodo de montaje de 8 horas en ${targetAcquisition.propertyTitle}.`
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
      requiredStaff: machinery.requiredStaff || 2,
      requiredPowerKW: machinery.requiredPowerKW || 35,
      powerKw: machinery.requiredPowerKW || 35,
      equipmentList: machinery.equipmentList || machinery.equipment || [],
      equipment: machinery.equipmentList || machinery.equipment || []
    };

    if (!db.machineryAcquisitions) db.machineryAcquisitions = [];
    db.machineryAcquisitions.unshift(machAcq);

    // Update or create floor plan coherently
    updateFloorPlanAfterMachineryAcquisition(db, student.id, targetAcquisition, requiredSurfaceM2);

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
    syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', initialCashRequired, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));
    for (const ob of generatedObligations) {
      syncObligationToSupabase(ob).catch(e => console.error(e));
    }

    const defStatusMsg = isPowerContracted
      ? `¡Compra aplazada de maquinaria formalizada! Se han abonado ${formatCurrency(initialCashRequired)} de entrada e IVA, y se han emitido 24 pagarés mensuales de ${formatNumber(installmentAmount)} €/mes. El montaje de 8 horas ha comenzado en ${targetAcquisition.propertyTitle}.`
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

// Relocate Machinery Endpoint (5 days disassembly + 5 days reassembly = 10 days total)
app.put('/api/student/machinery/:id/relocate', (req, res) => {
  const { id } = req.params;
  const { targetNaveId, studentId } = req.body;

  const db = readDb();
  if (!db.machineryAcquisitions) db.machineryAcquisitions = [];

  const mac = db.machineryAcquisitions.find(m => m.id === id);
  if (!mac) return res.status(404).json({ error: 'Maquinaria no encontrada' });

  const sid = studentId || mac.studentId;
  const student = (db.users || []).find((u: any) => u.id === sid || String(u.id) === String(sid));

  // Check target nave
  const targetNave = (db.acquisitions || []).find(a => (a.id === targetNaveId || a.propertyId === targetNaveId) && (a.studentId === sid || String(a.studentId) === String(sid)));
  if (!targetNave) {
    return res.status(404).json({ error: 'Nave industrial de destino no encontrada entre tus inmuebles.' });
  }

  // Check active electricity contract for target nave
  const elecContracts = (db.electricityContracts || []).filter(e => (e.studentId === sid || String(e.studentId) === String(sid)) && e.status === 'active');
  const hasElecOnTarget = elecContracts.some(e => 
    String(e.propertyId) === String(targetNave.propertyId) || 
    String(e.propertyId) === String(targetNave.id) ||
    (e.propertyTitle && targetNave.propertyTitle && e.propertyTitle.toLowerCase().trim() === targetNave.propertyTitle.toLowerCase().trim())
  );

  if (!hasElecOnTarget) {
    return res.status(400).json({
      error: `No puedes trasladar la maquinaria a ${targetNave.propertyTitle} porque dicha nave NO tiene contrato de luz activo. Es requisito obligatorio contratar la electricidad en la nave de destino.`
    });
  }

  // Check if already relocating
  if (mac.relocationStatus && mac.relocationStatus !== 'completed') {
    const nowTs = new Date().getTime();
    const finishTs = mac.relocationReassemblyEndDate ? new Date(mac.relocationReassemblyEndDate).getTime() : 0;
    if (nowTs < finishTs) {
      return res.status(400).json({ error: 'Esta maquinaria ya se encuentra actualmente en proceso de traslado / montaje.' });
    }
  }

  // Calculate relocation costs
  const sourceTitle = mac.installationNaveTitle || mac.installedAtNaveTitle || mac.installedNaveTitle || 'Nave de origen';
  const targetTitle = targetNave.propertyTitle || 'Nave de destino';

  let distanceKm = 15;
  if (sourceTitle && targetTitle) {
    const hash = Math.abs((sourceTitle.length * 7 + targetTitle.length * 13) % 45);
    distanceKm = 10 + hash;
  }
  const disassemblyFee = 1500;
  const transportFee = Math.round(distanceKm * 28 + 350);
  const reassemblyFee = 1800;
  const subtotal = disassemblyFee + transportFee + reassemblyFee;
  const ivaAmount = Math.round((subtotal * 0.21) * 100) / 100;
  const totalAmount = Math.round((subtotal + ivaAmount) * 100) / 100;

  if (!student) {
    return res.status(404).json({ error: 'Alumno / Empresa no encontrado para realizar el cobro.' });
  }

  const currentBal = student.balance ?? 0;
  if (currentBal < totalAmount) {
    return res.status(400).json({
      error: `Saldo insuficiente para pagar el traslado de la maquinaria. Coste total: ${totalAmount.toFixed(2)} € (IVA incl.), Saldo disponible: ${currentBal.toFixed(2)} €.`
    });
  }
  student.balance = Math.round((currentBal - totalAmount) * 100) / 100;
  syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));

  const now = new Date();
  const disassemblyEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours real
  const reassemblyEnd = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours real total

  mac.relocationStatus = 'desmontaje';
  mac.relocationStartDate = now.toISOString();
  mac.relocationDisassemblyEndDate = disassemblyEnd.toISOString();
  mac.relocationReassemblyEndDate = reassemblyEnd.toISOString();
  mac.relocationTargetNaveId = targetNave.id;
  mac.relocationTargetNaveTitle = targetNave.propertyTitle;
  mac.status = 'en_traslado';

  // Bank transfer record
  if (!db.transfers) db.transfers = [];
  const transferRecord: any = {
    id: `trsl-trf-${Date.now()}`,
    studentId: sid,
    amount: totalAmount,
    concept: `Pago factura traslado, desmontaje y montaje de maquinaria #${mac.id}`,
    date: now.toISOString(),
    type: 'egreso',
    recipient: 'Logística y Montajes Industriales España S.L.',
    status: 'completado'
  };
  db.transfers.push(transferRecord);

  const stuObj = student as any;

  // Relocation invoice record
  const relocationInvoice: RelocationInvoice = {
    id: `rel-inv-${Date.now()}`,
    invoiceNumber: `FACT-TRSL-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    issueDate: now.toISOString(),
    studentId: String(sid),
    studentName: stuObj?.fullName || stuObj?.name || 'Empresa Estudiante',
    companyName: stuObj?.companyName || stuObj?.fullName || stuObj?.name || 'Empresa Estudiante',
    cifNif: stuObj?.cifNif || stuObj?.nif || 'B-99887766',
    machineryId: mac.id,
    machineryTitle: mac.lineTitle || mac.title || mac.machineryTitle || 'Línea de producción',
    sourceNaveId: mac.installedAtNaveId || mac.installationNaveId || '',
    sourceNaveTitle: sourceTitle,
    sourceLocation: 'Instalación industrial de origen',
    targetNaveId: targetNave.id,
    targetNaveTitle: targetTitle,
    targetLocation: 'Instalación industrial de destino',
    distanceKm,
    disassemblyFee,
    reassemblyFee,
    transportFee,
    subtotal,
    ivaRate: 21,
    ivaAmount,
    totalAmount,
    status: 'pagado',
    paymentMethod: 'transferencia_bancaria'
  };

  if (!db.relocationInvoices) db.relocationInvoices = [];
  db.relocationInvoices.push(relocationInvoice);

  if (!mac.relocationInvoices) mac.relocationInvoices = [];
  mac.relocationInvoices.unshift(relocationInvoice);
  mac.relocationInvoice = relocationInvoice;

  writeDb(db);
  syncMachineryToSupabase(mac).catch(e => console.error(e));

  return res.json({
    success: true,
    message: `Iniciado el proceso de traslado de ${mac.lineTitle || mac.title || 'Maquinaria'} a ${targetNave.propertyTitle}. Se han cargado ${totalAmount.toFixed(2)} € en cuenta por desmontaje, transporte (${distanceKm} km) y montaje. Se ha generado la factura correspondiente.`,
    machinery: mac,
    relocationInvoice,
    newBalance: student?.balance
  });
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

  // Update machinery status if assembly or relocation finished
  let statusChanged = false;
  const now = new Date();
  const nowTs = now.getTime();

  for (const m of machineryAcquisitions) {
    if (m.requiredStaff === 5 || !m.requiredStaff) {
      m.requiredStaff = 2;
    }
    if (m.status === 'montaje' || m.status === 'en_montaje') {
      const finishDate = new Date(m.assemblyFinishDate || m.assemblyEndDate || '');
      if (m.assemblyFinishDate && now >= finishDate) {
        m.status = 'operativa';
        statusChanged = true;
        syncMachineryToSupabase(m).catch(e => console.error(e));
      }
    }

    // Check ongoing relocation status (5 days disassembly + 5 days reassembly)
    if (m.relocationStatus && m.relocationStatus !== 'completed') {
      const disTs = m.relocationDisassemblyEndDate ? new Date(m.relocationDisassemblyEndDate).getTime() : 0;
      const reasTs = m.relocationReassemblyEndDate ? new Date(m.relocationReassemblyEndDate).getTime() : 0;

      if (reasTs > 0 && nowTs >= reasTs) {
        // Completed relocation
        m.installedAtNaveId = m.relocationTargetNaveId || m.installedAtNaveId;
        m.installedAtNaveTitle = m.relocationTargetNaveTitle || m.installedAtNaveTitle;
        m.installedNaveId = m.relocationTargetNaveId || m.installedNaveId;
        m.installedNaveTitle = m.relocationTargetNaveTitle || m.installedNaveTitle;
        m.installationNaveId = m.relocationTargetNaveId || m.installationNaveId;
        m.installationNaveTitle = m.relocationTargetNaveTitle || m.installationNaveTitle;
        m.relocationStatus = 'completed';
        m.status = 'operativa';
        statusChanged = true;
        syncMachineryToSupabase(m).catch(e => console.error(e));
      } else if (disTs > 0 && nowTs >= disTs && m.relocationStatus === 'desmontaje') {
        // Phase 2: Reassembly
        m.relocationStatus = 'remontaje';
        m.status = 'en_montaje';
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
    naveFloorPlans: getStudentFloorPlans(db, studentId),
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
    ? 'Letra de cambio'
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
  syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', obligation.amount, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));
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
    concept: `Liquidación tributaria / SS: ${tax.concept}`,
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
  syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', tax.amount, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));

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

function calculateMonthlyPenaltyInterest(principal: number, dueDate: Date, now: Date): number {
  if (dueDate > now) return 0;
  const daysElapsed = Math.max(0, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24)));
  const monthsElapsed = Math.max(1, Math.ceil(daysElapsed / 30));
  return Number((principal * 0.05 * monthsElapsed).toFixed(2));
}

// Automatic processing for discounted promissory notes when due date arrives
function processDiscountedPromissoryNotesMaturity(db: DatabaseSchema): boolean {
  if (!db.marketMessages || db.marketMessages.length === 0) return false;
  let modified = false;
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const todayLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  for (const msg of db.marketMessages) {
    if (msg.type === 'promissory_note' && msg.promissoryNoteData) {
      const pn = msg.promissoryNoteData;
      if ((pn.status === 'descontado' || pn.status === 'gestion_cobro') && !pn.maturityProcessed) {
        const dueStr = (pn.dueDate || '').slice(0, 10);
        const isMaturity = todayUtc >= dueStr || todayLocal >= dueStr || now.getTime() >= new Date(pn.dueDate).getTime();

        if (isMaturity) {
          const amount = Number(pn.amount);
          if (!amount || isNaN(amount) || amount <= 0) continue;

          let payer = db.users.find(u => u.id === pn.issuerId);
          if (!payer) {
            payer = db.users.find(u => 
              u.name?.toLowerCase() === pn.issuerName?.toLowerCase() ||
              (u as any).companyName?.toLowerCase() === pn.issuerName?.toLowerCase() ||
              u.username === pn.issuerId
            );
          }

          let beneficiary = db.users.find(u => u.id === pn.beneficiaryId);
          if (!beneficiary) {
            beneficiary = db.users.find(u =>
              u.name?.toLowerCase() === pn.beneficiaryName?.toLowerCase() ||
              (u as any).companyName?.toLowerCase() === pn.beneficiaryName?.toLowerCase() ||
              u.username === pn.beneficiaryId
            );
          }

          if (!payer || !beneficiary) continue;

          const isDiscountedNote = pn.status === 'descontado';
          const isCollectionNote = pn.status === 'gestion_cobro';

          // Case A: Debtor/buyer has sufficient funds to pay the note at maturity
          if (payer.balance >= amount) {
            payer.balance = Number((payer.balance - amount).toFixed(2));
            const txId = generateId('tx');

            if (isDiscountedNote) {
              // Note was previously discounted: seller already received cash in advance.
              // Debtor pays the bank which financed the advance.
              const transferConcept = `Liquidación al vencimiento de pagaré descontado ${pn.promissoryNoteNumber} - Librador: ${payer.name}`;

              const payTransfer: Transfer = {
                id: txId,
                senderId: payer.id,
                senderName: payer.name,
                senderAccount: payer.accountNumber || pn.bankIban,
                receiverId: 'corp-banco-central',
                receiverName: 'Banco Central Mercantil (Liquidación de descuento)',
                receiverAccount: 'ES210001000299887700',
                amount: amount,
                concept: transferConcept,
                timestamp: now.toISOString()
              };

              if (!db.transfers) db.transfers = [];
              db.transfers.unshift(payTransfer);

              pn.status = 'pagado';
              pn.maturityProcessed = true;
              pn.paidAt = now.toISOString();
              pn.paidTransferId = txId;
              modified = true;

              // Notification to seller: no further charges
              addNotification(
                db,
                beneficiary.id,
                'Pagaré descontado atendido al vencimiento',
                `El deudor ${payer.name} ha liquidado correctamente al vencimiento el pagaré ${pn.promissoryNoteNumber} por ${formatNumber(amount)} € que habías descontado. Operación concluida con éxito sin costes adicionales.`,
                'transfer_received',
                txId
              );

              // Notification to buyer
              addNotification(
                db,
                payer.id,
                'Cargo de pagaré al vencimiento',
                `El banco ha cargado en tu cuenta ${formatNumber(amount)} € correspondiente al vencimiento del pagaré oficial ${pn.promissoryNoteNumber} emitido a favor de ${beneficiary.name}.`,
                'transfer_received',
                txId
              );

              // Chat message in direct message thread
              const successMaturityMsg: MarketMessage = {
                id: generateId('msg'),
                chatId: msg.chatId,
                senderId: payer.id,
                senderName: payer.name,
                recipientId: beneficiary.id,
                recipientName: beneficiary.name,
                content: `🏦 Pagaré descontado liquidado al vencimiento: El deudor ${payer.name} ha atendido el cargo del pagaré ${pn.promissoryNoteNumber} por ${formatNumber(amount)} €. El banco confirma la liquidación definitiva. No procede ningún cargo adicional para el vendedor acreedor.`,
                timestamp: now.toISOString(),
                read: false,
                type: 'text'
              };
              db.marketMessages.push(successMaturityMsg);

              // Sync to Supabase
              if (payer.role === 'student') syncAccountToSupabase(payer.id, payer.name, payer.balance).catch(e => console.error(e));
              syncMovimientoToSupabase(txId + '-out', payer.id, 'TRANSFER_OUT', amount, now.toISOString(), transferConcept, payTransfer).catch(e => console.error(e));
              syncMarketMessageToSupabase(msg).catch(e => console.error(e));
              syncMarketMessageToSupabase(successMaturityMsg).catch(e => console.error(e));
            } else if (isCollectionNote) {
              // Note was placed in collection management (gestión de cobro):
              // Seller pays zero at maturity and automatically receives the full nominal amount.
              beneficiary.balance = Number((beneficiary.balance + amount).toFixed(2));

              const transferConcept = `Cobro automático al vencimiento por gestión de cobro de pagaré ${pn.promissoryNoteNumber} - Librador: ${payer.name} -> Beneficiario: ${beneficiary.name}`;

              const collectionPayTransfer: Transfer = {
                id: txId,
                senderId: payer.id,
                senderName: payer.name,
                senderAccount: payer.accountNumber || pn.bankIban,
                receiverId: beneficiary.id,
                receiverName: beneficiary.name,
                receiverAccount: beneficiary.accountNumber || 'ES00 0000 0000 0000 0000',
                amount: amount,
                concept: transferConcept,
                timestamp: now.toISOString()
              };

              if (!db.transfers) db.transfers = [];
              db.transfers.unshift(collectionPayTransfer);

              pn.status = 'pagado';
              pn.maturityProcessed = true;
              pn.paidAt = now.toISOString();
              pn.paidTransferId = txId;
              pn.collectionAutoCollectedAt = now.toISOString();
              modified = true;

              // Notification to seller
              addNotification(
                db,
                beneficiary.id,
                'Pagaré en gestión de cobro cobrado con éxito',
                `El pagaré oficial ${pn.promissoryNoteNumber} emitido por ${payer.name} ha vencido hoy y el banco ha tramitado el cobro automático. Se han ingresado +${formatNumber(amount)} € en tu cuenta corriente sin necesidad de ninguna acción adicional.`,
                'transfer_received',
                txId
              );

              // Notification to buyer
              addNotification(
                db,
                payer.id,
                'Cargo de pagaré al vencimiento (gestión de cobro)',
                `El banco ha cargado en tu cuenta ${formatNumber(amount)} € correspondiente al vencimiento del pagaré oficial ${pn.promissoryNoteNumber} presentado en gestión de cobro por ${beneficiary.name}.`,
                'transfer_received',
                txId
              );

              // Chat message in direct message thread
              const successCollectionMsg: MarketMessage = {
                id: generateId('msg'),
                chatId: msg.chatId,
                senderId: payer.id,
                senderName: payer.name,
                recipientId: beneficiary.id,
                recipientName: beneficiary.name,
                content: `🏛️ PAGARÉ EN GESTIÓN DE COBRO LIQUIDADO AUTOMÁTICAMENTE: El banco ha tramitado con éxito el cobro automático al vencimiento del pagaré ${pn.promissoryNoteNumber}. Se han cargado ${formatNumber(amount)} € en la cuenta del comprador deudor (${payer.name}) y se han abonado íntegramente +${formatNumber(amount)} € en la cuenta del vendedor acreedor (${beneficiary.name}).`,
                timestamp: now.toISOString(),
                read: false,
                type: 'text'
              };
              db.marketMessages.push(successCollectionMsg);

              // Sync to Supabase
              if (payer.role === 'student') syncAccountToSupabase(payer.id, payer.name, payer.balance).catch(e => console.error(e));
              if (beneficiary.role === 'student') syncAccountToSupabase(beneficiary.id, beneficiary.name, beneficiary.balance).catch(e => console.error(e));
              syncMovimientoToSupabase(txId + '-out', payer.id, 'TRANSFER_OUT', amount, now.toISOString(), transferConcept, collectionPayTransfer).catch(e => console.error(e));
              syncMovimientoToSupabase(txId + '-in', beneficiary.id, 'TRANSFER_IN', amount, now.toISOString(), transferConcept, collectionPayTransfer).catch(e => console.error(e));
              syncMarketMessageToSupabase(msg).catch(e => console.error(e));
              syncMarketMessageToSupabase(successCollectionMsg).catch(e => console.error(e));
            }
          } else {
            // Case B: Debtor/buyer DOES NOT have sufficient funds -> Return note to seller as unpaid
            const txId = generateId('tx');

            if (isDiscountedNote) {
              // Discounted note returned: seller repays nominal (advanced earlier by bank) + 1% return commission
              const unpaidCommission = Number((amount * 0.01).toFixed(2));
              const totalDebitVendor = Number((amount + unpaidCommission).toFixed(2));

              beneficiary.balance = Number((beneficiary.balance - totalDebitVendor).toFixed(2));

              const txNominalId = generateId('tx');
              const txFeeId = generateId('tx');

              const nominalReturnConcept = `Reintegro del nominal de pagaré descontado devuelto por impago ${pn.promissoryNoteNumber} (librador: ${payer.name}) - Devolución de anticipo bancario: -${formatNumber(amount)} €`;
              const feeReturnConcept = `Comisión bancaria por devolución de pagaré descontado impagado ${pn.promissoryNoteNumber} (1% sobre ${formatNumber(amount)} €) - Falta de fondos del librador: -${formatNumber(unpaidCommission)} €`;

              const nominalReturnTransfer: Transfer = {
                id: txNominalId,
                senderId: beneficiary.id,
                senderName: beneficiary.name,
                senderAccount: beneficiary.accountNumber || 'ES00 0000 0000 0000 0000',
                receiverId: 'corp-banco-central',
                receiverName: 'Banco Central Mercantil (Reintegro nominal de descuento impagado)',
                receiverAccount: 'ES210001000299887700',
                amount: amount,
                concept: nominalReturnConcept,
                timestamp: now.toISOString()
              };

              const feeReturnTransfer: Transfer = {
                id: txFeeId,
                senderId: beneficiary.id,
                senderName: beneficiary.name,
                senderAccount: beneficiary.accountNumber || 'ES00 0000 0000 0000 0000',
                receiverId: 'corp-banco-central',
                receiverName: 'Banco Central Mercantil (Comisión de devolución de efectos)',
                receiverAccount: 'ES210001000299887700',
                amount: unpaidCommission,
                concept: feeReturnConcept,
                timestamp: new Date(now.getTime() + 1000).toISOString()
              };

              if (!db.transfers) db.transfers = [];
              db.transfers.unshift(feeReturnTransfer);
              db.transfers.unshift(nominalReturnTransfer);

              pn.status = 'impagado';
              pn.maturityProcessed = true;
              pn.unpaidReturnedAt = now.toISOString();
              pn.unpaidFeeRate = 1;
              pn.unpaidFeeAmount = unpaidCommission;
              pn.unpaidNominalReimbursed = amount;
              pn.unpaidTotalDebited = totalDebitVendor;
              pn.unpaidReturnTransferId = txNominalId;
              pn.unpaidFeeTransferId = txFeeId;
              modified = true;

              // Notification to seller
              addNotification(
                db,
                beneficiary.id,
                'Pagaré descontado devuelto por impago (cargo de nominal + comisión)',
                `El deudor ${payer.name} no disponía de saldo para atender el pagaré ${pn.promissoryNoteNumber} (${formatNumber(amount)} €). Al haber sido descontado anticipadamente, el banco ha adeudado en tu cuenta: 1) Reintegro del nominal adelantado: -${formatNumber(amount)} €; 2) Comisión de devolución (1%): -${formatNumber(unpaidCommission)} €. Total cargado: -${formatNumber(totalDebitVendor)} €. Puedes presentar demanda ejecutiva en el Juzgado (Portal Judicial).`,
                'transfer_received',
                txNominalId
              );

              // Notification to buyer
              addNotification(
                db,
                payer.id,
                'Pagaré devuelto impagado al tenedor',
                `No disponías de saldo suficiente para atender el vencimiento del pagaré ${pn.promissoryNoteNumber} (${formatNumber(amount)} €). El banco ha devuelto el efecto como impagado a ${beneficiary.name}, quien podrá iniciar acciones ejecutivas judiciales.`,
                'transfer_received',
                txNominalId
              );

              // Chat message in direct message thread
              const protestMaturityMsg: MarketMessage = {
                id: generateId('msg'),
                chatId: msg.chatId,
                senderId: beneficiary.id,
                senderName: beneficiary.name,
                recipientId: payer.id,
                recipientName: payer.name,
                content: `❌ Pagaré descontado devuelto por impago: El librador ${payer.name} no disponía de fondos suficientes para atender el pagaré ${pn.promissoryNoteNumber} por ${formatNumber(amount)} € a su vencimiento. Al haber sido descontado previamente, el banco ha cargado en la cuenta del vendedor acreedor (${beneficiary.name}):\n• Reintegro del nominal anticipado: -${formatNumber(amount)} €\n• Comisión bancaria por devolución (1%): -${formatNumber(unpaidCommission)} €\n• Total adeudado: -${formatNumber(totalDebitVendor)} €\nEl efecto queda en estado de impago con plena fuerza ejecutiva cambiaria.`,
                timestamp: now.toISOString(),
                read: false,
                type: 'text'
              };
              db.marketMessages.push(protestMaturityMsg);

              // Sync to Supabase
              if (beneficiary.role === 'student') syncAccountToSupabase(beneficiary.id, beneficiary.name, beneficiary.balance).catch(e => console.error(e));
              syncMovimientoToSupabase(txNominalId + '-out', beneficiary.id, 'TRANSFER_OUT', amount, now.toISOString(), nominalReturnConcept, nominalReturnTransfer).catch(e => console.error(e));
              syncMovimientoToSupabase(txFeeId + '-out', beneficiary.id, 'TRANSFER_OUT', unpaidCommission, new Date(now.getTime() + 1000).toISOString(), feeReturnConcept, feeReturnTransfer).catch(e => console.error(e));
              syncMarketMessageToSupabase(msg).catch(e => console.error(e));
              syncMarketMessageToSupabase(protestMaturityMsg).catch(e => console.error(e));
            } else if (isCollectionNote) {
              // Collection management note returned: seller charged 40 € fixed unpaid return commission
              const unpaidCommission = 40.00;

              beneficiary.balance = Number((beneficiary.balance - unpaidCommission).toFixed(2));
              const returnConcept = `Comisión por devolución de pagaré impagado en gestión de cobro ${pn.promissoryNoteNumber} por falta de fondos del librador (${payer.name}) - Tarifa bancaria fija: -40,00 €`;

              const returnTransfer: Transfer = {
                id: txId,
                senderId: beneficiary.id,
                senderName: beneficiary.name,
                senderAccount: beneficiary.accountNumber || 'ES00 0000 0000 0000 0000',
                receiverId: 'corp-banco-central',
                receiverName: 'Banco Central Mercantil (Devolución de efectos en gestión de cobro)',
                receiverAccount: 'ES210001000299887700',
                amount: unpaidCommission,
                concept: returnConcept,
                timestamp: now.toISOString()
              };

              if (!db.transfers) db.transfers = [];
              db.transfers.unshift(returnTransfer);

              pn.status = 'impagado';
              pn.maturityProcessed = true;
              pn.unpaidReturnedAt = now.toISOString();
              pn.collectionUnpaidFeeAmount = unpaidCommission;
              pn.unpaidReturnTransferId = txId;
              modified = true;

              // Notification to seller
              addNotification(
                db,
                beneficiary.id,
                'Pagaré en gestión de cobro devuelto por impago',
                `El librador ${payer.name} no disponía de saldo para atender el pagaré ${pn.promissoryNoteNumber} (${formatNumber(amount)} €). El banco te lo ha devuelto como IMPAGADO con un cargo de 40,00 € por comisión de devolución. Puedes interponer demanda ejecutiva en el Juzgado (Portal Judicial).`,
                'transfer_received',
                txId
              );

              // Notification to buyer
              addNotification(
                db,
                payer.id,
                'Pagaré Devuelto Impagado al Tenedor',
                `No disponías de saldo suficiente para atender el vencimiento del pagaré ${pn.promissoryNoteNumber} (${formatNumber(amount)} €). El banco ha devuelto el efecto como impagado a ${beneficiary.name}, quien podrá iniciar acciones ejecutivas en los Tribunales.`,
                'transfer_received',
                txId
              );

              // Chat message in direct message thread
              const protestCollectionMsg: MarketMessage = {
                id: generateId('msg'),
                chatId: msg.chatId,
                senderId: beneficiary.id,
                senderName: beneficiary.name,
                recipientId: payer.id,
                recipientName: payer.name,
                content: `❌ PAGARÉ EN GESTIÓN DE COBRO DEVUELTO POR IMPAGO: El deudor ${payer.name} no disponía de saldo suficiente para atender el vencimiento del pagaré ${pn.promissoryNoteNumber} por ${formatNumber(amount)} €. El banco ha devuelto el pagaré al vendedor acreedor (${beneficiary.name}) como IMPAGADO con un cargo de 40,00 € en concepto de comisión por efecto devuelto. El pagaré conserva plena fuerza ejecutiva cambiaria para su reclamación judicial.`,
                timestamp: now.toISOString(),
                read: false,
                type: 'text'
              };
              db.marketMessages.push(protestCollectionMsg);

              // Sync to Supabase
              if (beneficiary.role === 'student') syncAccountToSupabase(beneficiary.id, beneficiary.name, beneficiary.balance).catch(e => console.error(e));
              syncMovimientoToSupabase(txId + '-out', beneficiary.id, 'TRANSFER_OUT', unpaidCommission, now.toISOString(), returnConcept, returnTransfer).catch(e => console.error(e));
              syncMarketMessageToSupabase(msg).catch(e => console.error(e));
              syncMarketMessageToSupabase(protestCollectionMsg).catch(e => console.error(e));
            }
          }
        }
      }
    }
  }

  return modified;
}

function processStudentAutomaticPayments(db: DatabaseSchema, targetStudentId?: string) {
  const now = new Date();
  let modified = false;

  if (processDiscountedPromissoryNotesMaturity(db)) {
    modified = true;
  }

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

    // 1. Obligations (Exclude promissory notes/pagarés which must be settled manually by student transfer)
    if (db.paymentObligations) {
      for (const ob of db.paymentObligations) {
        if (ob.type === 'pagare' || (ob.acquisitionId && ob.acquisitionId.startsWith('promissory_'))) {
          continue; // Pagarés are manual student-initiated transfers, not automated direct debits
        }
        if (ob.studentId === student.id && (ob.status === 'pendiente' || ob.status === 'vencido')) {
          const dDate = new Date(ob.dueDate);
          if (dDate <= now) {
            const principal = ob.amount;
            const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now);
            const totalRequired = Number((principal + penalty).toFixed(2));
            const instrumentName = ob.type === 'pagare' ? 'Pagaré' : ob.type === 'letra_cambio' ? 'Letra de cambio' : 'Cuota / Alquiler';
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
                const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now);
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
          syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', item.totalRequired, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));
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
          syncMovimientoToSupabase(newTransfer.id + '-out', student.id, 'TRANSFER_OUT', item.totalRequired, newTransfer.timestamp, newTransfer.concept, newTransfer).catch(e => console.error(e));
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

  // 1. Obligations (Exclude promissory notes/pagarés which are manual student transfers)
  if (db.paymentObligations) {
    for (const ob of db.paymentObligations) {
      if (ob.type === 'pagare' || (ob.acquisitionId && ob.acquisitionId.startsWith('promissory_'))) {
        continue; // Excluded from upcoming payments / direct debit
      }
      if (ob.studentId === studentId && ob.status !== 'pagado') {
        const dDate = new Date(ob.dueDate);
        const instrumentName = ob.type === 'pagare' ? 'Pagaré' : ob.type === 'letra_cambio' ? 'Letra de cambio' : 'Cuota / Alquiler';
        const principal = ob.amount;
        const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now);
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
            const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now);
            const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

            const item: UpcomingPaymentItem = {
              id: `${loan.id}-row-${row.period}`,
              sourceType: 'loan',
              type: 'cuota_prestamo',
              title: `Préstamo hipotecario (Ref: ${loan.id})`,
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
        const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now);
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
          installmentInfo: 'Liquidación tributaria / SS'
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
            title: `TGSS - Seg. Social empleado (6,48%)`,
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
            title: `TGSS - Seg. Social empresa (75%)`,
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
              title: `Fibra y teléfono (${contract.planName})`,
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

  // 6. Electricity Contracts & Bills (IberLuz Comercializadora)
  // 6a. Pending generated electricity bills in db.electricityBills
  if (db.electricityBills) {
    const studentBills = db.electricityBills.filter(b => b.studentId === studentId && b.status === 'pendiente');
    for (const bill of studentBills) {
      const dDate = new Date(bill.dueDate);
      const principal = bill.totalAmount;
      const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now);
      const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

      const item: UpcomingPaymentItem = {
        id: bill.id,
        sourceType: 'electricity' as any,
        type: 'cuota_electricidad' as any,
        title: `Factura de Electricidad IberLuz (Mes ${bill.periodMonth}/${bill.periodYear})`,
        concept: `Pago domiciliado de factura IberLuz Nº ${bill.billNumber}`,
        dueDate: bill.dueDate,
        principalAmount: principal,
        penaltyInterest: penalty,
        totalAmount: Number((principal + penalty).toFixed(2)),
        isOverdue: dDate <= now,
        daysRemaining: daysRem,
        installmentInfo: 'Día 5 del mes siguiente'
      };

      if (dDate <= now) {
        overdueItems.push(item);
      } else if (dDate <= thirtyFiveDaysLater) {
        upcoming30DaysItems.push(item);
      }
    }
  }

  // 6b. Active Electricity Contracts - Forecast/project future electricity bills if not already generated
  if (db.electricityContracts) {
    const activeElecContracts = db.electricityContracts.filter(c => c.studentId === studentId && c.status === 'active');
    if (activeElecContracts.length > 0) {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1; // 1-indexed

      // Check previous month, current month, and next month
      for (let mOffset = -1; mOffset <= 1; mOffset++) {
        const targetRef = new Date(curYear, (curMonth - 1) + mOffset, 1);
        const targetYear = targetRef.getFullYear();
        const targetMonth = targetRef.getMonth() + 1;

        // Check if a bill already exists in db.electricityBills (paid or pending)
        const hasExistingBill = (db.electricityBills || []).some(
          b => b.studentId === studentId && b.periodMonth === targetMonth && b.periodYear === targetYear
        );

        if (!hasExistingBill) {
          const projectedBill = calculateElectricityForStudent(studentId, targetMonth, targetYear, db);
          if (projectedBill && projectedBill.totalAmount > 0) {
            const dDate = new Date(projectedBill.dueDate);

            const alreadyAdded = upcoming30DaysItems.some(i => i.id === `projected-elec-${studentId}-${targetYear}-${targetMonth}`) ||
                                 overdueItems.some(i => i.id === `projected-elec-${studentId}-${targetYear}-${targetMonth}`);

            if (!alreadyAdded) {
              const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
              const item: UpcomingPaymentItem = {
                id: `projected-elec-${studentId}-${targetYear}-${targetMonth}`,
                sourceType: 'electricity' as any,
                type: 'cuota_electricidad' as any,
                title: `Gasto previsto de Electricidad IberLuz (Mes ${targetMonth}/${targetYear})`,
                concept: `Estimación cuota de electricidad IberLuz (${projectedBill.totalKwh} kWh)`,
                dueDate: projectedBill.dueDate,
                principalAmount: projectedBill.totalAmount,
                penaltyInterest: 0,
                totalAmount: projectedBill.totalAmount,
                isOverdue: dDate <= now,
                daysRemaining: daysRem,
                installmentInfo: 'Día 5 del mes siguiente'
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
  syncMovimientoToSupabase(feeTransfer.id + '-out', student.id, 'TRANSFER_OUT', loan.openingFee, feeTransfer.timestamp, feeTransfer.concept, feeTransfer).catch(e => console.error(e));
  syncMovimientoToSupabase(loanDisbursementTransfer.id + '-in', student.id, 'TRANSFER_IN', loan.offeredAmount, loanDisbursementTransfer.timestamp, loanDisbursementTransfer.concept, loanDisbursementTransfer).catch(e => console.error(e));

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

    let chosenRole: 'operario' | 'camionero' | 'mozo_almacen' | 'carretillero' = 'operario';
    if (role === 'camionero' || role === 'operario' || role === 'mozo_almacen' || role === 'carretillero') {
      chosenRole = role;
    } else {
      const rand = Math.random();
      if (rand < 0.50) chosenRole = 'operario';
      else if (rand < 0.75) chosenRole = 'camionero';
      else chosenRole = 'mozo_almacen';
    }

    let jobTitle = 'Operario industrial';
    if (chosenRole === 'camionero') jobTitle = 'Camionero / conductor logístico';
    else if (chosenRole === 'mozo_almacen') jobTitle = 'Mozo de almacén';
    else if (chosenRole === 'carretillero') jobTitle = 'Carretillero';

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
    role: job.role || (job.title && (job.title.toLowerCase().includes('mozo') || job.title.toLowerCase().includes('almacen') || job.title.toLowerCase().includes('almacén')) ? 'mozo_almacen' : job.title && job.title.toLowerCase().includes('camionero') ? 'camionero' : job.title && job.title.toLowerCase().includes('carretillero') ? 'carretillero' : 'operario'),
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
    details: `El alumno ${student.name} ha contratado a ${job.employeeName} (Sueldo bruto: ${job.grossSalaryMonthly}€/mes, Edad: ${job.age})`,
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

  // Unblock machinery installed in this specific property that was waiting for electricity/power
  const normTargetPropId = String(targetPropId || '');
  const normTargetPropTitle = String(targetPropTitle || '').toLowerCase().trim();

  const studentMachinery = (db.machineryAcquisitions || []).filter(m => m.studentId === studentId);
  const studentProperties = (db.acquisitions || []).filter(p => p.studentId === studentId);

  const propMachinery = studentMachinery.filter(m => {
    const mNaveId = String(m.installedAtNaveId || m.installedNaveId || m.installationNaveId || m.propertyId || m.acquisitionId || '');
    if (mNaveId && mNaveId === normTargetPropId) return true;
    const mNaveTitle = (m.installationNaveTitle || m.installedAtNaveTitle || m.installedNaveTitle || m.naveInstaladaTitulo || '').toLowerCase().trim();
    if (mNaveTitle && normTargetPropTitle && (mNaveTitle === normTargetPropTitle || mNaveTitle.includes(normTargetPropTitle) || normTargetPropTitle.includes(mNaveTitle))) return true;
    if (!mNaveId && !mNaveTitle && studentProperties.length <= 1) return true;
    return false;
  });

  const propMachineryPowerNeeded = propMachinery.reduce((sum, m) => sum + (m.requiredPowerKW || m.powerKw || 35), 0);
  const propPowerNeeded = propMachineryPowerNeeded + 10;

  let unblockedCount = 0;
  if (pKw >= propPowerNeeded) {
    const now = new Date();
    const finishDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    for (const m of propMachinery) {
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
    ? `¡Suministro eléctrico contratado (${pKw} kW)! Se ha iniciado automáticamente el periodo de montaje de 8 horas para ${unblockedCount} línea(s) de maquinaria.`
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

function getStudentFloorPlans(db: any, studentId: string): NaveFloorPlan[] {
  const existingPlans = (db.naveFloorPlans || []).filter((p: any) => p.studentId === studentId);
  const studentAcquisitions = (db.acquisitions || []).filter((a: any) => a.studentId === studentId);

  // Find naves that don't have an explicit floor plan saved yet
  const naveAcquisitions = studentAcquisitions.filter((a: any) => {
    const t = (a.type || a.propertyType || '').toLowerCase();
    const title = (a.propertyTitle || a.title || '').toLowerCase();
    return t.includes('nave') || t.includes('industrial') || title.includes('nave') || title.includes('industrial');
  });

  const plans: NaveFloorPlan[] = [...existingPlans];
  for (const acq of naveAcquisitions) {
    const targetId = acq.propertyId || acq.id;
    const hasPlan = plans.some((p: any) =>
      (p.propertyId && targetId && String(p.propertyId) === String(targetId)) ||
      (p.acquisitionId && acq.id && String(p.acquisitionId) === String(acq.id)) ||
      (p.propertyTitle && acq.propertyTitle && p.propertyTitle.toLowerCase().trim() === acq.propertyTitle.toLowerCase().trim())
    );

    if (!hasPlan) {
      const naveSurface = Number(acq.surfaceM2) || 1000;
      const defaultAdminM2 = Math.max(40, Math.round(naveSurface * 0.10));
      const rawMaterialsStorageM2 = 30;
      const semiFinishedStorageM2 = 5;
      const finishedGoodsStorageM2 = 30;
      const storageZoneM2 = rawMaterialsStorageM2 + semiFinishedStorageM2 + finishedGoodsStorageM2;
      const machineryZoneM2 = Math.min(240, Math.max(0, naveSurface - storageZoneM2 - defaultAdminM2));
      const usedM2 = machineryZoneM2 + storageZoneM2 + defaultAdminM2;
      const freeZoneM2 = Math.max(0, naveSurface - usedM2);

      const defaultPlan: NaveFloorPlan = {
        id: `auto_plan_${acq.id}`,
        propertyId: targetId,
        acquisitionId: acq.id,
        propertyTitle: acq.propertyTitle || acq.title || 'Nave industrial',
        studentId,
        machineryZoneM2,
        storageZoneM2,
        rawMaterialsStorageM2,
        semiFinishedStorageM2,
        finishedGoodsStorageM2,
        adminZoneM2: defaultAdminM2,
        freeZoneM2,
        warehousesCount: 3,
        updatedAt: new Date().toISOString()
      };
      plans.push(defaultPlan);
    }
  }

  return plans;
}

app.get('/api/electricity/floor-plans', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  const plans = getStudentFloorPlans(db, String(studentId || ''));
  res.json({ success: true, floorPlans: plans });
});

app.post('/api/electricity/floor-plan', (req, res) => {
  const {
    studentId,
    propertyId,
    acquisitionId,
    propertyTitle,
    machineryZoneM2,
    storageZoneM2,
    rawMaterialsStorageM2,
    semiFinishedStorageM2,
    finishedGoodsStorageM2,
    adminZoneM2,
    freeZoneM2,
    warehousesCount
  } = req.body;
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
    plan.rawMaterialsStorageM2 = rawMaterialsStorageM2 !== undefined ? Number(rawMaterialsStorageM2) : 30;
    plan.semiFinishedStorageM2 = semiFinishedStorageM2 !== undefined ? Number(semiFinishedStorageM2) : 5;
    plan.finishedGoodsStorageM2 = finishedGoodsStorageM2 !== undefined ? Number(finishedGoodsStorageM2) : 30;
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
      rawMaterialsStorageM2: rawMaterialsStorageM2 !== undefined ? Number(rawMaterialsStorageM2) : 30,
      semiFinishedStorageM2: semiFinishedStorageM2 !== undefined ? Number(semiFinishedStorageM2) : 5,
      finishedGoodsStorageM2: finishedGoodsStorageM2 !== undefined ? Number(finishedGoodsStorageM2) : 30,
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

  const student = db.users.find((u: any) => u.id === studentId || String(u.id) === String(studentId));
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  const plan = TELECOM_PLANS.find(p => p.id === planId);
  if (!plan) return res.status(404).json({ error: 'Plan de telecomunicaciones no encontrado' });

  if (!db.telecomContracts) db.telecomContracts = [];
  if (!db.telecomInvoices) db.telecomInvoices = [];

  // Deactivate any existing active telecom contracts for this student
  db.telecomContracts.forEach((c: any) => {
    if (c.studentId === studentId || String(c.studentId) === String(studentId)) {
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
  const orders = (db.officeOrders || []).filter((o: any) => o.studentId === studentId || String(o.studentId) === String(studentId));
  orders.sort((a: any, b: any) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
  res.json({ success: true, orders });
});

app.post('/api/office-store/checkout', (req, res) => {
  const { studentId, cartItems } = req.body;
  const db = readDb();

  const student = db.users.find((u: any) => u.id === studentId || String(u.id) === String(studentId));
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
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalAmount, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

  writeDb(db);

  res.json({
    success: true,
    order,
    newBalance: student.balance,
    message: `Pedido Nº ${orderNumber} realizado con éxito. Cargados ${totalAmount.toFixed(2)} € (IVA incl.) en cuenta.`
  });
});

function autoAssignForkliftsForStudent(db: any, studentId: string) {
  const studentAcquisitions = (db.acquisitions || []).filter((a: any) => {
    if (a.studentId !== studentId) return false;
    const t = (a.propertyType || a.type || '').toLowerCase();
    const title = (a.propertyTitle || a.title || '').toLowerCase();
    return (
      t === 'nave_industrial' ||
      t === 'industrial' ||
      t === 'almacen' ||
      t === 'almacén' ||
      t === 'almacen_logistico' ||
      t === 'warehouse' ||
      title.includes('nave') ||
      title.includes('almacen') ||
      title.includes('almacén')
    );
  });

  if (studentAcquisitions.length === 0) return;

  const forklifts = (db.purchasedVehicles || []).filter(
    (v: any) => v.studentId === studentId && v.vehicleType === 'carretilla_elevadora'
  );

  for (const fk of forklifts) {
    if (!fk.assignedPropertyId) {
      const targetProp = studentAcquisitions[0];
      const pId = targetProp.id || targetProp.propertyId;
      const pTitle = targetProp.propertyTitle || targetProp.title || 'Nave industrial / almacén logístico';
      const isAlmacen = (
        targetProp.propertyType === 'almacen' ||
        targetProp.propertyType === 'almacen_logistico' ||
        targetProp.propertyTitle?.toLowerCase().includes('almacén') ||
        targetProp.propertyTitle?.toLowerCase().includes('almacen')
      );

      fk.assignedPropertyId = pId;
      fk.assignedPropertyTitle = pTitle;
      fk.assignedWarehouseIndex = 1;
      fk.assignedWarehouseName = isAlmacen
        ? `${pTitle} (Inmueble almacén logístico)`
        : `${pTitle} (Inmueble nave industrial)`;
      syncVehicleToSupabase(fk).catch((e: any) => console.error(e));
    }
  }
}

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
  autoAssignForkliftsForStudent(db, student.id);
  syncVehicleToSupabase(vehicle).catch(e => console.error(e));

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
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalPrice, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

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

app.post('/api/vehicles/buy-cart', (req, res) => {
  const { studentId, cartItems } = req.body;
  if (!studentId || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Parámetros inválidos para la compra de la cesta de vehículos.' });
  }

  const db = readDb();
  const student = db.users.find(u => u.id === studentId);
  if (!student) return res.status(404).json({ error: 'Alumno no encontrado' });

  // Calculate total base price
  let totalBasePrice = 0;
  for (const item of cartItems) {
    const qty = Number(item.quantity) || 1;
    const bp = Number(item.basePrice) || 0;
    totalBasePrice += bp * qty;
  }

  const totalIva = Math.round((totalBasePrice * 0.21) * 100) / 100;
  const grandTotal = Math.round((totalBasePrice + totalIva) * 100) / 100;

  if (student.balance < grandTotal) {
    return res.status(400).json({
      error: `Saldo insuficiente. Total con IVA (21%): ${grandTotal.toFixed(2)} €, Saldo disponible: ${student.balance.toFixed(2)} €.`
    });
  }

  if (!db.purchasedVehicles) db.purchasedVehicles = [];

  const now = new Date();
  const createdVehicles: PurchasedVehicle[] = [];

  for (const item of cartItems) {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const bPrice = Number(item.basePrice) || 0;
    const itemIva = Math.round((bPrice * 0.21) * 100) / 100;
    const itemTotal = Math.round((bPrice + itemIva) * 100) / 100;

    let img = '/images/vehicles/carretilla_elevadora.jpg';
    if (item.vehicleType === 'camion_trailer') img = '/images/vehicles/camion_trailer.jpg';
    if (item.vehicleType === 'coche_empresa') img = '/images/vehicles/coche_empresa.jpg';

    for (let i = 0; i < qty; i++) {
      const veh: PurchasedVehicle = {
        id: generateId('veh'),
        studentId: student.id,
        studentName: student.name,
        vehicleType: item.vehicleType || 'carretilla_elevadora',
        title: item.title || 'Vehículo Corporativo',
        basePrice: bPrice,
        ivaAmount: itemIva,
        totalPrice: itemTotal,
        paymentMethod: 'contado',
        purchaseDate: now.toISOString(),
        status: 'activo',
        imageUrl: img
      };

      db.purchasedVehicles.unshift(veh);
      createdVehicles.push(veh);
      syncVehicleToSupabase(veh).catch(e => console.error(e));
    }
  }

  autoAssignForkliftsForStudent(db, student.id);

  // Deduct balance
  student.balance = Math.round((student.balance - grandTotal) * 100) / 100;
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
    amount: grandTotal,
    concept: `Compra combinada de ${createdVehicles.length} vehículo(s) en la cesta`,
    timestamp: now.toISOString()
  };
  db.transfers.unshift(transfer);
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', grandTotal, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'BUY_VEHICLES_CART',
    details: `El alumno ${student.name} ha comprado ${createdVehicles.length} vehículo(s) en cesta por un total de ${grandTotal.toFixed(2)}€ (IVA incl.)`,
    timestamp: now.toISOString(),
    studentId: student.id,
    studentName: student.name
  });

  writeDb(db);

  res.json({
    success: true,
    createdCount: createdVehicles.length,
    vehicles: createdVehicles,
    newBalance: student.balance,
    message: `Adquisición en cesta completada exitosamente. ${createdVehicles.length} vehículo(s) añadidos a tu flota corporativa.`
  });
});

app.put('/api/student/vehicles/:id/assign-warehouse', (req, res) => {
  const { id } = req.params;
  const { warehouseIndex, propertyId, propertyTitle, warehouseName } = req.body;

  const db = readDb();
  if (!db.purchasedVehicles) db.purchasedVehicles = [];

  const veh = db.purchasedVehicles.find(v => v.id === id);
  if (!veh) return res.status(404).json({ error: 'Vehículo no encontrado' });

  if (warehouseIndex !== undefined && warehouseIndex !== null && warehouseIndex !== '') {
    veh.assignedWarehouseIndex = Number(warehouseIndex);
  } else {
    veh.assignedWarehouseIndex = undefined;
  }
  veh.assignedPropertyId = propertyId || undefined;
  veh.assignedPropertyTitle = propertyTitle || undefined;
  veh.assignedWarehouseName = warehouseName || undefined;

  syncVehicleToSupabase(veh).catch(e => console.error(e));
  writeDb(db);

  res.json({ success: true, vehicle: veh });
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

  syncHiredEmployeeToSupabase(emp).catch(e => console.error(e));

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
  if (user.role === 'student') {
    syncAccountToSupabase(user.id, user.name, user.balance, user.username, user.password, user.accountNumber, user.role, user.level).catch(e => console.error(e));
  }
  writeDb(db);
  res.json({ success: true, level: user.level, user });
});

app.get('/api/notifications', (req, res) => {
  const { userId } = req.query;
  const db = readDb();
  if (!db.notifications) db.notifications = [];

  let notifications = db.notifications;
  if (userId) {
    const uid = String(userId);
    notifications = notifications.filter(n => n.userId === uid || (uid === 'profesor-1' && (n.userId === 'teacher' || n.userId === 'profesor-1')));
  }
  const unreadCount = notifications.filter(n => !n.read).length;
  res.json({ success: true, notifications, unreadCount });
});

app.patch('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  if (!db.notifications) db.notifications = [];
  const notif = db.notifications.find(n => n.id === id);
  if (notif) {
    notif.read = true;
    syncNotificationToSupabase(notif).catch(e => console.error(e));
    writeDb(db);
  }
  res.json({ success: true });
});

app.post('/api/notifications/read-all', (req, res) => {
  const { userId } = req.body;
  const db = readDb();
  if (!db.notifications) db.notifications = [];
  const uid = String(userId);
  db.notifications.forEach(n => {
    if (n.userId === uid || (uid === 'profesor-1' && (n.userId === 'teacher' || n.userId === 'profesor-1'))) {
      n.read = true;
      syncNotificationToSupabase(n).catch(e => console.error(e));
    }
  });
  writeDb(db);
  res.json({ success: true });
});

function getAvailableStockForSellerProduct(sellerInv: any, title: string, materialType?: string): number {
  if (!sellerInv) return 0;
  const titleLower = (title || '').toLowerCase();
  const isPlana = titleLower.includes('plana');
  const isEstrella = titleLower.includes('estrella');

  if (isPlana) {
    const flat = (sellerInv as any).flatScrewdriversUnits ?? (sellerInv as any).metalScrewdriversUnits;
    const star = (sellerInv as any).starScrewdriversUnits ?? (sellerInv as any).ironScrewdriversUnits;
    if (flat !== undefined) return flat;
    if (star !== undefined) return 0;
    return sellerInv.producedScrewdriversUnits || 0;
  }
  if (isEstrella) {
    const star = (sellerInv as any).starScrewdriversUnits ?? (sellerInv as any).ironScrewdriversUnits;
    const flat = (sellerInv as any).flatScrewdriversUnits ?? (sellerInv as any).metalScrewdriversUnits;
    if (star !== undefined) return star;
    if (flat !== undefined) return 0;
    return sellerInv.producedScrewdriversUnits || 0;
  }
  if (materialType === 'producto_final' || titleLower.includes('destornillador')) {
    return sellerInv.producedScrewdriversUnits || 0;
  }
  if (materialType === 'hierro' || titleLower.includes('hierro')) {
    return sellerInv.ironKg || 0;
  }
  if (materialType === 'metal' || titleLower.includes('metal')) {
    return sellerInv.metalKg || 0;
  }
  if (materialType === 'plastico' || titleLower.includes('plást') || titleLower.includes('plast')) {
    return sellerInv.plasticKg || 0;
  }
  if (materialType === 'epoxi' || titleLower.includes('epoxi')) {
    return sellerInv.epoxiKg || 0;
  }
  return sellerInv.producedScrewdriversUnits || 0;
}

function syncStudentAnnouncementsStockWithInventory(db: DatabaseSchema) {
  if (!db.rawMaterialAnnouncements || db.rawMaterialAnnouncements.length === 0) return;

  for (const ann of db.rawMaterialAnnouncements) {
    if (!ann.sellerId || ann.sellerId === 'proveedor-materia-prima' || ann.sellerId === 'profesor-1') {
      continue;
    }

    const sellerInv = checkAndCalculateProduction(db, ann.sellerId);
    if (!sellerInv) continue;

    const realStock = getAvailableStockForSellerProduct(sellerInv, ann.title, ann.materialType);

    const titleLower = (ann.title || '').toLowerCase();
    const isPlana = titleLower.includes('plana');
    const isEstrella = titleLower.includes('estrella');

    const otherActiveAnns = db.rawMaterialAnnouncements.filter(
      a => a.sellerId === ann.sellerId && a.active && a.id !== ann.id
    );

    const lockedInOther = otherActiveAnns.reduce((sum, a) => {
      const aTitle = (a.title || '').toLowerCase();
      if (isPlana && !aTitle.includes('plana')) return sum;
      if (isEstrella && !aTitle.includes('estrella')) return sum;
      return sum + (typeof a.stock === 'number' ? a.stock : 0);
    }, 0);

    const availableToLock = Math.max(0, realStock - lockedInOther);
    const currentAnnStock = typeof ann.stock === 'number' ? ann.stock : 0;

    if (ann.stock === 'ilimitado' || typeof ann.stock !== 'number' || currentAnnStock > availableToLock) {
      ann.stock = availableToLock;
      if (availableToLock <= 0) {
        ann.active = false;
      } else if (ann.stock > 0 && ann.active === false && currentAnnStock <= 0) {
        ann.active = true;
      }
      ann.updatedAt = new Date().toISOString();
      syncRawMaterialAnnouncementToSupabase(ann).catch(e => console.error(e));
    }
  }
}

app.get('/api/raw-materials/announcements', (req, res) => {
  const db = readDb();
  if (!db.rawMaterialAnnouncements || db.rawMaterialAnnouncements.length === 0) {
    db.rawMaterialAnnouncements = getDefaultSeedRawMaterialAnnouncements();
    for (const ann of db.rawMaterialAnnouncements) {
      syncRawMaterialAnnouncementToSupabase(ann).catch(e => console.error(e));
    }
    writeDb(db);
  } else {
    syncStudentAnnouncementsStockWithInventory(db);
    writeDb(db);
  }
  res.json({ success: true, announcements: db.rawMaterialAnnouncements });
});

app.post('/api/raw-materials/announcements', async (req, res) => {
  const { materialType, title, presentation, unitWeightKg, isPallet, pricePerUnit, description, durationDays, stock, sellerId, sellerName, sellerLocation, sellerMunicipality, sellerProvince, isDesTornillo: rawIsDesTornillo } = req.body;
  const db = readDb();
  if (!db.rawMaterialAnnouncements) db.rawMaterialAnnouncements = getDefaultSeedRawMaterialAnnouncements();

  let sId = sellerId || 'proveedor-materia-prima';
  let sName = sellerName || 'Suministros Industriales S.A.';
  let sLevel: number | 'official' = 'official';

  const user = db.users.find(u => u.id === sId);
  if (user) {
    sName = user.role === 'teacher' ? 'BricoMaster Distribuciones, S.A.' : user.name;
    sLevel = user.role === 'teacher' ? 'official' : (user.level || 1);
  }

  const userWh = (db.acquisitions || []).find((a: any) => a.studentId === sId && (a.propertyType === 'nave_industrial' || a.propertyType === 'almacen'));
  const finalSellerLoc = sellerLocation || (userWh ? (userWh.location || userWh.municipality || userWh.propertyTitle) : ((user as any)?.location || ''));
  const finalSellerMun = sellerMunicipality || (userWh ? userWh.municipality : ((user as any)?.municipality || (user as any)?.city || ''));
  const finalSellerProv = sellerProvince || (userWh ? userWh.province : ((user as any)?.province || (user as any)?.provincia || ''));

  const isDesTornilloVal = !!rawIsDesTornillo || (user && user.level === 3);

  let finalMaterialType = materialType || 'hierro';
  let annStockValue: number | 'ilimitado' = stock !== undefined ? stock : 'ilimitado';

  if (user && user.role !== 'teacher') {
    finalMaterialType = 'producto_final';
    const sellerInv = checkAndCalculateProduction(db, user.id);

    const titleLower = (title || '').toLowerCase();
    const isPlana = titleLower.includes('plana');
    const isEstrella = titleLower.includes('estrella');

    const availableUnits = getAvailableStockForSellerProduct(sellerInv, title, finalMaterialType);

    const otherActiveAnns = (db.rawMaterialAnnouncements || []).filter(
      a => a.sellerId === user.id && a.active
    );
    const lockedInOtherAnns = otherActiveAnns.reduce((sum, a) => {
      const aTitle = (a.title || '').toLowerCase();
      if (isPlana && !aTitle.includes('plana')) return sum;
      if (isEstrella && !aTitle.includes('estrella')) return sum;
      return sum + (typeof a.stock === 'number' ? a.stock : 0);
    }, 0);

    const availableToLock = Math.max(0, availableUnits - lockedInOtherAnns);
    const requestedStock = (stock === 'ilimitado' || stock === '' || stock === undefined || stock === null)
      ? availableToLock
      : Number(stock);

    if (availableUnits <= 0) {
      return res.status(400).json({
        error: `No dispones de existencias en tu almacén de "${title || 'este producto'}" para poner a la venta. Tu stock actual es de ${availableUnits} unidades.`
      });
    }

    if (requestedStock > availableToLock) {
      return res.status(400).json({
        error: `Stock insuficiente en tu almacén: intentas poner a la venta ${requestedStock} u., pero de tus ${availableUnits} u. producidas/almacenadas ya tienes ${lockedInOtherAnns} u. comprometidas en otros anuncios. Máximo disponible a la venta: ${availableToLock} u.`
      });
    }
    annStockValue = requestedStock;
  }

  const id = generateId('rm-ann');
  const newAnn: RawMaterialAnnouncement = {
    id,
    materialType: finalMaterialType,
    title: title || (isDesTornilloVal ? 'Anuncio El Des-Tornillo' : 'Producto final alumno'),
    presentation: presentation || 'Unidades',
    unitWeightKg: (finalMaterialType === 'producto_final' || isDesTornilloVal || (title && title.toLowerCase().includes('destornillador'))) ? 0 : (Number(unitWeightKg) || 1000),
    isPallet: isPallet !== undefined ? !!isPallet : (finalMaterialType !== 'producto_final'),
    pricePerUnit: Number(pricePerUnit) || 100,
    description: description || '',
    durationDays: durationDays || 'indefinido',
    stock: annStockValue,
    active: true,
    updatedAt: new Date().toISOString(),
    sellerId: sId,
    sellerName: sName,
    sellerLevel: sLevel,
    sellerLocation: finalSellerLoc,
    sellerMunicipality: finalSellerMun,
    sellerProvince: finalSellerProv,
    isDesTornillo: isDesTornilloVal
  };

  db.rawMaterialAnnouncements.unshift(newAnn);
  await syncRawMaterialAnnouncementToSupabase(newAnn);

  const otherUsers = db.users.filter(u => u.id !== sId);
  otherUsers.forEach(u => {
    addNotification(
      db,
      u.id,
      'Nuevo Anuncio en Mercado',
      `Se ha publicado "${newAnn.title}" en Mercado por ${sName} (${newAnn.pricePerUnit.toFixed(2)} €/u).`,
      'announcement_new',
      undefined,
      newAnn.id
    );
  });

  writeDb(db);
  res.json({ success: true, announcement: newAnn, message: 'Anuncio publicado con éxito en el Mercado.' });
});

app.put(['/api/raw-materials/announcements/:id', '/api/teacher/raw-materials/announcements/:id'], async (req, res) => {
  const { id } = req.params;
  const { pricePerUnit, title, description, presentation, durationDays, stock, active, isDesTornillo, unitWeightKg, isPallet, materialType, sellerId, sellerName, sellerLevel, sellerLocation, sellerMunicipality, sellerProvince } = req.body;
  const db = readDb();

  if (!db.rawMaterialAnnouncements) db.rawMaterialAnnouncements = getDefaultSeedRawMaterialAnnouncements();
  const ann = db.rawMaterialAnnouncements.find(a => a.id === id);
  if (!ann) return res.status(404).json({ error: 'Anuncio de materia prima no encontrado' });

  const isTeacherOrOfficial = 
    ann.sellerId === 'proveedor-materia-prima' || 
    ann.sellerId === 'profesor-1' || 
    ann.sellerLevel === 'official' ||
    sellerId === 'profesor-1' ||
    ann.materialType !== 'producto_final' ||
    (materialType && materialType !== 'producto_final');

  if (!isTeacherOrOfficial && ann.sellerId) {
    const sellerInv = checkAndCalculateProduction(db, ann.sellerId);
    const annTitle = title || ann.title || '';
    const titleLower = annTitle.toLowerCase();
    const isPlana = titleLower.includes('plana');
    const isEstrella = titleLower.includes('estrella');
    const mType = ann.materialType;

    const availableUnits = getAvailableStockForSellerProduct(sellerInv, annTitle, mType);

    const otherActiveAnns = (db.rawMaterialAnnouncements || []).filter(
      a => a.sellerId === ann.sellerId && a.active && a.id !== ann.id
    );
    const lockedInOtherAnns = otherActiveAnns.reduce((sum, a) => {
      const aTitle = (a.title || '').toLowerCase();
      if (isPlana && !aTitle.includes('plana')) return sum;
      if (isEstrella && !aTitle.includes('estrella')) return sum;
      return sum + (typeof a.stock === 'number' ? a.stock : 0);
    }, 0);

    const availableToLock = Math.max(0, availableUnits - lockedInOtherAnns);

    if (stock !== undefined) {
      const requestedStock = (stock === 'ilimitado' || stock === '' || stock === null)
        ? availableToLock
        : Number(stock);

      if (requestedStock > availableToLock) {
        return res.status(400).json({
          error: `Stock insuficiente en tu almacén: intentas configurar el stock a ${requestedStock} u., pero solo dispones de ${availableToLock} u. libres (${availableUnits} u. producidas - ${lockedInOtherAnns} u. en otros anuncios).`
        });
      }
    }
  }

  const oldPrice = ann.pricePerUnit;
  if (pricePerUnit !== undefined) {
    const newPrice = Number(pricePerUnit);
    ann.pricePerUnit = newPrice;
    // If student reduced price, resolve any active price alert
    if (ann.priceAlert && ann.priceAlert.active && newPrice < oldPrice) {
      ann.priceAlert.active = false;
    }
  }
  if (title) ann.title = title;
  if (description !== undefined) ann.description = description;
  if (presentation !== undefined) ann.presentation = presentation;
  if (unitWeightKg !== undefined) {
    const isProdFinal = ann.materialType === 'producto_final' || ann.isDesTornillo || (ann.title && ann.title.toLowerCase().includes('destornillador')) || (title && title.toLowerCase().includes('destornillador'));
    ann.unitWeightKg = isProdFinal ? 0 : Number(unitWeightKg);
  }
  if (isPallet !== undefined) ann.isPallet = !!isPallet;
  if (materialType !== undefined) ann.materialType = materialType;
  if (durationDays !== undefined) ann.durationDays = durationDays;
  if (stock !== undefined) ann.stock = stock;
  if (active !== undefined) ann.active = !!active;
  if (isDesTornillo !== undefined) ann.isDesTornillo = !!isDesTornillo;
  if (sellerId !== undefined) ann.sellerId = sellerId;
  if (sellerName !== undefined) ann.sellerName = sellerName;
  if (sellerLevel !== undefined) ann.sellerLevel = sellerLevel;
  if (sellerLocation !== undefined) ann.sellerLocation = sellerLocation;
  if (sellerMunicipality !== undefined) ann.sellerMunicipality = sellerMunicipality;
  if (sellerProvince !== undefined) ann.sellerProvince = sellerProvince;
  ann.updatedAt = new Date().toISOString();

  await syncRawMaterialAnnouncementToSupabase(ann);

  writeDb(db);
  res.json({ success: true, announcement: ann });
});

app.post('/api/raw-materials/announcements/:id/price-alert', async (req, res) => {
  const { id } = req.params;
  const { message, suggestedPrice, teacherName } = req.body;
  const db = readDb();

  if (!db.rawMaterialAnnouncements) db.rawMaterialAnnouncements = getDefaultSeedRawMaterialAnnouncements();
  const ann = db.rawMaterialAnnouncements.find(a => a.id === id);
  if (!ann) return res.status(404).json({ error: 'Anuncio de materia prima no encontrado' });

  const finalMsg = message && String(message).trim()
    ? String(message).trim()
    : 'Los potenciales compradores se quejan del precio tan alto. No pueden asumirlo.';

  const numSuggested = suggestedPrice !== undefined && suggestedPrice !== null && suggestedPrice !== ''
    ? Number(suggestedPrice)
    : undefined;

  ann.priceAlert = {
    id: generateId('alert'),
    message: finalMsg,
    suggestedPrice: numSuggested,
    timestamp: new Date().toISOString(),
    active: true,
    authorName: teacherName || 'Sondeo de Mercado / El Des-Tornillo'
  };
  ann.updatedAt = new Date().toISOString();

  await syncRawMaterialAnnouncementToSupabase(ann);

  // Notify the student seller
  if (ann.sellerId) {
    addNotification(
      db,
      ann.sellerId,
      '📉 Alerta de Demanda: El Des-Tornillo',
      `Feedback sobre tu anuncio "${ann.title}": "${finalMsg}"${numSuggested ? ` (Precio recomendado: máx. ${numSuggested.toFixed(2)} €/u.)` : ''}. Se aconseja ajustar el precio unitario a la baja para activar las ventas.`,
      'market_price_alert',
      undefined,
      ann.id
    );
  }

  writeDb(db);
  res.json({ success: true, announcement: ann, message: 'Aviso de precio excesivo enviado al alumno.' });
});

app.delete('/api/raw-materials/announcements/:id/price-alert', async (req, res) => {
  const { id } = req.params;
  const db = readDb();

  if (!db.rawMaterialAnnouncements) db.rawMaterialAnnouncements = getDefaultSeedRawMaterialAnnouncements();
  const ann = db.rawMaterialAnnouncements.find(a => a.id === id);
  if (!ann) return res.status(404).json({ error: 'Anuncio de materia prima no encontrado' });

  delete ann.priceAlert;
  ann.updatedAt = new Date().toISOString();

  await syncRawMaterialAnnouncementToSupabase(ann);
  writeDb(db);
  res.json({ success: true, announcement: ann, message: 'Aviso de precio retirado.' });
});

app.delete(['/api/raw-materials/announcements/:id', '/api/teacher/raw-materials/announcements/:id'], async (req, res) => {
  const { id } = req.params;
  const db = readDb();
  if (db.rawMaterialAnnouncements) {
    db.rawMaterialAnnouncements = db.rawMaterialAnnouncements.filter(a => a.id !== id);
    writeDb(db);
  }
  await deleteRawMaterialAnnouncementFromSupabase(id);
  res.json({ success: true, message: 'Anuncio eliminado correctamente.' });
});

function ensureTransportInvoicesForTransfers(db: any) {
  if (!db.transfers || !Array.isArray(db.transfers)) return false;
  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];

  let changed = false;

  // Deduplicate existing duplicate transport/fuel invoices in rawMaterialOrders
  const seenInvoiceKeys = new Set<string>();
  const filteredOrders: any[] = [];

  for (const ord of db.rawMaterialOrders) {
    if (!ord) continue;

    const isTransOrFuel =
      ord.sellerId === 'LOGISTICA_EXTERIOR' ||
      ord.sellerId === 'SUMINISTROS_ESTACION_SERVICIO' ||
      (ord.id && String(ord.id).startsWith('rmord_trans_')) ||
      (ord.announcementId && String(ord.announcementId).startsWith('trans-inv-')) ||
      (ord.announcementId && String(ord.announcementId).startsWith('gaso-inv-'));

    if (isTransOrFuel) {
      // Key based on announcementId or (studentId + sellerId + totalAmount + timestamp minute bucket)
      let key = ord.announcementId;
      if (!key || key.startsWith('trans-inv-17') || key.startsWith('gaso-inv-17') || key.startsWith('trans-inv-18') || key.startsWith('gaso-inv-18')) {
        const timeMs = new Date(ord.requestedAt || ord.invoicedAt || 0).getTime();
        const timeBucket = Math.floor(timeMs / (120 * 1000)); // 2-minute bucket
        key = `${ord.studentId}_${ord.sellerId}_${(ord.totalAmount || 0).toFixed(2)}_${timeBucket}`;
      }

      if (seenInvoiceKeys.has(key)) {
        changed = true;
        continue; // Skip duplicate invoice
      }
      seenInvoiceKeys.add(key);
    }

    filteredOrders.push(ord);
  }

  if (changed) {
    db.rawMaterialOrders = filteredOrders;
  }

  for (const t of db.transfers) {
    if (!t || !t.amount || t.amount <= 0) continue;

    const conceptLower = (t.concept || '').toLowerCase();
    const receiverLower = (t.receiverName || '').toLowerCase();

    const isLogisticaExterior = t.receiverId === 'LOGISTICA_EXTERIOR' ||
      t.receiverId === 'transporte-logistica-oficial' ||
      receiverLower.includes('servicio exterior') ||
      receiverLower.includes('agencia de logística') ||
      receiverLower.includes('agencia de logistica') ||
      receiverLower.includes('transporte') ||
      receiverLower.includes('logistica') ||
      receiverLower.includes('logística') ||
      conceptLower.includes('servicio exterior') ||
      conceptLower.includes('gasto de transporte') ||
      conceptLower.includes('transporte') ||
      conceptLower.includes('logística') ||
      conceptLower.includes('logistica') ||
      conceptLower.includes('envíos el des-tornillo');

    const isEstacionServicio = t.receiverId === 'SUMINISTROS_ESTACION_SERVICIO' ||
      t.receiverId === 'gasolinera-oficial' ||
      receiverLower.includes('estación de servicio') ||
      receiverLower.includes('estacion de servicio') ||
      conceptLower.includes('combustible') ||
      conceptLower.includes('gasolina');

    if (!isLogisticaExterior && !isEstacionServicio) continue;

    const sellerId = isEstacionServicio ? 'SUMINISTROS_ESTACION_SERVICIO' : 'LOGISTICA_EXTERIOR';

    // Ensure receiverId is standardized
    if (isLogisticaExterior && t.receiverId === 'transporte-logistica-oficial') {
      t.receiverId = 'LOGISTICA_EXTERIOR';
      changed = true;
    }
    if (isEstacionServicio && t.receiverId === 'gasolinera-oficial') {
      t.receiverId = 'SUMINISTROS_ESTACION_SERVICIO';
      changed = true;
    }

    const senderUser = (db.users || []).find((u: any) => u.id === t.senderId);

    // If transport cost was recorded as base cost (e.g. 100€) without 21% IVA, adjust it to 121€
    if (isLogisticaExterior && t.amount === 100 && conceptLower.includes('gasto de transporte')) {
      t.amount = 121;
      if (senderUser) {
        senderUser.balance = Math.round((senderUser.balance - 21) * 100) / 100;
        syncAccountToSupabase(senderUser.id, senderUser.name, senderUser.balance, senderUser.username, senderUser.password, senderUser.accountNumber, senderUser.role).catch(e => console.error(e));
      }
      changed = true;
    }

    // Check if matching raw material order already exists
    const exists = db.rawMaterialOrders.some((o: any) =>
      o.studentId === t.senderId &&
      (
        o.id === `rmord_trans_${t.id}` ||
        o.announcementId === `trans-inv-${t.id}` ||
        o.announcementId === `gaso-inv-${t.id}` ||
        (
          o.sellerId === sellerId &&
          Math.abs((o.totalAmount || 0) - (t.amount || 0)) < 0.01 &&
          Math.abs(new Date(o.requestedAt || 0).getTime() - new Date(t.timestamp || 0).getTime()) < 120000
        )
      )
    );

    if (exists) continue;

    const sellerName = isEstacionServicio ? 'Estación de servicio - suministro de combustible' : 'Agencia de Logística y Transportes Express S.A.';
    const basePrice = Math.round(((t.amount || 0) / 1.21) * 100) / 100;
    const ivaAmount = Math.round(((t.amount || 0) - basePrice) * 100) / 100;

    let hash = 0;
    const str = String(t.id || t.timestamp || '1234');
    for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
    const num = Math.abs(hash) % 9000 + 1000;

    const invoiceOrder: any = {
      id: `rmord_trans_${t.id}`,
      studentId: t.senderId,
      studentName: senderUser ? senderUser.name : (t.senderName || 'Alumno'),
      buyerLevel: senderUser ? (senderUser.level || 1) : 1,
      sellerId,
      sellerName,
      sellerLevel: 'official',
      announcementId: isEstacionServicio ? `gaso-inv-${t.id}` : `trans-inv-${t.id}`,
      materialType: isEstacionServicio ? 'combustible' : 'transporte',
      materialTitle: t.concept || (isEstacionServicio ? 'Gasto de suministro - combustible camión' : 'Servicio exterior de transporte - traslado de existencias'),
      quantity: 1,
      unitWeightKg: 0,
      totalKg: 0,
      basePrice,
      discountPercentage: 0,
      discountAmount: 0,
      insuranceFee: 0,
      hasInsurance: false,
      ivaAmount,
      transportCost: 0,
      transportMethod: 'vendedor_envio',
      totalAmount: t.amount,
      needsTransport: false,
      deliveryAddress: 'Inmueble de destino del alumno',
      status: 'facturado',
      invoiceNumber: `FACT-2026-${num}`,
      requestedAt: t.timestamp || new Date().toISOString(),
      approvedAt: t.timestamp || new Date().toISOString(),
      deliveredAt: t.timestamp || new Date().toISOString(),
      invoicedAt: t.timestamp || new Date().toISOString(),
      inventoryCredited: true,
      items: [{
        announcementId: isEstacionServicio ? `gaso-inv-${t.id}` : `trans-inv-${t.id}`,
        materialType: isEstacionServicio ? 'combustible' : 'transporte',
        materialTitle: t.concept || (isEstacionServicio ? 'Gasto de suministro - combustible camión' : 'Servicio exterior de transporte - traslado de existencias'),
        quantity: 1,
        unitWeightKg: 0,
        totalKg: 0,
        basePrice,
        subtotal: basePrice
      }],
      lastTurnUserId: t.senderId,
      negotiationHistory: [{
        id: `neg_${t.id}`,
        authorId: sellerId,
        authorName: sellerName,
        timestamp: t.timestamp || new Date().toISOString(),
        action: 'propuesta_inicial',
        quantity: 1,
        pricePerUnit: basePrice,
        discountPercentage: 0,
        insuranceFee: 0,
        transportCost: 0,
        transportMethod: 'vendedor_envio',
        totalAmount: t.amount,
        note: t.concept
      }]
    };

    db.rawMaterialOrders.unshift(invoiceOrder);
    syncRawMaterialOrderToSupabase(invoiceOrder).catch(e => console.error(e));
    changed = true;
  }

  if (changed) {
    writeDb(db);
  }

  return changed;
}

app.get('/api/raw-materials/orders', (req, res) => {
  const { studentId } = req.query;
  const db = readDb();
  ensureTransportInvoicesForTransfers(db);
  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];

  let orders = db.rawMaterialOrders;
  if (studentId) {
    const sId = String(studentId);
    if (sId === 'profesor-1') {
      orders = orders.filter(o =>
        o.studentId === 'profesor-1' ||
        o.sellerId === 'profesor-1' ||
        o.sellerId === 'proveedor-materia-prima' ||
        !o.sellerId
      );
    } else {
      orders = orders.filter(o =>
        o.studentId === sId ||
        o.sellerId === sId
      );
    }
  } else {
    // Default call without studentId (e.g. teacher dashboard): filter out student-to-student orders
    orders = orders.filter(o =>
      o.studentId === 'profesor-1' ||
      o.sellerId === 'profesor-1' ||
      o.sellerId === 'proveedor-materia-prima' ||
      !o.sellerId
    );
  }
  orders.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  res.json({ success: true, orders });
});

app.post('/api/raw-materials/orders', (req, res) => {
  const {
    studentId,
    announcementId,
    quantity,
    items: rawItems,
    needsTransport,
    transportMethod: rawTransportMethod,
    discountPercentage: rawDiscount,
    insuranceFee: rawInsuranceFee,
    pickupVehicleId,
    destinationNaveId: rawDestinationNaveId,
    destinationWarehouseIndex,
    note
  } = req.body;
  const db = readDb();

  const buyer = db.users.find(u => u.id === studentId);
  if (!buyer) return res.status(404).json({ error: 'Alumno o usuario no encontrado' });

  const isTeacher = buyer.role === 'teacher' || buyer.id === 'profesor-1';
  const buyerName = isTeacher ? 'BricoMaster Distribuciones, S.A.' : buyer.name;
  const buyerLevel = isTeacher ? undefined : (buyer.level || 1);

  // Validate buyer warehouses
  const buyerNaves = (db.acquisitions || []).filter(a =>
    String(a.studentId) === String(buyer.id) &&
    (['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes((a.propertyType || a.type || '').toLowerCase()) ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacen'))
  );

  let targetNaveId = rawDestinationNaveId;
  if (!targetNaveId && destinationWarehouseIndex !== undefined && buyerNaves[destinationWarehouseIndex]) {
    targetNaveId = buyerNaves[destinationWarehouseIndex].id;
  }

  if (!isTeacher && buyerNaves.length > 1 && !targetNaveId) {
    return res.status(400).json({
      error: 'Tienes más de un inmueble con almacén. Debes especificar a qué inmueble deben entregarse las materias primas.'
    });
  }

  const selectedNave = buyerNaves.find(n => String(n.id) === String(targetNaveId)) || buyerNaves[0];
  const finalDestinationNaveId = selectedNave ? selectedNave.id : (targetNaveId || 'default_nave');
  const deliveryAddressStr = selectedNave
    ? `${selectedNave.propertyTitle || selectedNave.title || 'Almacén'}, ${selectedNave.location || selectedNave.direccion || 'Polígono Industrial'}`
    : 'Polígono Industrial San Fernando, Av. de la Industria 14, San Fernando de Henares';

  let itemsToProcess: Array<{ announcementId: string; quantity: number }> = [];
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    itemsToProcess = rawItems.map(i => ({
      announcementId: String(i.announcementId || i.id),
      quantity: Math.max(1, Number(i.quantity) || 1)
    }));
  } else if (announcementId) {
    itemsToProcess = [{
      announcementId: String(announcementId),
      quantity: Math.max(1, Number(quantity) || 1)
    }];
  } else {
    return res.status(400).json({ error: 'No se ha especificado ningún producto para la compra.' });
  }

  const primaryAnn = (db.rawMaterialAnnouncements || []).find(a => a.id === itemsToProcess[0].announcementId);
  if (!primaryAnn) return res.status(404).json({ error: 'Anuncio no encontrado.' });

  const sellerId = primaryAnn.sellerId || 'proveedor-materia-prima';
  const sellerName = primaryAnn.sellerName || 'Suministros Industriales S.A.';
  const sellerLevel = primaryAnn.sellerLevel || 'official';

  // --- SELLER STOCK CHECK (If seller is a student) ---
  const isStudentSeller = sellerId && sellerId !== 'proveedor-materia-prima' && sellerId !== 'profesor-1';
  if (isStudentSeller) {
    const sellerInv = checkAndCalculateProduction(db, sellerId);
    const requestedUnits = itemsToProcess.reduce((sum, i) => sum + i.quantity, 0);
    if (primaryAnn.materialType === 'producto_final') {
      const availableUnits = sellerInv.producedScrewdriversUnits || 0;
      if (requestedUnits > availableUnits) {
        return res.status(400).json({
          error: `Stock insuficiente en el almacén del vendedor (${sellerName}). Dispone de ${availableUnits} unidades de producto terminado, pero solicitas ${requestedUnits} unidades.`
        });
      }
    }
  }

  // --- EL DES-TORNILLO RESTRICTION ENFORCEMENT ---
  if (primaryAnn.isDesTornillo) {
    const isTeacherBuyer = isTeacher || buyer.username === 'pupdaniel' || buyer.role === 'teacher' || buyer.id === 'profesor-1';
    if (!isTeacherBuyer) {
      return res.status(400).json({
        error: 'Restricción de El Des-Tornillo: Solo el Profesor (cuenta "pupdaniel") puede realizar compras de los anuncios publicados en la sección El Des-Tornillo.'
      });
    }
  }

  // --- LEVEL RESTRICTION ENFORCEMENT ---
  if (!isTeacher) {
    if (buyerLevel === 1) {
      if (sellerLevel !== 'official' && sellerId !== 'proveedor-materia-prima' && sellerLevel !== 1) {
        return res.status(400).json({
          error: 'Restricción de Nivel: Los alumnos de Nivel 1 solo pueden comprar a Suministros Industriales S.A. (Proveedor Oficial) o a otros alumnos de Nivel 1.'
        });
      }
    } else if (buyerLevel === 2) {
      if (sellerLevel !== 1) {
        return res.status(400).json({
          error: 'Restricción de Nivel en Mercado: Los alumnos de Nivel 2 solo pueden realizar solicitudes de compra a alumnos de Nivel 1.'
        });
      }
    } else if (buyerLevel === 3) {
      if (sellerLevel !== 2) {
        return res.status(400).json({
          error: 'Restricción de Nivel en Mercado: Los alumnos de Nivel 3 solo pueden realizar solicitudes de compra a alumnos de Nivel 2.'
        });
      }
    }
  }

  // --- TRANSPORT LOGISTICS CHECK ---
  const transportMethod: 'vendedor_envio' | 'comprador_recogida' =
    rawTransportMethod === 'comprador_recogida' || needsTransport === false
      ? 'comprador_recogida'
      : 'vendedor_envio';

  if (transportMethod === 'comprador_recogida' && !isTeacher) {
    const hasTruckDriver = (db.hiredEmployees || []).some(e => e.studentId === buyer.id && e.role === 'camionero');
    const hasTruck = (db.purchasedVehicles || []).some(v => v.studentId === buyer.id && v.vehicleType === 'camion_trailer');

    if (!hasTruckDriver || !hasTruck) {
      return res.status(400).json({
        error: 'Requisito de Logística: Para acordar la recogida por el comprador se requiere disponer de un camión tráiler en la flota y un empleado contratado con el puesto de Camionero.'
      });
    }
  }

  const orderItems: RawMaterialOrderItem[] = [];
  let totalRequestedPallets = 0;
  let totalKg = 0;
  let basePrice = 0;

  for (const itemInput of itemsToProcess) {
    const ann = (db.rawMaterialAnnouncements || []).find(a => a.id === itemInput.announcementId);
    if (!ann) return res.status(404).json({ error: `Materia prima no encontrada (ID: ${itemInput.announcementId}).` });

    const qty = itemInput.quantity;
    const isScrewdriver = ann.materialType === 'producto_final' || ann.isDesTornillo || (ann.title && ann.title.toLowerCase().includes('destornillador'));
    const itemTotalKg = isScrewdriver ? 0 : (ann.unitWeightKg * qty);
    const itemBasePrice = Math.round((ann.pricePerUnit * qty) * 100) / 100;

    let itemRequestedPallets = 0;
    if (isScrewdriver) {
      itemRequestedPallets = qty / 10000;
    } else {
      itemRequestedPallets = itemTotalKg / 1000;
    }
    totalRequestedPallets += itemRequestedPallets;
    totalKg += itemTotalKg;
    basePrice += itemBasePrice;

    orderItems.push({
      announcementId: ann.id,
      materialType: ann.materialType,
      materialTitle: ann.title,
      quantity: qty,
      unitWeightKg: isScrewdriver ? 0 : ann.unitWeightKg,
      totalKg: itemTotalKg,
      basePrice: itemBasePrice,
      unitPrice: ann.pricePerUnit,
      subtotal: itemBasePrice,
      totalCost: itemBasePrice
    });
  }

  basePrice = Math.round(basePrice * 100) / 100;

  if (!isTeacher && buyerLevel === 1) {
    const studentAcquisitions = (db.acquisitions || []).filter(a => a.studentId === buyer.id);
    const warehouseProperties = studentAcquisitions.filter(a => {
      const pType = (a.propertyType || a.type || '').toLowerCase();
      const title = (a.propertyTitle || a.title || '').toLowerCase();
      return (
        ['nave_industrial', 'almacen', 'almacen_logistico', 'industrial', 'warehouse'].includes(pType) ||
        title.includes('nave') ||
        title.includes('almacen') ||
        title.includes('almacén')
      );
    });

    const floorPlans = getStudentFloorPlans(db, buyer.id);

    let totalStorageM2 = 0;
    let maxTotalPalletsAllowed = 0;

    if (warehouseProperties.length === 0) {
      totalStorageM2 = 65;
      maxTotalPalletsAllowed = Math.max(1, Math.floor((totalStorageM2 / 30) * 25));
    } else {
      warehouseProperties.forEach(acq => {
        const pType = (acq.propertyType || acq.type || '').toLowerCase();
        const isLogisticsWarehouse = pType.includes('almacen') || pType.includes('almacén');
        let storageM2 = 0;
        if (isLogisticsWarehouse) {
          storageM2 = Number(acq.surfaceM2 || acq.m2 || 300);
        } else {
          const matchedPlan = floorPlans.find((p: any) =>
            String(p.acquisitionId) === String(acq.id) ||
            String(p.propertyId) === String(acq.id) ||
            String(p.propertyId) === String(acq.propertyId) ||
            (p.propertyTitle && acq.propertyTitle && p.propertyTitle.trim().toLowerCase() === acq.propertyTitle.trim().toLowerCase())
          );
          if (matchedPlan) {
            const raw = Number((matchedPlan as any).rawMaterialsStorageM2);
            const fin = Number((matchedPlan as any).finishedGoodsStorageM2);
            const semi = Number((matchedPlan as any).semiFinishedStorageM2);
            const totalPlanStorage = (isNaN(raw) ? 0 : raw) + (isNaN(fin) ? 0 : fin) + (isNaN(semi) ? 0 : semi);
            storageM2 = totalPlanStorage > 0 ? totalPlanStorage : (Number((matchedPlan as any).storageZoneM2) || 65);
          } else {
            storageM2 = 65;
          }
        }
        if (!storageM2 || storageM2 <= 0) {
          storageM2 = 65;
        }
        totalStorageM2 += storageM2;
        maxTotalPalletsAllowed += Math.max(1, Math.floor((storageM2 / 30) * 25));
      });
    }

    if (totalStorageM2 <= 0) {
      totalStorageM2 = 65;
      maxTotalPalletsAllowed = Math.max(1, Math.floor((totalStorageM2 / 30) * 25));
    }

    const targetNaveIdStr = String(selectedNave ? (selectedNave.id || selectedNave.propertyId) : '');
    const naveForklift = (db.purchasedVehicles || []).find(v =>
      String(v.studentId) === String(buyer.id) &&
      v.vehicleType === 'carretilla_elevadora' &&
      (
        String(v.assignedPropertyId) === targetNaveIdStr ||
        (buyerNaves.length === 1 && (v.assignedWarehouseIndex !== undefined && v.assignedWarehouseIndex !== null))
      )
    );

    if (!naveForklift) {
      const naveName = selectedNave ? (selectedNave.propertyTitle || selectedNave.title || 'Almacén') : 'Almacén';
      return res.status(400).json({
        error: `Requisito no cumplido: El inmueble/almacén de destino "${naveName}" no tiene ninguna carretilla elevadora contrapesada asignada. Debes adquirir y/o asignar una carretilla elevadora a esta propiedad desde la Gestión de Flotas / Concesionario para poder recibir materias primas o compras en ella.`
      });
    }

    const inv = checkAndCalculateProduction(db, buyer.id);
    const ironPallets = (inv.ironKg || 0) / 1000;
    const plasticPallets = (inv.plasticKg || 0) / 1000;
    const epoxiPallets = (inv.epoxiKg || 0) / 1000;
    const currentRawStockPallets = ironPallets + plasticPallets + epoxiPallets;

    const starRods = ((inv as any).producedStarRodsUnits || (inv as any).producedIronRodsUnits || 0);
    const flatRods = ((inv as any).producedFlatRodsUnits || (inv as any).producedMetalRodsUnits || 0);
    const starScrewdrivers = ((inv as any).starScrewdriversUnits || (inv as any).ironScrewdriversUnits || 0);
    const flatScrewdrivers = ((inv as any).flatScrewdriversUnits || (inv as any).metalScrewdriversUnits || 0);

    const rodsPallets = (buyerLevel === 1 ? (starRods + flatRods) : 0) / 10000;
    const screwdriversPallets = (starScrewdrivers + flatScrewdrivers) / 10000;
    const currentTotalStockPallets = currentRawStockPallets + rodsPallets + screwdriversPallets;

    // Check warehouse capacity (identically aligned with Existencias in CompanyDashboard and Superficie y capacidad in Mercado)
    if (totalRequestedPallets > 0 && (currentTotalStockPallets + totalRequestedPallets) > (maxTotalPalletsAllowed + 0.001)) {
      const freePallets = Math.max(0, maxTotalPalletsAllowed - currentTotalStockPallets);
      return res.status(400).json({
        error: `Exceso de capacidad en almacén: Tienes ${totalStorageM2} m² de zona de almacén (${maxTotalPalletsAllowed} palets de capacidad máxima). Tu stock actual ocupa ${currentTotalStockPallets.toFixed(2)} palets y el pedido suma ${totalRequestedPallets.toFixed(2)} palets, superando la capacidad máxima de ${maxTotalPalletsAllowed} palets (espacio libre actual: ${freePallets.toFixed(2)} palets).`
      });
    }
  }

  const discountPercentage = Math.min(50, Math.max(0, Number(rawDiscount) || 0));
  const discountAmount = Math.round((basePrice * (discountPercentage / 100)) * 100) / 100;
  const taxableBase = basePrice - discountAmount;
  const insuranceFee = Math.max(0, Number(rawInsuranceFee) || 0);

  // Unified Transport Calculation: 0.38 € / pallet / km (range 0.35 - 0.40 €/palet/km)
  // Partial pallets are charged as full pallets (Math.ceil)
  const chargedPallets = totalRequestedPallets > 0 ? Math.max(1, Math.ceil(totalRequestedPallets)) : 0;
  const buyerLoc = selectedNave || buyer;
  const sellerLoc = (db.acquisitions || []).find(a => String(a.studentId) === String(sellerId)) || primaryAnn.sellerName || primaryAnn.sellerId || 'Almacén Central Oficial';
  const distanceKm = calculateSpanishDistanceKm(buyerLoc, sellerLoc);

  let transportCost = 0;
  if (transportMethod === 'vendedor_envio') {
    transportCost = Math.round(chargedPallets * distanceKm * 0.38 * 100) / 100;
  }

  // Insurance is not subject to VAT (exempt)
  const ivaAmount = Math.round(((taxableBase + transportCost) * 0.21) * 100) / 100;
  const totalAmount = Math.round((taxableBase + transportCost + insuranceFee + ivaAmount) * 100) / 100;

  const isTeacherBuyer = isTeacher || buyer.username === 'pupdaniel' || buyer.role === 'teacher' || buyer.id === 'profesor-1';
  const isTeacherSeller = sellerId === 'proveedor-materia-prima' || sellerId === 'profesor-1' || sellerLevel === 'official' || primaryAnn.sellerId === 'profesor-1' || primaryAnn.sellerId === 'proveedor-materia-prima';
  const isAutoApproved = (isTeacherSeller && (!isTeacher || buyerLevel === 1)) || (isTeacherBuyer && isStudentSeller);

  if (isAutoApproved) {
    if (buyer.balance < totalAmount && !isTeacherBuyer) {
      return res.status(400).json({
        error: `Saldo insuficiente en tu cuenta bancaria (${buyer.balance.toFixed(2)} € disponible) para realizar esta compra por importe de ${totalAmount.toFixed(2)} €.`
      });
    }
    if (!isTeacherBuyer) {
      buyer.balance = Math.round((buyer.balance - totalAmount) * 100) / 100;
      syncAccountToSupabase(buyer.id, buyer.name, buyer.balance, buyer.username, buyer.password, buyer.accountNumber, buyer.role).catch(e => console.error(e));
    }
  }

  const now = new Date();
  const summaryTitle = orderItems.length === 1
    ? orderItems[0].materialTitle
    : orderItems.map(i => `${i.materialTitle} (${i.quantity} u.)`).join(', ');

  const totalUnits = orderItems.reduce((sum, i) => sum + i.quantity, 0);

  const initialNegotiation: NegotiationHistoryEntry = {
    id: generateId('neg'),
    authorId: buyer.id,
    authorName: buyerName,
    timestamp: now.toISOString(),
    action: 'propuesta_inicial',
    quantity: totalUnits,
    pricePerUnit: totalUnits > 0 ? Math.round((basePrice / totalUnits) * 100) / 100 : basePrice,
    discountPercentage,
    insuranceFee,
    transportCost,
    distanceKm,
    chargedPallets,
    transportMethod,
    totalAmount,
    note: note || 'Solicitud inicial de compra realizada'
  };

  const order: RawMaterialOrder = {
    id: generateId('rmord'),
    studentId: buyer.id,
    studentName: buyerName,
    buyerLevel,
    sellerId,
    sellerName,
    sellerLevel,
    announcementId: orderItems[0].announcementId,
    materialType: orderItems[0].materialType,
    materialTitle: summaryTitle,
    quantity: totalUnits,
    unitWeightKg: totalUnits > 0 ? Math.round(totalKg / totalUnits) : 0,
    totalKg,
    basePrice,
    subtotalAmount: basePrice,
    unitPrice: orderItems.length === 1 ? orderItems[0].unitPrice : (totalUnits > 0 ? Math.round((basePrice / totalUnits) * 100) / 100 : basePrice),
    discountPercentage,
    discountAmount,
    insuranceFee,
    hasInsurance: insuranceFee > 0,
    ivaAmount,
    transportCost,
    distanceKm,
    chargedPallets,
    transportMethod,
    totalAmount,
    needsTransport: transportMethod === 'vendedor_envio',
    deliveryAddress: deliveryAddressStr,
    destinationNaveId: finalDestinationNaveId,
    pickupVehicleId: pickupVehicleId || undefined,
    status: isAutoApproved ? 'entregado' : 'pendiente',
    requestedAt: now.toISOString(),
    approvedAt: isAutoApproved ? now.toISOString() : undefined,
    deliveredAt: isAutoApproved ? now.toISOString() : undefined,
    estimatedDeliveryDays: isAutoApproved ? 0 : undefined,
    estimatedDeliveryAt: isAutoApproved ? now.toISOString() : undefined,
    items: orderItems,
    lastTurnUserId: buyer.id,
    negotiationHistory: [initialNegotiation]
  };

  if (isAutoApproved) {
    order.negotiationHistory.push({
      id: generateId('neg'),
      authorId: sellerId,
      authorName: sellerName,
      timestamp: now.toISOString(),
      action: 'aceptado',
      quantity: totalUnits,
      pricePerUnit: totalUnits > 0 ? Math.round((basePrice / totalUnits) * 100) / 100 : basePrice,
      discountPercentage,
      insuranceFee,
      transportCost,
      transportMethod,
      totalAmount,
      note: 'Compra aceptada y entregada de forma inmediata'
    });

    // Process inventory and announcement stock deductions
    processStockDeductionForOrder(db, order);

    // If teacher is buying from student seller (Level 3 sale)
    if (isTeacherBuyer && isStudentSeller) {
      const sellerUser = db.users.find(u => u.id === sellerId);
      if (sellerUser) {
        // 1. Credit sale amount (totalAmount = subtotal + IVA) to seller
        sellerUser.balance = Math.round((sellerUser.balance + totalAmount) * 100) / 100;

        const txPayment = generateId('tx');
        const transferPayment: Transfer = {
          id: txPayment,
          senderId: buyer.id,
          senderName: buyerName,
          senderAccount: buyer.accountNumber || 'ES990001000988776655',
          receiverId: sellerUser.id,
          receiverName: sellerUser.name,
          receiverAccount: sellerUser.accountNumber || 'ES990001000988770000',
          amount: totalAmount,
          concept: `Venta El Des-Tornillo: ${summaryTitle}`,
          timestamp: now.toISOString()
        };
        db.transfers.unshift(transferPayment);

        // 2. Transport charge check on Seller
        const sellerHasTruck = (db.purchasedVehicles || []).some(
          v => String(v.studentId) === String(sellerId) &&
          ((v.vehicleType as string) === 'camion_trailer' || (v.vehicleType as string) === 'camion_ligero' || (v.vehicleType as string) === 'camion' || (v.vehicleType || '').toLowerCase().includes('camion'))
        );
        const sellerHasDriver = (db.hiredEmployees || []).some(
          e => String(e.studentId) === String(sellerId) &&
          ((e.role as string) === 'camionero' || (e.role as string) === 'conductor')
        );

        let transportExpense = 0;
        let transportConcept = '';
        let transportNote = '';
        let baseTransportFee = 0;
        let ivaTransportFee = 0;

        if (sellerHasTruck && sellerHasDriver) {
          transportExpense = Math.min(transportCost, Math.round((15 + totalUnits * 0.50) * 100) / 100);
          baseTransportFee = Math.round((transportExpense / 1.21) * 100) / 100;
          ivaTransportFee = Math.round((transportExpense - baseTransportFee) * 100) / 100;
          transportConcept = `Suministro de Gasolina / Combustible - Envíos El Des-Tornillo (${totalUnits} u.)`;
          transportNote = `Se han descontado ${transportExpense.toFixed(2)} € por suministro de gasolina (al disponer de camión y camionero en plantilla).`;
        } else {
          baseTransportFee = transportCost;
          ivaTransportFee = Math.round((baseTransportFee * 0.21) * 100) / 100;
          transportExpense = Math.round((baseTransportFee + ivaTransportFee) * 100) / 100;
          transportConcept = `Gasto de Transporte y Logística Externa - Envíos El Des-Tornillo (${totalUnits} u.)`;
          transportNote = `Se han descontado ${transportExpense.toFixed(2)} € (${baseTransportFee.toFixed(2)} € base + ${ivaTransportFee.toFixed(2)} € IVA 21%) por servicio de transporte y logística externa.`;
        }

        if (transportExpense > 0) {
          sellerUser.balance = Math.round((sellerUser.balance - transportExpense) * 100) / 100;
          syncAccountToSupabase(sellerUser.id, sellerUser.name, sellerUser.balance, sellerUser.username, sellerUser.password, sellerUser.accountNumber, sellerUser.role).catch(e => console.error(e));

          const txTransport = generateId('tx');
          const transferTransport: Transfer = {
            id: txTransport,
            senderId: sellerUser.id,
            senderName: sellerUser.name,
            senderAccount: sellerUser.accountNumber || 'ES990001000988770000',
            receiverId: sellerHasTruck && sellerHasDriver ? 'SUMINISTROS_ESTACION_SERVICIO' : 'LOGISTICA_EXTERIOR',
            receiverName: sellerHasTruck && sellerHasDriver ? 'Suministros de Gasolina y Combustible S.A.' : 'Agencia de Logística y Transportes Express S.A.',
            receiverAccount: 'ES990001000988771122',
            amount: transportExpense,
            concept: transportConcept,
            timestamp: now.toISOString()
          };
          db.transfers.unshift(transferTransport);

          const transportInvoiceOrder: RawMaterialOrder = {
            id: `rmord_trans_${txTransport}`,
            studentId: sellerUser.id,
            studentName: sellerUser.name,
            buyerLevel: sellerUser.level || 1,
            sellerId: sellerHasTruck && sellerHasDriver ? 'SUMINISTROS_ESTACION_SERVICIO' : 'LOGISTICA_EXTERIOR',
            sellerName: sellerHasTruck && sellerHasDriver ? 'Estación de servicio - suministro de combustible' : 'Agencia de Logística y Transportes Express S.A.',
            sellerLevel: 'official',
            announcementId: `trans-inv-${txTransport}`,
            materialType: sellerHasTruck && sellerHasDriver ? 'combustible' : 'transporte',
            materialTitle: transportConcept,
            quantity: 1,
            unitWeightKg: totalUnits,
            totalKg: totalUnits,
            basePrice: baseTransportFee,
            subtotalAmount: baseTransportFee,
            unitPrice: baseTransportFee,
            discountPercentage: 0,
            discountAmount: 0,
            insuranceFee: 0,
            hasInsurance: false,
            ivaAmount: ivaTransportFee,
            vatAmount: ivaTransportFee,
            vatRate: 21,
            transportCost: 0,
            transportMethod: 'vendedor_envio',
            totalAmount: transportExpense,
            needsTransport: false,
            deliveryAddress: deliveryAddressStr || 'Dirección comercial registrada',
            status: 'facturado',
            invoiceNumber: `FACT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
            requestedAt: now.toISOString(),
            approvedAt: now.toISOString(),
            deliveredAt: now.toISOString(),
            invoicedAt: now.toISOString(),
            items: [{
              announcementId: `trans-inv-${txTransport}`,
              materialType: sellerHasTruck && sellerHasDriver ? 'combustible' : 'transporte',
              materialTitle: transportConcept,
              title: transportConcept,
              quantity: 1,
              unitPrice: baseTransportFee,
              subtotal: baseTransportFee,
              totalCost: baseTransportFee
            }],
            lastTurnUserId: sellerUser.id,
            negotiationHistory: [{
              id: generateId('neg'),
              authorId: sellerHasTruck && sellerHasDriver ? 'SUMINISTROS_ESTACION_SERVICIO' : 'LOGISTICA_EXTERIOR',
              authorName: sellerHasTruck && sellerHasDriver ? 'Estación de servicio - suministro de combustible' : 'Agencia de Logística y Transportes Express S.A.',
              timestamp: now.toISOString(),
              action: 'propuesta_inicial',
              quantity: 1,
              pricePerUnit: baseTransportFee,
              discountPercentage: 0,
              insuranceFee: 0,
              transportCost: 0,
              transportMethod: 'vendedor_envio',
              totalAmount: transportExpense,
              note: `Factura por ${transportConcept}`
            }]
          };

          if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
          db.rawMaterialOrders.unshift(transportInvoiceOrder);
          syncRawMaterialOrderToSupabase(transportInvoiceOrder).catch(e => console.error(e));
        }

        addNotification(
          db,
          sellerUser.id,
          '¡Venta en El Des-Tornillo!',
          `El Profesor ha comprado ${totalUnits} u. de "${summaryTitle}" por ${totalAmount.toFixed(2)} €. ${transportNote}`,
          'order_approved',
          order.id
        );
      }
    } else {
      const txId = generateId('tx');
      const transfer: Transfer = {
        id: txId,
        senderId: buyer.id,
        senderName: buyerName,
        senderAccount: buyer.accountNumber,
        receiverId: sellerId,
        receiverName: sellerName,
        receiverAccount: 'ES990001000988776655',
        amount: totalAmount,
        concept: `Compra Mercado: ${summaryTitle}`,
        timestamp: now.toISOString()
      };
      db.transfers.unshift(transfer);
      syncMovimientoToSupabase(txId + '-out', buyer.id, 'TRANSFER_OUT', totalAmount, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));
    }
  }

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  db.rawMaterialOrders.unshift(order);
  syncRawMaterialOrderToSupabase(order).catch(e => console.error(e));

  if (isAutoApproved) {
    const inv = checkAndCalculateProduction(db, buyer.id);
    syncInventoryToSupabase(inv, buyer.name).catch(e => console.error(e));

    addNotification(
      db,
      buyer.id,
      'Materia prima recibida',
      `Tu compra de "${summaryTitle}" por ${totalAmount.toFixed(2)} € ha sido aprobada y entregada de forma inmediata a tu almacén.`,
      'order_approved',
      order.id
    );

    db.systemLogs.unshift({
      id: generateId('log'),
      action: 'COMPRA_MERCADO_DIRECTA',
      details: `${buyerName} ha comprado y recibido directamente "${summaryTitle}" de ${sellerName} por ${totalAmount.toFixed(2)} €.`,
      timestamp: now.toISOString(),
      studentId: buyer.id,
      studentName: buyerName
    });

    writeDb(db);

    return res.json({
      success: true,
      order,
      message: `¡Compra realizada con éxito! Se han descontado ${totalAmount.toFixed(2)} € de tu cuenta y la materia prima ha sido entregada de forma inmediata a tu almacén.`
    });
  }

  addNotification(
    db,
    sellerId,
    'Nueva solicitud de compra',
    `${buyerName} ha enviado una solicitud de compra para "${summaryTitle}" por un importe total de ${totalAmount.toFixed(2)} €.`,
    'order_received',
    order.id
  );

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'SOLICITUD_COMPRA_MERCADO',
    details: `${buyerName} ha solicitado una compra a ${sellerName} (${summaryTitle}) por ${totalAmount.toFixed(2)} €.`,
    timestamp: now.toISOString(),
    studentId: buyer.id,
    studentName: buyerName
  });

  writeDb(db);

  res.json({
    success: true,
    order,
    message: `Solicitud de compra enviada con éxito. Pendiente de revisión por ${sellerName}.`
  });
});

app.post('/api/raw-materials/orders/:id/negotiate', (req, res) => {
  const { id } = req.params;
  const {
    userId,
    discountPercentage: rawDiscount,
    insuranceFee: rawInsuranceFee,
    transportMethod: rawTransportMethod,
    pricePerUnit: rawPricePerUnit,
    quantity: rawQty,
    note
  } = req.body;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const isTeacher = user.role === 'teacher' || user.id === 'profesor-1';
  const authorName = isTeacher ? 'BricoMaster Distribuciones, S.A.' : user.name;

  const newQty = Math.max(1, Number(rawQty) || order.quantity);
  const newPricePerUnit = Math.max(0, Number(rawPricePerUnit) || (order.basePrice / order.quantity));
  const newDiscount = Math.min(50, Math.max(0, Number(rawDiscount) || 0));
  const newInsurance = Math.max(0, Number(rawInsuranceFee) || 0);
  const transportMethod: 'vendedor_envio' | 'comprador_recogida' =
    rawTransportMethod === 'comprador_recogida' ? 'comprador_recogida' : 'vendedor_envio';

  if (transportMethod === 'comprador_recogida') {
    const buyerId = order.studentId;
    const hasTruckDriver = (db.hiredEmployees || []).some(e => e.studentId === buyerId && e.role === 'camionero');
    const hasTruck = (db.purchasedVehicles || []).some(v => v.studentId === buyerId && v.vehicleType === 'camion_trailer');
    if (!hasTruckDriver || !hasTruck) {
      return res.status(400).json({
        error: 'Requisito de Logística: Para acordar la recogida por el comprador se requiere disponer de un camión tráiler en la flota y un empleado contratado como Camionero.'
      });
    }
  }

  const newBasePrice = Math.round((newPricePerUnit * newQty) * 100) / 100;
  const newDiscountAmount = Math.round((newBasePrice * (newDiscount / 100)) * 100) / 100;
  const taxableBase = newBasePrice - newDiscountAmount;

  // Unified Transport Calculation: 0.38 € / pallet / km (range 0.35 - 0.40 €/palet/km)
  // Partial pallets are charged as full pallets (Math.ceil)
  const isFinalProduct = order.materialType === 'producto_final';
  const itemTotalKg = order.totalKg || (order.unitWeightKg * newQty);
  const calculatedPallets = isFinalProduct ? (newQty / 10000) : (itemTotalKg / 1000);
  const chargedPallets = Math.max(1, Math.ceil(calculatedPallets));
  const buyerLoc = (db.acquisitions || []).find(a => String(a.studentId) === String(order.studentId)) || order.studentName || order.studentId;
  const sellerLoc = (db.acquisitions || []).find(a => String(a.studentId) === String(order.sellerId)) || order.sellerName || order.sellerId;
  const distanceKm = calculateSpanishDistanceKm(buyerLoc, sellerLoc);

  let newTransportCost = 0;
  if (transportMethod === 'vendedor_envio') {
    newTransportCost = Math.round(chargedPallets * distanceKm * 0.38 * 100) / 100;
  }

  // Insurance is not subject to VAT (exempt)
  const newIvaAmount = Math.round(((taxableBase + newTransportCost) * 0.21) * 100) / 100;
  const newTotalAmount = Math.round((taxableBase + newTransportCost + newInsurance + newIvaAmount) * 100) / 100;

  order.quantity = newQty;
  order.basePrice = newBasePrice;
  order.discountPercentage = newDiscount;
  order.discountAmount = newDiscountAmount;
  order.insuranceFee = newInsurance;
  order.hasInsurance = newInsurance > 0;
  order.transportCost = newTransportCost;
  order.distanceKm = distanceKm;
  order.chargedPallets = chargedPallets;
  order.transportMethod = transportMethod;
  order.needsTransport = transportMethod === 'vendedor_envio';
  order.ivaAmount = newIvaAmount;
  order.totalAmount = newTotalAmount;
  order.status = 'en_negociacion';
  order.lastTurnUserId = user.id;

  const now = new Date();
  const entry: NegotiationHistoryEntry = {
    id: generateId('neg'),
    authorId: user.id,
    authorName,
    timestamp: now.toISOString(),
    action: 'contraoferta',
    quantity: newQty,
    pricePerUnit: newPricePerUnit,
    discountPercentage: newDiscount,
    insuranceFee: newInsurance,
    transportCost: newTransportCost,
    transportMethod,
    totalAmount: newTotalAmount,
    note: note || 'Contraoferta enviada'
  };

  if (!order.negotiationHistory) order.negotiationHistory = [];
  order.negotiationHistory.push(entry);

  syncRawMaterialOrderToSupabase(order).catch(e => console.error(e));

  const recipientId = user.id === order.studentId ? (order.sellerId || 'profesor-1') : order.studentId;
  addNotification(
    db,
    recipientId,
    'Contraoferta recibida',
    `${authorName} ha enviado una contraoferta para "${order.materialTitle}" por un total de ${newTotalAmount.toFixed(2)} €.`,
    'order_negotiating',
    order.id
  );

  writeDb(db);

  res.json({
    success: true,
    order,
    message: 'Contraoferta enviada correctamente.'
  });
});

app.post('/api/raw-materials/orders/:id/approve', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (order.status === 'aprobado' || order.status === 'entregado') {
    return res.status(400).json({ error: `La solicitud ya está aprobada.` });
  }

  const buyer = db.users.find(u => u.id === order.studentId);
  if (!buyer) return res.status(404).json({ error: 'Comprador no encontrado' });

  const buyerIsTeacher = buyer.role === 'teacher' || buyer.id === 'profesor-1';
  const buyerDisplayName = buyerIsTeacher ? 'BricoMaster Distribuciones, S.A.' : buyer.name;

  if (buyer.balance < order.totalAmount) {
    return res.status(400).json({
      error: `El comprador ${buyerDisplayName} no dispone de saldo suficiente (${buyer.balance.toFixed(2)} €) para cubrir el coste de ${order.totalAmount.toFixed(2)} €.`
    });
  }

  // --- STOCK DEDUCTION (Seller inventory and announcement stock) ---
  processStockDeductionForOrder(db, order);

  buyer.balance = Math.round((buyer.balance - order.totalAmount) * 100) / 100;
  syncAccountToSupabase(buyer.id, buyer.name, buyer.balance, buyer.username, buyer.password, buyer.accountNumber, buyer.role).catch(e => console.error(e));

  const seller = db.users.find(u => u.id === order.sellerId);
  if (seller && seller.role !== 'teacher') {
    seller.balance = Math.round((seller.balance + order.totalAmount) * 100) / 100;

    // Transport charge check on Seller
    const sellerHasTruck = (db.purchasedVehicles || []).some(
      v => String(v.studentId) === String(seller.id) &&
      ((v.vehicleType as string) === 'camion_trailer' || (v.vehicleType as string) === 'camion_ligero' || (v.vehicleType as string) === 'camion' || (v.vehicleType || '').toLowerCase().includes('camion'))
    );
    const sellerHasDriver = (db.hiredEmployees || []).some(
      e => String(e.studentId) === String(seller.id) &&
      ((e.role as string) === 'camionero' || (e.role as string) === 'conductor')
    );

    let transportExpense = 0;
    let transportConcept = '';
    let baseTransportFee = 0;
    let ivaTransportFee = 0;

    if (sellerHasTruck && sellerHasDriver) {
      transportExpense = Math.min(order.transportCost || 0, Math.round((15 + order.quantity * 0.50) * 100) / 100);
      baseTransportFee = Math.round((transportExpense / 1.21) * 100) / 100;
      ivaTransportFee = Math.round((transportExpense - baseTransportFee) * 100) / 100;
      transportConcept = `Suministro de Gasolina / Combustible - Envíos El Des-Tornillo (${order.quantity} u.)`;
    } else {
      baseTransportFee = order.transportCost || 0;
      ivaTransportFee = Math.round((baseTransportFee * 0.21) * 100) / 100;
      transportExpense = Math.round((baseTransportFee + ivaTransportFee) * 100) / 100;
      transportConcept = `Gasto de Transporte y Logística Externa - Envíos El Des-Tornillo (${order.quantity} u.)`;
    }

    if (transportExpense > 0) {
      seller.balance = Math.round((seller.balance - transportExpense) * 100) / 100;
      syncAccountToSupabase(seller.id, seller.name, seller.balance, seller.username, seller.password, seller.accountNumber, seller.role).catch(e => console.error(e));

      const txTransport = generateId('tx');
      const transferTransport: Transfer = {
        id: txTransport,
        senderId: seller.id,
        senderName: seller.name,
        senderAccount: seller.accountNumber || 'ES990001000988770000',
        receiverId: sellerHasTruck && sellerHasDriver ? 'SUMINISTROS_ESTACION_SERVICIO' : 'LOGISTICA_EXTERIOR',
        receiverName: sellerHasTruck && sellerHasDriver ? 'Suministros de Gasolina y Combustible S.A.' : 'Agencia de Logística y Transportes Express S.A.',
        receiverAccount: 'ES990001000988771122',
        amount: transportExpense,
        concept: transportConcept,
        timestamp: new Date().toISOString()
      };
      db.transfers.unshift(transferTransport);

      const transportInvoiceOrder: RawMaterialOrder = {
        id: `rmord_trans_${txTransport}`,
        studentId: seller.id,
        studentName: seller.name,
        buyerLevel: seller.level || 1,
        sellerId: sellerHasTruck && sellerHasDriver ? 'SUMINISTROS_ESTACION_SERVICIO' : 'LOGISTICA_EXTERIOR',
        sellerName: sellerHasTruck && sellerHasDriver ? 'Estación de servicio - suministro de combustible' : 'Agencia de Logística y Transportes Express S.A.',
        sellerLevel: 'official',
        announcementId: `trans-inv-${txTransport}`,
        materialType: sellerHasTruck && sellerHasDriver ? 'combustible' : 'transporte',
        materialTitle: transportConcept,
        quantity: 1,
        unitWeightKg: order.quantity,
        totalKg: order.quantity,
        basePrice: baseTransportFee,
        subtotalAmount: baseTransportFee,
        unitPrice: baseTransportFee,
        discountPercentage: 0,
        discountAmount: 0,
        insuranceFee: 0,
        hasInsurance: false,
        ivaAmount: ivaTransportFee,
        vatAmount: ivaTransportFee,
        vatRate: 21,
        transportCost: 0,
        transportMethod: 'vendedor_envio',
        totalAmount: transportExpense,
        needsTransport: false,
        deliveryAddress: order.deliveryAddress || 'Dirección comercial registrada',
        status: 'facturado',
        invoiceNumber: `FACT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        requestedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        invoicedAt: new Date().toISOString(),
        items: [{
          announcementId: `trans-inv-${txTransport}`,
          materialType: sellerHasTruck && sellerHasDriver ? 'combustible' : 'transporte',
          materialTitle: transportConcept,
          title: transportConcept,
          quantity: 1,
          unitPrice: baseTransportFee,
          subtotal: baseTransportFee,
          totalCost: baseTransportFee
        }],
        lastTurnUserId: seller.id,
        negotiationHistory: [{
          id: generateId('neg'),
          authorId: sellerHasTruck && sellerHasDriver ? 'SUMINISTROS_ESTACION_SERVICIO' : 'LOGISTICA_EXTERIOR',
          authorName: sellerHasTruck && sellerHasDriver ? 'Estación de servicio - suministro de combustible' : 'Agencia de Logística y Transportes Express S.A.',
          timestamp: new Date().toISOString(),
          action: 'propuesta_inicial',
          quantity: 1,
          pricePerUnit: baseTransportFee,
          discountPercentage: 0,
          insuranceFee: 0,
          transportCost: 0,
          transportMethod: 'vendedor_envio',
          totalAmount: transportExpense,
          note: `Factura por ${transportConcept}`
        }]
      };

      if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
      db.rawMaterialOrders.unshift(transportInvoiceOrder);
      syncRawMaterialOrderToSupabase(transportInvoiceOrder).catch(e => console.error(e));
    }
  }

  const now = new Date();
  const buyerLevel = buyer.level || 1;
  const isRawMaterialOrder = ['hierro', 'metal', 'plastico', 'epoxi'].includes(order.materialType) ||
    (order.items && order.items.some(i => ['hierro', 'metal', 'plastico', 'epoxi'].includes(i.materialType)));
  const isL1Raw = buyerLevel === 1 && isRawMaterialOrder;

  const deliveryDays = isL1Raw ? 0 : ((order.needsTransport && (order.quantity > 3 || (order.items && order.items.length > 1))) ? 2 : 1);
  order.status = isL1Raw ? 'entregado' : 'aprobado';
  order.approvedAt = now.toISOString();
  if (isL1Raw) {
    order.deliveredAt = now.toISOString();
  }
  order.estimatedDeliveryDays = deliveryDays;
  order.estimatedDeliveryAt = isL1Raw ? now.toISOString() : new Date(now.getTime() + deliveryDays * 24 * 60 * 60 * 1000).toISOString();

  const inv = checkAndCalculateProduction(db, order.studentId);
  syncRawMaterialOrderToSupabase(order).catch(e => console.error(e));
  syncInventoryToSupabase(inv, buyer.name).catch(e => console.error(e));

  if (!order.negotiationHistory) order.negotiationHistory = [];
  order.negotiationHistory.push({
    id: generateId('neg'),
    authorId: userId || buyer.id,
    authorName: userId ? (db.users.find(u => u.id === userId)?.name || buyerDisplayName) : buyerDisplayName,
    timestamp: now.toISOString(),
    action: 'aceptado',
    quantity: order.quantity,
    pricePerUnit: order.basePrice / order.quantity,
    discountPercentage: order.discountPercentage || 0,
    insuranceFee: order.insuranceFee || 0,
    transportCost: order.transportCost,
    transportMethod: order.transportMethod || 'vendedor_envio',
    totalAmount: order.totalAmount,
    note: 'Solicitud aceptada y operación formalizada'
  });

  syncRawMaterialOrderToSupabase(order).catch(e => console.error(e));

  const txId = generateId('tx');
  const transfer: Transfer = {
    id: txId,
    senderId: buyer.id,
    senderName: buyerDisplayName,
    senderAccount: buyer.accountNumber,
    receiverId: order.sellerId || 'proveedor-materia-prima',
    receiverName: order.sellerName || 'Suministros Industriales S.A.',
    receiverAccount: 'ES990001000988776655',
    amount: order.totalAmount,
    concept: `Compra Mercado: ${order.materialTitle}`,
    timestamp: now.toISOString()
  };
  db.transfers.unshift(transfer);
  syncMovimientoToSupabase(txId + '-out', buyer.id, 'TRANSFER_OUT', order.totalAmount, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

  addNotification(
    db,
    buyer.id,
    isL1Raw ? 'Materia prima recibida' : 'Compra formalizada',
    isL1Raw
      ? `Tu solicitud de compra para "${order.materialTitle}" por ${order.totalAmount.toFixed(2)} € ha sido aceptada por el profesor y entregada inmediatamente a tu almacén (Existencias).`
      : `Tu solicitud de compra para "${order.materialTitle}" por ${order.totalAmount.toFixed(2)} € ha sido aceptada y formalizada.`,
    'order_approved',
    order.id
  );

  if (order.sellerId && order.sellerId !== 'proveedor-materia-prima') {
    addNotification(
      db,
      order.sellerId,
      'Venta aceptada',
      `Se ha formalizado la venta de "${order.materialTitle}" a ${buyerDisplayName} por ${order.totalAmount.toFixed(2)} €.`,
      'order_approved',
      order.id
    );
  }

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'APROBAR_SOLICITUD_MERCADO',
    details: `Operación aceptada entre ${buyerDisplayName} y ${order.sellerName} por "${order.materialTitle}" (${order.totalAmount.toFixed(2)} €).`,
    timestamp: now.toISOString(),
    studentId: buyer.id,
    studentName: buyerDisplayName
  });

  writeDb(db);

  res.json({
    success: true,
    order,
    message: isL1Raw
      ? 'Solicitud aceptada. Las materias primas han sido entregadas inmediatamente al almacén del alumno.'
      : `Operación aceptada con éxito. Envío estimado en ${deliveryDays} día(s).`
  });
});

app.post('/api/raw-materials/orders/:id/reject', (req, res) => {
  const { id } = req.params;
  const { rejectionReason, userId } = req.body;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  order.status = 'rechazado';
  if (rejectionReason) {
    order.rejectionReason = rejectionReason;
  }

  const now = new Date();
  if (!order.negotiationHistory) order.negotiationHistory = [];
  order.negotiationHistory.push({
    id: generateId('neg'),
    authorId: userId || 'profesor-1',
    authorName: userId ? (db.users.find(u => u.id === userId)?.name || 'Profesor') : 'Profesor',
    timestamp: now.toISOString(),
    action: 'rechazado',
    quantity: order.quantity,
    pricePerUnit: order.basePrice / order.quantity,
    discountPercentage: order.discountPercentage || 0,
    insuranceFee: order.insuranceFee || 0,
    transportCost: order.transportCost,
    transportMethod: order.transportMethod || 'vendedor_envio',
    totalAmount: order.totalAmount,
    note: `Operación rechazada: ${rejectionReason || 'No especificado'}`
  });

  syncRawMaterialOrderToSupabase(order).catch(e => console.error(e));

  addNotification(
    db,
    order.studentId,
    'Solicitud rechazada',
    `La solicitud de compra para "${order.materialTitle}" ha sido rechazada. Motivo: ${rejectionReason || 'Sin motivo especificado'}.`,
    'order_rejected',
    order.id
  );

  if (order.sellerId && order.sellerId !== 'proveedor-materia-prima') {
    addNotification(
      db,
      order.sellerId,
      'Solicitud rechazada',
      `La solicitud para "${order.materialTitle}" ha sido rechazada. Motivo: ${rejectionReason || 'Sin motivo especificado'}.`,
      'order_rejected',
      order.id
    );
  }

  writeDb(db);

  res.json({ success: true, order, message: 'Solicitud rechazada.' });
});

// Helper to check trade permission between two users/roles
function canTradeUsers(
  buyer: { id: string; role?: string; level?: number },
  seller: { id: string; role?: string; level?: number | string }
): { allowed: boolean; reason?: string } {
  const isBuyerTeacher = buyer.id === 'profesor-1' || buyer.role === 'teacher';
  const isSellerTeacher = seller.id === 'profesor-1' || seller.role === 'teacher' || seller.id === 'proveedor-materia-prima' || seller.level === 'official';

  const buyerLevel = isBuyerTeacher ? 'teacher' : (buyer.level || 1);
  const sellerLevel = isSellerTeacher ? 'teacher' : Number(seller.level || 1);

  if (isBuyerTeacher) {
    if (isSellerTeacher) return { allowed: false, reason: 'El profesor no realiza compras a sí mismo.' };
    return { allowed: true };
  }

  if (isSellerTeacher) {
    if (buyerLevel === 1) return { allowed: true };
    return { allowed: false, reason: 'Solo las empresas de Nivel 1 pueden comprar materias primas al Profesor.' };
  }

  if (buyerLevel === 1) {
    if (sellerLevel === 1) return { allowed: true };
    return { allowed: false, reason: 'Los alumnos de Nivel 1 solo pueden comprar al Profesor (materias primas) o a otros alumnos de Nivel 1 (subcontratación).' };
  }

  if (buyerLevel === 2) {
    if (sellerLevel === 1) return { allowed: true };
    return { allowed: false, reason: 'Los Distribuidores Mayoristas (Nivel 2) solo pueden comprar a fabricantes de Nivel 1.' };
  }

  if (buyerLevel === 3) {
    if (sellerLevel === 2) return { allowed: true };
    return { allowed: false, reason: 'Los Distribuidores Minoristas (Nivel 3) solo pueden comprar a distribuidores de Nivel 2.' };
  }

  return { allowed: false, reason: 'Operación no permitida por las reglas de la cadena de suministro.' };
}

// Shipping endpoint (Vendedor envía mercancía y se descuenta de su stock)
app.post('/api/raw-materials/orders/:id/ship', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (order.status !== 'aprobado') {
    return res.status(400).json({ error: `No se puede enviar un pedido en estado "${order.status}". Debe estar previamente aprobado.` });
  }

  const isStudentSeller = order.sellerId && order.sellerId !== 'proveedor-materia-prima' && order.sellerId !== 'profesor-1';

  if (isStudentSeller) {
    if (userId && userId !== order.sellerId && userId !== 'profesor-1') {
      return res.status(403).json({ error: 'Solo el alumno vendedor puede autorizar el envío de la mercancía.' });
    }
  }

  // Ensure stock is deducted from seller inventory and announcement
  processStockDeductionForOrder(db, order);

  const now = new Date();
  order.status = 'en_transito';
  order.shippedAt = now.toISOString();

  syncRawMaterialOrderToSupabase(order).catch(e => console.error(e));

  addNotification(
    db,
    order.studentId,
    'Mercancía enviada (en tránsito)',
    `El vendedor ${order.sellerName || 'Suministrador'} ha realizado la expedición de "${order.materialTitle}". La mercancía está en tránsito hacia tu almacén.`,
    'order_approved',
    order.id
  );

  writeDb(db);

  res.json({
    success: true,
    order,
    message: 'Mercancía expedida correctamente. Se ha descontado de tu stock y la orden ha pasado a "En tránsito".'
  });
});

// Confirm Receipt / Deliver endpoint (Comprador confirma recepción)
app.post(['/api/raw-materials/orders/:id/deliver', '/api/raw-materials/orders/:id/confirm-receipt'], (req, res) => {
  const { id } = req.params;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (order.status === 'entregado' || order.status === 'finalizado' || order.status === 'facturado') {
    return res.status(400).json({ error: 'El pedido ya ha sido entregado previamente.' });
  }

  const now = new Date();
  order.status = 'entregado';
  order.deliveredAt = now.toISOString();

  // Deduct from seller stock/announcement if not already done
  processStockDeductionForOrder(db, order);

  const inv = checkAndCalculateProduction(db, order.studentId);
  syncRawMaterialOrderToSupabase(order).catch(e => console.error(e));
  syncInventoryToSupabase(inv, db.users.find(u => u.id === order.studentId)?.name).catch(e => console.error(e));

  if (order.sellerId && order.sellerId !== 'proveedor-materia-prima') {
    addNotification(
      db,
      order.sellerId,
      'Recepción confirmada por el comprador',
      `${order.studentName} ha recibido la mercancía de "${order.materialTitle}" y ha sido agregada a su inventario.`,
      'order_approved',
      order.id
    );
  }

  writeDb(db);

  res.json({ success: true, order, inventory: inv, message: 'Mercancía recibida y registrada en tu almacén.' });
});

// Manual Invoice Endpoint ("Enviar factura")
app.post('/api/raw-materials/orders/:id/send-invoice', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const db = readDb();

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const order = db.rawMaterialOrders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Solicitud no encontrada' });

  if (order.status !== 'entregado' && order.status !== 'aprobado' && order.status !== 'en_transito' && order.status !== 'finalizado') {
    return res.status(400).json({ error: `No se puede facturar un pedido en estado "${order.status}".` });
  }

  const now = new Date();
  const year = now.getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const invoiceNum = order.invoiceNumber || `FACT-${year}-${randomNum}`;

  order.status = 'facturado';
  order.invoiceNumber = invoiceNum;
  order.invoicedAt = now.toISOString();

  syncRawMaterialOrderToSupabase(order).catch(e => console.error(e));

  addNotification(
    db,
    order.studentId,
    'Factura comercial recibida',
    `El vendedor ${order.sellerName || 'Profesor'} ha emitido y enviado la factura oficial ${invoiceNum} por ${order.totalAmount.toFixed(2)} €.`,
    'order_approved',
    order.id
  );

  writeDb(db);

  res.json({
    success: true,
    order,
    invoiceNumber: invoiceNum,
    message: `Factura ${invoiceNum} emitida y notificada al comprador.`
  });
});

// Company Profiles Endpoints
app.get('/api/market/company-profiles', (req, res) => {
  const viewerId = req.query.viewerId as string;
  const db = readDb();
  if (!db.companyProfiles) db.companyProfiles = [];

  const viewer = viewerId ? db.users.find(u => u.id === viewerId) : null;

  let profiles = db.companyProfiles;
  if (viewer && viewer.role !== 'teacher') {
    profiles = profiles.filter(p => {
      // Authoring student always sees their own profile card
      if (p.studentId === viewer.id) return true;
      const seller = db.users.find(u => u.id === p.studentId);
      if (!seller) return false;
      // Level 1 profiles visible to L1 and L2; Level 2 profiles visible to L3; Level 3 to L4
      return canTradeUsers(viewer, seller).allowed;
    });
  }

  res.json({ success: true, companyProfiles: profiles });
});

app.post('/api/market/company-profile', (req, res) => {
  const { studentId, description, logoUrl } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.id === studentId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (!db.companyProfiles) db.companyProfiles = [];

  let profile = db.companyProfiles.find(p => p.studentId === studentId);
  const now = new Date().toISOString();

  if (profile) {
    profile.companyName = user.name; // Mandatory account name given by teacher
    profile.description = description !== undefined ? description : profile.description;
    profile.logoUrl = logoUrl !== undefined ? logoUrl : profile.logoUrl;
    profile.level = user.level || 1;
    profile.updatedAt = now;
  } else {
    profile = {
      id: `profile-${studentId}`,
      studentId: user.id,
      companyName: user.name, // Mandatory account name given by teacher
      description: description || '',
      logoUrl: logoUrl || '',
      level: user.level || 1,
      updatedAt: now
    };
    db.companyProfiles.push(profile);
  }

  syncCompanyProfileToSupabase(profile).catch(e => console.error(e));
  writeDb(db);

  res.json({ success: true, profile, message: 'Perfil de empresa guardado correctamente.' });
});

// Contact Partner Endpoint (When clicking "Contactar" in Company Profile)
app.post('/api/market/contact-partner', (req, res) => {
  const { userId, partnerId } = req.body;
  if (!userId || !partnerId) return res.status(400).json({ error: 'userId y partnerId son requeridos' });

  const db = readDb();
  if (!db.marketContacts) db.marketContacts = [];

  let contact = db.marketContacts.find(c => c.userId === userId && c.contactId === partnerId);
  if (!contact) {
    contact = {
      id: generateId('contact'),
      userId,
      contactId: partnerId,
      createdAt: new Date().toISOString()
    };
    db.marketContacts.push(contact);
    syncMarketContactToSupabase(contact).catch(e => console.error(e));
  }

  writeDb(db);
  res.json({ success: true, contact, message: 'Empresa añadida a tus contactos de mensajería.' });
});

// Students List Endpoint (For selecting recipient when transferring inventory)
app.get('/api/students-list', (req, res) => {
  const db = readDb();
  const students = db.users
    .filter(u => u.role === 'student')
    .map(u => {
      const acquisitions = (db.acquisitions || []).filter(a =>
        String(a.studentId) === String(u.id) &&
        (['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes((a.propertyType || a.type || '').toLowerCase()) ||
         (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
         (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
         (a.propertyTitle || a.title || '').toLowerCase().includes('almacen'))
      );
      const warehouses = acquisitions.map(a => {
        const wIdStr = String(a.id);
        const hasForklift = (db.purchasedVehicles || []).some(v =>
          String(v.studentId) === String(u.id) &&
          v.vehicleType === 'carretilla_elevadora' &&
          (
            String(v.assignedPropertyId) === wIdStr ||
            (acquisitions.length === 1 && (v.assignedWarehouseIndex !== undefined && v.assignedWarehouseIndex !== null))
          )
        );
        return {
          id: String(a.id),
          title: a.propertyTitle || a.title || 'Inmueble con almacén',
          type: a.propertyType || a.type || 'almacen',
          address: a.location || a.direccion || 'Polígono Industrial',
          hasForklift
        };
      });
      return {
        id: u.id,
        name: u.name,
        username: u.username,
        level: u.level || 1,
        warehouses
      };
    });
  res.json({ success: true, students });
});

// Inventory Stock Transfer Endpoint
app.post('/api/inventory/transfer-stock', (req, res) => {
  const { senderId, recipientId, itemKey, quantity, transportMethod, destinationNaveId, fromNaveId } = req.body;
  const qty = Number(quantity);

  if (!senderId || !recipientId || !itemKey || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Datos de envío incompletos o cantidad inválida.' });
  }

  if (senderId === recipientId) {
    return res.status(400).json({ error: 'No puedes enviarte existencias a ti mismo.' });
  }

  const db = readDb();
  const sender = db.users.find(u => u.id === senderId);
  const recipient = db.users.find(u => u.id === recipientId);

  if (!sender || !recipient) {
    return res.status(404).json({ error: 'Remitente o destinatario no encontrado.' });
  }

  // Find sender warehouses
  const senderNaves = (db.acquisitions || []).filter(a =>
    String(a.studentId) === String(senderId) &&
    (['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes((a.propertyType || a.type || '').toLowerCase()) ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacen'))
  );

  if (senderNaves.length > 1 && !fromNaveId) {
    return res.status(400).json({
      error: 'Dispones de más de un inmueble con almacén. Debes seleccionar el almacén desde el que envías las existencias.'
    });
  }

  const selectedSenderNave = senderNaves.find(n => String(n.id) === String(fromNaveId)) || senderNaves[0];
  const targetSenderNaveId = selectedSenderNave ? selectedSenderNave.id : (fromNaveId || 'default_nave');

  // Verify forklift in sender warehouse
  if (selectedSenderNave) {
    const senderTargetNaveIdStr = String(selectedSenderNave.id || selectedSenderNave.propertyId);
    const senderNaveForklift = (db.purchasedVehicles || []).find(v =>
      String(v.studentId) === String(senderId) &&
      v.vehicleType === 'carretilla_elevadora' &&
      (
        String(v.assignedPropertyId) === senderTargetNaveIdStr ||
        (senderNaves.length === 1 && (v.assignedWarehouseIndex !== undefined && v.assignedWarehouseIndex !== null))
      )
    );

    if (!senderNaveForklift) {
      const naveName = selectedSenderNave.propertyTitle || selectedSenderNave.title || 'Almacén de origen';
      return res.status(400).json({
        error: `Operación rechazada: No tienes asignada ninguna carretilla elevadora contrapesada a tu almacén de origen "${naveName}". Para poder expedir y cargar existencias desde esta ubicación, debes disponer de una carretilla elevadora asignada.`
      });
    }
  }

  // Recipient warehouses
  const recipientNaves = (db.acquisitions || []).filter(a =>
    String(a.studentId) === String(recipientId) &&
    (['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes((a.propertyType || a.type || '').toLowerCase()) ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacen'))
  );

  if (recipientNaves.length > 1 && !destinationNaveId) {
    return res.status(400).json({
      error: 'El alumno destinatario dispone de más de un inmueble con almacén. Debes especificar a qué inmueble deben enviarse las existencias.'
    });
  }

  const selectedRecipientNave = recipientNaves.find(n => String(n.id) === String(destinationNaveId)) || recipientNaves[0];
  const targetRecipientNaveId = selectedRecipientNave ? selectedRecipientNave.id : (destinationNaveId || 'default_nave');

  if (selectedRecipientNave) {
    const recipientTargetNaveIdStr = String(selectedRecipientNave.id || selectedRecipientNave.propertyId);
    const recipientNaveForklift = (db.purchasedVehicles || []).find(v =>
      String(v.studentId) === String(recipientId) &&
      v.vehicleType === 'carretilla_elevadora' &&
      (
        String(v.assignedPropertyId) === recipientTargetNaveIdStr ||
        (recipientNaves.length === 1 && (v.assignedWarehouseIndex !== undefined && v.assignedWarehouseIndex !== null))
      )
    );

    if (!recipientNaveForklift) {
      const naveName = selectedRecipientNave.propertyTitle || selectedRecipientNave.title || 'Almacén';
      const recipientUser = (db.users || []).find((u: any) => String(u.id) === String(recipientId));
      return res.status(400).json({
        error: `Operación rechazada: El alumno destinatario (${recipientUser?.name || 'Destinatario'}) no tiene asignada ninguna carretilla elevadora contrapesada al inmueble de destino "${naveName}". Para poder recibir existencias en esa ubicación, debe disponer de una carretilla elevadora asignada a ese inmueble.`
      });
    }
  }

  // Validate transport method
  let transportFee = 0;
  let fuelExpense = 0;
  let distanceKm = 0;
  let fuelMovId = '';
  let transMovId = '';

  if (transportMethod === 'propio') {
    const hasTruck = (db.purchasedVehicles || []).some(
      v => v.studentId === senderId && (v.vehicleType === 'camion_trailer' || (v.vehicleType as string) === 'camion_ligero' || (v.vehicleType as string) === 'camion' || (v.vehicleType || '').toLowerCase().includes('camion'))
    );
    const hasTruckDriver = (db.hiredEmployees || []).some(
      e => e.studentId === senderId && (e.role === 'camionero' || (e.role as string) === 'conductor')
    );
    if (!hasTruck || !hasTruckDriver) {
      return res.status(400).json({
        error: 'Para realizar el envío con transporte propio necesitas disponer de un camión en tu flota y tener contratado un camionero / conductor en tu plantilla.'
      });
    }

    // Real road distance calculation between sender and recipient warehouses/locations in Spain
    const senderLoc = selectedSenderNave || sender;
    const recipientLoc = selectedRecipientNave || recipient;
    distanceKm = calculateSpanishDistanceKm(senderLoc, recipientLoc);

    // No transport service fee, but supply expense for fuel based on distance
    fuelExpense = Math.max(8.50, Math.round((distanceKm * 0.48 + 5.0) * 100) / 100);

    if (sender.balance < fuelExpense) {
      return res.status(400).json({
        error: `Saldo insuficiente para cubrir el gasto de suministro de gasolina/combustible por el trayecto de ${distanceKm} km (${fuelExpense.toFixed(2)} €). Saldo disponible: ${sender.balance.toFixed(2)} €.`
      });
    }

    // Deduct fuel supply expense from sender bank account
    sender.balance = Math.round((sender.balance - fuelExpense) * 100) / 100;
    syncAccountToSupabase(sender.id, sender.name, sender.balance, sender.username, sender.password, sender.accountNumber, sender.role, sender.level).catch(e => console.error(e));

    fuelMovId = generateId('mov');
    const nowIso = new Date().toISOString();
    db.transfers.unshift({
      id: fuelMovId,
      senderId: sender.id,
      senderName: sender.name,
      senderAccount: sender.accountNumber,
      receiverId: 'SUMINISTROS_ESTACION_SERVICIO',
      receiverName: 'Estación de servicio - suministro de combustible',
      receiverAccount: 'ES00-0000-0000-0000-GASO',
      amount: fuelExpense,
      concept: `Gasto de Suministro - Combustible/Gasolina Camión (${distanceKm} km a ${recipient.name})`,
      timestamp: nowIso
    });
    syncMovimientoToSupabase(fuelMovId, sender.id, 'TRANSFER_OUT', fuelExpense, nowIso, `Gasto de Suministro - Combustible/Gasolina Camión (${distanceKm} km a ${recipient.name})`).catch(e => console.error(e));
  } else if (transportMethod === 'exterior') {
    // Unified Logistics Fee: 0.38 € / pallet / km (range 0.35 - 0.40 €/palet/km)
    // Incomplete pallets charged as full pallets (Math.ceil)
    const isKgItem = ['ironKg', 'metalKg', 'plasticKg', 'epoxiKg', 'hierro', 'plastico', 'epoxi'].includes(itemKey);
    const transferPallets = isKgItem ? (qty / 1000) : (qty / 10000);
    const chargedPallets = Math.max(1, Math.ceil(transferPallets));

    const senderLoc = selectedSenderNave || sender;
    const recipientLoc = selectedRecipientNave || recipient;
    distanceKm = calculateSpanishDistanceKm(senderLoc, recipientLoc);

    transportFee = Math.round(chargedPallets * distanceKm * 0.38 * 100) / 100;
    if (sender.balance < transportFee) {
      return res.status(400).json({
        error: `Saldo insuficiente para contratar el servicio de transporte exterior (${transportFee.toFixed(2)} € por ${chargedPallets} palet(s) a ${distanceKm} km). Tu saldo disponible es ${sender.balance.toFixed(2)} €.`
      });
    }
    // Deduct fee from sender bank account
    sender.balance = Math.round((sender.balance - transportFee) * 100) / 100;
    syncAccountToSupabase(sender.id, sender.name, sender.balance, sender.username, sender.password, sender.accountNumber, sender.role, sender.level).catch(e => console.error(e));

    transMovId = generateId('mov');
    const nowIso = new Date().toISOString();
    db.transfers.unshift({
      id: transMovId,
      senderId: sender.id,
      senderName: sender.name,
      senderAccount: sender.accountNumber,
      receiverId: 'LOGISTICA_EXTERIOR',
      receiverName: 'Servicio exterior de transporte',
      receiverAccount: 'ES00-0000-0000-0000-LOGI',
      amount: transportFee,
      concept: `Servicio exterior de transporte - Envío de existencias a ${recipient.name} (${chargedPallets} pal. × ${distanceKm} km a 0,38 €/pal-km)`,
      timestamp: nowIso
    });
    syncMovimientoToSupabase(transMovId, sender.id, 'TRANSFER_OUT', transportFee, nowIso, `Servicio exterior de transporte - Envío de existencias a ${recipient.name} (${chargedPallets} pal. × ${distanceKm} km a 0,38 €/pal-km)`).catch(e => console.error(e));
  }

  // Deduct stock from sender and add to recipient
  const senderInv = checkAndCalculateProduction(db, senderId);
  const recipientInv = checkAndCalculateProduction(db, recipientId);

  if (!senderInv.naveInventories) senderInv.naveInventories = {};
  if (!recipientInv.naveInventories) recipientInv.naveInventories = {};

  if (!senderInv.naveInventories[targetSenderNaveId]) {
    senderInv.naveInventories[targetSenderNaveId] = {
      ironKg: senderNaves.length <= 1 ? (senderInv.ironKg || 0) : 0,
      metalKg: senderNaves.length <= 1 ? (senderInv.metalKg || 0) : 0,
      plasticKg: senderNaves.length <= 1 ? (senderInv.plasticKg || 0) : 0,
      epoxiKg: senderNaves.length <= 1 ? (senderInv.epoxiKg || 0) : 0,
      producedRodsUnits: senderNaves.length <= 1 ? (senderInv.producedRodsUnits || 0) : 0,
      producedStarRodsUnits: senderNaves.length <= 1 ? ((senderInv as any).producedStarRodsUnits || (senderInv as any).producedIronRodsUnits || 0) : 0,
      producedFlatRodsUnits: senderNaves.length <= 1 ? ((senderInv as any).producedFlatRodsUnits || (senderInv as any).producedMetalRodsUnits || 0) : 0,
      producedScrewdriversUnits: senderNaves.length <= 1 ? (senderInv.producedScrewdriversUnits || 0) : 0,
      starScrewdriversUnits: senderNaves.length <= 1 ? ((senderInv as any).starScrewdriversUnits || (senderInv as any).ironScrewdriversUnits || 0) : 0,
      flatScrewdriversUnits: senderNaves.length <= 1 ? ((senderInv as any).flatScrewdriversUnits || (senderInv as any).metalScrewdriversUnits || 0) : 0,
      ironScrewdriversUnits: senderNaves.length <= 1 ? ((senderInv as any).starScrewdriversUnits || (senderInv as any).ironScrewdriversUnits || 0) : 0,
      metalScrewdriversUnits: senderNaves.length <= 1 ? ((senderInv as any).flatScrewdriversUnits || (senderInv as any).metalScrewdriversUnits || 0) : 0
    };
  }

  const senderNaveInv = senderInv.naveInventories[targetSenderNaveId];

  const getRecipientNaveInv = () => {
    if (!recipientInv.naveInventories[targetRecipientNaveId]) {
      recipientInv.naveInventories[targetRecipientNaveId] = {
        ironKg: 0,
        metalKg: 0,
        plasticKg: 0,
        epoxiKg: 0,
        producedRodsUnits: 0,
        producedStarRodsUnits: 0,
        producedFlatRodsUnits: 0,
        producedScrewdriversUnits: 0,
        starScrewdriversUnits: 0,
        flatScrewdriversUnits: 0,
        ironScrewdriversUnits: 0,
        metalScrewdriversUnits: 0
      };
    }
    return recipientInv.naveInventories[targetRecipientNaveId];
  };

  const recipientNaveInv = getRecipientNaveInv();
  const originNaveName = selectedSenderNave ? (selectedSenderNave.propertyTitle || selectedSenderNave.title || 'Almacén de origen') : 'Almacén de origen';

  let itemLabel = itemKey;

  if (itemKey === 'varillas_punta_estrella' || itemKey === 'varillas_hierro_punta') {
    itemLabel = 'Varillas con punta estrella';
    const currentStock = (senderNaveInv as any).producedStarRodsUnits ?? (senderNaveInv as any).producedIronRodsUnits ?? 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de varillas con punta estrella en ${originNaveName} (${currentStock} u. disponibles).` });
    }
    (senderNaveInv as any).producedStarRodsUnits = Math.max(0, currentStock - qty);
    (senderNaveInv as any).producedIronRodsUnits = Math.max(0, currentStock - qty);
    senderNaveInv.producedRodsUnits = Math.max(0, (senderNaveInv.producedRodsUnits || 0) - qty);

    (recipientNaveInv as any).producedStarRodsUnits = ((recipientNaveInv as any).producedStarRodsUnits || 0) + qty;
    (recipientNaveInv as any).producedIronRodsUnits = ((recipientNaveInv as any).producedIronRodsUnits || 0) + qty;
    recipientNaveInv.producedRodsUnits = (recipientNaveInv.producedRodsUnits || 0) + qty;
  } else if (itemKey === 'varillas_punta_plana' || itemKey === 'varillas_metal_punta') {
    itemLabel = 'Varillas con punta plana';
    const currentStock = (senderNaveInv as any).producedFlatRodsUnits ?? (senderNaveInv as any).producedMetalRodsUnits ?? 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de varillas con punta plana en ${originNaveName} (${currentStock} u. disponibles).` });
    }
    (senderNaveInv as any).producedFlatRodsUnits = Math.max(0, currentStock - qty);
    (senderNaveInv as any).producedMetalRodsUnits = Math.max(0, currentStock - qty);
    senderNaveInv.producedRodsUnits = Math.max(0, (senderNaveInv.producedRodsUnits || 0) - qty);

    (recipientNaveInv as any).producedFlatRodsUnits = ((recipientNaveInv as any).producedFlatRodsUnits || 0) + qty;
    (recipientNaveInv as any).producedMetalRodsUnits = ((recipientNaveInv as any).producedMetalRodsUnits || 0) + qty;
    recipientNaveInv.producedRodsUnits = (recipientNaveInv.producedRodsUnits || 0) + qty;
  } else if (itemKey === 'destornilladores_punta_estrella' || itemKey === 'destornilladores_hierro' || itemKey === 'ironScrewdriversUnits') {
    itemLabel = 'Destornilladores con punta estrella';
    const currentStock = (senderNaveInv as any).starScrewdriversUnits ?? (senderNaveInv as any).ironScrewdriversUnits ?? 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de destornilladores con punta estrella en ${originNaveName} (${currentStock} u. disponibles).` });
    }
    (senderNaveInv as any).starScrewdriversUnits = Math.max(0, currentStock - qty);
    (senderNaveInv as any).ironScrewdriversUnits = Math.max(0, currentStock - qty);
    senderNaveInv.producedScrewdriversUnits = Math.max(0, (senderNaveInv.producedScrewdriversUnits || 0) - qty);

    (recipientNaveInv as any).starScrewdriversUnits = ((recipientNaveInv as any).starScrewdriversUnits || 0) + qty;
    (recipientNaveInv as any).ironScrewdriversUnits = ((recipientNaveInv as any).ironScrewdriversUnits || 0) + qty;
    recipientNaveInv.producedScrewdriversUnits = (recipientNaveInv.producedScrewdriversUnits || 0) + qty;
  } else if (itemKey === 'destornilladores_punta_plana' || itemKey === 'destornilladores_metal' || itemKey === 'metalScrewdriversUnits') {
    itemLabel = 'Destornilladores con punta plana';
    const currentStock = (senderNaveInv as any).flatScrewdriversUnits ?? (senderNaveInv as any).metalScrewdriversUnits ?? 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de destornilladores con punta plana en ${originNaveName} (${currentStock} u. disponibles).` });
    }
    (senderNaveInv as any).flatScrewdriversUnits = Math.max(0, currentStock - qty);
    (senderNaveInv as any).metalScrewdriversUnits = Math.max(0, currentStock - qty);
    senderNaveInv.producedScrewdriversUnits = Math.max(0, (senderNaveInv.producedScrewdriversUnits || 0) - qty);

    (recipientNaveInv as any).flatScrewdriversUnits = ((recipientNaveInv as any).flatScrewdriversUnits || 0) + qty;
    (recipientNaveInv as any).metalScrewdriversUnits = ((recipientNaveInv as any).metalScrewdriversUnits || 0) + qty;
    recipientNaveInv.producedScrewdriversUnits = (recipientNaveInv.producedScrewdriversUnits || 0) + qty;
  } else if (itemKey === 'productos_ensamblados' || itemKey === 'producedScrewdriversUnits') {
    itemLabel = 'Productos ensamblados (destornilladores)';
    const currentStock = (senderNaveInv as any).producedScrewdriversUnits || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de productos ensamblados en ${originNaveName} (${currentStock} u. disponibles).` });
    }
    senderNaveInv.producedScrewdriversUnits = Math.max(0, currentStock - qty);
    (senderNaveInv as any).starScrewdriversUnits = Math.max(0, ((senderNaveInv as any).starScrewdriversUnits || 0) - qty);
    (senderNaveInv as any).ironScrewdriversUnits = Math.max(0, ((senderNaveInv as any).ironScrewdriversUnits || 0) - qty);

    recipientNaveInv.producedScrewdriversUnits = (recipientNaveInv.producedScrewdriversUnits || 0) + qty;
    (recipientNaveInv as any).starScrewdriversUnits = ((recipientNaveInv as any).starScrewdriversUnits || 0) + qty;
    (recipientNaveInv as any).ironScrewdriversUnits = ((recipientNaveInv as any).ironScrewdriversUnits || 0) + qty;
  } else if (itemKey === 'ironKg') {
    itemLabel = 'Fragmentos de hierro (kg)';
    const currentStock = (senderNaveInv as any).ironKg || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de fragmentos de hierro en ${originNaveName} (${currentStock} kg disponibles).` });
    }
    senderNaveInv.ironKg = Math.max(0, Math.round((currentStock - qty) * 1000) / 1000);
    recipientNaveInv.ironKg = Math.round(((recipientNaveInv.ironKg || 0) + qty) * 1000) / 1000;
  } else if (itemKey === 'metalKg') {
    itemLabel = 'Fragmentos de metal (kg)';
    const currentStock = (senderNaveInv as any).metalKg || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de fragmentos de metal en ${originNaveName} (${currentStock} kg disponibles).` });
    }
    senderNaveInv.metalKg = Math.max(0, Math.round((currentStock - qty) * 1000) / 1000);
    recipientNaveInv.metalKg = Math.round(((recipientNaveInv.metalKg || 0) + qty) * 1000) / 1000;
  } else if (itemKey === 'plasticKg') {
    itemLabel = 'Pellets de plástico (kg)';
    const currentStock = (senderNaveInv as any).plasticKg || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de pellets de plástico en ${originNaveName} (${currentStock} kg disponibles).` });
    }
    senderNaveInv.plasticKg = Math.max(0, Math.round((currentStock - qty) * 1000) / 1000);
    recipientNaveInv.plasticKg = Math.round(((recipientNaveInv.plasticKg || 0) + qty) * 1000) / 1000;
  } else if (itemKey === 'epoxiKg') {
    itemLabel = 'Pegamento epoxi (kg)';
    const currentStock = (senderNaveInv as any).epoxiKg || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de pegamento epoxi en ${originNaveName} (${currentStock} kg disponibles).` });
    }
    senderNaveInv.epoxiKg = Math.max(0, Math.round((currentStock - qty) * 1000) / 1000);
    recipientNaveInv.epoxiKg = Math.round(((recipientNaveInv.epoxiKg || 0) + qty) * 1000) / 1000;
  } else {
    return res.status(400).json({ error: 'Tipo de existencia no reconocido.' });
  }

  recalculateTotalInventory(senderInv);
  recalculateTotalInventory(recipientInv);

  senderInv.updatedAt = new Date().toISOString();
  recipientInv.updatedAt = new Date().toISOString();

  syncInventoryToSupabase(senderInv, sender.name).catch(e => console.error(e));
  syncInventoryToSupabase(recipientInv, recipient.name).catch(e => console.error(e));

  // Record transfer in rawMaterialOrders so it reflects in Market Operations History
  const orderId = generateId('rmord');
  const nowIso = new Date().toISOString();

  let materialType: 'hierro' | 'metal' | 'plastico' | 'epoxi' | 'producto_final' = 'producto_final';
  if (itemKey === 'ironKg') materialType = 'hierro';
  else if (itemKey === 'metalKg') materialType = 'metal';
  else if (itemKey === 'plasticKg') materialType = 'plastico';
  else if (itemKey === 'epoxiKg') materialType = 'epoxi';

  const transferOrder: RawMaterialOrder = {
    id: orderId,
    studentId: recipient.id,
    studentName: recipient.name,
    buyerLevel: recipient.level || 1,
    sellerId: sender.id,
    sellerName: sender.name,
    sellerLevel: sender.level || 1,
    announcementId: `tr-${Date.now()}`,
    materialType,
    materialTitle: itemLabel,
    quantity: qty,
    unitWeightKg: itemKey.includes('Kg') ? 1 : 0.1,
    totalKg: itemKey.includes('Kg') ? qty : Math.round(qty * 0.1 * 100) / 100,
    basePrice: 0,
    discountPercentage: 0,
    discountAmount: 0,
    insuranceFee: 0,
    hasInsurance: false,
    ivaAmount: 0,
    transportCost: 0,
    transportMethod: transportMethod === 'propio' ? 'comprador_recogida' : 'vendedor_envio',
    totalAmount: 0,
    needsTransport: transportMethod === 'exterior',
    deliveryAddress: selectedRecipientNave ? `${selectedRecipientNave.propertyTitle || selectedRecipientNave.title || 'Almacén'}, ${selectedRecipientNave.location || selectedRecipientNave.direccion || 'Polígono Industrial'}` : 'Almacén del destinatario',
    destinationNaveId: targetRecipientNaveId,
    status: 'entregado',
    requestedAt: nowIso,
    approvedAt: nowIso,
    deliveredAt: nowIso,
    inventoryCredited: true,
    items: [{
      announcementId: `tr-${Date.now()}`,
      materialType,
      materialTitle: itemLabel,
      quantity: qty,
      unitWeightKg: itemKey.includes('Kg') ? 1 : 0.1,
      totalKg: itemKey.includes('Kg') ? qty : Math.round(qty * 0.1 * 100) / 100,
      basePrice: 0
    }],
    lastTurnUserId: sender.id,
    negotiationHistory: [{
      id: generateId('neg'),
      authorId: sender.id,
      authorName: sender.name,
      timestamp: nowIso,
      action: 'propuesta_inicial',
      quantity: qty,
      pricePerUnit: 0,
      discountPercentage: 0,
      insuranceFee: 0,
      transportCost: 0,
      transportMethod: transportMethod === 'propio' ? 'comprador_recogida' : 'vendedor_envio',
      totalAmount: 0,
      note: `Envío directo de existencias entre alumnos (${transportMethod === 'propio' ? 'Transporte propio' : 'Servicio exterior'})`
    }]
  };

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  db.rawMaterialOrders.unshift(transferOrder);
  syncRawMaterialOrderToSupabase(transferOrder).catch(e => console.error(e));

  if (transportMethod === 'exterior' && transportFee > 0 && transMovId) {
    const recipientAcqs = (db.acquisitions || []).filter(a => String(a.studentId) === String(recipient.id));
    const recipientProp = recipientAcqs[0];
    const recipientAddress = recipientProp 
      ? (recipientProp.location || recipientProp.propertyTitle || 'Almacén principal del destinatario')
      : 'Polígono Industrial San Fernando, Av. de la Industria 14, San Fernando de Henares (Madrid)';

    const basePrice = Math.round((transportFee / 1.21) * 100) / 100;
    const ivaAmount = Math.round((transportFee - basePrice) * 100) / 100;
    const transportInvoiceOrder: RawMaterialOrder = {
      id: `rmord_trans_${transMovId}`,
      studentId: sender.id,
      studentName: sender.name,
      buyerLevel: sender.level || 1,
      sellerId: 'LOGISTICA_EXTERIOR',
      sellerName: 'Servicio exterior de transporte',
      sellerLevel: 'official',
      announcementId: `trans-inv-${transMovId}`,
      materialType,
      materialTitle: `Servicio exterior de transporte - Envío de existencias a ${recipient.name} — Dirección del inmueble de destino: ${recipientAddress}`,
      quantity: 1,
      unitWeightKg: 0,
      totalKg: itemKey.includes('Kg') ? qty : Math.round(qty * 0.1 * 100) / 100,
      basePrice,
      discountPercentage: 0,
      discountAmount: 0,
      insuranceFee: 0,
      hasInsurance: false,
      ivaAmount,
      transportCost: 0,
      transportMethod: 'vendedor_envio',
      totalAmount: transportFee,
      needsTransport: false,
      deliveryAddress: recipientAddress,
      status: 'facturado',
      invoiceNumber: `FACT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      requestedAt: nowIso,
      approvedAt: nowIso,
      deliveredAt: nowIso,
      invoicedAt: nowIso,
      inventoryCredited: true,
      items: [{
        announcementId: `trans-inv-${transMovId}`,
        materialType,
        materialTitle: `Servicio exterior de transporte - Envío de existencias a ${recipient.name} — Dirección del inmueble de destino: ${recipientAddress}`,
        quantity: 1,
        unitWeightKg: 0,
        totalKg: 0,
        basePrice,
        subtotal: basePrice
      }],
      lastTurnUserId: sender.id,
      negotiationHistory: [{
        id: `neg_${transMovId}`,
        authorId: 'LOGISTICA_EXTERIOR',
        authorName: 'Servicio exterior de transporte',
        timestamp: nowIso,
        action: 'propuesta_inicial',
        quantity: 1,
        pricePerUnit: basePrice,
        discountPercentage: 0,
        insuranceFee: 0,
        transportCost: 0,
        transportMethod: 'vendedor_envio',
        totalAmount: transportFee,
        note: `Factura del Servicio exterior de transporte por envío de existencias a ${recipient.name}`
      }]
    };
    db.rawMaterialOrders.unshift(transportInvoiceOrder);
    syncRawMaterialOrderToSupabase(transportInvoiceOrder).catch(e => console.error(e));
  } else if (transportMethod === 'propio' && fuelExpense > 0 && fuelMovId) {
    const basePricePropio = Math.round((fuelExpense / 1.21) * 100) / 100;
    const ivaAmountPropio = Math.round((fuelExpense - basePricePropio) * 100) / 100;
    const fuelInvoiceOrder: RawMaterialOrder = {
      id: `rmord_trans_${fuelMovId}`,
      studentId: sender.id,
      studentName: sender.name,
      buyerLevel: sender.level || 1,
      sellerId: 'SUMINISTROS_ESTACION_SERVICIO',
      sellerName: 'Estación de servicio - suministro de combustible',
      sellerLevel: 'official',
      announcementId: `gaso-inv-${fuelMovId}`,
      materialType: 'combustible',
      materialTitle: `Gasto de Suministro - Combustible/Gasolina Camión (${distanceKm} km a ${recipient.name})`,
      quantity: 1,
      unitWeightKg: 0,
      totalKg: 0,
      basePrice: basePricePropio,
      discountPercentage: 0,
      discountAmount: 0,
      insuranceFee: 0,
      hasInsurance: false,
      ivaAmount: ivaAmountPropio,
      transportCost: 0,
      transportMethod: 'vendedor_envio',
      totalAmount: fuelExpense,
      needsTransport: false,
      deliveryAddress: 'Inmueble de destino del alumno',
      status: 'facturado',
      invoiceNumber: `FACT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      requestedAt: nowIso,
      approvedAt: nowIso,
      deliveredAt: nowIso,
      invoicedAt: nowIso,
      inventoryCredited: true,
      items: [{
        announcementId: `gaso-inv-${fuelMovId}`,
        materialType: 'combustible',
        materialTitle: `Gasto de Suministro - Combustible/Gasolina Camión (${distanceKm} km a ${recipient.name})`,
        quantity: 1,
        unitWeightKg: 0,
        totalKg: 0,
        basePrice: basePricePropio,
        subtotal: basePricePropio
      }],
      lastTurnUserId: sender.id,
      negotiationHistory: [{
        id: `neg_${fuelMovId}`,
        authorId: 'SUMINISTROS_ESTACION_SERVICIO',
        authorName: 'Estación de servicio - suministro de combustible',
        timestamp: nowIso,
        action: 'propuesta_inicial',
        quantity: 1,
        pricePerUnit: basePricePropio,
        discountPercentage: 0,
        insuranceFee: 0,
        transportCost: 0,
        transportMethod: 'vendedor_envio',
        totalAmount: fuelExpense,
        note: `Factura de suministro de combustible camión (${distanceKm} km a ${recipient.name})`
      }]
    };
    db.rawMaterialOrders.unshift(fuelInvoiceOrder);
    syncRawMaterialOrderToSupabase(fuelInvoiceOrder).catch(e => console.error(e));
  }

  addNotification(
    db,
    recipientId,
    'Envío de existencias recibido',
    `Has recibido ${qty} unidades de "${itemLabel}" enviadas por ${sender.name} (${transportMethod === 'propio' ? 'Transporte propio del remitente' : 'Servicio exterior de transporte'}).`,
    'order_approved'
  );

  addNotification(
    db,
    senderId,
    'Envío de existencias realizado',
    `Has enviado ${qty} unidades de "${itemLabel}" a ${recipient.name} correctamente.`,
    'order_approved'
  );

  writeDb(db);

  const transferSuccessMessage = transportMethod === 'propio'
    ? `Envío de ${qty} unidades de ${itemLabel} a ${recipient.name} realizado con éxito con transporte propio. Sin gastos de servicio de transporte. Se ha abonado un gasto de suministro de gasolina de ${fuelExpense.toFixed(2)} € por el trayecto de ${distanceKm} km.`
    : `Envío de ${qty} unidades de ${itemLabel} a ${recipient.name} realizado con éxito. Se han adeudado ${transportFee.toFixed(2)} € por el servicio exterior de transporte.`;

  res.json({
    success: true,
    message: transferSuccessMessage,
    updatedInventory: senderInv,
    newBalance: sender.balance,
    order: transferOrder
  });
});

// Inter-warehouse / Inter-nave stock transfer endpoint
app.post('/api/inventory/transfer-nave-stock', (req, res) => {
  const { studentId, fromNaveId, toNaveId, itemKey, quantity, transportMethod } = req.body;
  const qty = Number(quantity);

  if (!studentId || !fromNaveId || !toNaveId || !itemKey || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Datos de traslado incompletos o cantidad inválida.' });
  }

  if (fromNaveId === toNaveId) {
    return res.status(400).json({ error: 'La nave de origen y la nave de destino deben ser diferentes.' });
  }

  const db = readDb();
  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  const studentNaves = (db.acquisitions || []).filter(a =>
    String(a.studentId) === String(studentId) &&
    (['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes((a.propertyType || a.type || '').toLowerCase()) ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacén') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacen'))
  );
  const toNave = studentNaves.find(a => String(a.id) === String(toNaveId)) || (db.acquisitions || []).find(a => String(a.id) === String(toNaveId));
  const toNaveTargetIdStr = String(toNaveId);

  const toNaveForklift = (db.purchasedVehicles || []).find(v =>
    String(v.studentId) === String(studentId) &&
    v.vehicleType === 'carretilla_elevadora' &&
    (
      String(v.assignedPropertyId) === toNaveTargetIdStr ||
      (studentNaves.length === 1 && (v.assignedWarehouseIndex !== undefined && v.assignedWarehouseIndex !== null))
    )
  );

  if (!toNaveForklift) {
    const naveName = toNave ? (toNave.propertyTitle || toNave.title || 'Almacén de destino') : 'Almacén de destino';
    return res.status(400).json({
      error: `Operación rechazada: El almacén de destino "${naveName}" no tiene asignada ninguna carretilla elevadora contrapesada. Para poder recibir existencias en un traslado entre almacenes propios, la nave de destino debe disponer de una carretilla elevadora asignada.`
    });
  }

  // Validate transport method
  let transportFee = 0;
  let fuelExpense = 0;
  let distanceKm = 0;

  if (transportMethod === 'propio') {
    const hasTruck = (db.purchasedVehicles || []).some(
      v => v.studentId === studentId && (v.vehicleType === 'camion_trailer' || (v.vehicleType as string) === 'camion_ligero' || (v.vehicleType as string) === 'camion' || (v.vehicleType || '').toLowerCase().includes('camion'))
    );
    const hasTruckDriver = (db.hiredEmployees || []).some(
      e => e.studentId === studentId && (e.role === 'camionero' || (e.role as string) === 'conductor')
    );
    if (!hasTruck || !hasTruckDriver) {
      return res.status(400).json({
        error: 'Para realizar el traslado con transporte propio necesitas disponer de un camión en tu flota y tener contratado un camionero / conductor en tu plantilla.'
      });
    }

    const fromNave = (db.acquisitions || []).find(a => a.id === fromNaveId);
    const toNave = (db.acquisitions || []).find(a => a.id === toNaveId);
    distanceKm = calculateSpanishDistanceKm(fromNave, toNave);

    // No transport service fee, but supply expense for fuel based on distance
    fuelExpense = Math.max(8.50, Math.round((distanceKm * 0.48 + 5.0) * 100) / 100);

    if (student.balance < fuelExpense) {
      return res.status(400).json({
        error: `Saldo insuficiente para cubrir el gasto de suministro de gasolina/combustible por el trayecto de ${distanceKm} km (${fuelExpense.toFixed(2)} €). Saldo disponible: ${student.balance.toFixed(2)} €.`
      });
    }

    // Deduct fuel supply expense from student bank account
    student.balance = Math.round((student.balance - fuelExpense) * 100) / 100;
    syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role, student.level).catch(e => console.error(e));

    const movId = generateId('mov');
    const nowIso = new Date().toISOString();
    db.transfers.unshift({
      id: movId,
      senderId: student.id,
      senderName: student.name,
      senderAccount: student.accountNumber,
      receiverId: 'SUMINISTROS_ESTACION_SERVICIO',
      receiverName: 'Estación de servicio - suministro de combustible',
      receiverAccount: 'ES00-0000-0000-0000-GASO',
      amount: fuelExpense,
      concept: `Gasto de suministro - Combustible/gasolina camión (${distanceKm} km entre almacenes)`,
      timestamp: nowIso
    });
    syncMovimientoToSupabase(movId, student.id, 'TRANSFER_OUT', fuelExpense, nowIso, `Gasto de suministro - Combustible/gasolina camión (${distanceKm} km entre almacenes)`).catch(e => console.error(e));

    const fromNaveTitle = fromNave ? (fromNave.propertyTitle || fromNave.title || 'Almacén de origen') : 'Almacén de origen';
    const toNaveTitle = toNave ? (toNave.propertyTitle || toNave.title || 'Almacén de destino') : 'Almacén de destino';
    const toNaveAddress = toNave
      ? (toNave.location || toNave.propertyTitle || 'Almacén de destino del alumno')
      : 'Polígono Industrial San Fernando, Av. de la Industria 14, San Fernando de Henares (Madrid)';

    const basePricePropio = Math.round((fuelExpense / 1.21) * 100) / 100;
    const ivaAmountPropio = Math.round((fuelExpense - basePricePropio) * 100) / 100;
    const fuelInvoiceOrder: RawMaterialOrder = {
      id: `rmord_trans_${movId}`,
      studentId: student.id,
      studentName: student.name,
      buyerLevel: student.level || 1,
      sellerId: 'SUMINISTROS_ESTACION_SERVICIO',
      sellerName: 'Estación de servicio - suministro de combustible',
      sellerLevel: 'official',
      announcementId: `gaso-inv-${movId}`,
      materialType: 'combustible',
      materialTitle: `Gasto de Suministro - Combustible/Gasolina Camión (${distanceKm} km entre ${fromNaveTitle} y ${toNaveTitle})`,
      quantity: 1,
      unitWeightKg: 0,
      totalKg: 0,
      basePrice: basePricePropio,
      discountPercentage: 0,
      discountAmount: 0,
      insuranceFee: 0,
      hasInsurance: false,
      ivaAmount: ivaAmountPropio,
      transportCost: 0,
      transportMethod: 'vendedor_envio',
      totalAmount: fuelExpense,
      needsTransport: false,
      deliveryAddress: toNaveAddress,
      status: 'facturado',
      invoiceNumber: `FACT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      requestedAt: nowIso,
      approvedAt: nowIso,
      deliveredAt: nowIso,
      invoicedAt: nowIso,
      inventoryCredited: true,
      items: [{
        announcementId: `gaso-inv-${movId}`,
        materialType: 'combustible',
        materialTitle: `Gasto de Suministro - Combustible/Gasolina Camión (${distanceKm} km entre ${fromNaveTitle} y ${toNaveTitle})`,
        quantity: 1,
        unitWeightKg: 0,
        totalKg: 0,
        basePrice: basePricePropio,
        subtotal: basePricePropio
      }],
      lastTurnUserId: student.id,
      negotiationHistory: [{
        id: `neg_${movId}`,
        authorId: 'SUMINISTROS_ESTACION_SERVICIO',
        authorName: 'Estación de servicio - suministro de combustible',
        timestamp: nowIso,
        action: 'propuesta_inicial',
        quantity: 1,
        pricePerUnit: basePricePropio,
        discountPercentage: 0,
        insuranceFee: 0,
        transportCost: 0,
        transportMethod: 'vendedor_envio',
        totalAmount: fuelExpense,
        note: `Factura de Suministro de Combustible Camión (${distanceKm} km entre almacenes)`
      }]
    };

    if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
    db.rawMaterialOrders.unshift(fuelInvoiceOrder);
    syncRawMaterialOrderToSupabase(fuelInvoiceOrder).catch(e => console.error(e));
  } else if (transportMethod === 'exterior') {
    const fromNave = (db.acquisitions || []).find(a => a.id === fromNaveId);
    const toNave = (db.acquisitions || []).find(a => a.id === toNaveId);
    distanceKm = calculateSpanishDistanceKm(fromNave, toNave);

    // Unified Logistics Fee: 0.38 € / pallet / km (range 0.35 - 0.40 €/palet/km)
    // Incomplete pallets charged as full pallets (Math.ceil)
    const isKgItem = ['ironKg', 'metalKg', 'plasticKg', 'epoxiKg', 'hierro', 'plastico', 'epoxi'].includes(itemKey);
    const transferPallets = isKgItem ? (qty / 1000) : (qty / 10000);
    const chargedPallets = Math.max(1, Math.ceil(transferPallets));

    transportFee = Math.round(chargedPallets * distanceKm * 0.38 * 100) / 100;
    if (student.balance < transportFee) {
      return res.status(400).json({
        error: `Saldo insuficiente para contratar el servicio de transporte exterior (${transportFee.toFixed(2)} € por ${chargedPallets} palet(s) a ${distanceKm} km). Tu saldo disponible es ${student.balance.toFixed(2)} €.`
      });
    }
    // Deduct fee from student bank account
    student.balance = Math.round((student.balance - transportFee) * 100) / 100;
    syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role, student.level).catch(e => console.error(e));

    const movId = generateId('mov');
    const nowIso = new Date().toISOString();
    db.transfers.unshift({
      id: movId,
      senderId: student.id,
      senderName: student.name,
      senderAccount: student.accountNumber,
      receiverId: 'LOGISTICA_EXTERIOR',
      receiverName: 'Servicio exterior de transporte',
      receiverAccount: 'ES00-0000-0000-0000-LOGI',
      amount: transportFee,
      concept: `Servicio exterior de transporte - traslado de existencias entre naves (${chargedPallets} pal. × ${distanceKm} km a 0,38 €/pal-km)`,
      timestamp: nowIso
    });
    syncMovimientoToSupabase(movId, student.id, 'TRANSFER_OUT', transportFee, nowIso, `Servicio exterior de transporte - traslado de existencias entre naves (${chargedPallets} pal. × ${distanceKm} km a 0,38 €/pal-km)`).catch(e => console.error(e));

    const fromNaveTitle = fromNave ? (fromNave.propertyTitle || fromNave.title || 'Almacén de origen') : 'Almacén de origen';
    const toNaveTitle = toNave ? (toNave.propertyTitle || toNave.title || 'Almacén de destino') : 'Almacén de destino';
    const toNaveAddress = toNave
      ? (toNave.location || toNave.propertyTitle || 'Almacén de destino del alumno')
      : 'Polígono Industrial San Fernando, Av. de la Industria 14, San Fernando de Henares (Madrid)';

    const basePriceExterior = Math.round((transportFee / 1.21) * 100) / 100;
    const ivaAmountExterior = Math.round((transportFee - basePriceExterior) * 100) / 100;
    const transportInvoiceOrder: RawMaterialOrder = {
      id: `rmord_trans_${movId}`,
      studentId: student.id,
      studentName: student.name,
      buyerLevel: student.level || 1,
      sellerId: 'LOGISTICA_EXTERIOR',
      sellerName: 'Servicio exterior de transporte',
      sellerLevel: 'official',
      announcementId: `trans-inv-${movId}`,
      materialType: (itemKey as any) || 'transporte',
      materialTitle: `Servicio exterior de transporte - traslado de existencias (${fromNaveTitle} -> ${toNaveTitle}) — Dirección del inmueble de destino: ${toNaveAddress}`,
      quantity: 1,
      unitWeightKg: 0,
      totalKg: itemKey.includes('Kg') ? qty : Math.round(qty * 0.1 * 100) / 100,
      basePrice: basePriceExterior,
      discountPercentage: 0,
      discountAmount: 0,
      insuranceFee: 0,
      hasInsurance: false,
      ivaAmount: ivaAmountExterior,
      transportCost: 0,
      transportMethod: 'vendedor_envio',
      totalAmount: transportFee,
      needsTransport: false,
      deliveryAddress: toNaveAddress,
      status: 'facturado',
      invoiceNumber: `FACT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      requestedAt: nowIso,
      approvedAt: nowIso,
      deliveredAt: nowIso,
      invoicedAt: nowIso,
      inventoryCredited: true,
      items: [{
        announcementId: `trans-inv-${movId}`,
        materialType: (itemKey as any) || 'transporte',
        materialTitle: `Servicio exterior de transporte - traslado de existencias (${fromNaveTitle} -> ${toNaveTitle}) — Dirección del inmueble de destino: ${toNaveAddress}`,
        quantity: 1,
        unitWeightKg: 0,
        totalKg: 0,
        basePrice: basePriceExterior,
        subtotal: basePriceExterior
      }],
      lastTurnUserId: student.id,
      negotiationHistory: [{
        id: `neg_${movId}`,
        authorId: 'LOGISTICA_EXTERIOR',
        authorName: 'Servicio exterior de transporte',
        timestamp: nowIso,
        action: 'propuesta_inicial',
        quantity: 1,
        pricePerUnit: basePriceExterior,
        discountPercentage: 0,
        insuranceFee: 0,
        transportCost: 0,
        transportMethod: 'vendedor_envio',
        totalAmount: transportFee,
        note: `Factura del Servicio exterior de transporte por traslado entre almacenes (${fromNaveTitle} -> ${toNaveTitle})`
      }]
    };

    if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
    db.rawMaterialOrders.unshift(transportInvoiceOrder);
    syncRawMaterialOrderToSupabase(transportInvoiceOrder).catch(e => console.error(e));
  }

  // Load and calculate production / inventory
  const inv = checkAndCalculateProduction(db, studentId);
  if (!inv.naveInventories) inv.naveInventories = {};

  const fromNaveInv = inv.naveInventories[fromNaveId];
  const toNaveInv = inv.naveInventories[toNaveId];

  if (!fromNaveInv || !toNaveInv) {
    return res.status(404).json({ error: 'No se encontraron los datos de inventario para una o ambas naves.' });
  }

  let itemLabel = itemKey;

  if (itemKey === 'varillas_punta_estrella' || itemKey === 'varillas_hierro_punta') {
    itemLabel = 'Varillas con Punta Estrella';
    const currentStock = (fromNaveInv as any).producedStarRodsUnits ?? (fromNaveInv as any).producedIronRodsUnits ?? 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente en la nave de origen (${currentStock} u. disponibles).` });
    }
    (fromNaveInv as any).producedStarRodsUnits = currentStock - qty;
    (fromNaveInv as any).producedIronRodsUnits = currentStock - qty;
    fromNaveInv.producedRodsUnits = Math.max(0, (fromNaveInv.producedRodsUnits || 0) - qty);

    (toNaveInv as any).producedStarRodsUnits = ((toNaveInv as any).producedStarRodsUnits || 0) + qty;
    (toNaveInv as any).producedIronRodsUnits = ((toNaveInv as any).producedIronRodsUnits || 0) + qty;
    toNaveInv.producedRodsUnits = (toNaveInv.producedRodsUnits || 0) + qty;
  } else if (itemKey === 'varillas_punta_plana' || itemKey === 'varillas_metal_punta') {
    itemLabel = 'Varillas con Punta Plana';
    const currentStock = (fromNaveInv as any).producedFlatRodsUnits ?? (fromNaveInv as any).producedMetalRodsUnits ?? 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente en la nave de origen (${currentStock} u. disponibles).` });
    }
    (fromNaveInv as any).producedFlatRodsUnits = currentStock - qty;
    (fromNaveInv as any).producedMetalRodsUnits = currentStock - qty;
    fromNaveInv.producedRodsUnits = Math.max(0, (fromNaveInv.producedRodsUnits || 0) - qty);

    (toNaveInv as any).producedFlatRodsUnits = ((toNaveInv as any).producedFlatRodsUnits || 0) + qty;
    (toNaveInv as any).producedMetalRodsUnits = ((toNaveInv as any).producedMetalRodsUnits || 0) + qty;
    toNaveInv.producedRodsUnits = (toNaveInv.producedRodsUnits || 0) + qty;
  } else if (itemKey === 'destornilladores_punta_estrella' || itemKey === 'destornilladores_hierro') {
    itemLabel = 'Destornilladores con Punta Estrella';
    const currentStock = (fromNaveInv as any).starScrewdriversUnits ?? (fromNaveInv as any).ironScrewdriversUnits ?? 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente en la nave de origen (${currentStock} u. disponibles).` });
    }
    (fromNaveInv as any).starScrewdriversUnits = currentStock - qty;
    (fromNaveInv as any).ironScrewdriversUnits = currentStock - qty;
    fromNaveInv.producedScrewdriversUnits = Math.max(0, (fromNaveInv.producedScrewdriversUnits || 0) - qty);

    (toNaveInv as any).starScrewdriversUnits = ((toNaveInv as any).starScrewdriversUnits || 0) + qty;
    (toNaveInv as any).ironScrewdriversUnits = ((toNaveInv as any).ironScrewdriversUnits || 0) + qty;
    toNaveInv.producedScrewdriversUnits = (toNaveInv.producedScrewdriversUnits || 0) + qty;
  } else if (itemKey === 'destornilladores_punta_plana' || itemKey === 'destornilladores_metal') {
    itemLabel = 'Destornilladores con Punta Plana';
    const currentStock = (fromNaveInv as any).flatScrewdriversUnits ?? (fromNaveInv as any).metalScrewdriversUnits ?? 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente en la nave de origen (${currentStock} u. disponibles).` });
    }
    (fromNaveInv as any).flatScrewdriversUnits = currentStock - qty;
    (fromNaveInv as any).metalScrewdriversUnits = currentStock - qty;
    fromNaveInv.producedScrewdriversUnits = Math.max(0, (fromNaveInv.producedScrewdriversUnits || 0) - qty);

    (toNaveInv as any).flatScrewdriversUnits = ((toNaveInv as any).flatScrewdriversUnits || 0) + qty;
    (toNaveInv as any).metalScrewdriversUnits = ((toNaveInv as any).metalScrewdriversUnits || 0) + qty;
    toNaveInv.producedScrewdriversUnits = (toNaveInv.producedScrewdriversUnits || 0) + qty;
  } else if (itemKey === 'ironKg') {
    itemLabel = 'Fragmentos de Hierro (Kg)';
    const currentStock = fromNaveInv.ironKg || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de Fragmentos de Hierro en la nave de origen (${currentStock} kg disponibles).` });
    }
    fromNaveInv.ironKg = Math.round((currentStock - qty) * 1000) / 1000;
    toNaveInv.ironKg = Math.round(((toNaveInv.ironKg || 0) + qty) * 1000) / 1000;
  } else if (itemKey === 'metalKg') {
    itemLabel = 'Fragmentos de Metal (Kg)';
    const currentStock = fromNaveInv.metalKg || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de Fragmentos de Metal en la nave de origen (${currentStock} kg disponibles).` });
    }
    fromNaveInv.metalKg = Math.round((currentStock - qty) * 1000) / 1000;
    toNaveInv.metalKg = Math.round(((toNaveInv.metalKg || 0) + qty) * 1000) / 1000;
  } else if (itemKey === 'plasticKg') {
    itemLabel = 'Pellets de Plástico (Kg)';
    const currentStock = fromNaveInv.plasticKg || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de Pellets de Plástico en la nave de origen (${currentStock} kg disponibles).` });
    }
    fromNaveInv.plasticKg = Math.round((currentStock - qty) * 1000) / 1000;
    toNaveInv.plasticKg = Math.round(((toNaveInv.plasticKg || 0) + qty) * 1000) / 1000;
  } else if (itemKey === 'epoxiKg') {
    itemLabel = 'Pegamento Epoxi (Kg)';
    const currentStock = fromNaveInv.epoxiKg || 0;
    if (currentStock < qty) {
      return res.status(400).json({ error: `Stock insuficiente de Pegamento Epoxi en la nave de origen (${currentStock} kg disponibles).` });
    }
    fromNaveInv.epoxiKg = Math.round((currentStock - qty) * 1000) / 1000;
    toNaveInv.epoxiKg = Math.round(((toNaveInv.epoxiKg || 0) + qty) * 1000) / 1000;
  } else {
    return res.status(400).json({ error: 'Tipo de existencia no reconocido.' });
  }

  recalculateTotalInventory(inv);
  inv.updatedAt = new Date().toISOString();

  syncInventoryToSupabase(inv, student.name).catch(e => console.error(e));
  writeDb(db);

  const transferSuccessMessage = transportMethod === 'propio'
    ? `Traslado de ${qty} de ${itemLabel} entre naves completado con éxito con transporte propio. Sin gastos de servicio de transporte. Se ha abonado un gasto de suministro de gasolina de ${fuelExpense.toFixed(2)} € por el trayecto de ${distanceKm} km.`
    : `Traslado de ${qty} de ${itemLabel} entre naves completado con éxito. Se han adeudado ${transportFee.toFixed(2)} € por el servicio exterior de transporte.`;

  res.json({
    success: true,
    message: transferSuccessMessage,
    updatedInventory: inv,
    newBalance: student.balance
  });
});

// Trading Partners list endpoint (Filtered to contacted partners in Direct Messaging)
app.get('/api/market/trading-partners', (req, res) => {
  const userId = req.query.userId as string;
  const db = readDb();
  const currentUser = db.users.find(u => u.id === userId);

  if (!currentUser) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (!db.marketContacts) db.marketContacts = [];

  // Filter partners: for teachers, return all tradeable partners. For students, return only those where "Contactar" was clicked or messages exist.
  const contactedPartnerIds = new Set<string>();
  db.marketContacts.forEach(c => {
    if (c.userId === currentUser.id) contactedPartnerIds.add(c.contactId);
    if (c.contactId === currentUser.id) contactedPartnerIds.add(c.userId);
  });

  if (db.marketMessages) {
    db.marketMessages.forEach(m => {
      if (m.senderId === currentUser.id) contactedPartnerIds.add(m.recipientId);
      if (m.recipientId === currentUser.id) contactedPartnerIds.add(m.senderId);
    });
  }

  const partners = db.users
    .filter(u => u.id !== currentUser.id)
    .filter(u => {
      if (currentUser.role === 'teacher') return true;
      return contactedPartnerIds.has(u.id);
    })
    .map(u => {
      const buyCheck = canTradeUsers(currentUser, u);
      const sellCheck = canTradeUsers(u, currentUser);
      const levelNames: Record<number | string, string> = {
        1: 'Nivel 1 (Fabricante)',
        2: 'Nivel 2 (Distribuidor Mayorista)',
        3: 'Nivel 3 (Distribuidor Minorista)',
        teacher: 'Profesor (Evaluador/Suministrador)'
      };
      const userLevelKey = (u.role === 'teacher' || u.id === 'profesor-1') ? 'teacher' : (u.level || 1);

      // Unread messages from this specific partner to current user
      const unreadCount = (db.marketMessages || []).filter(
        m => m.recipientId === currentUser.id && m.senderId === u.id && !m.read
      ).length;

      // Find all messages between currentUser and this partner to determine the most recent interaction
      const conversationMsgs = (db.marketMessages || []).filter(
        m => (m.senderId === currentUser.id && m.recipientId === u.id) ||
             (m.senderId === u.id && m.recipientId === currentUser.id)
      );

      let lastMessageTimestamp: string | null = null;
      let lastMessageContent: string | null = null;
      if (conversationMsgs.length > 0) {
        conversationMsgs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        lastMessageTimestamp = conversationMsgs[0].timestamp;
        lastMessageContent = conversationMsgs[0].content || (conversationMsgs[0].type === 'invoice' ? 'Factura emitida' : '');
      }

      const contactRecord = (db.marketContacts || []).find(
        c => (c.userId === currentUser.id && c.contactId === u.id) ||
             (c.contactId === currentUser.id && c.userId === u.id)
      );
      const contactTimestamp = contactRecord?.createdAt || null;

      return {
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        level: u.level || 1,
        levelName: levelNames[userLevelKey] || `Nivel ${u.level}`,
        canBuyFromMe: sellCheck.allowed,
        canSellToMe: buyCheck.allowed,
        canTrade: buyCheck.allowed || sellCheck.allowed,
        unreadCount,
        lastMessageTimestamp,
        lastMessageContent,
        contactTimestamp
      };
    });

  // Sort partners from most recent to least recent
  partners.sort((a, b) => {
    const timeA = a.lastMessageTimestamp
      ? new Date(a.lastMessageTimestamp).getTime()
      : (a.contactTimestamp ? new Date(a.contactTimestamp).getTime() : 0);
    const timeB = b.lastMessageTimestamp
      ? new Date(b.lastMessageTimestamp).getTime()
      : (b.contactTimestamp ? new Date(b.contactTimestamp).getTime() : 0);

    if (timeB !== timeA) {
      return timeB - timeA; // Descending (most recent first)
    }
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  res.json({ partners });
});

// Market Chat Messages Endpoints
app.get('/api/market/messages/unread-count', (req, res) => {
  const { userId } = req.query as { userId: string };
  if (!userId) return res.status(400).json({ unreadCount: 0 });
  const db = readDb();
  if (!db.marketMessages) db.marketMessages = [];
  const unreadCount = db.marketMessages.filter(
    m => m.recipientId === userId && !m.read && m.senderId !== 'system_court'
  ).length;
  res.json({ success: true, unreadCount });
});

// Court / Legal Portal Badges & Notifications Endpoints
app.get('/api/court/unread-count', (req, res) => {
  const { userId, role } = req.query as { userId: string; role?: string };
  if (!userId) return res.status(400).json({ unreadCount: 0 });

  const db = readDb();
  if (!db.notifications) db.notifications = [];
  if (!db.courtLawsuits) db.courtLawsuits = [];

  const uid = String(userId);
  const isTeacher = role === 'teacher' || uid === 'profesor-1';

  let unreadCount = 0;

  // Unread court notifications
  const courtNotifs = db.notifications.filter(n => {
    if (n.read) return false;
    const isForUser = n.userId === uid || (isTeacher && (n.userId === 'teacher' || n.userId === 'profesor-1'));
    if (!isForUser) return false;
    const t = (n.title || '').toLowerCase();
    return (
      t.includes('⚖️') ||
      t.includes('demanda') ||
      t.includes('judicial') ||
      t.includes('sentencia') ||
      t.includes('auto') ||
      t.includes('embargo') ||
      t.includes('autos') ||
      t.includes('juzgado')
    );
  });

  unreadCount = courtNotifs.length;

  res.json({ success: true, unreadCount });
});

app.post('/api/court/notifications/mark-read', (req, res) => {
  const { userId, role } = req.body;
  if (!userId) return res.status(400).json({ success: false });

  const db = readDb();
  if (!db.notifications) db.notifications = [];
  const uid = String(userId);
  const isTeacher = role === 'teacher' || uid === 'profesor-1';

  let modified = false;
  db.notifications.forEach(n => {
    const isForUser = n.userId === uid || (isTeacher && (n.userId === 'teacher' || n.userId === 'profesor-1'));
    if (isForUser && !n.read) {
      const t = (n.title || '').toLowerCase();
      if (
        t.includes('⚖️') ||
        t.includes('demanda') ||
        t.includes('judicial') ||
        t.includes('sentencia') ||
        t.includes('auto') ||
        t.includes('embargo') ||
        t.includes('autos') ||
        t.includes('juzgado')
      ) {
        n.read = true;
        modified = true;
        syncNotificationToSupabase(n).catch(e => console.error(e));
      }
    }
  });

  if (modified) writeDb(db);
  res.json({ success: true });
});

app.get('/api/market/messages', (req, res) => {
  const { userId, partnerId } = req.query as { userId: string; partnerId: string };
  const db = readDb();
  if (!db.marketMessages) db.marketMessages = [];

  // Check and process any discounted promissory notes whose due date has arrived
  let modified = false;
  if (processDiscountedPromissoryNotesMaturity(db)) {
    modified = true;
  }

  // Mark messages sent by partnerId to userId as read
  db.marketMessages.forEach(m => {
    if (m.recipientId === userId && m.senderId === partnerId && !m.read) {
      m.read = true;
      modified = true;
      syncMarketMessageToSupabase(m).catch(e => console.error(e));
    }
  });
  if (modified) writeDb(db);

  const msgs = db.marketMessages.filter(
    m => (m.senderId === userId && m.recipientId === partnerId) ||
         (m.senderId === partnerId && m.recipientId === userId)
  );

  msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  res.json({ messages: msgs });
});

app.post('/api/market/messages', (req, res) => {
  const { senderId, recipientId, content } = req.body;
  if (!senderId || !recipientId || !content || !content.trim()) {
    return res.status(400).json({ error: 'Remitente, destinatario y contenido requeridos.' });
  }

  const db = readDb();
  const sender = db.users.find(u => u.id === senderId);
  const recipient = db.users.find(u => u.id === recipientId);

  if (!sender || !recipient) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const check1 = canTradeUsers(sender, recipient);
  const check2 = canTradeUsers(recipient, sender);
  if (!check1.allowed && !check2.allowed) {
    return res.status(400).json({ error: 'No está permitido comerciar ni mensajear con este usuario según las reglas de la cadena de suministro.' });
  }

  const chatId = [senderId, recipientId].sort().join('_');
  const now = new Date();
  const msg: MarketMessage = {
    id: generateId('msg'),
    chatId,
    senderId,
    senderName: sender.name,
    recipientId,
    recipientName: recipient.name,
    content: content.trim(),
    timestamp: now.toISOString(),
    read: false,
    type: 'text'
  };

  if (!db.marketMessages) db.marketMessages = [];
  db.marketMessages.push(msg);

  syncMarketMessageToSupabase(msg).catch(e => console.error(e));

  writeDb(db);

  res.json({ success: true, message: msg });
});

app.post('/api/market/messages/send-manual-invoice', (req, res) => {
  const {
    senderId,
    recipientId,
    concept,
    items: rawItems,
    discountAmount: rawDiscount,
    transportCost: rawTransport,
    insuranceFee: rawInsurance,
    orderId
  } = req.body;

  if (!senderId || !recipientId) {
    return res.status(400).json({ error: 'Emisor y receptor requeridos.' });
  }

  const db = readDb();
  const sender = db.users.find(u => u.id === senderId);
  const recipient = db.users.find(u => u.id === recipientId);

  if (!sender || !recipient) {
    return res.status(404).json({ error: 'Usuario o empresa no encontrada.' });
  }

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  if (!db.marketMessages) db.marketMessages = [];

  const now = new Date();
  const year = now.getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const invoiceNum = `FACT-${year}-${randomNum}`;

  let items: Array<{ title: string; quantity: number; unitPrice: number; subtotal: number }> = [];
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    items = rawItems.map(i => {
      const q = Math.max(1, Number(i.quantity) || 1);
      const p = Math.max(0, Number(i.unitPrice) || 0);
      return {
        title: String(i.title || 'Concepto comercial').trim(),
        quantity: q,
        unitPrice: p,
        subtotal: q * p
      };
    });
  } else {
    items = [{
      title: String(concept || 'Servicios / productos comerciales').trim(),
      quantity: 1,
      unitPrice: 100,
      subtotal: 100
    }];
  }

  const itemsSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = Math.max(0, Number(rawDiscount) || 0);
  const transportCost = Math.max(0, Number(rawTransport) || 0);
  const insuranceFee = Math.max(0, Number(rawInsurance) || 0);

  // Insurance is not subject to VAT (exempt). Taxable base only includes goods/services + accessory transport minus discounts.
  const taxableBase = Math.max(0, itemsSubtotal - discountAmount + transportCost);
  const vatRate = 21;
  const vatAmount = Math.round((taxableBase * 0.21) * 100) / 100;
  const totalAmount = Math.round((taxableBase + vatAmount + insuranceFee) * 100) / 100;

  let linkedOrder: any = null;

  if (orderId) {
    linkedOrder = db.rawMaterialOrders.find(o => o.id === orderId);
    if (linkedOrder) {
      linkedOrder.status = 'facturado';
      linkedOrder.invoiceNumber = invoiceNum;
      linkedOrder.invoicedAt = now.toISOString();
      linkedOrder.sellerLevel = sender.level || linkedOrder.sellerLevel || 1;
      linkedOrder.buyerLevel = recipient.level || linkedOrder.buyerLevel || 1;
      linkedOrder.deliveryAddress = linkedOrder.deliveryAddress || 'Dirección comercial registrada';
      linkedOrder.subtotalAmount = itemsSubtotal;
      linkedOrder.discountAmount = discountAmount;
      linkedOrder.transportCost = transportCost;
      linkedOrder.insuranceFee = insuranceFee;
      linkedOrder.basePrice = taxableBase;
      linkedOrder.ivaAmount = vatAmount;
      linkedOrder.vatAmount = vatAmount;
      linkedOrder.vatRate = vatRate;
      linkedOrder.totalAmount = totalAmount;
      linkedOrder.needsTransport = Boolean(transportCost > 0);
      linkedOrder.isDirectMessageInvoice = true;
      linkedOrder.isChatInvoice = true;
      linkedOrder.source = 'chat';
      linkedOrder.items = items.map(i => ({
        announcementId: 'manual_item',
        materialTitle: i.title,
        title: i.title,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
        totalCost: i.subtotal
      }));
      syncRawMaterialOrderToSupabase(linkedOrder).catch(e => console.error(e));
    }
  }

  if (!linkedOrder) {
    // Create new order record for custom manual invoice
    const totalQuantity = items.reduce((acc, i) => acc + i.quantity, 0);
    linkedOrder = {
      id: generateId('ord'),
      studentId: recipientId,
      studentName: recipient.name,
      sellerId: senderId,
      sellerName: sender.name,
      sellerLevel: sender.level || 1,
      buyerLevel: recipient.level || 1,
      announcementId: 'manual_invoice',
      materialType: 'hierro',
      materialTitle: concept || items[0]?.title || 'Factura comercial',
      quantity: totalQuantity,
      unitWeightKg: 1,
      totalKg: totalQuantity,
      basePrice: taxableBase,
      ivaAmount: vatAmount,
      needsTransport: Boolean(transportCost > 0),
      unitPrice: items[0]?.unitPrice || 0,
      items: items.map(i => ({
        announcementId: 'manual_item',
        materialTitle: i.title,
        title: i.title,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
        totalCost: i.subtotal
      })),
      subtotalAmount: itemsSubtotal,
      discountPercentage: 0,
      discountAmount,
      transportCost,
      insuranceFee,
      vatRate,
      vatAmount,
      totalAmount,
      status: 'facturado',
      invoiceNumber: invoiceNum,
      invoicedAt: now.toISOString(),
      requestedAt: now.toISOString(),
      deliveryAddress: 'Dirección comercial registrada',
      note: concept || 'Factura emitida manualmente por chat de mensajería',
      isDirectMessageInvoice: true,
      isChatInvoice: true,
      source: 'chat'
    };
    db.rawMaterialOrders.unshift(linkedOrder);
    syncRawMaterialOrderToSupabase(linkedOrder).catch(e => console.error(e));
  }

  const msgContent = `📄 FACTURA EMITIDA: ${invoiceNum} - ${items[0]?.title || 'Productos/Servicios'} (${totalAmount.toFixed(2)} € IVA incl.)`;

  const msg: MarketMessage = {
    id: generateId('msg'),
    chatId: [senderId, recipientId].sort().join('_'),
    senderId,
    senderName: sender.name,
    recipientId,
    recipientName: recipient.name,
    content: msgContent,
    timestamp: now.toISOString(),
    read: false,
    type: 'invoice',
    invoiceData: {
      id: linkedOrder.id,
      orderId: linkedOrder.id,
      invoiceNumber: invoiceNum,
      concept: concept || items[0]?.title || 'Factura comercial',
      items: items.map(i => ({
        announcementId: 'manual_item',
        materialTitle: i.title,
        title: i.title,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
        totalCost: i.subtotal
      })),
      itemsSubtotal,
      taxableBase,
      discountAmount,
      transportCost,
      insuranceFee,
      vatRate,
      vatAmount,
      totalAmount,
      issuedAt: now.toISOString(),
      sellerId: senderId,
      sellerName: sender.name,
      sellerLevel: sender.level || 1,
      buyerId: recipientId,
      buyerName: recipient.name,
      buyerLevel: recipient.level || 1,
      deliveryAddress: 'Dirección comercial registrada',
      paymentMethod: 'Transferencia bancaria directa',
      status: 'facturado'
    }
  };

  db.marketMessages.push(msg);
  syncMarketMessageToSupabase(msg).catch(e => console.error(e));

  addNotification(
    db,
    recipientId,
    'Nueva factura recibida en chat',
    `${sender.name} te ha enviado la factura oficial ${invoiceNum} por un importe total de ${totalAmount.toFixed(2)} € en mensajería directa.`,
    'order_approved',
    linkedOrder.id
  );

  writeDb(db);

  res.json({
    success: true,
    message: msg,
    order: linkedOrder,
    invoiceNumber: invoiceNum
  });
});

app.post('/api/market/messages/sign-promissory-note', (req, res) => {
  const {
    senderId,
    recipientId,
    amount: rawAmount,
    dueDate: rawDueDate,
    issuePlace: rawIssuePlace,
    issueDate: rawIssueDate,
    concept: rawConcept,
    orderType: rawOrderType,
    bankIban: rawBankIban,
    bankName: rawBankName,
    linkedInvoiceNumber
  } = req.body;

  if (!senderId || !recipientId) {
    return res.status(400).json({ error: 'Emisor (firmante/comprador) y receptor (tomador/vendedor) requeridos.' });
  }

  const amount = Number(rawAmount);
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'El importe del pagaré debe ser superior a 0,00 €.' });
  }

  if (!rawDueDate) {
    return res.status(400).json({ error: 'La fecha de vencimiento es un requisito indispensable por la Ley Cambiaria.' });
  }

  const db = readDb();
  const sender = db.users.find(u => u.id === senderId);
  const recipient = db.users.find(u => u.id === recipientId);

  if (!sender || !recipient) {
    return res.status(404).json({ error: 'Usuario o empresa no encontrada.' });
  }

  if (!db.paymentObligations) db.paymentObligations = [];
  if (!db.marketMessages) db.marketMessages = [];

  const now = new Date();
  const year = now.getFullYear();
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const promissoryNum = `PAG-${year}-${randomNum}`;
  const amountWords = numberToSpanishWords(amount);
  const formattedDueDate = new Date(rawDueDate).toISOString();
  const formattedIssueDate = rawIssueDate ? new Date(rawIssueDate).toISOString() : now.toISOString();
  const issuePlace = String(rawIssuePlace || 'Madrid').trim();
  const orderType = rawOrderType === 'a_la_orden' ? 'a_la_orden' : 'no_a_la_orden';
  const concept = String(rawConcept || (linkedInvoiceNumber ? `Pago aplazado Factura ${linkedInvoiceNumber}` : 'Compromiso cambiario de pago comercial')).trim();

  const senderIban = String(rawBankIban || sender.accountNumber || `ES21 0049 1500 05 1234567890`).trim();
  const bankName = String(rawBankName || 'Banco Central Mercantil S.A.').trim();

  const senderNif = String(req.body.issuerNif || (sender.id?.startsWith('user-') ? sender.id : `user-${sender.id}`)).trim();
  const recipientNif = String(req.body.beneficiaryNif || (recipient.id?.startsWith('user-') ? recipient.id : `user-${recipient.id}`)).trim();
  const senderAddress = (sender as any).address || 'Domicilio social registrado, Madrid';

  // 1. Generate unique Promissory Note ID
  const promissoryId = generateId('pn');

  // 2. Create MarketMessage
  const signatureHash = `FIRM-DIGITAL-CAMBIARIA-ART94-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const msgContent = `📑 PAGARÉ FIRMADO: ${promissoryNum} por ${formatNumber(amount)} € con vencimiento el ${new Date(formattedDueDate).toLocaleDateString('es-ES')} en favor de ${recipient.name} (Librador: ${sender.name}). Pago manual por transferencia.`;

  const promissoryData = {
    id: promissoryId,
    promissoryNoteNumber: promissoryNum,
    concept,
    amount,
    amountInWords: amountWords,
    issueDate: formattedIssueDate,
    issuePlace,
    dueDate: formattedDueDate,
    orderType: orderType as 'no_a_la_orden' | 'a_la_orden',
    beneficiaryId: recipient.id,
    beneficiaryName: recipient.name,
    beneficiaryNifCif: recipientNif,
    beneficiaryLevel: recipient.level || 1,
    issuerId: sender.id,
    issuerName: sender.name,
    issuerNifCif: senderNif,
    issuerAddress: senderAddress,
    issuerLevel: sender.level || 1,
    bankName,
    bankIban: senderIban,
    signatureTimestamp: now.toISOString(),
    signatureHash,
    status: 'pendiente' as const
  };

  const msg: MarketMessage = {
    id: generateId('msg'),
    chatId: [senderId, recipientId].sort().join('_'),
    senderId,
    senderName: sender.name,
    recipientId,
    recipientName: recipient.name,
    content: msgContent,
    timestamp: now.toISOString(),
    read: false,
    type: 'promissory_note',
    promissoryNoteData: promissoryData
  };

  db.marketMessages.push(msg);
  syncMarketMessageToSupabase(msg).catch(e => console.error('[Supabase DB] Error syncing promissory message:', e));

  // 3. Notification to the seller (recipient)
  addNotification(
    db,
    recipientId,
    'Nuevo pagaré cambiario recibido',
    `${sender.name} ha firmado y emitido a tu favor el pagaré cambiario oficial ${promissoryNum} por ${formatNumber(amount)} € con vencimiento el ${new Date(formattedDueDate).toLocaleDateString('es-ES')} (pago directo por transferencia al vencimiento).`,
    'transfer_received',
    promissoryId
  );

  writeDb(db);

  res.json({
    success: true,
    message: msg,
    promissoryNoteNumber: promissoryNum
  });
});

// Endpoint for beneficiary/vendor to discount a promissory note early at bank
app.post('/api/market/messages/discount-promissory-note', (req, res) => {
  const { messageId, beneficiaryId, noteNumber } = req.body;
  if (!messageId && !noteNumber) {
    return res.status(400).json({ error: 'messageId o noteNumber son requeridos.' });
  }

  const db = readDb();
  if (!db.marketMessages) db.marketMessages = [];

  let msg = db.marketMessages.find(m => 
    m.id === messageId || 
    m.promissoryNoteData?.id === messageId || 
    m.promissoryNoteData?.promissoryNoteNumber === messageId ||
    (noteNumber && m.promissoryNoteData?.promissoryNoteNumber === noteNumber)
  );

  if (!msg || msg.type !== 'promissory_note' || !msg.promissoryNoteData) {
    return res.status(404).json({ error: 'Pagaré cambiario no encontrado en el sistema de mensajería.' });
  }

  const pn = msg.promissoryNoteData;
  if (pn.status === 'pagado') {
    return res.status(400).json({ error: 'Este pagaré ya ha sido cobrado previamente.' });
  }
  if (pn.status === 'descontado') {
    return res.status(400).json({ error: 'Este pagaré ya ha sido descontado previamente en el banco.' });
  }
  if (pn.status === 'impagado') {
    return res.status(400).json({ error: 'Este pagaré figura como impagado y no puede ser descontado.' });
  }

  const beneficiary = db.users.find(u => 
    u.id === beneficiaryId || 
    u.username === beneficiaryId || 
    u.name === beneficiaryId ||
    u.id === pn.beneficiaryId
  );
  const isTeacher = beneficiary?.role === 'teacher' || beneficiary?.username === 'pupdaniel' || beneficiaryId === 'pupdaniel';
  const isAuthorized = isTeacher || 
                       pn.beneficiaryId === beneficiaryId || 
                       (beneficiary && pn.beneficiaryId === beneficiary.id) ||
                       (beneficiary && pn.beneficiaryName && beneficiary.name && pn.beneficiaryName.toLowerCase() === beneficiary.name.toLowerCase());

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Solo la empresa tomadora/beneficiaria del pagaré (acreedor vendedor) puede solicitar el descuento bancario.' });
  }

  let payer = db.users.find(u => u.id === pn.issuerId);
  if (!payer) {
    payer = db.users.find(u => 
      u.name?.toLowerCase() === pn.issuerName?.toLowerCase() ||
      (u as any).companyName?.toLowerCase() === pn.issuerName?.toLowerCase() ||
      u.username === pn.issuerId
    );
  }

  if (!beneficiary) return res.status(404).json({ error: 'Empresa beneficiaria (acreedor vendedor) no encontrada.' });
  if (!payer) return res.status(404).json({ error: 'Empresa libradora (comprador deudor) no encontrada.' });

  const amount = Number(pn.amount);
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Importe del pagaré no válido.' });
  }

  // Calculate days remaining until due date
  const now = new Date();
  const dueDate = new Date(pn.dueDate);
  const diffTime = dueDate.getTime() - now.getTime();
  const daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  // Financial discount calculation:
  // 6% nominal annual discount applied proportionally to days remaining (base 360 commercial days)
  const discountRate = 0.06;
  const discountInterest = Number(((amount * discountRate * daysRemaining) / 360).toFixed(2));

  // Commission: 0.5% over nominal amount
  const commissionRate = 0.005;
  const discountCommission = Number((amount * commissionRate).toFixed(2));

  // Net advance amount credited to creditor seller
  const netAmount = Number((amount - discountInterest - discountCommission).toFixed(2));

  // Credit beneficiary balance
  beneficiary.balance = Number((beneficiary.balance + netAmount).toFixed(2));

  const txId = generateId('tx');
  const transferConcept = `Anticipo de descuento de pagaré ${pn.promissoryNoteNumber} (nominal: ${formatNumber(amount)} €, dto. 6% [${daysRemaining} d.]: -${formatNumber(discountInterest)} €, com. 0,5%: -${formatNumber(discountCommission)} €, líquido: ${formatNumber(netAmount)} €)`;

  const newTransfer: Transfer = {
    id: txId,
    senderId: 'corp-banco-central',
    senderName: 'Banco Central Mercantil (Descuento comercial de efectos)',
    senderAccount: 'ES210001000299887700',
    receiverId: beneficiary.id,
    receiverName: beneficiary.name,
    receiverAccount: beneficiary.accountNumber || 'ES00 0000 0000 0000 0000',
    amount: netAmount,
    concept: transferConcept,
    timestamp: now.toISOString()
  };

  if (!db.transfers) db.transfers = [];
  db.transfers.unshift(newTransfer);

  // Update promissory note data
  pn.status = 'descontado';
  pn.isDiscounted = true;
  pn.discountedAt = now.toISOString();
  pn.discountDays = daysRemaining;
  pn.discountRate = 6;
  pn.discountInterest = discountInterest;
  pn.discountCommissionRate = 0.5;
  pn.discountCommission = discountCommission;
  pn.discountNetReceived = netAmount;
  pn.discountTransferId = txId;

  // Direct message notification in chat thread
  const discountMsg: MarketMessage = {
    id: generateId('msg'),
    chatId: msg.chatId,
    senderId: beneficiary.id,
    senderName: beneficiary.name,
    recipientId: payer.id,
    recipientName: payer.name,
    content: `🏦 Pagaré descontado en banco: El acreedor vendedor ${beneficiary.name} ha anticipado el cobro del pagaré oficial ${pn.promissoryNoteNumber} en su entidad financiera.\n• Importe nominal: ${formatNumber(amount)} €\n• Descuento financiero (6,00% nominal anual, ${daysRemaining} días hasta vencimiento): -${formatNumber(discountInterest)} €\n• Comisión de descuento (0,50% sobre nominal): -${formatNumber(discountCommission)} €\n• Líquido ingresado en cuenta: ${formatNumber(netAmount)} €.\nAl vencimiento (${new Date(pn.dueDate).toLocaleDateString('es-ES')}), el banco cargará el importe íntegro (${formatNumber(amount)} €) en la cuenta del comprador deudor (${payer.name}).`,
    timestamp: now.toISOString(),
    read: false,
    type: 'text'
  };
  db.marketMessages.push(discountMsg);

  // Add system notifications
  addNotification(
    db,
    beneficiary.id,
    'Pagaré descontado con éxito',
    `Has anticipado el cobro del pagaré ${pn.promissoryNoteNumber}. Se han abonado ${formatNumber(netAmount)} € netos en tu cuenta bancaria (nominal: ${formatNumber(amount)} €, dto. 6%: -${formatNumber(discountInterest)} €, com. 0,5%: -${formatNumber(discountCommission)} €).`,
    'transfer_received',
    txId
  );

  addNotification(
    db,
    payer.id,
    'Pagaré descontado por el proveedor',
    `El acreedor ${beneficiary.name} ha descontado el pagaré oficial ${pn.promissoryNoteNumber} (${formatNumber(amount)} €). El banco cargará el importe nominal en tu cuenta en la fecha de vencimiento (${new Date(pn.dueDate).toLocaleDateString('es-ES')}).`,
    'transfer_received',
    txId
  );

  writeDb(db);

  // Sync to PostgreSQL Supabase
  if (beneficiary.role === 'student') syncAccountToSupabase(beneficiary.id, beneficiary.name, beneficiary.balance).catch(e => console.error(e));
  syncMovimientoToSupabase(txId + '-in', beneficiary.id, 'TRANSFER_IN', netAmount, now.toISOString(), transferConcept, newTransfer).catch(e => console.error(e));
  syncMarketMessageToSupabase(msg).catch(e => console.error(e));
  syncMarketMessageToSupabase(discountMsg).catch(e => console.error(e));

  res.json({
    success: true,
    message: `Pagaré ${pn.promissoryNoteNumber} descontado con éxito. Se han ingresado +${formatNumber(netAmount)} € líquidos en tu cuenta.`,
    transfer: newTransfer,
    updatedMessage: msg,
    newBalance: beneficiary.balance,
    calculation: {
      nominalAmount: amount,
      daysRemaining,
      discountRate: 6,
      discountInterest,
      commissionRate: 0.5,
      discountCommission,
      netAmount
    }
  });
});

// Endpoint for beneficiary/vendor to place a promissory note in bank collection management (gestión de cobro)
app.post('/api/market/messages/collection-management-promissory-note', (req, res) => {
  const { messageId, beneficiaryId, noteNumber } = req.body;
  if (!messageId && !noteNumber) {
    return res.status(400).json({ error: 'messageId o noteNumber son requeridos.' });
  }

  const db = readDb();
  if (!db.marketMessages) db.marketMessages = [];

  let msg = db.marketMessages.find(m => 
    m.id === messageId || 
    m.promissoryNoteData?.id === messageId || 
    m.promissoryNoteData?.promissoryNoteNumber === messageId ||
    (noteNumber && m.promissoryNoteData?.promissoryNoteNumber === noteNumber)
  );

  if (!msg || msg.type !== 'promissory_note' || !msg.promissoryNoteData) {
    return res.status(404).json({ error: 'Pagaré cambiario no encontrado en el sistema de mensajería.' });
  }

  const pn = msg.promissoryNoteData;
  if (pn.status === 'pagado') {
    return res.status(400).json({ error: 'Este pagaré ya ha sido cobrado previamente.' });
  }
  if (pn.status === 'descontado') {
    return res.status(400).json({ error: 'Este pagaré ya ha sido descontado previamente en el banco.' });
  }
  if (pn.status === 'gestion_cobro') {
    return res.status(400).json({ error: 'Este pagaré ya se encuentra entregado en gestión de cobro bancario.' });
  }
  if (pn.status === 'impagado') {
    return res.status(400).json({ error: 'Este pagaré figura como impagado y no puede ser gestionado.' });
  }

  const beneficiary = db.users.find(u => 
    u.id === beneficiaryId || 
    u.username === beneficiaryId || 
    u.name === beneficiaryId ||
    u.id === pn.beneficiaryId
  );
  const isTeacher = beneficiary?.role === 'teacher' || beneficiary?.username === 'pupdaniel' || beneficiaryId === 'pupdaniel';
  const isAuthorized = isTeacher || 
                       pn.beneficiaryId === beneficiaryId || 
                       (beneficiary && pn.beneficiaryId === beneficiary.id) ||
                       (beneficiary && pn.beneficiaryName && beneficiary.name && pn.beneficiaryName.toLowerCase() === beneficiary.name.toLowerCase());

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Solo la empresa tomadora/beneficiaria del pagaré (acreedor vendedor) puede solicitar la gestión de cobro bancario.' });
  }

  let payer = db.users.find(u => u.id === pn.issuerId);
  if (!payer) {
    payer = db.users.find(u => 
      u.name?.toLowerCase() === pn.issuerName?.toLowerCase() ||
      (u as any).companyName?.toLowerCase() === pn.issuerName?.toLowerCase() ||
      u.username === pn.issuerId
    );
  }

  if (!beneficiary) return res.status(404).json({ error: 'Empresa beneficiaria (acreedor vendedor) no encontrada.' });
  if (!payer) return res.status(404).json({ error: 'Empresa libradora (comprador deudor) no encontrada.' });

  const amount = Number(pn.amount);
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Importe del pagaré no válido.' });
  }

  // Commission: 0.5% over nominal amount with minimum of 20.00 €
  const commission = Math.max(20, Number((amount * 0.005).toFixed(2)));

  if (beneficiary.balance < commission) {
    return res.status(400).json({ 
      error: `Saldo insuficiente para abonar la comisión de gestión de cobro (${formatNumber(commission)} €). Saldo actual en cuenta: ${formatNumber(beneficiary.balance)} €.` 
    });
  }

  const now = new Date();

  // Debit commission from beneficiary account
  beneficiary.balance = Number((beneficiary.balance - commission).toFixed(2));

  const txId = generateId('tx');
  const transferConcept = `Comisión de servicio de gestión de cobro de pagaré ${pn.promissoryNoteNumber} (0,5% sobre ${formatNumber(amount)} €, mínimo 20,00 €)`;

  const collectionCommissionTransfer: Transfer = {
    id: txId,
    senderId: beneficiary.id,
    senderName: beneficiary.name,
    senderAccount: beneficiary.accountNumber || 'ES00 0000 0000 0000 0000',
    receiverId: 'corp-banco-central',
    receiverName: 'Banco Central Mercantil (Servicio de gestión de cobro)',
    receiverAccount: 'ES210001000299887700',
    amount: commission,
    concept: transferConcept,
    timestamp: now.toISOString()
  };

  if (!db.transfers) db.transfers = [];
  db.transfers.unshift(collectionCommissionTransfer);

  // Update Promissory Note status to 'gestion_cobro'
  pn.status = 'gestion_cobro';
  pn.isCollectionManagement = true;
  pn.collectionManagementAt = now.toISOString();
  pn.collectionCommissionRate = 0.005;
  pn.collectionCommission = commission;
  pn.collectionTransferId = txId;

  // Insert informative message in DM thread
  const collectionMsg: MarketMessage = {
    id: generateId('msg'),
    chatId: msg.chatId,
    senderId: beneficiary.id,
    senderName: beneficiary.name,
    recipientId: payer.id,
    recipientName: payer.name,
    content: `🏛️ Pagaré en gestión de cobro: El vendedor acreedor (${beneficiary.name}) ha entregado el pagaré oficial ${pn.promissoryNoteNumber} por ${formatNumber(amount)} € a su banco en gestión de cobro (comisión abonada: ${formatNumber(commission)} €). El banco tramitará e ingresará automáticamente el nominal en cuenta al llegar su vencimiento (${new Date(pn.dueDate).toLocaleDateString('es-ES')}) sin necesidad de pulsar cobrar.`,
    timestamp: now.toISOString(),
    read: false,
    type: 'text'
  };
  db.marketMessages.push(collectionMsg);

  // Add system notifications
  addNotification(
    db,
    beneficiary.id,
    'Pagaré entregado en gestión de cobro',
    `Has cedido el pagaré ${pn.promissoryNoteNumber} (${formatNumber(amount)} €) en gestión de cobro bancaria. Se ha cargado la comisión de ${formatNumber(commission)} € (0,5%, mín. 20 €). El banco ingresará automáticamente los ${formatNumber(amount)} € al vencimiento (${new Date(pn.dueDate).toLocaleDateString('es-ES')}).`,
    'transfer_received',
    txId
  );

  addNotification(
    db,
    payer.id,
    'Pagaré entregado en gestión de cobro por el proveedor',
    `El acreedor ${beneficiary.name} ha entregado el pagaré oficial ${pn.promissoryNoteNumber} (${formatNumber(amount)} €) en gestión de cobro bancaria. El banco cargará el importe nominal en tu cuenta a la fecha de vencimiento (${new Date(pn.dueDate).toLocaleDateString('es-ES')}).`,
    'transfer_received',
    txId
  );

  writeDb(db);

  // Sync to PostgreSQL Supabase
  if (beneficiary.role === 'student') syncAccountToSupabase(beneficiary.id, beneficiary.name, beneficiary.balance).catch(e => console.error(e));
  syncMovimientoToSupabase(txId + '-out', beneficiary.id, 'TRANSFER_OUT', commission, now.toISOString(), transferConcept, collectionCommissionTransfer).catch(e => console.error(e));
  syncMarketMessageToSupabase(msg).catch(e => console.error(e));
  syncMarketMessageToSupabase(collectionMsg).catch(e => console.error(e));

  res.json({
    success: true,
    message: `Pagaré ${pn.promissoryNoteNumber} entregado en gestión de cobro con éxito. Comisión abonada: ${formatNumber(commission)} €. El banco liquidará el cobro automáticamente a su vencimiento.`,
    transfer: collectionCommissionTransfer,
    updatedMessage: msg,
    newBalance: beneficiary.balance,
    commission
  });
});

// Endpoint for beneficiary/vendor to collect/cash a promissory note at bank on or after due date
app.post('/api/market/messages/collect-promissory-note', (req, res) => {
  const { messageId, beneficiaryId, noteNumber } = req.body;
  if (!messageId && !noteNumber) {
    return res.status(400).json({ error: 'messageId o noteNumber son requeridos.' });
  }

  const db = readDb();
  if (!db.marketMessages) db.marketMessages = [];

  let msg = db.marketMessages.find(m => 
    m.id === messageId || 
    m.promissoryNoteData?.id === messageId || 
    m.promissoryNoteData?.promissoryNoteNumber === messageId ||
    (noteNumber && m.promissoryNoteData?.promissoryNoteNumber === noteNumber)
  );

  if (!msg || msg.type !== 'promissory_note' || !msg.promissoryNoteData) {
    return res.status(404).json({ error: 'Pagaré cambiario no encontrado en el sistema de mensajería.' });
  }

  const pn = msg.promissoryNoteData;
  if (pn.status === 'pagado') {
    return res.status(400).json({ error: 'Este pagaré ya ha sido cobrado y liquidado previamente en el banco.' });
  }
  if (pn.status === 'descontado') {
    return res.status(400).json({ error: 'Este pagaré ya fue descontado por anticipado en el banco. La liquidación con el deudor se efectuará automáticamente al vencimiento.' });
  }

  const beneficiary = db.users.find(u => 
    u.id === beneficiaryId || 
    u.username === beneficiaryId || 
    u.name === beneficiaryId ||
    u.id === pn.beneficiaryId
  );
  const isTeacher = beneficiary?.role === 'teacher' || beneficiary?.username === 'pupdaniel' || beneficiaryId === 'pupdaniel';
  const isAuthorized = isTeacher || 
                       pn.beneficiaryId === beneficiaryId || 
                       (beneficiary && pn.beneficiaryId === beneficiary.id) ||
                       (beneficiary && pn.beneficiaryName && beneficiary.name && pn.beneficiaryName.toLowerCase() === beneficiary.name.toLowerCase());

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Solo la empresa tomadora/beneficiaria del pagaré puede presentar el pagaré al cobro.' });
  }

  // Check due date: must be today or past
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  const todayLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dueStr = (pn.dueDate || '').slice(0, 10);
  const isPastOrToday = todayUtc >= dueStr || todayLocal >= dueStr || now.getTime() >= new Date(pn.dueDate).getTime() || isTeacher;

  if (!isPastOrToday) {
    return res.status(400).json({
      error: `No es posible cobrar el pagaré antes de su fecha de vencimiento (${new Date(pn.dueDate).toLocaleDateString('es-ES')}).`
    });
  }

  let payer = db.users.find(u => u.id === pn.issuerId);
  if (!payer) {
    payer = db.users.find(u => 
      u.name?.toLowerCase() === pn.issuerName?.toLowerCase() || 
      (u as any).companyName?.toLowerCase() === pn.issuerName?.toLowerCase() || 
      u.username === pn.issuerId
    );
  }

  if (!beneficiary) return res.status(404).json({ error: 'Empresa beneficiaria no encontrada.' });
  if (!payer) return res.status(404).json({ error: 'Empresa libradora/compradora no encontrada.' });

  const amount = Number(pn.amount);
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Importe del pagaré no válido.' });
  }

  // Case 1: Insufficient funds in buyer's bank account -> Mark as "impagado"
  if (payer.balance < amount) {
    pn.status = 'impagado';
    pn.collectRequested = true;
    pn.collectRequestedAt = now.toISOString();

    const protestMsg: MarketMessage = {
      id: generateId('msg'),
      chatId: msg.chatId,
      senderId: beneficiary.id,
      senderName: beneficiary.name,
      recipientId: payer.id,
      recipientName: payer.name,
      content: `❌ Pagaré impagado por falta de fondos: El tomador ${beneficiary.name} ha presentado al cobro bancario el pagaré ${pn.promissoryNoteNumber} por ${formatNumber(amount)} €, pero la cuenta del librador (${payer.name}) no dispone de saldo suficiente (${formatCurrency(payer.balance)} disponibles). El efecto queda en estado de impago con fuerza ejecutiva.`,
      timestamp: now.toISOString(),
      read: false,
      type: 'text'
    };
    db.marketMessages.push(protestMsg);

    addNotification(
      db,
      beneficiary.id,
      'Pagaré impagado por falta de fondos',
      `El pagaré ${pn.promissoryNoteNumber} de ${formatNumber(amount)} € emitido por ${payer.name} ha resultado impagado por saldo insuficiente.`,
      'transfer_received',
      pn.id || messageId
    );

    addNotification(
      db,
      payer.id,
      'Aviso de pagaré impagado',
      `El proveedor ${beneficiary.name} ha presentado al cobro el pagaré ${pn.promissoryNoteNumber} por ${formatNumber(amount)} €, pero tu cuenta no dispone de saldo suficiente. Efecto impagado.`,
      'transfer_received',
      pn.id || messageId
    );

    writeDb(db);
    syncMarketMessageToSupabase(msg).catch(e => console.error(e));
    syncMarketMessageToSupabase(protestMsg).catch(e => console.error(e));

    return res.json({
      success: false,
      isImpagado: true,
      error: `Pagaré impagado: El comprador (${payer.name}) no dispone de saldo suficiente (${formatCurrency(payer.balance)}) en su cuenta bancaria.`,
      updatedMessage: msg
    });
  }

  // Case 2: Sufficient funds -> Direct bank clearing: debit buyer, credit vendor
  payer.balance = Number((payer.balance - amount).toFixed(2));
  beneficiary.balance = Number((beneficiary.balance + amount).toFixed(2));

  const txId = generateId('tx');
  const transferConcept = `Cobro de pagaré bancario ${pn.promissoryNoteNumber} - ${pn.concept || 'Compensación cambiaria'}`;

  const newTransfer: Transfer = {
    id: txId,
    senderId: payer.id,
    senderName: payer.name,
    senderAccount: payer.accountNumber || pn.bankIban,
    receiverId: beneficiary.id,
    receiverName: beneficiary.name,
    receiverAccount: beneficiary.accountNumber || `ES00 0000 0000 0000 0000`,
    amount: amount,
    concept: transferConcept,
    timestamp: now.toISOString()
  };

  if (!db.transfers) db.transfers = [];
  db.transfers.unshift(newTransfer);

  pn.status = 'pagado';
  pn.paidAt = now.toISOString();
  pn.paidTransferId = txId;
  pn.collectRequested = true;
  pn.collectRequestedAt = now.toISOString();

  // Chat message confirmation
  const successMsg: MarketMessage = {
    id: generateId('msg'),
    chatId: msg.chatId,
    senderId: beneficiary.id,
    senderName: beneficiary.name,
    recipientId: payer.id,
    recipientName: payer.name,
    content: `🏦 Pagaré cobrado en banco: El beneficiario ${beneficiary.name} ha presentado al cobro el pagaré oficial ${pn.promissoryNoteNumber} por ${formatNumber(amount)} €. Se ha cargado en la cuenta del librador y abonado en la cuenta del tomador (Ref. bancaria: ${txId}).`,
    timestamp: now.toISOString(),
    read: false,
    type: 'text'
  };
  db.marketMessages.push(successMsg);

  addNotification(
    db,
    beneficiary.id,
    'Pagaré cobrado exitosamente',
    `Has cobrado en el banco el pagaré ${pn.promissoryNoteNumber} por ${formatNumber(amount)} € de ${payer.name}. Saldo abonado en tu cuenta.`,
    'transfer_received',
    txId
  );

  addNotification(
    db,
    payer.id,
    'Cargo de pagaré al vencimiento',
    `El banco ha liquidado el pagaré ${pn.promissoryNoteNumber} por ${formatNumber(amount)} € presentado al cobro por ${beneficiary.name}.`,
    'transfer_received',
    txId
  );

  writeDb(db);

  // Sync to PostgreSQL Supabase
  if (payer.role === 'student') syncAccountToSupabase(payer.id, payer.name, payer.balance).catch(e => console.error(e));
  if (beneficiary.role === 'student') syncAccountToSupabase(beneficiary.id, beneficiary.name, beneficiary.balance).catch(e => console.error(e));
  syncMovimientoToSupabase(txId + '-out', payer.id, 'TRANSFER_OUT', amount, now.toISOString(), transferConcept, newTransfer).catch(e => console.error(e));
  syncMovimientoToSupabase(txId + '-in', beneficiary.id, 'TRANSFER_IN', amount, now.toISOString(), transferConcept, newTransfer).catch(e => console.error(e));
  syncMarketMessageToSupabase(msg).catch(e => console.error(e));
  syncMarketMessageToSupabase(successMsg).catch(e => console.error(e));

  res.json({
    success: true,
    message: `Pagaré cobrado con éxito por ${formatNumber(amount)} €. Saldo actualizado.`,
    transfer: newTransfer,
    updatedMessage: msg,
    newBalance: beneficiary.balance
  });
});

app.get(['/api/raw-materials/inventory', '/api/raw-materials/inventory/:studentId'], (req, res) => {
  const studentId = req.params.studentId || (req.query.studentId as string);
  if (!studentId) {
    return res.status(400).json({ error: 'studentId es requerido' });
  }
  const db = readDb();

  const inv = checkAndCalculateProduction(db, studentId);
  const student = db.users.find(u => u.id === studentId);
  syncInventoryToSupabase(inv, student?.name).catch(e => console.error(e));
  writeDb(db);

  const rawMaterials = {
    fragmentos_hierro_kg: inv.ironKg || 0,
    fragmentos_metal_kg: inv.metalKg || 0,
    pellets_plastico_kg: inv.plasticKg || 0,
    pegamento_epoxi_kg: inv.epoxiKg || 0
  };

  const producedGoods = {
    rodProductionMode: (inv as any).rodProductionMode || null,
    varillas_punta: inv.producedRodsUnits || 0,
    varillas_punta_estrella: (inv as any).producedStarRodsUnits || (inv as any).producedIronRodsUnits || 0,
    varillas_punta_plana: (inv as any).producedFlatRodsUnits || (inv as any).producedMetalRodsUnits || 0,
    varillas_hierro_punta: (inv as any).producedStarRodsUnits || (inv as any).producedIronRodsUnits || 0,
    varillas_metal_punta: (inv as any).producedFlatRodsUnits || (inv as any).producedMetalRodsUnits || 0,
    productos_ensamblados: inv.producedScrewdriversUnits || 0,
    destornilladores_punta_estrella: (inv as any).starScrewdriversUnits || (inv as any).ironScrewdriversUnits || 0,
    destornilladores_punta_plana: (inv as any).flatScrewdriversUnits || (inv as any).metalScrewdriversUnits || 0,
    destornilladores_hierro: (inv as any).starScrewdriversUnits || (inv as any).ironScrewdriversUnits || 0,
    destornilladores_metal: (inv as any).flatScrewdriversUnits || (inv as any).metalScrewdriversUnits || 0,
    producedScrewdriversUnits: inv.producedScrewdriversUnits || 0
  };

  res.json({
    success: true,
    inventory: inv,
    rawMaterials,
    producedGoods
  });
});

app.post('/api/raw-materials/rod-production-mode', (req, res) => {
  const { studentId, mode } = req.body;
  if (!studentId || !mode) {
    return res.status(400).json({ error: 'studentId y mode son requeridos' });
  }
  if (mode !== 'estrella' && mode !== 'plana') {
    return res.status(400).json({ error: 'mode debe ser estrella o plana' });
  }
  const db = readDb();
  const inv = checkAndCalculateProduction(db, studentId);
  (inv as any).rodProductionMode = mode;
  inv.updatedAt = new Date().toISOString();

  const student = db.users.find(u => u.id === studentId);
  syncInventoryToSupabase(inv, student?.name).catch(e => console.error(e));
  writeDb(db);

  const rawMaterials = {
    fragmentos_hierro_kg: inv.ironKg || 0,
    pellets_plastico_kg: inv.plasticKg || 0,
    pegamento_epoxi_kg: inv.epoxiKg || 0
  };

  const producedGoods = {
    rodProductionMode: (inv as any).rodProductionMode || null,
    varillas_punta: inv.producedRodsUnits || 0,
    varillas_punta_estrella: (inv as any).producedStarRodsUnits || 0,
    varillas_punta_plana: (inv as any).producedFlatRodsUnits || 0,
    productos_ensamblados: inv.producedScrewdriversUnits || 0,
    destornilladores_punta_estrella: (inv as any).starScrewdriversUnits || 0,
    destornilladores_punta_plana: (inv as any).flatScrewdriversUnits || 0,
  };

  res.json({
    success: true,
    inventory: inv,
    rawMaterials,
    producedGoods
  });
});

// -------------------------------------------------------------
// COURT & LAWSUITS API ENDPOINTS (JUZGADO DE 1ª INSTANCIA)
// -------------------------------------------------------------

// Helper to get judicial case number
function generateCaseNumber(type: 'ordinaria' | 'cambiaria'): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return type === 'cambiaria' ? `CAMB-${year}/${month}-${rand}` : `ORD-${year}/${month}-${rand}`;
}

// Helper to calculate business days (días hábiles - excluyendo sábados y domingos)
function addBusinessDays(startDate: Date, days: number): Date {
  let count = 0;
  const curDate = new Date(startDate);
  while (count < days) {
    curDate.setDate(curDate.getDate() + 1);
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0: Sunday, 6: Saturday
      count++;
    }
  }
  return curDate;
}

// Get all lawsuits for a user (or all if teacher/judge)
app.get('/api/court/lawsuits', (req, res) => {
  const { userId } = req.query;
  const db = readDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];

  if (!userId) {
    return res.json({ success: true, lawsuits: db.courtLawsuits });
  }

  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const isJudge = user.role === 'teacher' || 
                  user.username?.toLowerCase() === 'pupdaniel' || 
                  user.id === 'pupdaniel' || 
                  user.id.toLowerCase().includes('pupdaniel');

  if (isJudge) {
    return res.json({ success: true, lawsuits: db.courtLawsuits });
  }

  const userLawsuits = db.courtLawsuits.filter(
    l => l.plaintiffId === userId || l.defendantId === userId
  );

  res.json({ success: true, lawsuits: userLawsuits });
});

// Get unpaid/overdue promissory notes for a user to make cambiario claim easy
app.get('/api/court/unpaid-notes', (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId es requerido' });
  }

  const db = readDb();
  if (!db.marketMessages) db.marketMessages = [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const eligibleNotes: PromissoryNoteData[] = [];

  db.marketMessages.forEach(msg => {
    if (msg.type === 'promissory_note' && msg.promissoryNoteData) {
      const pn = msg.promissoryNoteData;
      if (pn.beneficiaryId === userId) {
        const isOverdue = (pn.dueDate || '').slice(0, 10) <= todayStr;
        if (pn.status === 'impagado' || (pn.status === 'pendiente' && isOverdue)) {
          eligibleNotes.push(pn);
        }
      }
    }
  });

  res.json({ success: true, notes: eligibleNotes });
});

// File a new lawsuit (Demanda ordinaria o Cambiaria)
app.post('/api/court/lawsuits', (req, res) => {
  const {
    type,
    subtype,
    plaintiffId,
    defendantId,
    claimedAmount,
    goodsDescription,
    facts,
    legalBasis,
    petitum,
    evidenceSummary,
    attachments,
    contractDate,
    relatedOrderId,
    promissoryNoteNumber,
    promissoryNoteId
  } = req.body;

  if (!type || !subtype || !plaintiffId || !defendantId || !claimedAmount || !facts || !goodsDescription) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para formalizar el escrito de demanda.' });
  }

  const numAmount = Number(claimedAmount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'La cuantía reclamada debe ser un importe numérico válido y positivo.' });
  }

  // Validate attachments: strictly PDF files only
  const validAttachments: CourtAttachment[] = [];
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      if (!att || !att.name) continue;
      const isPdfName = att.name.toLowerCase().endsWith('.pdf');
      const isPdfData = !att.dataUrl || att.dataUrl.startsWith('data:application/pdf') || att.dataUrl.startsWith('blob:') || isPdfName;
      if (!isPdfName && !isPdfData) {
        return res.status(400).json({ error: `El archivo "${att.name}" no es válido. Solo se admiten documentos en formato PDF (.pdf).` });
      }
      validAttachments.push({
        id: att.id || generateId('doc'),
        name: att.name,
        size: Number(att.size) || 0,
        uploadedAt: att.uploadedAt || new Date().toISOString(),
        dataUrl: att.dataUrl || '',
        docType: att.docType || 'documento_probatorio'
      });
    }
  }

  const db = readDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];

  const plaintiff = db.users.find(u => u.id === plaintiffId);
  const defendant = db.users.find(u => u.id === defendantId);

  if (!plaintiff) return res.status(404).json({ error: 'Demandante no encontrado en el sistema.' });
  if (!defendant) return res.status(404).json({ error: 'Demandado no encontrado en el sistema.' });

  // Calculate interest and costs (30% in juicio cambiario per Art. 821 LEC, or standard legal interest 5% in ordinaria)
  const interestAndCostsAmount = type === 'cambiaria' 
    ? Number((numAmount * 0.30).toFixed(2)) 
    : Number((numAmount * 0.05).toFixed(2));
  
  const totalClaimAmount = Number((numAmount + interestAndCostsAmount).toFixed(2));
  const caseNumber = generateCaseNumber(type);
  const now = new Date();

  // Automatic billing of Lawyer fee: 15% of claimed amount + 21% IVA
  const lawyerFeeBase = Number((numAmount * 0.15).toFixed(2));
  const lawyerFeeIva = Number((lawyerFeeBase * 0.21).toFixed(2));
  const lawyerFeeTotal = Number((lawyerFeeBase + lawyerFeeIva).toFixed(2));
  const lawyerFeeInvoiceNum = `FRA-ABOG-${caseNumber.replace(/[^0-9]/g, '').slice(0, 8)}`;

  // Deduct lawyer fee from plaintiff balance
  plaintiff.balance = Number((plaintiff.balance - lawyerFeeTotal).toFixed(2));

  const feeTxId = generateId('tx');
  const feeConcept = `Minuta Letrado (15% s/ ${formatNumber(numAmount)} €) + IVA 21% - Demanda ${caseNumber} [Factura ${lawyerFeeInvoiceNum}]`;
  const lawyerTransfer: Transfer = {
    id: feeTxId,
    senderId: plaintiff.id,
    senderName: plaintiff.name,
    senderAccount: plaintiff.accountNumber,
    receiverId: 'corp-despacho-abogados',
    receiverName: 'Despacho Jurídico & Letrados Procesales S.L.P.',
    receiverAccount: 'ES980001004455667788',
    amount: lawyerFeeTotal,
    concept: feeConcept,
    timestamp: now.toISOString()
  };

  if (!db.transfers) db.transfers = [];
  db.transfers.unshift(lawyerTransfer);

  let promissoryNoteData: PromissoryNoteData | undefined;
  if (type === 'cambiaria' && promissoryNoteNumber) {
    const noteMsg = db.marketMessages?.find(
      m => m.type === 'promissory_note' && m.promissoryNoteData?.promissoryNoteNumber === promissoryNoteNumber
    );
    if (noteMsg && noteMsg.promissoryNoteData) {
      promissoryNoteData = noteMsg.promissoryNoteData;
    }
  }

  const lawsuit: CourtLawsuit = {
    id: generateId('dem'),
    caseNumber,
    courtName: 'Juzgado de 1ª Instancia e Instrucción Nº 1 (Sede Electrónica)',
    type,
    subtype,
    plaintiffId,
    plaintiffName: plaintiff.name,
    plaintiffNif: plaintiff.username?.toUpperCase() + '-ES',
    plaintiffIban: plaintiff.accountNumber,
    defendantId,
    defendantName: defendant.name,
    defendantNif: defendant.username?.toUpperCase() + '-ES',
    defendantIban: defendant.accountNumber,
    claimedAmount: numAmount,
    interestAndCostsAmount,
    totalClaimAmount,
    contractDate: contractDate || now.toISOString().slice(0, 10),
    goodsDescription,
    facts,
    legalBasis: legalBasis || (type === 'cambiaria' 
      ? 'Arts. 819 a 827 de la Ley de Enjuiciamiento Civil (LEC) y Arts. 49, 94 y concordantes de la Ley Cambiaria y del Cheque (LCCh).'
      : 'Arts. 399 y concordantes de la LEC; Arts. 325, 336 y 345 del Código de Comercio; Art. 1124 del Código Civil.'),
    petitum: petitum || (type === 'cambiaria'
      ? `Requerimiento judicial de pago inmediato por ${formatNumber(numAmount)} € de principal más ${formatNumber(interestAndCostsAmount)} € para intereses de demora procesal y costas, con decreto de embargo preventivo cautelar sobre las cuentas y bienes del demandado.`
      : `Sentencia condenatoria que declare el incumplimiento contractual y condene al demandado al pago de ${formatNumber(numAmount)} €, más los intereses legales devengados y las costas procesales.`),
    evidenceSummary: evidenceSummary || 'Mensajería contractual, extractos bancarios, pagaré oficial y registros del simulador.',
    attachments: validAttachments,
    relatedOrderId,
    promissoryNoteNumber,
    promissoryNoteId,
    promissoryNoteDueDate: promissoryNoteData?.dueDate,
    promissoryNoteData,
    status: 'pendiente_admision',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lawyerFeeAmount: lawyerFeeBase,
    lawyerFeeIva: lawyerFeeIva,
    lawyerFeeTotal: lawyerFeeTotal,
    lawyerFeeInvoiceNumber: lawyerFeeInvoiceNum
  };

  db.courtLawsuits.unshift(lawsuit);

  // Send judicial & financial notifications
  addNotification(
    db,
    plaintiff.id,
    '⚖️ Demanda presentada y minuta abonada',
    `Has presentado la demanda con Autos nº ${caseNumber}. Se ha cargado en tu cuenta la minuta del abogado por importe de ${formatNumber(lawyerFeeTotal)} € (${formatNumber(lawyerFeeBase)} € + ${formatNumber(lawyerFeeIva)} € IVA - Fra: ${lawyerFeeInvoiceNum}). El procedimiento queda pendiente de Auto de admisión a trámite por el Juez.`,
    'transfer_received',
    feeTxId
  );

  // Notify the teacher/judge (pupdaniel) for admission review
  const judgeUser = db.users.find(u => u.username?.toLowerCase() === 'pupdaniel' || u.role === 'teacher' || u.id === 'pupdaniel');
  if (judgeUser && judgeUser.id !== plaintiff.id && judgeUser.id !== defendant.id) {
    addNotification(
      db,
      judgeUser.id,
      '⚖️ Nueva demanda pendiente de admisión a trámite',
      `El actor ${plaintiff.name} ha interpuesto la ${type === 'cambiaria' ? 'Demanda cambiaria' : 'Demanda ordinaria'} (${caseNumber}) contra ${defendant.name} por ${formatNumber(numAmount)} €. Pendiente de dictar Auto de admisión a trámite o Inadmisión.`,
      'transfer_received',
      lawsuit.id
    );
  }

  writeDb(db);

  // Sync to Supabase
  syncAccountToSupabase(plaintiff.id, plaintiff.name, plaintiff.balance, plaintiff.username, plaintiff.password, plaintiff.accountNumber, plaintiff.role, plaintiff.level).catch(e => console.error(e));
  syncMovimientoToSupabase(feeTxId + '-out', plaintiff.id, 'TRANSFER_OUT', lawyerFeeTotal, now.toISOString(), feeConcept, lawyerTransfer).catch(e => console.error(e));
  syncCourtLawsuitToSupabase(lawsuit).catch(e => console.error(e));

  res.json({
    success: true,
    message: `Demanda ${caseNumber} presentada con éxito. Minuta de abogado (${formatNumber(lawyerFeeTotal)} € con IVA) abonada. Pendiente de admisión a trámite por el Magistrado-Juez.`,
    lawsuit,
    newBalance: plaintiff.balance,
    lawyerFee: {
      amount: lawyerFeeBase,
      iva: lawyerFeeIva,
      total: lawyerFeeTotal,
      invoiceNumber: lawyerFeeInvoiceNum
    }
  });
});

// Teacher / Judge: Auto de admisión a trámite o Inadmisión de Demanda
app.post('/api/court/lawsuits/:id/judge-admission', (req, res) => {
  const { id } = req.params;
  const { admission, notes, judgeId } = req.body;

  if (!admission || (admission !== 'admitir' && admission !== 'rechazar')) {
    return res.status(400).json({ error: 'admission debe ser "admitir" o "rechazar"' });
  }

  const db = readDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];

  const lawsuit = db.courtLawsuits.find(l => l.id === id);
  if (!lawsuit) {
    return res.status(404).json({ error: 'Procedimiento judicial no encontrado' });
  }

  const plaintiff = db.users.find(u => u.id === lawsuit.plaintiffId);
  const defendant = db.users.find(u => u.id === lawsuit.defendantId);

  const now = new Date();

  if (admission === 'admitir') {
    lawsuit.status = 'admitida';
    lawsuit.admissionDate = now.toISOString();
    lawsuit.defendantDeadlineDate = addBusinessDays(now, 20).toISOString();
    lawsuit.admissionNotes = notes || 'Auto de admisión a trámite dictado por el Magistrado-Juez del Juzgado de 1ª Instancia al concurrir los presupuestos procesales y aportación de principios de prueba (LEC). Plazo legal de 20 días hábiles conferido para contestación.';
    lawsuit.updatedAt = now.toISOString();

    if (plaintiff) {
      addNotification(
        db,
        plaintiff.id,
        '⚖️ Auto de admisión a trámite',
        `El Magistrado-Juez ha dictado Auto admitiendo a trámite tu demanda en los Autos ${lawsuit.caseNumber}. Se ha conferido traslado y emplazado al demandado ${defendant?.name || 'demandado'} (Plazo: 20 días hábiles).`,
        'transfer_received',
        lawsuit.id
      );
    }

    if (defendant) {
      addNotification(
        db,
        defendant.id,
        '⚖️ Emplazamiento de demanda judicial',
        `Se ha admitido a trámite la ${lawsuit.type === 'cambiaria' ? 'Demanda de juicio cambiario' : 'Demanda ordinaria'} (${lawsuit.caseNumber}) promovida por ${lawsuit.plaintiffName} por ${formatNumber(lawsuit.claimedAmount)} € (+costas). Dispones de 20 días hábiles para contestar a la demanda o personarte en los autos.`,
        'transfer_received',
        lawsuit.id
      );
    }
  } else {
    lawsuit.status = 'inadmitida';
    lawsuit.resolutionDate = now.toISOString();
    lawsuit.resolutionNotes = notes || 'Auto de Inadmisión dictado por el Magistrado-Juez del Juzgado de 1ª Instancia por falta de acreditación documental o defecto procesal insubsanable.';
    lawsuit.updatedAt = now.toISOString();

    if (plaintiff) {
      addNotification(
        db,
        plaintiff.id,
        '⚖️ Auto de inadmisión de demanda',
        `El Magistrado-Juez ha rechazado la admisión a trámite de la demanda ${lawsuit.caseNumber}. Motivo: ${lawsuit.resolutionNotes}.`,
        'transfer_received',
        lawsuit.id
      );
    }
  }

  writeDb(db);
  syncCourtLawsuitToSupabase(lawsuit).catch(e => console.error(e));

  res.json({
    success: true,
    message: admission === 'admitir' 
      ? `Auto de admisión a trámite dictado con éxito en los Autos ${lawsuit.caseNumber}. Demandado emplazado.`
      : `Auto de Inadmisión dictado en los Autos ${lawsuit.caseNumber}. Procedimiento archivado.`,
    lawsuit
  });
});

// Teacher / Judge: Embargo Preventivo Cautelar (Juicio Cambiario - Art. 821 LEC)
app.post('/api/court/lawsuits/:id/preventative-embargo', (req, res) => {
  const { id } = req.params;
  const { notes, judgeId } = req.body;

  const db = readDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];

  const lawsuit = db.courtLawsuits.find(l => l.id === id);
  if (!lawsuit) {
    return res.status(404).json({ error: 'Procedimiento judicial no encontrado' });
  }

  if (lawsuit.type !== 'cambiaria') {
    return res.status(400).json({ error: 'El embargo preventivo cautelar inmediato del Art. 821 LEC solo procede en Juicios Cambiarios.' });
  }

  if (lawsuit.status === 'ejecutada' || lawsuit.status === 'allanada_pagada' || lawsuit.status === 'desestimada' || lawsuit.status === 'inadmitida') {
    return res.status(400).json({ error: 'El procedimiento ya está resuelto o archivado.' });
  }

  const defendant = db.users.find(u => u.id === lawsuit.defendantId);
  const plaintiff = db.users.find(u => u.id === lawsuit.plaintiffId);

  if (!defendant || !plaintiff) {
    return res.status(404).json({ error: 'Partes procesales no encontradas' });
  }

  const now = new Date();
  const totalToEmbargo = lawsuit.totalClaimAmount || Number((lawsuit.claimedAmount * 1.30).toFixed(2));

  // Retain / Debit funds from defendant to Judicial Consignation Escrow Account
  defendant.balance = Number((defendant.balance - totalToEmbargo).toFixed(2));

  const embargoTxId = generateId('tx');
  const embargoConcept = `Traba de Embargo Preventivo Cautelar (Art. 821 LEC) - Autos Cambiarios ${lawsuit.caseNumber}`;

  const escrowTransfer: Transfer = {
    id: embargoTxId,
    senderId: defendant.id,
    senderName: defendant.name,
    senderAccount: defendant.accountNumber,
    receiverId: 'corp-deposito-judicial',
    receiverName: 'Cuenta General de Consignaciones y Depósitos Judiciales (Juzgado)',
    receiverAccount: 'ES990001009988776655',
    amount: totalToEmbargo,
    concept: embargoConcept,
    timestamp: now.toISOString()
  };

  if (!db.transfers) db.transfers = [];
  db.transfers.unshift(escrowTransfer);

  lawsuit.status = 'embargo_preventivo';
  lawsuit.embargoDate = now.toISOString();
  lawsuit.embargoAmount = totalToEmbargo;
  lawsuit.embargoTransferId = embargoTxId;
  lawsuit.embargoNotes = notes || `Auto Judicial de Embargo Preventivo Cautelar decretado y trabado sobre las cuentas y saldos bancarios del demandado (${defendant.name}) por importe de ${formatNumber(totalToEmbargo)} € (Principal + Intereses de demora procesal y costas) conforme al Art. 821 de la LEC.`;
  lawsuit.updatedAt = now.toISOString();

  addNotification(
    db,
    defendant.id,
    '⚖️ Auto de embargo preventivo cautelar',
    `El Magistrado-Juez ha decretado el embargo preventivo inmediato de ${formatNumber(totalToEmbargo)} € en tus cuentas bancarias en los Autos Cambiarios ${lawsuit.caseNumber} (Art. 821 LEC).`,
    'transfer_received',
    embargoTxId
  );

  addNotification(
    db,
    plaintiff.id,
    '⚖️ Embargo preventivo trabado con éxito',
    `Se ha ejecutado la traba de embargo preventivo cautelar por ${formatNumber(totalToEmbargo)} € sobre los saldos del demandado ${defendant.name} en el Juicio Cambiario ${lawsuit.caseNumber} (Art. 821 LEC).`,
    'transfer_received',
    embargoTxId
  );

  writeDb(db);

  syncAccountToSupabase(defendant.id, defendant.name, defendant.balance, defendant.username, defendant.password, defendant.accountNumber, defendant.role, defendant.level).catch(e => console.error(e));
  syncMovimientoToSupabase(embargoTxId + '-out', defendant.id, 'TRANSFER_OUT', totalToEmbargo, now.toISOString(), embargoConcept, escrowTransfer).catch(e => console.error(e));
  syncCourtLawsuitToSupabase(lawsuit).catch(e => console.error(e));

  res.json({
    success: true,
    message: `Embargo preventivo de ${formatNumber(totalToEmbargo)} € trabado sobre las cuentas de ${defendant.name} con éxito (Art. 821 LEC).`,
    lawsuit,
    transfer: escrowTransfer
  });
});

// Settle / Pay lawsuit voluntarily in court (Allanamiento procesal y consignación)
app.post('/api/court/lawsuits/:id/pay-settle', (req, res) => {
  const { id } = req.params;
  const { payerId } = req.body;

  if (!payerId) {
    return res.status(400).json({ error: 'payerId es requerido' });
  }

  const db = readDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];

  const lawsuit = db.courtLawsuits.find(l => l.id === id);
  if (!lawsuit) {
    return res.status(404).json({ error: 'Procedimiento judicial no encontrado.' });
  }

  if (lawsuit.defendantId !== payerId) {
    return res.status(403).json({ error: 'Solo la parte demandada puede allanarse y liquidar la deuda procesal.' });
  }

  if (lawsuit.status === 'allanada_pagada' || lawsuit.status === 'ejecutada') {
    return res.status(400).json({ error: 'Este procedimiento judicial ya ha sido satisfecho y cerrado previamente.' });
  }

  const defendant = db.users.find(u => u.id === lawsuit.defendantId);
  const plaintiff = db.users.find(u => u.id === lawsuit.plaintiffId);

  if (!defendant || !plaintiff) {
    return res.status(404).json({ error: 'Partes procesales no encontradas en el sistema.' });
  }

  const amountToPay = lawsuit.claimedAmount;
  if (defendant.balance < amountToPay) {
    return res.status(400).json({
      error: `Saldo bancario insuficiente (${formatCurrency(defendant.balance)} disponibles). Se requieren ${formatCurrency(amountToPay)} para consignar y liquidar la demanda judicial.`
    });
  }

  // Execute bank transfer
  defendant.balance = Number((defendant.balance - amountToPay).toFixed(2));
  plaintiff.balance = Number((plaintiff.balance + amountToPay).toFixed(2));

  const now = new Date();
  const txId = generateId('tx');
  const concept = `Consignación y Pago Judicial - Autos ${lawsuit.caseNumber}`;

  const newTransfer: Transfer = {
    id: txId,
    senderId: defendant.id,
    senderName: defendant.name,
    senderAccount: defendant.accountNumber,
    receiverId: plaintiff.id,
    receiverName: plaintiff.name,
    receiverAccount: plaintiff.accountNumber,
    amount: amountToPay,
    concept,
    timestamp: now.toISOString()
  };

  if (!db.transfers) db.transfers = [];
  db.transfers.unshift(newTransfer);

  lawsuit.status = 'allanada_pagada';
  lawsuit.updatedAt = now.toISOString();
  lawsuit.resolutionDate = now.toISOString();
  lawsuit.resolutionNotes = `Allanamiento procesal íntegro del demandado (${defendant.name}) mediante consignación y abono bancario de ${formatNumber(amountToPay)} € en autos.`;
  lawsuit.executionTransferId = txId;

  // If tied to promissory note, update promissory note status too
  if (lawsuit.promissoryNoteNumber && db.marketMessages) {
    db.marketMessages.forEach(m => {
      if (m.type === 'promissory_note' && m.promissoryNoteData?.promissoryNoteNumber === lawsuit.promissoryNoteNumber) {
        m.promissoryNoteData.status = 'pagado';
        m.promissoryNoteData.paidAt = now.toISOString();
        m.promissoryNoteData.paidTransferId = txId;
      }
    });
  }

  addNotification(
    db,
    plaintiff.id,
    '⚖️ Cobro de demanda judicial',
    `El demandado ${defendant.name} ha satisfecho íntegramente la deuda de ${formatNumber(amountToPay)} € en los Autos ${lawsuit.caseNumber}. Saldo abonado en tu cuenta.`,
    'transfer_received',
    txId
  );

  addNotification(
    db,
    defendant.id,
    '⚖️ Demanda judicial liquidada',
    `Has satisfecho la cantidad de ${formatNumber(amountToPay)} € en los Autos ${lawsuit.caseNumber}. El procedimiento ha quedado archivado por allanamiento.`,
    'transfer_received',
    txId
  );

  writeDb(db);
  syncAccountToSupabase(defendant.id, defendant.name, defendant.balance, defendant.username, defendant.password, defendant.accountNumber, defendant.role, defendant.level).catch(e => console.error(e));
  syncAccountToSupabase(plaintiff.id, plaintiff.name, plaintiff.balance, plaintiff.username, plaintiff.password, plaintiff.accountNumber, plaintiff.role, plaintiff.level).catch(e => console.error(e));
  syncMovimientoToSupabase(txId + '-out', defendant.id, 'TRANSFER_OUT', amountToPay, now.toISOString(), concept, newTransfer).catch(e => console.error(e));
  syncMovimientoToSupabase(txId + '-in', plaintiff.id, 'TRANSFER_IN', amountToPay, now.toISOString(), concept, newTransfer).catch(e => console.error(e));
  syncCourtLawsuitToSupabase(lawsuit).catch(e => console.error(e));

  res.json({
    success: true,
    message: `Deuda judicial satisfecha con éxito por ${formatNumber(amountToPay)} €. Autos archivados por allanamiento.`,
    lawsuit,
    transfer: newTransfer,
    newBalance: defendant.balance
  });
});

// Defendant response / contestación a la demanda (LEC)
app.post('/api/court/lawsuits/:id/defendant-answer', (req, res) => {
  const { id } = req.params;
  const { defendantId, answerType, facts, attachments } = req.body;

  if (!defendantId) {
    return res.status(400).json({ error: 'defendantId es requerido' });
  }

  if (!answerType || (answerType !== 'ordinaria_contestacion' && answerType !== 'cambiaria_ya_pagado' && answerType !== 'cambiaria_paga_ahora')) {
    return res.status(400).json({ error: 'Tipo de contestación no válido.' });
  }

  const db = readDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];

  const lawsuit = db.courtLawsuits.find(l => l.id === id);
  if (!lawsuit) {
    return res.status(404).json({ error: 'Procedimiento judicial no encontrado.' });
  }

  if (lawsuit.defendantId !== defendantId) {
    return res.status(403).json({ error: 'Solo la parte demandada de estos autos puede formular contestación o alegaciones.' });
  }

  if (lawsuit.status !== 'admitida' && lawsuit.status !== 'embargo_preventivo') {
    return res.status(400).json({ error: 'El procedimiento debe estar admitido a trámite para contestar a la demanda.' });
  }

  if (lawsuit.defendantAnswered) {
    return res.status(400).json({ error: 'Ya se ha formulado contestación o alegaciones en este procedimiento judicial.' });
  }

  // Type-specific validation
  if (lawsuit.type === 'ordinaria' && answerType !== 'ordinaria_contestacion') {
    return res.status(400).json({ error: 'En demanda ordinaria, debe presentarse el escrito de contestación a la demanda.' });
  }

  if (lawsuit.type === 'cambiaria' && answerType !== 'cambiaria_ya_pagado' && answerType !== 'cambiaria_paga_ahora') {
    return res.status(400).json({ error: 'En demanda cambiaria, el demandado solo puede alegar: que ya ha pagado o que no ha pagado pero que lo hace en ese momento.' });
  }

  const defendant = db.users.find(u => u.id === lawsuit.defendantId);
  const plaintiff = db.users.find(u => u.id === lawsuit.plaintiffId);

  if (!defendant || !plaintiff) {
    return res.status(404).json({ error: 'Partes procesales no encontradas.' });
  }

  // Validate attachments: strictly PDF files only
  const validAttachments: CourtAttachment[] = [];
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      const isPdf = (att.name && att.name.toLowerCase().endsWith('.pdf')) || (att.dataUrl && att.dataUrl.startsWith('data:application/pdf'));
      if (!isPdf) {
        return res.status(400).json({ error: 'Solo se admiten documentos adjuntos en formato PDF (.pdf).' });
      }
      validAttachments.push(att);
    }
  }

  const now = new Date();

  // Case 1: ordinaria_contestacion OR cambiaria_ya_pagado (Requires Lawyer fee charge: 15% of claimed amount + 21% IVA)
  if (answerType === 'ordinaria_contestacion' || answerType === 'cambiaria_ya_pagado') {
    const lawyerFeeBase = Number((lawsuit.claimedAmount * 0.15).toFixed(2));
    const lawyerFeeIva = Number((lawyerFeeBase * 0.21).toFixed(2));
    const lawyerFeeTotal = Number((lawyerFeeBase + lawyerFeeIva).toFixed(2));
    const invNum = `FRA-ABOG-DEF-${lawsuit.caseNumber.replace(/[^0-9]/g, '').slice(0, 8)}`;

    if (defendant.balance < lawyerFeeTotal) {
      return res.status(400).json({
        error: `Saldo insuficiente en tu cuenta bancaria (${formatCurrency(defendant.balance)} disponibles) para abonar la minuta del letrado de la defensa (${formatCurrency(lawyerFeeTotal)} con IVA 21%).`
      });
    }

    // Deduct lawyer fee from defendant
    defendant.balance = Number((defendant.balance - lawyerFeeTotal).toFixed(2));

    const feeTxId = generateId('tx');
    const feeConcept = answerType === 'ordinaria_contestacion'
      ? `Minuta Letrado Defensa (15% s/ ${formatNumber(lawsuit.claimedAmount)} €) + IVA 21% - Contestación Demanda ordinaria ${lawsuit.caseNumber} [Factura ${invNum}]`
      : `Minuta Letrado Oposición Cambiaria (15% s/ ${formatNumber(lawsuit.claimedAmount)} €) + IVA 21% - Oposición Juicio Cambiario ${lawsuit.caseNumber} [Factura ${invNum}]`;

    const lawyerTransfer: Transfer = {
      id: feeTxId,
      senderId: defendant.id,
      senderName: defendant.name,
      senderAccount: defendant.accountNumber,
      receiverId: 'corp-despacho-abogados',
      receiverName: 'Despacho Jurídico & Letrados Procesales S.L.P.',
      receiverAccount: 'ES980001004455667788',
      amount: lawyerFeeTotal,
      concept: feeConcept,
      timestamp: now.toISOString()
    };

    if (!db.transfers) db.transfers = [];
    db.transfers.unshift(lawyerTransfer);

    lawsuit.defendantAnswered = true;
    lawsuit.defendantAnswerDate = now.toISOString();
    lawsuit.defendantAnswerType = answerType;
    lawsuit.defendantAnswerFacts = facts || (answerType === 'ordinaria_contestacion' ? 'Contestación a la demanda presentada por la representación procesal de la parte demandada.' : 'Oposición al juicio cambiario: El demandado alega que ya ha satisfecho el pagaré reclamado.');
    lawsuit.defendantAnswerAttachments = validAttachments;
    lawsuit.defendantLawyerFeeAmount = lawyerFeeBase;
    lawsuit.defendantLawyerFeeIva = lawyerFeeIva;
    lawsuit.defendantLawyerFeeTotal = lawyerFeeTotal;
    lawsuit.defendantLawyerFeeInvoiceNumber = invNum;
    lawsuit.updatedAt = now.toISOString();

    addNotification(
      db,
      defendant.id,
      answerType === 'ordinaria_contestacion' ? '⚖️ Contestación a la demanda presentada' : '⚖️ Oposición cambiaria presentada',
      `Has presentado la contestación en los Autos ${lawsuit.caseNumber}. Se ha cargado en tu cuenta la minuta del abogado por importe de ${formatNumber(lawyerFeeTotal)} € (${formatNumber(lawyerFeeBase)} € + ${formatNumber(lawyerFeeIva)} € IVA - Fra: ${invNum}).`,
      'transfer_received',
      feeTxId
    );

    addNotification(
      db,
      plaintiff.id,
      '⚖️ Traslado de contestación de demanda',
      `El demandado ${defendant.name} ha formalizado su contestación en los Autos ${lawsuit.caseNumber} con alegaciones y ${validAttachments.length} documento(s) PDF.`,
      'transfer_received',
      lawsuit.id
    );

    const judgeUser = db.users.find(u => u.username?.toLowerCase() === 'pupdaniel' || u.role === 'teacher' || u.id === 'pupdaniel');
    if (judgeUser && judgeUser.id !== plaintiff.id && judgeUser.id !== defendant.id) {
      addNotification(
        db,
        judgeUser.id,
        '⚖️ Contestación a la Demanda en Autos',
        `El demandado ${defendant.name} ha formulado contestación en los Autos ${lawsuit.caseNumber}. Procedimiento listo para dictar Resolución / Sentencia.`,
        'transfer_received',
        lawsuit.id
      );
    }

    writeDb(db);
    syncAccountToSupabase(defendant.id, defendant.name, defendant.balance, defendant.username, defendant.password, defendant.accountNumber, defendant.role, defendant.level).catch(e => console.error(e));
    syncMovimientoToSupabase(feeTxId + '-out', defendant.id, 'TRANSFER_OUT', lawyerFeeTotal, now.toISOString(), feeConcept, lawyerTransfer).catch(e => console.error(e));
    syncCourtLawsuitToSupabase(lawsuit).catch(e => console.error(e));

    return res.json({
      success: true,
      message: `Contestación formalizada con éxito en los Autos ${lawsuit.caseNumber}. Minuta de abogado (${formatNumber(lawyerFeeTotal)} €) abonada.`,
      lawsuit,
      newBalance: defendant.balance,
      lawyerFee: {
        amount: lawyerFeeBase,
        iva: lawyerFeeIva,
        total: lawyerFeeTotal,
        invoiceNumber: invNum
      }
    });
  }

  // Case 2: cambiaria_paga_ahora (Defendant pays the full promissory note amount immediately)
  if (answerType === 'cambiaria_paga_ahora') {
    const amountToPay = lawsuit.claimedAmount;
    const payTxId = generateId('tx');
    const payConcept = `Abono y Liquidación Inmediata de Pagaré Reclamado - Autos Cambiarios ${lawsuit.caseNumber}`;
    let paymentTransfer: Transfer;

    // If preventatively embargoed, transfer from judicial escrow
    if (lawsuit.embargoTransferId && lawsuit.embargoAmount) {
      plaintiff.balance = Number((plaintiff.balance + amountToPay).toFixed(2));
      // Refund any excess interest escrow to defendant
      const excess = Number((lawsuit.embargoAmount - amountToPay).toFixed(2));
      if (excess > 0) {
        defendant.balance = Number((defendant.balance + excess).toFixed(2));
      }

      paymentTransfer = {
        id: payTxId,
        senderId: 'corp-deposito-judicial',
        senderName: 'Cuenta General de Depósitos Judiciales (Juzgado)',
        senderAccount: 'ES990001009988776655',
        receiverId: plaintiff.id,
        receiverName: plaintiff.name,
        receiverAccount: plaintiff.accountNumber,
        amount: amountToPay,
        concept: payConcept,
        timestamp: now.toISOString()
      };
      if (!db.transfers) db.transfers = [];
      db.transfers.unshift(paymentTransfer);
      syncMovimientoToSupabase(payTxId + '-in', plaintiff.id, 'TRANSFER_IN', amountToPay, now.toISOString(), payConcept, paymentTransfer).catch(e => console.error(e));
    } else {
      if (defendant.balance < amountToPay) {
        return res.status(400).json({
          error: `Saldo insuficiente en tu cuenta bancaria (${formatCurrency(defendant.balance)} disponibles) para abonar el importe del pagaré (${formatCurrency(amountToPay)}).`
        });
      }

      defendant.balance = Number((defendant.balance - amountToPay).toFixed(2));
      plaintiff.balance = Number((plaintiff.balance + amountToPay).toFixed(2));

      paymentTransfer = {
        id: payTxId,
        senderId: defendant.id,
        senderName: defendant.name,
        senderAccount: defendant.accountNumber,
        receiverId: plaintiff.id,
        receiverName: plaintiff.name,
        receiverAccount: plaintiff.accountNumber,
        amount: amountToPay,
        concept: payConcept,
        timestamp: now.toISOString()
      };
      if (!db.transfers) db.transfers = [];
      db.transfers.unshift(paymentTransfer);
      syncMovimientoToSupabase(payTxId + '-out', defendant.id, 'TRANSFER_OUT', amountToPay, now.toISOString(), payConcept, paymentTransfer).catch(e => console.error(e));
      syncMovimientoToSupabase(payTxId + '-in', plaintiff.id, 'TRANSFER_IN', amountToPay, now.toISOString(), payConcept, paymentTransfer).catch(e => console.error(e));
    }

    lawsuit.defendantAnswered = true;
    lawsuit.defendantAnswerDate = now.toISOString();
    lawsuit.defendantAnswerType = 'cambiaria_paga_ahora';
    lawsuit.defendantAnswerFacts = facts || 'El demandado comparece manifestando que no había pagado el pagaré y procediendo en este acto a su abono voluntario e íntegro en autos.';
    lawsuit.defendantAnswerAttachments = validAttachments;
    lawsuit.status = 'allanada_pagada';
    lawsuit.resolutionDate = now.toISOString();
    lawsuit.resolutionNotes = `Allanamiento y pago voluntario del demandado (${defendant.name}) abonando ${formatNumber(amountToPay)} € en autos.`;
    lawsuit.executionTransferId = payTxId;
    lawsuit.updatedAt = now.toISOString();

    if (lawsuit.promissoryNoteNumber && db.marketMessages) {
      db.marketMessages.forEach(m => {
        if (m.type === 'promissory_note' && m.promissoryNoteData?.promissoryNoteNumber === lawsuit.promissoryNoteNumber) {
          m.promissoryNoteData.status = 'pagado';
          m.promissoryNoteData.paidAt = now.toISOString();
          m.promissoryNoteData.paidTransferId = payTxId;
        }
      });
    }

    addNotification(
      db,
      plaintiff.id,
      '⚖️ Pago judicial de pagaré recibido',
      `El demandado ${defendant.name} ha comparecido abonando íntegramente los ${formatNumber(amountToPay)} € del pagaré en los Autos ${lawsuit.caseNumber}. Saldo ingresado en tu cuenta.`,
      'transfer_received',
      payTxId
    );

    addNotification(
      db,
      defendant.id,
      '⚖️ Pagaré judicial abonado y autos archivados',
      `Has abonado ${formatNumber(amountToPay)} € en los Autos Cambiarios ${lawsuit.caseNumber}. Procedimiento archivado por allanamiento y pago.`,
      'transfer_received',
      payTxId
    );

    writeDb(db);
    syncAccountToSupabase(defendant.id, defendant.name, defendant.balance, defendant.username, defendant.password, defendant.accountNumber, defendant.role, defendant.level).catch(e => console.error(e));
    syncAccountToSupabase(plaintiff.id, plaintiff.name, plaintiff.balance, plaintiff.username, plaintiff.password, plaintiff.accountNumber, plaintiff.role, plaintiff.level).catch(e => console.error(e));
    syncCourtLawsuitToSupabase(lawsuit).catch(e => console.error(e));

    return res.json({
      success: true,
      message: `Pagaré abonado con éxito en los Autos ${lawsuit.caseNumber}. Procedimiento archivado por allanamiento.`,
      lawsuit,
      transfer: paymentTransfer,
      newBalance: defendant.balance
    });
  }
});

// Judge / Teacher ruling (Sentencia judicial o decreto de ejecución forzosa)
app.post('/api/court/lawsuits/:id/judge-ruling', (req, res) => {
  const { id } = req.params;
  const { ruling, comments, judgeId } = req.body;

  if (!ruling || (ruling !== 'estimatoria' && ruling !== 'desestimatoria')) {
    return res.status(400).json({ error: 'ruling debe ser "estimatoria" o "desestimatoria"' });
  }

  const db = readDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];

  const lawsuit = db.courtLawsuits.find(l => l.id === id);
  if (!lawsuit) {
    return res.status(404).json({ error: 'Procedimiento judicial no encontrado' });
  }

  const now = new Date();
  const defendant = db.users.find(u => u.id === lawsuit.defendantId);
  const plaintiff = db.users.find(u => u.id === lawsuit.plaintiffId);

  if (!defendant || !plaintiff) {
    return res.status(404).json({ error: 'Partes procesales no encontradas' });
  }

  if (ruling === 'estimatoria') {
    const totalToDebit = lawsuit.totalClaimAmount || lawsuit.claimedAmount;
    let txId = generateId('tx');
    let concept = `Ejecución Judicial Forzosa - Sentencia Estimatoria Autos ${lawsuit.caseNumber}`;
    let newTransfer: Transfer;

    // Check if embargo was previously executed
    if (lawsuit.embargoTransferId && lawsuit.embargoAmount) {
      // Funds are already in Escrow account; transfer from Escrow to plaintiff
      const embargoAmt = lawsuit.embargoAmount;
      plaintiff.balance = Number((plaintiff.balance + embargoAmt).toFixed(2));
      concept = `Entrega de Fondos Embargados - Sentencia Estimatoria Firme Autos ${lawsuit.caseNumber}`;
      newTransfer = {
        id: txId,
        senderId: 'corp-deposito-judicial',
        senderName: 'Cuenta General de Consignaciones Judiciales (Juzgado)',
        senderAccount: 'ES990001009988776655',
        receiverId: plaintiff.id,
        receiverName: plaintiff.name,
        receiverAccount: plaintiff.accountNumber,
        amount: embargoAmt,
        concept,
        timestamp: now.toISOString()
      };
      if (!db.transfers) db.transfers = [];
      db.transfers.unshift(newTransfer);
      syncMovimientoToSupabase(txId + '-in', plaintiff.id, 'TRANSFER_IN', embargoAmt, now.toISOString(), concept, newTransfer).catch(e => console.error(e));
    } else {
      // Direct execution: debit defendant, credit plaintiff
      defendant.balance = Number((defendant.balance - totalToDebit).toFixed(2));
      plaintiff.balance = Number((plaintiff.balance + totalToDebit).toFixed(2));

      newTransfer = {
        id: txId,
        senderId: defendant.id,
        senderName: defendant.name,
        senderAccount: defendant.accountNumber,
        receiverId: plaintiff.id,
        receiverName: plaintiff.name,
        receiverAccount: plaintiff.accountNumber,
        amount: totalToDebit,
        concept,
        timestamp: now.toISOString()
      };

      if (!db.transfers) db.transfers = [];
      db.transfers.unshift(newTransfer);

      syncAccountToSupabase(defendant.id, defendant.name, defendant.balance, defendant.username, defendant.password, defendant.accountNumber, defendant.role, defendant.level).catch(e => console.error(e));
      syncMovimientoToSupabase(txId + '-out', defendant.id, 'TRANSFER_OUT', totalToDebit, now.toISOString(), concept, newTransfer).catch(e => console.error(e));
      syncMovimientoToSupabase(txId + '-in', plaintiff.id, 'TRANSFER_IN', totalToDebit, now.toISOString(), concept, newTransfer).catch(e => console.error(e));
    }

    syncAccountToSupabase(plaintiff.id, plaintiff.name, plaintiff.balance, plaintiff.username, plaintiff.password, plaintiff.accountNumber, plaintiff.role, plaintiff.level).catch(e => console.error(e));

    lawsuit.status = 'ejecutada';
    lawsuit.updatedAt = now.toISOString();
    lawsuit.resolutionDate = now.toISOString();
    lawsuit.resolutionNotes = `Sentencia estimatoria firme dictada por el Magistrado-Juez del Juzgado de 1ª Instancia con ejecución forzosa por ${formatNumber(totalToDebit)} € (Principal + Intereses y Costas).`;
    lawsuit.judgeComments = comments || 'Estimada íntegramente la demanda con imposición de costas procesales.';
    lawsuit.executionTransferId = txId;

    if (lawsuit.promissoryNoteNumber && db.marketMessages) {
      db.marketMessages.forEach(m => {
        if (m.type === 'promissory_note' && m.promissoryNoteData?.promissoryNoteNumber === lawsuit.promissoryNoteNumber) {
          m.promissoryNoteData.status = 'pagado';
          m.promissoryNoteData.paidAt = now.toISOString();
          m.promissoryNoteData.paidTransferId = txId;
        }
      });
    }

    addNotification(
      db,
      plaintiff.id,
      '⚖️ Sentencia judicial estimatoria',
      `El Magistrado-Juez ha dictado sentencia estimatoria en los Autos ${lawsuit.caseNumber}. Se han transferido ${formatNumber(totalToDebit)} € a tu cuenta.`,
      'transfer_received',
      txId
    );

    addNotification(
      db,
      defendant.id,
      '⚖️ Notificación de sentencia y ejecución',
      `El Magistrado-Juez ha dictado sentencia y ejecutado el cargo en los Autos ${lawsuit.caseNumber} por ${formatNumber(totalToDebit)} €.`,
      'transfer_received',
      txId
    );
  } else {
    // Desestimatoria: el demandante debe pagar al demandado las costas procesales (minuta 15% + IVA)
    const costsBase = Number((lawsuit.claimedAmount * 0.15).toFixed(2));
    const costsIva = Number((costsBase * 0.21).toFixed(2));
    const costsTotal = lawsuit.defendantLawyerFeeTotal || Number((costsBase + costsIva).toFixed(2));

    // Plaintiff pays costs to Defendant
    plaintiff.balance = Number((plaintiff.balance - costsTotal).toFixed(2));
    defendant.balance = Number((defendant.balance + costsTotal).toFixed(2));

    const costsTxId = generateId('tx');
    const costsConcept = `Condena en Costas Procesales (Minuta Letrado 15% + IVA) - Sentencia Desestimatoria Autos ${lawsuit.caseNumber}`;

    const costsTransfer: Transfer = {
      id: costsTxId,
      senderId: plaintiff.id,
      senderName: plaintiff.name,
      senderAccount: plaintiff.accountNumber,
      receiverId: defendant.id,
      receiverName: defendant.name,
      receiverAccount: defendant.accountNumber,
      amount: costsTotal,
      concept: costsConcept,
      timestamp: now.toISOString()
    };

    if (!db.transfers) db.transfers = [];
    db.transfers.unshift(costsTransfer);

    syncAccountToSupabase(plaintiff.id, plaintiff.name, plaintiff.balance, plaintiff.username, plaintiff.password, plaintiff.accountNumber, plaintiff.role, plaintiff.level).catch(e => console.error(e));
    syncAccountToSupabase(defendant.id, defendant.name, defendant.balance, defendant.username, defendant.password, defendant.accountNumber, defendant.role, defendant.level).catch(e => console.error(e));
    syncMovimientoToSupabase(costsTxId + '-out', plaintiff.id, 'TRANSFER_OUT', costsTotal, now.toISOString(), costsConcept, costsTransfer).catch(e => console.error(e));
    syncMovimientoToSupabase(costsTxId + '-in', defendant.id, 'TRANSFER_IN', costsTotal, now.toISOString(), costsConcept, costsTransfer).catch(e => console.error(e));

    // If funds were previously embargoed, return them from Escrow to defendant
    if (lawsuit.embargoTransferId && lawsuit.embargoAmount) {
      const refundAmt = lawsuit.embargoAmount;
      defendant.balance = Number((defendant.balance + refundAmt).toFixed(2));
      const refundTxId = generateId('tx');
      const refundConcept = `Levantamiento y Devolución de Embargo Preventivo - Sentencia Desestimatoria Autos ${lawsuit.caseNumber}`;

      const refundTransfer: Transfer = {
        id: refundTxId,
        senderId: 'corp-deposito-judicial',
        senderName: 'Cuenta General de Consignaciones Judiciales (Juzgado)',
        senderAccount: 'ES990001009988776655',
        receiverId: defendant.id,
        receiverName: defendant.name,
        receiverAccount: defendant.accountNumber,
        amount: refundAmt,
        concept: refundConcept,
        timestamp: now.toISOString()
      };

      db.transfers.unshift(refundTransfer);

      syncAccountToSupabase(defendant.id, defendant.name, defendant.balance, defendant.username, defendant.password, defendant.accountNumber, defendant.role, defendant.level).catch(e => console.error(e));
      syncMovimientoToSupabase(refundTxId + '-in', defendant.id, 'TRANSFER_IN', refundAmt, now.toISOString(), refundConcept, refundTransfer).catch(e => console.error(e));
    }

    lawsuit.status = 'desestimada';
    lawsuit.updatedAt = now.toISOString();
    lawsuit.resolutionDate = now.toISOString();
    lawsuit.costsPaid = costsTotal;
    lawsuit.costsTransferId = costsTxId;
    lawsuit.resolutionNotes = `Sentencia desestimatoria dictada por el Magistrado-Juez del Juzgado de 1ª Instancia con expresa imposición de costas al demandante por ${formatNumber(costsTotal)} € (minuta letrada del 15% + IVA).`;
    lawsuit.judgeComments = comments || 'Desestimada íntegramente la demanda con expresa condena en costas a la parte actora.';
    lawsuit.executionTransferId = costsTxId;

    addNotification(
      db,
      plaintiff.id,
      '⚖️ Sentencia desestimatoria - condena en costas',
      `El Magistrado-Juez ha desestimado tu demanda en los Autos ${lawsuit.caseNumber} con expresa condena en costas. Se han transferido ${formatNumber(costsTotal)} € de tu cuenta a favor de ${defendant.name} en concepto de costas procesales.`,
      'transfer_received',
      costsTxId
    );

    addNotification(
      db,
      defendant.id,
      '⚖️ Demanda desestimada - abono de costas',
      `La demanda deducida contra tu empresa en los Autos ${lawsuit.caseNumber} ha sido desestimada con condena en costas al actor. Se han abonado ${formatNumber(costsTotal)} € en tu cuenta bancaria en concepto de costas procesales (minuta letrada 15% + IVA). ${lawsuit.embargoAmount ? 'Asimismo, se han devuelto los fondos embargados cautelarmente a tu cuenta.' : ''}`,
      'transfer_received',
      costsTxId
    );
  }

  writeDb(db);
  syncCourtLawsuitToSupabase(lawsuit).catch(e => console.error(e));

  res.json({
    success: true,
    message: `Resolución judicial dictada con éxito en los Autos ${lawsuit.caseNumber}.`,
    lawsuit
  });
});

// API 404 handler - ensure any unmatched /api request returns JSON, not HTML
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta API no encontrada: ${req.originalUrl}` });
});

// Global API error handler - ensure any server exception in /api returns JSON, not HTML
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]', err);
  if (req.originalUrl.startsWith('/api')) {
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
  next(err);
});

// ---------------- VITE MIDDLEWARE / FRONTEND SERVING ----------------

async function startServer() {
  // Create Supabase tables "cuentas" and "movimientos" if they do not exist
  await initSupabaseTables();
  await restoreFromSupabase().catch(e => console.error('[Supabase Startup Restore Error]', e));

  // Serve static assets from public/ folder directly via Express
  const publicPath = path.join(process.cwd(), 'public');
  app.use('/images', express.static(path.join(publicPath, 'images')));
  app.use(express.static(publicPath));

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
