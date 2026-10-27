/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Wrench, ShieldCheck, ShieldAlert, ShoppingCart, CheckCircle2, 
  AlertCircle, RefreshCw, Check, X, Package, DollarSign, Store
} from 'lucide-react';
import { User, TeacherScrewdriverListing } from '../types.js';
import { formatNumber } from '../lib/formatters.js';

interface StudentFinishedScrewdriversSectionProps {
  currentUser: User;
  onRefreshUser?: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

export default function StudentFinishedScrewdriversSection({
  currentUser,
  onRefreshUser,
  onUserBalanceUpdated
}: StudentFinishedScrewdriversSectionProps) {
  const [listings, setListings] = useState<TeacherScrewdriverListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Purchase modal state
  const [selectedListing, setSelectedListing] = useState<TeacherScrewdriverListing | null>(null);
  const [buyQuantity, setBuyQuantity] = useState('10');
  const [submitting, setSubmitting] = useState(false);

  const isLevel2 = currentUser.level === 2;

  useEffect(() => {
    if (isLevel2) {
      fetchStudentListings();
    } else {
      setLoading(false);
    }
  }, [currentUser.id, currentUser.level]);

  const fetchStudentListings = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/teacher/screwdriver-listings/student?studentId=${encodeURIComponent(currentUser.id)}`);
      if (res.status === 403) {
        setError('Acceso restringido: Solo las cuentas de nivel 2 pueden consultar estos anuncios.');
        setListings([]);
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setListings(data.listings || []);
      } else {
        setError(data.error || 'Error al cargar los anuncios disponibles.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBuyModal = (listing: TeacherScrewdriverListing) => {
    setSelectedListing(listing);
    setBuyQuantity(String(Math.min(10, listing.remainingQuantity)));
    setError('');
    setSuccess('');
  };

  const handleConfirmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing) return;

    const qty = Number(buyQuantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Debes especificar una cantidad mayor a cero.');
      return;
    }
    if (qty > selectedListing.remainingQuantity) {
      setError(`No hay suficientes existencias. Solo quedan ${selectedListing.remainingQuantity} unidades disponibles.`);
      return;
    }

    const totalCost = Number((qty * selectedListing.unitPrice).toFixed(2));
    if ((currentUser.balance || 0) < totalCost) {
      setError(`Saldo bancario insuficiente. Se requieren ${formatNumber(totalCost)} € y tu saldo actual es de ${formatNumber(currentUser.balance || 0)} €.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/teacher/screwdriver-listings/${selectedListing.id}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          quantity: qty
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo completar la compra.');
      }

      setSuccess(`¡Compra completada con éxito! Se han añadido ${qty} destornilladores terminados a tu inventario y se han cargado ${formatNumber(data.totalPrice || totalCost)} € en tu cuenta.`);
      setSelectedListing(null);

      if (data.newBalance !== undefined && onUserBalanceUpdated) {
        onUserBalanceUpdated(data.newBalance);
      }
      if (onRefreshUser) {
        onRefreshUser();
      }

      await fetchStudentListings();
    } catch (err: any) {
      setError(err.message || 'Error al procesar la compra.');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. If not Level 2, render clear restriction notice
  if (!isLevel2) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/20">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-white font-display">
            Compra de destornilladores terminados — Exclusivo Nivel 2
          </h3>
          <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            Esta sección comercial del portal está restringida exclusivamente a empresas de <strong>Nivel 2</strong>. Tu cuenta actual es de <strong>Nivel {currentUser.level || 1}</strong>.
          </p>
        </div>
        <div className="inline-flex items-center space-x-2 bg-slate-800 text-amber-300 text-xs px-4 py-2 rounded-xl border border-slate-700 font-medium">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>El servidor valida y bloquea cualquier intento de compra no autorizada.</span>
        </div>
      </div>
    );
  }

  // Active listings with remaining stock
  const availableListings = listings.filter(l => l.status === 'activo' && l.remainingQuantity > 0);

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-800/40 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Store className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold text-white font-display">
              Compra de destornilladores terminados
            </h2>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Acceso Nivel 2 Verificado
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Adquiere lotes de destornilladores ya fabricados y listos para la venta ofertados directamente por el docente. Las unidades adquiridas se incorporan de forma inmediata a tu inventario de mercaderías terminadas sin necesidad de fabricarlas.
          </p>
        </div>

        <button
          onClick={fetchStudentListings}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition border border-slate-700 cursor-pointer flex items-center space-x-1.5 text-xs font-semibold"
          title="Actualizar anuncios"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Actualizar</span>
        </button>
      </div>

      {error && (
        <div className="bg-rose-950/80 border-l-4 border-rose-500 p-4 rounded-r-xl text-xs font-semibold text-rose-200 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="p-1 text-rose-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-950/80 border-l-4 border-emerald-500 p-4 rounded-r-xl text-xs font-semibold text-emerald-200 flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="p-1 text-emerald-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content list */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs">
          Comprobando autorización y consultando anuncios disponibles...
        </div>
      ) : availableListings.length === 0 ? (
        /* User Requirement: "Si el profesor no tiene anuncios activos con existencias, la sección debe mostrar que no hay destornilladores terminados disponibles." */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto border border-slate-700">
            <Package className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white font-display">
              No hay destornilladores terminados disponibles actualmente.
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              El profesor no tiene anuncios activos con existencias en este momento. Vuelve a consultar más adelante o avisa al docente si precisas stock de mercaderías.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableListings.map(listing => (
            <div 
              key={listing.id}
              className="bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 flex flex-col justify-between transition shadow-lg relative group"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                    <Wrench className="w-6 h-6" />
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Precio unitario</span>
                    <span className="font-mono text-xl font-bold text-emerald-400">
                      {formatNumber(listing.unitPrice, 2)} €
                    </span>
                    <span className="text-[10px] text-slate-500 block">por destornillador</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white font-display">{listing.title}</h3>
                  {listing.description && (
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {listing.description}
                    </p>
                  )}
                </div>

                {listing.commercialConditions && (
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300">
                    <span className="text-amber-400 font-bold block text-[10px] uppercase mb-0.5">
                      Condiciones comerciales:
                    </span>
                    {listing.commercialConditions}
                  </div>
                )}

                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 font-sans">Existencias disponibles:</span>
                  <span className="font-bold text-emerald-300">
                    {formatNumber(listing.remainingQuantity)} uds
                  </span>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t border-slate-800/80">
                <button
                  onClick={() => handleOpenBuyModal(listing)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-md shadow-emerald-950 cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Comprar destornilladores terminados</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONFIRM PURCHASE MODAL */}
      {selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-white">
            <div className="bg-gradient-to-r from-emerald-900 to-slate-900 p-5 flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base font-display">Confirmar adquisición de terminados</h3>
              </div>
              <button
                onClick={() => setSelectedListing(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPurchase} className="p-6 space-y-4 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Producto</span>
                <p className="font-bold text-sm text-white">{selectedListing.title}</p>
                {selectedListing.commercialConditions && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedListing.commercialConditions}</p>
                )}
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-sans">Precio unitario:</span>
                  <span className="font-bold text-white">{formatNumber(selectedListing.unitPrice, 2)} € / ud</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-sans">Existencias disponibles:</span>
                  <span className="font-bold text-emerald-400">{formatNumber(selectedListing.remainingQuantity)} uds</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-sans">Tu saldo actual:</span>
                  <span className="font-bold text-amber-300">{formatNumber(currentUser.balance || 0)} €</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Cantidad a comprar (uds):
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedListing.remainingQuantity}
                  step="1"
                  value={buyQuantity}
                  onChange={(e) => setBuyQuantity(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white font-mono text-base font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Real-time total calculation */}
              {(() => {
                const qtyNum = Number(buyQuantity) || 0;
                const totalCost = Number((qtyNum * selectedListing.unitPrice).toFixed(2));
                const hasSufficient = (currentUser.balance || 0) >= totalCost;

                return (
                  <div className={`p-4 rounded-xl border ${hasSufficient ? 'bg-emerald-950/40 border-emerald-700/60' : 'bg-rose-950/40 border-rose-700/60'} space-y-1`}>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-300">Importe total a pagar:</span>
                      <span className={`font-mono text-base font-extrabold ${hasSufficient ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatNumber(totalCost)} €
                      </span>
                    </div>
                    {!hasSufficient && (
                      <p className="text-[11px] text-rose-300 pt-1">
                        ⚠️ Saldo bancario insuficiente para completar esta orden.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                ℹ️ <strong>Ejecución atómica:</strong> Al confirmar, el sistema reservará las existencias mediante bloqueo de concurrencia, debitará el importe de tu cuenta bancaria y sumará las unidades directamente a tu inventario de productos terminados.
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedListing(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || ((Number(buyQuantity) || 0) * selectedListing.unitPrice) > (currentUser.balance || 0)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? 'Procesando...' : 'Confirmar compra'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
