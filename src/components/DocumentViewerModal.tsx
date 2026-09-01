/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, X, FileText, Landmark, Building2, CheckCircle2, 
  Copy, Check, Info, ShieldCheck, ArrowDown, Receipt, Calculator, Wrench, Clock, Truck, Download, RefreshCw
} from 'lucide-react';
import { PropertyAcquisition, BankLoan, AmortizationRow, PaymentObligation, MachineryAcquisition, Transfer, HiredEmployee, PayrollRecord, RelocationInvoice, PurchasedVehicle } from '../types.js';
import { formatNumber } from '../lib/formatters.js';
import { downloadElementAsPDF, printElementFallback } from '../lib/pdfUtils.js';

export type DocumentType = 'property_invoice' | 'machinery_invoice' | 'machinery_relocation_invoice' | 'vehicle_invoice' | 'obligation_statement' | 'loan_statement' | 'transfer_statement' | 'payroll_payslip';

export interface DocumentViewerData {
  type: DocumentType;
  // Property or machinery purchase fields
  acquisition?: PropertyAcquisition;
  machineryAcquisition?: MachineryAcquisition;
  relocationInvoice?: RelocationInvoice;
  vehicle?: PurchasedVehicle;
  
  // Obligation statement fields
  obligation?: PaymentObligation;
  
  // Loan statement fields
  loan?: BankLoan;
  loanInstallment?: AmortizationRow;
  installmentPeriod?: number;

  // Bank transfer statement fields
  transfer?: Transfer;

  // Payroll payslip fields
  hiredEmployee?: HiredEmployee;
  payrollRecord?: PayrollRecord;
  employeeName?: string;
  studentName?: string;
  studentNifCif?: string;
  periodMonth?: string;
  workedDays?: number;
  totalMonthDays?: number;
  grossSalaryMonthly?: number;
  proportionalGross?: number;
  irpfAmount?: number;
  ssEmployeeAmount?: number;
  netSalary?: number;
  ssCompanyAmount?: number;
  totalCompanyCost?: number;
}

interface DocumentViewerModalProps {
  data: DocumentViewerData;
  onClose: () => void;
}

export default function DocumentViewerModal({ data, onClose }: DocumentViewerModalProps) {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);

  const getFilename = () => {
    if (data.type === 'property_invoice') return `Factura_Inmueble_FAC-2026-${data.acquisition?.id || '101'}`;
    if (data.type === 'machinery_invoice') return `Factura_Maquinaria_FAC-2026-${data.machineryAcquisition?.id || '201'}`;
    if (data.type === 'machinery_relocation_invoice') return `Factura_Traslado_Maquinaria_FAC-2026-${data.relocationInvoice?.id || '250'}`;
    if (data.type === 'vehicle_invoice') return `Factura_Vehiculo_VE-2026-${data.vehicle?.id || '301'}`;
    if (data.type === 'obligation_statement') return `Extracto_Pago_Aplazado_${data.obligation?.id || 'OBL'}`;
    if (data.type === 'loan_statement') return `Extracto_Prestamo_Bancario_${data.loan?.id || 'PR'}`;
    if (data.type === 'transfer_statement') return `Extracto_Transferencia_${data.transfer?.id || 'TX'}`;
    if (data.type === 'payroll_payslip') return `Nomina_${data.payrollRecord?.periodMonth || 'Mes'}-${data.payrollRecord?.periodYear || '2026'}_${data.employeeName || data.hiredEmployee?.employeeName || 'Empleado'}`;
    return 'Documento_Contable';
  };

  const handleDownloadPDF = async () => {
    if (!printableRef.current) return;
    setIsDownloading(true);
    try {
      await downloadElementAsPDF(printableRef.current, getFilename());
    } catch (err) {
      console.error('PDF generation error:', err);
      printElementFallback(printableRef.current);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    if (printableRef.current) {
      printElementFallback(printableRef.current);
    } else {
      try {
        window.focus();
        setTimeout(() => window.print(), 50);
      } catch (e) {
        console.error('Print error:', e);
      }
    }
  };

  const handleCopyText = () => {
    let textContent = '';

    if (data.type === 'property_invoice') {
      const acq = data.acquisition;
      const title = acq?.propertyTitle || 'Inmueble Comercial';
      const isRent = acq?.operation === 'alquiler';
      const basePrice = acq?.basePrice || 0;
      const ivaAmount = acq?.ivaAmount || 0;
      const totalPrice = acq?.totalPrice || 0;
      const downPayment = acq?.downPaymentPaid || totalPrice;
      const pendingBalance = acq?.pendingBalance || 0;

      textContent = `================================================
FACTURA OFICIAL DE ${isRent ? 'ARRENDAMIENTO' : 'COMPRAVENTA DE INMUEBLE'}
Nº Factura Única: FAC-2026-${(acq?.id || '101').toUpperCase()}
Fecha de Expedición: ${new Date(acq?.purchaseDate || Date.now()).toLocaleDateString('es-ES')}
------------------------------------------------
EMISOR (Vendedor/Arrendador):
Inmobiliaria Polígonos de España S.A.
NIF: A-28009988 | C/ Alcalá 140, 28009 Madrid

CLIENTE / COMPRADOR:
${acq?.studentName || 'Empresa Estudiante'}
------------------------------------------------
DESGLOSE DEL INMUEBLE:
Inmueble: ${title}
Superficie: ${acq?.surfaceM2 || 'N/A'} m² | Ubicación: ${acq?.location || 'España'}

Base Imponible: ${formatNumber(basePrice)} €
IVA (21%): ${formatNumber(ivaAmount)} €
TOTAL FACTURA: ${formatNumber(totalPrice)} €
------------------------------------------------
CONDICIONES DE PAGO:
- Parte pagada al contado (entrada / inicial): ${formatNumber(downPayment)} €
- Parte pendiente de pago (saldo aplazado): ${formatNumber(pendingBalance)} €
Forma de pago: ${acq?.paymentMethod === 'contado' ? 'Al contado' : 'Pago aplazado (letras / pagarés)'}
================================================`;
    } else if (data.type === 'machinery_invoice') {
      const mac = data.machineryAcquisition;
      const title = mac?.title || mac?.lineTitle || 'Línea de producción industrial';
      const basePrice = mac?.basePrice || 0;
      const ivaAmount = mac?.ivaAmount || 0;
      const totalPrice = mac?.totalPrice || 0;
      const downPayment = mac?.downPaymentPaid || totalPrice;
      const pendingBalance = mac?.pendingBalance || 0;

      textContent = `================================================
FACTURA OFICIAL DE COMPRA DE MAQUINARIA INDUSTRIAL
Nº Factura Única: FAC-2026-${(mac?.id || '201').toUpperCase()}
Fecha de Expedición: ${new Date(mac?.purchaseDate || Date.now()).toLocaleDateString('es-ES')}
------------------------------------------------
PROVEEDOR / EMISOR:
Maquinarias e Instalaciones Industriales S.A.
NIF: A-99887766 | Polígono Industrial Central, Madrid

CLIENTE / COMPRADOR:
${mac?.studentName || 'Empresa Estudiante'}
------------------------------------------------
EQUIPAMIENTO / LÍNEA ADQUIRIDA:
Línea: ${title} (${mac?.optionTitle || 'Configuración estándar'})
Ubicación instalada: ${mac?.installationNaveTitle || 'Nave industrial'}
Capacidad producción: ${mac?.productionCapacityUnitsPerHour || 60} unid/hora
Plazo de montaje: 8 horas reales (Estado: ${mac?.status === 'montaje' ? 'En montaje' : 'En funcionamiento'})

Base imponible (llave en mano): ${formatNumber(basePrice)} €
IVA (21%): ${formatNumber(ivaAmount)} €
TOTAL FACTURA: ${formatNumber(totalPrice)} €
------------------------------------------------
CONDICIONES DE PAGO:
- Parte pagada al contado (entrada + IVA): ${formatNumber(downPayment)} €
- Parte pendiente de pago (saldo aplazado en pagarés): ${formatNumber(pendingBalance)} €
Forma de pago: ${mac?.paymentMethod === 'contado' ? 'Al contado' : 'Pago aplazado (24 pagarés mensuales)'}
================================================`;
    } else if (data.type === 'machinery_relocation_invoice') {
      const relInv = data.relocationInvoice || data.machineryAcquisition?.relocationInvoices?.[0] || data.machineryAcquisition?.relocationInvoice;
      const mac = data.machineryAcquisition;
      const macTitle = relInv?.machineryTitle || mac?.lineTitle || mac?.title || 'Línea de producción industrial';
      const invoiceNo = relInv?.invoiceNumber || `FACT-TRSL-2026-${(mac?.id || '301').toUpperCase()}`;
      const distanceKm = relInv?.distanceKm || 25;
      const subtotal = relInv?.subtotal || 3100;
      const ivaAmount = relInv?.ivaAmount || (subtotal * 0.21);
      const totalAmount = relInv?.totalAmount || (subtotal + ivaAmount);

      textContent = `================================================
FACTURA DE TRASLADO Y MONTAJE DE MAQUINARIA INDUSTRIAL
Nº Factura: ${invoiceNo}
Fecha: ${relInv?.issueDate ? new Date(relInv.issueDate).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES')}
------------------------------------------------
PROVEEDOR: Logística y Montajes Industriales España S.L. (CIF: B-88442211)
CLIENTE: ${relInv?.companyName || mac?.studentName || 'Empresa estudiante'}

EQUIPO TRASLADADO: ${macTitle}
ORIGEN: ${relInv?.sourceNaveTitle || 'Nave origen'}
DESTINO: ${relInv?.targetNaveTitle || 'Nave destino'}
DISTANCIA TRAYECTO: ${distanceKm} km

1. Desmontaje técnico: ${formatNumber(relInv?.disassemblyFee || 1500)} €
2. Transporte pesado góndola (${distanceKm} km): ${formatNumber(relInv?.transportFee || 800)} €
3. Remontaje y calibración: ${formatNumber(relInv?.reassemblyFee || 1800)} €

Subtotal: ${formatNumber(subtotal)} €
IVA (21%): ${formatNumber(ivaAmount)} €
TOTAL PAGADO: ${formatNumber(totalAmount)} € (PAGADO AL CONTADO)
================================================`;
    } else if (data.type === 'obligation_statement') {
      const ob = data.obligation;
      const code = `EXT-2026-${(ob?.id || '001').toUpperCase()}`;
      const isPaid = ob?.status === 'pagado';
      const instrumentName = ob?.type === 'pagare' ? 'Pagaré mercantil' : ob?.type === 'letra_cambio' ? 'Letra de cambio' : 'Cuota de alquiler';

      textContent = `================================================
EXTRACTO CONTABLE DE Pago aplazado / efecto mercantil
Nº extracto único: ${code}
Fecha de emisión extracto: ${new Date().toLocaleDateString('es-ES')}
------------------------------------------------
TITULAR Y DEUDOR:
${ob?.studentName || 'Empresa estudiante'}

OPERACIÓN ORIGEN:
Concepto: ${ob?.propertyTitle || 'Operación empresarial'}
Tipo de Efecto: ${instrumentName} (${ob?.installmentNumber || 1}/${ob?.totalInstallments || 1})
Vencimiento: ${new Date(ob?.dueDate || Date.now()).toLocaleDateString('es-ES')}
------------------------------------------------
LIQUIDACIÓN DEL VENCIMIENTO:
Importe del Vencimiento: ${formatNumber(ob?.amount || 0)} €
Estado: ${isPaid ? `PAGADO Y ABONADO el ${new Date(ob?.paidDate || Date.now()).toLocaleDateString('es-ES')}` : 'PENDIENTE DE COBRO / VENCIMIENTO'}
================================================`;
    } else if (data.type === 'loan_statement') {
      const loan = data.loan;
      const row = data.loanInstallment || (data.installmentPeriod && loan?.schedule ? loan.schedule.find(s => s.period === data.installmentPeriod) : undefined);
      const principal = loan?.approvedAmount || loan?.offeredAmount || 0;
      const annualRate = (loan?.annualInterestRate || 4.50);

      const scheduleText = (loan?.schedule || []).map(s => 
        `Mes ${s.period} [${new Date(s.dueDate).toLocaleDateString('es-ES')}]: Cuota: ${formatNumber(s.payment)} € | Capital: ${formatNumber(s.principal)} € | Interés: ${formatNumber(s.interest)} € | Cap. Pendiente: ${formatNumber(s.pendingBalance)} €`
      ).join('\n');

      textContent = `================================================
BANCO CENTRAL HIPOTECARIO S.A.
PÓLIZA DE PRÉSTAMO HIPOTECARIO Y LIQUIDACIÓN
Nº póliza única: POL-HIP-2026-${(loan?.id || '000').toUpperCase()}
Fecha: ${new Date().toLocaleDateString('es-ES')}
------------------------------------------------
PRESTATARIO / TITULAR:
${loan?.studentName || 'Estudiante'}
IBAN de Cuenta: ${loan?.studentAccount || 'ES21...'}

CONDICIONES FINANCIERAS:
Capital Concedido: ${formatNumber(principal)} €
Tipo de Interés: ${formatNumber(annualRate, 2)}% TIN
Plazo: ${loan?.termMonths || 36} Meses
Comisión Apertura (0.10%): ${formatNumber(principal * 0.001)} €

${row ? `
LIQUIDACIÓN DE CUOTA Nº ${row.period}:
Vencimiento: ${new Date(row.dueDate).toLocaleDateString('es-ES')}
- Amortización Capital: ${formatNumber(row.principal)} €
- Intereses Periodo: ${formatNumber(row.interest)} €
- TOTAL CUOTA: ${formatNumber(row.payment)} €
- Capital Pendiente tras Cuota: ${formatNumber(row.pendingBalance)} €
` : ''}
------------------------------------------------
CUADRO COMPLETO DE AMORTIZACIÓN:
${scheduleText}
================================================`;
    } else if (data.type === 'transfer_statement') {
      const tx = data.transfer;
      const code = `EXT-TX-2026-${(tx?.id || '001').toUpperCase()}`;

      textContent = `================================================
BANCO CENTRAL DEL ALUMNADO / BANCA DIGITAL
EXTRACTO OFICIAL DE MOVIMIENTO / TRANSFERENCIA BANCARIA
Nº justificante único: ${code}
Fecha de Registro: ${tx ? new Date(tx.timestamp).toLocaleString('es-ES') : new Date().toLocaleString('es-ES')}
------------------------------------------------
ORDENANTE / DEUDOR:
Titular: ${tx?.senderName || 'Titular ordenante'}
IBAN: ${tx?.senderAccount || 'ES...'}

BENEFICIARIO / RECEPTOR:
Titular: ${tx?.receiverName || 'Titular beneficiario'}
IBAN: ${tx?.receiverAccount || 'ES...'}
------------------------------------------------
DETALLES DE LA TRANSACCIÓN:
Concepto: ${tx?.concept || 'Transferencia bancaria'}
Importe Operación: ${formatNumber(tx?.amount || 0)} €
Estado Contable: EJECUTADO Y ABONADO
================================================`;
    }

    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return createPortal(
    <div className="printable-modal-backdrop fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto print:static print:p-0 print:bg-white print:block">
      {/* Container - A4 Paper Sheet Styling */}
      <div className="printable-document-modal bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-300 flex flex-col max-h-[92vh] overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none">
        
        {/* NON-PRINTABLE TOP CONTROL BAR */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-sm">
              {data.type === 'obligation_statement' ? 'Extracto contable de pago aplazado' : 'Factura oficial / documento contable (vista de impresión)'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyText}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer border border-slate-700"
              title="Copiar texto para ejercicios de contabilidad"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{copied ? '¡Copiado!' : 'Copiar texto'}</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
              title="Descargar documento directamente en archivo PDF"
            >
              {isDownloading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>{isDownloading ? 'Generando PDF...' : 'Descargar PDF'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer text-xs font-bold"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PRINTABLE SHEET BODY */}
        <div ref={printableRef} className="p-8 sm:p-12 overflow-y-auto font-sans text-slate-900 space-y-8 print:p-0 print:overflow-visible text-xs">
          
          {/* DOCUMENT TYPE 1: PROPERTY INVOICE */}
          {data.type === 'property_invoice' && (() => {
            const acq = data.acquisition;
            const title = acq?.propertyTitle || 'Inmueble comercial';
            const isRent = acq?.operation === 'alquiler';
            const basePrice = acq?.basePrice || 0;
            const ivaAmount = acq?.ivaAmount || 0;
            const totalPrice = acq?.totalPrice || 0;
            const downPayment = acq?.downPaymentPaid || totalPrice;
            const pendingBalance = acq?.pendingBalance || 0;
            const landPct = acq?.landPercentage || 30;
            const landValue = Number(((basePrice * landPct) / 100).toFixed(2));
            const buildingValue = Number((basePrice - landValue).toFixed(2));
            const invoiceNo = `FAC-2026-${(acq?.id || '101').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
            const issueDate = new Date(acq?.purchaseDate || Date.now()).toLocaleDateString('es-ES', {
              year: 'numeric', month: 'long', day: 'numeric'
            });

            return (
              <div className="space-y-8">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-6">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <Building2 className="w-6 h-6 text-slate-800" />
                      <span>Inmobiliaria Polígonos de España S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Promoción, gestión e inversiones inmobiliarias
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-28009988 | Registro Mercantil de Madrid, Tomo 1420, Folio 45
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Av. de la Industria 45, Polígono Industrial, 28009 Madrid
                    </p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Factura oficial única</span>
                    <span className="text-base font-extrabold text-slate-900 block">{invoiceNo}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">Fecha: {issueDate}</span>
                  </div>
                </div>

                {/* Issuer & Client Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Datos del emisor / vendedor
                    </span>
                    <p className="font-bold text-slate-900">Inmobiliaria Polígonos de España S.A.</p>
                    <p className="text-slate-600">CIF: A-28009988</p>
                    <p className="text-slate-600">Domicilio: Av. de la Industria 45, Madrid</p>
                    <p className="text-slate-600 font-mono">IBAN cobro: ES21 0001 0002 9988 7755</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Datos del cliente / receptor
                    </span>
                    <p className="font-bold text-slate-900">{acq?.studentName || 'Empresa Estudiante S.L.'}</p>
                    <p className="text-slate-600">NIF/CIF: B-87654321</p>
                    <p className="text-slate-600">Titular de cuenta de explotación comercial</p>
                    <p className="text-slate-600 font-mono">Ref. adquisición: #{acq?.id || '001'}</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider print:bg-slate-900 print:text-white">
                        <th className="p-3">Concepto y descripción del inmueble</th>
                        <th className="p-3 text-center">Superficie</th>
                        <th className="p-3 text-right">Base imponible</th>
                        <th className="p-3 text-right">IVA (21%)</th>
                        <th className="p-3 text-right">Total importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-xs">
                      <tr>
                        <td className="p-3 font-sans">
                          <span className="font-bold text-slate-900 block">{title}</span>
                          <span className="text-[11px] text-slate-500 block">
                            {isRent ? 'Arrendamiento de local/nave comercial de uso empresarial' : 'Transmisión de propiedad inmobiliaria de naturaleza urbana'}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            Ubicación: {acq?.location || 'Polígono industrial'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold">{acq?.surfaceM2 || 150} m²</td>
                        <td className="p-3 text-right font-medium">{formatNumber(basePrice)} €</td>
                        <td className="p-3 text-right font-medium text-slate-600">{formatNumber(ivaAmount)} €</td>
                        <td className="p-3 text-right font-bold text-slate-900">{formatNumber(totalPrice)} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Payment Breakdown Box: Cash vs Deferred */}
                <div className="p-5 bg-amber-50 rounded-xl border border-amber-300 space-y-3 font-mono">
                  <h4 className="font-bold text-amber-900 font-sans text-xs flex items-center space-x-1.5 uppercase tracking-wider">
                    <Receipt className="w-4 h-4 text-amber-700" />
                    <span>Desglose y condiciones de pago de la compra</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="p-3.5 bg-white rounded-lg border border-amber-200">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">Parte pagada al contado (entrada)</span>
                      <span className="text-base font-extrabold text-emerald-900 block font-mono">{formatNumber(downPayment)} €</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">Abonado mediante transferencia bancaria inicial</span>
                    </div>

                    <div className="p-3.5 bg-white rounded-lg border border-amber-200">
                      <span className="text-[10px] font-bold text-amber-800 uppercase block mb-1">Parte pendiente de pago (saldo aplazado)</span>
                      <span className="text-base font-extrabold text-amber-900 block font-mono">{formatNumber(pendingBalance)} €</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {pendingBalance > 0 ? 'Financiado mediante efectos mercantiles / pagarés pendientes' : 'Operación 100% abonada al contado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Property Accounting Breakdown Box */}
                {!isRent && (
                  <div className="p-4 bg-slate-100 rounded-xl border border-slate-300 space-y-2">
                    <h4 className="font-bold text-slate-900 flex items-center space-x-1 text-xs">
                      <ShieldCheck className="w-4 h-4 text-slate-700" />
                      <span>Desglose patrimonial legal y contable</span>
                    </h4>

                    <div className="grid grid-cols-2 gap-4 pt-1 font-mono text-xs">
                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Subcuenta (210) terrenos ({landPct}%)</span>
                        <span className="text-sm font-bold text-slate-900 block">{formatNumber(landValue)} €</span>
                        <span className="text-[10px] text-slate-500 font-sans">Bien no amortizable</span>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Subcuenta (211) construcciones ({100 - landPct}%)</span>
                        <span className="text-sm font-bold text-slate-900 block">{formatNumber(buildingValue)} €</span>
                        <span className="text-[10px] text-slate-500 font-sans">Amortizable linealmente (2,00% anual)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Total Summary Footer */}
                <div className="flex justify-end pt-2">
                  <div className="w-full sm:w-80 bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono print:bg-slate-900 print:text-white border border-slate-900">
                    <div className="flex justify-between text-xs text-slate-300 print:text-slate-200">
                      <span>Base imponible:</span>
                      <span>{formatNumber(basePrice)} €</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300 print:text-slate-200">
                      <span>21,00% IVA soportado:</span>
                      <span>+{formatNumber(ivaAmount)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-sm text-amber-400 print:text-amber-300">
                      <span>Total factura:</span>
                      <span>{formatNumber(totalPrice)} €</span>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documento emitido electrónicamente. Código de factura único e irrepetible.
                </div>

              </div>
            );
          })()}

          {/* DOCUMENT TYPE 2: MACHINERY INVOICE */}
          {data.type === 'machinery_invoice' && (() => {
            const mac = data.machineryAcquisition;
            const title = mac?.title || mac?.lineTitle || 'Línea de producción industrial';
            const basePrice = mac?.basePrice || 0;
            const ivaAmount = mac?.ivaAmount || 0;
            const totalPrice = mac?.totalPrice || 0;
            const downPayment = mac?.downPaymentPaid || totalPrice;
            const pendingBalance = mac?.pendingBalance || 0;
            const invoiceNo = `FAC-2026-${(mac?.id || '201').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
            const issueDate = new Date(mac?.purchaseDate || Date.now()).toLocaleDateString('es-ES', {
              year: 'numeric', month: 'long', day: 'numeric'
            });

            return (
              <div className="space-y-8">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-6">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <Wrench className="w-6 h-6 text-amber-600" />
                      <span>Maquinarias e Instalaciones Industriales S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Suministros llave en mano de líneas de producción y torneado
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-99887766 | Reg. Mercantil de Madrid, Tomo 8810, Folio 12
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Polígono Industrial Central, Av. de la Tecnología 12, Madrid
                    </p>
                  </div>

                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-300 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-amber-800 block">Factura oficial única</span>
                    <span className="text-base font-extrabold text-slate-900 block">{invoiceNo}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">Fecha: {issueDate}</span>
                  </div>
                </div>

                {/* Issuer & Client Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Proveedor / emisor
                    </span>
                    <p className="font-bold text-slate-900">Maquinarias e Instalaciones Industriales S.A.</p>
                    <p className="text-slate-600">CIF: A-99887766</p>
                    <p className="text-slate-600">Domicilio: Polígono Industrial Central, Madrid</p>
                    <p className="text-slate-600 font-mono">IBAN cobro: ES21 0001 0002 9988 7799</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Cliente / comprador
                    </span>
                    <p className="font-bold text-slate-900">{mac?.studentName || 'Empresa Estudiante'}</p>
                    <p className="text-slate-600">Ubicación instalación: {mac?.installationNaveTitle || 'Nave industrial'}</p>
                    <p className="text-slate-600 font-mono">Ref. maquinaria: #{mac?.id || '001'}</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider print:bg-slate-900 print:text-white">
                        <th className="p-3">Concepto y especificación de la maquinaria</th>
                        <th className="p-3 text-center">Capacidad</th>
                        <th className="p-3 text-right">Base imponible</th>
                        <th className="p-3 text-right">IVA (21%)</th>
                        <th className="p-3 text-right">Total importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-xs">
                      <tr>
                        <td className="p-3 font-sans">
                          <span className="font-bold text-slate-900 block">{title}</span>
                          <span className="text-[11px] text-amber-900 block font-semibold">
                            {mac?.optionTitle || 'Configuración industrial estándar'}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Precio llave en mano: incluye transporte, seguro de transporte y montaje completo.
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-800">{mac?.productionCapacityUnitsPerHour || 60} u/h</td>
                        <td className="p-3 text-right font-medium">{formatNumber(basePrice)} €</td>
                        <td className="p-3 text-right font-medium text-slate-600">{formatNumber(ivaAmount)} €</td>
                        <td className="p-3 text-right font-bold text-slate-900">{formatNumber(totalPrice)} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Assembly and Delivery Notice */}
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950">
                    <strong className="block font-extrabold text-amber-900">Plazo oficial de montaje de 8 horas reales:</strong>
                    La maquinaria se entrega en régimen de montaje con un periodo garantizado de 8 horas reales desde la compra antes de estar 100% operativa. Estado actual: <span className="font-bold uppercase text-amber-800">{mac?.status === 'montaje' ? 'En montaje' : 'En funcionamiento / operativa'}</span>.
                  </div>
                </div>

                {/* Payment Breakdown Box */}
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-300 space-y-3 font-mono">
                  <h4 className="font-bold text-slate-900 font-sans text-xs flex items-center space-x-1.5 uppercase tracking-wider">
                    <Receipt className="w-4 h-4 text-slate-700" />
                    <span>Condiciones y desglose de pago</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="p-3.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">Parte pagada al contado (entrada + IVA)</span>
                      <span className="text-base font-extrabold text-emerald-900 block font-mono">{formatNumber(downPayment)} €</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">Abonado en cuenta al formalizar la compra</span>
                    </div>

                    <div className="p-3.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold text-amber-800 uppercase block mb-1">Parte pendiente de pago (saldo aplazado en pagarés)</span>
                      <span className="text-base font-extrabold text-amber-900 block font-mono">{formatNumber(pendingBalance)} €</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {pendingBalance > 0 ? 'Financiado en 24 pagarés mensuales de vencimiento automático' : 'Sin saldo pendiente / pago al contado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total Summary Footer */}
                <div className="flex justify-end pt-2">
                  <div className="w-full sm:w-80 bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono print:bg-slate-900 print:text-white border border-slate-900">
                    <div className="flex justify-between text-xs text-slate-300 print:text-slate-200">
                      <span>Base imponible llave en mano:</span>
                      <span>{formatNumber(basePrice)} €</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300 print:text-slate-200">
                      <span>21,00% IVA soportado:</span>
                      <span>+{formatNumber(ivaAmount)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-sm text-amber-400 print:text-amber-300">
                      <span>Total factura:</span>
                      <span>{formatNumber(totalPrice)} €</span>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documento emitido electrónicamente. Código de factura único e irrepetible.
                </div>

              </div>
            );
          })()}

          {/* MACHINERY RELOCATION INVOICE VIEW */}
          {data.type === 'machinery_relocation_invoice' && (() => {
            const relInv = data.relocationInvoice || data.machineryAcquisition?.relocationInvoices?.[0] || data.machineryAcquisition?.relocationInvoice;
            const mac = data.machineryAcquisition;
            const macTitle = relInv?.machineryTitle || mac?.lineTitle || mac?.title || 'Línea de producción industrial';
            const invoiceNo = relInv?.invoiceNumber || `FACT-TRSL-2026-${(mac?.id || '301').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
            const issueDate = relInv?.issueDate ? new Date(relInv.issueDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('es-ES');
            
            const distanceKm = relInv?.distanceKm || 25;
            const disassemblyFee = relInv?.disassemblyFee || 1500;
            const transportFee = relInv?.transportFee || 800;
            const reassemblyFee = relInv?.reassemblyFee || 1800;
            const subtotal = relInv?.subtotal || (disassemblyFee + transportFee + reassemblyFee);
            const ivaAmount = relInv?.ivaAmount || (subtotal * 0.21);
            const totalAmount = relInv?.totalAmount || (subtotal + ivaAmount);

            return (
              <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-6">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <Truck className="w-6 h-6 text-indigo-600" />
                      <span>Logística y Montajes Industriales España S.L.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Especialistas en desmontaje, transporte pesado y remontaje de maquinaria
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: B-88442211 | Reg. Mercantil de Madrid, Tomo 9102, Folio 45
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Polígono Industrial Sur, Av. de la Logística 88, Madrid
                    </p>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-300 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-indigo-800 block">Factura de traslado y servicios</span>
                    <span className="text-base font-extrabold text-slate-900 block">{invoiceNo}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">Fecha: {issueDate}</span>
                  </div>
                </div>

                {/* Issuer & Client Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Proveedor del servicio logístico
                    </span>
                    <p className="font-bold text-slate-900">Logística y Montajes Industriales España S.L.</p>
                    <p className="text-slate-600">CIF: B-88442211</p>
                    <p className="text-slate-600">Servicio: Reubicación de equipos pesados</p>
                    <p className="text-slate-600 font-mono">IBAN cobro: ES44 2100 0088 9911 2233</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Cliente / titular de la maquinaria
                    </span>
                    <p className="font-bold text-slate-900">{relInv?.companyName || mac?.studentName || 'Empresa Estudiante'}</p>
                    <p className="text-slate-600 font-mono">CIF/NIF: {relInv?.cifNif || 'B-99887766'}</p>
                    <p className="text-slate-600">Maquinaria trasladada: <strong>{macTitle}</strong></p>
                  </div>
                </div>

                {/* Route detail */}
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                  <span className="text-[10px] font-extrabold uppercase text-indigo-900 tracking-wider block">Detalle de la ruta y trayecto</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Nave de origen</span>
                      <span className="font-bold text-slate-900">{relInv?.sourceNaveTitle || mac?.installationNaveTitle || 'Nave de origen'}</span>
                      <span className="text-[11px] text-slate-500 block">{relInv?.sourceLocation || 'Instalación de origen'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Nave de destino</span>
                      <span className="font-bold text-slate-900">{relInv?.targetNaveTitle || mac?.relocationTargetNaveTitle || 'Nave de destino'}</span>
                      <span className="text-[11px] text-slate-500 block">{relInv?.targetLocation || 'Instalación de destino'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-bold">Distancia estimada</span>
                      <span className="font-bold text-indigo-900 font-mono text-sm">{distanceKm} km</span>
                      <span className="text-[11px] text-slate-500 block">Transporte en góndola especial</span>
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                        <th className="p-3">Concepto y desglose técnico del servicio</th>
                        <th className="p-3 text-right">Importe neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-xs">
                      <tr>
                        <td className="p-3 font-sans">
                          <span className="font-bold text-slate-900 block">1. Desmontaje y desacople técnico de maquinaria</span>
                          <span className="text-[11px] text-slate-500 block">
                            Desconexión de acometidas eléctricas, desacople hidráulico, etiquetado de piezas y embalaje industrial.
                          </span>
                        </td>
                        <td className="p-3 text-right font-medium">{formatNumber(disassemblyFee)} €</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-sans">
                          <span className="font-bold text-slate-900 block">2. Transporte especial de gran tonelaje ({distanceKm} km)</span>
                          <span className="text-[11px] text-slate-500 block">
                            Carga con grúa de gran tonelaje, flete en camión góndola de piso bajo y seguro de transporte pesado.
                          </span>
                        </td>
                        <td className="p-3 text-right font-medium">{formatNumber(transportFee)} €</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-sans">
                          <span className="font-bold text-slate-900 block">3. Remontaje, nivelación y calibración en nave de destino</span>
                          <span className="text-[11px] text-slate-500 block">
                            Descarga, colocación en solera, alineación de ejes, conexionado eléctrico y prueba de puesta a punto.
                          </span>
                        </td>
                        <td className="p-3 text-right font-medium">{formatNumber(reassemblyFee)} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Payment Status Banner */}
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-xs text-emerald-950">
                      <strong className="block font-extrabold text-emerald-900">Pagado al contado por transferencia bancaria:</strong>
                      El importe total del servicio ha sido abonado íntegramente mediante cargo en la cuenta bancaria de la empresa.
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-full shrink-0">
                    Pagado
                  </span>
                </div>

                {/* Total Summary Footer */}
                <div className="flex justify-end pt-2">
                  <div className="w-full sm:w-80 bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono border border-slate-900">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Subtotal servicios logísticos:</span>
                      <span>{formatNumber(subtotal)} €</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>21,00% IVA soportado:</span>
                      <span>+{formatNumber(ivaAmount)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-sm text-indigo-300">
                      <span>Total factura:</span>
                      <span>{formatNumber(totalAmount)} €</span>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documento fiscal emitido conforme a la normativa de transporte de mercancías e instalaciones industriales.
                </div>
              </div>
            );
          })()}

          {/* DOCUMENT TYPE: VEHICLE INVOICE */}
          {data.type === 'vehicle_invoice' && (() => {
            const veh = data.vehicle;
            const title = veh?.title || 'Vehículo comercial de empresa';
            const basePrice = veh?.basePrice || 0;
            const ivaAmount = veh?.ivaAmount || (basePrice * 0.21);
            const totalPrice = veh?.totalPrice || (basePrice + ivaAmount);
            const invoiceNo = `FAC-VEH-2026-${(veh?.id || '301').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
            const issueDate = new Date(veh?.purchaseDate || Date.now()).toLocaleDateString('es-ES', {
              year: 'numeric', month: 'long', day: 'numeric'
            });

            return (
              <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-6">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <Truck className="w-6 h-6 text-blue-700" />
                      <span>Concesionario y Motor Industrial S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Venta y distribución oficial de vehículos industriales, camiones y furgonetas
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-77665544 | Reg. Mercantil de Madrid, Tomo 7710, Folio 45
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Vía Automoción 88, 28052 Madrid
                    </p>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-blue-800 block">Factura comercial venta vehículo</span>
                    <span className="text-base font-extrabold text-slate-900 block">{invoiceNo}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">
                      Fecha: {issueDate}
                    </span>
                  </div>
                </div>

                {/* Parties Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Emisor / vendedor
                    </span>
                    <p className="font-bold text-slate-900">Concesionario y Motor Industrial S.A.</p>
                    <p className="text-slate-600">NIF: A-77665544</p>
                    <p className="text-slate-600">Domicilio: Vía Automoción 88, Madrid</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Cliente / adquirente
                    </span>
                    <p className="font-bold text-slate-900">{veh?.studentName || data.studentName || 'Empresa Compradora'}</p>
                    <p className="text-slate-600 font-mono">ID alumno: #{veh?.studentId || '1'}</p>
                    <p className="text-slate-600">Forma de pago: <span className="font-bold text-slate-900 capitalize">{veh?.paymentMethod === 'contado' ? 'Al contado (transferencia)' : 'Financiado / aplazado'}</span></p>
                  </div>
                </div>

                {/* Concept breakdown */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
                        <th className="p-3">Concepto / descripción del vehículo</th>
                        <th className="p-3 text-center">Tipo</th>
                        <th className="p-3 text-right">Base imponible</th>
                        <th className="p-3 text-right">IVA (21%)</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      <tr>
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{title}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Matrícula / bastidor: VE-2026-{(veh?.id || '301').toUpperCase()}
                          </p>
                        </td>
                        <td className="p-3 text-center font-mono capitalize">
                          {veh?.vehicleType === 'camion_trailer' ? 'Camión tráiler' : veh?.vehicleType === 'carretilla_elevadora' ? 'Carretilla elevadora' : 'Furgoneta / coche'}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold">{formatNumber(basePrice)} €</td>
                        <td className="p-3 text-right font-mono text-slate-600">{formatNumber(ivaAmount)} €</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{formatNumber(totalPrice)} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Totals box */}
                <div className="flex justify-end">
                  <div className="w-full sm:w-80 bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono border border-slate-900">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Base imponible:</span>
                      <span>{formatNumber(basePrice)} €</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>IVA (21% soportado):</span>
                      <span>{formatNumber(ivaAmount)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-sm text-blue-300">
                      <span>Total factura:</span>
                      <span>{formatNumber(totalPrice)} €</span>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documento fiscal y factura de adquisición emitida electrónicamente conforme al reglamento de facturación vigente.
                </div>
              </div>
            );
          })()}

          {/* DOCUMENT TYPE 3: OBLIGATION STATEMENT (EXTRACTO DE PAGO) */}
          {data.type === 'obligation_statement' && (() => {
            const ob = data.obligation;
            const extractNo = `EXT-2026-${(ob?.id || '001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
            const isPaid = ob?.status === 'pagado';
            const instrumentName = ob?.type === 'pagare' ? 'Pagaré mercantil' : ob?.type === 'letra_cambio' ? 'Letra de cambio' : 'Cuota de alquiler';

            return (
              <div className="space-y-8">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-6">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <FileText className="w-6 h-6 text-indigo-700" />
                      <span>Tenedor de Efectos y Servicios Financieros S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Gestión contable de efectos mercantiles y compromisos de pago aplazado
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-28001122 | Registro Mercantil de Madrid, Tomo 9912, Folio 30
                    </p>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-indigo-800 block">Extracto contable único</span>
                    <span className="text-base font-extrabold text-slate-900 block">{extractNo}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">
                      Fecha extracto: {new Date().toLocaleDateString('es-ES')}
                    </span>
                  </div>
                </div>

                {/* Issuer & Client Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Tenedor del efecto / beneficiario
                    </span>
                    <p className="font-bold text-slate-900">Tenedor de Efectos Comerciales S.A.</p>
                    <p className="text-slate-600">NIF: A-28001122</p>
                    <p className="text-slate-600 font-mono">Cuenta cobro: ES21 0001 0002 9988 7755</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Deudor / titular de la empresa
                    </span>
                    <p className="font-bold text-slate-900">{ob?.studentName || 'Empresa Estudiante'}</p>
                    <p className="text-slate-600">Estado vencimiento: <span className={`font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>{isPaid ? 'Pagado y liquidado' : 'Pendiente de cobro'}</span></p>
                  </div>
                </div>

                {/* Extract Detail Box */}
                <div className="border border-slate-300 rounded-xl p-5 bg-slate-50 space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-200 pb-2 flex items-center justify-between">
                    <span>Detalle del vencimiento aplazado</span>
                    <span className="text-[10px] font-mono text-slate-500">Ref. obligación: #{ob?.id}</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Operación origen</span>
                      <span className="text-xs font-bold text-slate-900 block mt-0.5">{ob?.propertyTitle || 'Adquisición de activo'}</span>
                    </div>

                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Tipo de efecto / cuota</span>
                      <span className="text-xs font-bold text-slate-900 block mt-0.5">
                        {instrumentName} {ob?.installmentNumber ? `(${ob.installmentNumber}/${ob.totalInstallments || 24})` : ''}
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Fecha de vencimiento</span>
                      <span className="text-xs font-bold text-slate-900 block mt-0.5">
                        {new Date(ob?.dueDate || Date.now()).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 flex justify-between items-center font-mono">
                    <div>
                      <span className="text-xs font-sans font-bold text-slate-800 block">Importe del extracto / vencimiento:</span>
                      <span className="text-[10px] text-slate-500 font-sans">
                        {isPaid ? `Abonado en cuenta el ${new Date(ob?.paidDate || Date.now()).toLocaleDateString('es-ES')}` : 'Cargo programado mediante vencimiento automático'}
                      </span>
                    </div>
                    <span className={`text-lg font-extrabold px-3 py-1 rounded-lg border ${isPaid ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-900 bg-amber-50 border-amber-300'}`}>
                      {formatNumber(ob?.amount || 0)} €
                    </span>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Extracto oficial emitido con código único e irrepetible. Válido a efectos de comprobación contable.
                </div>

              </div>
            );
          })()}

          {/* DOCUMENT TYPE 4: BANK LOAN STATEMENT / CONTRACT */}
          {data.type === 'loan_statement' && (() => {
            const loan = data.loan;
            const row = data.loanInstallment || (data.installmentPeriod && loan?.schedule ? loan.schedule.find(s => s.period === data.installmentPeriod) : undefined);
            const principal = loan?.approvedAmount || loan?.offeredAmount || 0;
            const openingFee = Number((principal * 0.001).toFixed(2));
            const netDisbursed = Number((principal - openingFee).toFixed(2));
            const annualRate = (loan?.annualInterestRate || 4.50);

            const schedule: AmortizationRow[] = (loan?.schedule && loan.schedule.length > 0)
              ? loan.schedule
              : [];

            return (
              <div className="space-y-8">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-6">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <Landmark className="w-6 h-6 text-emerald-800" />
                      <span>Banco Central Hipotecario S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Departamento de riesgos y crédito hipotecario empresarial
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-88776655 | Reg. Mercantil de Madrid, Tomo 12450, Folio 88
                    </p>
                  </div>

                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-300 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 block">Póliza de préstamo única</span>
                    <span className="text-base font-extrabold text-slate-900 block">POL-HIP-2026-{(loan?.id || '001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">
                      Fecha operación: {new Date(loan?.createdAt || Date.now()).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                </div>

                {/* Loan Borrower Details & Account Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Entidad bancaria financiadora
                    </span>
                    <p className="font-bold text-slate-900">Banco Central Hipotecario S.A.</p>
                    <p className="text-slate-600">NIF: A-88776655</p>
                    <p className="text-slate-600 font-mono">Cuenta emisora fondo: ES21 0001 0002 9988 7700</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Prestatario / titular de la operación
                    </span>
                    <p className="font-bold text-slate-900">{loan?.studentName || 'Empresa Estudiante'}</p>
                    <p className="text-slate-600 font-mono">IBAN abono/adeudo: {loan?.studentAccount || 'ES21...'}</p>
                    <p className="text-slate-600">Estado de operación: <span className="font-bold text-emerald-700">Activo y concedido</span></p>
                  </div>
                </div>

                {/* Financial Terms Summary Box */}
                <div className="border border-slate-300 rounded-xl p-5 bg-slate-50 space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-200 pb-2">
                    Condiciones financieras y estructura de la póliza
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Capital concedido</span>
                      <span className="text-sm font-bold text-slate-900">{formatNumber(principal)} €</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Tipo de interés (TIN)</span>
                      <span className="text-sm font-bold text-slate-900">{formatNumber(annualRate, 2)}%</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Plazo amortización</span>
                      <span className="text-sm font-bold text-slate-900">{loan?.termMonths || 36} Meses</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Comisión apertura</span>
                      <span className="text-sm font-bold text-slate-900">{formatNumber(openingFee)} €</span>
                    </div>
                  </div>
                </div>

                {/* CUADRO COMPLETO DE AMORTIZACIÓN DEL PRÉSTAMO */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-4 h-4 text-emerald-800 shrink-0" />
                      <h3 className="font-extrabold text-slate-900 uppercase text-xs tracking-wider">
                        Cuadro completo de amortización (sistema francés)
                      </h3>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-300 rounded-xl">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 uppercase text-[10px]">
                          <th className="py-2 px-2 text-center w-10">N.º</th>
                          <th className="py-2 px-2.5">Vencimiento</th>
                          <th className="py-2 px-2.5 text-right">Cuota total</th>
                          <th className="py-2 px-2.5 text-right">Capital</th>
                          <th className="py-2 px-2.5 text-right">Intereses</th>
                          <th className="py-2 px-2.5 text-right">Cap. pendiente</th>
                          <th className="py-2 px-2 text-center w-20">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono text-slate-800 text-[10.5px]">
                        {schedule.map((sRow) => (
                          <tr key={sRow.period} className={sRow.period % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}>
                            <td className="py-1.5 px-2 text-center font-bold text-slate-600">{sRow.period}</td>
                            <td className="py-1.5 px-2.5 font-sans">{new Date(sRow.dueDate).toLocaleDateString('es-ES')}</td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-slate-900">{formatNumber(sRow.payment)} €</td>
                            <td className="py-1.5 px-2.5 text-right text-emerald-800 font-medium">{formatNumber(sRow.principal)} €</td>
                            <td className="py-1.5 px-2.5 text-right text-amber-800">{formatNumber(sRow.interest)} €</td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-slate-900">{formatNumber(sRow.pendingBalance)} €</td>
                            <td className="py-1.5 px-2 text-center font-sans text-[9.5px]">
                              {sRow.paid ? (
                                <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">Pagado</span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">Pendiente</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documentación bancaria oficial simulada.
                </div>

              </div>
            );
          })()}

          {/* DOCUMENT TYPE 5: BANK TRANSFER / MOVEMENT STATEMENT */}
          {data.type === 'transfer_statement' && (() => {
            const tx = data.transfer;
            const code = `EXT-TX-2026-${(tx?.id || '001').toUpperCase()}`;

            return (
              <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-6">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <Landmark className="w-6 h-6 text-indigo-700" />
                      <span>Banco Central del Alumnado</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Sistema integrado de transferencias y pagos automáticos
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Entidad bancaria central del sistema educativo comercial
                    </p>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-indigo-800 block">Extracto bancario oficial</span>
                    <span className="text-base font-extrabold text-slate-900 block">{code}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">
                      Fecha: {tx ? new Date(tx.timestamp).toLocaleString('es-ES') : new Date().toLocaleString('es-ES')}
                    </span>
                  </div>
                </div>

                {/* Sender & Receiver Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Cuenta ordenante
                    </span>
                    <p className="font-bold text-slate-900">{tx?.senderName || 'Ordenante'}</p>
                    <p className="text-slate-600 font-mono text-xs">{tx?.senderAccount || 'ES21...'}</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Cuenta beneficiaria
                    </span>
                    <p className="font-bold text-slate-900">{tx?.receiverName || 'Beneficiario'}</p>
                    <p className="text-slate-600 font-mono text-xs">{tx?.receiverAccount || 'ES21...'}</p>
                  </div>
                </div>

                {/* Transaction Detail Box */}
                <div className="border border-slate-300 rounded-xl p-5 bg-slate-50 space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-200 pb-2 flex justify-between">
                    <span>Concepto y detalles de la liquidación</span>
                    <span className="text-[10px] font-mono text-slate-500">Estado: Liquidado y ejecutado</span>
                  </h3>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 font-mono text-xs space-y-2">
                    <div className="text-slate-700">
                      <span className="font-bold font-sans text-slate-500 text-[11px] block uppercase">Concepto de la operación:</span>
                      <p className="text-sm font-semibold text-slate-900 mt-1">"{tx?.concept}"</p>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 flex justify-between items-center font-mono">
                    <div>
                      <span className="text-xs font-sans font-bold text-slate-800 block">Importe total transacción:</span>
                      <span className="text-[10px] text-slate-500 font-sans">Movimiento bancario procesado correctamente</span>
                    </div>
                    <span className="text-xl font-extrabold px-3 py-1.5 rounded-lg border text-emerald-800 bg-emerald-50 border-emerald-300">
                      {formatNumber(tx?.amount || 0)} €
                    </span>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documento y justificante de liquidación bancaria emitida electrónicamente.
                </div>
              </div>
            );
          })()}

          {/* DOCUMENT TYPE 6: OFFICIAL PAYROLL PAYSLIP */}
          {data.type === 'payroll_payslip' && (() => {
            const emp = data.hiredEmployee;
            const empName = data.employeeName || emp?.employeeName || 'Empleado/a';
            const compName = data.studentName || 'Alumno';
            const compCif = data.studentNifCif || 'B-99887766';
            const monthStr = data.periodMonth || new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            
            const hireDateStr = emp?.hireDate ? new Date(emp.hireDate).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES');
            
            const gross = data.proportionalGross !== undefined 
              ? data.proportionalGross 
              : (emp ? emp.grossSalaryMonthly : 2000);
            
            const irpf = data.irpfAmount !== undefined ? data.irpfAmount : Math.round(gross * 0.17 * 100) / 100;
            const ssEmp = data.ssEmployeeAmount !== undefined ? data.ssEmployeeAmount : Math.round(gross * 0.0648 * 100) / 100;
            const net = data.netSalary !== undefined ? data.netSalary : Math.round((gross - irpf - ssEmp) * 100) / 100;
            const ssComp = data.ssCompanyAmount !== undefined ? data.ssCompanyAmount : Math.round(gross * 0.75 * 100) / 100;
            const totalCost = data.totalCompanyCost !== undefined ? data.totalCompanyCost : Math.round((gross + ssComp) * 100) / 100;

            const workedDays = data.workedDays || 31;
            const totalDays = data.totalMonthDays || 31;

            return (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-5">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <Receipt className="w-6 h-6 text-blue-700" />
                      <span>Nómina individual de salarios</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 font-mono">
                      Recibo oficial de salarios • Ley de contrato de trabajo
                    </p>
                  </div>

                  <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-blue-800 block">Periodo de liquidación</span>
                    <span className="text-sm font-extrabold text-slate-900 block capitalize">{monthStr}</span>
                    <span className="text-[11px] text-blue-700 font-semibold block mt-0.5">
                      {workedDays} días trabajados (Base {totalDays} días)
                    </span>
                  </div>
                </div>

                {/* Company & Employee Data Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Datos de la empresa
                    </span>
                    <p className="font-bold text-slate-900">{compName}</p>
                    <p className="text-slate-600">CIF / NIF: <span className="font-mono">{compCif}</span></p>
                    <p className="text-slate-600">C.C.C. Seg. Social: <span className="font-mono">28/1234567/89</span></p>
                    <p className="text-slate-600">Domicilio: Polígono Industrial de España, Naves 1-4</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      Datos del trabajador / trabajadora
                    </span>
                    <p className="font-bold text-slate-900">{empName}</p>
                    <p className="text-slate-600">NIF / NIE: <span className="font-mono">12345678-Z</span></p>
                    <p className="text-slate-600">N.º Afiliación S.S.: <span className="font-mono">28 98765432 10</span></p>
                    <p className="text-slate-600">Categoría / puesto: Operario industrial de producción</p>
                    <p className="text-slate-600">Fecha de alta / antigüedad: <span className="font-mono">{hireDateStr}</span></p>
                  </div>
                </div>

                {/* DEVENGOS Y DEDUCCIONES TABLE */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold uppercase text-[10px]">
                        <th className="p-2.5">Concepto salarial / estructura</th>
                        <th className="p-2.5 text-right w-28">Devengos (€)</th>
                        <th className="p-2.5 text-right w-28">Deducciones (€)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                      {/* DEVENGOS */}
                      <tr className="bg-slate-50/70 font-semibold text-slate-800">
                        <td className="p-2.5 font-sans">
                          1. Devengos (percepciones salariales)
                          {workedDays < totalDays && (
                            <span className="block text-[10px] text-blue-700 font-medium">
                              * Ajuste proporcional por contratación el día {new Date(emp?.hireDate || Date.now()).getDate()} ({workedDays}/{totalDays} días)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                      </tr>
                      <tr>
                        <td className="p-2.5 pl-6 font-sans text-slate-700">Salario base del puesto / turno asignado</td>
                        <td className="p-2.5 text-right text-slate-900 font-bold">{formatNumber(gross)} €</td>
                        <td className="p-2.5 text-right"></td>
                      </tr>

                      {/* TOTAL DEVENGADO */}
                      <tr className="bg-blue-50/50 font-bold border-t border-b border-blue-200">
                        <td className="p-2.5 font-sans text-blue-900 uppercase text-[10px]">A. Total devengado (sueldo bruto)</td>
                        <td className="p-2.5 text-right text-blue-900">{formatNumber(gross)} €</td>
                        <td className="p-2.5 text-right"></td>
                      </tr>

                      {/* DEDUCCIONES */}
                      <tr className="bg-slate-50/70 font-semibold text-slate-800">
                        <td className="p-2.5 font-sans">2. Deducciones a cargo del trabajador</td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right"></td>
                      </tr>
                      <tr>
                        <td className="p-2.5 pl-6 font-sans text-slate-700">Aportación Seg. Social - Contingencias comunes (4,70%)</td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right text-slate-800">{formatNumber(Math.round(gross * 0.047 * 100) / 100)} €</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 pl-6 font-sans text-slate-700">Aportación Seg. Social - Desempleo (1,55%)</td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right text-slate-800">{formatNumber(Math.round(gross * 0.0155 * 100) / 100)} €</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 pl-6 font-sans text-slate-700">Aportación Seg. Social - Formación profesional (0,10%)</td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right text-slate-800">{formatNumber(Math.round(gross * 0.001 * 100) / 100)} €</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="p-2.5 pl-6 font-sans text-slate-800 font-bold">Subtotal aportaciones Seguridad Social trabajador (6,48%)</td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right text-slate-900 font-bold">{formatNumber(ssEmp)} €</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 pl-6 font-sans text-slate-700">Retención a cuenta del IRPF (17,00%)</td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right text-slate-900 font-bold">{formatNumber(irpf)} €</td>
                      </tr>

                      {/* TOTAL DEDUCCIONES */}
                      <tr className="bg-amber-50/50 font-bold border-t border-b border-amber-200">
                        <td className="p-2.5 font-sans text-amber-900 uppercase text-[10px]">B. Total deducciones (SS + IRPF)</td>
                        <td className="p-2.5 text-right"></td>
                        <td className="p-2.5 text-right text-amber-900">{formatNumber(ssEmp + irpf)} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* LIQUIDO A PERCIBIR BOX */}
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4 flex justify-between items-center font-mono">
                  <div>
                    <span className="text-xs font-sans font-bold text-emerald-950 uppercase block">Líquido total a percibir (sueldo neto):</span>
                    <span className="text-[11px] text-emerald-800 font-sans">Abonado por transferencia bancaria el día 26 de cada mes</span>
                  </div>
                  <span className="text-2xl font-black px-4 py-1.5 rounded-lg border text-emerald-900 bg-white border-emerald-400 shadow-xs">
                    {formatNumber(net)} €
                  </span>
                </div>

                {/* DETERMINACIÓN DE BASES Y APORTACIÓN EMPRESA */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider border-b border-slate-200 pb-1.5">
                    Determinación de bases de cotización y aportación a cargo de la empresa
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans block">Base cotización contingencias</span>
                      <span className="font-bold text-slate-900">{formatNumber(gross)} €</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans block">Aportación empresa SS (75,00%)</span>
                      <span className="font-bold text-indigo-900">{formatNumber(ssComp)} €</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans block">Coste total empresa</span>
                      <span className="font-bold text-slate-900">{formatNumber(totalCost)} €</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documento e impreso oficial de nómina generado por el simulador contable corporativo.
                </div>
              </div>
            );
          })()}

        </div>
      </div>
    </div>,
    document.body
  );
}
