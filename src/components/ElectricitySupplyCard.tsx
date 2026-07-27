import React, { useState } from 'react';
import { PropertyAcquisition, MachineryAcquisition, HiredEmployee, ElectricityContract } from '../types';
import { Zap, HelpCircle, CheckCircle2, Sliders, Shield, ArrowRight, Lightbulb, Monitor, Thermometer, Factory, Building2, Store } from 'lucide-react';

interface Props {
  acquisitions: PropertyAcquisition[];
  machinery: MachineryAcquisition[];
  employees: HiredEmployee[];
  currentContract?: ElectricityContract;
  onContractSupply: (powerKw: number) => Promise<void>;
}

export const ElectricitySupplyCard: React.FC<Props> = ({
  acquisitions,
  machinery,
  employees,
  currentContract,
  onContractSupply
}) => {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPowerKw, setSelectedPowerKw] = useState<number>(currentContract?.contractedPowerKw || 0);
  const [contracting, setContracting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Calculate Machinery Consumption & Power
  let totalMachineryKw = 0;
  let totalMachineryKwhMonth = 0;
  let maxActiveShifts = 0;

  machinery.forEach(m => {
    const mKw = m.requiredPowerKW || m.powerKw || (m.category === 'metal_hierro' ? 35 : 25);
    totalMachineryKw += mKw;

    // Check employees assigned to this machine
    const assignedEmps = employees.filter(e => e.assignedMachineryId === m.id || e.assignedMachineryTitle === m.title);
    const shiftCount = Math.max(1, Math.min(3, assignedEmps.length));
    if (shiftCount > maxActiveShifts) maxActiveShifts = shiftCount;

    // 1 shift = 8h/day * 20 days/month = 160h/month
    const monthlyHours = shiftCount * 8 * 20;
    totalMachineryKwhMonth += mKw * monthlyHours;
  });

  if (machinery.length > 0 && maxActiveShifts === 0) maxActiveShifts = 1;

  // 2. Calculate Lighting Consumption & Power
  let totalLightingKw = 0;
  let totalLightingKwhMonth = 0;

  // 3. Calculate Computers Consumption & Power (0.10 kWh/h = 0.10 kW)
  let totalComputersKw = 0;
  let totalComputersKwhMonth = 0;

  // 4. Calculate HVAC Consumption & Power
  let totalHvacKw = 0;
  let totalHvacKwhMonth = 0;

  let naveSurfaceTotal = 0;
  let localSurfaceTotal = 0;
  let almacenSurfaceTotal = 0;

  acquisitions.forEach(prop => {
    const pType = prop.propertyType || prop.type || '';
    const isNave = pType === 'nave_industrial' || prop.propertyTitle?.toLowerCase().includes('nave');
    const isLocal = pType === 'local_comercial' || prop.propertyTitle?.toLowerCase().includes('local');
    const isAlmacen = pType === 'almacen' || prop.propertyTitle?.toLowerCase().includes('almacén');

    const surface = prop.surfaceM2 || 500;

    if (isNave) {
      naveSurfaceTotal += surface;
      // Nave lighting: 1 kWh per m2 per shift month (or 1 W/m2/h * active shift hours)
      const naveShifts = maxActiveShifts || 1;
      const lightingKwNave = surface * 0.005; // ~5 W/m2
      totalLightingKw += lightingKwNave;
      totalLightingKwhMonth += surface * naveShifts * 1.0; // 1 kWh/m2 per shift

      // Administration zone in Nave (10% of surface) for HVAC (60 W/m2 = 0.06 kW/m2)
      const adminSurface = Math.round(surface * 0.10);
      const hvacKwNaveAdmin = adminSurface * 0.060;
      totalHvacKw += hvacKwNaveAdmin;
      totalHvacKwhMonth += hvacKwNaveAdmin * 160; // 1 shift Mon-Fri

      // Computers in Nave (default 2 admin PCs)
      totalComputersKw += 2 * 0.10;
      totalComputersKwhMonth += 2 * 0.10 * 160;
    } else if (isLocal) {
      localSurfaceTotal += surface;
      // Local comercial lighting: 15 W/m2 = 0.015 kW/m2 (1 shift = 160h)
      const lightKwLocal = surface * 0.015;
      totalLightingKw += lightKwLocal;
      totalLightingKwhMonth += lightKwLocal * 160;

      // Local HVAC: 60 W/m2 = 0.060 kW/m2 (1 shift = 160h)
      const hvacKwLocal = surface * 0.060;
      totalHvacKw += hvacKwLocal;
      totalHvacKwhMonth += hvacKwLocal * 160;

      // Computers in Local (default 1 PC)
      totalComputersKw += 1 * 0.10;
      totalComputersKwhMonth += 1 * 0.10 * 160;
    } else if (isAlmacen) {
      almacenSurfaceTotal += surface;
      // Almacen lighting: 6 W/m2 = 0.006 kW/m2 (1 shift = 160h)
      const lightKwAlm = surface * 0.006;
      totalLightingKw += lightKwAlm;
      totalLightingKwhMonth += lightKwAlm * 160;

      // Computers in Almacen (default 1 PC)
      totalComputersKw += 1 * 0.10;
      totalComputersKwhMonth += 1 * 0.10 * 160;
    }
  });

  // Total Recommended Power in kW
  const totalRawKw = totalMachineryKw + totalLightingKw + totalComputersKw + totalHvacKw;
  const recommendedPowerKw = Math.max(15, Math.ceil((totalRawKw * 1.15) / 5) * 5); // Rounded to steps of 5 kW

  const estimatedMonthlyKwh = Math.round(
    totalMachineryKwhMonth + totalLightingKwhMonth + totalComputersKwhMonth + totalHvacKwhMonth
  );

  // Cost estimates: Potencia 0.11 €/kW/día * 30.4 días, Energía 0.14 €/kWh
  const powerCostEst = (selectedPowerKw || recommendedPowerKw) * 30.4 * 0.11;
  const energyCostEst = estimatedMonthlyKwh * 0.14;
  const subtotalEst = powerCostEst + energyCostEst + 0.85;
  const ieeEst = subtotalEst * 0.0511269632;
  const ivaEst = (subtotalEst + ieeEst) * 0.21;
  const totalCostEst = Math.round((subtotalEst + ieeEst + ivaEst) * 100) / 100;

  // Initialize selected power if 0
  if (selectedPowerKw === 0 && recommendedPowerKw > 0) {
    setSelectedPowerKw(recommendedPowerKw);
  }

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
                Suministro Eléctrico
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestión e instalación de la tarifa eléctrica industrial y comerciales
            </p>
          </div>
        </div>

        {currentContract && (
          <div className="flex items-center space-x-2 bg-emerald-950/80 border border-emerald-800/80 px-3 py-1.5 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-emerald-300 font-medium">Contrato Activo ({currentContract.contractedPowerKw} kW)</span>
          </div>
        )}
      </div>

      {/* Power Advisor Section */}
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
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
              <Factory className="w-3 h-3 text-blue-400" /> Maquinaria
            </span>
            <p className="text-lg font-bold text-blue-300 mt-1">{totalMachineryKw} kW</p>
            <p className="text-[10px] text-slate-500">{totalMachineryKwhMonth.toLocaleString()} kWh/mes ({maxActiveShifts} turnos)</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
              <Lightbulb className="w-3 h-3 text-amber-400" /> Iluminación
            </span>
            <p className="text-lg font-bold text-amber-300 mt-1">{totalLightingKw.toFixed(1)} kW</p>
            <p className="text-[10px] text-slate-500">{Math.round(totalLightingKwhMonth).toLocaleString()} kWh/mes</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
              <Monitor className="w-3 h-3 text-emerald-400" /> Ordenadores
            </span>
            <p className="text-lg font-bold text-emerald-300 mt-1">{totalComputersKw.toFixed(2)} kW</p>
            <p className="text-[10px] text-slate-500">{Math.round(totalComputersKwhMonth)} kWh/mes (0.10 kW/pc)</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
            <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
              <Thermometer className="w-3 h-3 text-purple-400" /> Climatización
            </span>
            <p className="text-lg font-bold text-purple-300 mt-1">{totalHvacKw.toFixed(1)} kW</p>
            <p className="text-[10px] text-slate-500">{Math.round(totalHvacKwhMonth).toLocaleString()} kWh/mes</p>
          </div>
        </div>

        {/* Calculation Criteria Details Modal / Collapsible */}
        {showDetailModal && (
          <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-4 text-xs text-slate-300 space-y-2 mt-3 animate-fadeIn">
            <h5 className="font-bold text-amber-400 text-sm mb-2">Normativa de Cálculo IberLuz Comercializadora:</h5>
            <ul className="list-disc list-inside space-y-1.5 text-slate-300">
              <li>
                <strong className="text-white">1. Maquinaria:</strong> Potencia de la maquinaria ({totalMachineryKw} kW) multiplicada por el número de turnos de empleados asignados ({maxActiveShifts} turnos = {maxActiveShifts * 160}h/mes).
              </li>
              <li>
                <strong className="text-white">2. Iluminación:</strong> Naves Industriales (1 kWh/m² por turno activo, {naveSurfaceTotal} m²), Locales Comerciales (15 W/m² = 0.015 kWh/m²/h, {localSurfaceTotal} m²), Almacenes (6 W/m² = 0.006 kWh/m²/h, {almacenSurfaceTotal} m²). 1 turno L-V (160h/mes).
              </li>
              <li>
                <strong className="text-white">3. Ordenadores:</strong> 0,10 kWh/h por ordenador encendido durante 1 turno de L-V (160h/mes). <em>(Próximamente añadiremos la función de comprar y asignar ordenadores)</em>.
              </li>
              <li>
                <strong className="text-white">4. Climatización:</strong> Locales comerciales (60 W/m² = 0.06 kWh/m²/h) y Zona de Administración de Naves (10% de superficie, 60 W/m²). 1 turno L-V.
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
              value={selectedPowerKw || recommendedPowerKw}
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
            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-black text-sm rounded-xl transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2"
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
    </div>
  );
};
