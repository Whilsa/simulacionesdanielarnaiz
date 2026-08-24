/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TelecomInvoice } from '../types.js';
import { X, Printer, PhoneCall, Download, RefreshCw } from 'lucide-react';
import { formatNumber } from '../lib/formatters.js';
import { downloadElementAsPDF, printElementFallback } from '../lib/pdfUtils.js';

interface TelecomInvoiceModalProps {
  invoice: TelecomInvoice | null;
  onClose: () => void;
}

export function TelecomInvoiceModal({ invoice, onClose }: TelecomInvoiceModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!invoice) return null;

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    setIsDownloading(true);
    try {
      await downloadElementAsPDF(printRef.current, `Factura_Telecom_${invoice.invoiceNumber || 'TEL'}`);
    } catch (e) {
      console.error('PDF error:', e);
      if (printRef.current) printElementFallback(printRef.current);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    if (printRef.current) {
      printElementFallback(printRef.current);
    } else {
      try {
        window.focus();
        setTimeout(() => window.print(), 50);
      } catch (e) {
        console.error('Print error:', e);
      }
    }
  };

  return createPortal(
    <div className="printable-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm print:p-0 print:bg-white print:static print:block">
      <div className="printable-document-modal bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900 print:max-h-none print:shadow-none print:border-none print:w-full print:max-w-none print:rounded-none">
        
        {/* Modal Header Actions (Sticky top, hidden when printing) */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0 z-20 print:hidden border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-white truncate">Factura de servicios telecom</h3>
              <p className="text-xs text-slate-400 truncate">Nº {invoice.invoiceNumber} | {invoice.periodMonth}/{invoice.periodYear}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-md disabled:opacity-50"
              title="Descargar factura en archivo PDF"
            >
              {isDownloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isDownloading ? 'Generando...' : 'Descargar PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Body (Scrollable inside modal) */}
        <div ref={printRef} className="p-6 sm:p-10 space-y-8 flex-1 overflow-y-auto print:overflow-visible print:p-0">
          
          {/* Header & Logo */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-black text-lg">
                  T
                </div>
                <span className="text-xl font-black tracking-tight text-slate-900">{invoice.provider}</span>
              </div>
              <p className="text-xs text-slate-500">Servicios de Telecomunicaciones e Internet Pyme S.L.</p>
              <p className="text-xs text-slate-500">CIF: B-88776655 | Reg. Mercantil de Madrid</p>
              <p className="text-xs text-slate-500">Gran Vía 48, Planta 6, 28013 Madrid</p>
            </div>

            <div className="text-left sm:text-right bg-slate-50 p-4 rounded-xl border border-slate-200 min-w-[220px]">
              <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-extrabold uppercase rounded-full mb-2">
                FACTURA OFICIAL
              </span>
              <p className="text-sm font-bold text-slate-900">Nº {invoice.invoiceNumber}</p>
              <p className="text-xs text-slate-600">Fecha emisión: {new Date(invoice.issueDate).toLocaleDateString('es-ES')}</p>
              <p className="text-xs text-slate-600">Periodo: {invoice.periodMonth}/{invoice.periodYear}</p>
              <p className="text-xs font-semibold text-emerald-700 mt-1">Estado: PAGADO (domiciliación)</p>
            </div>
          </div>

          {/* Client Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50/80 p-5 rounded-xl border border-slate-200 text-xs">
            <div>
              <h4 className="font-extrabold text-slate-500 uppercase tracking-wider mb-2">DATOS DEL CLIENTE / TITULAR</h4>
              <p className="font-bold text-sm text-slate-900">{invoice.companyName || invoice.studentName}</p>
              <p className="text-slate-600 mt-0.5">CIF/NIF: <span className="font-medium text-slate-800">{invoice.nifCif || 'B-98765432'}</span></p>
              <p className="text-slate-600">Representante: {invoice.studentName}</p>
            </div>

            <div>
              <h4 className="font-extrabold text-slate-500 uppercase tracking-wider mb-2">DATOS DEL CONTRATO Y PAGO</h4>
              <p className="text-slate-700">Contrato: <span className="font-bold text-slate-900">{invoice.planName}</span></p>
              <p className="text-slate-700">Forma de pago: <span className="font-bold text-slate-900">{invoice.paymentMethod || 'Cargo automático en cuenta (1 de mes)'}</span></p>
              <p className="text-slate-700">Fecha de cobro: <span className="font-bold text-emerald-700">{new Date(invoice.paidDate || invoice.dueDate).toLocaleDateString('es-ES')}</span></p>
            </div>
          </div>

          {/* Itemized Table */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-3">DESGLOSE DE SERVICIOS CONTRATADOS</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3">Concepto / servicio</th>
                    <th className="p-3 text-right">Importe (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {invoice.items && invoice.items.length > 0 ? (
                    invoice.items.map((it, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-3 font-medium">{it.concept}</td>
                        <td className="p-3 text-right font-semibold">{formatNumber(it.amount)} €</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="p-3 font-medium">Cuota mensual {invoice.planName} (Fibra, móviles y centralita)</td>
                      <td className="p-3 text-right font-semibold">{formatNumber(invoice.subtotal)} €</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Box */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 pt-2">
            <div className="text-xs text-slate-500 max-w-md space-y-1">
              <p className="font-bold text-slate-700">Información fiscal e impositiva:</p>
              <p>El cobro de esta factura se ha efectuado mediante transferencia bancaria / adeudo directo automático en la cuenta corporativa el día 1 del mes correspondiente.</p>
            </div>

            <div className="w-full sm:w-64 bg-slate-900 text-white p-5 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Base imponible:</span>
                <span className="font-semibold">{formatNumber(invoice.subtotal)} €</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>IVA ({invoice.ivaRate}%):</span>
                <span className="font-semibold">{formatNumber(invoice.ivaAmount)} €</span>
              </div>
              <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between font-extrabold text-sm text-amber-400">
                <span>TOTAL FACTURA:</span>
                <span>{formatNumber(invoice.totalAmount)} €</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400 print:mt-10">
            Documento expedido electrónicamente en ContaLab. Validez legal como justificante de gasto deducible.
          </div>

          {/* Bottom Action Footer (Hidden when printing) */}
          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Cerrar ventana
            </button>
            <button
              onClick={handlePrint}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>Descargar / imprimir factura en PDF</span>
            </button>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
