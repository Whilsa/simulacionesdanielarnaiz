/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Printer, X, FileText, Landmark, Building2, CheckCircle2, 
  Copy, Check, Info, ShieldCheck, ArrowDown, Receipt, Calculator
} from 'lucide-react';
import { PropertyAcquisition, BankLoan, AmortizationRow, PaymentObligation } from '../types.js';

export type DocumentType = 'property_invoice' | 'loan_statement';

export interface DocumentViewerData {
  type: DocumentType;
  // Property invoice fields
  acquisition?: PropertyAcquisition;
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
      const ob = data.obligation;
      const title = acq?.propertyTitle || ob?.propertyTitle || 'Inmueble Comercial';
      const isRent = acq?.operation === 'alquiler' || ob?.type === 'cuota_alquiler';
      const basePrice = acq?.basePrice || (ob ? Number((ob.amount / 1.21).toFixed(2)) : 0);
      const ivaAmount = acq?.ivaAmount || (ob ? Number((ob.amount - basePrice).toFixed(2)) : 0);
      const totalPrice = acq?.totalPrice || ob?.amount || 0;
      const landPct = acq?.landPercentage || 30;
      const landValue = Number(((basePrice * landPct) / 100).toFixed(2));
      const buildingValue = Number((basePrice - landValue).toFixed(2));

      textContent = `================================================
FACTURA OFICIAL DE ${isRent ? 'ARRENDAMIENTO' : 'COMPRAVENTA'}
Nº Factura: FACT-2026-${(acq?.id || ob?.id || '101').slice(-6)}
Fecha de Expedición: ${new Date(acq?.purchaseDate || ob?.dueDate || Date.now()).toLocaleDateString('es-ES')}
------------------------------------------------
EMISOR (Vendedor/Arrendador):
Inmobiliaria Polígonos de España S.A.
NIF: A-28009988 | C/ Alcalá 140, 28009 Madrid
IBAN Cobro: ES21 0001 0002 9988 7755

CLIENTE / COMPRADOR:
${acq?.studentName || ob?.studentName || 'Empresa Estudiante'}
NIF: B-87654321
------------------------------------------------
DESGLOSE DEL INMUEBLE:
Inmueble: ${title}
Superficie: ${acq?.surfaceM2 || 'N/A'} m² | Ubicación: ${acq?.location || 'España'}

${!isRent ? `
Desglose Patrimonial Base:
- Valor Terreno/Suelo (${landPct}%): ${landValue.toLocaleString('es-ES')} € (No Amortizable)
- Valor Edificación (${100 - landPct}%): ${buildingValue.toLocaleString('es-ES')} € (Amortizable 2%/año)
` : ''}
Base Imponible: ${basePrice.toLocaleString('es-ES')} €
IVA (21%): ${ivaAmount.toLocaleString('es-ES')} €
------------------------------------------------
TOTAL FACTURA: ${totalPrice.toLocaleString('es-ES')} €
Forma de Pago: Domiciliación bancaria / Pagaré / Contado
================================================`;
    } else if (data.type === 'loan_statement') {
      const loan = data.loan;
      const row = data.loanInstallment || (data.installmentPeriod && loan?.schedule ? loan.schedule.find(s => s.period === data.installmentPeriod) : undefined);
      const principal = loan?.approvedAmount || loan?.offeredAmount || 0;
      const annualRate = (loan?.annualInterestRate || 4.50);

      // Get or compute amortization schedule
      const schedule: AmortizationRow[] = (loan?.schedule && loan.schedule.length > 0)
        ? loan.schedule
        : (() => {
            const term = loan?.termMonths || 36;
            const monthlyRate = (annualRate / 100) / 12;
            const payment = monthlyRate > 0 && principal > 0
              ? Number((principal * (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1)).toFixed(2))
              : 0;

            let balance = principal;
            let totalAmortized = 0;
            const rows: AmortizationRow[] = [];
            const startDate = new Date(loan?.createdAt || Date.now());

            for (let i = 1; i <= term; i++) {
              const dueDate = new Date(startDate);
              dueDate.setMonth(dueDate.getMonth() + i);
              const interest = Number((balance * monthlyRate).toFixed(2));
              const pCap = Number((payment - interest).toFixed(2));
              balance = Math.max(0, Number((balance - pCap).toFixed(2)));
              totalAmortized = Number((totalAmortized + pCap).toFixed(2));

              rows.push({
                period: i,
                dueDate: dueDate.toISOString(),
                payment,
                interest,
                principal: pCap,
                totalAmortized,
                pendingBalance: balance,
                paid: false
              });
            }
            return rows;
          })();

      const scheduleText = schedule.map(s => 
        `Mes ${s.period} [${new Date(s.dueDate).toLocaleDateString('es-ES')}]: Cuota: ${s.payment} € | Capital: ${s.principal} € | Interés: ${s.interest} € | Cap. Pendiente: ${s.pendingBalance} €`
      ).join('\n');

      textContent = `================================================
BANCO CENTRAL HIPOTECARIO S.A.
PÓLIZA DE PRÉSTAMO HIPOTECARIO Y LIQUIDACIÓN
Nº Póliza: POL-HIP-${loan?.id || '000'}
Fecha: ${new Date().toLocaleDateString('es-ES')}
------------------------------------------------
PRESTATARIO / TITULAR:
${loan?.studentName || 'Estudiante'}
IBAN de Cuenta: ${loan?.studentAccount || 'ES21...'}

CONDICIONES FINANCIERAS:
Capital Concedido: ${principal.toLocaleString('es-ES')} €
Tipo de Interés: EURIBOR (3.50%) + Diferencial (1.00%) = ${annualRate.toFixed(2)}% TIN
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
CUADRO COMPLETO DE AMORTIZACIÓN (${schedule.length} MESES):
${scheduleText}
================================================`;
    }

    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto print:static print:p-0 print:bg-white print:block">
      {/* Container - A4 Paper Sheet Styling */}
      <div className="printable-document-modal bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-300 flex flex-col max-h-[92vh] overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none">
        
        {/* NON-PRINTABLE TOP CONTROL BAR */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between print:hidden shrink-0">
          <div className="flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-sm">
              Documento Contable / Factura Oficial (Vista de Impresión)
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
            const ob = data.obligation;
            const title = acq?.propertyTitle || ob?.propertyTitle || 'Inmueble Comercial';
            const isRent = acq?.operation === 'alquiler' || ob?.type === 'cuota_alquiler';
            const basePrice = acq?.basePrice || (ob ? Number((ob.amount / 1.21).toFixed(2)) : 0);
            const ivaAmount = acq?.ivaAmount || (ob ? Number((ob.amount - basePrice).toFixed(2)) : 0);
            const totalPrice = acq?.totalPrice || ob?.amount || 0;
            const landPct = acq?.landPercentage || 30;
            const landValue = Number(((basePrice * landPct) / 100).toFixed(2));
            const buildingValue = Number((basePrice - landValue).toFixed(2));
            const invoiceNo = `FACT-2026-${(acq?.id || ob?.id || '101').replace(/\D/g, '').slice(-6) || '001042'}`;
            const issueDate = new Date(acq?.purchaseDate || ob?.dueDate || Date.now()).toLocaleDateString('es-ES', {
              year: 'numeric', month: 'long', day: 'numeric'
            });

            return (
              <div className="space-y-8">
                
                {/* Header: Company Logo Placeholder (Text Vector) & Invoice Title */}
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
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">FACTURA OFICIAL</span>
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
                    <p className="font-bold text-slate-900">{acq?.studentName || ob?.studentName || 'Empresa Estudiante S.L.'}</p>
                    <p className="text-slate-600">NIF/CIF: B-87654321</p>
                    <p className="text-slate-600">Titular de Cuenta de Explotación Comercial</p>
                    <p className="text-slate-600 font-mono">IBAN Cliente: {acq?.id ? 'ES21 0001 0002 ...' : 'ES21...'}</p>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border border-slate-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider">
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

                {/* Property Accounting Breakdown Box (Land vs Building) */}
                {!isRent && (
                  <div className="p-4 bg-slate-100 rounded-xl border border-slate-300 space-y-2">
                    <h4 className="font-bold text-slate-900 flex items-center space-x-1 text-xs">
                      <ShieldCheck className="w-4 h-4 text-slate-700" />
                      <span>DESGLOSE PATRIMONIAL LEGAL Y CONTABLE (Según Valoración catastral)</span>
                    </h4>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      En cumplimiento del Plan General de Contabilidad, la valoración del inmueble se desglosa objetivamente entre la porción de suelo indestructible (Terrenos) y la edificación amortizable:
                    </p>

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
                  <div className="w-full sm:w-72 bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Base Imponible:</span>
                      <span>{basePrice.toLocaleString('es-ES')} €</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>21.00% IVA Soportado:</span>
                      <span>+{ivaAmount.toLocaleString('es-ES')} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-sm text-amber-400">
                      <span>TOTAL A PAGAR:</span>
                      <span>{totalPrice.toLocaleString('es-ES')} €</span>
                    </div>
                  </div>
                </div>

                {/* Footer stamp signature text */}
                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documento emitido electrónicamente en la plataforma educativa de Contabilidad Comercial e Inmobiliaria. Válido a efectos de justificación contable simulada.
                </div>

              </div>
            );
          })()}


          {/* DOCUMENT TYPE 2: BANK LOAN STATEMENT / CONTRACT */}
          {data.type === 'loan_statement' && (() => {
            const loan = data.loan;
            const row = data.loanInstallment || (data.installmentPeriod && loan?.schedule ? loan.schedule.find(s => s.period === data.installmentPeriod) : undefined);
            const principal = loan?.approvedAmount || loan?.offeredAmount || 0;
            const openingFee = Number((principal * 0.001).toFixed(2));
            const netDisbursed = Number((principal - openingFee).toFixed(2));
            const annualRate = (loan?.annualInterestRate || 4.50);

            // Get or calculate complete amortization schedule
            const schedule: AmortizationRow[] = (loan?.schedule && loan.schedule.length > 0)
              ? loan.schedule
              : (() => {
                  const term = loan?.termMonths || 36;
                  const monthlyRate = (annualRate / 100) / 12;
                  const payment = monthlyRate > 0 && principal > 0
                    ? Number((principal * (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1)).toFixed(2))
                    : 0;

                  let balance = principal;
                  let totalAmortized = 0;
                  const rows: AmortizationRow[] = [];
                  const startDate = new Date(loan?.createdAt || Date.now());

                  for (let i = 1; i <= term; i++) {
                    const dueDate = new Date(startDate);
                    dueDate.setMonth(dueDate.getMonth() + i);
                    const interest = Number((balance * monthlyRate).toFixed(2));
                    const pCap = Number((payment - interest).toFixed(2));
                    balance = Math.max(0, Number((balance - pCap).toFixed(2)));
                    totalAmortized = Number((totalAmortized + pCap).toFixed(2));

                    rows.push({
                      period: i,
                      dueDate: dueDate.toISOString(),
                      payment,
                      interest,
                      principal: pCap,
                      totalAmortized,
                      pendingBalance: balance,
                      paid: false
                    });
                  }
                  return rows;
                })();

            return (
              <div className="space-y-8">
                
                {/* Header: Bank Brand Logo (Vector Text) */}
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
                      NIF: A-88776655 | Reg. Mercantil de Madrid, Tomo 12450, Folio 88, Hoja M-198273
                    </p>
                    <p className="text-[10px] text-slate-400">
                      C/ Gran Vía 28, Central Corporativa, 28013 Madrid
                    </p>
                  </div>

                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-300 text-right w-full sm:w-auto font-mono">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 block">PÓLIZA DE PRÉSTAMO</span>
                    <span className="text-base font-extrabold text-slate-900 block">POL-HIP-2026-{(loan?.id || '001').slice(-6)}</span>
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
                    <p className="text-slate-600">Cuenta Emisora Fondo: ES21 0001 0002 9988 7700</p>
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
                      <span className="text-[9px] text-slate-500 font-sans block">(Euribor 3.50% + 1%)</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Plazo Amortización</span>
                      <span className="text-sm font-bold text-slate-900">{loan?.termMonths || 36} Meses</span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-sans uppercase block">Comisión Apertura</span>
                      <span className="text-sm font-bold text-slate-900">{openingFee.toLocaleString('es-ES')} €</span>
                      <span className="text-[9px] text-slate-500 font-sans block">(0.10% del principal)</span>
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-mono">
                    <div>
                      <span className="text-[11px] font-sans font-bold text-slate-800 block">Abono Neto Liquidado en Cuenta Bancaria:</span>
                      <span className="text-[10px] text-slate-500 font-sans">
                        Capital ({principal.toLocaleString('es-ES')} €) - Comisión de Apertura ({openingFee.toLocaleString('es-ES')} €)
                      </span>
                    </div>
                    <span className="text-base font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                      +{netDisbursed.toLocaleString('es-ES')} €
                    </span>
                  </div>
                </div>

                {/* Specific Installment Receipt Section (if triggered for a row) */}
                {row && (
                  <div className="p-5 bg-amber-50 rounded-xl border border-amber-300 space-y-3 font-mono">
                    <h4 className="font-bold text-amber-900 font-sans text-xs flex items-center space-x-1.5">
                      <Receipt className="w-4 h-4 text-amber-700" />
                      <span>RECIBO DE LIQUIDACIÓN DE CUOTA MENSUAL Nº {row.period} / {loan?.termMonths || 36}</span>
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white p-3.5 rounded-lg border border-amber-200">
                      <div>
                        <span className="text-[10px] text-slate-400 font-sans block">Vencimiento</span>
                        <span className="font-bold text-slate-900">{new Date(row.dueDate).toLocaleDateString('es-ES')}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-sans block">Amortización Capital</span>
                        <span className="font-bold text-slate-900">{row.principal.toLocaleString('es-ES')} €</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-sans block">Intereses Periodo</span>
                        <span className="font-bold text-slate-900">{row.interest.toLocaleString('es-ES')} €</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-sans block">TOTAL A CARGAR</span>
                        <span className="font-extrabold text-amber-900 text-sm">{row.payment.toLocaleString('es-ES')} €</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* CUADRO COMPLETO DE AMORTIZACIÓN DEL PRÉSTAMO (SISTEMA FRANCÉS) */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-4 h-4 text-emerald-800 shrink-0" />
                      <h3 className="font-extrabold text-slate-900 uppercase text-xs tracking-wider">
                        CUADRO COMPLETO DE AMORTIZACIÓN (SISTEMA FRANCÉS)
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-600 font-mono font-semibold">
                      {schedule.length} Meses | Cuota Constante: {schedule[0]?.payment.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €/mes
                    </span>
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
                          <th className="py-2 px-2.5 text-right">Total Amort.</th>
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
                            <td className="py-1.5 px-2.5 text-right text-slate-600">{sRow.totalAmortized.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-slate-900">{sRow.pendingBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                            <td className="py-1.5 px-2 text-center font-sans text-[9.5px]">
                              {sRow.paid ? (
                                <span className="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">PAGADO</span>
                              ) : sRow.isOverdue ? (
                                <span className="inline-block px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded font-bold">VENCIDO</span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">PENDIENTE</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 text-slate-900 font-bold border-t-2 border-slate-400 font-mono text-xs">
                          <td colSpan={2} className="py-2 px-2.5 font-sans">TOTALES PÓLIZA:</td>
                          <td className="py-2 px-2.5 text-right">{schedule.reduce((acc, r) => acc + r.payment, 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                          <td className="py-2 px-2.5 text-right text-emerald-800">{schedule.reduce((acc, r) => acc + r.principal, 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                          <td className="py-2 px-2.5 text-right text-amber-800">{schedule.reduce((acc, r) => acc + r.interest, 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>
                          <td colSpan={3} className="py-2 px-2.5 text-right font-sans text-[10px] text-slate-500">Amortización Francés</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Legal Footnote */}
                <div className="pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400">
                  Documentación bancaria oficial simulada. Firmada electrónicamente por Banco Central Hipotecario S.A.
                </div>

              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
