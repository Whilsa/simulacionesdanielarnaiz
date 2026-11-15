/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaymentObligation, PropertyAcquisition, RentalInstallmentInvoice } from '../types.js';

export const DEFAULT_LANDLORD_ID = 'corp-1';
export const DEFAULT_LANDLORD_NAME = 'Inmobiliaria Polígonos de España S.A.';
export const DEFAULT_LANDLORD_NIF = 'A-28009988';
export const DEFAULT_LANDLORD_ADDRESS = 'Av. de la Industria 45, Polígono Industrial, 28009 Madrid';
export const DEFAULT_LANDLORD_IBAN = 'ES21 0001 0002 9988 7755';

const SPANISH_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function roundRentalCurrency2(value: number): number {
  return Number((Number(value || 0) + Number.EPSILON).toFixed(2));
}

export function isRentalObligationType(type?: string | null): boolean {
  return type === 'cuota_alquiler' || type === 'alquiler';
}

export function formatUtcDateEs(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export interface RentalPeriodInfo {
  periodMonth: number;
  periodYear: number;
  periodStartDate: string;
  periodEndDate: string;
  periodLabel: string;
  periodRangeLabel: string;
}

/**
 * Calcula el periodo mensual cubierto por una cuota de alquiler (pagada por mes anticipado).
 * Usa la fecha de vencimiento de la cuota (o en su defecto fecha de contrato + (cuota - 1) meses)
 * y genera mes, año y rango exacto [inicio, inicio + 1 mes - 1 día].
 */
export function computeRentalInstallmentPeriod(
  dueDateIso: string,
  purchaseDateIso?: string,
  installmentNumber?: number
): RentalPeriodInfo {
  let anchor = new Date(dueDateIso);
  if (isNaN(anchor.getTime())) {
    const baseDate = purchaseDateIso ? new Date(purchaseDateIso) : new Date();
    const offsetMonths = Math.max(0, Number(installmentNumber || 2) - 1);
    anchor = new Date(Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth() + offsetMonths,
      baseDate.getUTCDate(),
      12, 0, 0
    ));
  }

  const year = anchor.getUTCFullYear();
  const monthZero = anchor.getUTCMonth();
  const day = anchor.getUTCDate();

  const periodStart = new Date(Date.UTC(year, monthZero, day, 12, 0, 0));

  // Un mes después manteniendo el mismo día (acotado al último día del mes siguiente), menos 1 día
  const nextMonthFirst = new Date(Date.UTC(year, monthZero + 1, 1, 12, 0, 0));
  const daysInNextMonth = new Date(
    Date.UTC(nextMonthFirst.getUTCFullYear(), nextMonthFirst.getUTCMonth() + 1, 0, 12, 0, 0)
  ).getUTCDate();
  const nextMonthSameDay = new Date(
    Date.UTC(
      nextMonthFirst.getUTCFullYear(),
      nextMonthFirst.getUTCMonth(),
      Math.min(day, daysInNextMonth),
      12, 0, 0
    )
  );
  const periodEnd = new Date(nextMonthSameDay.getTime() - 24 * 60 * 60 * 1000);

  const periodMonth = periodStart.getUTCMonth() + 1;
  const periodYear = periodStart.getUTCFullYear();
  const periodStartDate = periodStart.toISOString();
  const periodEndDate = periodEnd.toISOString();
  const monthName = SPANISH_MONTHS[periodMonth - 1] || `Mes ${periodMonth}`;

  return {
    periodMonth,
    periodYear,
    periodStartDate,
    periodEndDate,
    periodLabel: `${monthName} ${periodYear}`,
    periodRangeLabel: `${formatUtcDateEs(periodStartDate)} – ${formatUtcDateEs(periodEndDate)}`,
  };
}

/**
 * Calcula base imponible, IVA 21% y total de la mensualidad de alquiler
 * SIN incluir fianza ni intereses de demora.
 */
export function calculateRentalInstallmentTaxBreakdown(
  obligationAmount: number,
  acquisition?: Pick<PropertyAcquisition, 'basePrice' | 'ivaAmount' | 'totalPrice' | 'monthlyRent'> | null
): {
  baseAmount: number;
  ivaRate: number;
  ivaAmount: number;
  totalAmount: number;
} {
  const totalAmount = roundRentalCurrency2(Number(obligationAmount || 0));
  const ivaRate = 21;

  if (acquisition && Number(acquisition.basePrice) > 0) {
    const acqBase = roundRentalCurrency2(Number(acquisition.basePrice));
    const acqIva = roundRentalCurrency2(
      acquisition.ivaAmount !== undefined && acquisition.ivaAmount !== null
        ? Number(acquisition.ivaAmount)
        : acqBase * 0.21
    );
    const acqTotal = roundRentalCurrency2(acqBase + acqIva);
    if (Math.abs(acqTotal - totalAmount) <= 0.05) {
      return {
        baseAmount: acqBase,
        ivaRate,
        ivaAmount: roundRentalCurrency2(totalAmount - acqBase),
        totalAmount,
      };
    }
  }

  const baseAmount = roundRentalCurrency2(totalAmount / 1.21);
  const ivaAmount = roundRentalCurrency2(totalAmount - baseAmount);

  return {
    baseAmount,
    ivaRate,
    ivaAmount,
    totalAmount,
  };
}

export function formatRentalInvoiceNumber(year: number, seq: number): string {
  return `FAC-ALQ-${year}-${String(seq).padStart(4, '0')}`;
}

export function extractRentalInvoiceSeq(invoiceNumber: string, year: number): number {
  const match = new RegExp(`^FAC-ALQ-${year}-(\\d+)$`).exec(String(invoiceNumber || '').trim());
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function getNextRentalInvoiceNumber(existingInvoiceNumbers: string[], issueDateIso: string): string {
  const issueDate = new Date(issueDateIso);
  const year = isNaN(issueDate.getTime()) ? new Date().getUTCFullYear() : issueDate.getUTCFullYear();
  let maxSeq = 0;
  for (const num of existingInvoiceNumbers) {
    const seq = extractRentalInvoiceSeq(num, year);
    if (seq > maxSeq) maxSeq = seq;
  }
  const existingSet = new Set(existingInvoiceNumbers.map(n => String(n || '').trim()));
  let nextSeq = maxSeq + 1;
  let candidate = formatRentalInvoiceNumber(year, nextSeq);
  while (existingSet.has(candidate)) {
    nextSeq++;
    candidate = formatRentalInvoiceNumber(year, nextSeq);
  }
  return candidate;
}

export interface CreateRentalInvoiceParams {
  id?: string;
  invoiceNumber: string;
  obligation: Pick<
    PaymentObligation,
    'id' | 'acquisitionId' | 'studentId' | 'studentName' | 'propertyTitle' | 'type' | 'amount' | 'dueDate' | 'status' | 'paidDate' | 'installmentNumber' | 'totalInstallments'
  >;
  acquisition?: Pick<
    PropertyAcquisition,
    'id' | 'propertyId' | 'propertyTitle' | 'location' | 'basePrice' | 'ivaAmount' | 'totalPrice' | 'monthlyRent' | 'purchaseDate'
  > | null;
  studentNifCif?: string;
  landlordId?: string;
  landlordName?: string;
  landlordNifCif?: string;
  landlordAddress?: string;
  landlordIban?: string;
  transferId?: string;
  issueDateIso?: string;
  paidDateIso?: string;
  paymentMethod?: string;
}

export function buildRentalInstallmentInvoiceRecord(params: CreateRentalInvoiceParams): RentalInstallmentInvoice {
  const { obligation, acquisition } = params;
  const effectivePaidDate = params.paidDateIso || obligation.paidDate || new Date().toISOString();
  const effectiveIssueDate = params.issueDateIso || effectivePaidDate;
  const installmentNumber = Number(obligation.installmentNumber || 2);
  const totalInstallments = Number(obligation.totalInstallments || 12);

  const period = computeRentalInstallmentPeriod(
    obligation.dueDate,
    acquisition?.purchaseDate,
    installmentNumber
  );

  const tax = calculateRentalInstallmentTaxBreakdown(obligation.amount, acquisition);

  const resolvedLandlordName =
    params.landlordName && params.landlordName !== 'Profesor de Contabilidad'
      ? params.landlordName
      : DEFAULT_LANDLORD_NAME;
  const resolvedLandlordId =
    params.landlordId && params.landlordId !== 'profesor-1'
      ? params.landlordId
      : DEFAULT_LANDLORD_ID;
  const isDefaultInmobiliaria = resolvedLandlordName === DEFAULT_LANDLORD_NAME;

  const suffix = Math.random().toString(36).substring(2, 8);
  const id = params.id || `fac-alq-${Date.now()}-${suffix}`;

  return {
    id,
    invoiceNumber: params.invoiceNumber,
    obligationId: obligation.id,
    acquisitionId: obligation.acquisitionId,
    propertyId: acquisition?.propertyId,
    propertyTitle: obligation.propertyTitle || acquisition?.propertyTitle || 'Inmueble arrendado',
    propertyLocation: acquisition?.location || '',
    studentId: obligation.studentId,
    studentName: obligation.studentName,
    studentNifCif: params.studentNifCif || 'B-87654321',
    landlordId: resolvedLandlordId,
    landlordName: resolvedLandlordName,
    landlordNifCif: params.landlordNifCif || (isDefaultInmobiliaria ? DEFAULT_LANDLORD_NIF : 'B-00000000'),
    landlordAddress: params.landlordAddress || (isDefaultInmobiliaria ? DEFAULT_LANDLORD_ADDRESS : 'España'),
    landlordIban: params.landlordIban || DEFAULT_LANDLORD_IBAN,
    installmentNumber,
    totalInstallments,
    periodMonth: period.periodMonth,
    periodYear: period.periodYear,
    periodLabel: period.periodLabel,
    periodStartDate: period.periodStartDate,
    periodEndDate: period.periodEndDate,
    issueDate: effectiveIssueDate,
    paidDate: effectivePaidDate,
    dueDate: obligation.dueDate,
    baseAmount: tax.baseAmount,
    ivaRate: tax.ivaRate,
    ivaAmount: tax.ivaAmount,
    totalAmount: tax.totalAmount,
    transferId: params.transferId,
    paymentMethod: params.paymentMethod || 'Domiciliación bancaria automática',
    status: 'pagado',
  };
}

/**
 * Crea de forma idempotente y atómica (en memoria) la factura de una mensualidad de alquiler.
 * Solo emite factura si la obligación es de tipo alquiler Y está confirmada como 'pagado'.
 * Si ya existe una factura asociada a obligacionId, devuelve la existente sin duplicar.
 */
export function createOrGetRentalInstallmentInvoiceInMemory(
  existingInvoices: RentalInstallmentInvoice[],
  params: Omit<CreateRentalInvoiceParams, 'invoiceNumber'> & { invoiceNumber?: string }
): { invoice: RentalInstallmentInvoice; created: boolean } | null {
  const { obligation } = params;
  if (!isRentalObligationType(obligation.type)) {
    return null;
  }
  if (obligation.status !== 'pagado') {
    return null;
  }

  const existing = existingInvoices.find(inv => inv.obligationId === obligation.id);
  if (existing) {
    return { invoice: existing, created: false };
  }

  const effectiveIssueDate = params.issueDateIso || params.paidDateIso || obligation.paidDate || new Date().toISOString();
  const invoiceNumber =
    params.invoiceNumber ||
    getNextRentalInvoiceNumber(
      existingInvoices.map(i => i.invoiceNumber),
      effectiveIssueDate
    );

  const newInvoice = buildRentalInstallmentInvoiceRecord({
    ...params,
    invoiceNumber,
    issueDateIso: effectiveIssueDate,
  });

  existingInvoices.unshift(newInvoice);
  return { invoice: newInvoice, created: true };
}

export function mapRentalInvoiceRow(row: any): RentalInstallmentInvoice {
  return {
    id: String(row.id),
    invoiceNumber: String(row.numero_factura),
    obligationId: String(row.obligacion_id),
    acquisitionId: String(row.adquisicion_id),
    propertyId: row.inmueble_id ? String(row.inmueble_id) : undefined,
    propertyTitle: String(row.inmueble_titulo || ''),
    propertyLocation: row.inmueble_direccion ? String(row.inmueble_direccion) : undefined,
    studentId: String(row.alumno_id),
    studentName: String(row.alumno_nombre || ''),
    studentNifCif: row.alumno_nif ? String(row.alumno_nif) : 'B-87654321',
    landlordId: row.arrendador_id ? String(row.arrendador_id) : DEFAULT_LANDLORD_ID,
    landlordName: String(row.arrendador_nombre || DEFAULT_LANDLORD_NAME),
    landlordNifCif: row.arrendador_nif ? String(row.arrendador_nif) : DEFAULT_LANDLORD_NIF,
    landlordAddress: row.arrendador_direccion ? String(row.arrendador_direccion) : DEFAULT_LANDLORD_ADDRESS,
    landlordIban: row.arrendador_iban ? String(row.arrendador_iban) : DEFAULT_LANDLORD_IBAN,
    installmentNumber: Number(row.numero_cuota || 2),
    totalInstallments: Number(row.total_cuotas || 12),
    periodMonth: Number(row.periodo_mes || 1),
    periodYear: Number(row.periodo_anio || new Date().getUTCFullYear()),
    periodLabel: String(row.periodo_etiqueta || ''),
    periodStartDate: row.fecha_periodo_inicio ? String(row.fecha_periodo_inicio) : '',
    periodEndDate: row.fecha_periodo_fin ? String(row.fecha_periodo_fin) : '',
    issueDate: row.fecha_emision ? new Date(row.fecha_emision).toISOString() : new Date().toISOString(),
    paidDate: row.fecha_pago ? new Date(row.fecha_pago).toISOString() : new Date().toISOString(),
    dueDate: row.fecha_vencimiento ? new Date(row.fecha_vencimiento).toISOString() : new Date().toISOString(),
    baseAmount: Number(row.base_imponible || 0),
    ivaRate: Number(row.tipo_iva || 21),
    ivaAmount: Number(row.importe_iva || 0),
    totalAmount: Number(row.importe_total || 0),
    transferId: row.movimiento_id ? String(row.movimiento_id) : undefined,
    paymentMethod: String(row.metodo_pago || 'Domiciliación bancaria automática'),
    status: String(row.estado || 'pagado'),
  };
}
