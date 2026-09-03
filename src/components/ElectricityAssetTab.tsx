import React, { useState } from 'react';
import { PropertyAcquisition, MachineryAcquisition, ElectricityContract, ElectricityBill } from '../types';
import { formatNumber } from '../lib/formatters';
import { ElectricityInvoiceModal } from './ElectricityInvoiceModal';
import { Zap, FileText, Download, CheckCircle2, Clock, Calendar, Building2, ShieldCheck, AlertCircle } from 'lucide-react';

interface Props {
  acquisitions: PropertyAcquisition[];
  machinery?: MachineryAcquisition[];
  contract?: ElectricityContract;
  contracts?: ElectricityContract[];
  bills: ElectricityBill[];
  studentName?: string;
  onOpenContractCard?: () => void;
}

export const ElectricityAssetTab: React.FC<Props> = ({
  acquisitions,
  machinery = [],
  contract,
  contracts = [],
  bills,
  studentName,
  onOpenContractCard
}) => {
  const [selectedBill, setSelectedBill] = useState<ElectricityBill | null>(null);

  const activeContracts = contracts.length > 0 
    ? contracts.filter(c => c.status === 'active')
    : (contract ? [contract] : []);

  const totalContractedPower = activeContracts.reduce((sum, c) => sum + (c.contractedPowerKw || 0), 0);

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
                <span>Suministro eléctrico — IberLuz Comercializadora</span>
              </h3>
              <p className="text-xs text-slate-400">
                Resumen de contratos y facturación de energía por inmueble
              </p>
            </div>
          </div>

          {activeContracts.length > 0 ? (
            <div className="flex items-center space-x-3">
              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/80 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {activeContracts.length} contrato{activeContracts.length > 1 ? 's' : ''} activo{activeContracts.length > 1 ? 's' : ''}
              </span>
              <span className="text-xs font-mono bg-slate-800 text-amber-300 px-3 py-1 rounded-lg border border-slate-700">
                Total potencia: {totalContractedPower} kW
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <span className="text-xs text-amber-400 bg-amber-950/80 border border-amber-800 px-3 py-1 rounded-full">
                Sin contratos activos
              </span>
            </div>
          )}
        </div>

        {/* Contract KPIs */}
        {activeContracts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Potencia total contratada</span>
              <p className="text-2xl font-black text-amber-400 font-mono mt-1">{totalContractedPower} kW</p>
              <span className="text-[10px] text-slate-500">Tarifa IberLuz 3.0TD</span>
            </div>

            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Término potencia</span>
              <p className="text-xl font-bold text-slate-200 font-mono mt-1">0,11 €/kW/día</p>
              <span className="text-[10px] text-slate-500">IberLuz Comercializadora</span>
            </div>

            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Término energía</span>
              <p className="text-xl font-bold text-slate-200 font-mono mt-1">0,14 €/kWh</p>
              <span className="text-[10px] text-slate-500">Precio fijo garantizado</span>
            </div>

            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Cobro de facturas</span>
              <p className="text-xl font-bold text-emerald-400 mt-1">Día 1 de cada mes</p>
              <span className="text-[10px] text-slate-500">Domiciliación bancaria automática</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 bg-slate-950 p-4 rounded-xl border border-slate-800">
            Aún no has contratado el suministro de electricidad con IberLuz Comercializadora para tus inmuebles. Puedes realizar la contratación individual para cada inmueble desde el panel superior.
          </p>
        )}

        {/* Detailed Explanation on Bill Variance */}
        <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-4 text-xs space-y-3 mt-3">
          <div className="flex items-center space-x-2 text-amber-300 font-bold border-b border-slate-800 pb-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>¿Por qué varía el gasto previsto de electricidad en el banco?</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            El recibo mensual no solo incluye el <strong className="text-amber-300">término fijo de potencia</strong> (95 kW × 30,4 días × 0,11 € = 317,68 €), sino principalmente el <strong className="text-amber-300">término variable de energía</strong> (0,14 €/kWh), la <strong className="text-purple-300">asignación de operarios/turnos</strong> y los <strong className="text-emerald-300">impuestos estatales (IEE 5,11% e IVA 21%)</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
              <span className="text-slate-400 block font-sans font-semibold">• Operativa en 1 turno (8h/día - 160h/mes):</span>
              <span className="text-slate-200">Consumo ~15.200 kWh → Factura total: <strong>2.732,38 €</strong> (2.446,53 € base + 285,85 € impuestos)</span>
            </div>
            <div className="bg-amber-950/60 p-2.5 rounded border border-amber-800/80 text-amber-300">
              <span className="text-amber-400 block font-sans font-semibold">• Operativa en 2 turnos (16h/día - 320h/mes):</span>
              <span>Consumo ~30.400 kWh → Factura total: <strong className="text-amber-200">5.748,99 €</strong> (4.574,53 € base + 1.174,46 € impuestos)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detail per Property */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-xl space-y-4">
        <h4 className="font-bold text-base text-white flex items-center space-x-2">
          <Building2 className="w-5 h-5 text-blue-400" />
          <span>Estado del suministro eléctrico por inmueble</span>
        </h4>

        {acquisitions.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No dispones de inmuebles en propiedad o alquiler.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {acquisitions.map((prop, idx) => {
              const pId = String(prop.id || prop.propertyId || '');
              const pTitle = String(prop.propertyTitle || prop.title || 'Inmueble');
              const pType = String(prop.propertyType || prop.type || '');
              const isNave = pType === 'nave_industrial' || pTitle.toLowerCase().includes('nave');
              const isLocal = pType === 'oficina' || pType === 'local_comercial' || pTitle.toLowerCase().includes('oficina') || pTitle.toLowerCase().includes('local');
              const isAlmacen = pType === 'almacen' || pTitle.toLowerCase().includes('almacén');

              // Find contract for this property with robust matching
              const propContract = activeContracts.find(c => 
                (c.propertyId && (c.propertyId === pId || c.propertyId === String(prop.id) || c.propertyId === String(prop.propertyId))) || 
                (c.propertyTitle && pTitle && c.propertyTitle.toLowerCase().trim() === pTitle.toLowerCase().trim()) ||
                (!c.propertyId && activeContracts.length === acquisitions.length && activeContracts[idx]) ||
                (!c.propertyId && activeContracts.length === 1)
              );

              // Filter machinery installed in THIS specific property
              const propMachinery = (machinery || []).filter(m => {
                const mNaveId = String(m.installedAtNaveId || m.installedNaveId || m.installationNaveId || m.propertyId || m.acquisitionId || '');
                if (mNaveId && mNaveId === pId) return true;

                const mNaveTitle = (m.installationNaveTitle || m.installedAtNaveTitle || m.installedNaveTitle || m.naveInstaladaTitulo || '').toLowerCase().trim();
                const propTitleLower = pTitle.toLowerCase().trim();
                if (mNaveTitle && propTitleLower && (mNaveTitle === propTitleLower || mNaveTitle.includes(propTitleLower) || propTitleLower.includes(mNaveTitle))) return true;

                if (!mNaveId && !mNaveTitle && acquisitions.length === 1) return true;

                return false;
              });

              const propMachineryKw = isNave 
                ? propMachinery.reduce((sum, m) => sum + (Number(m.requiredPowerKW || m.powerKw || m.potencia || m.power) || (m.category === 'metal_hierro' ? 35 : 25)), 0)
                : 0;

              // Basic lighting, hvac & PC power for this property
              const surface = Number(prop.surfaceM2 || prop.superficie_m2 || prop.surface || prop.superficie) || 500;
              const adminM2 = Math.round(surface * 0.10);
              const machineryM2 = Math.round(surface * 0.50);
              const storageM2 = Math.round(surface * 0.25);
              const freeM2 = Math.max(0, surface - adminM2 - machineryM2 - storageM2);

              const lightingKw = isNave ? ((machineryM2 * 0.008) + (storageM2 * 0.005) + (adminM2 * 0.010) + (freeM2 * 0.003)) : (isLocal ? surface * 0.015 : surface * 0.006);
              const hvacKw = (isNave || isLocal) ? (adminM2 * 0.060) : 0;
              const pcKw = Math.max(2, Math.round(adminM2 / 20) || 2) * 0.10;

              const totalRawKw = propMachineryKw + lightingKw + hvacKw + pcKw;
              const propRecommendedPower = totalRawKw > 0 ? Math.max(15, Math.ceil((totalRawKw * 1.15) / 5) * 5) : 15;

              return (
                <div key={idx} className={`bg-slate-950/80 border rounded-xl p-4 space-y-3 ${
                  propContract ? 'border-emerald-800/80' : 'border-amber-800/60'
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-bold text-slate-200 text-sm">{pTitle}</h5>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                        {isNave ? 'Nave industrial' : isLocal ? 'Local comercial' : isAlmacen ? 'Almacén' : 'Inmueble'} • {prop.surfaceM2} m²
                      </span>
                    </div>
                    {propContract ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Contratado ({propContract.contractedPowerKw} kW)
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Pendiente de contratar
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300 border-t border-slate-800/80 pt-2 font-mono">
                    {isNave && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Maquinaria en inmueble:</span>
                        <span className="text-blue-300 font-bold">{propMachineryKw} kW ({propMachinery.length} línea{propMachinery.length !== 1 ? 's' : ''})</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Potencia recomendada:</span>
                      <span className="text-amber-400 font-bold">{propRecommendedPower} kW</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Potencia contratada:</span>
                      <span className="text-amber-300 font-bold">
                        {propContract ? `${propContract.contractedPowerKw} kW` : 'No contratada'}
                      </span>
                    </div>
                    {propContract && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">CUPS:</span>
                        <span className="text-slate-200">{propContract.cupsCode}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tarifa:</span>
                      <span className="text-slate-200">IberLuz 3.0TD</span>
                    </div>
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
            <span>Histórico de facturas de electricidad (IberLuz Comercializadora)</span>
          </h4>
          <span className="text-xs text-slate-400 font-mono">Pago automático el día 1 de cada mes</span>
        </div>

        {bills.length === 0 ? (
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-8 text-center text-slate-400 space-y-2">
            <Zap className="w-8 h-8 text-amber-500/50 mx-auto" />
            <p className="text-sm font-medium text-slate-300">No hay facturas emitidas todavía.</p>
            <p className="text-xs text-slate-500">
              Las facturas de electricidad se generan mensualmente y se cobran de forma automática el día 1 del mes siguiente al consumo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <th className="p-3">Nº factura</th>
                  <th className="p-3">Período / mes</th>
                  <th className="p-3 text-right">kWh consumidos</th>
                  <th className="p-3 text-right">Impuestos (IEE + IVA)</th>
                  <th className="p-3 text-right">Total factura</th>
                  <th className="p-3 text-center">Estado de pago</th>
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
                      {formatNumber(bill.totalKwh)} kWh
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400">
                      {formatNumber(bill.electricityTax + bill.ivaAmount)} €
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-amber-400 text-sm">
                      {formatNumber(bill.totalAmount)} €
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
                        <span>Ver factura PDF</span>
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
