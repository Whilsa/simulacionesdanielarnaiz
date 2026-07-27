import React, { useState } from 'react';
import { PropertyAcquisition, ElectricityContract, ElectricityBill } from '../types';
import { ElectricityInvoiceModal } from './ElectricityInvoiceModal';
import { Zap, FileText, Download, CheckCircle2, Clock, Calendar, Building2, ShieldCheck } from 'lucide-react';

interface Props {
  acquisitions: PropertyAcquisition[];
  contract?: ElectricityContract;
  bills: ElectricityBill[];
  studentName?: string;
  onOpenContractCard?: () => void;
}

export const ElectricityAssetTab: React.FC<Props> = ({
  acquisitions,
  contract,
  bills,
  studentName,
  onOpenContractCard
}) => {
  const [selectedBill, setSelectedBill] = useState<ElectricityBill | null>(null);

  return (
    <div className="space-y-6">
      {/* Contract Summary Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Suministro Eléctrico — IberLuz Comercializadora</span>
              </h3>
              <p className="text-xs text-slate-400">
                Detalle del contrato de energía para los inmuebles en propiedad y alquiler
              </p>
            </div>
          </div>

          {contract ? (
            <div className="flex items-center space-x-3">
              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/80 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Contrato Activo
              </span>
              <span className="text-xs font-mono bg-slate-800 text-amber-300 px-3 py-1 rounded-lg border border-slate-700">
                CUPS: {contract.cupsCode}
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <span className="text-xs text-amber-400 bg-amber-950/80 border border-amber-800 px-3 py-1 rounded-full">
                Sin Contrato Activo
              </span>
            </div>
          )}
        </div>

        {/* Contract KPIs */}
        {contract ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Potencia Contratada</span>
              <p className="text-2xl font-black text-amber-400 font-mono mt-1">{contract.contractedPowerKw} kW</p>
              <span className="text-[10px] text-slate-500">Tarifa IberLuz 3.0TD</span>
            </div>

            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Término Potencia</span>
              <p className="text-xl font-bold text-slate-200 font-mono mt-1">{contract.pricePerKwDay} €/kW/día</p>
              <span className="text-[10px] text-slate-500">0,11 €/kW/día</span>
            </div>

            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Término Energía</span>
              <p className="text-xl font-bold text-slate-200 font-mono mt-1">{contract.pricePerKwh} €/kWh</p>
              <span className="text-[10px] text-slate-500">0,14 €/kWh</span>
            </div>

            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Día de Cobro</span>
              <p className="text-xl font-bold text-emerald-400 mt-1">Día 5 de mes</p>
              <span className="text-[10px] text-slate-500">Domiciliación bancaria automática</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 bg-slate-950 p-4 rounded-xl border border-slate-800">
            Aún no has contratado el suministro de electricidad con IberLuz Comercializadora. Puedes contratarlo desde la tarjeta principal del Cuadro de Mando.
          </p>
        )}
      </div>

      {/* Detail per Property */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-xl space-y-4">
        <h4 className="font-bold text-base text-white flex items-center space-x-2">
          <Building2 className="w-5 h-5 text-blue-400" />
          <span>Detalle de Consumo Eléctrico por Inmueble</span>
        </h4>

        {acquisitions.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No dispones de inmuebles en propiedad o alquiler.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {acquisitions.map((prop, idx) => {
              const pType = prop.propertyType || prop.type || '';
              const isNave = pType === 'nave_industrial' || prop.propertyTitle?.toLowerCase().includes('nave');
              const isLocal = pType === 'local_comercial' || prop.propertyTitle?.toLowerCase().includes('local');
              const isAlmacen = pType === 'almacen' || prop.propertyTitle?.toLowerCase().includes('almacén');

              return (
                <div key={idx} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-bold text-slate-200 text-sm">{prop.propertyTitle}</h5>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                        {isNave ? 'Nave Industrial' : isLocal ? 'Local Comercial' : isAlmacen ? 'Almacén' : 'Inmueble'} • {prop.surfaceM2} m²
                      </span>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      IberLuz
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300 border-t border-slate-800/80 pt-2 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tipo de Contrato:</span>
                      <span className="text-slate-200">Tarifa 3.0TD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Iluminación:</span>
                      <span className="text-slate-200">{isNave ? '1 kWh/m² /turno' : isLocal ? '15 W/m² (1 turno)' : '6 W/m² (1 turno)'}</span>
                    </div>
                    {isLocal && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Climatización:</span>
                        <span className="text-slate-200">60 W/m² (1 turno)</span>
                      </div>
                    )}
                    {isNave && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Climatización Admin:</span>
                        <span className="text-slate-200">60 W/m² (10% superficie)</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invoice History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-base text-white flex items-center space-x-2">
            <FileText className="w-5 h-5 text-amber-400" />
            <span>Histórico de Facturas de Electricidad (IberLuz Comercializadora)</span>
          </h4>
          <span className="text-xs text-slate-400 font-mono">Pago automático el día 5 de cada mes</span>
        </div>

        {bills.length === 0 ? (
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-8 text-center text-slate-400 space-y-2">
            <Zap className="w-8 h-8 text-amber-500/50 mx-auto" />
            <p className="text-sm font-medium text-slate-300">No hay facturas emitidas todavía.</p>
            <p className="text-xs text-slate-500">
              Las facturas de electricidad se generan mensualmente y se cobran de forma automática el día 5 del mes siguiente al consumo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <th className="p-3">Nº Factura</th>
                  <th className="p-3">Período / Mes</th>
                  <th className="p-3 text-right">kWh Consumidos</th>
                  <th className="p-3 text-right">Impuestos (IEE + IVA)</th>
                  <th className="p-3 text-right">Total Factura</th>
                  <th className="p-3 text-center">Estado de Pago</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 font-mono font-bold text-slate-200">{bill.billNumber}</td>
                    <td className="p-3 text-slate-300">
                      Mes {bill.periodMonth}/{bill.periodYear}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">
                      {bill.totalKwh.toLocaleString('es-ES')} kWh
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400">
                      {(bill.electricityTax + bill.ivaAmount).toFixed(2)} €
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-amber-400 text-sm">
                      {bill.totalAmount.toFixed(2)} €
                    </td>
                    <td className="p-3 text-center">
                      {bill.status === 'pagado' ? (
                        <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2.5 py-0.5 rounded-full font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Pagada ({new Date(bill.paidDate || bill.dueDate).toLocaleDateString('es-ES')})</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/80 border border-amber-800 px-2.5 py-0.5 rounded-full font-medium">
                          <Clock className="w-3 h-3" />
                          <span>Cobro 5/{bill.periodMonth === 12 ? 1 : bill.periodMonth + 1}/{bill.periodMonth === 12 ? bill.periodYear + 1 : bill.periodYear}</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedBill(bill)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Ver Factura PDF</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Modal */}
      {selectedBill && (
        <ElectricityInvoiceModal
          bill={selectedBill}
          studentName={studentName}
          onClose={() => setSelectedBill(null)}
        />
      )}
    </div>
  );
};
