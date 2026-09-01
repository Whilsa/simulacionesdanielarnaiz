/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import { DatabaseSchema, User, Transfer, SystemLog, PropertyListing, PropertyAcquisition, PaymentObligation, PropertyType, OperationType, LocationScope, DeferredPaymentConfig, BankLoan, AmortizationRow, LoanStatus, UpcomingPaymentItem, MachineryItem, MachineryAcquisition, MachineryLineOption, JobListing, HiredEmployee, PayrollRecord, TaxObligation, ElectricityContract, ElectricityBill, NaveFloorPlan, ElectricityPropertyBreakdown, TelecomContract, TelecomInvoice, OfficePurchaseOrder, OfficePurchaseOrderItem, RelocationInvoice, PurchasedVehicle, RawMaterialAnnouncement, RawMaterialOrder, RawMaterialOrderItem, RawMaterialInventory, AppNotification, NegotiationHistoryEntry, MarketMessage, MarketInvoice, CompanyProfile, MarketContact, CourtLawsuit, CourtLawsuitType, CourtLawsuitSubtype, CourtAttachment, PromissoryNoteData, TradingPartner } from './src/types.js';
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
      parsed.password = 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢';
    }
    return parsed.toString();
  } catch (e) {
    return url.replace(/:([^:@]+)@/, ':â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢@');
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
  return `${formatNumber(val, 2)} â‚¬`;
}

// Realistic corporate real estate vendors & financial creditors
export const REALISTIC_CORPORATE_SELLERS = [
  { id: 'corp-1', name: 'Inmobiliaria PolÃ­gonos de EspaÃ±a S.A.', account: 'ES210001000299887711' },
  { id: 'corp-2', name: 'Patrimonio Empresarial e Industrial S.L.', account: 'ES210001000299887722' },
  { id: 'corp-3', name: 'Fondo de Arrendamientos Comerciales S.A.', account: 'ES210001000299887733' },
  { id: 'corp-4', name: 'CorporaciÃ³n LogÃ­stica Castellana S.L.', account: 'ES210001000299887744' },
  { id: 'corp-5', name: 'Promotora de Espacios Comerciales S.A.', account: 'ES210001000299887755' },
];

// Create tables "cuentas", "movimientos", "inmuebles", "adquisiciones", "obligaciones_pago", "ofertas_empleo", "empleados_contratados", "registros_nomina", "obligaciones_fiscales"
async function initSupabaseTables(): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!dbPool) {
    return { success: false, error: 'DATABASE_URL no estÃ¡ configurada' };
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
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS is_des_tornillo BOOLEAN DEFAULT FALSE;
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS price_alert JSONB;
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS seller_location TEXT;
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS seller_municipality TEXT;
      ALTER TABLE anuncios_materia_prima ADD COLUMN IF NOT EXISTS seller_province TEXT;

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
    return { success: true, message: 'Tablas de Supabase creadas o verificadas con Ã©xito.' };
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
        prop.ownerName || 'Inmobiliaria PolÃ­gonos de EspaÃ±a S.A.',
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
    const lineTitleVal = mac.lineTitle || mac.title || mac.optionTitle || 'LÃ­nea de maquinaria';
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
    const roleVal = job.role || (job.title && (job.title.toLowerCase().includes('mozo') || job.title.toLowerCase().includes('almacen') || job.title.toLowerCase().includes('almacÃ©n')) ? 'mozo_almacen' : job.title && job.title.toLowerCase().includes('camionero') ? 'camionero' : job.title && job.title.toLowerCase().includes('carretillero') ? 'carretillero' : 'operario');
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
        lawsuit.courtName || 'Juzgado de 1Âª Instancia e InstrucciÃ³n NÂº 1',
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
            name: 'Ana LÃ³pez',
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
            name: 'Beatriz GÃ³mez',
            accountNumber: 'ES910001000244556677',
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
        const seenLogicalKeys = new Set<string>();
        const uniqueTransfers: Transfer[] = [];
        for (const tr of restoredTransfers) {
          if (!seenTxIds.has(tr.id)) {
            seenTxIds.add(tr.id);
            const isPayroll = tr.concept && (tr.concept.includes('nÃ³mina') || tr.concept.includes('nomina') || tr.concept.includes('NÃ³mina'));
            const isNote = tr.concept && (tr.concept.includes('gestiÃ³n de cobro') || tr.concept.includes('gestion de cobro') || tr.concept.includes('descuento de pagarÃ©'));
            if (isPayroll || isNote) {
              const logicalKey = tr.senderId + '|' + tr.receiverId + '|' + tr.concept + '|' + tr.amount;
              if (seenLogicalKeys.has(logicalKey)) continue;
              seenLogicalKeys.add(logicalKey);
            }
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
          address: row.direccion || 'Calle Principal, NÂº 1',
          imageUrl: row.imagen_url || PROPERTY_IMAGES.local_comercial[0],
          status: row.estado as ('available' | 'sold' | 'rented'),
          ownerId: row.propietario_id || 'corp-1',
          ownerName: row.propietario_nombre || 'Inmobiliaria PolÃ­gonos de EspaÃ±a S.A.',
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

      // Reconstruct db.paymentObligations from Supabase "obligaciones_pago" (excluding promissory notes/pagarÃ©s which are manual student transfers)
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
          const roleVal = row.puesto || row.rol || (t.includes('mozo') || t.includes('almacen') || t.includes('almacÃ©n') ? 'mozo_almacen' : t.includes('camionero') ? 'camionero' : t.includes('carretillero') ? 'carretillero' : 'operario');
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

      // Reconstruct db.telecomInvoices from Supabase "facturas_telecom" with deduplication
      if (resTelInvoices.rows.length > 0) {
        const seenTelecomKey = new Set<string>();
        const mappedTelInvoices: TelecomInvoice[] = [];
        for (const row of resTelInvoices.rows) {
          const sId = String(row.alumno_id);
          const pM = Number(row.mes);
          const pY = Number(row.anio);
          const key = `${sId}_${pM}_${pY}`;
          if (seenTelecomKey.has(key)) continue;
          seenTelecomKey.add(key);
          mappedTelInvoices.push({
            id: String(row.id),
            invoiceNumber: String(row.numero_factura),
            studentId: sId,
            studentName: String(row.alumno_nombre),
            companyName: String(row.empresa_nombre || row.alumno_nombre),
            nifCif: String(row.nif_cif || ''),
            contractId: String(row.contrato_id),
            planName: String(row.plan_nombre),
            provider: String(row.proveedor),
            periodMonth: pM,
            periodYear: pY,
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
          });
        }
        db.telecomInvoices = mappedTelInvoices;
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
          invoicedAt: row.invoiced_at ? new Date(row.invoiced_at).toISOString() : (row.fecha_pedido ? new Date(row.fecha_pedido).toISOString() : undefined),
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
            courtName: String(row.juzgado || 'Juzgado de 1Âª Instancia e InstrucciÃ³n NÂº 1'),
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
      description: 'Materia prima metÃ¡lica de alta calidad para producciÃ³n en lÃ­nea de varilla y punta. PresentaciÃ³n en palet de 1.000 kg.',
      updatedAt: new Date().toISOString(),
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Suministros Industriales S.A.',
      sellerLevel: 'official'
    },
    {
      id: 'rm-plastico',
      materialType: 'plastico',
      title: 'Pellets de plÃ¡stico',
      presentation: 'Pallet de 1.000 kg (40 sacos de 25 kg)',
      unitWeightKg: 1000,
      isPallet: true,
      pricePerUnit: 380,
      description: 'PolÃ­mero plÃ¡stico en pellets para inyecciÃ³n de mangos. 40 sacos de 25 kg por palet (total 1.000 kg).',
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
      title: 'Destornilladores M3 con Mango ErgonÃ³mico',
      presentation: 'Caja de 50 unidades',
      unitWeightKg: 0,
      isPallet: false,
      pricePerUnit: 120,
      description: 'Anuncio de prueba publicado por Alumno de Nivel 3.',
      updatedAt: new Date().toISOString(),
      sellerId: 'alumno-nivel-3-demo',
      sellerName: 'Industrias MetalÃºrgicas N3, S.L.',
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
  if (hour >= 6 && hour < 14) return 1; // Turno MaÃ±ana (06:00 - 14:00)
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
  return day === 0 || day === 6; // 0 = Domingo, 6 = SÃ¡bado
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
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacÃ©n') ||
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

          // Line 2 calculation for this nave (PlÃ¡stico / Montaje / Ensamblaje)
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

        // --- LINE 1: FabricaciÃ³n de Varillas ---
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

        // --- LINE 2: InyecciÃ³n de PlÃ¡stico y Ensamblaje Final (Destornilladores) ---
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
            } else if (mType === 'plastico' || itemTitleLower.includes('plÃ¡stico') || itemTitleLower.includes('plastico')) {
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
          } else if (mType === 'plastico' || titleLower.includes('plÃ¡stico') || titleLower.includes('plastico')) {
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
          else if (mType === 'plastico' || tLower.includes('plÃ¡stico') || tLower.includes('plastico')) deliveredPlastic += (item.totalKg || 0);
          else if (mType === 'epoxi' || tLower.includes('epoxi')) deliveredEpoxi += (item.totalKg || 0);
        }
      } else {
        const mType = ord.materialType;
        const titleLower = (ord.materialTitle || '').toLowerCase();
        if (mType === 'hierro' || titleLower.includes('hierro')) deliveredIron += (ord.totalKg || 0);
        else if (mType === 'metal' || titleLower.includes('metal')) deliveredMetal += (ord.totalKg || 0);
        else if (mType === 'plastico' || titleLower.includes('plÃ¡stico') || titleLower.includes('plastico')) deliveredPlastic += (ord.totalKg || 0);
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
      title: 'Nave industrial diÃ¡fana en polÃ­gono industrial',
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
      address: 'PolÃ­gono Industrial Los Olivos, NÂº 14, Getafe',
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
      community: 'CataluÃ±a',
      municipality: 'Barcelona',
      address: 'Calle Comercio, NÂº 42, Barcelona',
      imageUrl: PROPERTY_IMAGES.local_comercial[0],
      status: 'available',
      ownerId: REALISTIC_CORPORATE_SELLERS[2].id,
      ownerName: REALISTIC_CORPORATE_SELLERS[2].name,
      createdTimestamp: new Date().toISOString()
    },
    {
      id: 'inm-3',
      title: 'AlmacÃ©n logÃ­stico con muelles de carga',
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
      address: 'Avenida del Euro, NÂº 8, Paterna',
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
      community: 'AndalucÃ­a',
      municipality: 'Sevilla',
      address: 'PolÃ­gono Empresarial Norte, NÂº 22, Sevilla',
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
      community: 'PaÃ­s Vasco',
      municipality: 'Bilbao',
      address: 'Calle del Carmen, NÂº 5, Bilbao',
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
        const newConcept = `AportaciÃ³n patronal Seguridad Social (75%) Mes ${targetMonth}/${targetYear}`;
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
      const newConcept = `Retenciones IRPF de nÃ³minas (17%) Trimestre Q${qNum} ${refYear}`;
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

const inMemoryPayrollLockedKeys = new Set<string>();

function checkAndProcessAutomatedPayrollAndTaxes(db: DatabaseSchema) {
  if (!db.hiredEmployees) db.hiredEmployees = [];
  if (!db.payrollRecords) db.payrollRecords = [];
  if (!db.taxObligations) db.taxObligations = [];
  if (!db.transfers) db.transfers = [];
  if (!db.jobListings) db.jobListings = [];
  normalizeAndFixTaxObligations(db);

  let modified = false;
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1; // 1 - 12
  const currentYear = now.getFullYear();

  // 1. Process Payroll on Day 1 of following month (for the preceding completed month)
  // Las nÃ³minas de cada mes se pagan el dÃ­a 1 del mes siguiente mediante transferencia individual a cada empleado.
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = currentYear - 1;
  }

  // On day 1 or later of current month, ensure previous completed month's payroll is processed exactly once
  if (currentDay >= 1) {
    const studentsWithEmployees = new Set(db.hiredEmployees.map(e => e.studentId));
    for (const studentId of studentsWithEmployees) {
      const student = db.users.find(u => u.id === studentId && u.role === 'student');
      if (!student) continue;

      const payrollLockKey = studentId + '-' + prevMonth + '-' + prevYear;
      if (inMemoryPayrollLockedKeys.has(payrollLockKey)) continue;

      const alreadyProcessed = db.payrollRecords.some(
        pr => pr.studentId === studentId && Number(pr.periodMonth) === Number(prevMonth) && Number(pr.periodYear) === Number(prevYear)
      );
      if (alreadyProcessed) {
        inMemoryPayrollLockedKeys.add(payrollLockKey);
        continue;
      }

      // Strict check: if transfers already exist for this student and period, do not pay again
      const existingTxForPeriod = (db.transfers || []).filter(
        t => t.senderId === student.id &&
             t.concept &&
             (t.concept.includes('Mes ' + prevMonth + '/' + prevYear) || t.concept.includes('Abono de nÃ³mina neta Mes ' + prevMonth + '/' + prevYear))
      );

      if (existingTxForPeriod.length > 0) {
        // Register the missing payrollRecord object without deducting funds again
        const prId = generateId('payroll');
        const totalNet = existingTxForPeriod.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const myEmps = db.hiredEmployees.filter(e => e.studentId === studentId);
        const newPR: PayrollRecord = {
          id: prId,
          studentId: student.id,
          studentName: student.name,
          payrollDate: new Date(currentYear, currentMonth - 1, 1, 9, 0, 0).toISOString(),
          periodMonth: prevMonth,
          periodYear: prevYear,
          employeeCount: existingTxForPeriod.length || myEmps.length,
          totalGrossSalary: totalNet,
          totalEmployeeSS: 0,
          totalEmployeeIRPF: 0,
          totalNetSalaryPaid: totalNet,
          totalCompanySS: 0,
          isProportional: false,
          status: 'paid',
          createdAt: now.toISOString()
        };
        db.payrollRecords.push(newPR);
        syncPayrollRecordToSupabase(newPR).catch(e => console.error(e));
        modified = true;
        continue;
      }

      const myEmployees = db.hiredEmployees.filter(e => e.studentId === studentId);
      if (myEmployees.length === 0) continue;

      let totalGross = 0;
      let totalEmployeeIRPF = 0;
      let totalEmployeeSS = 0;
      let totalNetPaid = 0;
      let totalCompanySS = 0;
      let isProportionalPayroll = false;
      let activeEmployeesCount = 0;

      const daysInPeriod = new Date(prevYear, prevMonth, 0).getDate();
      const payrollPayDate = new Date(currentYear, currentMonth - 1, 1, 9, 0, 0);

      for (const emp of myEmployees) {
        const empName = emp.employeeName || (emp as any).name || 'Empleado/a';
        const empId = emp.id || generateId('emp');

        // Strict idempotency: check if this employee was already paid for this period
        const alreadyPaidThisEmp = (db.transfers || []).some(
          t => t.senderId === student.id &&
               (t.receiverId === empId || t.receiverName === empName) &&
               t.concept &&
               (t.concept.includes('Mes ' + prevMonth + '/' + prevYear) || t.concept.includes('Abono de nÃ³mina neta Mes ' + prevMonth + '/' + prevYear))
        );
        if (alreadyPaidThisEmp) continue;

        let empGross = 0;
        let empIsProportional = false;
        let workedDays = daysInPeriod;

        if (emp.hireDate) {
          const parts = emp.hireDate.split('T')[0].split('-');
          const hireYear = parseInt(parts[0], 10);
          const hireMonth = parseInt(parts[1], 10);
          const hireDay = parseInt(parts[2], 10);

          if (hireYear > prevYear || (hireYear === prevYear && hireMonth > prevMonth)) {
            // Employee was hired after prevMonth -> did not work in prevMonth
            continue;
          } else if (hireYear === prevYear && hireMonth === prevMonth) {
            empIsProportional = true;
            workedDays = Math.max(1, daysInPeriod - hireDay + 1);
            empGross = (emp.grossSalaryMonthly / daysInPeriod) * workedDays;
          } else {
            empGross = emp.grossSalaryMonthly;
          }
        } else {
          empGross = emp.grossSalaryMonthly;
        }

        empGross = Math.round(empGross * 100) / 100;
        if (empGross <= 0) continue;

        if (empIsProportional) isProportionalPayroll = true;

        const eIRPF = Math.round(empGross * 0.17 * 100) / 100;
        const eSSEmp = Math.round(empGross * 0.0648 * 100) / 100;
        const eNet = Math.round((empGross - eIRPF - eSSEmp) * 100) / 100;
        const eSSComp = Math.round(empGross * 0.75 * 100) / 100;

        // Individual payment to this employee
        student.balance = Math.round((student.balance - eNet) * 100) / 100;
        const txId = generateId('tx');
        let hash = 0;
        for (let i = 0; i < empId.length; i++) hash = (hash << 5) - hash + empId.charCodeAt(i);
        const empAccountNum = (emp as any).accountNumber || 'ES' + (Math.abs(hash) % 900000000000000000 + 100000000000000000);

        const transfer: Transfer = {
          id: txId,
          senderId: student.id,
          senderName: student.name,
          senderAccount: student.accountNumber,
          receiverId: empId,
          receiverName: empName,
          receiverAccount: empAccountNum,
          amount: eNet,
          concept: 'Abono de nÃ³mina neta Mes ' + prevMonth + '/' + prevYear + ' - ' + empName + (emp.role ? ' (' + emp.role + ')' : ''),
          timestamp: payrollPayDate.toISOString()
        };

        db.transfers.unshift(transfer);
        syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', eNet, payrollPayDate.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

        totalGross += empGross;
        totalEmployeeIRPF += eIRPF;
        totalEmployeeSS += eSSEmp;
        totalNetPaid += eNet;
        totalCompanySS += eSSComp;
        activeEmployeesCount++;
      }

      if (activeEmployeesCount > 0) {
        totalGross = Math.round(totalGross * 100) / 100;
        totalEmployeeIRPF = Math.round(totalEmployeeIRPF * 100) / 100;
        totalEmployeeSS = Math.round(totalEmployeeSS * 100) / 100;
        totalNetPaid = Math.round(totalNetPaid * 100) / 100;
        totalCompanySS = Math.round(totalCompanySS * 100) / 100;

        syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role).catch(e => console.error(e));

        const prId = generateId('payroll');
        const newPR: PayrollRecord = {
          id: prId,
          studentId: student.id,
          studentName: student.name,
          payrollDate: payrollPayDate.toISOString(),
          periodMonth: prevMonth,
          periodYear: prevYear,
          employeeCount: activeEmployeesCount,
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

        // TGSS SS due date: 20th of current month (month following prevMonth)
        const ssDueDateObj = new Date(currentYear, currentMonth - 1, 20, 9, 0, 0);

        // AEAT IRPF due date: 15th of first month of following quarter of prevMonth/prevYear
        let qNum = 1;
        let irpfDueDateObj: Date;
        if (prevMonth >= 10) {
          qNum = 4;
          irpfDueDateObj = new Date(prevYear + 1, 0, 15, 9, 0, 0); // Jan 15 next year
        } else if (prevMonth >= 7) {
          qNum = 3;
          irpfDueDateObj = new Date(prevYear, 9, 15, 9, 0, 0); // Oct 15
        } else if (prevMonth >= 4) {
          qNum = 2;
          irpfDueDateObj = new Date(prevYear, 6, 15, 9, 0, 0); // Jul 15
        } else {
          qNum = 1;
          irpfDueDateObj = new Date(prevYear, 3, 15, 9, 0, 0); // Apr 15
        }

        const ssEmpObl: TaxObligation = {
          id: generateId('tax'),
          studentId: student.id,
          studentName: student.name,
          type: 'ss_employee',
          concept: 'Cuotas Seguridad Social Trabajador (6,48%) Mes ' + prevMonth + '/' + prevYear,
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
          concept: 'AportaciÃ³n patronal Seguridad Social (75%) Mes ' + prevMonth + '/' + prevYear,
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
          existingIrpf.concept = 'Retenciones IRPF de nÃ³minas (17%) Trimestre Q' + qNum + ' ' + prevYear;
          syncTaxObligationToSupabase(existingIrpf).catch(e => console.error(e));
        } else {
          const irpfObl: TaxObligation = {
            id: generateId('tax'),
            studentId: student.id,
            studentName: student.name,
            type: 'irpf',
            concept: 'Retenciones IRPF de nÃ³minas (17%) Trimestre Q' + qNum + ' ' + prevYear,
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
          details: 'NÃ³minas del mes ' + prevMonth + '/' + prevYear + ' pagadas automÃ¡ticamente el dÃ­a 1 para ' + student.name + ': ' + activeEmployeesCount + ' transferencias individuales realizadas por un lÃ­quido total de ' + totalNetPaid + 'â‚¬. Generadas deudas con Hacienda (IRPF: ' + totalEmployeeIRPF + 'â‚¬) y Seguridad Social (Empleado: ' + totalEmployeeSS + 'â‚¬, Empresa: ' + totalCompanySS + 'â‚¬).',
          timestamp: now.toISOString(),
          studentId: student.id,
          studentName: student.name
        });

        modified = true;
      }
    }
  }

  if (modified) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing db in payroll:', e);
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
    const isAlmacen = pType === 'almacen' || prop.propertyTitle?.toLowerCase().includes('almacÃ©n');

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

  let modified = false;

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
        modified = true;
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
        modified = true;
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
      modified = true;

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
        concept: `Pago domiciliado de factura de electricidad IberLuz Mes ${bill.periodMonth}/${bill.periodYear} (NÂº ${bill.billNumber})`,
        timestamp: now.toISOString()
      };
      if (!db.transfers) db.transfers = [];
      db.transfers.unshift(transfer);
      syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', bill.totalAmount, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

      if (!db.systemLogs) db.systemLogs = [];
      db.systemLogs.unshift({
        id: generateId('log'),
        action: 'ELECTRICITY_AUTOMATED_PAYMENT',
        details: `Pago automÃ¡tico de electricidad IberLuz realizado para ${student.name}: Factura ${bill.billNumber} por importe de ${bill.totalAmount}â‚¬`,
        timestamp: now.toISOString(),
        studentId: student.id,
        studentName: student.name
      });
    }
  }

  if (modified) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing db in electricity automation:', e);
    }
  }
}

const inMemoryTelecomLockedKeys = new Set<string>();

function normalizeAndDeduplicateTelecom(db: DatabaseSchema): boolean {
  if (!db.telecomInvoices) db.telecomInvoices = [];
  if (!db.transfers) db.transfers = [];
  let modified = false;

  // 1. Group invoices by studentId + periodMonth + periodYear
  const invoiceGroups = new Map<string, TelecomInvoice[]>();
  for (const inv of db.telecomInvoices) {
    if (!inv || !inv.studentId) continue;
    const k = `${inv.studentId}_${inv.periodMonth}_${inv.periodYear}`;
    if (!invoiceGroups.has(k)) invoiceGroups.set(k, []);
    invoiceGroups.get(k).push(inv);
  }

  const invoicesToKeep: TelecomInvoice[] = [];
  const invoicesToDelete: TelecomInvoice[] = [];
  const studentRefunds = new Map<string, number>();

  for (const [k, invs] of invoiceGroups.entries()) {
    invoicesToKeep.push(invs[0]);
    for (let i = 1; i < invs.length; i++) {
      const dup = invs[i];
      invoicesToDelete.push(dup);
      if (dup.status === 'pagado') {
        const cur = studentRefunds.get(dup.studentId) || 0;
        studentRefunds.set(dup.studentId, cur + Number(dup.totalAmount || 0));
      }
    }
  }

  if (invoicesToDelete.length > 0) {
    db.telecomInvoices = invoicesToKeep;
    modified = true;
    for (const dup of invoicesToDelete) {
      if (dbPool) {
        safeDbQuery('DELETE FROM facturas_telecom WHERE id = $1', [dup.id]).catch(e => console.error(e));
      }
    }
  }

  // 2. Deduplicate transfers for telecom
  const transfersToKeep: Transfer[] = [];
  const transfersToDelete: Transfer[] = [];
  const transferSeen = new Set<string>();

  for (const tx of db.transfers) {
    if (tx.receiverId === 'telecom-provider' || (tx.concept && tx.concept.toLowerCase().includes('telecomunicaciones'))) {
      const match = (tx.concept || '').match(/\((\d{1,2})\/(\d{4})\)/);
      const periodKey = match ? `${match[1]}-${match[2]}` : (tx.concept || '');
      const key = `${tx.senderId}_${periodKey}`;
      if (transferSeen.has(key)) {
        transfersToDelete.push(tx);
      } else {
        transferSeen.add(key);
        transfersToKeep.push(tx);
      }
    } else {
      transfersToKeep.push(tx);
    }
  }

  if (transfersToDelete.length > 0) {
    db.transfers = transfersToKeep;
    modified = true;
    for (const tx of transfersToDelete) {
      if (dbPool) {
        safeDbQuery('DELETE FROM movimientos WHERE id = $1 OR id = $2', [tx.id, tx.id + '-out']).catch(e => console.error(e));
        safeDbQuery('DELETE FROM movimientos WHERE id = $1', [tx.id + '-in']).catch(e => console.error(e));
      }
    }
  }

  // 3. Refund balances to students if duplicate payments occurred
  for (const [studentId, refundAmt] of studentRefunds.entries()) {
    const student = db.users.find(u => u.id === studentId);
    if (student && refundAmt > 0) {
      student.balance = Math.round((student.balance + refundAmt) * 100) / 100;
      modified = true;
      syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role, student.level).catch(e => console.error(e));
    }
  }

  return modified;
}

function checkAndProcessAutomatedTelecom(db: DatabaseSchema) {
  if (!db.telecomContracts) db.telecomContracts = [];
  if (!db.telecomInvoices) db.telecomInvoices = [];

  let modified = normalizeAndDeduplicateTelecom(db);
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
      if (inv.studentId !== student.id && inv.contractId !== contract.id) return false;
      const invDate = new Date(inv.issueDate);
      const firstDueOfContract = new Date(startYear, startMonth, 1, 0, 0, 0); // 1st of month following contract month
      return invDate < firstDueOfContract;
    });

    for (const premInv of prematureInvoices) {
      student.balance = Math.round((student.balance + premInv.totalAmount) * 100) / 100;
      syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role, student.level).catch(e => console.error(e));

      db.telecomInvoices = db.telecomInvoices.filter(i => i.id !== premInv.id);

      if (db.transfers) {
        db.transfers = db.transfers.filter(t => !(t.senderId === student.id && t.amount === premInv.totalAmount && (t.concept.includes(premInv.invoiceNumber) || t.receiverId === 'telecom-provider')));
      }
      modified = true;
    }

    // 2. Process billing for any completed month where payment is due (due on 1st of month M+1 at 00:00:00)
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;

    let curY = startYear;
    let curM = startMonth;

    while (curY < nowYear || (curY === nowYear && curM <= nowMonth)) {
      const lockKey = `${student.id}-${curM}-${curY}`;
      if (inMemoryTelecomLockedKeys.has(lockKey)) {
        curM++;
        if (curM > 12) {
          curM = 1;
          curY++;
        }
        continue;
      }

      // Due date for service month (curY, curM) is 1st of month (curM + 1) at 00:00:00
      const paymentDueDate = new Date(curY, curM, 1, 0, 0, 0);

      // Only process if paymentDueDate is on or before now
      if (now >= paymentDueDate) {
        const existingInvoice = (db.telecomInvoices || []).find(
          inv => (inv.studentId === student.id || inv.contractId === contract.id) && Number(inv.periodMonth) === Number(curM) && Number(inv.periodYear) === Number(curY)
        );

        if (existingInvoice) {
          inMemoryTelecomLockedKeys.add(lockKey);
          curM++;
          if (curM > 12) {
            curM = 1;
            curY++;
          }
          continue;
        }

        // Lock in memory immediately before creating
        inMemoryTelecomLockedKeys.add(lockKey);

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
          ? `Cuota proporcional de servicio ${contract.planName} (${activeDays}/${daysInMonth} dÃ­as del mes de alta ${curM}/${curY})`
          : `Cuota mensual de servicio ${contract.planName} (Mes ${curM}/${curY})`;

        const invoice: TelecomInvoice = {
          id: generateId('tel_inv'),
          invoiceNumber,
          studentId: student.id,
          studentName: student.name,
          companyName: student.name,
          nifCif: student.nifCif || ('B-' + Math.floor(10000000 + Math.random() * 90000000)),
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
          paymentMethod: 'Adeudo directo automÃ¡tico en cuenta (1 de cada mes)'
        };

        db.telecomInvoices.unshift(invoice);
        syncTelecomInvoiceToSupabase(invoice).catch(e => console.error(e));

        student.balance = Math.round((student.balance - totalAmount) * 100) / 100;
        syncAccountToSupabase(student.id, student.name, student.balance, student.username, student.password, student.accountNumber, student.role, student.level).catch(e => console.error(e));

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

        addNotification(
          db,
          student.id,
          'Pago automÃ¡tico de telecomunicaciones',
          `Se ha cargado automÃ¡ticamente en tu cuenta bancaria la cuota de ${contract.planName} correspondiente al mes ${curM}/${curY} por un importe total de ${totalAmount.toFixed(2)} â‚¬ (Factura ${invoiceNumber}).`,
          'info'
        );

        if (!db.systemLogs) db.systemLogs = [];
        db.systemLogs.unshift({
          id: generateId('log'),
          action: 'TELECOM_AUTOMATED_PAYMENT',
          details: `Cobro mensual automÃ¡tico de telecomunicaciones ${contract.planName} para ${student.name}: ${totalAmount}â‚¬ (IVA incl.) - Factura ${invoiceNumber}`,
          timestamp: paymentDueDate.toISOString(),
          studentId: student.id,
          studentName: student.name
        });

        modified = true;
      }

      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }
  }

  if (modified) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing db in telecom automation:', e);
    }
  }
}

function sanitizeDbStrings(db: DatabaseSchema) {
  if (!db) return;
  const cleanStr = (s?: string) => {
    if (!s) return s;
    return s
      .replace(/LÃ­nea de FabricaciÃ³n de Metal \/ Hierro \(Varilla y Punta\)/gi, 'LÃ­nea de fabricaciÃ³n de metal / hierro (varilla y punta)')
      .replace(/LÃ­nea de InyecciÃ³n de PlÃ¡stico y Ensamblaje Final/gi, 'LÃ­nea de inyecciÃ³n de plÃ¡stico y ensamblaje final')
      .replace(/LÃ­nea de FabricaciÃ³n de Metal/gi, 'LÃ­nea de fabricaciÃ³n de metal')
      .replace(/LÃ­nea de InyecciÃ³n de PlÃ¡stico/gi, 'LÃ­nea de inyecciÃ³n de plÃ¡stico')
      .replace(/LÃ­nea EstÃ¡ndar \(1 Torno CNC de 2 ejes\)/gi, 'LÃ­nea estÃ¡ndar (1 torno CNC de 2 ejes)')
      .replace(/LÃ­nea de Alta Capacidad \(2 Tornos CNC de 2 ejes\)/gi, 'LÃ­nea de alta capacidad (2 tornos CNC de 2 ejes)')
      .replace(/LÃ­nea Inyectora y Marcado LÃ¡ser/gi, 'LÃ­nea inyectora y marcado lÃ¡ser')
      .replace(/Carretilla Elevadora Contrapesada 2\.5T/gi, 'Carretilla elevadora contrapesada 2.5T')
      .replace(/Carretilla Elevadora Contrapesada/gi, 'Carretilla elevadora contrapesada')
      .replace(/Carretilla Elevadora/gi, 'Carretilla elevadora')
      .replace(/Nave Industrial DiÃ¡fana en PolÃ­gono Industrial/gi, 'Nave industrial diÃ¡fana en polÃ­gono industrial')
      .replace(/Nave Industrial Acondicionada/gi, 'Nave industrial acondicionada')
      .replace(/Nave Industrial/gi, 'Nave industrial')
      .replace(/AlmacÃ©n LogÃ­stico con Muelles de Carga/gi, 'AlmacÃ©n logÃ­stico con muelles de carga')
      .replace(/AlmacÃ©n LogÃ­stico/gi, 'AlmacÃ©n logÃ­stico')
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
      .replace(/Camionero \/ Conductor LogÃ­stico/gi, 'Camionero / conductor logÃ­stico')
      .replace(/Camionero \/ Conductor/gi, 'Camionero / conductor')
      .replace(/Turno MaÃ±ana/gi, 'Turno maÃ±ana')
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
          name: 'Ana LÃ³pez',
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
          name: 'Beatriz GÃ³mez',
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

    // Ensure all existing raw material orders have immutable invoicedAt and invoiceNumber ONLY for actual invoices
    if (Array.isArray(db.rawMaterialOrders)) {
      for (const ord of db.rawMaterialOrders) {
        if (!ord) continue;

        // Never generate or assign invoices for direct transfers between students or zero-amount inventory deliveries
        if (
          ord.isDirectTransfer === true ||
          ord.noInvoice === true ||
          (ord.announcementId && String(ord.announcementId).startsWith('tr-')) ||
          (ord.totalAmount === 0 && ord.basePrice === 0) ||
          (ord.note && String(ord.note).includes('EnvÃ­o directo de existencias'))
        ) {
          delete ord.invoiceNumber;
          delete ord.invoicedAt;
          continue;
        }

        // For orders where a student seller ships/sells to a student buyer: do NOT generate invoice for buyer on delivery
        const isStudentSeller = ord.sellerId && ord.sellerId !== 'proveedor-materia-prima' && ord.sellerId !== 'profesor-1' && ord.sellerId !== 'LOGISTICA_EXTERIOR' && ord.sellerId !== 'SUMINISTROS_ESTACION_SERVICIO';
        const isStudentBuyer = ord.studentId && ord.studentId !== 'profesor-1';
        if (isStudentSeller && isStudentBuyer && ord.status !== 'facturado') {
          delete ord.invoiceNumber;
          delete ord.invoicedAt;
          continue;
        }

        // When teacher buys from a student (e.g. Level 3 student), an automatic invoice MUST be generated and marked as 'facturado'
        if (ord.studentId === 'profesor-1' && isStudentSeller) {
          ord.status = 'facturado';
          if (!ord.invoicedAt) ord.invoicedAt = ord.deliveredAt || ord.approvedAt || ord.requestedAt || new Date().toISOString();
          if (!ord.invoiceNumber) {
            let hash = 0;
            const str = String(ord.id || ord.requestedAt || '1234');
            for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
            const num = Math.abs(hash) % 9000 + 1000;
            ord.invoiceNumber = `FACT-2026-${num}`;
          }
        }

        if (!ord.requestedAt) {
          ord.requestedAt = ord.approvedAt || ord.deliveredAt || ord.invoicedAt || new Date().toISOString();
        }
        if (!ord.invoicedAt && (ord.status === 'facturado' || Boolean(ord.invoiceNumber))) {
          ord.invoicedAt = ord.requestedAt || ord.approvedAt || ord.deliveredAt || new Date().toISOString();
        }
        if (!ord.invoiceNumber && ord.status === 'facturado') {
          let hash = 0;
          const str = String(ord.id || ord.requestedAt || '1234');
          for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
          const num = Math.abs(hash) % 9000 + 1000;
          ord.invoiceNumber = `FACT-2026-${num}`;
        }
      }
    }

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
          name: 'Ana LÃ³pez',
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
          name: 'Beatriz GÃ³mez',
          accountNumber: 'ES910001000244556677',
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
          name: 'Ana LÃ³pez',
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
          name: 'Beatriz GÃ³mez',
          accountNumber: 'ES910001000244556677',
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
      message: 'DATABASE_URL no estÃ¡ configurada',
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
    return res.status(400).json({ success: false, error: 'Proporciona una URL vÃ¡lida (DATABASE_URL)' });
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
      message: 'Â¡Conectado a Supabase correctamente! Datos cargados y sincronizados desde la base de datos.',
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
    return res.status(400).json({ success: false, error: 'DATABASE_URL no estÃ¡ configurada' });
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
      message: 'SincronizaciÃ³n y restauraciÃ³n con Supabase completada con Ã©xito.',
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

  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanPassword = String(password || '').trim();

  // Log to database systemLogs for diagnostic tracking
  try {
    const db = readDb();
    const newLog: SystemLog = {
      id: generateId('log-debug'),
      action: 'LOGIN_ATTEMPT',
      details: `Intento de acceso recibido: usuario "${cleanUsername || 'vacÃ­o'}".`,
      timestamp: new Date().toISOString()
    };
    db.systemLogs.unshift(newLog);
    writeDb(db);
  } catch (e) {
    console.error('Failed to write login attempt log:', e);
  }

  if (!cleanUsername || !cleanPassword) {
    console.log('[LOGIN] Failed: Missing username or password');
    return res.status(400).json({ error: 'Usuario y contraseÃ±a requeridos' });
  }

  const db = readDb();
  const user = db.users.find(u => {
    const uName = (u.username || '').trim().toLowerCase();
    const uPass = (u.password || '').trim();
    const nameMatch = (u.name || '').trim().toLowerCase() === cleanUsername;
    const accountMatch = (u.accountNumber || '').trim().toLowerCase() === cleanUsername;
    return (uName === cleanUsername || nameMatch || accountMatch) && uPass === cleanPassword;
  });

  if (!user) {
    console.log('[LOGIN] Failed: Credentials do not match any active user. Username tried:', cleanUsername);
    return res.status(401).json({ error: 'Credenciales invÃ¡lidas. Comprueba tu usuario y contraseÃ±a.' });
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

// Get students list with warehouse / logistics information
app.get(['/api/students-list', '/api/students'], (req, res) => {
  const db = readDb();
  const students = (db.users || [])
    .filter(u => u.role === 'student')
    .map(student => {
      const studentNaves = (db.acquisitions || []).filter(a =>
        String(a.studentId) === String(student.id) &&
        (['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes(a.propertyType || a.type || '') ||
         (a.propertyTitle || a.title || '').toLowerCase().includes('nave') ||
         (a.propertyTitle || a.title || '').toLowerCase().includes('almacÃ©n') ||
         (a.propertyTitle || a.title || '').toLowerCase().includes('almacen'))
      );

      const warehouses = studentNaves.length > 0
        ? studentNaves.map(nave => {
            const nId = String(nave.id || nave.propertyId);
            const hasForklift = (db.purchasedVehicles || []).some(v =>
              String(v.studentId) === String(student.id) &&
              v.vehicleType === 'carretilla_elevadora' &&
              (
                String(v.assignedPropertyId) === String(nId) ||
                (studentNaves.length === 1 && (v.assignedWarehouseIndex !== undefined || !v.assignedPropertyId))
              )
            );
            return {
              id: nId,
              title: nave.propertyTitle || nave.title || 'Nave industrial',
              type: nave.propertyType || 'nave_industrial',
              address: nave.location || nave.address || 'UbicaciÃ³n registrada',
              hasForklift
            };
          })
        : [
            {
              id: 'default_nave',
              title: 'AlmacÃ©n Principal',
              type: 'almacen',
              address: 'Sede central de la empresa',
              hasForklift: (db.purchasedVehicles || []).some(v =>
                String(v.studentId) === String(student.id) &&
                v.vehicleType === 'carretilla_elevadora'
              )
            }
          ];

      return {
        id: student.id,
        name: student.name,
        username: student.username,
        level: student.level || 1,
        accountNumber: student.accountNumber,
        warehouses
      };
    });

  res.json({ students });
});

// Create new bank user account (Teacher only)
const handleCreateUserRoute = (req: express.Request, res: express.Response) => {
  const { name, username, password, initialBalance, level } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseÃ±a son requeridos' });
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
    details: `Cuenta creada: ${newUser.name} (${newUser.username}) - Nivel ${newUser.level} con saldo inicial de ${newUser.balance} â‚¬`,
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
      return res.status(400).json({ error: 'El nombre de usuario ya estÃ¡ tomado' });
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
    return res.status(400).json({ error: 'Cantidad invÃ¡lida' });
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
    : (isAdd ? 'Abono forzado de fondos por AdministraciÃ³n Docente' : 'Cobro forzado de fondos por AdministraciÃ³n Docente');

  const teacherIBAN = 'ES99 0000 0000 0000 0000 0000';

  if (transferAmount > 0) {
    const forcedTransfer: Transfer = {
      id: generateId('tx'),
      senderId: isAdd ? 'teacher-admin' : user.id,
      senderName: isAdd ? 'AdministraciÃ³n Docente / Profesor' : user.name,
      senderAccount: isAdd ? teacherIBAN : user.accountNumber,
      receiverId: isAdd ? user.id : 'teacher-admin',
      receiverName: isAdd ? user.name : 'AdministraciÃ³n Docente / Profesor',
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
    details: `TransacciÃ³n forzada (${isAdd ? 'Ingreso' : 'DeducciÃ³n'}) para ${user.name}. Concepto: "${defaultConcept}". Importe: ${transferAmount} â‚¬, Anterior: ${oldBalance} â‚¬, Nuevo: ${user.balance} â‚¬`,
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
    details: `Cuenta eliminada: ${user.name} (${user.username}), saldo restante de ${user.balance} â‚¬`,
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
    return res.status(400).json({ error: 'Datos de transferencia invÃ¡lidos o cantidad menor/igual a cero' });
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
      error: `OperaciÃ³n denegada: Tu cuenta tiene pagos vencidos impagados por un total de ${formatCurrency(senderStatus.totalOverdueAmount)} (incluyendo el 5% de interÃ©s de demora). Tu cuenta no puede quedar en nÃºmeros rojos. Las salidas manuales de dinero estÃ¡n bloqueadas hasta regularizar tu saldo.`
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
    details: `SimulaciÃ³n reiniciada por el profesor. Â¿Se mantuvieron usuarios?: ${keepUsers ? 'SÃ­ (saldos restablecidos a ' + initialBalanceValue + ' â‚¬)' : 'No (todas las cuentas de alumnos eliminadas)'}`,
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
    res.json({ success: true, message: 'La simulaciÃ³n se ha reiniciado correctamente' });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al reiniciar la simulaciÃ³n: ' + error.message });
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
      return res.status(400).json({ error: 'Formato de copia de seguridad invÃ¡lido.' });
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

    res.json({ success: true, message: 'Copia de seguridad restaurada con Ã©xito.' });
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
      address: property.address || `Calle Principal, NÂº 12, ${property.municipality || 'Madrid'}`,
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
        almacen: 'AlmacÃ©n logÃ­stico',
        local_comercial: 'Local comercial'
      };

      const title = `${typeLabels[type]} ${i + 1} de ${surfaceM2} mÂ² en ${location.municipality}`;
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

  return res.status(400).json({ error: 'ConfiguraciÃ³n de publicaciÃ³n no vÃ¡lida.' });
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
      error: `OperaciÃ³n de compra/alquiler bloqueada: Tienes vencimientos impagados pendientes por un total de ${formatCurrency(studentStatus.totalOverdueAmount)} (incluyendo el 5% de interÃ©s de demora). Tu cuenta no puede quedar en nÃºmeros rojos. Las salidas manuales de dinero estÃ¡n bloqueadas hasta regularizar tu saldo.`
    });
  }

  const vendorName = property.ownerName && property.ownerName !== 'Profesor de Contabilidad' 
    ? property.ownerName 
    : 'Inmobiliaria PolÃ­gonos de EspaÃ±a S.A.';
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
      message: `Â¡Contrato de alquiler formalizado con Ã©xito! Se han deducido ${formatCurrency(initialPaymentTotal)} de fianza y primer mes de alquiler (IVA incl.).`,
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
        message: `Â¡Compra al contado completada con Ã©xito! Has adquirido la propiedad por ${formatCurrency(totalPrice)} (IVA 21% incl.).`,
        acquisition,
        updatedBalance: student.balance
      });
    } else {
      // DEFERRED PAYMENT (PAGO APLAZADO CON PAGARÃ‰ / LETRA DE CAMBIO / CUOTAS)
      const config = property.deferredPaymentConfig!;
      const downPaymentPercent = config.minDownPaymentPercent || 20;
      const downPaymentBase = (basePrice * downPaymentPercent) / 100;
      const initialCashRequired = Number((downPaymentBase + ivaAmount).toFixed(2));

      if (student.balance < initialCashRequired) {
        return res.status(400).json({
          error: `Saldo insuficiente para la entrada inicial y liquidaciÃ³n de IVA. Se requieren ${formatCurrency(initialCashRequired)} (Entrada ${downPaymentPercent}%: ${formatCurrency(downPaymentBase)} + IVA Total 21%: ${formatCurrency(ivaAmount)})`
        });
      }

      const pendingBaseBalance = Number((basePrice - downPaymentBase).toFixed(2));
      const count = config.installmentsCount || 12;
      const installmentAmount = Number((pendingBaseBalance / count).toFixed(2));

      // Deduct initial cash payment
      student.balance = Number((student.balance - initialCashRequired).toFixed(2));

      const instrumentLabel = config.instrument === 'pagare'
        ? 'PagarÃ©'
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
        message: `Â¡Compra aplazada formalizada! Se han abonado ${formatCurrency(initialCashRequired)} de entrada e IVA, y se han emitido ${count} ${instrumentLabel}s de ${formatNumber(installmentAmount)} â‚¬/mes.`,
        acquisition,
        updatedBalance: student.balance
      });
    }
  }

  return res.status(400).json({ error: 'OperaciÃ³n no vÃ¡lida.' });
});

// ================= MACHINERY CATALOG & ENDPOINTS =================

const MACHINERY_CATALOG: MachineryItem[] = [
  {
    id: 'mac-metal-hierro',
    category: 'metal_hierro',
    title: 'LÃ­nea de fabricaciÃ³n de metal / hierro (varilla y punta)',
    description: 'LÃ­nea industrial completa para la fabricaciÃ³n de la varilla de acero y la punta de precisiÃ³n de los destornilladores.',
    imageUrl: '/images/machinery/maquinaria_cnc.jpg',
    equipment: [
      'Horno de inducciÃ³n',
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
        title: 'LÃ­nea estÃ¡ndar (1 torno CNC de 2 ejes)',
        productionCapacityUnitsPerHour: 60,
        basePrice: 104000
      },
      {
        id: 'opt-2-lathes',
        lathesCount: 2,
        title: 'LÃ­nea de alta capacidad (2 tornos CNC de 2 ejes)',
        productionCapacityUnitsPerHour: 100,
        basePrice: 110000
      }
    ]
  },
  {
    id: 'mac-plastico-ensamblaje',
    category: 'plastico_ensamblaje',
    title: 'LÃ­nea de inyecciÃ³n de plÃ¡stico y ensamblaje final',
    description: 'LÃ­nea automatizada para la inyecciÃ³n del mango plÃ¡stico de polÃ­mero, marcado lÃ¡ser y ensamblaje final.',
    imageUrl: '/images/machinery/maquinaria_cnc.jpg',
    equipment: [
      'Secador de granza',
      'Refrigerador de agua (Chiller)',
      'Prensa de inyecciÃ³n',
      'Marcado lÃ¡ser de marca y referencia'
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
        title: 'LÃ­nea inyectora y marcado lÃ¡ser',
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
      error: `OperaciÃ³n de compra de maquinaria bloqueada: Tienes vencimientos impagados pendientes por un total de ${formatCurrency(studentStatus.totalOverdueAmount)} (incluyendo el 5% de interÃ©s de demora). Tu cuenta no puede quedar en nÃºmeros rojos. Las salidas manuales de dinero estÃ¡n bloqueadas hasta regularizar tu saldo.`
    });
  }

  const machinery = MACHINERY_CATALOG.find(m => m.id === machineryId);
  if (!machinery) {
    return res.status(404).json({ error: 'LÃ­nea de maquinaria no encontrada en el catÃ¡logo' });
  }

  const option = machinery.options.find(o => o.id === optionId);
  if (!option) {
    return res.status(404).json({ error: 'OpciÃ³n de configuraciÃ³n de maquinaria no encontrada' });
  }

  // Validation: Student MUST own or rent an Industrial Nave suitable for this machinery
  const acquisitions = db.acquisitions.filter(a => a.studentId === studentId);
  const targetAcquisition = acquisitions.find(a => a.id === targetNaveId || a.propertyId === targetNaveId);

  if (!targetAcquisition) {
    return res.status(400).json({
      error: `Para comprar esta maquinaria se requiere obligatoriamente disponer de una nave industrial de al menos ${machinery.requiredSurfaceM2} mÂ² (superficie de producciÃ³n). Por favor, adquiere o alquila una nave industrial adecuada antes de continuar.`
    });
  }

  const pType = (targetAcquisition.propertyType || targetAcquisition.type || '').toLowerCase();
  const pTitle = (targetAcquisition.propertyTitle || targetAcquisition.title || '').toLowerCase();
  const isIndustrialNave = pType === 'nave_industrial' || pType.includes('nave') || pType === 'industrial' || pTitle.includes('nave');

  if (!isIndustrialNave) {
    const typeLabel = targetAcquisition.propertyType === 'local_comercial' ? 'Local comercial' : targetAcquisition.propertyType === 'almacen' ? 'AlmacÃ©n' : 'Inmueble';
    return res.status(400).json({
      error: `Requisito de ubicaciÃ³n incumplido: El inmueble seleccionado "${targetAcquisition.propertyTitle}" es un ${typeLabel}. La maquinaria industrial de fabricaciÃ³n solo puede ser instalada dentro de una nave industrial.`
    });
  }

  // Calculate surface breakdown coherently with the floor plan
  const surfaceBreakdown = getNaveSurfaceBreakdownBackend(db, studentId, targetAcquisition);
  const requiredSurfaceM2 = machinery.requiredSurfaceM2 || (machinery.category === 'metal_hierro' ? 240 : 180);

  if (surfaceBreakdown.availableForMachineryM2 < requiredSurfaceM2) {
    return res.status(400).json({
      error: `Superficie insuficiente en la nave industrial: La nave "${targetAcquisition.propertyTitle}" dispone de ${surfaceBreakdown.totalNaveM2} mÂ² en total. Actualmente tiene instalada(s) ${surfaceBreakdown.existingMachinery.length} mÃ¡quina(s) ocupando un total de ${surfaceBreakdown.occupiedMachineryM2} mÂ², almacÃ©n de ${surfaceBreakdown.storageZoneM2} mÂ² y administraciÃ³n de ${surfaceBreakdown.adminZoneM2} mÂ². En el plano quedan ${surfaceBreakdown.availableForMachineryM2} mÂ² disponibles para maquinaria (${surfaceBreakdown.freeInMachineryZone} mÂ² libres en la zona de maquinaria + ${surfaceBreakdown.freeZoneM2} mÂ² de superficie diÃ¡fana/libre). La nueva lÃ­nea "${machinery.title}" requiere ${requiredSurfaceM2} mÂ². Por favor, amplÃ­a la superficie diÃ¡fana en el plano de distribuciÃ³n o adquiere una nueva nave industrial.`
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
      ? `Â¡AdquisiciÃ³n de maquinaria al contado completada! Importe abonado: ${formatCurrency(totalPrice)} (IVA incl.). La maquinaria ha iniciado el periodo de montaje de 8 horas en ${targetAcquisition.propertyTitle}.`
      : `Â¡AdquisiciÃ³n de maquinaria al contado completada! Importe abonado: ${formatCurrency(totalPrice)} (IVA incl.). âš ï¸ ATENCIÃ“N: El montaje NO se ha iniciado porque no has contratado la potencia de energÃ­a elÃ©ctrica suficiente (${totalPowerNeeded} kW requeridos vs ${elecContract ? elecContract.contractedPowerKw : 0} kW contratados). La maquinaria permanecerÃ¡ almacenada sin montar hasta que contrates la luz en el apartado de EnergÃ­a.`;

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
      ? `Â¡Compra aplazada de maquinaria formalizada! Se han abonado ${formatCurrency(initialCashRequired)} de entrada e IVA, y se han emitido 24 pagarÃ©s mensuales de ${formatNumber(installmentAmount)} â‚¬/mes. El montaje de 8 horas ha comenzado en ${targetAcquisition.propertyTitle}.`
      : `Â¡Compra aplazada de maquinaria formalizada! Se han abonado ${formatCurrency(initialCashRequired)} de entrada e IVA, y emitido 24 pagarÃ©s mensuales. âš ï¸ ATENCIÃ“N: El montaje NO se ha iniciado por falta de potencia/luz contratada (${totalPowerNeeded} kW requeridos). Contrata la potencia necesaria en EnergÃ­a para iniciar el montaje.`;

    return res.json({
      success: true,
      message: defStatusMsg,
      machineryAcquisition: machAcq,
      updatedBalance: student.balance
    });
  }

  return res.status(400).json({ error: 'Forma de pago no vÃ¡lida.' });
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
      error: `Saldo insuficiente para pagar el traslado de la maquinaria. Coste total: ${totalAmount.toFixed(2)} â‚¬ (IVA incl.), Saldo disponible: ${currentBal.toFixed(2)} â‚¬.`
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
    recipient: 'LogÃ­stica y Montajes Industriales EspaÃ±a S.L.',
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
    machineryTitle: mac.lineTitle || mac.title || mac.machineryTitle || 'LÃ­nea de producciÃ³n',
    sourceNaveId: mac.installedAtNaveId || mac.installationNaveId || '',
    sourceNaveTitle: sourceTitle,
    sourceLocation: 'InstalaciÃ³n industrial de origen',
    targetNaveId: targetNave.id,
    targetNaveTitle: targetTitle,
    targetLocation: 'InstalaciÃ³n industrial de destino',
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
    message: `Iniciado el proceso de traslado de ${mac.lineTitle || mac.title || 'Maquinaria'} a ${targetNave.propertyTitle}. Se han cargado ${totalAmount.toFixed(2)} â‚¬ en cuenta por desmontaje, transporte (${distanceKm} km) y montaje. Se ha generado la factura correspondiente.`,
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

  const annualBuildingDepreciation = Number((totalBuildingValue * 0.02).toFixed(2)); // 2% amortizaciÃ³n contable oficial de construcciÃ³n en EspaÃ±a

  // 1. Payment Obligations (PagarÃ©s, letras de cambio y cuotas de compra aplazada)
  // Las cuotas de alquiler de meses posteriores son compromisos de gasto corriente, no deudas financieras acumulativas.
  const pendingDebtObligations = obligations.filter(o => o.status === 'pendiente' && o.type !== 'cuota_alquiler');
  const totalObligationsPendingAmount = Number(pendingDebtObligations.reduce((acc, o) => acc + o.amount, 0).toFixed(2));

  // 2. Bank Loans (PrÃ©stamos hipotecarios activos)
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
    return res.status(404).json({ error: 'ObligaciÃ³n de pago no encontrada' });
  }

  if (obligation.status === 'pagado') {
    return res.status(400).json({ error: 'Esta obligaciÃ³n ya ha sido abonada anteriormente' });
  }

  const isDueDateReached = new Date(obligation.dueDate) <= new Date();
  if (!isDueDateReached && obligation.status !== 'vencido') {
    return res.status(400).json({ error: 'No estÃ¡ permitido abonar pagos aplazados antes de su fecha de vencimiento.' });
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
    ? 'PagarÃ©'
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
    concept: `AtenciÃ³n a vencimiento de ${instrumentName} (${obligation.installmentNumber || 1}/${obligation.totalInstallments || 1}): ${obligation.propertyTitle}`,
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
    message: `Â¡AtenciÃ³n al vencimiento completada con Ã©xito! Se han abonado ${formatCurrency(obligation.amount)} correspondiente al ${instrumentName}.`,
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
    return res.status(404).json({ error: 'ObligaciÃ³n fiscal no encontrada' });
  }

  if (tax.status === 'pagado') {
    return res.status(400).json({ error: 'Esta obligaciÃ³n fiscal ya ha sido liquidada' });
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
    : 'TesorerÃ­a General de la Seguridad Social (TGSS)';
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
    concept: `LiquidaciÃ³n tributaria / SS: ${tax.concept}`,
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
    message: `Â¡LiquidaciÃ³n tributaria completada con Ã©xito! Se han abonado ${formatCurrency(tax.amount)} a ${receiverName}.`,
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
  let regularMonthlyPayment = 0;
  if (r > 0) {
    regularMonthlyPayment = principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
  } else {
    regularMonthlyPayment = principal / termMonths;
  }
  regularMonthlyPayment = Number(regularMonthlyPayment.toFixed(2));

  let pendingBalance = principal;
  let totalAmortized = 0;
  const schedule: AmortizationRow[] = [];
  const baseDate = new Date(startDateISO);

  for (let k = 1; k <= termMonths; k++) {
    const dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + k, 0);
    const interest = Number((pendingBalance * r).toFixed(2));
    let principalPart = Number((regularMonthlyPayment - interest).toFixed(2));
    let currentPayment = regularMonthlyPayment;

    if (k === termMonths) {
      principalPart = Number(pendingBalance.toFixed(2));
      currentPayment = Number((principalPart + interest).toFixed(2));
    }

    pendingBalance = Math.max(0, Number((pendingBalance - principalPart).toFixed(2)));
    totalAmortized = Number((totalAmortized + principalPart).toFixed(2));

    schedule.push({
      period: k,
      dueDate: dueDate.toISOString(),
      payment: currentPayment,
      interest,
      principal: principalPart,
      totalAmortized,
      pendingBalance,
      paid: false
    });
  }

  return { monthlyPayment: regularMonthlyPayment, schedule };
}

function calculateMonthlyPenaltyInterest(principal: number, dueDate: Date, now: Date, isOverdue: boolean = false): number {
  if (dueDate >= now) return 0;
  if (!isOverdue) return 0;
  const daysElapsed = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));
  if (daysElapsed <= 0) return 0;
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
      if (pn.status === 'pagado' || pn.maturityProcessed) {
        continue;
      }
      if (pn.status === 'descontado' || pn.status === 'gestion_cobro') {
        // Strict idempotency: check if note was already collected, settled, or returned
        const alreadySettledTx = (db.transfers || []).find(t => 
          t.concept && t.concept.includes(pn.promissoryNoteNumber) &&
          (t.concept.includes('gestion de cobro') || t.concept.includes('LiquidaciÃ³n al vencimiento') || t.concept.includes('Cobro al vencimiento') || t.concept.includes('Cobro automÃ¡tico'))
        );
        if (alreadySettledTx) {
          pn.status = 'pagado';
          pn.maturityProcessed = true;
          pn.paidAt = pn.paidAt || alreadySettledTx.timestamp;
          pn.paidTransferId = pn.paidTransferId || alreadySettledTx.id;
          const obl = (db.paymentObligations || []).find(o => o.propertyTitle?.includes(pn.promissoryNoteNumber) || o.acquisitionId === pn.promissoryNoteNumber);
          if (obl && obl.status !== 'pagado') {
            obl.status = 'pagado';
            obl.paidDate = pn.paidAt;
            syncObligationToSupabase(obl).catch(e => console.error(e));
          }
          modified = true;
          continue;
        }

        const alreadyReturnedTx = (db.transfers || []).find(t => 
          t.concept && t.concept.includes(pn.promissoryNoteNumber) && t.concept.includes('devoluciÃ³n')
        );
        if (alreadyReturnedTx) {
          pn.status = 'impagado';
          pn.maturityProcessed = true;
          modified = true;
          continue;
        }

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
              const transferConcept = 'LiquidaciÃ³n al vencimiento de pagarÃ© descontado ' + pn.promissoryNoteNumber + ' - Librador: ' + payer.name;
              const payTransfer: Transfer = {
                id: txId,
                senderId: payer.id,
                senderName: payer.name,
                senderAccount: payer.accountNumber || pn.bankIban,
                receiverId: 'corp-banco-central',
                receiverName: 'Banco Central Mercantil (LiquidaciÃ³n de descuento)',
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

              const obl = (db.paymentObligations || []).find(o => o.propertyTitle?.includes(pn.promissoryNoteNumber) || o.acquisitionId === pn.promissoryNoteNumber);
              if (obl) {
                obl.status = 'pagado';
                obl.paidDate = now.toISOString();
                syncObligationToSupabase(obl).catch(e => console.error(e));
              }

              addNotification(
                db,
                beneficiary.id,
                'PagarÃ© descontado atendido al vencimiento',
                'El deudor ' + payer.name + ' ha liquidado correctamente al vencimiento el pagarÃ© ' + pn.promissoryNoteNumber + ' por ' + formatNumber(amount) + ' â‚¬ que habÃ­as descontado. OperaciÃ³n concluida con Ã©xito sin costes adicionales.',
                'transfer_received',
                txId
              );

              addNotification(
                db,
                payer.id,
                'Cargo de pagarÃ© al vencimiento',
                'El banco ha cargado en tu cuenta ' + formatNumber(amount) + ' â‚¬ correspondiente al vencimiento del pagarÃ© oficial ' + pn.promissoryNoteNumber + ' emitido a favor de ' + beneficiary.name + '.',
                'transfer_received',
                txId
              );

              const successMaturityMsg: MarketMessage = {
                id: generateId('msg'),
                chatId: msg.chatId,
                senderId: payer.id,
                senderName: payer.name,
                recipientId: beneficiary.id,
                recipientName: beneficiary.name,
                content: 'ðŸ¦ PagarÃ© descontado liquidado al vencimiento: El deudor ' + payer.name + ' ha atendido el cargo del pagarÃ© ' + pn.promissoryNoteNumber + ' por ' + formatNumber(amount) + ' â‚¬. El banco confirma la liquidaciÃ³n definitiva. No procede ningÃºn cargo adicional para el vendedor acreedor.',
                timestamp: now.toISOString(),
                read: false,
                type: 'text'
              };
              db.marketMessages.push(successMaturityMsg);

              if (payer.role === 'student') syncAccountToSupabase(payer.id, payer.name, payer.balance).catch(e => console.error(e));
              syncMovimientoToSupabase(txId + '-out', payer.id, 'TRANSFER_OUT', amount, now.toISOString(), transferConcept, payTransfer).catch(e => console.error(e));
              syncMarketMessageToSupabase(msg).catch(e => console.error(e));
              syncMarketMessageToSupabase(successMaturityMsg).catch(e => console.error(e));
            } else if (isCollectionNote) {
              beneficiary.balance = Number((beneficiary.balance + amount).toFixed(2));
              const transferConcept = 'Cobro automÃ¡tico al vencimiento por gestiÃ³n de cobro de pagarÃ© ' + pn.promissoryNoteNumber + ' - Librador: ' + payer.name + ' -> Beneficiario: ' + beneficiary.name;
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

              const obl = (db.paymentObligations || []).find(o => o.propertyTitle?.includes(pn.promissoryNoteNumber) || o.acquisitionId === pn.promissoryNoteNumber);
              if (obl) {
                obl.status = 'pagado';
                obl.paidDate = now.toISOString();
                syncObligationToSupabase(obl).catch(e => console.error(e));
              }

              addNotification(
                db,
                beneficiary.id,
                'PagarÃ© en gestiÃ³n de cobro cobrado con Ã©xito',
                'El pagarÃ© oficial ' + pn.promissoryNoteNumber + ' emitido por ' + payer.name + ' ha vencido hoy y el banco ha tramitado el cobro automÃ¡tico. Se han ingresado +' + formatNumber(amount) + ' â‚¬ en tu cuenta corriente sin necesidad de ninguna acciÃ³n adicional.',
                'transfer_received',
                txId
              );

              addNotification(
                db,
                payer.id,
                'Cargo de pagarÃ© al vencimiento (gestiÃ³n de cobro)',
                'El banco ha cargado en tu cuenta ' + formatNumber(amount) + ' â‚¬ correspondiente al vencimiento del pagarÃ© oficial ' + pn.promissoryNoteNumber + ' presentado en gestiÃ³n de cobro por ' + beneficiary.name + '.',
                'transfer_received',
                txId
              );

              const successCollectionMsg: MarketMessage = {
                id: generateId('msg'),
                chatId: msg.chatId,
                senderId: payer.id,
                senderName: payer.name,
                recipientId: beneficiary.id,
                recipientName: beneficiary.name,
                content: 'ðŸ›ï¸ PAGARÃ‰ EN GESTIÃ“N DE COBRO LIQUIDADO AUTOMÃTICAMENTE: El banco ha tramitado con Ã©xito el cobro automÃ¡tico al vencimiento del pagarÃ© ' + pn.promissoryNoteNumber + '. Se han cargado ' + formatNumber(amount) + ' â‚¬ en la cuenta del comprador deudor (' + payer.name + ') y se han abonado Ã­ntegramente +' + formatNumber(amount) + ' â‚¬ en la cuenta del vendedor acreedor (' + beneficiary.name + ').',
                timestamp: now.toISOString(),
                read: false,
                type: 'text'
              };
              db.marketMessages.push(successCollectionMsg);

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
              const unpaidCommission = Number((amount * 0.01).toFixed(2));
              const totalDebitVendor = Number((amount + unpaidCommission).toFixed(2));
              beneficiary.balance = Number((beneficiary.balance - totalDebitVendor).toFixed(2));

              const txNominalId = generateId('tx');
              const txFeeId = generateId('tx');
              const nominalReturnConcept = 'Reintegro del nominal de pagarÃ© descontado devuelto por impago ' + pn.promissoryNoteNumber + ' (librador: ' + payer.name + ') - DevoluciÃ³n de anticipo bancario: -' + formatNumber(amount) + ' â‚¬';
              const feeReturnConcept = 'ComisiÃ³n bancaria por devoluciÃ³n de pagarÃ© descontado impagado ' + pn.promissoryNoteNumber + ' (1% sobre ' + formatNumber(amount) + ' â‚¬) - Falta de fondos del librador: -' + formatNumber(unpaidCommission) + ' â‚¬';

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
                receiverName: 'Banco Central Mercantil (ComisiÃ³n de devoluciÃ³n de efectos)',
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

              const obl = (db.paymentObligations || []).find(o => o.propertyTitle?.includes(pn.promissoryNoteNumber) || o.acquisitionId === pn.promissoryNoteNumber);
              if (obl) {
                obl.status = 'vencido';
                syncObligationToSupabase(obl).catch(e => console.error(e));
              }

              addNotification(
                db,
                beneficiary.id,
                'PagarÃ© descontado devuelto por impago (cargo de nominal + comisiÃ³n)',
                'El deudor ' + payer.name + ' no disponÃ­a de saldo para atender el pagarÃ© ' + pn.promissoryNoteNumber + ' (' + formatNumber(amount) + ' â‚¬). Al haber sido descontado anticipadamente, el banco ha adeudado en tu cuenta: 1) Reintegro del nominal adelantado: -' + formatNumber(amount) + ' â‚¬; 2) ComisiÃ³n de devoluciÃ³n (1%): -' + formatNumber(unpaidCommission) + ' â‚¬. Total cargado: -' + formatNumber(totalDebitVendor) + ' â‚¬. Puedes presentar demanda ejecutiva en el Juzgado (Portal Judicial).',
                'transfer_received',
                txNominalId
              );

              addNotification(
                db,
                payer.id,
                'PagarÃ© devuelto impagado al tenedor',
                'No disponÃ­as de saldo suficiente para atender el vencimiento del pagarÃ© ' + pn.promissoryNoteNumber + ' (' + formatNumber(amount) + ' â‚¬). El banco ha devuelto el efecto como impagado a ' + beneficiary.name + ', quien podrÃ¡ iniciar acciones ejecutivas judiciales.',
                'transfer_received',
                txNominalId
              );

              const protestMaturityMsg: MarketMessage = {
                id: generateId('msg'),
                chatId: msg.chatId,
                senderId: beneficiary.id,
                senderName: beneficiary.name,
                recipientId: payer.id,
                recipientName: payer.name,
                content: 'âŒ PagarÃ© descontado devuelto por impago: El librador ' + payer.name + ' no disponÃ­a de fondos suficientes para atender el pagarÃ© ' + pn.promissoryNoteNumber + ' por ' + formatNumber(amount) + ' â‚¬ a su vencimiento. Al haber sido descontado previamente, el banco ha cargado en la cuenta del vendedor acreedor (' + beneficiary.name + '):\nâ€¢ Reintegro del nominal anticipado: -' + formatNumber(amount) + ' â‚¬\nâ€¢ ComisiÃ³n bancaria por devoluciÃ³n (1%): -' + formatNumber(unpaidCommission) + ' â‚¬\nâ€¢ Total adeudado: -' + formatNumber(totalDebitVendor) + ' â‚¬\nEl efecto queda en estado de impago con plena fuerza ejecutiva cambiaria.',
                timestamp: now.toISOString(),
                read: false,
                type: 'text'
              };
              db.marketMessages.push(protestMaturityMsg);

              if (beneficiary.role === 'student') syncAccountToSupabase(beneficiary.id, beneficiary.name, beneficiary.balance).catch(e => console.error(e));
              syncMovimientoToSupabase(txNominalId + '-out', beneficiary.id, 'TRANSFER_OUT', amount, now.toISOString(), nominalReturnConcept, nominalReturnTransfer).catch(e => console.error(e));
              syncMovimientoToSupabase(txFeeId + '-out', beneficiary.id, 'TRANSFER_OUT', unpaidCommission, new Date(now.getTime() + 1000).toISOString(), feeReturnConcept, feeReturnTransfer).catch(e => console.error(e));
              syncMarketMessageToSupabase(msg).catch(e => console.error(e));
              syncMarketMessageToSupabase(protestMaturityMsg).catch(e => console.error(e));
            } else if (isCollectionNote) {
              const unpaidCommission = 40.00;
              beneficiary.balance = Number((beneficiary.balance - unpaidCommission).toFixed(2));

              const returnConcept = 'ComisiÃ³n por devoluciÃ³n de pagarÃ© impagado en gestiÃ³n de cobro ' + pn.promissoryNoteNumber + ' por falta de fondos del librador (' + payer.name + ') - Tarifa bancaria fija: -40,00 â‚¬';
              const returnTransfer: Transfer = {
                id: txId,
                senderId: beneficiary.id,
                senderName: beneficiary.name,
                senderAccount: beneficiary.accountNumber || 'ES00 0000 0000 0000 0000',
                receiverId: 'corp-banco-central',
                receiverName: 'Banco Central Mercantil (DevoluciÃ³n de efectos en gestiÃ³n de cobro)',
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

              const obl = (db.paymentObligations || []).find(o => o.propertyTitle?.includes(pn.promissoryNoteNumber) || o.acquisitionId === pn.promissoryNoteNumber);
              if (obl) {
                obl.status = 'vencido';
                syncObligationToSupabase(obl).catch(e => console.error(e));
              }

              addNotification(
                db,
                beneficiary.id,
                'PagarÃ© en gestiÃ³n de cobro devuelto por impago',
                'El librador ' + payer.name + ' no disponÃ­a de saldo para atender el pagarÃ© ' + pn.promissoryNoteNumber + ' (' + formatNumber(amount) + ' â‚¬). El banco te lo ha devuelto como IMPAGADO con un cargo de 40,00 â‚¬ por comisiÃ³n de devoluciÃ³n. Puedes interponer demanda ejecutiva en el Juzgado (Portal Judicial).',
                'transfer_received',
                txId
              );

              addNotification(
                db,
                payer.id,
                'PagarÃ© Devuelto Impagado al Tenedor',
                'No disponÃ­as de saldo suficiente para atender el vencimiento del pagarÃ© ' + pn.promissoryNoteNumber + ' (' + formatNumber(amount) + ' â‚¬). El banco ha devuelto el efecto como impagado a ' + beneficiary.name + ', quien podrÃ¡ iniciar acciones ejecutivas en los Tribunales.',
                'transfer_received',
                txId
              );

              const protestCollectionMsg: MarketMessage = {
                id: generateId('msg'),
                chatId: msg.chatId,
                senderId: beneficiary.id,
                senderName: beneficiary.name,
                recipientId: payer.id,
                recipientName: payer.name,
                content: 'âŒ PAGARÃ‰ EN GESTIÃ“N DE COBRO DEVUELTO POR IMPAGO: El deudor ' + payer.name + ' no disponÃ­a de saldo suficiente para atender el vencimiento del pagarÃ© ' + pn.promissoryNoteNumber + ' por ' + formatNumber(amount) + ' â‚¬. El banco ha devuelto el pagarÃ© al vendedor acreedor (' + beneficiary.name + ') como IMPAGADO con un cargo de 40,00 â‚¬ en concepto de comisiÃ³n por efecto devuelto. El pagarÃ© conserva plena fuerza ejecutiva cambiaria para su reclamaciÃ³n judicial.',
                timestamp: now.toISOString(),
                read: false,
                type: 'text'
              };
              db.marketMessages.push(protestCollectionMsg);

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

  if (modified) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing db in maturity:', e);
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
      sourceType: "obligation" | "loan" | "tax" | "electricity";
      dueDate: Date;
      principal: number;
      penaltyInterest: number;
      totalRequired: number;
      concept: string;
      obligationRef?: PaymentObligation;
      loanRef?: BankLoan;
      loanRowIndex?: number;
      taxRef?: any;
      electricityRef?: any;
    }

    const pendingItems: PendingItem[] = [];

    // 1. Obligations (Exclude promissory notes/pagares which must be settled manually by student transfer)
    if (db.paymentObligations) {
      for (const ob of db.paymentObligations) {
        if (ob.type === "pagare" || (ob.acquisitionId && ob.acquisitionId.startsWith("promissory_"))) {
          continue; // Pagares are manual student-initiated transfers, not automated direct debits
        }
        if (ob.studentId === student.id && (ob.status === "pendiente" || ob.status === "vencido")) {
          const dDate = new Date(ob.dueDate);
          if (dDate <= now) {
            const principal = ob.amount;
            const isOverdue = ob.status === "vencido";
            const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now, isOverdue);
            const totalRequired = Number((principal + penalty).toFixed(2));

            const instrumentName = ob.type === "pagare" ? "PagarÃ©" : ob.type === "letra_cambio" ? "Letra de cambio" : "Cuota / Alquiler";
            let concept = `AtenciÃ³n a vencimiento de ${instrumentName}: ${ob.propertyTitle}`;
            if (ob.type === "alquiler" || ob.type === "cuota_alquiler") {
              concept = `Cuota de alquiler n.Âº ${ob.installmentNumber || 1} de ${ob.propertyTitle}`;
            } else if (ob.type === "compra" || ob.type === "compra_inmueble") {
              concept = `Pago aplazado de compra de ${ob.propertyTitle} (Cuota ${ob.installmentNumber || 1}/${ob.totalInstallments || 12})`;
            } else if (ob.type === "maquinaria" || (ob.propertyTitle && (ob.propertyTitle.toLowerCase().includes("lÃ­nea") || ob.propertyTitle.toLowerCase().includes("maquina") || ob.propertyTitle.toLowerCase().includes("mÃ¡quina")))) {
              concept = `Pago aplazado de la mÃ¡quina ${ob.propertyTitle} (Cuota ${ob.installmentNumber || 1}/${ob.totalInstallments || 24})`;
            }

            pendingItems.push({
              id: ob.id,
              sourceType: "obligation",
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

    // 2. Loans (Prevalece siempre la informacion de la tabla de amortizacion del prestamo)
    if (db.loans) {
      for (const loan of db.loans) {
        if (loan.studentId === student.id && loan.status === "active") {
          loan.schedule.forEach((row, idx) => {
            if (!row.paid) {
              const dDate = new Date(row.dueDate);
              if (dDate <= now) {
                const principal = row.payment; // Cuota exacta estipulada en la tabla de amortizacion
                const isOverdue = Boolean(row.isOverdue);
                const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now, isOverdue);
                const totalRequired = Number((principal + penalty).toFixed(2));
                const periodNum = row.period || (row as any).installmentNumber || 1;

                pendingItems.push({
                  id: `${loan.id}-row-${periodNum}`,
                  sourceType: "loan",
                  dueDate: dDate,
                  principal,
                  penaltyInterest: penalty,
                  totalRequired,
                  concept: `Cuota ${periodNum}/${loan.termMonths} de prÃ©stamo hipotecario (${loan.collateral?.propertyTitle || "GarantÃ­a inmobiliaria"})`,
                  loanRef: loan,
                  loanRowIndex: idx
                });
              }
            }
          });
        }
      }
    }

    // 3. Tax Obligations (IRPF / Seguridad Social)
    if (db.taxObligations) {
      for (const tax of db.taxObligations) {
        if (tax.studentId === student.id && (tax.status === "pendiente" || (tax.status as string) === "vencido")) {
          const dDate = new Date(tax.dueDate);
          if (dDate <= now) {
            const principal = tax.amount;
            const isOverdue = (tax.status as string) === "vencido";
            const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now, isOverdue);
            const totalRequired = Number((principal + penalty).toFixed(2));
            pendingItems.push({
              id: tax.id,
              sourceType: "tax",
              dueDate: dDate,
              principal,
              penaltyInterest: penalty,
              totalRequired,
              concept: `Pago de ${tax.concept}`,
              taxRef: tax
            });
          }
        }
      }
    }

    // 4. Electricity Bills (IberLuz)
    if (db.electricityBills) {
      for (const bill of db.electricityBills) {
        if (bill.studentId === student.id && (bill.status === "pendiente" || (bill.status as string) === "vencido")) {
          const dDate = new Date(bill.dueDate);
          if (dDate <= now) {
            const principal = bill.totalAmount;
            const isOverdue = (bill.status as string) === "vencido";
            const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now, isOverdue);
            const totalRequired = Number((principal + penalty).toFixed(2));
            pendingItems.push({
              id: bill.id,
              sourceType: "electricity",
              dueDate: dDate,
              principal,
              penaltyInterest: penalty,
              totalRequired,
              concept: `Factura IberLuz NÂº ${bill.billNumber}`,
              electricityRef: bill
            });
          }
        }
      }
    }

    // Sort items chronologically
    pendingItems.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    for (const item of pendingItems) {
      if (student.balance >= item.totalRequired) {
        student.balance = Number((student.balance - item.totalRequired).toFixed(2));
        modified = true;

        if (item.sourceType === "obligation" && item.obligationRef) {
          const ob = item.obligationRef;
          ob.status = "pagado";
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

          // 1. Movimiento principal del cargo/obligacion
          const principalTransfer: Transfer = {
            id: generateId("tx"),
            senderId: student.id,
            senderName: student.name,
            senderAccount: student.accountNumber,
            receiverId: "corp-tenedor-efectos",
            receiverName: "Tenedor de Efectos Comerciales S.A.",
            receiverAccount: "ES210001000299887755",
            amount: item.principal,
            concept: item.concept,
            timestamp: new Date().toISOString()
          };
          db.transfers.unshift(principalTransfer);
          syncObligationToSupabase(ob).catch(e => console.error(e));
          syncMovimientoToSupabase(principalTransfer.id + "-out", student.id, "TRANSFER_OUT", item.principal, principalTransfer.timestamp, principalTransfer.concept, principalTransfer).catch(e => console.error(e));

          // 2. Movimiento independiente para intereses de demora por mora (si procede)
          if (item.penaltyInterest > 0) {
            const penaltyTransfer: Transfer = {
              id: generateId("tx"),
              senderId: student.id,
              senderName: student.name,
              senderAccount: student.accountNumber,
              receiverId: "corp-tenedor-efectos",
              receiverName: "Tenedor de Efectos Comerciales S.A.",
              receiverAccount: "ES210001000299887755",
              amount: item.penaltyInterest,
              concept: "Intereses de demora por mora en el pago de: " + item.concept,
              timestamp: new Date(Date.now() + 100).toISOString()
            };
            db.transfers.unshift(penaltyTransfer);
            syncMovimientoToSupabase(penaltyTransfer.id + "-out", student.id, "TRANSFER_OUT", item.penaltyInterest, penaltyTransfer.timestamp, penaltyTransfer.concept, penaltyTransfer).catch(e => console.error(e));
          }
        } else if (item.sourceType === "loan" && item.loanRef && item.loanRowIndex !== undefined) {
          const loan = item.loanRef;
          const row = loan.schedule[item.loanRowIndex];
          row.paid = true;
          row.paidDate = new Date().toISOString();
          row.isOverdue = false;
          row.penaltyInterest = 0;

          // 1. Movimiento principal de amortizacion: Prevalece estrictamente la cuota mensual especificada en la tabla de amortizacion
          const principalTransfer: Transfer = {
            id: generateId("tx"),
            senderId: student.id,
            senderName: student.name,
            senderAccount: student.accountNumber,
            receiverId: "corp-banco-central",
            receiverName: "Banco Central Hipotecario S.A.",
            receiverAccount: "ES210001000299887700",
            amount: item.principal,
            concept: item.concept,
            timestamp: new Date().toISOString()
          };
          db.transfers.unshift(principalTransfer);

          // 2. Movimiento independiente para intereses de demora por mora (si procede)
          if (item.penaltyInterest > 0) {
            const penaltyTransfer: Transfer = {
              id: generateId("tx"),
              senderId: student.id,
              senderName: student.name,
              senderAccount: student.accountNumber,
              receiverId: "corp-banco-central",
              receiverName: "Banco Central Hipotecario S.A.",
              receiverAccount: "ES210001000299887700",
              amount: item.penaltyInterest,
              concept: "Intereses de demora por mora en: " + item.concept,
              timestamp: new Date(Date.now() + 100).toISOString()
            };
            db.transfers.unshift(penaltyTransfer);
            syncMovimientoToSupabase(penaltyTransfer.id + "-out", student.id, "TRANSFER_OUT", item.penaltyInterest, penaltyTransfer.timestamp, penaltyTransfer.concept, penaltyTransfer).catch(e => console.error(e));
          }

          if (loan.schedule.every(r => r.paid)) {
            loan.status = "paid_off";
          }
          syncLoanToSupabase(loan).catch(e => console.error(e));
          syncMovimientoToSupabase(principalTransfer.id + "-out", student.id, "TRANSFER_OUT", item.principal, principalTransfer.timestamp, principalTransfer.concept, principalTransfer).catch(e => console.error(e));
        } else if (item.sourceType === "tax" && item.taxRef) {
          const tax = item.taxRef;
          tax.status = "pagado";
          tax.paidDate = new Date().toISOString();
          tax.penaltyInterest = 0;

          const receiverName = tax.type === "irpf" ? "Agencia Tributaria - Hacienda PÃºblica" : "TesorerÃ­a General de la Seguridad Social";
          const principalTransfer: Transfer = {
            id: generateId("tx"),
            senderId: student.id,
            senderName: student.name,
            senderAccount: student.accountNumber,
            receiverId: tax.type === "irpf" ? "hacienda" : "seguridad-social",
            receiverName: receiverName,
            receiverAccount: "ES000000000000000000",
            amount: item.principal,
            concept: item.concept,
            timestamp: new Date().toISOString()
          };
          db.transfers.unshift(principalTransfer);
          syncTaxObligationToSupabase(tax).catch(e => console.error(e));
          syncMovimientoToSupabase(principalTransfer.id + "-out", student.id, "TRANSFER_OUT", item.principal, principalTransfer.timestamp, principalTransfer.concept, principalTransfer).catch(e => console.error(e));

          if (item.penaltyInterest > 0) {
            const penaltyTransfer: Transfer = {
              id: generateId("tx"),
              senderId: student.id,
              senderName: student.name,
              senderAccount: student.accountNumber,
              receiverId: tax.type === "irpf" ? "hacienda" : "seguridad-social",
              receiverName: receiverName,
              receiverAccount: "ES000000000000000000",
              amount: item.penaltyInterest,
              concept: "Intereses de demora por mora en: " + item.concept,
              timestamp: new Date(Date.now() + 100).toISOString()
            };
            db.transfers.unshift(penaltyTransfer);
            syncMovimientoToSupabase(penaltyTransfer.id + "-out", student.id, "TRANSFER_OUT", item.penaltyInterest, penaltyTransfer.timestamp, penaltyTransfer.concept, penaltyTransfer).catch(e => console.error(e));
          }
        } else if (item.sourceType === "electricity" && item.electricityRef) {
          const bill = item.electricityRef;
          bill.status = "pagada";
          bill.paidDate = new Date().toISOString();
          bill.penaltyInterest = 0;

          const principalTransfer: Transfer = {
            id: generateId("tx"),
            senderId: student.id,
            senderName: student.name,
            senderAccount: student.accountNumber,
            receiverId: "corp-iberluz",
            receiverName: "IberLuz EnergÃ­a S.A.",
            receiverAccount: "ES990001000299887711",
            amount: item.principal,
            concept: item.concept,
            timestamp: new Date().toISOString()
          };
          db.transfers.unshift(principalTransfer);
          // electricity bill updated in local db
          syncMovimientoToSupabase(principalTransfer.id + "-out", student.id, "TRANSFER_OUT", item.principal, principalTransfer.timestamp, principalTransfer.concept, principalTransfer).catch(e => console.error(e));

          if (item.penaltyInterest > 0) {
            const penaltyTransfer: Transfer = {
              id: generateId("tx"),
              senderId: student.id,
              senderName: student.name,
              senderAccount: student.accountNumber,
              receiverId: "corp-iberluz",
              receiverName: "IberLuz EnergÃ­a S.A.",
              receiverAccount: "ES990001000299887711",
              amount: item.penaltyInterest,
              concept: "Intereses de demora por mora en: " + item.concept,
              timestamp: new Date(Date.now() + 100).toISOString()
            };
            db.transfers.unshift(penaltyTransfer);
            syncMovimientoToSupabase(penaltyTransfer.id + "-out", student.id, "TRANSFER_OUT", item.penaltyInterest, penaltyTransfer.timestamp, penaltyTransfer.concept, penaltyTransfer).catch(e => console.error(e));
          }
        }

        } else {
        // Insufficient balance -> mark overdue with 5% default interest
        if (item.sourceType === "obligation" && item.obligationRef) {
          item.obligationRef.status = "vencido";
          item.obligationRef.penaltyInterest = item.penaltyInterest;
          item.obligationRef.totalOverdueAmount = item.totalRequired;
          modified = true;
        } else if (item.sourceType === "loan" && item.loanRef && item.loanRowIndex !== undefined) {
          item.loanRef.schedule[item.loanRowIndex].isOverdue = true;
          item.loanRef.schedule[item.loanRowIndex].penaltyInterest = item.penaltyInterest;
          modified = true;
        } else if (item.sourceType === "tax" && item.taxRef) {
          item.taxRef.status = "vencido";
          item.taxRef.penaltyInterest = item.penaltyInterest;
          modified = true;
        } else if (item.sourceType === "electricity" && item.electricityRef) {
          item.electricityRef.status = "vencido";
          item.electricityRef.penaltyInterest = item.penaltyInterest;
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

  // 1. Obligations (Exclude promissory notes/pagarÃ©s which are manual student transfers)
  if (db.paymentObligations) {
    for (const ob of db.paymentObligations) {
      if (ob.type === 'pagare' || (ob.acquisitionId && ob.acquisitionId.startsWith('promissory_'))) {
        continue; // Excluded from upcoming payments / direct debit
      }
      if (ob.studentId === studentId && ob.status !== 'pagado') {
        const dDate = new Date(ob.dueDate);
        const instrumentName = ob.type === 'pagare' ? 'PagarÃ©' : ob.type === 'letra_cambio' ? 'Letra de cambio' : 'Cuota / Alquiler';
        const principal = ob.amount;
        const isOverdue = ob.status === 'vencido';
        const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now, isOverdue);
        const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

        const item: UpcomingPaymentItem = {
          id: ob.id,
          sourceType: 'obligation',
          type: ob.type,
          title: ob.propertyTitle,
          concept: `DomiciliaciÃ³n ${instrumentName}`,
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
            const isOverdue = Boolean(row.isOverdue);
            const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now, isOverdue);
            const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

            const item: UpcomingPaymentItem = {
              id: `${loan.id}-row-${row.period}`,
              sourceType: 'loan',
              type: 'cuota_prestamo',
              title: `PrÃ©stamo hipotecario (Ref: ${loan.id})`,
              concept: `Cuota mensual de amortizaciÃ³n ${row.period}/${loan.termMonths}`,
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
        const isOverdue = (tax.status as string) === 'vencido';
        const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now, isOverdue);
        const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

        const isIRPF = tax.type === 'irpf';
        const title = isIRPF ? 'AEAT - Hacienda (RetenciÃ³n IRPF)' : 'TGSS - Seguridad Social';

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
          installmentInfo: 'LiquidaciÃ³n tributaria / SS'
        };

        if (dDate <= now) {
          overdueItems.push(item);
        } else if (dDate <= thirtyFiveDaysLater) {
          upcoming30DaysItems.push(item);
        }
      }
    }
  }

  // 4. Upcoming Payroll & Derived Tax Obligations (NÃ³minas el dÃ­a 1 del mes siguiente y tributos el 20 TGSS / 15 AEAT)
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
            title: `NÃ³mina neta (${emp.employeeName || (emp as any).name || 'Empleado'})`,
            concept: `NÃ³mina neta - ${emp.employeeName || (emp as any).name || 'Empleado'} (Mes ${targetMonth}/${targetYear})`,
            dueDate: netPayDate.toISOString(),
            principalAmount: eNet,
            penaltyInterest: 0,
            totalAmount: eNet,
            isOverdue: false,
            daysRemaining: daysRem,
            installmentInfo: `DÃ­a 1 del mes siguiente`
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
            installmentInfo: `DÃ­a 20 del mes siguiente`
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
            concept: `AportaciÃ³n patronal Seguridad Social (75%) Mes ${targetMonth}/${targetYear}`,
            dueDate: ssDueDate.toISOString(),
            principalAmount: totalCompanySS,
            penaltyInterest: 0,
            totalAmount: totalCompanySS,
            isOverdue: false,
            daysRemaining: daysRem,
            installmentInfo: `DÃ­a 20 del mes siguiente`
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
              title: `AEAT - Hacienda (RetenciÃ³n IRPF Q${qNum})`,
              concept: `Retenciones IRPF de nÃ³minas (17%) Trimestre Q${qNum} ${targetYear}`,
              dueDate: irpfDueDate.toISOString(),
              principalAmount: fullQuarterIRPF,
              penaltyInterest: 0,
              totalAmount: fullQuarterIRPF,
              isOverdue: false,
              daysRemaining: daysRem,
              installmentInfo: `DÃ­a 15 del mes siguiente al trimestre Q${qNum}`
            });
          }
        }
      }
    }
  }

  // 5. Active Telecom Contracts (Adeudo directo el dÃ­a 1 del mes siguiente)
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
          const dueDate = new Date(targetYear, targetMonth, 1, 0, 0, 0); // 1st of month following targetMonth
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
              title: `Fibra y telÃ©fono (${contract.planName})`,
              concept: isProrated 
                ? `Cuota proporcional de telecomunicaciones (${activeDays}/${daysInMonth} dÃ­as) - ${contract.planName}`
                : `Cuota mensual de telecomunicaciones - ${contract.planName} (Mes ${targetMonth}/${targetYear})`,
              dueDate: dueDate.toISOString(),
              principalAmount: totalAmount,
              penaltyInterest: 0,
              totalAmount: totalAmount,
              isOverdue: false,
              daysRemaining: daysRem,
              installmentInfo: 'DÃ­a 1 del mes siguiente'
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
      const isOverdue = (bill.status as string) === 'vencido';
      const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now, isOverdue);
      const daysRem = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

      const item: UpcomingPaymentItem = {
        id: bill.id,
        sourceType: 'electricity' as any,
        type: 'cuota_electricidad' as any,
        title: `Factura de Electricidad IberLuz (Mes ${bill.periodMonth}/${bill.periodYear})`,
        concept: `Pago domiciliado de factura IberLuz NÂº ${bill.billNumber}`,
        dueDate: bill.dueDate,
        principalAmount: principal,
        penaltyInterest: penalty,
        totalAmount: Number((principal + penalty).toFixed(2)),
        isOverdue: dDate <= now,
        daysRemaining: daysRem,
        installmentInfo: 'DÃ­a 5 del mes siguiente'
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
                concept: `EstimaciÃ³n cuota de electricidad IberLuz (${projectedBill.totalKwh} kWh)`,
                dueDate: projectedBill.dueDate,
                principalAmount: projectedBill.totalAmount,
                penaltyInterest: 0,
                totalAmount: projectedBill.totalAmount,
                isOverdue: dDate <= now,
                daysRemaining: daysRem,
                installmentInfo: 'DÃ­a 5 del mes siguiente'
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
    return res.status(400).json({ error: 'Debes indicar un importe solicitado vÃ¡lido' });
  }
  if (!termM || termM <= 0) {
    return res.status(400).json({ error: 'Debes indicar un plazo de devoluciÃ³n vÃ¡lido' });
  }
  if (!apprVal || apprVal <= 0) {
    return res.status(400).json({ error: 'Debes indicar un valor de tasaciÃ³n vÃ¡lido para la garantÃ­a' });
  }

  let collateralPropertyTitle: string | undefined;
  if (collateralType === 'property') {
    const acq = db.acquisitions.find(a => a.id === propertyId || a.propertyId === propertyId);
    if (!acq) {
      return res.status(400).json({ error: 'No se encontrÃ³ el inmueble seleccionado como garantÃ­a' });
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
      responseMessage = `El banco ha concedido automÃ¡ticamente una oferta por ${formatCurrency(offeredAmount)} (mÃ¡ximo 80% del valor de tasaciÃ³n de la garantÃ­a de ${formatCurrency(apprVal)}). Por favor, revisa las condiciones y acepta la oferta para ingresar el importe.`;
    } else {
      responseMessage = `Â¡Tu solicitud de prÃ©stamo por ${formatCurrency(offeredAmount)} ha sido pre-aprobada automÃ¡ticamente al 80% LTV! Revisa las condiciones y la tabla de amortizaciÃ³n para formalizarlo.`;
    }
  } else {
    responseMessage = `Solicitud registrada. Al disponer ya de un prÃ©stamo previo concedido, esta segunda solicitud requiere la revisiÃ³n y aprobaciÃ³n manual del Profesor.`;
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
    return res.status(404).json({ error: 'PrÃ©stamo no encontrado' });
  }

  if (loan.status !== 'offered' && loan.status !== 'teacher_offered') {
    return res.status(400).json({ error: 'Este prÃ©stamo no se encuentra pendiente de aceptaciÃ³n' });
  }

  const student = db.users.find(u => u.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Estudiante no encontrado' });
  }

  if (student.balance < loan.openingFee) {
    return res.status(400).json({
      error: `Saldo insuficiente para abonar la comisiÃ³n de apertura del 1 por mil (${formatCurrency(loan.openingFee)}). Saldo disponible actual: ${formatCurrency(student.balance)}.`
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
    receiverName: 'Banco Central Hipotecario S.A. - ComisiÃ³n Apertura (1â€°)',
    receiverAccount: 'ES210001000299887700',
    amount: loan.openingFee,
    concept: `ComisiÃ³n de apertura de prÃ©stamo hipotecario (1â€°): Ref. ${loan.id}`,
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
    concept: `ConcesiÃ³n e ingreso de prÃ©stamo hipotecario: Ref. ${loan.id}`,
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
    message: `Â¡PrÃ©stamo de ${formatCurrency(loan.offeredAmount)} formalizado! Se ha ingresado el principal en tu cuenta y cobrado ${formatCurrency(loan.openingFee)} de comisiÃ³n de apertura (1â€°).`,
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
    return res.status(404).json({ error: 'PrÃ©stamo no encontrado' });
  }

  loan.status = 'rejected';
  writeDb(db);

  syncLoanToSupabase(loan).catch(e => console.error(e));

  res.json({
    success: true,
    message: 'Oferta de prÃ©stamo rechazada correctamente.',
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
    return res.status(404).json({ error: 'PrÃ©stamo no encontrado' });
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
    message: action === 'deny' ? 'PrÃ©stamo denegado.' : 'PrÃ©stamo aprobado con condiciones notificadas al alumno.',
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
    return res.status(400).json({ error: 'La contraseÃ±a actual no es correcta' });
  }

  user.password = newPassword.trim();
  syncAccountToSupabase(user.id, user.name, user.balance, user.username, user.password, user.accountNumber, user.role).catch(e => console.error(e));

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'CHANGE_PASSWORD',
    details: `El usuario ${user.name} (${user.username}) ha cambiado su contraseÃ±a`,
    timestamp: new Date().toISOString(),
    studentId: user.id,
    studentName: user.name
  });

  writeDb(db);
  res.json({ success: true, message: 'ContraseÃ±a actualizada correctamente' });
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

  const maleNames = ['Carlos', 'Javier', 'Alejandro', 'Manuel', 'David', 'Pablo', 'Ãlvaro', 'Diego', 'Gonzalo', 'Sergio', 'Fernando', 'Marcos', 'Hugo', 'Daniel', 'AdriÃ¡n', 'Lucas', 'Mateo', 'RubÃ©n', 'Jorge', 'IvÃ¡n'];
  const femaleNames = ['Ana', 'MarÃ­a', 'Carmen', 'Laura', 'Marta', 'Paula', 'LucÃ­a', 'SofÃ­a', 'Elena', 'Alba', 'Isabel', 'Cristina', 'Beatriz', 'Patricia', 'Andrea', 'Sara', 'Nuria', 'RocÃ­o', 'Silvia', 'Sonia'];
  const surnames = ['GarcÃ­a', 'RodrÃ­guez', 'GonzÃ¡lez', 'FernÃ¡ndez', 'LÃ³pez', 'MartÃ­nez', 'SÃ¡nchez', 'PÃ©rez', 'GÃ³mez', 'MartÃ­n', 'JimÃ©nez', 'Ruiz', 'HernÃ¡ndez', 'DÃ­az', 'Moreno', 'MuÃ±oz', 'Ãlvarez', 'Romero', 'Alonso', 'GutiÃ©rrez'];

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
    if (chosenRole === 'camionero') jobTitle = 'Camionero / conductor logÃ­stico';
    else if (chosenRole === 'mozo_almacen') jobTitle = 'Mozo de almacÃ©n';
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
    details: `Publicadas ${createdJobs.length} ofertas de empleo en Foro de Empleo (Sueldos: ${numMinSalary}-${numMaxSalary}â‚¬, Edades: ${numMinAge}-${numMaxAge})`,
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
    role: job.role || (job.title && (job.title.toLowerCase().includes('mozo') || job.title.toLowerCase().includes('almacen') || job.title.toLowerCase().includes('almacÃ©n')) ? 'mozo_almacen' : job.title && job.title.toLowerCase().includes('camionero') ? 'camionero' : job.title && job.title.toLowerCase().includes('carretillero') ? 'carretillero' : 'operario'),
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
    details: `El alumno ${student.name} ha contratado a ${job.employeeName} (Sueldo bruto: ${job.grossSalaryMonthly}â‚¬/mes, Edad: ${job.age})`,
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
  if (!ob) return res.status(404).json({ error: 'ObligaciÃ³n no encontrada' });

  db.paymentObligations = db.paymentObligations.filter(o => o.id !== id);
  if (dbPool) {
    dbPool.query('DELETE FROM obligaciones_pago WHERE id = $1', [id]).catch(e => console.error(e));
  }

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'DELETE_OBLIGATION',
    details: `Profesor ha eliminado la deuda / obligaciÃ³n ${ob.id} de ${ob.studentName}`,
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
    details: `Profesor ha eliminado la adquisiciÃ³n ${acq.propertyTitle} de ${acq.studentName}`,
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
    details: `Profesor ha eliminado la adquisiciÃ³n de maquinaria ${mac.title || mac.lineTitle} de ${mac.studentName}`,
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
  if (!loan) return res.status(404).json({ error: 'PrÃ©stamo no encontrado' });

  db.loans = db.loans.filter(l => l.id !== id);
  if (dbPool) {
    dbPool.query('DELETE FROM prestamos WHERE id = $1', [id]).catch(e => console.error(e));
  }

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'DELETE_LOAN',
    details: `Profesor ha eliminado el prÃ©stamo ${loan.id} de ${loan.studentName}`,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  res.json({ success: true, message: 'PrÃ©stamo eliminado' });
});

app.put('/api/loans/:id', (req, res) => {
  const { id } = req.params;
  const { offeredAmount, annualInterestRate, termMonths, status } = req.body;
  const db = readDb();
  const loan = db.loans.find(l => l.id === id);
  if (!loan) return res.status(404).json({ error: 'PrÃ©stamo no encontrado' });

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
    ? `Â¡Suministro elÃ©ctrico contratado (${pKw} kW)! Se ha iniciado automÃ¡ticamente el periodo de montaje de 8 horas para ${unblockedCount} lÃ­nea(s) de maquinaria.`
    : `Â¡Suministro elÃ©ctrico de ${pKw} kW contratado correctamente!`;

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
    message: `Servicio ${plan.name} contratado con Ã©xito. El servicio queda activo inmediatamente. La primera cuota proporcional (${activeDays}/${daysInMonth} dÃ­as: ${totalProrated.toFixed(2)} â‚¬ IVA incl.) se cargarÃ¡ automÃ¡ticamente en tu cuenta el 1 de ${nextMonthStr}.`
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
    return res.status(400).json({ error: 'La cesta de la compra estÃ¡ vacÃ­a' });
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
      error: `Saldo insuficiente para realizar el pedido. Total pedido: ${totalAmount.toFixed(2)} â‚¬ (IVA incl.), Saldo disponible: ${student.balance.toFixed(2)} â‚¬.`
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
    concept: `Compra de mobiliario/informÃ¡tica - Pedido NÂº ${orderNumber}`,
    timestamp: now.toISOString()
  };
  db.transfers.unshift(transfer);
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalAmount, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

  writeDb(db);

  res.json({
    success: true,
    order,
    newBalance: student.balance,
    message: `Pedido NÂº ${orderNumber} realizado con Ã©xito. Cargados ${totalAmount.toFixed(2)} â‚¬ (IVA incl.) en cuenta.`
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
      t === 'almacÃ©n' ||
      t === 'almacen_logistico' ||
      t === 'warehouse' ||
      title.includes('nave') ||
      title.includes('almacen') ||
      title.includes('almacÃ©n')
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
      const pTitle = targetProp.propertyTitle || targetProp.title || 'Nave industrial / almacÃ©n logÃ­stico';
      const isAlmacen = (
        targetProp.propertyType === 'almacen' ||
        targetProp.propertyType === 'almacen_logistico' ||
        targetProp.propertyTitle?.toLowerCase().includes('almacÃ©n') ||
        targetProp.propertyTitle?.toLowerCase().includes('almacen')
      );

      fk.assignedPropertyId = pId;
      fk.assignedPropertyTitle = pTitle;
      fk.assignedWarehouseIndex = 1;
      fk.assignedWarehouseName = isAlmacen
        ? `${pTitle} (Inmueble almacÃ©n logÃ­stico)`
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
  if (bPrice <= 0) return res.status(400).json({ error: 'Precio invÃ¡lido' });

  const ivaAmount = Math.round((bPrice * 0.21) * 100) / 100;
  const totalPrice = Math.round((bPrice + ivaAmount) * 100) / 100;

  if (student.balance < totalPrice) {
    return res.status(400).json({
      error: `Saldo insuficiente. Total con IVA (21%): ${totalPrice.toFixed(2)} â‚¬, Saldo disponible: ${student.balance.toFixed(2)} â‚¬.`
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
    title: title || 'VehÃ­culo Corporativo',
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
    concept: `AdquisiciÃ³n de vehÃ­culo (${title}) - Pago al contado`,
    timestamp: now.toISOString()
  };
  db.transfers.unshift(transfer);
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', totalPrice, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'BUY_VEHICLE',
    details: `El alumno ${student.name} ha comprado un vehÃ­culo "${title}" por ${totalPrice.toFixed(2)}â‚¬ (IVA incl.)`,
    timestamp: now.toISOString(),
    studentId: student.id,
    studentName: student.name
  });

  writeDb(db);

  res.json({
    success: true,
    vehicle,
    newBalance: student.balance,
    message: `VehÃ­culo "${title}" adquirido con Ã©xito por ${totalPrice.toFixed(2)} â‚¬ (IVA incl.).`
  });
});

app.post('/api/vehicles/buy-cart', (req, res) => {
  const { studentId, cartItems } = req.body;
  if (!studentId || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'ParÃ¡metros invÃ¡lidos para la compra de la cesta de vehÃ­culos.' });
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
      error: `Saldo insuficiente. Total con IVA (21%): ${grandTotal.toFixed(2)} â‚¬, Saldo disponible: ${student.balance.toFixed(2)} â‚¬.`
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
        title: item.title || 'VehÃ­culo Corporativo',
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
    concept: `Compra combinada de ${createdVehicles.length} vehÃ­culo(s) en la cesta`,
    timestamp: now.toISOString()
  };
  db.transfers.unshift(transfer);
  syncMovimientoToSupabase(txId + '-out', student.id, 'TRANSFER_OUT', grandTotal, now.toISOString(), transfer.concept, transfer).catch(e => console.error(e));

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'BUY_VEHICLES_CART',
    details: `El alumno ${student.name} ha comprado ${createdVehicles.length} vehÃ­culo(s) en cesta por un total de ${grandTotal.toFixed(2)}â‚¬ (IVA incl.)`,
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
    message: `AdquisiciÃ³n en cesta completada exitosamente. ${createdVehicles.length} vehÃ­culo(s) aÃ±adidos a tu flota corporativa.`
  });
});

app.put('/api/student/vehicles/:id/assign-warehouse', (req, res) => {
  const { id } = req.params;
  const { warehouseIndex, propertyId, propertyTitle, warehouseName } = req.body;

  const db = readDb();
  if (!db.purchasedVehicles) db.purchasedVehicles = [];

  const veh = db.purchasedVehicles.find(v => v.id === id);
  if (!veh) return res.status(404).json({ error: 'VehÃ­culo no encontrado' });

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
  if (materialType === 'plastico' || titleLower.includes('plÃ¡st') || titleLower.includes('plast')) {
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
  const { materialType, title, presentation, unitWeightKg, isPallet, pricePerUnit, description, durationDays, stock, sellerId, sellerName, sellerLocation, sellerMunicipality, sellerProvince, isDesTornillo: rawIsDesTornillo, acceptsPromissoryNotes, promissoryTerms } = req.body;
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
        error: `No dispones de existencias en tu almacÃ©n de "${title || 'este producto'}" para poner a la venta. Tu stock actual es de ${availableUnits} unidades.`
      });
    }

    if (requestedStock > availableToLock) {
      return res.status(400).json({
        error: `Stock insuficiente en tu almacÃ©n: intentas poner a la venta ${requestedStock} u., pero de tus ${availableUnits} u. producidas/almacenadas ya tienes ${lockedInOtherAnns} u. comprometidas en otros anuncios. MÃ¡ximo disponible a la venta: ${availableToLock} u.`
      });
    }
    annStockValue = requestedStock;
  }

  const finalAcceptsPromissory = acceptsPromissoryNotes !== undefined ? !!acceptsPromissoryNotes : (isDesTornilloVal || (user && user.level === 3));
  const finalPromissoryTerms = Array.isArray(promissoryTerms) && promissoryTerms.length > 0
    ? promissoryTerms.map(Number).filter(n => [30, 60, 90].includes(n))
    : [30, 60, 90];

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
    isDesTornillo: isDesTornilloVal,
    acceptsPromissoryNotes: finalAcceptsPromissory,
    promissoryTerms: finalPromissoryTerms
  };

  db.rawMaterialAnnouncements.unshift(newAnn);
  await syncRawMaterialAnnouncementToSupabase(newAnn);

  const otherUsers = db.users.filter(u => u.id !== sId);
  otherUsers.forEach(u => {
    addNotification(
      db,
      u.id,
      'Nuevo Anuncio en Mercado',
      `Se ha publicado "${newAnn.title}" en Mercado por ${sName} (${newAnn.pricePerUnit.toFixed(2)} â‚¬/u).`,
      'announcement_new',
      undefined,
      newAnn.id
    );
  });

  writeDb(db);
  res.json({ success: true, announcement: newAnn, message: 'Anuncio publicado con Ã©xito en el Mercado.' });
});

app.put(['/api/raw-materials/announcements/:id', '/api/teacher/raw-materials/announcements/:id'], async (req, res) => {
  const { id } = req.params;
  const { pricePerUnit, title, description, presentation, durationDays, stock, active, isDesTornillo, unitWeightKg, isPallet, materialType, sellerId, sellerName, sellerLevel, sellerLocation, sellerMunicipality, sellerProvince, acceptsPromissoryNotes, promissoryTerms } = req.body;
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
          error: `Stock insuficiente en tu almacÃ©n: intentas configurar el stock a ${requestedStock} u., pero solo dispones de ${availableToLock} u. libres (${availableUnits} u. producidas - ${lockedInOtherAnns} u. en otros anuncios).`
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
  if (acceptsPromissoryNotes !== undefined) ann.acceptsPromissoryNotes = !!acceptsPromissoryNotes;
  if (promissoryTerms !== undefined && Array.isArray(promissoryTerms)) {
    ann.promissoryTerms = promissoryTerms.map(Number).filter(n => [30, 60, 90].includes(n));
  }
  ann.updatedAt = new Date().toISOString();
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
      'ðŸ“‰ Alerta de Demanda: El Des-Tornillo',
      `Feedback sobre tu anuncio "${ann.title}": "${finalMsg}"${numSuggested ? ` (Precio recomendado: mÃ¡x. ${numSuggested.toFixed(2)} â‚¬/u.)` : ''}. Se aconseja ajustar el precio unitario a la baja para activar las ventas.`,
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
      receiverLower.includes('agencia de logÃ­stica') ||
      receiverLower.includes('agencia de logistica') ||
      receiverLower.includes('transporte') ||
      receiverLower.includes('logistica') ||
      receiverLower.includes('logÃ­stica') ||
      conceptLower.includes('servicio exterior') ||
      conceptLower.includes('gasto de transporte') ||
      conceptLower.includes('transporte') ||
      conceptLower.includes('logÃ­stica') ||
      conceptLower.includes('logistica') ||
      conceptLower.includes('envÃ­os el des-tornillo');

    const isEstacionServicio = t.receiverId === 'SUMINISTROS_ESTACION_SERVICIO' ||
      t.receiverId === 'gasolinera-oficial' ||
      receiverLower.includes('estaciÃ³n de servicio') ||
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

    // If transport cost was recorded as base cost (e.g. 100â‚¬) without 21% IVA, adjust it to 121â‚¬
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

    const sellerName = isEstacionServicio ? 'EstaciÃ³n de servicio - suministro de combustible' : 'Agencia de LogÃ­stica y Transportes Express S.A.';
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
      materialTitle: t.concept || (isEstacionServicio ? 'Gasto de suministro - combustible camiÃ³n' : 'Servicio exterior de transporte - traslado de existencias'),
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
        materialTitle: t.concept || (isEstacionServicio ? 'Gasto de suministro - combustible camiÃ³n' : 'Servicio exterior de transporte - traslado de existencias'),
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
    note,
    paymentMethod,
    promissoryDaysTerm
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
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacÃ©n') ||
     (a.propertyTitle || a.title || '').toLowerCase().includes('almacen'))
  );

  let targetNaveId = rawDestinationNaveId;
  if (!targetNaveId && destinationWarehouseIndex !== undefined && buyerNaves[destinationWarehouseIndex]) {
    targetNaveId = buyerNaves[destinationWarehouseIndex].id;
  }

  if (!isTeacher && buyerNaves.length > 1 && !targetNaveId) {
    return res.status(400).json({
      error: 'Tienes mÃ¡s de un inmueble con almacÃ©n. Debes especificar a quÃ© inmueble deben entregarse las materias primas.'
    });
  }

  const selectedNave = buyerNaves.find(n => String(n.id) === String(targetNaveId)) || buyerNaves[0];
  const finalDestinationNaveId = selectedNave ? selectedNave.id : (targetNaveId || 'default_nave');
  const deliveryAddressStr = selectedNave
    ? `${selectedNave.propertyTitle || selectedNave.title || 'AlmacÃ©n'}, ${selectedNave.location || selectedNave.direccion || 'PolÃ­gono Industrial'}`
    : 'PolÃ­gono Industrial San Fernando, Av. de la Industria 14, San Fernando de Henares';

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
    return res.status(400).json({ error: 'No se ha especificado ningÃºn producto para la compra.' });
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
          error: `Stock insuficiente en el almacÃ©n del vendedor (${sellerName}). Dispone de ${availableUnits} unidades de producto terminado, pero solicitas ${requestedUnits} unidades.`
        });
      }
    }
  }

  // --- EL DES-TORNILLO RESTRICTION ENFORCEMENT ---
  if (primaryAnn.isDesTornillo) {
    const isTeacherBuyer = isTeacher || buyer.username === 'pupdaniel' || buyer.role === 'teacher' || buyer.id === 'profesor-1';
    if (!isTeacherBuyer) {
      return res.status(400).json({
        error: 'RestricciÃ³n de El Des-Tornillo: Solo el Profesor (cuenta "pupdaniel") puede realizar compras de los anuncios publicados en la secciÃ³n El Des-Tornillo.'
      });
    }
  }

  // --- LEVEL RESTRICTION ENFORCEMENT ---
  if (!isTeacher) {
    if (buyerLevel === 1) {
      if (sellerLevel !== 'official' && sellerId !== 'proveedor-materia-prima' && sellerLevel !== 1) {
        return res.status(400).json({
          error: 'RestricciÃ³n de Nivel: Los alumnos de Nivel 1 solo pueden comprar a Suministros Industriales S.A. (Proveedor Oficial) o a otros alumnos de Nivel 1.'
        });
      }
    } else if (buyerLevel === 2) {
      if (sellerLevel !== 1) {
        return res.status(400).json({
          error: 'RestricciÃ³n de Nivel en Mercado: Los alumnos de Nivel 2 solo pueden realizar solicitudes de compra a alumnos de Nivel 1.'
        });
      }
    } else if (buyerLevel === 3) {
      if (sellerLevel !== 2) {
        return res.status(400).json({
          error: 'RestricciÃ³n de Nivel en Mercado: Los alumnos de Nivel 3 solo pueden realizar solicitudes de compra a alumnos de Nivel 2.'
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
        error: 'Requisito de LogÃ­stica: Para acordar la recogida por el comprador se requiere disponer de un camiÃ³n trÃ¡iler en la flota y un empleado contratado con el puesto de Camionero.'
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
        title.includes('almacÃ©n')
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
        const isLogisticsWarehouse = pType.includes('almacen') || pType.includes('almacÃ©n');
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
      const naveName = selectedNave ? (selectedNave.propertyTitle || selectedNave.title || 'AlmacÃ©n') : 'AlmacÃ©n';
      return res.status(400).json({
        error: `Requisito no cumplido: El inmueble/almacÃ©n de destino "${naveName}" no tiene ninguna carretilla elevadora contrapesada asignada. Debes adquirir y/o asignar una carretilla elevadora a esta propiedad desde la GestiÃ³n de Flotas / Concesionario para poder recibir materias primas o compras en ella.`
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
        error: `Exceso de capacidad en almacÃ©n: Tienes ${totalStorageM2} mÂ² de zona de almacÃ©n (${maxTotalPalletsAllowed} palets de capacidad mÃ¡xima). Tu stock actual ocupa ${currentTotalStockPallets.toFixed(2)} palets y el pedido suma ${totalRequestedPallets.toFixed(2)} palets, superando la capacidad mÃ¡xima de ${maxTotalPalletsAllowed} palets (espacio libre actual: ${freePallets.toFixed(2)} palets).`
      });
    }
  }

  const discountPercentage = Math.min(50, Math.max(0, Number(rawDiscount) || 0));
  const discountAmount = Math.round((basePrice * (discountPercentage / 100)) * 100) / 100;
  const taxableBase = basePrice - discountAmount;
  const insuranceFee = Math.max(0, Number(rawInsuranceFee) || 0);

  // Unified Transport Calculation: 0.38 â‚¬ / pallet / km (range 0.35 - 0.40 â‚¬/palet/km)
  // Partial pallets are charged as full pallets (Math.ceil)
  const chargedPallets = totalRequestedPallets > 0 ? Math.max(1, Math.ceil(totalRequestedPallets)) : 0;
  const buyerLoc = selectedNave || buyer;
  const sellerLoc = (db.acquisitions || []).find(a => String(a.studentId) === String(sellerId)) || primaryAnn.sellerName || primaryAnn.sellerId || 'AlmacÃ©n Central Oficial';
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
        error: `Saldo insuficiente en tu cuenta bancaria (${buyer.balance.toFixed(2)} â‚¬ disponible) para realizar esta compra por importe de ${totalAmount.toFixed(2)} â‚¬.`
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
    status: (isTeacherBuyer && isStudentSeller) ? 'facturado' : (isAutoApproved ? 'entregado' : 'pendiente'),
    invoiceNumber: (isAutoApproved || (isTeacherBuyer && isStudentSeller)) ? `FACT-2026-${Math.floor(1000 + Math.random() * 9000)}` : undefined,
    invoicedAt: (isAutoApproved || (isTeacherBuyer && isStudentSeller)) ? now.toISOString() : undefined,
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
        const isPayingByPromissory = paymentMethod === 'pagare' || (promissoryDaysTerm !== undefined && [30, 60, 90].includes(Number(promissoryDaysTerm)));
        const promissoryDays = Number(promissoryDaysTerm) === 60 ? 60 : Number(promissoryDaysTerm) === 90 ? 90 : 30;

        if (isPayingByPromissory) {
          // 1. Payment via Promissory Note (PagarÃ© a 30/60/90 dÃ­as)
          const dueDate = new Date(now.getTime() + promissoryDays * 24 * 60 * 60 * 1000);
          const dueDateStr = dueDate.toISOString();
          const promissoryNum = `PAG-${now.getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
          const signatureHash = `FIRM-DIGITAL-PROFESOR-ART94-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

          const promissoryId = generateId('pn');
          const promissoryData: PromissoryNoteData = {
            id: promissoryId,
            promissoryNoteNumber: promissoryNum,
            concept: `Factura ${order.invoiceNumber || 'FACT-2026'} - Compra El Des-Tornillo (${totalUnits} u. ${summaryTitle})`,
            amount: totalAmount,
            amountInWords: numberToSpanishWords(totalAmount),
            issueDate: now.toISOString(),
            issuePlace: 'Madrid',
            dueDate: dueDateStr,
            daysTerm: promissoryDays,
            orderType: 'no_a_la_orden',
            beneficiaryId: sellerUser.id,
            beneficiaryName: sellerUser.name,
            beneficiaryNifCif: sellerUser.username ? `${sellerUser.username.toUpperCase()}-ES` : `ES-${sellerUser.id}`,
            beneficiaryLevel: sellerUser.level || 3,
            issuerId: buyer.id,
            issuerName: 'BricoMaster Distribuciones, S.A.',
            issuerNifCif: 'A-28900455',
            issuerAddress: 'PolÃ­gono Industrial de San Fernando de Henares, Madrid',
            issuerLevel: 1,
            bankName: 'Banco Central Mercantil S.A.',
            bankIban: buyer.accountNumber || 'ES990001000988776655',
            signatureTimestamp: now.toISOString(),
            signatureHash,
            status: 'pendiente'
          };

          order.paymentMethod = 'pagare';
          order.promissoryDaysTerm = promissoryDays;
          order.promissoryDueDate = dueDateStr;
          order.promissoryNoteNumber = promissoryNum;
          order.promissoryNoteData = promissoryData;

          const promissoryMsg: MarketMessage = {
            id: generateId('msg'),
            chatId: [buyer.id, sellerUser.id].sort().join('_'),
            senderId: buyer.id,
            senderName: 'BricoMaster Distribuciones, S.A. (Profesor)',
            recipientId: sellerUser.id,
            recipientName: sellerUser.name,
            content: `ðŸ“‘ PAGARÃ‰ EMITIDO POR COMPRA EN MERCADO: El Profesor ha emitido a tu favor el pagarÃ© cambiario oficial ${promissoryNum} por importe de ${formatNumber(totalAmount)} â‚¬ con vencimiento a ${promissoryDays} dÃ­as (${dueDate.toLocaleDateString('es-ES')}) vinculado a la Factura ${order.invoiceNumber}. Puedes gestionarlo en tu cartera de efectos o descontarlo en el banco para anticipar liquidez.`,
            timestamp: now.toISOString(),
            read: false,
            type: 'promissory_note',
            promissoryNoteData: promissoryData
          };
          if (!db.marketMessages) db.marketMessages = [];
          db.marketMessages.push(promissoryMsg);
          syncMarketMessageToSupabase(promissoryMsg).catch(e => console.error(e));
        } else {
          // 1. Payment via immediate bank transfer (Contado)
          order.paymentMethod = 'contado';
          sellerUser.balance = Math.round((sellerUser.balance + totalAmount) * 100) / 100;
          syncAccountToSupabase(sellerUser.id, sellerUser.name, sellerUser.balance, sellerUser.username, sellerUser.password, sellerUser.accountNumber, sellerUser.role).catch(e => console.error(e));

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
        }

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
          transportConcept = `Suministro de Gasolina / Combustible - EnvÃ­os El Des-Tornillo (${totalUnits} u.)`;
          transportNote = `Se han descontado ${transportExpense.toFixed(2)} â‚¬ por suministro de gasolina (al disponer de camiÃ³n y camionero en plantilla).`;
        } else {
          baseTransportFee = transportCost;
          ivaTransportFee = Math.round((baseTransportFee * 0.21) * 100) / 100;
          transportExpense = Math.round((baseTransportFee + ivaTransportFee) * 100) / 100;
          transportConcept = `Gasto de Transporte y LogÃ­stica Externa - EnvÃ­os El Des-Tornillo (${totalUnits} u.)`;
          transportNote = `Se han descontado ${transportExpense.toFixed(2)} â‚¬ (${baseTransportFee.toFixed(2)} â‚¬ base + ${ivaTransportFee.toFixed(2)} â‚¬ IVA 21%) por servicio de transporte y logÃ­stica externa.`;
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
            receiverName: sellerHasTruck && sellerHasDriver ? 'Suministros de Gasolina y Combustible S.A.' : 'Agencia de LogÃ­stica y Transportes Express S.A.',
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
            sellerName: sellerHasTruck && sellerHasDriver ? 'EstaciÃ³n de servicio - suministro de combustible' : 'Agencia de LogÃ­stica y Transportes Express S.A.',
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
            deliveryAddress: deliveryAddressStr || 'DirecciÃ³n comercial registrada',
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
              authorName: sellerHasTruck && sellerHasDriver ? 'EstaciÃ³n de servicio - suministro de combustible' : 'Agencia de LogÃ­stica y Transportes Express S.A.',
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

        if (isPayingByPromissory) {
          const dueDate = new Date(now.getTime() + promissoryDays * 24 * 60 * 60 * 1000);
          addNotification(
            db,
            sellerUser.id,
            `Â¡Venta en El Des-Tornillo con PagarÃ© a ${promissoryDays} dÃ­as!`,
            `El Profesor ha comprado ${totalUnits} u. de "${summaryTitle}" por ${totalAmount.toFixed(2)} â‚¬ emitiendo a tu favor el PagarÃ© Oficial ${order.promissoryNoteNumber} (vencimiento: ${dueDate.toLocaleDateString('es-ES')}). ${transportNote}`,
            'order_approved',
            order.id
          );
        } else {
          addNotification(
            db,
            sellerUser.id,
            'Â¡Venta en El Des-Tornillo!',
            `El Profesor ha comprado ${totalUnits} u. de "${summaryTitle}" por ${totalAmount.toFixed(2)} â‚¬. ${transportNote}`,
            'order_approved',
            order.id
          );
        }
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
      `Tu compra de "${summaryTitle}" por ${totalAmount.toFixed(2)} â‚¬ ha sido aprobada y entregada de forma inmediata a tu almacÃ©n.`,
      'order_approved',
      order.id
    );

    db.systemLogs.unshift({
      id: generateId('log'),
      action: 'COMPRA_MERCADO_DIRECTA',
      details: `${buyerName} ha comprado y recibido directamente "${summaryTitle}" de ${sellerName} por ${totalAmount.toFixed(2)} â‚¬.`,
      timestamp: now.toISOString(),
      studentId: buyer.id,
      studentName: buyerName
    });

    writeDb(db);

    return res.json({
      success: true,
      order,
      message: `Â¡Compra realizada con Ã©xito! Se han descontado ${totalAmount.toFixed(2)} â‚¬ de tu cuenta y la materia prima ha sido entregada de forma inmediata a tu almacÃ©n.`
    });
  }

  addNotification(
    db,
    sellerId,
    'Nueva solicitud de compra',
    `${buyerName} ha enviado una solicitud de compra para "${summaryTitle}" por un importe total de ${totalAmount.toFixed(2)} â‚¬.`,
    'order_received',
    order.id
  );

  db.systemLogs.unshift({
    id: generateId('log'),
    action: 'SOLICITUD_COMPRA_MERCADO',
    details: `${buyerName} ha solicitado una compra a ${sellerName} (${summaryTitle}) por ${totalAmount.toFixed(2)} â‚¬.`,
    timestamp: now.toISOString(),
    studentId: buyer.id,
    studentName: buyerName
  });

  writeDb(db);

  res.json({
    success: true,
    order,
    message: `Solicitud de compra enviada con Ã©xito. Pendiente de revisiÃ³n por ${sellerName}.`
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
        error: 'Requisito de LogÃ­stica: Para acordar la recogida por el comprador se requiere disponer de un camiÃ³n trÃ¡iler en la flota y un empleado contratado como Camionero.'
      });
    }
  }

  const newBasePrice = Math.round((newPricePerUnit * newQty) * 100) / 100;
  const newDiscountAmount = Math.round((newBasePrice * (newDiscount / 100)) * 100) / 100;
  const taxableBase = newBasePrice - newDiscountAmount;

  // Unified Transport Calculation: 0.38 â‚¬ / pallet / km (range 0.35 - 0.40 â‚¬/palet/km)
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
    `${authorName} ha enviado una contraoferta para "${order.materialTitle}" por un total de ${newTotalAmount.toFixed(2)} â‚¬.`,
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
    return res.status(400).json({ error: `La solicitud ya estÃ¡ aprobada.` });
  }

  const buyer = db.users.find(u => u.id === order.studentId);
  if (!buyer) return res.status(404).json({ error: 'Comprador no encontrado' });

  const buyerIsTeacher = buyer.role === 'teacher' || buyer.id === 'profesor-1';
  const buyerDisplayName = buyerIsTeacher ? 'BricoMaster Distribuciones, S.A.' : buyer.name;

  if (buyer.balance < order.totalAmount) {
    return res.status(400).json({
      error: `El comprador ${buyerDisplayName} no dispone de saldo suficiente (${buyer.balance.toFixed(2)} â‚¬) para cubrir el coste de ${order.totalAmount.toFixed(2)} â‚¬.`
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
      transportConcept = `Suministro de Gasolina / Combustible - EnvÃ­os El Des-Tornillo (${order.quantity} u.)`;
    } else {
      baseTransportFee = order.transportCost || 0;
      ivaTransportFee = Math.round((baseTransportFee * 0.21) * 100) / 100;
      transportExpense = Math.round((baseTransportFee + ivaTransportFee) * 100) / 100;
      transportConcept = `Gasto de Transporte y LogÃ­stica Externa - EnvÃ­os El Des-Tornillo (${order.quantity} u.)`;
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
        receiverName: sellerHasTruck && sellerHasDriver ? 'Suministros de Gasolina y Combustible S.A.' : 'Agencia de LogÃ­stica y Transportes Express S.A.',
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
        sellerName: sellerHasTruck && sellerHasDriver ? 'EstaciÃ³n de servicio - suministro de combustible' : 'Agencia de LogÃ­stica y Transportes Express S.A.',
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
        deliveryAddress: order.deliveryAddress || 'DirecciÃ³n comercial registrada',
        status: 'facturado',
        invoiceNumber: `FACT-2026-${Math.floor(1000 + Math.randomxœì}ÛrG’è»¾¢<¡u’òegÀá0h’²/APÞP(È"ºH¶Õè†»”¸¾lììløic"vžöý¼èOÎœO8™u¯êj A‘ÍXž
]×¬¬¼Ö%«Ó%_?¬­­uoÏVù_Á~ž±²bñv5 {CviÅ:Ý~•G‡£ªH²ËN×§Ói‘_·-³4¹fEÛâIv'ãÖ¥+6)äå;àeY>ËÆlÂ²jÈYUÐ¬ìAÃ½Çïª·'ø5Í‹ÊÆ !è§Hhzr3eR²4eÅ÷´<)fã×äóÏMÊnÃ![$ç“óYY%ç)‹È€D•j™EÁ–“*…¦u©€œVvÑjq‘Ÿg4ƒb7²n'Ï²¤:* qrNK¦ùŒ1»X9;¯òŠ¦óKñ";yYÕ‹éR·¯L”–ÕÉ¬È^”¬@Œ\õ“ØÉØe^%´Jòìû¤¬òâÆ›µê]²Œ€­aÜ‰ BÔµ¢³ê*·š_09£ûÃƒáèäøptº7:ÙÞœŽöŽÂ/>]Ï¿ƒüáÎöéÞ¿žì£ztÒ–öÊŠŽ“÷ÿ›ÉC~qŒ“œô ç“$ƒ19føD³ƒ'³žç—ïÿYcJnˆF:+ÉÞÛiÁÊ’ŒúÛýÈ¥—	ð-LÛð
iŒø‡N§Èñô ƒÞÓ¨‰M‘¼ŽXñHm>ýÄI9¬ ð˜^
×ìIVÎ î˜AE/Ë¢}¤¿pÞ>ƒ¹Jˆ®Y³8/NYväQˆ·'‡ÅQ€J–•´Y^gÏ ; Rä„Ç‚·gåËŸ·ä¯ä‚t>‹Ïû}³/¹ý°ˆYQvI(•l’—¯6dÝPþ,+¯’‹ª£Á
±È³»ªjy“½º'ùh6¥8;•ûcZ¯:Œlþ	ˆ1+ó”õYQäE‡ueË·ðÿðó+@Ð€ØØ†Î9ŸÝ°â9»f)àý”ýå/dÝKJJÄ@t•`¿Ñ
‰&¬BÂDQ’Œy"›æo“èU?ÉÆé,fe'Çš}[Pw¡#±Ìãê ÙÓúì—ù„uîò]&nwÝ®=¨çë0,5p‰…ÍM²Ž Ô‡¼a*UâÍ.½AZP-m‘59–Œ±¸Ô†mÊÅžäOäKDô¼±§,»¬® ä:À<…Öù D)ÕÌ…!Ž-Ø%s.Ÿ(ÈŠsü0•ŒþG²Èß¸Ë!?È»DHyQÕ2šêÞê~@@%ˆþx×Å—¾æÒ¼3®ZgÄš˜yÉª§ñÄ¡/ÈÓ¯àÏ7kêÏ:P>ä†0²kèx|ÅÆ¯·³x‡¦ãY
}y<ã¸Ÿ¯hü™¡™Â‡¾€Ÿóvü‹­ ÇC³ e­ê ×ŠdÒ´Ú¢†ä4~¦¨Ñ×ß]Ò”£Å[SþtV^u]ÌÑûFãÏ¸aÄ.àW–…­£e™-èíãGÙ¿H²¸3ÃñÍ 
gNQª»ÅQ ÜMJ7Ø’…Ÿ&:³•­OK¥_)ªd‘nªËÁ"×Õ«¢N7çÈj°NHÃJ«åà(¥uõ®VšUÔÓÃ¢¬“è•S:Ù+)’±á°²vÔ´¬k’D¡¡£Qž‚±C$~ÑNÊ§@:ÂìºÈ‹	M“ƒŒ‰ âû`*ÍÛÕ[ ±M‡`«·‘¥ø¸/X1ÜWu†Ò±¾S‰ÈàÄí’´H$¦CQb{<8Õ©ø<˜MÎY!ÊlÌPˆõ¤£U0RÄe8NGOª¸â„Fneˆ]ý@2N4ÒvmI†YF-â—9fªjFCíþ€þ'ŠÐ?üþ÷ÿüÏß|óõ×²0Oca‰©¶“O¦`©í‰“À\óLt£”{7mq#ŽÛ`jâ<ÛëBš[HEûùu2IP®ÚFRÄõòY­˜É$ÑÉñöÁèÙÞñéá‹“h%0ª€ÑôÓ—£5)-h”ÆñˆÚð ¸ž¢â\àÁ%3KßKÎ |úqÆ’ó8•¿D´ÍXNui‡n‘³“)5{
7kN)üù]x~~'Míbà÷³ä-‹;O»·äÿþûÿ+JÊ$ÎÛcE°¶€„/X	¿oˆ2Z(È¸	‹AÝPôÿ¡¤ššNèøý_3ÒÙ{Ë=®²ÛW6ýà×†ÿÆFi_jÄ:UÖ•Ä´Ò1|¥ì±³6útÊg ê9\™dAr1C¼FUjô#ê=ítŽÔŒ,')%×¼0`´‹pèKºÛ¶¸íëEœ0úrJ×X¾¼R˜€×mx>l“¤¹±I”Šß>:>üvûøttø|¸3<y±{º¿w¼³½{(;ŽÁ¿HÒHëÐh(M œ\ƒã¾Ñ£6âV`£xêö[ˆC©_”MZSM"#¬›ŒÂ}S€ï±{f˜ø.XÙÿ©úÈ-gã1+KôÉgÌ¢qñ€+¹5ãK˜€öï“ç´TËk¥_%`&¸M‹„²&R#ÀÒ‡Ù$Ëû‘¡9™KÞÿõmRå}²—]¿ÿtÁ}ÞL›í4Ü’øýßhG
ÄÇPg
¶S'Z¥ÓdÅ›i¹ÊÑP®’xµ`?±1ê“NÁ~^AvQì¿ÓvÆ; Rr¶ä÷QJMÊ+SÔJ=fP¿¢¬cUã<oLùøœ'ÓfÍ²üï° !ÚË¥‹\ÚàFyŽ£É•QžÄÚkîF ©fEÆiGø¨¯Ö¾êJ:"\í9a†s ½ƒ¶DÝ%IÑsr#PnWôß”7‹ýyˆr½U/“#ÉIÑÒ¤y¡ä#ô¡"¥7{ë‘]êƒü¨èH6¡e¾–öÌ}ržîÏy²%šÂ0EËÙ§qìë %ÛA4`"n•»?wj®©ê­HóÈ0»€DÃÙszëMYeºµ>Ù®ó&´Œ’ŒLx	=ž'ê~Ì\3*}dþÚ(lBb£×lmx–†´2Œ…ÂB?2ºzu•ôz=r¼ý/d7ˆ¶ŸÈðàÇ½ƒ“Ãã?“Ï	X€»/vN†‡dÿpwììNFXOèúKVu^†t}¢èpÙy^þê@óAô*d¤¬2&›câËÄ˜ñóì+l£’‹án£5 U˜Ó–Õ’éDè˜¬@f6KSM°¢‡‹¤(«‘(&Ì„ºž)@fˆd{‘Üœ°Çê4´å|¢¢8ªN-./³Jë®ÏŠškÔR;Ö—ud±­V²w±¬5ð§\“1ÒÊª=Ø‹‚^¢uœ—§b“äôõ%¯ÔOŠ<ûáÒÒnNa¾¢Ëò/¯ð¥OUžª]X&ÔŠ_r3=?å»1º4ÿ’eyÑ[eàŒ±ø»<­ñ\Ó"I¡ƒÓ)hBz
ÖGpPÙ³¬3ªhqÕÐz(ÉÖ–“9„q;™D¯mGæ5üh©±á}DR¸å˜¡q—aë õYz0¤ŠÑ¸`ob¾÷ìv‚³Ì\Ô‡5Š€¾±>Åó{Ðø‘”Ä;¸_Ì²4|o˜°?Æ9ô÷ƒk™‘YûyÌD³µd®~i¥ª§ÃïÃ›­†[»·ÐVoªaêM ¨¹®±ÿ–­ù®®Z
»Œk5—Ñ¨V’ü<M.)ÌXÔ|:ðîJ#<›bL\ÁqÎ‹pCþX3¥·S¡™Œ^3¥HÄ˜vyA:Ò…qåäð§þkvS+vµ˜ä¾„F^AÅ>2ðIE~R‘ŸTä'ù÷©"H)J?rûø‡½²s¸´}ðgtŸŸïÀ<9ÞÞ|GŽ¶OöŽ=÷Q¨Ò	-^³j6hvƒzô"IY9G†Ý8É²#Ù_ÑõÒäê£ô.ASŸÎ¸Ã‘K|KçÌPã(Q¯4vrâp¥# „8¤5ÅLû®‰ÃRX¢Oÿ€ì8èvÞ?ü•Xê=~‡Øç}­=Ž™sNUÂ%—B¹Ò±2—ã"™Š…Ê³½	žÊÄGµ÷MnÈ÷¤³*IqK€¥â;Æc 	CPÌ9¤4¿Ì_@òÑUUMËÁêê8Îz	Ž·7Í.9à¢nõëõ§«_ù{ñg}ý«>”°N?ò~Ó•ÉœMcºà¬·,{kQô'Œ/?#‚ÓˆîŒXŠœ—lqôØÔ†JÚ5/¬Tîk?ôƒÍ7Y±aÖkkºZ4³¢æøÞMY~€¿HâvVìÒÖË¶Ý—yQÎ@åÎ®Œ†íÎr1/àö‰‘ (=á¤(E…lR[Ã®ÔÐ•Ÿz‹Ò¾À(åá:K­‰a}poL3¬f}En®dæÒ9]«rÛr³äå…œ|R«dzú6Ø›Î pZ¯ýÿbçj•7L“jœ›zÄ~S*}àT°š°ðN6âíNä¹dqV–:¤,ËkL:{xáª÷ ëá5OvIz˜p¥TÍ>@F@{SZTðö)%÷ù„ ëÂ2I/
/Zbýî‹5uÁÃn’ÞÈtkì€P ãÊ®¡’ÓK]/ÇÂÔáèŽDÂËWÞ¶3(Þ8Á9Ä{(¥+áRðæ,÷™ÙÂä=ùæŒÛ”»z”'ŒŽ¯¸µMœJ¤ò5p-Hýh}ujÞ´þ~q!®cà9p[{KíˆR'J²„Q±N:Ïèy‘ åÁÔþWžáY‡²+»G²e_ÆœrZ;RÛMäPÀAVÉ>½É‹d=ù:È÷Á…1J­,d…°õR} þiCóØ§°,+éäœýÝù­~9·Õ/IgÏ"&ç3±É9ÑpÃ’LüÖ]<²¦bb(µF½Šr”m‚Ô™ôÕáMk+ÛIOÏMÏxå»/~%$pA–¼Ç.ØÅEÕéÐrÎÙWË%Ú×[ê]ëäzÏ”8–ènØCŸeÈÓ;¸YÜvôKŽƒÛû˜IåÆ¼’à€‹ûå%.Š©žõÅ…5à•úÒÏî‘õWxŒ–¦ƒ@k(KÄæ’ÉC‚’=Yë_&±_ÝL%+ËKˆQ×ò(ÜfÏþßý÷ÿ!êÎ›$U"öÓUc²	˜
º¥>Äé\¡ÝoÏ”ÁkÑ{“¤*¸9Åüùýç#zI‹÷5~ˆ“iì Ú ¹is!lêY5?)ºVÕÆBÄÛ´¦¤¾°á”QÅùl¬’KNã¾l¦ÆcnI™µâ6I2T*Æ>T#¬AÛ;ÌN!¶¦ÒÕo³îòtü×7æ¸ø_ñå™6*iöíìæLÍ>³×*yÎˆ¥éIÈ@õè¥Z®;ÃÙ|tbNå(ÜÒ³©¥‡d°@}I›Œ]Ì‘nu¡&Kýê8aq‰.Á˜½ý96‘œ°ÅNïIÙCs6AºíÀi9í‰]ðÏtÉ¶›¬{cõ¡]·rïvû	¥a;–[Šá¬a×¸Îl.ëY§eËÆ’ðÚlhŸn“%Ìí`9q.ááÒŽFç)‚kí,yãòAA,Ï#àÍ »”å	¨’-><w`ý+,5,2îïFÛßíVð¼Êáp‡/3îG#<»rpx²7o™QéÙU!?züPÜGäK,e½H³e¡}bL“y˜·;ï‹)$ÞÞkÙåMêC úQ#™Ó¯ƒíeLdOšx5yÒh,®} c¥¨\hXŸ Ë8ÑÈ4+àm¨NË9ñí,{ÚÒEél#]&íTìáõT™¿Ìrª¦†ê·¼Ó7áVˆ…,!âÐž h¯ËžæK"ž!Û°¤ªH	µµÕºBzËuVÕÊ!Á3Ö­¿o›ÙO$‹ö­ÀÊN­zºóUíz¨p1K.êZ§à'åå€84ë\´U9Uj||E¹Î~$‡W‚·¦<É:Ñ©ª¥[_*dG;‹±6q¹	¢‚þ´êŒ•+Ø³­co „Ü5yˆîãa{{[©ku†Èö_RR«£zOßcAˆ-ìŠTÈŠån]¹rKæÏÜŽl’RPæŽm4ˆž’Y[ñ³ŠÄÐ›ÐlFÓžòíï&’ÄL\aE_$ÇíYk+îÑ‘ä\à)ü(rÛë8¡ØXJ`”®Ä(õí}¦ÊZÙ$gÏ¶wNzû{Ç½ÇïöiuÕ¿Hs ¼0¼¶FžžèŒóIGE³âñ¬Ìˆë÷pl#ªdñÇÊØ$4F÷òU(|Úé$B³Nr!@eJúü‡ºë‚çêWTÄ(:‰¾qÒµ6k¬MºœNëZ'|L”&1X ®¸ÓihqÐij¯+¢UtÉ*þƒÀ	a‚£ÉÎÈ¦°EðXSã1:çüZ9¯`ðY0˜ÖW¯@—¦ýŠ¾¥ç)ûÄ ´ÎÇ2¡o;À ö¸\(z
7.saP™áp˜•n³Y×¸Ó5­Ž( ž§ëNªfb6{ _µþÓu§Yk¤æÖÛ‚ÓÄÓO×kÈg.¼›Ô&”Q
PJG}ØA ô¥yùƒ“¯Z¶ç¸LhÂ?ÉhjXéj†¤3Ãr/U©ÛH³ØxG*<¹M·¯BSn–“¬?ìûPµR 1grM áB¬¼>£
«AÝÐØ"ó¹Xï“¹þö-¿D‹ãCµÍ³š-sÈÎ÷ÛÂDñ…˜q´×ÀMä”¦­\«M,ÒÏäú<¿.1›ØázüÎáqÕ:™ðÈk‚VpCíñ;~­½RTjhH^ñï 'jå—ÈrOÈðÇm=ÿT+kDÃ²¶L½‹Q³-?ZCðÑ‚‹u6Ñ²LÅ­ÀsWH•êjàãwMÝ’ŠÇ((œ ô•@;å)˜$®	n™+­¸"þŽÖpr™õŒ¯ÐãKsÌá ÏÖØ’Z5ž!•1Kº¥tl˜Ó„´äÚ#«I¡F³×Cøc¾Ì¦o§8H.d&È#>aàë$HÐŽ)ýµ¥ÁNÓFˆ¤L11VT¶zÐÑå¸Ò4µþ¸‰&ã2k#CÉ Öõû_Ò$¸"Ð@0¸û>ÀÑöw`þË¨lÏfiúgF‹N÷6à4¹Ü#hèH¸ËGuwyÓ|ªÁeÓaÀVcšzw’‹ùBìŸ!õ´˜2çT-o0,h6FáÝ»I6v
•IS‰<Ìþx¸THû)Í’òŠ§ZdfaI  Êúå4M@bDÝ—k¯A2P?8±¶©h„ÎÀúÍmß}‰ºU´ŽåMù<c¥±qÓYó“WËòSzšÒSLÍ"W ô/~AVÌt d—yý‹7ý-˜¸9ÙÁ€& }öõc+ÐÊt`ÒÂÞÓm2gUÑïiy…× ‡ßô"Ÿ ¦¬öå7]ôïÄÞBçé
8,:RŒ4/§0"$ý6¬ÊÿüÛª¼Á‹Ç"L
Î“8€aÌ‰,q­Šº=a8G˜Ð9FRËøclF°Äí‡›‰þ“¦õÅÙj”qgÄj<?l{DoÐä:ÔI„µLt§ŸgI™`q¾Ü¨¬û¾OhIª^fEu#cŸµ¤Ejh®^åpŠq©TÇ»“³Š-³h®¿³|md|CSÿ‚@êÉ6‘Ôsud.3·šdL1; ‰)wÿÎ†?]ÒéÈœ+jM\5“s·¤¸¦©šð¹"¢ócÅÃn(ÁÐ}($ÈwóDÆyš2<žÓÞQ¡Rp,¤éFš-Öï¾ÎO+†Ž€+ HW@Ã‹Ü5iëšp±kt!&Á}Ëmé)z^´¥7EéîPÁ5Ítœ-~n‘ŠÒxâ>Ã¸13 /<+”Ä–Ü€Ý+A6)ž¹¡:ìÌ8?G€	øñ	î˜ò´ŒàÉbp–
L±wep^b·<;Å¦òèÃÀ*ñ8óxÆÍ4}ŽÇ†ã½È—xOhßÑ¡ë“½”Àä€Š÷¿`@®|òþ|@…±,g¶Ð_0.¼wg„â”ÂµiPÞlã@÷CÄBoºÖ ­r¤ÄqyFÌÉáÁ˜ïZ¼¾ mG*8‡ñ¡m'Ó:…&€F¾²JÜi<ì¢·ô‡‘á} ¦Öê¹†™ƒÜ?§).€“?Zuõí&C$cSðä†Ê“Ò÷X½þâœ	ä7Çl·0ÜUëy¹ËfÇÿsÌ¡-v:ÉDŽ€¼ïXijbƒåÍÁo€Ìœ´1œ«4^æ›í^O6×¢Ø\¡Y‡ŒµLVóÅ °ÚEÕ‹<CšÒ¥÷Œ1.\"0@1oË¸V„E4X-	 ß+Œ±#ßã]A)g¢ª"Èó
P8NJ¼mÂŸ=¡)Ö™á¸PnõÉÑŒÁŒ¢¥”RP– ä~šÅÜêá‚Í¼gÒ÷K›)2ê×=œ6¨;‹7,¼–C9!*EKÌÔGP± "š°<_v 'B]¦v·Ý¼žÃðþ¶¤M\áÖB%žÌiSË¨‡ˆ.†ŠnÈÍÎÓñÄEö‚èç!NsœÛ%œe7z¹],Ð§v³4½e¦h‡+°ømg>f5‡`//v÷µ£¾8¬¹£!,ý²Ù,õ€ ÑdŽBÔüs‚Áy—ys4ÏzçÑÇ¬v<¥ãªGc"kWKhP°¦•nUèNIÊömUÅz6«¹r¨Ý›#õ¦=¾«sYHLµë¬1ÿŠÏíV þáA´b3çýàoÿH€A¹ÿHÀC÷0gôB+Y:ÓZw48Zš.ÊÑ[!¸G\¹ÒqÁâ¤â]<icÝ(ƒ¬ïoÁBThQì>jŽqæ/i¨/ŸÖ4þÁ×4ÔÛ6ëŽç=-ØuB¥á\ÒùÈr’Ç¸Ý\|««„Ï·ðˆÕÒ´• ÊT»\rq{_8p‘éÞô°ø²jÑ›ò˜Mh’„µÏ(®Ë3Š` ¦Ýö*á{ÎÎc`O¿êvÝ¡L’Œ§lòßÈBTÈóˆßÔs†¸ÅJÿL¡êâÒqÚgy²3®Uòå7kÝº“0–—r'Hÿ¨Y ²ÖÿºÊŽ.å É;ËiAæ5+`k<–™±àLÝ`¯Ž“^ ¶€ÓrgOˆ-:ªùŽPÄ—Õzc±×Õý¡V›Á®íÖjÿE›Äª —t¶oÆ]#µLjûHß5˜
·¤s È¥v¸N’‘Ø*Y!’†0TÏ+é“™ª²ƒýáns‹Å¾{|Ê÷Õ,#½¦¤Ü•pøþT¬Óç:lª˜zeÑ!^)(ìO¯„%¹ü$¯äŽ/~\ÁÑXÚjÙ$z¥x‘œ8c®@$½y¥^êß™K£é#s|¯¡Ó ½½9>‡áô©/1˜I€t|ÀªÐ	Í¥)©dà_~Ð@-*;ü¢/}Ú÷Óåª¥\KnïyÈe[™f„vâ'7ä7ä†¸›™é§8[²[o'ö·â ´·÷Çaúë&z­¿¶öuÍb¾³IÛ³ øUmÚ]é<s´*ýgNçÛ”¶´¡]C¶z»´ÑŽV6íØècûÑRa@*£V<cY?ÐÊÔ}@ÓÒ•"ÚºÜÑêe_k—àº½Sb®Åi*ÔŒ@NûsŠ9vb­ÜÇnÑÙÆ6švbEØ"¨ßšq7ÿMß¸d„NS|GŠÖ}³±ç“}ˆÕ§›²2xÇ¼5:9Üù¨Y”QvøeýÀÁ¨ÊÇ¯ùÁñMmýCùºÑÓ#™î‡>¬ò¤Ý.g‹	Ô—~E@%È‡€¹]Ì2Î2âÖ§†ŒßÊýÝÔûP`èÊ£¥õal”žókŽ"þ¿é¬¾À`46ækuéšÁð ùóü+vìà«H&B@HµþÚìÏ™W1ºAÅÉrÈG\÷Úù¥ÁbÔízÖZ}VÔÐ¢]/B=ßŒàÑõ‰yVEŽ<š¡õcÏ²A¯|<Ôj$Ój¦fø_rÔX”Xç´Ìhx/ ˜¥QøÊøõ¯?M/9ú‚£á´'/Ìhn5ÆûžÇåØI¾"Q'Â"ð—CØå{÷Ï/w„QËÊ¹0.fõŽ~zPÈNFðÑ@†“´<gÜË˜ñ!¾‚ããd õöH=ÝIY’#>dâ¤%ñ]£ œºzª€¾>©ttÏô@hµè¹•½¾œOó¨²ë0¨'‚9ü¡fðŒ` <qŸ#}ÿ‹h¹„Ü†A!ß&jDY6²­† €T˜:n®`ÎšÀ¾ÒRn¹òÉ…Ë°Í8¹‰ºÛIš`~;·–=xÉ*nàaÚzÍ0ü:ùùO< ÌJ£1ØU—Aù¸Äó×ç?é¾R¾IÀ³ lCþÄ)uÍ+Æá»æ-Ð^¿ñ½!Ìl~oHòE¸xc0)k\³`½ðKCxú2^avÜvæ?ÔÅ°Öv g3ªÆŠ
î[ù¯Ä&ÔT‡Žk–ÃÀ­Ô<R‰¾9o*mxsÅ)´iŽ_²²3ë/YÍŸ£ð+VrŽ^±š7G~©…s£+,;'Wõ¹h|—kÎˆü¹º'Ðº|›ÎžZñéÔ7Ê! ~…Î¯¦Dy ’zŒÎT‰Ù¥•WvMˆ/Oôœ`@!òB>é‹¯./| ’+|FUÄ«5µxx)eÑCŠVœúàkŒÙµõ#ÆŒ…ÛÁ¨<0°—¯é	Ÿl6bl[à¡k¨Í	Ô®Æ®Ÿ8ÕoöàÕ\Uc,°»iƒò3ÆEËäAÚJ¸³B«ê³¢K‘wWm„ö†Ó«	ªj‡5S°ôpÔºF3\›ª»hÊ`Ñfuqòdžj[,ðõ(ÎF_·Q6sççÃôÎ]±î5ˆÒ–FçŒ<¬êu×€ý€
aýnŠxžšü°ùÃ3Ç.ts‹Š).¸«ªmÃKÌÃÝ4ý‡bÛíu.
=Z£»swj[‚ê•±3×‹ìžùØ´7S]ÌŠSµuºÖõE÷—sK(³a–E6Ÿ¦œ'‚	Ò9:¶µõ7@ûUb<•~ÏÀ¹¦$ca‹äÿxVK#!«ÆŸà0>Y!o…4"ü“áñA+ ­ñüÉ ¸ƒb!‚?Ù-lO}=	©¯¿#³a™áü–ÂÀÃïm¢Ôÿª:ïÑÃå™^‰Ö@Ûgž/äºþ®rõK/³«í^~æ§OMSüSµÆ?¬£Ÿ™0ðÎÂ‚“œÏ0’?íñþ ­"/ET–âq—2Çmª‚DB(zICHU@#
+6~½Å;òˆ4“¡ò1F|¾z9¸ZÛ$ïnMˆ¦!ï3Pö¥A¢õ`T•7WPh~ebÂ¨Ä,qqLäò˜,?Q
,ŽÏä	¬bpp6óC³&ê:Ä“¨¤‰›¦zæ1WÄnmÚsJøyÇ˜Æ$fçŒGùà/¦¥22f…þõ|†‡ï‰m#NËáSCYÐkš¤{˜Ée’5®HJtëUI9¶zßb.¤Ã>ãòHò:"ÃYá“‚{ @
—,
2a–¿«u~‰8x¼z@~‡Ok>n'£~$P²\!SÀtƒá"av%[Ñªàº…þ™Kfª×YÔ¬h?äÜpBuòµ]ugñ•uíòà:°5[K?gucÖùA¾¼ŒmlñC”q»Üœ%<Q‚‹GÉ³qìÍ¾‹œ²Ê½JN¨M¸§œd¹:'¨•çQómŒ€i¡@ÂïÌØÊDÀÃïš,«U¿z8Eb¿†UÓ*í5‰¼>™£»]n¨î¿_5WWÉŽ–Ë1”ZzNŠÄÞ—¢®ÃóŸ =ËÚøüsƒúšòÝjÎ³•­õ3öe ØtúÝš£d©È q;Pd«¥éyy^NHýÍåšq4Ð8ˆŸz»÷©Œ8Ë(ñ‘–ªõÛB¡n«f„M¦x-Î×J,»NZ¨$ ©]®•øôI“[¨Ûn'¹,³©ÜFDŸ5—Öã®¸-
‰ÛˆÛ¹¦€KVýŠ¾6ï	%Y§ÇŠéÂ
Ç«9»ûsõ­Óÿ
ïT;íõ‘÷6y	ÛÓØ^êŠ9àóœIššÊ„Ç~âÕi«7	®`rr¬"ME¼#’æç4•
‡RïÿOâdC3ÿz›ÙmiCiÔfW{AsîSëuÀ…µÜ4M%B>5K	Ê««ýÏ2Nmhr'™yES¶8Ÿè2ŸÚ–¡7›ØšÈmÁeM”¶ÖÌ;ëÎKòA
Q 4‚á‰Â•zç:\^õ×l¡±ÇHÞZ¹*£ÄVÎu¯o^®vÿ©#’CùZ>Þ2’zû©YMHÿóZY«¡bèŽÈæ²Ml<òÎdxÊ a›ÍMs‘dZ­™ ë.~­¹—k¯$s9ch1“/#yÖç3¢W6,SlZ¡_¾N6P¯|‰ÿä™—ª±¼t¹”ä—ö—!òÕÈ†2Î
iS;þê»W.¸|ï•	n-xe‚+ý!ü…
é2·®¤Y‚¤¼éô´cØ}õônVK-y	­©œªm,Šú/Z¸¾sœÕýGš|gK
ÐÚúÑMÚƒ_qÁþ5\ô½·IYaÌK± ",ÜXÜ~ø`¾ïÎV¬Aí§üü:™Á|í6àÄkÜÚ®<è«ïY
ö1ª,î/"Œx&žê¾é9«Þ0´¨ßä|]£\- A¥Ùiÿî+!D%FûåOôáµ9¼­nÆa¥-óÉìÛÒ‡o^ñpàrÿ¢/Û=â7õhšæoÞ½Î¡Í6ÐÍ†©Ú
ÞÊKÊoÖFÇWœŠ9è}ìRœZ¯D) ò$IãyöVæEo=²–‚ËƒiPŒ©¡E™h2œ{ÍXÙŠQÞioZ$i¯Í´àS;p¯‘…„:N_+€›ÈhDÏ>JìjÄ
 s``*b§övû‡»{§{?’ÏÌ= ¬¹ÎÑuÂï?Ó7~Ê0È!I6­´aÉ?q¦'I§ì-Ø~3¢ðt:=‘w¦T^U¿•&.`%w°Ç¾iFX«\Ëêl`¾¦0~Gpü&ÆëÈŠ¼Ø[ô@…KœŒ;ª®U,òNôà9¸\&f æ}–¤³Tõ¯Ã{ˆÀÙoûWÕ¯èløŽ,ö’rÔ9:<>òk}þ?ìÑêII¾4¿ìœ	¬“b–qæùªª¦ƒÕÕ4%s…—>~‡ÍÝž‰žºœ6bØxôÿ  ÿÿ &ä>H