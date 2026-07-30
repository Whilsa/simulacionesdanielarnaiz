/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, RawMaterialAnnouncement, RawMaterialOrder, PurchasedVehicle, HiredEmployee } from '../types.js';
import { formatNumber } from '../lib/formatters.js';
import {
  Package,
  Layers,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  Info,
  Building,
  Scale,
  RefreshCw,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  ChevronRight
} from 'lucide-react';

interface RawMaterialsPortalProps {
  currentUser: User;
  onRefreshUser?: () => void;
}

export default function RawMaterialsPortal({ currentUser, onRefreshUser }: RawMaterialsPortalProps) {
  const [announcements, setAnnouncements] = useState<RawMaterialAnnouncement[]>([]);
  const [orders, setOrders] = useState<RawMaterialOrder[]>([]);
  const [vehicles, setVehicles] = useState<PurchasedVehicle[]>([]);
  const [employees, setEmployees] = useState<HiredEmployee[]>([]);
  const [warehouseM2, setWarehouseM2] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected announcement for order modal
  const [selectedAnn, setSelectedAnn] = useState<RawMaterialAnnouncement | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [needsTransport, setNeedsTransport] = useState<boolean>(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, [currentUser.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [annRes, ordRes, compRes] = await Promise.all([
        fetch('/api/raw-materials/announcements'),
        fetch(`/api/raw-materials/orders?studentId=${currentUser.id}`),
        fetch(`/api/company/${currentUser.id}`)
      ]);

      const annData = await annRes.json();
      const ordData = await ordRes.json();
      const compData = await compRes.json();

      if (annData.announcements) setAnnouncements(annData.announcements);
      if (ordData.orders) setOrders(ordData.orders);

      if (compData) {
        if (compData.purchasedVehicles) setVehicles(compData.purchasedVehicles);
        if (compData.hiredEmployees) setEmployees(compData.hiredEmployees);

        // Calculate warehouse storage space
        const floorPlans = compData.naveFloorPlans || [];
        let totalStorageM2 = floorPlans.reduce((sum: number, f: any) => sum + (f.storageZoneM2 || 0), 0);
        if (totalStorageM2 === 0) {
          const acq = compData.acquisitions || [];
          totalStorageM2 = acq.reduce((sum: number, a: any) => sum + Math.round((a.surfaceM2 || 0) * 0.25), 0) || 30;
        }
        setWarehouseM2(totalStorageM2);
      }
    } catch (e) {
      console.error('Error cargando datos de materias primas:', e);
    } finally {
      setLoading(false);
    }
  };

  const studentLevel = currentUser.level || 1;
  const isLevel1 = studentLevel === 1;

  // Capacity calculation
  const maxPalletsAllowed = Math.floor((warehouseM2 / 30) * 25);
  const currentPalletsStored = orders
    .filter(o => ['pendiente', 'aprobado', 'entregado'].includes(o.status))
    .reduce((sum, o) => {
      const ann = announcements.find(a => a.id === o.announcementId);
      return sum + (ann?.isPallet ? o.quantity : 0);
    }, 0);

  const ownedTruck = vehicles.find(v => v.vehicleType === 'camion_trailer');
  const hiredDriver = employees.find(e => e.role === 'camionero');
  const canPickupWithoutTransport = Boolean(ownedTruck && hiredDriver);

  const handleOpenOrderModal = (ann: RawMaterialAnnouncement) => {
    setSelectedAnn(ann);
    setQuantity(1);
    setNeedsTransport(true);
    if (ownedTruck) setSelectedVehicleId(ownedTruck.id);
  };

  const handleCreateOrder = async () => {
    if (!selectedAnn) return;
    setIsSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch('/api/raw-materials/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          announcementId: selectedAnn.id,
          quantity,
          needsTransport,
          pickupVehicleId: !needsTransport ? selectedVehicleId : undefined
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message });
        setSelectedAnn(null);
        fetchData();
        if (onRefreshUser) onRefreshUser();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al procesar la solicitud' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión al enviar la solicitud.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelivery = async (orderId: string) => {
    try {
      const res = await fetch(`/api/raw-materials/orders/${orderId}/deliver`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al confirmar la recepción' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión.' });
    }
  };

  // Order modal calculations
  const totalKg = selectedAnn ? selectedAnn.unitWeightKg * quantity : 0;
  const basePrice = selectedAnn ? Math.round((selectedAnn.pricePerUnit * quantity) * 100) / 100 : 0;
  const ivaAmount = Math.round((basePrice * 0.21) * 100) / 100;
  const transportCost = needsTransport ? Math.round((60 + totalKg * 0.08) * 100) / 100 : 0;
  const totalAmount = Math.round((basePrice + ivaAmount + transportCost) * 100) / 100;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-amber-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold uppercase tracking-wider border border-amber-500/30">
              <ShoppingBag className="w-3.5 h-3.5" />
              Suministros Industriales San Fernando S.A.
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Mercado de Materias Primas</h1>
            <p className="text-slate-300 text-sm max-w-2xl">
              Portal exclusivo para la adquisición de fragmentos metálicos, pellets de plástico y pegamento epoxi para las líneas de fabricación.
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-xl p-4 flex items-center gap-4 min-w-[240px]">
            <div className="p-3 bg-amber-500/20 text-amber-400 rounded-lg">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Sede del Vendedor</div>
              <div className="text-sm font-semibold text-white">San Fernando de Henares</div>
              <div className="text-xs text-amber-400 font-mono mt-0.5">Av. de la Industria 14, Madrid</div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      {msg && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          msg.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <div className="flex items-center gap-3">
            {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span className="text-sm font-medium">{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-white text-sm">Dismiss</button>
        </div>
      )}

      {/* Level Restricted Banner if Level > 1 */}
      {!isLevel1 && (
        <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl shrink-0">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Acceso Restringido - Clasificación Nivel {studentLevel}
            </h3>
            <p className="text-sm text-slate-300">
              Aunque puedes visualizar el catálogo de materias primas y las cotizaciones actualizadas, <strong className="text-amber-400">solo las empresas clasificadas en Nivel 1</strong> por el profesor pueden tramitar solicitudes de compra.
            </p>
            <p className="text-xs text-slate-400 italic mt-1">
              Contacta con el profesor desde la cuenta <code className="text-amber-300">pupdaniel</code> para actualizar el nivel de tu empresa.
            </p>
          </div>
        </div>
      )}

      {/* Warehouse Capacity Storage Warning */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Límite de Almacenamiento de Materia Prima</h2>
              <p className="text-xs text-slate-400">Límite legal: Máximo 25 pallets por cada 30 m² de almacén de materia prima.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700/50">
            <div className="text-right">
              <div className="text-xs text-slate-400">Superficie de Almacén</div>
              <div className="text-sm font-bold text-indigo-400">{warehouseM2} m²</div>
            </div>
            <div className="h-8 w-px bg-slate-700" />
            <div>
              <div className="text-xs text-slate-400">Capacidad Máxima</div>
              <div className="text-sm font-bold text-white">{maxPalletsAllowed} pallets</div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-slate-400">Ocupación Actual: <strong className="text-white">{currentPalletsStored} pallets</strong></span>
            <span className={currentPalletsStored >= maxPalletsAllowed ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
              {maxPalletsAllowed > 0 ? Math.round((currentPalletsStored / maxPalletsAllowed) * 100) : 0}% capacidad utilizada
            </span>
          </div>
          <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700/50">
            <div
              className={`h-full transition-all duration-500 ${
                currentPalletsStored >= maxPalletsAllowed
                  ? 'bg-rose-500'
                  : currentPalletsStored > maxPalletsAllowed * 0.8
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, maxPalletsAllowed > 0 ? (currentPalletsStored / maxPalletsAllowed) * 100 : 0)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Catalog Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-400" />
            Catálogo de Materias Primas Anunciadas
          </h2>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar Anuncios
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 transition-all rounded-2xl p-5 flex flex-col justify-between group shadow-lg"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs font-semibold uppercase tracking-wider border border-amber-500/20">
                    <Layers className="w-3 h-3" />
                    {ann.isPallet ? 'Pallet Industrial' : 'Presentación Individual'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">ID: {ann.id}</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                    {ann.title}
                  </h3>
                  <p className="text-xs font-medium text-amber-300/80 mt-0.5">{ann.presentation}</p>
                </div>

                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{ann.description}</p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-400 font-medium">Precio Base</span>
                  <div className="text-right">
                    <span className="text-xl font-bold text-white">{formatNumber(ann.pricePerUnit)} €</span>
                    <span className="text-[10px] text-slate-400 block">+ 21% IVA</span>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenOrderModal(ann)}
                  disabled={!isLevel1}
                  className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                    isLevel1
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  <span>Solicitar Compra</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Orders History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            Mis Solicitudes de Compra y Estado de Envíos
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            Total Solicitudes: {orders.length}
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-12 bg-slate-950/50 rounded-xl border border-slate-800/80">
            <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400">No has realizado ninguna solicitud de materia prima todavía.</p>
            <p className="text-xs text-slate-500 mt-1">Selecciona un producto del catálogo para tramitar tu primer pedido.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Ref / Fecha</th>
                  <th className="py-3 px-4 font-semibold">Materia Prima</th>
                  <th className="py-3 px-4 font-semibold">Cantidad / Peso</th>
                  <th className="py-3 px-4 font-semibold">Transporte</th>
                  <th className="py-3 px-4 font-semibold">Importe Total</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-xs font-semibold text-amber-400">{ord.id}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(ord.requestedAt).toLocaleString('es-ES')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {ord.materialTitle}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200">{ord.quantity} u.</div>
                      <div className="text-[11px] text-slate-400">{formatNumber(ord.totalKg)} kg total</div>
                    </td>
                    <td className="py-3.5 px-4">
                      {ord.needsTransport ? (
                        <span className="inline-flex items-center gap-1 text-xs text-indigo-400 font-medium">
                          <Truck className="w-3.5 h-3.5" />
                          Vendedor ({formatNumber(ord.transportCost)} €)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                          <Building className="w-3.5 h-3.5" />
                          Recogida propia
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">
                      {formatNumber(ord.totalAmount)} €
                    </td>
                    <td className="py-3.5 px-4">
                      {ord.status === 'pendiente' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/30">
                          <Clock className="w-3.5 h-3.5" />
                          Pendiente
                        </span>
                      )}
                      {ord.status === 'aprobado' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold border border-indigo-500/30">
                          <Truck className="w-3.5 h-3.5 animate-pulse" />
                          Aprobado / En camino
                        </span>
                      )}
                      {ord.status === 'entregado' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          En Almacén
                        </span>
                      )}
                      {ord.status === 'rechazado' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-semibold border border-rose-500/30">
                          <XCircle className="w-3.5 h-3.5" />
                          Rechazado
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {ord.status === 'aprobado' && (
                        <button
                          onClick={() => handleConfirmDelivery(ord.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow transition-colors"
                        >
                          Confirmar Recepción
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Modal */}
      {selectedAnn && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Solicitud de Compra</span>
                <h3 className="text-xl font-bold text-white mt-0.5">{selectedAnn.title}</h3>
                <p className="text-xs text-slate-400">{selectedAnn.presentation}</p>
              </div>
              <button
                onClick={() => setSelectedAnn(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* Quantity Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Cantidad ({selectedAnn.isPallet ? 'Pallets' : 'Latas'}):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white font-bold text-lg focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    Total: <strong className="text-amber-400 font-mono">{formatNumber(totalKg)} kg</strong>
                  </span>
                </div>
              </div>

              {/* Transport Option */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Opciones de Entrega y Logística:
                </label>

                <div className="grid grid-cols-1 gap-2">
                  <label
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      needsTransport
                        ? 'bg-amber-500/10 border-amber-500/50 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="transport"
                        checked={needsTransport}
                        onChange={() => setNeedsTransport(true)}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <div>
                        <div className="font-semibold text-xs text-white">Contratar transporte del vendedor</div>
                        <div className="text-[11px] text-slate-400">Envío directo a tu nave en San Fernando / Madrid</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-amber-400 text-xs">+{formatNumber(transportCost)} €</span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      !needsTransport
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="transport"
                        checked={!needsTransport}
                        onChange={() => setNeedsTransport(false)}
                        className="text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <div className="font-semibold text-xs text-white">Recoger con flota propia</div>
                        <div className="text-[11px] text-slate-400">Requiere Camión Tráiler y camionero contratado</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-emerald-400 text-xs">0.00 €</span>
                  </label>
                </div>

                {!needsTransport && !canPickupWithoutTransport && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2 mt-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Para recogida propia debes poseer un <strong>Camión Tráiler</strong> y un <strong>Camionero</strong> contratado.
                    </span>
                  </div>
                )}
              </div>

              {/* Price Summary Breakdown */}
              <div className="bg-slate-950 rounded-xl p-4 space-y-2 border border-slate-800/80 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Precio Base ({quantity} u. x {formatNumber(selectedAnn.pricePerUnit)} €):</span>
                  <span className="text-white">{formatNumber(basePrice)} €</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>IVA (21%):</span>
                  <span className="text-white">{formatNumber(ivaAmount)} €</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Coste de Transporte:</span>
                  <span className="text-amber-400">{formatNumber(transportCost)} €</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline text-sm">
                  <span className="font-bold text-white font-sans">Total a Pagar:</span>
                  <span className="font-bold text-emerald-400 text-lg">{formatNumber(totalAmount)} €</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                onClick={() => setSelectedAnn(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold text-xs hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateOrder}
                disabled={isSubmitting || (!needsTransport && !canPickupWithoutTransport)}
                className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                  isSubmitting || (!needsTransport && !canPickupWithoutTransport)
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar Solicitud al Profesor</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
