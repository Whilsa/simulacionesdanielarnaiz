import React, { useState, useEffect } from 'react';
import { PropertyAcquisition, MachineryAcquisition, HiredEmployee, ElectricityContract, NaveFloorPlan } from '../types';
import { Zap, HelpCircle, CheckCircle2, Sliders, Shield, ArrowRight, Lightbulb, Monitor, Thermometer, Factory, Building2, Store } from 'lucide-react';

interface Props {
  acquisitions: PropertyAcquisition[];
  machinery: MachineryAcquisition[];
  employees: HiredEmployee[];
  floorPlans?: NaveFloorPlan[];
  currentContract?: ElectricityContract;
  onContractSupply: (powerKw: number) => Promise<void>;
}

export const ElectricitySupplyCard: React.FC<Props> = ({
  acquisitions,
  machinery,
  employees,
  floorPlans = [],
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
    const mKw = Number(m.requiredPowerKW || m.powerKw) || (m.category === 'metal_hierro' ? 35 : 25);
    totalMachineryKw += mKw;

    // Check employees assigned to this machine
    const assignedEmps = employees.filter(e => 
      e.assignedMachineryId === m.id || 
      e.assignedMachineryTitle === m.title || 
      (e.assignedMachineryTitle && m.lineTitle && e.assignedMachineryTitle.includes(m.lineTitle))
    );
    const shiftCount = Math.max(1, Math.min(3, assignedEmps.length));
    if (shiftCount > maxActiveShifts) maxActiveShifts = shiftCount;

    // 1 shift = 8h/day * 20 days/month = 160h/month
    const monthlyHours = shiftCount * 8 * 20;
    totalMachineryKwhMonth += mKw * monthlyHours;
  });

  if (machinery.length > 0 && maxActiveShifts === 0) maxActiveShifts = 1;

  // 2. Calculate Lighting, HVAC & Computers from Properties & Floor Plans
  let totalLightingKw = 0;
  let totalLightingKwhMonth = 0;

  let totalComputersKw = 0;
  let totalComputersKwhMonth = 0;

  let totalHvacKw = 0;
  let totalHvacKwhMonth = 0;

  let naveSurfaceTotal = 0;
  let localSurfaceTotal = 0;
  let almacenSurfaceTotal = 0;

  acquisitions.forEach(prop => {
    const pType = (prop.propertyType || prop.type || '').toLowerCase();
    const pTitle = (prop.propertyTitle || prop.title || '').toLowerCase();
    const isNave = pType === 'nave_industrial' || pType.includes('nave') || pTitle.includes('nave');
    const isLocal = pType === 'local_comercial' || pType.includes('local') || pTitle.includes('local');
    const isAlmacen = pType === 'almacen' || pType.includes('almacen') || pType.includes('almacén') || pTitle.includes('almacén') || pTitle.includes('almacen');

    const surface = Number(prop.surfaceM2) || 500;

    if (isNave) {
      naveSurfaceTotal += surface;

      // Check if a floor plan exists for this nave
      const plan = floorPlans.find(fp => 
        String(fp.propertyId) === String(prop.propertyId) || 
        String(fp.propertyId) === String(prop.id)
      );

      const adminM2 = plan ? plan.adminZoneM2 : Math.round(surface * 0.10);
      const machineryM2 = plan ? plan.machineryZoneM2 : Math.round(surface * 0.50);
      const storageM2 = plan ? plan.storageZoneM2 : Math.round(surface * 0.25);
      const freeM2 = plan ? plan.freeZoneM2 : Math.max(0, surface - adminM2 - machineryM2 - storageM2);

      // Lighting in Nave:
      // Machinery Zone: 8 W/m² = 0.008 kW/m²
      // Storage Zone: 5 W/m² = 0.005 kW/m²
      // Admin Zone: 10 W/m² = 0.010 kW/m²
      // Free Zone: 3 W/m² = 0.003 kW/m²
      const lightKwNave = (machineryM2 * 0.008) + (storageM2 * 0.005) + (adminM2 * 0.010) + (freeM2 * 0.003);
      totalLightingKw += lightKwNave;

      const naveShifts = maxActiveShifts || 1;
      totalLightingKwhMonth += lightKwNave * naveShifts * 160;

      // HVAC in Admin Zone of Nave: 60 W/m² = 0.060 kW/m² (1 shift = 160h)
      const hvacKwNaveAdmin = adminM2 * 0.060;
      totalHvacKw += hvacKwNaveAdmin;
      totalHvacKwhMonth += hvacKwNaveAdmin * 160;

      // Computers in Admin Zone of Nave (1 PC per ~20m² of admin space, minimum 2 PCs per nave)
      const pcCount = Math.max(2, Math.round(adminM2 / 20));
      totalComputersKw += pcCount * 0.10;
      totalComputersKwhMonth += pcCount * 0.10 * 160;

    } else if (isLocal) {
      localSurfaceTotal += surface;
      // Local Comercial Lighting: 15 W/m² = 0.015 kW/m² (1 shift = 160h)
      const lightKwLocal = surface * 0.015;
      totalLightingKw += lightKwLocal;
      totalLightingKwhMonth += lightKwLocal * 160;

      // Local Comercial HVAC: 60 W/m² = 0.060 kW/m² (1 shift = 160h)
      const hvacKwLocal = surface * 0.060;
      totalHvacKw += hvacKwLocal;
      totalHvacKwhMonth += hvacKwLocal * 160;

      // Computers in Local (default 2 PCs)
      totalComputersKw += 2 * 0.10;
      totalComputersKwhMonth += 2 * 0.10 * 160;

    } else if (isAlmacen) {
      almacenSurfaceTotal += surface;
      // Almacen Lighting: 6 W/m² = 0.006 kW/m² (1 shift = 160h)
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
  const recommendedPowerKw = totalRawKw > 0 ? Math.max(15, Math.ceil((totalRawKw * 1.15) / 5) * 5) : 0;

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

  // Sync selected power on contract or recommendation change
  useEffect(() => {
    if (currentContract?.contractedPowerKw) {
      setSelectedPowerKw(currentContract.contractedPowerKw);
    } else if (recommendedPowerKw > 0) {
      setSelectedPowerKw(recommendedPowerKw);
    }
  }, [currentContract?.contractedPowerKw, recommendedPowerKw]);

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
                <strong className="text-white">1. Maquinaria:</strong> Potencia acumulada de líneas adquiridas ({totalMachineryKw} kW). Consumo mensual estimado según turnos de operarios asignados ({maxActiveShifts} turno(s) = {maxActiveShifts * 160}h/mes).
              </li>
              <li>
                <strong className="text-white">2. Iluminación:</strong> Según plano de distribución asignado a cada nave (Producción: 8 W/m², Almacén: 5 W/m², Administración: 10 W/m², Zona Libre: 3 W/m²). Locales comerciales (15 W/m²), Almacenes (6 W/m²).
              </li>
              <li>
                <strong className="text-white">3. Ordenadores:</strong> 0,10 kW por equipo informático estimado en zona administrativa de naves y locales (160h/mes). <em>(Próximamente añadiremos la función de comprar y asignar ordenadores)</em>.
              </li>
              <li>
                <strong className="text-white">4. Climatización:</strong> Climatización en zona de Administración de naves industriales y locales comerciales (60 W/m² = 0,06 kW/m²).
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
