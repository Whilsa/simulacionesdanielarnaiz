import React, { useState, useEffect } from 'react';
import { PropertyAcquisition, MachineryAcquisition, HiredEmployee, ElectricityContract, NaveFloorPlan } from '../types';
import { Zap, HelpCircle, CheckCircle2, Shield, Lightbulb, Monitor, Thermometer, Factory, Building2, Sliders, Plus, Minus, Info } from 'lucide-react';

interface Props {
  acquisitions: PropertyAcquisition[];
  machinery: MachineryAcquisition[];
  employees: HiredEmployee[];
  floorPlans?: NaveFloorPlan[];
  currentContract?: ElectricityContract;
  onContractSupply: (powerKw: number) => Promise<void>;
}

export const ElectricitySupplyCard: React.FC<Props> = ({
  acquisitions = [],
  machinery = [],
  employees = [],
  floorPlans = [],
  currentContract,
  onContractSupply
}) => {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [contracting, setContracting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Interactive Student Projections
  const [selectedShifts, setSelectedShifts] = useState<number>(1);
  const [customPcCount, setCustomPcCount] = useState<number | null>(null);

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

  // 1. Calculate Machinery Power & Monthly Energy
  let totalMachineryKw = 0;
  machinery.forEach(m => {
    const mKw = Number(m.requiredPowerKW || m.powerKw || m.potencia || m.power) || (m.category === 'metal_hierro' ? 35 : 25);
    totalMachineryKw += mKw;
  });
  const totalMachineryKwhMonth = totalMachineryKw * effectiveShifts * 160;

  // 2. Calculate Properties, Lighting, HVAC & Area Distribution
  let totalLightingKw = 0;
  let totalLightingKwhMonth = 0;

  let totalHvacKw = 0;
  let totalHvacKwhMonth = 0;

  let naveSurfaceTotal = 0;
  let localSurfaceTotal = 0;
  let almacenSurfaceTotal = 0;
  let adminSurfaceTotal = 0;

  acquisitions.forEach(prop => {
    const pType = String(prop.propertyType || prop.type || prop.inmueble_tipo || prop.property_type || '').toLowerCase();
    const pTitle = String(prop.propertyTitle || prop.title || prop.inmueble_titulo || '').toLowerCase();
    
    let isNave = pType === 'nave_industrial' || pType.includes('nave') || pTitle.includes('nave');
    let isLocal = pType === 'local_comercial' || pType.includes('local') || pTitle.includes('local');
    let isAlmacen = pType === 'almacen' || pType.includes('almacen') || pType.includes('almacén') || pTitle.includes('almacén') || pTitle.includes('almacen');

    // Fallback if property exists but type is unassigned or generic
    if (!isNave && !isLocal && !isAlmacen) {
      isNave = true;
    }

    const surface = Number(prop.surfaceM2 || prop.superficie_m2 || prop.surface || prop.superficie) || 500;

    if (isNave) {
      naveSurfaceTotal += surface;

      // Find matching floor plan
      const plan = floorPlans.find(fp => 
        (fp.propertyId && (String(fp.propertyId) === String(prop.propertyId) || String(fp.propertyId) === String(prop.id))) ||
        (fp.acquisitionId && String(fp.acquisitionId) === String(prop.id)) ||
        (fp.propertyTitle && pTitle && fp.propertyTitle.toLowerCase().trim() === pTitle.trim())
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
        // Default architectural distribution before custom floor plan is saved
        adminM2 = Math.round(surface * 0.10);
        machineryM2 = Math.round(surface * 0.50);
        storageM2 = Math.round(surface * 0.25);
        freeM2 = Math.max(0, surface - adminM2 - machineryM2 - storageM2);
      }

      adminSurfaceTotal += adminM2;

      // Lighting in Nave: Machinery (8 W/m²), Storage (5 W/m²), Admin (10 W/m²), Free (3 W/m²)
      const lightKwNave = (machineryM2 * 0.008) + (storageM2 * 0.005) + (adminM2 * 0.010) + (freeM2 * 0.003);
      totalLightingKw += lightKwNave;
      totalLightingKwhMonth += lightKwNave * effectiveShifts * 160;

      // HVAC in Admin Zone of Nave: 60 W/m² = 0.060 kW/m² (160h/mes)
      const hvacKwNaveAdmin = adminM2 * 0.060;
      totalHvacKw += hvacKwNaveAdmin;
      totalHvacKwhMonth += hvacKwNaveAdmin * 160;

    } else if (isLocal) {
      localSurfaceTotal += surface;
      adminSurfaceTotal += surface;

      // Local Comercial Lighting (15 W/m²) & HVAC (60 W/m²)
      const lightKwLocal = surface * 0.015;
      totalLightingKw += lightKwLocal;
      totalLightingKwhMonth += lightKwLocal * 160;

      const hvacKwLocal = surface * 0.060;
      totalHvacKw += hvacKwLocal;
      totalHvacKwhMonth += hvacKwLocal * 160;

    } else if (isAlmacen) {
      almacenSurfaceTotal += surface;
      // Almacen Lighting (6 W/m²)
      const lightKwAlm = surface * 0.006;
      totalLightingKw += lightKwAlm;
      totalLightingKwhMonth += lightKwAlm * 160;
    }
  });

  // 3. Computers Calculation (0.10 kW per PC, 160h/month)
  const defaultCalculatedPcs = acquisitions.length > 0 
    ? Math.max(2, Math.round(adminSurfaceTotal / 20) || (acquisitions.length * 2))
    : 2;
  
  const pcCount = customPcCount !== null ? customPcCount : defaultCalculatedPcs;
  const totalComputersKw = pcCount * 0.10;
  const totalComputersKwhMonth = pcCount * 0.10 * 160;

  // 4. Totals & Recommendation
  const totalRawKw = totalMachineryKw + totalLightingKw + totalComputersKw + totalHvacKw;
  const recommendedPowerKw = totalRawKw > 0 ? Math.max(15, Math.ceil((totalRawKw * 1.15) / 5) * 5) : 0;

  const [selectedPowerKw, setSelectedPowerKw] = useState<number>(currentContract?.contractedPowerKw || recommendedPowerKw || 15);

  const estimatedMonthlyKwh = Math.round(
    totalMachineryKwhMonth + totalLightingKwhMonth + totalComputersKwhMonth + totalHvacKwhMonth
  );

  // Sync selected power on contract or recommendation change
  useEffect(() => {
    if (currentContract?.contractedPowerKw) {
      setSelectedPowerKw(currentContract.contractedPowerKw);
    } else if (recommendedPowerKw > 0) {
      setSelectedPowerKw(recommendedPowerKw);
    }
  }, [currentContract?.contractedPowerKw, recommendedPowerKw]);

  // Financial Estimates (3.0TD Tarifa Industrial)
  const powerCostEst = (selectedPowerKw || recommendedPowerKw) * 30.4 * 0.11;
  const energyCostEst = estimatedMonthlyKwh * 0.14;
  const subtotalEst = powerCostEst + energyCostEst + 0.85;
  const ieeEst = subtotalEst * 0.0511269632;
  const ivaEst = (subtotalEst + ieeEst) * 0.21;
  const totalCostEst = Math.round((subtotalEst + ieeEst + ivaEst) * 100) / 100;

  const handleContract = async () => {
    setContracting(true);
    setSuccessMsg('');
    try {
      await onContractSupply(selectedPowerKw || recommendedPowerKw);
      setSuccessMsg('Suministro eléctrico contratado correctamente con IberLuz Comercializadora');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setContracting(false);
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
                Asesoría de Potencia Eléctrica
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cálculo y recomendación en tiempo real según naves, maquinaria, planos y ordenadores
            </p>
          </div>
        </div>

        {currentContract && (
          <div className="flex items-center space-x-2 bg-emerald-950/80 border border-emerald-800/80 px-3 py-1.5 rounded-lg shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-300 font-medium">Contrato Activo ({currentContract.contractedPowerKw} kW)</span>
          </div>
        )}
      </div>

      {/* Student Interactive Simulation Controls */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Parámetros de Producción y Previsión de la Empresa</h4>
          </div>
          <span className="text-[10px] text-slate-400">Ajusta los valores para simular el consumo eléctrico</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Shift Selector */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col justify-between space-y-2">
            <div>
              <span className="text-xs font-semibold text-slate-200 block">Turnos de Trabajo Previstos (Maquinaria)</span>
              <span className="text-[10px] text-slate-400 block">
                {activeEmpShifts > 0 ? `Turnos actuales con plantilla: ${activeEmpShifts}` : 'Sin empleados contratados todavía (Puedes proyectar turnos futuros)'}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {[1, 2, 3].map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedShifts(s)}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition border ${
                    effectiveShifts === s
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {s} {s === 1 ? 'Turno (8h)' : 'Turnos'}
                </button>
              ))}
            </div>
          </div>

          {/* PC Count Selector */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col justify-between space-y-2">
            <div>
              <span className="text-xs font-semibold text-slate-200 block">Ordenadores Previstos (Oficinas / Puestos)</span>
              <span className="text-[10px] text-slate-400 block">
                Estimado en zona admin: {defaultCalculatedPcs} PCs (0,10 kW por equipo encendido)
              </span>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => setCustomPcCount(Math.max(0, pcCount - 1))}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="px-4 py-1 bg-slate-950 border border-amber-500/40 rounded-lg text-center font-mono font-bold text-amber-400 text-base min-w-[3rem]">
                {pcCount} <span className="text-[10px] font-normal text-slate-400">PCs</span>
              </div>
              <button
                onClick={() => setCustomPcCount(pcCount + 1)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
              </button>
              {customPcCount !== null && (
                <button
                  onClick={() => setCustomPcCount(null)}
                  className="text-[10px] text-amber-400 underline hover:text-amber-300 ml-auto"
                >
                  Restablecer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Power Advisor Real-Time Breakdown */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            <h4 className="font-bold text-white text-sm">Asesor de Potencia y Consumo Recomendado</h4>
          </div>
          <button
            onClick={() => setShowDetailModal(!showDetailModal)}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center space-x-1 hover:underline"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showDetailModal ? 'Ocultar Criterios' : 'Ver Criterios de Cálculo'}</span>
          </button>
        </div>

        {/* Breakdown Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Machinery Badge */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
              <Factory className="w-3 h-3 text-blue-400" /> Maquinaria
            </span>
            <p className="text-lg font-bold text-blue-300 mt-1">{totalMachineryKw} kW</p>
            <p className="text-[10px] text-slate-500">
              {totalMachineryKwhMonth.toLocaleString()} kWh/mes ({effectiveShifts} turno{effectiveShifts > 1 ? 's' : ''})
            </p>
          </div>

          {/* Lighting Badge */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
              <Lightbulb className="w-3 h-3 text-amber-400" /> Iluminación
            </span>
            <p className="text-lg font-bold text-amber-300 mt-1">{totalLightingKw.toFixed(1)} kW</p>
            <p className="text-[10px] text-slate-500">
              {Math.round(totalLightingKwhMonth).toLocaleString()} kWh/mes ({naveSurfaceTotal + localSurfaceTotal + almacenSurfaceTotal} m²)
            </p>
          </div>

          {/* Computers Badge */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
              <Monitor className="w-3 h-3 text-emerald-400" /> Ordenadores
            </span>
            <p className="text-lg font-bold text-emerald-300 mt-1">{totalComputersKw.toFixed(2)} kW</p>
            <p className="text-[10px] text-slate-500">
              {Math.round(totalComputersKwhMonth)} kWh/mes ({pcCount} PCs @ 0,10 kW)
            </p>
          </div>

          {/* HVAC Badge */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
              <Thermometer className="w-3 h-3 text-purple-400" /> Climatización
            </span>
            <p className="text-lg font-bold text-purple-300 mt-1">{totalHvacKw.toFixed(1)} kW</p>
            <p className="text-[10px] text-slate-500">
              {Math.round(totalHvacKwhMonth).toLocaleString()} kWh/mes ({adminSurfaceTotal} m² de oficina/local)
            </p>
          </div>
        </div>

        {/* Calculation Criteria Details Modal / Collapsible */}
        {showDetailModal && (
          <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-4 text-xs text-slate-300 space-y-2 mt-3 animate-fadeIn">
            <h5 className="font-bold text-amber-400 text-sm mb-2">Normativa de Cálculo IberLuz Comercializadora:</h5>
            <ul className="list-disc list-inside space-y-1.5 text-slate-300">
              <li>
                <strong className="text-white">1. Maquinaria:</strong> Potencia acumulada de la maquinaria adquirida ({totalMachineryKw} kW). Consumo mensual calculado a según turnos seleccionados ({effectiveShifts} turno(s) = {effectiveShifts * 160}h/mes).
              </li>
              <li>
                <strong className="text-white">2. Iluminación:</strong> Según el plano de distribución de cada nave (Producción: 8 W/m², Almacén: 5 W/m², Administración: 10 W/m², Zona Libre: 3 W/m²). Locales comerciales (15 W/m²), Almacenes (6 W/m²).
              </li>
              <li>
                <strong className="text-white">3. Ordenadores:</strong> 0,10 kW por equipo informático encendido ({pcCount} ordenadores seleccionados = {totalComputersKw.toFixed(2)} kW).
              </li>
              <li>
                <strong className="text-white">4. Climatización:</strong> Climatización de zonas de administración de naves industriales ({adminSurfaceTotal} m²) y locales comerciales (60 W/m² = 0,06 kW/m²).
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Contract Form Controls */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Potencia a Contratar (kW)
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="number"
              min={10}
              max={500}
              step={5}
              value={selectedPowerKw || recommendedPowerKw || 15}
              onChange={e => setSelectedPowerKw(Math.max(10, parseInt(e.target.value) || 10))}
              className="w-32 bg-slate-900 border-2 border-amber-500/60 rounded-xl px-4 py-2 text-xl font-bold font-mono text-amber-400 focus:outline-none focus:border-amber-400 text-center"
            />
            <div className="text-xs text-slate-400">
              <p className="text-amber-400 font-semibold">Recomendado: {recommendedPowerKw} kW</p>
              <p>Margen de seguridad: ~15%</p>
            </div>
          </div>
        </div>

        <div className="space-y-1 text-xs text-slate-300 border-l border-slate-800 pl-4">
          <p className="font-bold text-white text-sm mb-1">Tarifa IberLuz 3.0TD Industrial</p>
          <p>• Término de Potencia: <span className="font-mono text-amber-300 font-semibold">0,11 €/kW/día</span></p>
          <p>• Término de Energía: <span className="font-mono text-amber-300 font-semibold">0,14 €/kWh</span></p>
          <p>• Alquiler contador: <span className="font-mono text-slate-400">0,85 €/mes</span></p>
        </div>

        <div className="space-y-2 text-right">
          <div className="text-xs text-slate-400">
            <span>Estimación Factura Mensual:</span>
            <p className="text-2xl font-black text-amber-400 font-mono">{totalCostEst.toFixed(2)} €/mes</p>
            <p className="text-[10px] text-slate-500">(Incluye IEE 5.11% e IVA 21%)</p>
          </div>

          <button
            onClick={handleContract}
            disabled={contracting}
            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-black text-sm rounded-xl transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{currentContract ? 'Actualizar Potencia Contratada' : 'Contratar Suministro Eléctrico'}</span>
          </button>

          {successMsg && (
            <p className="text-xs text-emerald-400 font-medium text-center bg-emerald-950/80 border border-emerald-800 p-2 rounded-lg">
              {successMsg}
            </p>
          )}
        </div>
      </div>

      {/* Nota Aclaratoria sobre Pago de Potencia */}
      <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-200/90 flex items-start gap-3 mt-4">
        <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-amber-300 font-bold block text-sm">Nota Aclaratoria: ¿Cuándo se realizan los pagos de la potencia eléctrica contratada?</strong>
          <p className="leading-relaxed">
            • <strong>Devengo diario continuo:</strong> El coste por término de potencia contratada (<span className="font-mono text-amber-300">0,11 €/kW/día</span>) y el consumo de energía (<span className="font-mono text-amber-300">0,14 €/kWh</span>) se acumulan día a día a partir del momento de la contratación.
          </p>
          <p className="leading-relaxed">
            • <strong>Emisión de factura:</strong> La comercializadora <strong>IberLuz</strong> liquida y emite la factura del mes transcurrido el <strong>día 1 de cada mes</strong>.
          </p>
          <p className="leading-relaxed">
            • <strong>Cobro automático por domiciliación:</strong> El importe total de la factura se cobra automáticamente por domiciliación bancaria el <strong>día 5 de cada mes</strong>, descontándose directamente del saldo de la cuenta corriente de la empresa.
          </p>
        </div>
      </div>
    </div>
  );
};
