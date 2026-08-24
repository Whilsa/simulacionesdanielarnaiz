/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { OfficePurchaseOrder } from '../types.js';
import { X, Printer, ShoppingBag, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { formatNumber } from '../lib/formatters.js';
import { downloadElementAsPDF, printElementFallback } from '../lib/pdfUtils.js';

interface OfficeInvoiceModalProps {
  order: OfficePurchaseOrder | null;
  onClose: () => void;
}

export function OfficeInvoiceModal({ order, onClose }: OfficeInvoiceModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!order) return null;

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    setIsDownloading(true);
    try {
      await downloadElementAsPDF(printRef.current, `Factura_OfiTech_${order.orderNumber || 'ORD'}`);
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
    <div className="printable-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static print:block">
      <div className="printable-document-modal bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900 my-auto print:max-h-none print:shadow-none print:border-none print:w-full print:max-w-none print:rounded-none">
        
        {/* Modal Header Actions (Sticky top, hidden when printing) */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 z-20 print:hidden border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm md:text-base text-white truncate">Factura de adquisición de muebles e informática</h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Pedido nº {order.orderNumber} | {new Date(order.purchaseDate).toLocaleDateString('es-ES')} {new Date(order.purchaseDate).toLocaleTimeString('es-ES')}
              </p>
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
        <div ref={printRef} className="p-4 sm:p-8 space-y-6 flex-1 overflow-y-auto print:overflow-visible print:p-0">
          
          {/* Header & Seller Logo */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-lg shadow-sm">
                  O
                </div>
                <span className="text-xl font-black tracking-tight text-slate-900">Suministros OfiTech S.L.</span>
              </div>
              <p className="text-xs text-slate-500">Mobiliario corporativo, informática y equipamiento empresarial</p>
              <p className="text-xs text-slate-500">CIF: B-77443322 | Polígono Industrial Las Rozas, Nave 14, Madrid</p>
              <p className="text-xs text-slate-500">Teléfono: 91 800 40 50 | contacto@ofitech-suministros.es</p>
            </div>

            <div className="text-left sm:text-right bg-slate-50 p-4 rounded-xl border border-slate-200 min-w-[220px]">
              <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-extrabold uppercase rounded-full mb-2">
                Factura de compra
              </span>
              <p className="text-sm font-bold text-slate-900">Nº {order.orderNumber}</p>
              <p className="text-xs text-slate-600">Fecha: {new Date(order.purchaseDate).toLocaleDateString('es-ES')}</p>
              <p className="text-xs text-slate-600">Hora: {new Date(order.purchaseDate).toLocaleTimeString('es-ES')}</p>
              <p className="text-xs font-bold text-emerald-700 mt-1 flex items-center gap-1 justify-start sm:justify-end">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Completado y pagado</span>
              </p>
            </div>
          </div>

          {/* Client Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50/80 p-5 rounded-xl border border-slate-200 text-xs">
            <div>
              <h4 className="font-extrabold text-slate-500 uppercase tracking-wider mb-2">Datos del comprador (empresa)</h4>
              <p className="font-bold text-sm text-slate-900">{order.companyName || order.studentName}</p>
              <p className="text-slate-600 mt-0.5">CIF/NIF: <span className="font-medium text-slate-800">{order.nifCif || 'B-98765432'}</span></p>
              <p className="text-slate-600">Comprador / administrador: {order.studentName}</p>
            </div>

            <div>
              <h4 className="font-extrabold text-slate-500 uppercase tracking-wider mb-2">Método y estado de pago</h4>
              <p className="text-slate-700">Forma de pago: <span className="font-bold text-slate-900">Transferencia bancaria directa (banco)</span></p>
              <p className="text-slate-700">Estado de entrega: <span className="font-bold text-emerald-700">Completado e incorporado al patrimonio</span></p>
              <p className="text-slate-700">Clasificación contable: <span className="font-semibold text-slate-800">Inmovilizado / equipamiento e informática</span></p>
            </div>
          </div>

          {/* Itemized Table */}
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-3">Detalle de productos adquiridos ({order.items.length})</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3">Categoría</th>
                    <th className="p-3">Descripción del producto</th>
                    <th className="p-3 text-center">Cant.</th>
                    <th className="p-3 text-right">Precio unid. (€)</th>
                    <th className="p-3 text-right">Total (€)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {order.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-500">{it.categoryLabel}</td>
                      <td className="p-3 font-medium text-slate-900">{it.itemName}</td>
                      <td className="p-3 text-center font-bold">{it.quantity}</td>
                      <td className="p-3 text-right font-medium">{formatNumber(it.unitPrice)} €</td>
                      <td className="p-3 text-right font-bold text-slate-900">{formatNumber(it.totalPrice)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Box */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 pt-2">
            <div className="text-xs text-slate-500 max-w-md space-y-1">
              <p className="font-bold text-slate-700">Garantía e inventario corporativo:</p>
              <p>Los bienes detallados en esta factura quedan automáticamente registrados en el inventario de la empresa ("Muebles e informática") y cuentan con 3 años de garantía oficial OfiTech S.L.</p>
            </div>

            <div className="w-full sm:w-64 bg-slate-900 text-white p-5 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal (base imponible):</span>
                <span className="font-semibold">{formatNumber(order.subtotal)} €</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>IVA ({order.ivaRate}%):</span>
                <span className="font-semibold">{formatNumber(order.ivaAmount)} €</span>
              </div>
              <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between font-extrabold text-sm text-amber-400">
                <span>TOTAL FACTURA:</span>
                <span>{formatNumber(order.totalAmount)} €</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400 print:mt-10">
            Documento expedido electrónicamente en ContaLab. Validez oficial para justificación de inversión de capital y deducción fiscal.
          </div>

        </div>

        {/* Fixed Pinned Bottom Action Bar (Hidden when printing) */}
        <div className="p-3 sm:p-4 bg-slate-100 border-t border-slate-200 flex flex-row items-center justify-between gap-3 shrink-0 print:hidden z-20">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
          >
            <Printer className="w-4 h-4" />
            <span>Descargar / imprimir factura en PDF</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
