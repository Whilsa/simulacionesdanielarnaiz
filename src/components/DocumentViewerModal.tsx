/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, X, FileText, Landmark, Building2, CheckCircle2, 
  Copy, Check, Info, ShieldCheck, ArrowDown, Receipt, Calculator, Wrench, Clock
} from 'lucide-react';
import { PropertyAcquisition, BankLoan, AmortizationRow, PaymentObligation, MachineryAcquisition } from '../types.js';

export type DocumentType = 'property_invoice' | 'machinery_invoice' | 'obligation_statement' | 'loan_statement';

export interface DocumentViewerData {
  type: DocumentType;
  // Property or machinery purchase fields
  acquisition?: PropertyAcquisition;
  machineryAcquisition?: MachineryAcquisition;
  
  // Obligation statement fields
  obligation?: PaymentObligation;
  
  // Loan statement fields
  loan?: BankLoan;
  loanInstallment?: AmortizationRow;
  installmentPeriod?: number;
}

interface DocumentViewerModalProps {
  data: DocumentViewerData;
  onClose: () => void;
}

export default function DocumentViewerModal({ data, onClose }: DocumentViewerModalProps) {
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    window.print();
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

Base Imponible: ${basePrice.toLocaleString('es-ES')} €
IVA (21%): ${ivaAmount.toLocaleString('es-ES')} €
TOTAL FACTURA: ${totalPrice.toLocaleString('es-ES')} €
------------------------------------------------
CONDICIONES DE PAGO:
- Parte Pagada al Contado (Entrada / Inicial): ${downPayment.toLocaleString('es-ES')} €
- Parte Pendiente de Pago (Saldo Aplazado): ${pendingBalance.toLocaleString('es-ES')} €
Forma de Pago: ${acq?.paymentMethod === 'contado' ? 'Al Contado' : 'Pago Aplazado (Letras / Pagarés)'}
================================================`;
    } else if (data.type === 'machinery_invoice') {
      const mac = data.machineryAcquisition;
      const title = mac?.title || mac?.lineTitle || 'Línea de Producción Industrial';
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
Línea: ${title} (${mac?.optionTitle || 'Configuración Estándar'})
Ubicación Instalada: ${mac?.installationNaveTitle || 'Nave Industrial'}
Capacidad Producción: ${mac?.productionCapacityUnitsPerHour || 60} unid/hora
Plazo de Montaje: 5 Días Reales (Estado: ${mac?.status === 'montaje' ? 'En Montaje' : 'En Funcionamiento'})

Base Imponible (Llave en mano): ${basePrice.toLocaleString('es-ES')} €
IVA (21%): ${ivaAmount.toLocaleString('es-ES')} €
TOTAL FACTURA: ${totalPrice.toLocaleString('es-ES')} €
------------------------------------------------
CONDICIONES DE PAGO:
- Parte Pagada al Contado (Entrada + IVA): ${downPayment.toLocaleString('es-ES')} €
- Parte Pendiente de Pago (Saldo Aplazado en Pagarés): ${pendingBalance.toLocaleString('es-ES')} €
Forma de Pago: ${mac?.paymentMethod === 'contado' ? 'Al Contado' : 'Pago Aplazado (24 Pagarés Mensuales)'}
================================================`;
    } else if (data.type === 'obligation_statement') {
      const ob = data.obligation;
      const code = `EXT-2026-${(ob?.id || '001').toUpperCase()}`;
      const isPaid = ob?.status === 'pagado';
      const instrumentName = ob?.type === 'pagare' ? 'Pagaré Mercantil' : ob?.type === 'letra_cambio' ? 'Letra de Cambio' : 'Cuota de Alquiler';

      textContent = `================================================
EXTRACTO CONTABLE DE PAGO APLAZADO / EFECTO MERCANTIL
Nº Extracto Único: ${code}
Fecha Emisión Extracto: ${new Date().toLocaleDateString('es-ES')}
------------------------------------------------
TITULAR Y DEUDOR:
${ob?.studentName || 'Empresa Estudiante'}

OPERACIÓN ORIGEN:
Concepto: ${ob?.propertyTitle || 'Operación Empresarial'}
Tipo de Efecto: ${instrumentName} (${ob?.installmentNumber || 1}/${ob?.totalInstallments || 1})
Vencimiento: ${new Date(ob?.dueDate || Date.now()).toLocaleDateString('es-ES')}
------------------------------------------------
LIQUIDACIÓN DEL VENCIMIENTO:
Importe del Vencimiento: ${(ob?.amount || 0).toLocaleString('es-ES')} €
Estado: ${isPaid ? `PAGADO Y ABONADO el ${new Date(ob?.paidDate || Date.now()).toLocaleDateString('es-ES')}` : 'PENDIENTE DE COBRO / VENCIMIENTO'}
================================================`;
    } else if (data.type === 'loan_statement') {
      const loan = data.loan;
      const row = data.loanInstallment || (data.installmentPeriod && loan?.schedule ? loan.schedule.find(s => s.period === data.installmentPeriod) : undefined);
      const principal = loan?.approvedAmount || loan?.offeredAmount || 0;
      const annualRate = (loan?.annualInterestRate || 4.50);

      const scheduleText = (loan?.schedule || []).map(s => 
        `Mes ${s.period} [${new Date(s.dueDate).toLocaleDateString('es-ES')}]: Cuota: ${s.payment} € | Capital: ${s.principal} € | Interés: ${s.interest} € | Cap. Pendiente: ${s.pendingBalance} €`
      ).join('\n');

      textContent = `================================================
BANCO CENTRAL HIPOTECARIO S.A.
PÓLIZA DE PRÉSTAMO HIPOTECARIO Y LIQUIDACIÓN
Nº Póliza Única: POL-HIP-2026-${(loan?.id || '000').toUpperCase()}
Fecha: ${new Date().toLocaleDateString('es-ES')}
------------------------------------------------
PRESTATARIO / TITULAR:
${loan?.studentName || 'Estudiante'}
IBAN de Cuenta: ${loan?.studentAccount || 'ES21...'}

CONDICIONES FINANCIERAS:
Capital Concedido: ${principal.toLocaleString('es-ES')} €
Tipo de Interés: ${annualRate.toFixed(2)}% TIN
Plazo: ${loan?.termMonths || 36} Meses
Comisión Apertura (0.10%): ${(principal * 0.001).toLocaleString('es-ES')} €

${row ? `
LIQUIDACIÓN DE CUOTA Nº ${row.period}:
Vencimiento: ${new Date(row.dueDate).toLocaleDateString('es-ES')}
- Amortización Capital: ${row.principal.toLocaleString('es-ES')} €
- Intereses Periodo: ${row.interest.toLocaleString('es-ES')} €
- TOTAL CUOTA: ${row.payment.toLocaleString('es-ES')} €
- Capital Pendiente tras Cuota: ${row.pendingBalance.toLocaleString('es-ES')} €
` : ''}
------------------------------------------------
CUADRO COMPLETO DE AMORTIZACIÓN:
${scheduleText}
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
              {data.type === 'obligation_statement' ? 'Extracto Contable de Pago Aplazado' : 'Factura Oficial / Documento Contable (Vista de Impresión)'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyText}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer border border-slate-700"
              title="Copiar texto para ejercicios de contabilidad"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Guardar PDF</span>
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
        <div className="p-8 sm:p-12 overflow-y-auto font-sans text-slate-900 space-y-8 print:p-0 print:overflow-visible text-xs">
          
          {/* DOCUMENT TYPE 1: PROPERTY INVOICE */}
          {data.type === 'property_invoice' && (() => {
            const acq = data.acquisition;
            const title = acq?.propertyTitle || 'Inmueble Comercial';
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
                      <span>INMOBILIARIA POLÍGONOS DE ESPAÑA S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Promoción, Gestión e Inversiones Inmobiliarias
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-28009988 | Registro Mercantil de Madrid, Tomo 1420, Folio 45
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Av. de la Industria 45, Polígono Industrial, 28009 Madrid
                    </p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">FACTURA OFICIAL ÚNICA</span>
                    <span className="text-base font-extrabold text-slate-900 block">{invoiceNo}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">Fecha: {issueDate}</span>
                  </div>
                </div>

                {/* Issuer & Client Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      DATOS DEL EMISOR / VENDEDOR
                    </span>
                    <p className="font-bold text-slate-900">Inmobiliaria Polígonos de España S.A.</p>
                    <p className="text-slate-600">CIF: A-28009988</p>
                    <p className="text-slate-600">Domicilio: Av. de la Industria 45, Madrid</p>
                    <p className="text-slate-600 font-mono">IBAN Cobro: ES21 0001 0002 9988 7755</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      DATOS DEL CLIENTE / RECEPTOR
                    </span>
                    <p className="font-bold text-slate-900">{acq?.studentName || 'Empresa Estudiante S.L.'}</p>
                    <p className="text-slate-600">NIF/CIF: B-87654321</p>
                    <p className="text-slate-600">Titular de Cuenta de Explotación Comercial</p>
                    <p className="text-slate-600 font-mono">Ref. Adquisición: #{acq?.id || '001'}</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider print:bg-slate-900 print:text-white">
                        <th className="p-3">Concepto y Descripción del Inmueble</th>
                        <th className="p-3 text-center">Superficie</th>
                        <th className="p-3 text-right">Base Imponible</th>
                        <th className="p-3 text-right">IVA (21%)</th>
                        <th className="p-3 text-right">Total Importe</th>
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
                            Ubicación: {acq?.location || 'Polígono Industrial'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold">{acq?.surfaceM2 || 150} m²</td>
                        <td className="p-3 text-right font-medium">{basePrice.toLocaleString('es-ES')} €</td>
                        <td className="p-3 text-right font-medium text-slate-600">{ivaAmount.toLocaleString('es-ES')} €</td>
                        <td className="p-3 text-right font-bold text-slate-900">{totalPrice.toLocaleString('es-ES')} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Payment Breakdown Box: Cash vs Deferred */}
                <div className="p-5 bg-amber-50 rounded-xl border border-amber-300 space-y-3 font-mono">
                  <h4 className="font-bold text-amber-900 font-sans text-xs flex items-center space-x-1.5 uppercase tracking-wider">
                    <Receipt className="w-4 h-4 text-amber-700" />
                    <span>DESGLOSE Y CONDICIONES DE PAGO DE LA COMPRA</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="p-3.5 bg-white rounded-lg border border-amber-200">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">Parte Pagada al Contado (Entrada)</span>
                      <span className="text-base font-extrabold text-emerald-900 block font-mono">{downPayment.toLocaleString('es-ES')} €</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">Abonado mediante transferencia bancaria inicial</span>
                    </div>

                    <div className="p-3.5 bg-white rounded-lg border border-amber-200">
                      <span className="text-[10px] font-bold text-amber-800 uppercase block mb-1">Parte Pendiente de Pago (Saldo Aplazado)</span>
                      <span className="text-base font-extrabold text-amber-900 block font-mono">{pendingBalance.toLocaleString('es-ES')} €</span>
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
                      <span>DESGLOSE PATRIMONIAL LEGAL Y CONTABLE</span>
                    </h4>

                    <div className="grid grid-cols-2 gap-4 pt-1 font-mono text-xs">
                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Subcuenta (210) Terrenos ({landPct}%)</span>
                        <span className="text-sm font-bold text-slate-900 block">{landValue.toLocaleString('es-ES')} €</span>
                        <span className="text-[10px] text-slate-500 font-sans">Bien NO amortizable</span>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Subcuenta (211) Construcciones ({100 - landPct}%)</span>
                        <span className="text-sm font-bold text-slate-900 block">{buildingValue.toLocaleString('es-ES')} €</span>
                        <span className="text-[10px] text-slate-500 font-sans">Amortizable linealmente (2.00% anual)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Total Summary Footer */}
                <div className="flex justify-end pt-2">
                  <div className="w-full sm:w-80 bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono print:bg-slate-900 print:text-white border border-slate-900">
                    <div className="flex justify-between text-xs text-slate-300 print:text-slate-200">
                      <span>Base Imponible:</span>
                      <span>{basePrice.toLocaleString('es-ES')} €</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300 print:text-slate-200">
                      <span>21.00% IVA Soportado:</span>
                      <span>+{ivaAmount.toLocaleString('es-ES')} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-sm text-amber-400 print:text-amber-300">
                      <span>TOTAL FACTURA:</span>
                      <span>{totalPrice.toLocaleString('es-ES')} €</span>
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
            const title = mac?.title || mac?.lineTitle || 'Línea de Producción Industrial';
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
                      <span>MAQUINARIAS E INSTALACIONES INDUSTRIALES S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Suministros Llave en Mano de Líneas de Producción y Torneado
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-99887766 | Reg. Mercantil de Madrid, Tomo 8810, Folio 12
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Polígono Industrial Central, Av. de la Tecnología 12, Madrid
                    </p>
                  </div>

                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-300 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-amber-800 block">FACTURA OFICIAL ÚNICA</span>
                    <span className="text-base font-extrabold text-slate-900 block">{invoiceNo}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">Fecha: {issueDate}</span>
                  </div>
                </div>

                {/* Issuer & Client Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      PROVEEDOR / EMISOR
                    </span>
                    <p className="font-bold text-slate-900">Maquinarias e Instalaciones Industriales S.A.</p>
                    <p className="text-slate-600">CIF: A-99887766</p>
                    <p className="text-slate-600">Domicilio: Polígono Industrial Central, Madrid</p>
                    <p className="text-slate-600 font-mono">IBAN Cobro: ES21 0001 0002 9988 7799</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      CLIENTE / COMPRADOR
                    </span>
                    <p className="font-bold text-slate-900">{mac?.studentName || 'Empresa Estudiante'}</p>
                    <p className="text-slate-600">Ubicación Instalación: {mac?.installationNaveTitle || 'Nave Industrial'}</p>
                    <p className="text-slate-600 font-mono">Ref. Maquinaria: #{mac?.id || '001'}</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider print:bg-slate-900 print:text-white">
                        <th className="p-3">Concepto y Especificación de la Maquinaria</th>
                        <th className="p-3 text-center">Capacidad</th>
                        <th className="p-3 text-right">Base Imponible</th>
                        <th className="p-3 text-right">IVA (21%)</th>
                        <th className="p-3 text-right">Total Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono text-xs">
                      <tr>
                        <td className="p-3 font-sans">
                          <span className="font-bold text-slate-900 block">{title}</span>
                          <span className="text-[11px] text-amber-900 block font-semibold">
                            {mac?.optionTitle || 'Configuración Industrial Estándar'}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Precio llave en mano: incluye transporte, seguro de transporte y montaje completo.
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-800">{mac?.productionCapacityUnitsPerHour || 60} u/h</td>
                        <td className="p-3 text-right font-medium">{basePrice.toLocaleString('es-ES')} €</td>
                        <td className="p-3 text-right font-medium text-slate-600">{ivaAmount.toLocaleString('es-ES')} €</td>
                        <td className="p-3 text-right font-bold text-slate-900">{totalPrice.toLocaleString('es-ES')} €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Assembly and Delivery Notice */}
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950">
                    <strong className="block font-extrabold text-amber-900">Plazo Oficial de Montaje de 5 Días Reales:</strong>
                    La maquinaria se entrega en régimen de montaje con un periodo garantizado de 5 días reales desde la compra antes de estar 100% operativa. Estado actual: <span className="font-bold uppercase text-amber-800">{mac?.status === 'montaje' ? 'En Montaje' : 'En Funcionamiento / Operativa'}</span>.
                  </div>
                </div>

                {/* Payment Breakdown Box */}
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-300 space-y-3 font-mono">
                  <h4 className="font-bold text-slate-900 font-sans text-xs flex items-center space-x-1.5 uppercase tracking-wider">
                    <Receipt className="w-4 h-4 text-slate-700" />
                    <span>CONDICIONES Y DESGLOSE DE PAGO</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="p-3.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">Parte Pagada al Contado (Entrada + IVA)</span>
                      <span className="text-base font-extrabold text-emerald-900 block font-mono">{downPayment.toLocaleString('es-ES')} €</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">Abonado en cuenta al formalizar la compra</span>
                    </div>

                    <div className="p-3.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] font-bold text-amber-800 uppercase block mb-1">Parte Pendiente de Pago (Saldo Aplazado en Pagarés)</span>
                      <span className="text-base font-extrabold text-amber-900 block font-mono">{pendingBalance.toLocaleString('es-ES')} €</span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {pendingBalance > 0 ? 'Financiado en 24 pagarés mensuales de vencimiento automático' : 'Sin saldo pendiente / Pago al contado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total Summary Footer */}
                <div className="flex justify-end pt-2">
                  <div className="w-full sm:w-80 bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono print:bg-slate-900 print:text-white border border-slate-900">
                    <div className="flex justify-between text-xs text-slate-300 print:text-slate-200">
                      <span>Base Imponible Llave en Mano:</span>
                      <span>{basePrice.toLocaleString('es-ES')} €</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300 print:text-slate-200">
                      <span>21.00% IVA Soportado:</span>
                      <span>+{ivaAmount.toLocaleString('es-ES')} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-sm text-amber-400 print:text-amber-300">
                      <span>TOTAL FACTURA:</span>
                      <span>{totalPrice.toLocaleString('es-ES')} €</span>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documento emitido electrónicamente. Código de factura único e irrepetible.
                </div>

              </div>
            );
          })()}

          {/* DOCUMENT TYPE 3: OBLIGATION STATEMENT (EXTRACTO DE PAGO) */}
          {data.type === 'obligation_statement' && (() => {
            const ob = data.obligation;
            const extractNo = `EXT-2026-${(ob?.id || '001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
            const isPaid = ob?.status === 'pagado';
            const instrumentName = ob?.type === 'pagare' ? 'Pagaré Mercantil' : ob?.type === 'letra_cambio' ? 'Letra de Cambio' : 'Cuota de Alquiler';

            return (
              <div className="space-y-8">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-6">
                  <div>
                    <div className="flex items-center space-x-2 text-slate-900 font-black text-lg tracking-tight">
                      <FileText className="w-6 h-6 text-indigo-700" />
                      <span>TENEDOR DE EFECTOS Y SERVICIOS FINANCIEROS S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Gestión Contable de Efectos Mercantiles y Compromisos de Pago Aplazado
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-28001122 | Registro Mercantil de Madrid, Tomo 9912, Folio 30
                    </p>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-indigo-800 block">EXTRACTO CONTABLE ÚNICO</span>
                    <span className="text-base font-extrabold text-slate-900 block">{extractNo}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">
                      Fecha Extracto: {new Date().toLocaleDateString('es-ES')}
                    </span>
                  </div>
                </div>

                {/* Issuer & Client Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      TENEDOR DEL EFECTO / BENEFICIARIO
                    </span>
                    <p className="font-bold text-slate-900">Tenedor de Efectos Comerciales S.A.</p>
                    <p className="text-slate-600">NIF: A-28001122</p>
                    <p className="text-slate-600 font-mono">Cuenta Cobro: ES21 0001 0002 9988 7755</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      DEUDOR / TITULAR DE LA EMPRESA
                    </span>
                    <p className="font-bold text-slate-900">{ob?.studentName || 'Empresa Estudiante'}</p>
                    <p className="text-slate-600">Estado Vencimiento: <span className={`font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>{isPaid ? 'PAGADO Y LIQUIDADO' : 'PENDIENTE DE COBRO'}</span></p>
                  </div>
                </div>

                {/* Extract Detail Box */}
                <div className="border border-slate-300 rounded-xl p-5 bg-slate-50 space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-200 pb-2 flex items-center justify-between">
                    <span>DETALLE DEL VENCIMIENTO APLAZADO</span>
                    <span className="text-[10px] font-mono text-slate-500">Ref Obligación: #{ob?.id}</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Operación Origen</span>
                      <span className="text-xs font-bold text-slate-900 block mt-0.5">{ob?.propertyTitle || 'Adquisición de Activo'}</span>
                    </div>

                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Tipo de Efecto / Cuota</span>
                      <span className="text-xs font-bold text-slate-900 block mt-0.5">
                        {instrumentName} {ob?.installmentNumber ? `(${ob.installmentNumber}/${ob.totalInstallments || 24})` : ''}
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Fecha de Vencimiento</span>
                      <span className="text-xs font-bold text-slate-900 block mt-0.5">
                        {new Date(ob?.dueDate || Date.now()).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-slate-200 flex justify-between items-center font-mono">
                    <div>
                      <span className="text-xs font-sans font-bold text-slate-800 block">IMPORTE DEL EXTRACTO / VENCIMIENTO:</span>
                      <span className="text-[10px] text-slate-500 font-sans">
                        {isPaid ? `Abonado en cuenta el ${new Date(ob?.paidDate || Date.now()).toLocaleDateString('es-ES')}` : 'Cargo programado mediante vencimiento automático'}
                      </span>
                    </div>
                    <span className={`text-lg font-extrabold px-3 py-1 rounded-lg border ${isPaid ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-900 bg-amber-50 border-amber-300'}`}>
                      {(ob?.amount || 0).toLocaleString('es-ES')} €
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
                      <span>BANCO CENTRAL HIPOTECARIO S.A.</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Departamento de Riesgos y Crédito Hipotecario Empresarial
                    </p>
                    <p className="text-[10px] text-slate-400">
                      NIF: A-88776655 | Reg. Mercantil de Madrid, Tomo 12450, Folio 88
                    </p>
                  </div>

                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-300 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 block">PÓLIZA DE PRÉSTAMO ÚNICA</span>
                    <span className="text-base font-extrabold text-slate-900 block">POL-HIP-2026-{(loan?.id || '001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}</span>
                    <span className="text-[11px] text-slate-600 block mt-1">
                      Fecha Operación: {new Date(loan?.createdAt || Date.now()).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                </div>

                {/* Loan Borrower Details & Account Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      ENTIDAD BANCARIA FINANCIADORA
                    </span>
                    <p className="font-bold text-slate-900">Banco Central Hipotecario S.A.</p>
                    <p className="text-slate-600">NIF: A-88776655</p>
                    <p className="text-slate-600 font-mono">Cuenta Emisora Fondo: ES21 0001 0002 9988 7700</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block border-b border-slate-200 pb-1">
                      PRESTATARIO / TITULAR DE LA OPERACIÓN
                    </span>
                    <p className="font-bold text-slate-900">{loan?.studentName || 'Empresa Estudiante'}</p>
                    <p className="text-slate-600 font-mono">IBAN Abono/Adeudo: {loan?.studentAccount || 'ES21...'}</p>
                    <p className="text-slate-600">Estado de Operación: <span className="font-bold text-emerald-700">ACTIVO Y CONCEDIDO</span></p>
                  </div>
                </div>

                {/* Financial Terms Summary Box */}
                <div className="border border-slate-300 rounded-xl p-5 bg-slate-50 space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-200 pb-2">
                    CONDICIONES FINANCIERAS Y ESTRUCTURA DE LA PÓLIZA
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Capital Concedido</span>
                      <span className="text-sm font-bold text-slate-900">{principal.toLocaleString('es-ES')} €</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Tipo de Interés (TIN)</span>
                      <span className="text-sm font-bold text-slate-900">{annualRate.toFixed(2)}%</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Plazo Amortización</span>
                      <span className="text-sm font-bold text-slate-900">{loan?.termMonths || 36} Meses</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Comisión Apertura</span>
                      <span className="text-sm font-bold text-slate-900">{openingFee.toLocaleString('es-ES')} €</span>
                    </div>
                  </div>
                </div>

                {/* CUADRO COMPLETO DE AMORTIZACIÓN DEL PRÉSTAMO */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-4 h-4 text-emerald-800 shrink-0" />
                      <h3 className="font-extrabold text-slate-900 uppercase text-xs tracking-wider">
                        CUADRO COMPLETO DE AMORTIZACIÓN (SISTEMA FRANCÉS)
                      </h3>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-300 rounded-xl">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 uppercase text-[10px]">
                          <th className="py-2 px-2 text-center w-10">N.º</th>
                          <th className="py-2 px-2.5">Vencimiento</th>
                          <th className="py-2 px-2.5 text-right">Cuota Total</th>
                          <th className="py-2 px-2.5 text-right">Capital</th>
                          <th className="py-2 px-2.5 text-right">Intereses</th>
                          <th className="py-2 px-2.5 text-right">Cap. Pendiente</th>
                          <th className="py-2 px-2 text-center w-20">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono text-slate-800 text-[10.5px]">
                        {schedule.map((sRow) => (
                          <tr key={sRow.period} className={sRow.period % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'}>
                            <td className="py-1.5 px-2 text-center font-bold text-slate-600">{sRow.period}</td>
                            <td className="py-1.5 px-2.5 font-sans">{new Date(sRow.dueDate).toLocaleDateString('es-ES')}</td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-slate-900">{sRow.payment.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="py-1.5 px-2.5 text-right text-emerald-800 font-medium">{sRow.principal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="py-1.5 px-2.5 text-right text-amber-800">{sRow.interest.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-slate-900">{sRow.pendingBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="py-1.5 px-2 text-center font-sans text-[9.5px]">
                              {sRow.paid ? (
                                <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">PAGADO</span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">PENDIENTE</span>
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

        </div>
      </div>
    </div>,
    document.body
  );
}
