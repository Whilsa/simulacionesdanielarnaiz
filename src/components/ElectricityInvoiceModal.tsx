import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { ElectricityBill } from '../types';
import { Printer, X, Zap, ShieldCheck } from 'lucide-react';
import { formatNumber } from '../lib/formatters';

interface Props {
  bill: ElectricityBill;
  studentName?: string;
  onClose: () => void;
}

export const ElectricityInvoiceModal: React.FC<Props> = ({ bill, studentName, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const startStr = bill.startDate
    ? new Date(bill.startDate + 'T00:00:00').toLocaleDateString('es-ES')
    : `01/${bill.periodMonth < 10 ? '0' + bill.periodMonth : bill.periodMonth}/${bill.periodYear}`;

  const endStr = bill.endDate
    ? new Date(bill.endDate + 'T00:00:00').toLocaleDateString('es-ES')
    : `${bill.daysCount}/${bill.periodMonth < 10 ? '0' + bill.periodMonth : bill.periodMonth}/${bill.periodYear}`;

  const periodStr = `${startStr} - ${endStr}`;

  return createPortal(
    <div className="printable-modal-backdrop fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:static print:p-0 print:bg-white print:block">
      <div className="printable-document-modal bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto text-slate-100 shadow-2xl flex flex-col print:bg-white print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none">
        {/* Action Header - Modal only */}
        <div className="no-print print:hidden p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Factura de Suministro Eléctrico</h3>
              <p className="text-xs text-slate-400">Nº {bill.billNumber} • IberLuz Comercializadora</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-2 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Descargar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div id="electricity-invoice-printable" ref={printRef} className="p-8 bg-white text-slate-900 space-y-8 font-sans print:p-0">
          {/* Header & Logo */}
          <div className="flex justify-between items-start border-b-2 border-amber-500 pb-6">
            <div>
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black text-xl">
                  ⚡
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-950">IberLuz</h1>
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Comercializadora de Energía S.A.</p>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-600 space-y-0.5 font-mono">
                <p>CIF: A-82910482 • Reg. Mercantil Madrid</p>
                <p>Plaza de la Independencia, 12 • 28001 Madrid</p>
                <p>Atención al Cliente: 900 100 200 • www.iberluz.es</p>
              </div>
            </div>

            <div className="text-right space-y-1">
              <span className="inline-block bg-slate-100 text-slate-800 text-xs font-bold px-3 py-1 rounded border border-slate-300 uppercase tracking-wider">
                Factura Oficial de Electricidad
              </span>
              <p className="text-sm font-mono font-bold text-slate-900 mt-2">Nº Factura: {bill.billNumber}</p>
              <p className="text-xs text-slate-600">Fecha Emisión: {new Date(bill.createdAt).toLocaleDateString('es-ES')}</p>
              <p className="text-xs text-slate-600">Período: {periodStr}</p>
            </div>
          </div>

          {/* Client & Contract Details */}
          <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <h4 className="font-bold text-slate-900 uppercase text-[11px] text-amber-700 tracking-wider mb-2">
                Datos del Cliente y Titular
              </h4>
              <p className="font-bold text-slate-900 text-sm">{studentName || bill.studentName}</p>
              <p className="text-slate-600">NIF / CIF: {bill.cifNif || 'B-98765432'}</p>
              <p className="text-slate-600">Domicilio Fiscal: Polígono Industrial San José, Nave 4</p>
              <p className="text-slate-600">Cuenta de Cargo: ES21 **** **** **** {bill.studentId.slice(-4)}</p>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 uppercase text-[11px] text-amber-700 tracking-wider mb-2">
                Datos del Suministro y Contrato
              </h4>
              <p className="text-slate-700"><span className="font-semibold">CUPS:</span> <span className="font-mono">{bill.cupsCode}</span></p>
              <p className="text-slate-700"><span className="font-semibold">Tarifa:</span> IberLuz 3.0TD Industrial</p>
              <p className="text-slate-700"><span className="font-semibold">Potencia Contratada:</span> {bill.contractedPowerKw} kW</p>
              <p className="text-slate-700"><span className="font-semibold">Peaje de Acceso:</span> 3.0TD Alta/Baja Tensión</p>
              <p className="text-slate-700"><span className="font-semibold">Forma de Pago:</span> Domiciliación Bancaria (Día 5 del mes)</p>
            </div>
          </div>

          {/* Summary Callout */}
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Resumen de Consumo Eléctrico</span>
              <p className="text-2xl font-black text-slate-900 mt-0.5">
                {formatNumber(bill.totalKwh, 0)} <span className="text-sm font-normal text-slate-600">kWh consumidos</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Importe Total a Pagar</span>
              <p className="text-3xl font-black text-amber-600">{formatNumber(bill.totalAmount)} €</p>
            </div>
          </div>

          {/* Itemized Billing Table */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 uppercase text-xs tracking-wider border-b border-slate-200 pb-1">
              Desglose de la Factura
            </h4>

            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] border-b border-slate-300">
                  <th className="p-2.5">Concepto</th>
                  <th className="p-2.5 text-right">Cálculo / Base</th>
                  <th className="p-2.5 text-right">Precio Unitario</th>
                  <th className="p-2.5 text-right">Importe (€)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                <tr>
                  <td className="p-2.5 font-medium">
                    1. Término de Potencia ({bill.contractedPowerKw} kW)
                  </td>
                  <td className="p-2.5 text-right font-mono">{bill.contractedPowerKw} kW × {bill.daysCount} días</td>
                  <td className="p-2.5 text-right font-mono">{formatNumber(bill.pricePerKwDay, 4)} €/kW/día</td>
                  <td className="p-2.5 text-right font-mono font-semibold">{formatNumber(bill.powerAmount)} €</td>
                </tr>

                <tr>
                  <td className="p-2.5 font-medium">
                    2. Término de Energía Consumida
                  </td>
                  <td className="p-2.5 text-right font-mono">{formatNumber(bill.totalKwh, 0)} kWh</td>
                  <td className="p-2.5 text-right font-mono">{formatNumber(bill.pricePerKwh, 4)} €/kWh</td>
                  <td className="p-2.5 text-right font-mono font-semibold">{formatNumber(bill.energyAmount)} €</td>
                </tr>

                <tr>
                  <td className="p-2.5 font-medium text-slate-600">
                    3. Alquiler de Equipo de Medida / Contador
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-600">1 Mes</td>
                  <td className="p-2.5 text-right font-mono text-slate-600">0,85 €/mes</td>
                  <td className="p-2.5 text-right font-mono font-semibold">{formatNumber(bill.equipmentRental)} €</td>
                </tr>

                <tr className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td className="p-2.5" colSpan={3}>Base Imponible de Suministro</td>
                  <td className="p-2.5 text-right font-mono">{formatNumber(bill.taxableBase)} €</td>
                </tr>

                <tr>
                  <td className="p-2.5 text-slate-700">
                    4. Impuesto sobre la Electricidad (IEE 5,11269632%)
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-600">s/ Base {formatNumber(bill.taxableBase)} €</td>
                  <td className="p-2.5 text-right font-mono text-slate-600">5,1127%</td>
                  <td className="p-2.5 text-right font-mono font-semibold">{formatNumber(bill.electricityTax)} €</td>
                </tr>

                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="p-2.5" colSpan={3}>Subtotal sujeto a IVA</td>
                  <td className="p-2.5 text-right font-mono">{formatNumber(bill.subtotalWithTax)} €</td>
                </tr>

                <tr>
                  <td className="p-2.5 text-slate-700">
                    5. Impuesto sobre el Valor Añadido (IVA 21%)
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-600">s/ Subtotal {formatNumber(bill.subtotalWithTax)} €</td>
                  <td className="p-2.5 text-right font-mono text-slate-600">21,00%</td>
                  <td className="p-2.5 text-right font-mono font-semibold">{formatNumber(bill.ivaAmount)} €</td>
                </tr>

                <tr className="bg-slate-900 text-white font-black text-sm border-t-2 border-slate-900">
                  <td className="p-3" colSpan={3}>TOTAL FACTURA A PAGAR</td>
                  <td className="p-3 text-right font-mono text-amber-400 text-base">{formatNumber(bill.totalAmount)} €</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Breakdown per Property (if available) */}
          {bill.propertyBreakdown && bill.propertyBreakdown.length > 0 && (
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Detalle de Consumo por Inmueble
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bill.propertyBreakdown.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                    <p className="font-bold text-slate-900">{item.propertyTitle}</p>
                    <div className="flex justify-between text-slate-600">
                      <span>Maquinaria:</span>
                      <span className="font-mono">{item.kwhMachinery} kWh</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Iluminación:</span>
                      <span className="font-mono">{item.kwhLighting} kWh</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Ordenadores:</span>
                      <span className="font-mono">{item.kwhComputers} kWh</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Climatización:</span>
                      <span className="font-mono">{item.kwhHvac} kWh</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                      <span>Subtotal Consumo:</span>
                      <span className="font-mono text-amber-700">{item.totalKwh} kWh (~{item.costEstimate.toFixed(2)} €)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Legal Notice */}
          <div className="bg-slate-100 rounded-lg p-4 text-xs text-slate-700 flex items-start space-x-3 border border-slate-300">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">Forma y Término de Pago</p>
              <p className="text-slate-600 mt-0.5">
                El importe de esta factura se cargará automáticamente en su cuenta bancaria registrada el día <span className="font-bold text-slate-900">5 del mes siguiente</span> al período de consumo ({new Date(bill.dueDate).toLocaleDateString('es-ES')}).
                {bill.status === 'pagado' ? (
                  <span className="inline-flex items-center text-emerald-700 font-bold ml-2">
                    ✓ Pagado el {new Date(bill.paidDate || bill.dueDate).toLocaleDateString('es-ES')}
                  </span>
                ) : (
                  <span className="inline-flex items-center text-amber-700 font-bold ml-2">
                    ⏳ Pendiente de cobro en fecha {new Date(bill.dueDate).toLocaleDateString('es-ES')}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
