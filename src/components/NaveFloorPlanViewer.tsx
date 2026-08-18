import React, { useState, useEffect } from 'react';
import { PropertyAcquisition, MachineryAcquisition, NaveFloorPlan } from '../types';
import { Layers, CheckCircle2, AlertTriangle, Save, LayoutGrid, Box } from 'lucide-react';

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

  const pType = (acquisition.propertyType || acquisition.type || '').toLowerCase();
  const pTitle = (acquisition.propertyTitle || acquisition.title || '').toLowerCase();
  const isLogisticsWarehouse = pType === 'almacen' || pType === 'almacen_logistico' || pType === 'warehouse' || pTitle.includes('almacén') || pTitle.includes('almacen') || pTitle.includes('logístico') || pTitle.includes('logistico');

  // Calculate Machinery Surface requirement for Naves Industriales
  // 240 m2 per metal machine, 180 m2 per plastic machine
  const metalMachinesCount = studentMachinery.filter(m => 
    m.category === 'metal_hierro' || m.title?.toLowerCase().includes('metal') || m.lineTitle?.toLowerCase().includes('metal')
  ).length;

  const plasticMachinesCount = studentMachinery.filter(m => 
    m.category === 'plastico_montaje' || m.category === 'plastico_ensamblaje' || m.title?.toLowerCase().includes('plástic') || m.lineTitle?.toLowerCase().includes('plástic')
  ).length;

  const requiredMachineryM2 = isLogisticsWarehouse ? 0 : ((metalMachinesCount * 240) + (plasticMachinesCount * 180));
  const requiredStorageM2 = 30; // Minimum 30 m2 for general storage

  const [machineryM2, setMachineryM2] = useState<number>(
    isLogisticsWarehouse ? 0 : (existingFloorPlan?.machineryZoneM2 ?? (requiredMachineryM2 > 0 ? requiredMachineryM2 : 0))
  );

  const [storageM2, setStorageM2] = useState<number>(
    existingFloorPlan?.storageZoneM2 ?? existingFloorPlan?.rawMaterialsStorageM2 ?? Math.max(30, naveSurface - (isLogisticsWarehouse ? 0 : (requiredMachineryM2 > 0 ? requiredMachineryM2 : 0)) - (existingFloorPlan?.adminZoneM2 || 0))
  );

  const [adminM2, setAdminM2] = useState<number>(
    existingFloorPlan?.adminZoneM2 ?? 0
  );

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Sync state when existingFloorPlan or requirements change
  useEffect(() => {
    if (isLogisticsWarehouse) {
      setMachineryM2(0);
      if (existingFloorPlan) {
        const storedM2 = existingFloorPlan.storageZoneM2 ?? existingFloorPlan.rawMaterialsStorageM2 ?? Math.max(30, naveSurface - (existingFloorPlan.adminZoneM2 || 0));
        setStorageM2(storedM2);
        setAdminM2(existingFloorPlan.adminZoneM2 ?? 0);
      } else {
        setStorageM2(naveSurface);
        setAdminM2(0);
      }
    } else {
      if (existingFloorPlan) {
        setMachineryM2(existingFloorPlan.machineryZoneM2 ?? (requiredMachineryM2 > 0 ? requiredMachineryM2 : 0));
        const storedM2 = existingFloorPlan.storageZoneM2 ?? existingFloorPlan.rawMaterialsStorageM2 ?? Math.max(30, naveSurface - (requiredMachineryM2 > 0 ? requiredMachineryM2 : 0) - (existingFloorPlan.adminZoneM2 || 0));
        setStorageM2(storedM2);
        setAdminM2(existingFloorPlan.adminZoneM2 ?? 0);
      } else {
        const reqMach = requiredMachineryM2 > 0 ? requiredMachineryM2 : 0;
        setMachineryM2(reqMach);
        setStorageM2(Math.max(30, naveSurface - reqMach));
        setAdminM2(0);
      }
    }
  }, [existingFloorPlan?.id, existingFloorPlan?.updatedAt, requiredMachineryM2, acquisition.id, naveSurface, isLogisticsWarehouse]);

  // Keep within total surface
  const usedM2 = (isLogisticsWarehouse ? 0 : machineryM2) + storageM2 + adminM2;
  const freeM2 = Math.max(0, naveSurface - usedM2);

  // Validation checks
  const isMachineryValid = isLogisticsWarehouse || machineryM2 >= requiredMachineryM2;
  const isStorageValid = storageM2 >= requiredStorageM2;
  const isTotalValid = usedM2 <= naveSurface;

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg('');
    try {
      await onSave({
        propertyId: acquisition.propertyId || acquisition.id,
        acquisitionId: acquisition.id,
        propertyTitle: acquisition.propertyTitle,
        machineryZoneM2: isLogisticsWarehouse ? 0 : machineryM2,
        storageZoneM2: storageM2,
        rawMaterialsStorageM2: storageM2,
        semiFinishedStorageM2: 0,
        finishedGoodsStorageM2: 0,
        adminZoneM2: adminM2,
        freeZoneM2: freeM2,
        warehousesCount: 1
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
              <span>Plano de Distribución: {isLogisticsWarehouse ? 'Almacén Logístico' : 'Nave Industrial'} - {acquisition.propertyTitle}</span>
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
            disabled={saving || !isTotalValid || !isStorageValid || !isMachineryValid}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm rounded-lg transition shadow-md cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Plano'}</span>
          </button>
        </div>
      </div>

      {/* Blueprint Visual Diagram */}
      <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-4 overflow-hidden">
        <div className="absolute top-2 right-3 text-[10px] uppercase tracking-wider text-slate-500 font-mono">
          Esquema Arquitectónico - {isLogisticsWarehouse ? 'Almacén Logístico' : 'Nave Industrial'} ({naveSurface} m²)
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
          <div className="flex gap-2 h-full w-full">
            {/* Machinery Zone (Only for Naves Industriales) */}
            {!isLogisticsWarehouse && (
              <div 
                style={{ flex: machineryM2 || 1 }}
                className="bg-blue-900/40 border-2 border-blue-500/60 rounded-md p-3 flex flex-col justify-between backdrop-blur-sm relative group hover:border-blue-400 transition min-w-[120px]"
              >
                <div className="flex justify-between items-start gap-1">
                  <span className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1">
                    <Box className="w-3.5 h-3.5 text-blue-400 shrink-0" /> <span className="truncate">Maquinaria</span>
                  </span>
                  <span className="text-xs font-mono bg-blue-950/80 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800 shrink-0">
                    {machineryM2} m²
                  </span>
                </div>
                <div className="space-y-1 my-auto text-[11px] text-blue-200/80">
                  <p>• Metal: {metalMachinesCount} ({metalMachinesCount * 240} m² min)</p>
                  <p>• Plástico: {plasticMachinesCount} ({plasticMachinesCount * 180} m² min)</p>
                </div>
                <div className="text-[10px] text-blue-400 font-mono truncate">
                  Mín: {requiredMachineryM2} m² {isMachineryValid ? '✓' : '⚠️ Insuficiente'}
                </div>
              </div>
            )}

            {/* General Warehouse Storage Zone */}
            <div 
              style={{ flex: storageM2 || 1 }}
              className="bg-emerald-900/40 border-2 border-emerald-500/60 rounded-md p-3 flex flex-col justify-between backdrop-blur-sm relative group hover:border-emerald-400 transition min-w-[140px]"
            >
              <div className="flex justify-between items-start gap-1">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> <span className="truncate">Almacén General</span>
                </span>
                <span className="text-xs font-mono bg-emerald-950/80 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800 shrink-0">
                  {storageM2} m²
                </span>
              </div>
              <div className="space-y-1 my-auto text-[11px] text-emerald-200/90">
                <p>• Almacenaje unificado de materias primas, productos semiterminados y terminados</p>
                <p>• Paletización, gestión de stock y expedición de mercancías</p>
              </div>
              <div className="text-[10px] text-emerald-400 font-mono truncate">
                Mín: 30 m² {isStorageValid ? '✓' : '⚠️ Insuficiente'}
              </div>
            </div>

            {/* Admin & Free Zone */}
            <div 
              style={{ flex: (adminM2 + freeM2) || 1 }}
              className="flex flex-col gap-2 h-full min-w-[100px]"
            >
              {/* Admin Zone */}
              <div 
                style={{ flex: adminM2 || 1 }}
                className="bg-purple-900/40 border-2 border-purple-500/60 rounded-md p-2 flex flex-col justify-between backdrop-blur-sm"
              >
                <div className="flex justify-between items-center gap-1">
                  <span className="text-[10px] font-bold text-purple-300 uppercase truncate">Administración</span>
                  <span className="text-[10px] font-mono bg-purple-950 text-purple-300 px-1 py-0.5 rounded border border-purple-800 shrink-0">
                    {adminM2} m²
                  </span>
                </div>
                <span className="text-[9px] text-purple-200/70 truncate">Oficinas y gestión administrativa</span>
              </div>

              {/* Free Zone */}
              <div 
                style={{ flex: freeM2 || 1 }}
                className="bg-slate-800/60 border-2 border-slate-600/60 rounded-md p-2 flex flex-col justify-between backdrop-blur-sm"
              >
                <div className="flex justify-between items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-300 uppercase truncate">Diáfana / Libre</span>
                  <span className="text-[10px] font-mono bg-slate-900 text-slate-300 px-1 py-0.5 rounded border border-slate-700 shrink-0">
                    {freeM2} m²
                  </span>
                </div>
                <span className="text-[9px] text-slate-400 truncate">Paso y maniobra</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Surface Allocators */}
      {isLogisticsWarehouse ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Logistics Warehouse Allocator */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <label className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Superficie de Almacén</span>
              </label>
              <span className="text-xs text-slate-400 font-mono">Mín: 30 m²</span>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="number"
                min={30}
                max={naveSurface}
                value={storageM2}
                onChange={e => setStorageM2(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-32 bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400">m²</span>
            </div>

            <div className="text-xs text-slate-400 space-y-1">
              <p className="text-slate-300 font-medium">• Almacén Logístico:</p>
              <p>Espacio único de almacenaje general de stock. Sin divisiones por tipo de producto ni zona de maquinaria industrial.</p>
            </div>

            {isStorageValid ? (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium pt-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Superficie suficiente para la operativa de almacenaje</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-rose-400 font-medium pt-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>El almacén debe disponer de al menos 30 m²</span>
              </div>
            )}
          </div>

          {/* Admin & Total Summary */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <label className="text-sm font-semibold text-purple-300">Administración / Oficinas</label>
              <span className="text-xs text-slate-400 font-mono">m²</span>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="number"
                min={0}
                max={naveSurface}
                value={adminM2}
                onChange={e => setAdminM2(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-32 bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-purple-500"
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
                <span>Superas la superficie total del almacén en {usedM2 - naveSurface} m²</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Machinery Allocator */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <label className="text-sm font-semibold text-blue-300 flex items-center gap-1.5">
                <Box className="w-4 h-4 text-blue-400" />
                <span>Zona de Maquinaria</span>
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
              <p className="text-slate-300 font-medium">• Requisitos por maquinaria:</p>
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

          {/* Unified Storage Allocator */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <label className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Almacén General</span>
              </label>
              <span className="text-xs text-slate-400 font-mono">Mín: 30 m²</span>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="number"
                min={30}
                max={naveSurface}
                value={storageM2}
                onChange={e => setStorageM2(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-28 bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400">m²</span>
            </div>

            <div className="text-xs text-slate-400 space-y-1">
              <p className="text-slate-300 font-medium">• Almacenamiento unificado:</p>
              <p>Espacio único para todo el stock (materias primas, productos semiterminados y productos terminados).</p>
            </div>

            {isStorageValid ? (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-medium pt-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Superficie de almacén válida</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-rose-400 font-medium pt-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>El almacén general debe tener al menos 30 m²</span>
              </div>
            )}
          </div>

          {/* Admin & Total Summary */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <label className="text-sm font-semibold text-purple-300">Administración / Oficinas</label>
              <span className="text-xs text-slate-400 font-mono">m²</span>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="number"
                min={0}
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
      )}
    </div>
  );
};
