import React, { useState, useEffect } from 'react';
import { PropertyAcquisition, MachineryAcquisition, HiredEmployee, ElectricityContract, NaveFloorPlan } from '../types';
import { Zap, HelpCircle, CheckCircle2, Shield, Lightbulb, Monitor, Thermometer, Factory, Building2, Sliders, Plus, Minus, Info, AlertCircle, ArrowRight } from 'lucide-react';

interface Props {
  acquisitions: PropertyAcquisition[];
  machinery: MachineryAcquisition[];
  employees: HiredEmployee[];
  floorPlans?: NaveFloorPlan[];
  contracts?: ElectricityContract[];
  currentContract?: ElectricityContract;
  onContractSupply: (propertyId: string, propertyTitle: string, powerKw: number) => Promise<void>;
}

export const ElectricitySupplyCard: React.FC<Props> = ({
  acquisitions = [],
  machinery = [],
  employees = [],
  floorPlans = [],
  contracts = [],
  currentContract,
  onContractSupply
}) => {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [contractingPropId, setContractingPropId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Interactive Student Projections
  const [selectedShifts, setSelectedShifts] = useState<number>(1);
  const [customPcCount, setCustomPcCount] = useState<number | null>(null);

  // Per-property selected power states map: propertyId -> powerKw
  const [propPowerMap, setPropPowerMap] = useState<{ [propId: string]: number }>({});

  // Derive employee-based shifts if employees assigned to machinery
  let activeEmpShifts = 0;
  machinery.forEach(m => {
    const assignedEmps = employees.filter(e => 
      e.assignedMachineryId === m.id || 
      e.assignedMachineryTitle === m.title || 
      (e.assignedMachineryTitle && m.lineTitle && e.assignedMachineryTitle.includes(m.lineTitle))
    );
    const count = Math.max(0, Math.min(3, assignedEmps.length));
    if (count > activeEmpShifts) activeEmpShifts = count;
  });

  const effectiveShifts = Math.max(selectedShifts, activeEmpShifts || 1);

  // All contracts list (fallback to currentContract if contracts array empty)
  const activeContracts = contracts.length > 0 
    ? contracts.filter(c => c.status === 'active')
    : (currentContract ? [currentContract] : []);

  // Compute breakdown per property
  const propertyCalculations = acquisitions.map(prop => {
    const pId = String(prop.id || prop.propertyId || '');
    const pTitle = String(prop.propertyTitle || prop.title || 'Inmueble');
    const pType = String(prop.propertyType || prop.type || prop.inmueble_tipo || prop.property_type || '').toLowerCase();
    
    let isNave = pType === 'nave_industrial' || pType.includes('nave') || pTitle.toLowerCase().includes('nave');
    let isLocal = pType === 'local_comercial' || pType.includes('local') || pTitle.toLowerCase().includes('local');
    let isAlmacen = pType === 'almacen' || pType.includes('almacen') || pType.includes('almacén') || pTitle.toLowerCase().includes('almacén') || pTitle.toLowerCase().includes('almacen');

    if (!isNave && !isLocal && !isAlmacen) {
      isNave = true;
    }

    const surface = Number(prop.surfaceM2 || prop.superficie_m2 || prop.surface || prop.superficie) || 500;

    // Floor plan
    const plan = floorPlans.find(fp => 
      (fp.propertyId && (String(fp.propertyId) === pId)) ||
      (fp.acquisitionId && String(fp.acquisitionId) === pId) ||
      (fp.propertyTitle && pTitle && fp.propertyTitle.toLowerCase().trim() === pTitle.toLowerCase().trim())
    );

    let adminM2 = 0;
    let machineryM2 = 0;
    let storageM2 = 0;
    let freeM2 = 0;

    if (plan) {
      adminM2 = Number(plan.adminZoneM2) || 0;
      machineryM2 = Number(plan.machineryZoneM2) || 0;
      storageM2 = Number(plan.storageZoneM2) || 0;
      freeM2 = Number(plan.freeZoneM2) || 0;
    } else {
      adminM2 = Math.round(surface * 0.10);
      machineryM2 = Math.round(surface * 0.50);
      storageM2 = Math.round(surface * 0.25);
      freeM2 = Math.max(0, surface - adminM2 - machineryM2 - storageM2);
    }

    // Machinery for this property (if nave, takes total machinery)
    let propMachineryKw = 0;
    if (isNave) {
      machinery.forEach(m => {
        propMachineryKw += Number(m.requiredPowerKW || m.powerKw || m.potencia || m.power) || (m.category === 'metal_hierro' ? 35 : 25);
      });
    }
    const propMachineryKwhMonth = propMachineryKw * effectiveShifts * 160;

    // Lighting
    let propLightingKw = 0;
    if (isNave) {
      propLightingKw = (machineryM2 * 0.008) + (storageM2 * 0.005) + (adminM2 * 0.010) + (freeM2 * 0.003);
    } else if (isLocal) {
      propLightingKw = surface * 0.015;
    } else {
      propLightingKw = surface * 0.006;
    }
    const propLightingKwhMonth = propLightingKw * (isNave ? effectiveShifts : 1) * 160;

    // HVAC
    let propHvacKw = 0;
    if (isNave) {
      propHvacKw = adminM2 * 0.060;
    } else if (isLocal) {
      propHvacKw = surface * 0.060;
    }
    const propHvacKwhMonth = propHvacKw * 160;

    // PCs
    const defaultPcsForProp = Math.max(2, Math.round(adminM2 / 20) || 2);
    const propPcCount = customPcCount !== null ? customPcCount : defaultPcsForProp;
    const propPcKw = propPcCount * 0.10;
    const propPcKwhMonth = propPcKw * 160;

    // Total Kw & kWh
    const propTotalRawKw = propMachineryKw + propLightingKw + propHvacKw + propPcKw;
    const propRecommendedPower = propTotalRawKw > 0 ? Math.max(15, Math.ceil((propTotalRawKw * 1.15) / 5) * 5) : 15;
    const propEstimatedMonthlyKwh = Math.round(propMachineryKwhMonth + propLightingKwhMonth + propHvacKwhMonth + propPcKwhMonth);

    // Matching contract
    const contract = activeContracts.find(c => 
      c.propertyId === pId || 
      (c.propertyTitle && c.propertyTitle.toLowerCase().trim() === pTitle.toLowerCase().trim()) ||
      (!c.propertyId && activeContracts.length === 1 && acquisitions.length === 1)
    );

    return {
      property: prop,
      propId: pId,
      propTitle: pTitle,
      isNave,
      isLocal,
      isAlmacen,
      surface,
      adminM2,
      machineryKw: propMachineryKw,
      machineryKwhMonth: propMachineryKwhMonth,
      lightingKw: propLightingKw,
      lightingKwhMonth: propLightingKwhMonth,
      hvacKw: propHvacKw,
      hvacKwhMonth: propHvacKwhMonth,
      pcCount: propPcCount,
      pcKw: propPcKw,
      pcKwhMonth: propPcKwhMonth,
      totalRawKw: propTotalRawKw,
      recommendedPower: propRecommendedPower,
      estimatedMonthlyKwh: propEstimatedMonthlyKwh,
      contract
    };
  });

  // Global Totals
  const totalGlobalMachineryKw = propertyCalculations.reduce((sum, p) => sum + p.machineryKw, 0);
  const totalGlobalLightingKw = propertyCalculations.reduce((sum, p) => sum + p.lightingKw, 0);
  const totalGlobalHvacKw = propertyCalculations.reduce((sum, p) => sum + p.hvacKw, 0);
  const totalGlobalPcKw = propertyCalculations.reduce((sum, p) => sum + p.pcKw, 0);
  const totalGlobalEstKwh = propertyCalculations.reduce((sum, p) => sum + p.estimatedMonthlyKwh, 0);

  // Initialize selected power map
  useEffect(() => {
    const newMap: { [propId: string]: number } = {};
    propertyCalculations.forEach(calc => {
      if (calc.contract?.contractedPowerKw) {
        newMap[calc.propId] = calc.contract.contractedPowerKw;
      } else {
        newMap[calc.propId] = calc.recommendedPower;
      }
    });
    setPropPowerMap(prev => ({ ...newMap, ...prev }));
  }, [acquisitions.length, activeContracts.length]);

  const handleContractForProperty = async (propId: string, propTitle: string) => {
    const pKw = propPowerMap[propId] || 15;
    setContractingPropId(propId);
    setSuccessMsg('');
    try {
      await onContractSupply(propId, propTitle, pKw);
      setSuccessMsg(`Suministro eléctrico contratado correctamente para "${propTitle}" (${pKw} kW)`);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setContractingPropId(null);
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border border-amber-500/30 rounded-2xl p-6 text-slate-100 shadow-xl space-y-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/40 shadow-inner">
            <Zap className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xl font-black text-white tracking-tight">IberLuz Comercializadora</h3>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                Contratación Individual por Inmueble
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestiona el suministro eléctrico de forma independiente para cada uno de los inmuebles en propiedad o alquiler
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-3 py-1 bg-slate-800 text-amber-300 border border-slate-700 rounded-lg">
            {activeContracts.length} / {acquisitions.length} Inmuebles Contratados
          </span>
        </div>
      </div>

      {/* Notice if user has no properties */}
      {acquisitions.length === 0 ? (
        <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-8 text-center space-y-3">
          <Building2 className="w-12 h-12 text-amber-400/60 mx-auto" />
          <h4 className="text-base font-bold text-white">No dispones de inmuebles en propiedad o alquiler</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            La contratación de energía eléctrica se realiza de manera individual para cada inmueble. Accede al Portal Inmobiliario para alquilar o adquirir una Nave Industrial, Local Comercial o Almacén.
          </p>
        </div>
      ) : (
        <>
          {/* Global Summary Metric Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/90 border border-slate-800 p-4 rounded-xl">
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Building2 className="w-3 h-3 text-amber-400" /> Inmuebles Activos
              </span>
              <p className="text-lg font-bold text-white mt-0.5">{acquisitions.length} Inmuebles</p>
            </div>
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Factory className="w-3 h-3 text-blue-400" /> Maquinaria Instalada
              </span>
              <p className="text-lg font-bold text-blue-300 mt-0.5">{totalGlobalMachineryKw} kW</p>
            </div>
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Lightbulb className="w-3 h-3 text-amber-400" /> Iluminación + Clima
              </span>
              <p className="text-lg font-bold text-amber-300 mt-0.5">{(totalGlobalLightingKw + totalGlobalHvacKw).toFixed(1)} kW</p>
            </div>
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" /> Consumo Total Est.
              </span>
              <p className="text-lg font-bold text-emerald-300 mt-0.5">{totalGlobalEstKwh.toLocaleString()} kWh/mes</p>
            </div>
          </div>

          {/* Individual Property Contracting Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>Configuración de Potencia y Contratación por Inmueble</span>
              </h4>
              {successMsg && (
                <span className="text-xs text-emerald-400 bg-emerald-950/90 border border-emerald-800 px-3 py-1 rounded-lg font-medium animate-fadeIn">
                  {successMsg}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6">
              {propertyCalculations.map((calc) => {
                const isContracted = !!calc.contract;
                const currentPower = propPowerMap[calc.propId] !== undefined 
                  ? propPowerMap[calc.propId] 
                  : (calc.contract?.contractedPowerKw || calc.recommendedPower);

                // Tariff calculation
                const powerCostEst = currentPower * 30.4 * 0.11;
                const energyCostEst = calc.estimatedMonthlyKwh * 0.14;
                const subtotalEst = powerCostEst + energyCostEst + 0.85;
                const ieeEst = subtotalEst * 0.0511269632;
                const ivaEst = (subtotalEst + ieeEst) * 0.21;
                const totalCostEst = Math.round((subtotalEst + ieeEst + ivaEst) * 100) / 100;

                return (
                  <div 
                    key={calc.propId}
                    className={`bg-slate-950/90 border-2 rounded-2xl p-5 space-y-4 transition-all duration-300 ${
                      isContracted 
                        ? 'border-emerald-500/40 shadow-lg shadow-emerald-950/20' 
                        : 'border-amber-500/30 hover:border-amber-500/60'
                    }`}
                  >
                    {/* Property Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl border ${
                          isContracted 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="text-base font-bold text-white">{calc.propTitle}</h5>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                              {calc.isNave ? 'Nave Industrial' : calc.isLocal ? 'Local Comercial' : 'Almacén'} • {calc.surface} m²
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            Estimación de consumo: <span className="text-amber-300 font-bold">{calc.estimatedMonthlyKwh} kWh/mes</span>
                          </p>
                        </div>
                      </div>

                      {isContracted ? (
                        <div className="flex items-center gap-2 bg-emerald-950/90 border border-emerald-800/90 px-3 py-1.5 rounded-xl">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-bold text-emerald-300">
                            Suministro Contratado ({calc.contract?.contractedPowerKw} kW)
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-900/60 px-2 py-0.5 rounded ml-1">
                            CUPS: {calc.contract?.cupsCode}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-amber-950/80 border border-amber-800/80 px-3 py-1.5 rounded-xl">
                          <AlertCircle className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-bold text-amber-300">
                            Sin Contrato Activo para este Inmueble
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Breakdown Badges for this Property */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-semibold">Maquinaria</span>
                        <span className="text-sm font-bold text-blue-300 font-mono">{calc.machineryKw} kW</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-semibold">Iluminación</span>
                        <span className="text-sm font-bold text-amber-300 font-mono">{calc.lightingKw.toFixed(1)} kW</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-semibold">Climatización</span>
                        <span className="text-sm font-bold text-purple-300 font-mono">{calc.hvacKw.toFixed(1)} kW</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-semibold">Ordenadores ({calc.pcCount} PCs)</span>
                        <span className="text-sm font-bold text-emerald-300 font-mono">{calc.pcKw.toFixed(2)} kW</span>
                      </div>
                    </div>

                    {/* Power Controls & Action for this property */}
                    <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Potencia Contratada (kW)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={10}
                              max={500}
                              step={5}
                              value={currentPower}
                              onChange={e => {
                                const val = Math.max(10, parseInt(e.target.value) || 10);
                                setPropPowerMap(prev => ({ ...prev, [calc.propId]: val }));
                              }}
                              className="w-28 bg-slate-950 border-2 border-amber-500/60 rounded-xl px-3 py-1.5 text-lg font-bold font-mono text-amber-400 text-center focus:outline-none focus:border-amber-400"
                            />
                            <div className="text-[11px] text-slate-400">
                              <span className="text-amber-400 font-semibold block">Recomendado: {calc.recommendedPower} kW</span>
                              <span className="text-slate-500">IberLuz 3.0TD Industrial</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Factura Estimada:</span>
                          <span className="text-xl font-black text-amber-400 font-mono">{totalCostEst.toFixed(2)} €/mes</span>
                        </div>

                        <button
                          onClick={() => handleContractForProperty(calc.propId, calc.propTitle)}
                          disabled={contractingPropId === calc.propId}
                          className={`py-2.5 px-4 font-extrabold text-xs rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer ${
                            isContracted
                              ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20'
                          }`}
                        >
                          <Zap className="w-4 h-4 fill-current" />
                          <span>
                            {contractingPropId === calc.propId
                              ? 'Guardando...'
                              : isContracted
                              ? 'Modificar Potencia'
                              : 'Contratar para este Inmueble'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Nota Aclaratoria sobre Domiciliación e Impuestos */}
      <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-200/90 flex items-start gap-3 mt-4">
        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-amber-300 font-bold block text-sm">Información sobre la Contratación Individual de Electricidad:</strong>
          <p className="leading-relaxed">
            • <strong>Contratación por Inmueble:</strong> Cada propiedad dispone de su propio código CUPS y su término de potencia ajustado de forma independiente según el uso real del inmueble.
          </p>
          <p className="leading-relaxed">
            • <strong>Facturación y cobro:</strong> IberLuz liquida el consumo el día 1 de cada mes y cobra la factura por domiciliación bancaria el <strong>día 5 de cada mes</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};
