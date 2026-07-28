import React, { useState, useEffect } from 'react';
import { PropertyAcquisition, MachineryAcquisition, HiredEmployee, ElectricityContract, NaveFloorPlan } from '../types';
import { formatNumber } from '../lib/formatters';
import { 
  Zap, CheckCircle2, Factory, Building2, Sliders, Plus, Minus, Info, AlertCircle, 
  Monitor, Lightbulb, Thermometer, Clock, Calculator, ArrowRight, RefreshCw, Sparkles
} from 'lucide-react';

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
  const [contractingPropId, setContractingPropId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Per-property interactive projection state:
  // - extraMachineryMap: extra machinery kW the student plans to buy
  // - customPcMap: custom number of PCs/computers the student plans to buy
  // - shiftsMap: 1, 2 or 3 shifts
  // - propPowerMap: contracted power kW selected by student
  const [extraMachineryMap, setExtraMachineryMap] = useState<{ [propId: string]: number }>({});
  const [customPcMap, setCustomPcMap] = useState<{ [propId: string]: number }>({});
  const [shiftsMap, setShiftsMap] = useState<{ [propId: string]: number }>({});
  const [propPowerMap, setPropPowerMap] = useState<{ [propId: string]: number }>({});

  // Active contracts list
  const activeContracts = contracts.length > 0 
    ? contracts.filter(c => c.status === 'active')
    : (currentContract ? [currentContract] : []);

  // Compute breakdown per property
  const propertyCalculations = acquisitions.map(prop => {
    const pId = String(prop.id || prop.propertyId || '');
    const pTitle = String(prop.propertyTitle || prop.title || 'Inmueble');
    const pType = String(prop.propertyType || prop.type || prop.inmueble_tipo || prop.property_type || '').toLowerCase();
    
    let isNave = pType === 'nave_industrial' || pType.includes('nave') || pTitle.toLowerCase().includes('nave');
    let isLocal = pType === 'oficina' || pType === 'local_comercial' || pType.includes('oficina') || pType.includes('local') || pTitle.toLowerCase().includes('oficina') || pTitle.toLowerCase().includes('local');
    let isAlmacen = pType === 'almacen' || pType.includes('almacen') || pType.includes('almacén') || pTitle.toLowerCase().includes('almacén') || pTitle.toLowerCase().includes('almacen');

    if (!isNave && !isLocal && !isAlmacen) {
      isNave = true;
    }

    const surface = Number(prop.surfaceM2 || prop.superficie_m2 || prop.surface || prop.superficie) || 500;

    // Floor plan zones
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

    // 1. Installed Machinery Power (kW)
    let installedMachineryKw = 0;
    if (isNave) {
      machinery.forEach(m => {
        installedMachineryKw += Number(m.requiredPowerKW || m.powerKw || m.potencia || m.power) || (m.category === 'metal_hierro' ? 35 : 25);
      });
    }

    // Planned Extra Machinery Power
    const extraMachineryKw = extraMachineryMap[pId] !== undefined ? extraMachineryMap[pId] : 0;
    const totalMachineryKw = installedMachineryKw + extraMachineryKw;

    // Shifts
    const currentShifts = shiftsMap[pId] || 1;
    const machineryKwhMonth = totalMachineryKw * currentShifts * 160;

    // 2. Lighting Power (kW)
    let lightingKw = 0;
    if (isNave) {
      lightingKw = (machineryM2 * 0.008) + (storageM2 * 0.005) + (adminM2 * 0.010) + (freeM2 * 0.003);
    } else if (isLocal) {
      lightingKw = surface * 0.015;
    } else {
      lightingKw = surface * 0.006;
    }
    const lightingKwhMonth = lightingKw * (isNave ? currentShifts : 1) * 160;

    // 3. HVAC / Climate Power (kW)
    let hvacKw = 0;
    if (isNave) {
      hvacKw = adminM2 * 0.060;
    } else if (isLocal) {
      hvacKw = surface * 0.060;
    }
    const hvacKwhMonth = hvacKw * 160;

    // 4. PCs / Computer Equipment Power (kW)
    const defaultPcs = Math.max(2, Math.round(adminM2 / 20) || 2);
    const plannedPcs = customPcMap[pId] !== undefined ? customPcMap[pId] : defaultPcs;
    const pcKw = plannedPcs * 0.10; // 100W per PC
    const pcKwhMonth = pcKw * 160;

    // Total Kw & Recommended Contract Power
    const totalRawKw = totalMachineryKw + lightingKw + hvacKw + pcKw;
    // 15% safety margin, rounded up to steps of 5 kW
    const recommendedPower = totalRawKw > 0 ? Math.max(15, Math.ceil((totalRawKw * 1.15) / 5) * 5) : 15;
    const estimatedMonthlyKwh = Math.round(machineryKwhMonth + lightingKwhMonth + hvacKwhMonth + pcKwhMonth);

    // Matching active contract
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
      installedMachineryKw,
      extraMachineryKw,
      totalMachineryKw,
      lightingKw,
      hvacKw,
      plannedPcs,
      defaultPcs,
      pcKw,
      totalRawKw,
      recommendedPower,
      estimatedMonthlyKwh,
      contract
    };
  });

  // Initialize selected power map to recommended power when calculations change
  useEffect(() => {
    const newPowerMap: { [propId: string]: number } = {};
    const newPcMap: { [propId: string]: number } = {};
    propertyCalculations.forEach(calc => {
      if (calc.contract?.contractedPowerKw) {
        newPowerMap[calc.propId] = calc.contract.contractedPowerKw;
      } else if (propPowerMap[calc.propId] === undefined) {
        newPowerMap[calc.propId] = calc.recommendedPower;
      }

      if (customPcMap[calc.propId] === undefined) {
        newPcMap[calc.propId] = calc.defaultPcs;
      }
    });

    setPropPowerMap(prev => ({ ...newPowerMap, ...prev }));
    setCustomPcMap(prev => ({ ...newPcMap, ...prev }));
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
                Simulador & Contratación Eléctrica
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Personaliza tus previsiones de ordenadores y maquinaria para calcular y contratar la potencia óptima
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
        <div className="space-y-6">
          {/* Section Title */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-400" />
              <span>Configuración de Potencia y Estimador de Consumo</span>
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
                : calc.recommendedPower;

              // Tariff calculations
              const powerCostEst = currentPower * 30.4 * 0.11;
              const energyCostEst = calc.estimatedMonthlyKwh * 0.14;
              const subtotalEst = powerCostEst + energyCostEst + 0.85;
              const ieeEst = subtotalEst * 0.0511269632;
              const ivaEst = (subtotalEst + ieeEst) * 0.21;
              const totalCostEst = Math.round((subtotalEst + ieeEst + ivaEst) * 100) / 100;

              return (
                <div 
                  key={calc.propId}
                  className={`bg-slate-950/90 border-2 rounded-2xl p-6 space-y-6 transition-all duration-300 ${
                    isContracted 
                      ? 'border-emerald-500/40 shadow-lg shadow-emerald-950/20' 
                      : 'border-amber-500/30 hover:border-amber-500/60'
                  }`}
                >
                  {/* Property Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl border ${
                        isContracted 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="text-lg font-black text-white">{calc.propTitle}</h5>
                          <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            {calc.isNave ? 'Nave Industrial' : calc.isLocal ? 'Local Comercial' : 'Almacén'} • {calc.surface} m²
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Superficie administrativa: <span className="text-amber-300 font-semibold">{calc.adminM2} m²</span>
                        </p>
                      </div>
                    </div>

                    {isContracted ? (
                      <div className="flex items-center gap-2 bg-emerald-950/90 border border-emerald-800/90 px-3 py-1.5 rounded-xl">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-300">
                          Contrato Activo ({calc.contract?.contractedPowerKw} kW)
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-900/60 px-2 py-0.5 rounded ml-1">
                          CUPS: {calc.contract?.cupsCode}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-amber-950/80 border border-amber-800/80 px-3 py-1.5 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-amber-300">
                          Pendiente de Contratar
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Interactive Customization Controls */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-amber-400" />
                        <span>Parámetros de Simulación de Equipamiento (Previsión de Compra)</span>
                      </span>
                      <span className="text-[11px] text-slate-400">Ajusta los valores para simular la potencia requerida</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                      {/* Control 1: Custom PCs / Computers */}
                      <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                            <Monitor className="w-4 h-4 text-emerald-400" />
                            <span>Ordenadores / PCs previstos a comprar:</span>
                          </label>
                          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-0.5 rounded-lg">
                            {formatNumber(calc.plannedPcs * 0.10)} kW
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              const current = calc.plannedPcs;
                              setCustomPcMap(prev => ({ ...prev, [calc.propId]: Math.max(0, current - 1) }));
                            }}
                            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center border border-slate-700 transition"
                          >
                            <Minus className="w-4 h-4" />
                          </button>

                          <div className="text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={calc.plannedPcs}
                              onChange={e => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setCustomPcMap(prev => ({ ...prev, [calc.propId]: val }));
                              }}
                              className="w-20 text-center font-mono font-black text-xl text-white bg-slate-950 border border-slate-700 rounded-lg py-1 focus:outline-none focus:border-emerald-500"
                            />
                            <span className="text-[10px] text-slate-400 block mt-0.5">PCs (~100W c/u)</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const current = calc.plannedPcs;
                              setCustomPcMap(prev => ({ ...prev, [calc.propId]: current + 1 }));
                            }}
                            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center border border-slate-700 transition"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Estimación recomendada según zona de oficinas ({calc.adminM2} m²): <strong className="text-slate-200">{calc.defaultPcs} PCs</strong>. Puedes aumentar el número de equipos si prevés ampliar el personal.
                        </p>
                      </div>

                      {/* Control 2: Custom Machinery Power */}
                      <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                            <Factory className="w-4 h-4 text-blue-400" />
                            <span>Potencia de Maquinaria Adicional prevista (kW):</span>
                          </label>
                          <span className="text-xs font-mono font-bold text-blue-300 bg-blue-950/80 border border-blue-800/60 px-2.5 py-0.5 rounded-lg">
                            Total: {calc.totalMachineryKw} kW
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              const current = calc.extraMachineryKw;
                              setExtraMachineryMap(prev => ({ ...prev, [calc.propId]: Math.max(0, current - 5) }));
                            }}
                            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center border border-slate-700 transition"
                          >
                            <Minus className="w-4 h-4" />
                          </button>

                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-xs text-slate-400 font-mono">+</span>
                              <input
                                type="number"
                                min={0}
                                max={500}
                                step={5}
                                value={calc.extraMachineryKw}
                                onChange={e => {
                                  const val = Math.max(0, parseInt(e.target.value) || 0);
                                  setExtraMachineryMap(prev => ({ ...prev, [calc.propId]: val }));
                                }}
                                className="w-20 text-center font-mono font-black text-xl text-blue-300 bg-slate-950 border border-slate-700 rounded-lg py-1 focus:outline-none focus:border-blue-500"
                              />
                              <span className="text-xs text-slate-400 font-mono">kW</span>
                            </div>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              (Instalada: {calc.installedMachineryKw} kW)
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const current = calc.extraMachineryKw;
                              setExtraMachineryMap(prev => ({ ...prev, [calc.propId]: current + 5 }));
                            }}
                            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center border border-slate-700 transition"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Añade potencia extra si tienes pensado adquirir nueva maquinaria en la sección de Maquinaria e Instalaciones.
                        </p>
                      </div>
                    </div>

                    {/* Turnos / Horas de Uso */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-semibold text-slate-300">Turnos de Trabajo Previstos:</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {[1, 2, 3].map(s => {
                          const isSel = (shiftsMap[calc.propId] || 1) === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setShiftsMap(prev => ({ ...prev, [calc.propId]: s }))}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition border ${
                                isSel
                                  ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/40'
                                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                              }`}
                            >
                              {s} {s === 1 ? 'Turno (8h/día)' : s === 2 ? 'Turnos (16h/día)' : 'Turnos (24h/día)'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Power Recommendation Box */}
                  <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border border-amber-500/40 p-4 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                          <h6 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                            Potencia Recomendada a Contratar
                          </h6>
                        </div>
                        <p className="text-xs text-slate-300">
                          Calculada sobre la carga técnica máxima ({formatNumber(calc.totalRawKw)} kW) + 15% margen de seguridad.
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Sugerido por IberLuz</span>
                          <span className="text-2xl font-black text-amber-400 font-mono">{calc.recommendedPower} kW</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setPropPowerMap(prev => ({ ...prev, [calc.propId]: calc.recommendedPower }))}
                          className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Aplicar Recomendada</span>
                        </button>
                      </div>
                    </div>

                    {/* Technical breakdown summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-amber-500/20 text-xs">
                      <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Maquinaria</span>
                        <span className="font-bold text-blue-300 font-mono">{formatNumber(calc.totalMachineryKw)} kW</span>
                      </div>
                      <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Iluminación</span>
                        <span className="font-bold text-amber-300 font-mono">{formatNumber(calc.lightingKw)} kW</span>
                      </div>
                      <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Climatización</span>
                        <span className="font-bold text-purple-300 font-mono">{formatNumber(calc.hvacKw)} kW</span>
                      </div>
                      <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">Oficina ({calc.plannedPcs} PCs)</span>
                        <span className="font-bold text-emerald-300 font-mono">{formatNumber(calc.pcKw)} kW</span>
                      </div>
                    </div>
                  </div>

                  {/* Final Power Selection & Contracting Action */}
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Potencia a Contratar para {calc.propTitle} (kW)
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const val = Math.max(10, currentPower - 5);
                              setPropPowerMap(prev => ({ ...prev, [calc.propId]: val }));
                            }}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold border border-slate-700 flex items-center justify-center"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

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

                          <button
                            type="button"
                            onClick={() => {
                              const val = currentPower + 5;
                              setPropPowerMap(prev => ({ ...prev, [calc.propId]: val }));
                            }}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold border border-slate-700 flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="text-xs text-slate-400">kW</span>
                      </div>
                    </div>

                    <div className="text-right flex items-center justify-between sm:justify-end gap-5 w-full sm:w-auto">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Factura Est. Mensual:</span>
                        <span className="text-2xl font-black text-amber-400 font-mono">{formatNumber(totalCostEst)} €/mes</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleContractForProperty(calc.propId, calc.propTitle)}
                        disabled={contractingPropId === calc.propId}
                        className={`py-3 px-5 font-extrabold text-xs rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer ${
                          isContracted
                            ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20'
                        }`}
                      >
                        <Zap className="w-4 h-4 fill-current" />
                        <span>
                          {contractingPropId === calc.propId
                            ? 'Procesando...'
                            : isContracted
                            ? 'Modificar Contrato'
                            : 'Contratar Suministro'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-200/90 flex items-start gap-3 mt-4">
        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-amber-300 font-bold block text-sm">Información sobre la Contratación y Cálculo de Potencia:</strong>
          <p className="leading-relaxed">
            • <strong>Previsión de Cargas:</strong> El simulador te permite estimar el impacto en potencia (kW) al comprar nuevos equipos informáticos o instalar maquinaria pesada adicional.
          </p>
          <p className="leading-relaxed">
            • <strong>Liquidación:</strong> IberLuz realiza la liquidación mensual de potencia y energía el día 1 de cada mes y domicilia el recibo bancario el <strong>día 5 de cada mes</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};
