import React, { useState, useEffect } from 'react';
import { PropertyAcquisition, MachineryAcquisition, NaveFloorPlan } from '../types';
import { Layers, CheckCircle2, AlertTriangle, Save, Maximize2, LayoutGrid, Info, Box } from 'lucide-react';

interface Props {
  acquisition: PropertyAcquisition;
  studentMachinery: MachineryAcquisition[];
  existingFloorPlan?: NaveFloorPlan;
  onSave: (plan: Partial<NaveFloorPlan>) => Promise<void>;
  onClose?: () => void;
}

export const NaveFloorPlanViewer: React.FC<Props> = ({
  acquisition,
  studentMachinery,
  existingFloorPlan,
  onSave,
  onClose
}) => {
  const naveSurface = acquisition.surfaceM2 || 1000;

  // Calculate Machinery Surface requirement
  // 240 m2 per metal machine, 180 m2 per plastic machine
  const metalMachinesCount = studentMachinery.filter(m => 
    m.category === 'metal_hierro' || m.title?.toLowerCase().includes('metal') || m.lineTitle?.toLowerCase().includes('metal')
  ).length;

  const plasticMachinesCount = studentMachinery.filter(m => 
    m.category === 'plastico_montaje' || m.category === 'plastico_ensamblaje' || m.title?.toLowerCase().includes('plástic') || m.lineTitle?.toLowerCase().includes('plástic')
  ).length;

  const requiredMachineryM2 = (metalMachinesCount * 240) + (plasticMachinesCount * 180);

  // Calculate Warehouse requirement
  // If 1 machine type -> 2 almacenes (Materias primas, Productos terminados) min 30 m2 each
  // If BOTH machine types -> 3 almacenes (Materias primas, Semiterminados varillas/puntas, Productos terminados destornilladores) min 30 m2 each
  // If 2 equal machines -> 2 almacenes min 30 m2 each
  let requiredWarehouseCount = 2;
  let warehouseDescriptions: string[] = [];

  if (metalMachinesCount > 0 && plasticMachinesCount > 0) {
    requiredWarehouseCount = 3;
    warehouseDescriptions = [
      'Almacén 1: Materias Primas (Mín. 30 m²)',
      'Almacén 2: Productos Semiterminados - Varillas y Puntas (Mín. 30 m²)',
      'Almacén 3: Productos Terminados - Destornilladores y Ensamblaje Final (Mín. 30 m²)'
    ];
  } else if (metalMachinesCount > 0 || plasticMachinesCount > 0) {
    requiredWarehouseCount = 2;
    warehouseDescriptions = [
      'Almacén 1: Materias Primas (Mín. 30 m²)',
      'Almacén 2: Productos Terminados (Mín. 30 m²)'
    ];
  } else {
    // Default if no machinery purchased yet
    requiredWarehouseCount = 2;
    warehouseDescriptions = [
      'Almacén 1: Materias Primas (Mín. 30 m²)',
      'Almacén 2: Productos Terminados (Mín. 30 m²)'
    ];
  }

  const requiredStorageM2 = requiredWarehouseCount * 30; // 30 m2 per warehouse
  const defaultAdminM2 = Math.max(40, Math.round(naveSurface * 0.10));

  // Initial state values
  const [machineryM2, setMachineryM2] = useState<number>(
    existingFloorPlan?.machineryZoneM2 || Math.max(requiredMachineryM2, 240)
  );
  const [storageM2, setStorageM2] = useState<number>(
    existingFloorPlan?.storageZoneM2 || Math.max(requiredStorageM2, 60)
  );
  const [adminM2, setAdminM2] = useState<number>(
    existingFloorPlan?.adminZoneM2 || defaultAdminM2
  );

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Keep within total surface
  const usedM2 = machineryM2 + storageM2 + adminM2;
  const freeM2 = Math.max(0, naveSurface - usedM2);

  // Validation checks
  const isMachineryValid = machineryM2 >= requiredMachineryM2;
  const isStorageValid = storageM2 >= requiredStorageM2;
  const isTotalValid = usedM2 <= naveSurface;

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg('');
    try {
      await onSave({
        propertyId: acquisition.propertyId || acquisition.id,
        machineryZoneM2: machineryM2,
        storageZoneM2: storageM2,
        adminZoneM2: adminM2,
        freeZoneM2: freeM2,
        warehousesCount: requiredWarehouseCount
      });
      setSuccessMsg('Plano guardado correctamente');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-5 text-slate-100 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <span>Plano de Distribución: {acquisition.propertyTitle}</span>
            </h3>
            <p className="text-xs text-slate-400">
              Superficie Total disponible: <span className="text-blue-400 font-semibold">{naveSurface} m²</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {successMsg && (
            <span className="text-xs text-emerald-400 font-medium bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-md">
              {successMsg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !isTotalValid}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm rounded-lg transition shadow-md"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Plano'}</span>
          </button>
        </div>
      </div>

      {/* Blueprint Visual Diagram */}
      <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-4 overflow-hidden">
        <div className="absolute top-2 right-3 text-[10px] uppercase tracking-wider text-slate-500 font-mono">
          Esquema Arquitectónico - Nave Industrial ({naveSurface} m²)
        </div>

        {/* Blueprint Grid Canvas */}
        <div 
          className="w-full h-64 rounded-lg border-2 border-slate-700/80 p-2 relative flex flex-col justify-between overflow-hidden"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(59, 130, 246, 0.15) 1px, transparent 1px)`,
            backgroundSize: '16px 16px'
          }}
        >
          {/* Visual Zones Layout */}
          <div className="grid grid-cols-12 gap-2 h-full w-full">
            {/* Machinery Zone */}
            <div 
              style={{ flex: machineryM2 }}
              className="col-span-6 bg-blue-900/40 border-2 border-blue-500/60 rounded-md p-3 flex flex-col justify-between backdrop-blur-sm relative group hover:border-blue-400 transition"
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-blue-400" /> Zona de Maquinaria
                </span>
                <span className="text-xs font-mono bg-blue-950/80 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
                  {machineryM2} m²
                </span>
              </div>
              <div className="space-y-1 my-auto text-xs text-blue-200/80">
                <p>• Línea Metal: {metalMachinesCount} unid. ({metalMachinesCount * 240} m² min)</p>
                <p>• Línea Plástico: {plasticMachinesCount} unid. ({plasticMachinesCount * 180} m² min)</p>
              </div>
              <div className="text-[10px] text-blue-400 font-mono">
                Requerido mín: {requiredMachineryM2} m² {isMachineryValid ? '✓' : '⚠️ Insuficiente'}
              </div>
            </div>

            {/* Storage Zone */}
            <div 
              style={{ flex: storageM2 }}
              className="col-span-3 bg-emerald-900/40 border-2 border-emerald-500/60 rounded-md p-3 flex flex-col justify-between backdrop-blur-sm relative group hover:border-emerald-400 transition"
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" /> Almacenes ({requiredWarehouseCount})
                </span>
                <span className="text-xs font-mono bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                  {storageM2} m²
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-emerald-200/80 my-auto">
                {warehouseDescriptions.map((desc, idx) => (
                  <p key={idx} className="truncate" title={desc}>• {desc}</p>
                ))}
              </div>
              <div className="text-[10px] text-emerald-400 font-mono">
                Requerido mín: {requiredStorageM2} m² {isStorageValid ? '✓' : '⚠️ Insuficiente'}
              </div>
            </div>

            {/* Admin & Free Zone */}
            <div className="col-span-3 flex flex-col gap-2 h-full">
              {/* Admin Zone */}
              <div className="flex-1 bg-purple-900/40 border-2 border-purple-500/60 rounded-md p-2.5 flex flex-col justify-between backdrop-blur-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-purple-300 uppercase">Administración</span>
                  <span className="text-[10px] font-mono bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800">
                    {adminM2} m²
                  </span>
                </div>
                <span className="text-[10px] text-purple-200/70">Oficinas y climatización</span>
              </div>

              {/* Free Zone */}
              <div className="flex-1 bg-slate-800/60 border-2 border-slate-600/60 rounded-md p-2.5 flex flex-col justify-between backdrop-blur-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-300 uppercase">Zona Diáfana / Libre</span>
                  <span className="text-[10px] font-mono bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                    {freeM2} m²
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">Paso y carga/descarga</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rules and Surface Allocators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Machinery Allocator */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-blue-300 flex items-center gap-1.5">
              <Box className="w-4 h-4 text-blue-400" />
              <span>Maquinaria</span>
            </label>
            <span className="text-xs text-slate-400 font-mono">Mín: {requiredMachineryM2} m²</span>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="number"
              min={requiredMachineryM2}
              max={naveSurface}
              value={machineryM2}
              onChange={e => setMachineryM2(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-slate-400">m²</span>
          </div>

          <div className="text-xs text-slate-400 space-y-1">
            <p className="text-slate-300">Normativa de Maquinaria:</p>
            <p>• Línea Metal/Hierro: 240 m² / máquina ({metalMachinesCount} compradas)</p>
            <p>• Línea Plástico/Ensamblaje: 180 m² / máquina ({plasticMachinesCount} compradas)</p>
          </div>

          {isMachineryValid ? (
            <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Superficie suficiente para la maquinaria</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-xs text-rose-400 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Faltan {requiredMachineryM2 - machineryM2} m² según normativa</span>
            </div>
          )}
        </div>

        {/* Warehouses Allocator */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Almacenes</span>
            </label>
            <span className="text-xs text-slate-400 font-mono">Mín: {requiredStorageM2} m² ({requiredWarehouseCount} alm.)</span>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="number"
              min={requiredStorageM2}
              max={naveSurface}
              value={storageM2}
              onChange={e => setStorageM2(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-slate-400">m² totales</span>
          </div>

          <div className="text-xs text-slate-400 space-y-1">
            <p className="text-slate-300 font-medium">Distribución requerida ({requiredWarehouseCount} almacenes):</p>
            {warehouseDescriptions.map((desc, i) => (
              <p key={i} className="text-[11px] text-slate-400">{desc}</p>
            ))}
          </div>

          {isStorageValid ? (
            <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Almacenes cumplen superficie mínima</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-xs text-rose-400 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Superficie inferior al mínimo ({requiredStorageM2} m²)</span>
            </div>
          )}
        </div>

        {/* Admin & Total Summary */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-purple-300">Administración / Oficinas</label>
            <span className="text-xs text-slate-400 font-mono">m²</span>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="number"
              min={20}
              max={naveSurface}
              value={adminM2}
              onChange={e => setAdminM2(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-purple-500"
            />
            <span className="text-xs text-slate-400">m²</span>
          </div>

          <div className="border-t border-slate-800 pt-3 space-y-1 text-xs">
            <div className="flex justify-between text-slate-300">
              <span>Superficie asignada total:</span>
              <span className={`font-mono font-bold ${usedM2 > naveSurface ? 'text-rose-400' : 'text-slate-100'}`}>
                {usedM2} / {naveSurface} m²
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Espacio libre restante:</span>
              <span className="font-mono text-emerald-400">{freeM2} m²</span>
            </div>
          </div>

          {!isTotalValid && (
            <div className="flex items-center space-x-1.5 text-xs text-rose-400 font-medium pt-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Superas la superficie total de la nave en {usedM2 - naveSurface} m²</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
