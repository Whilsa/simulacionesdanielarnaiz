/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Store, Plus, Edit, Power, Trash2, History, CheckCircle2, 
  XCircle, Clock, AlertCircle, RefreshCw, X, Check, ShieldAlert, PackageCheck
} from 'lucide-react';
import { User, TeacherScrewdriverListing, TeacherScrewdriverHistoryEntry } from '../types.js';
import { formatNumber } from '../lib/formatters.js';

interface TeacherScrewdriverListingsManagementProps {
  currentUser?: User;
}

export default function TeacherScrewdriverListingsManagement({ currentUser }: TeacherScrewdriverListingsManagementProps = {}) {
  const [listings, setListings] = useState<TeacherScrewdriverListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<TeacherScrewdriverListing | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCommercialConditions, setFormCommercialConditions] = useState('');
  const [formQuantity, setFormQuantity] = useState('500');
  const [formUnitPrice, setFormUnitPrice] = useState('4.50');
  const [formUnitTransportCost, setFormUnitTransportCost] = useState('0.00');
  const [submitting, setSubmitting] = useState(false);

  // History modal state
  const [historyListing, setHistoryListing] = useState<TeacherScrewdriverListing | null>(null);

  const getAuthHeaders = (includeJson = true) => {
    const headers: Record<string, string> = {
      'x-user-id': currentUser?.id || 'profesor-1',
      'x-username': currentUser?.username || 'pupdaniel',
      'x-user-role': 'teacher'
    };
    if (includeJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/teacher/screwdriver-listings', {
        headers: getAuthHeaders(false)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.listings) {
          setListings(data.listings);
        }
      } else {
        setError('Error al consultar los anuncios de destornilladores.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingListing(null);
    setFormTitle('Lote de destornilladores punta estrella estándar');
    setFormDescription('Destornilladores terminados y probados en control de calidad, listos para comercialización.');
    setFormCommercialConditions('Pago íntegro al contado con débito inmediato en cuenta. Exclusivo empresas Nivel 2.');
    setFormQuantity('500');
    setFormUnitPrice('4.50');
    setFormUnitTransportCost('0.00');
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (listing: TeacherScrewdriverListing) => {
    setEditingListing(listing);
    setFormTitle(listing.title);
    setFormDescription(listing.description || '');
    setFormCommercialConditions(listing.commercialConditions || '');
    setFormQuantity(String(listing.remainingQuantity));
    setFormUnitPrice(String(listing.unitPrice));
    setFormUnitTransportCost(String(listing.unitTransportCost !== undefined ? listing.unitTransportCost : '0.00'));
    setError('');
    setIsModalOpen(true);
  };

  const handleSaveListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const qty = Number(formQuantity);
    const price = Number(formUnitPrice);
    const transport = Number(formUnitTransportCost);

    if (!formTitle.trim()) {
      setError('El título del anuncio es obligatorio.');
      return;
    }
    if (isNaN(qty) || qty < 0) {
      setError('Introduce una cantidad válida mayor o igual a 0.');
      return;
    }
    if (isNaN(price) || price <= 0) {
      setError('Introduce un precio unitario mayor a cero.');
      return;
    }
    if (isNaN(transport) || transport < 0) {
      setError('Introduce unos gastos de transporte por unidad válidos (mayor o igual a 0).');
      return;
    }

    setSubmitting(true);
    try {
      if (editingListing) {
        const res = await fetch(`/api/teacher/screwdriver-listings/${editingListing.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(true),
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim(),
            commercialConditions: formCommercialConditions.trim(),
            remainingQuantity: qty,
            unitPrice: price,
            unitTransportCost: transport
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al actualizar el anuncio.');
        setSuccess('Anuncio modificado correctamente.');
      } else {
        const res = await fetch('/api/teacher/screwdriver-listings', {
          method: 'POST',
          headers: getAuthHeaders(true),
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim(),
            commercialConditions: formCommercialConditions.trim(),
            initialQuantity: qty,
            unitPrice: price,
            unitTransportCost: transport
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al crear el anuncio.');
        setSuccess('Anuncio de venta publicado con éxito para alumnos de Nivel 2.');
      }

      setIsModalOpen(false);
      await fetchListings();
    } catch (err: any) {
      setError(err.message || 'Error de conexión.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (listing: TeacherScrewdriverListing) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/teacher/screwdriver-listings/${listing.id}/toggle`, {
        method: 'PATCH',
        headers: getAuthHeaders(false)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar estado.');
      setSuccess(`Anuncio ${data.active ? 'activado' : 'desactivado'} correctamente.`);
      await fetchListings();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar estado del anuncio.');
    }
  };

  const handleWithdraw = async (listing: TeacherScrewdriverListing) => {
    if (!window.confirm(`¿Seguro que deseas retirar el anuncio "${listing.title}" del mercado?`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/teacher/screwdriver-listings/${listing.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(false)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al retirar el anuncio.');
      setSuccess('Anuncio retirado del mercado con registro en el historial.');
      await fetchListings();
    } catch (err: any) {
      setError(err.message || 'Error al retirar el anuncio.');
    }
  };

  // Metrics
  const totalStock = listings.reduce((sum, l) => sum + (l.status === 'activo' ? l.remainingQuantity : 0), 0);
  const totalSold = listings.reduce((sum, l) => sum + l.soldQuantity, 0);
  const totalRevenue = listings.reduce((sum, l) => sum + (l.soldQuantity * l.unitPrice), 0);

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Introduction */}
      <div className="bg-gradient-to-r from-amber-900 to-amber-950 text-white rounded-2xl p-6 shadow-sm border border-amber-800/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2.5 mb-1.5">
            <Store className="w-6 h-6 text-amber-300" />
            <h2 className="text-xl font-bold font-display text-white">
              Venta de destornilladores terminados
            </h2>
            <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Exclusivo Nivel 2
            </span>
          </div>
          <p className="text-xs text-amber-200/90 max-w-2xl leading-relaxed">
            Publica anuncios de venta de destornilladores ya fabricados y terminados para que las empresas de Nivel 2 puedan comprarlos directamente y abastecer sus mercaderías sin consumos de materias primas ni tiempos de producción.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-sm flex items-center space-x-2 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Publicar nuevo anuncio</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-sans">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase block">Total de anuncios</span>
          <span className="text-xl font-bold font-mono text-slate-900">{listings.length}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase block">Existencias activas disponibles</span>
          <span className="text-xl font-bold font-mono text-amber-800">{formatNumber(totalStock)} uds</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase block">Unidades vendidas</span>
          <span className="text-xl font-bold font-mono text-emerald-700">{formatNumber(totalSold)} uds</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase block">Importe recaudado</span>
          <span className="text-xl font-bold font-mono text-slate-900">{formatNumber(totalRevenue)} €</span>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg text-xs font-semibold text-emerald-700 flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="p-1 text-emerald-500 hover:text-emerald-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Listings Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <PackageCheck className="w-4 h-4 text-amber-700" />
            <h3 className="font-bold text-slate-800 text-sm">Catálogo de anuncios de destornilladores terminados</h3>
          </div>
          <button
            onClick={fetchListings}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            title="Recargar anuncios"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Cargando anuncios...</div>
        ) : listings.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <Store className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700 text-sm">No hay anuncios de destornilladores creados</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Crea tu primer anuncio con existencias terminadas para que los alumnos de Nivel 2 puedan comprarlos.
            </p>
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center space-x-1.5 bg-amber-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-amber-900 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear anuncio</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider text-[10px] bg-slate-50/80">
                  <th className="py-3 px-4">Anuncio / Condiciones</th>
                  <th className="py-3 px-3 text-right">Precio unitario</th>
                  <th className="py-3 px-3 text-right">Transporte / ud</th>
                  <th className="py-3 px-3 text-right">Cant. inicial</th>
                  <th className="py-3 px-3 text-right">Cant. vendida</th>
                  <th className="py-3 px-3 text-right">Cant. restante</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listings.map(item => {
                  const isRetirado = item.status === 'retirado';
                  const isPausado = item.status === 'pausado';
                  const isActivo = item.status === 'activo';

                  return (
                    <tr 
                      key={item.id}
                      className={`hover:bg-amber-50/30 transition-colors ${isRetirado ? 'bg-slate-50/60 opacity-60' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                        {item.description && (
                          <div className="text-[11px] text-slate-500 mt-0.5">{item.description}</div>
                        )}
                        {item.commercialConditions && (
                          <div className="mt-1 text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md inline-block border border-amber-200/60 font-medium">
                            Condiciones: {item.commercialConditions}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-amber-900">
                        {formatNumber(item.unitPrice, 2)} € / ud
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-700">
                        {Number(item.unitTransportCost || 0) > 0 ? (
                          <span className="text-amber-800 font-bold">+{formatNumber(item.unitTransportCost, 2)} €</span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">0,00 € (Gratis)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {formatNumber(item.initialQuantity)} uds
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                        {formatNumber(item.soldQuantity)} uds
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-900">
                        <span className={item.remainingQuantity === 0 ? 'text-rose-600' : 'text-slate-900'}>
                          {formatNumber(item.remainingQuantity)} uds
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isActivo && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Activo
                          </span>
                        )}
                        {isPausado && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Pausado
                          </span>
                        )}
                        {isRetirado && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                            <XCircle className="w-3 h-3 mr-1" />
                            Retirado
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {!isRetirado && (
                            <button
                              onClick={() => handleToggleActive(item)}
                              title={isActivo ? 'Pausar anuncio' : 'Activar anuncio'}
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                isActivo 
                                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' 
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!isRetirado && (
                            <button
                              onClick={() => handleOpenEdit(item)}
                              title="Editar anuncio"
                              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setHistoryListing(item)}
                            title="Ver historial de operaciones"
                            className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          {!isRetirado && (
                            <button
                              onClick={() => handleWithdraw(item)}
                              title="Retirar anuncio definitivamente"
                              className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-amber-800 to-amber-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Store className="w-5 h-5 text-amber-200" />
                <h3 className="font-bold text-base font-display">
                  {editingListing ? 'Editar anuncio de destornilladores' : 'Publicar nuevo anuncio de destornilladores'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveListing} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Título del anuncio
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ej: Lote de destornilladores terminados punta estrella"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Descripción del lote terminado
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  placeholder="Detalles sobre el acabado, calidad o embalaje..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Condiciones comerciales aplicables
                </label>
                <input
                  type="text"
                  value={formCommercialConditions}
                  onChange={(e) => setFormCommercialConditions(e.target.value)}
                  placeholder="Ej: Pago íntegro al contado con débito en cuenta, entrega inmediata"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    {editingListing ? 'Cantidad restante' : 'Cantidad inicial'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-sm font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Precio unitario (€)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={formUnitPrice}
                    onChange={(e) => setFormUnitPrice(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-sm font-bold text-amber-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Transporte / ud (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formUnitTransportCost}
                    onChange={(e) => setFormUnitTransportCost(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-sm font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
                ℹ️ <strong>Atención:</strong> Las unidades adquiridas por los alumnos se sumarán a su inventario de productos terminados (mercaderías) y se cargarán en su cuenta bancaria de forma atómica.
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? 'Guardando...' : (editingListing ? 'Actualizar anuncio' : 'Publicar anuncio')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HISTORY AUDIT MODAL */}
      {historyListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-indigo-300" />
                <h3 className="font-bold text-base font-display">
                  Historial de operaciones: {historyListing.title}
                </h3>
              </div>
              <button 
                onClick={() => setHistoryListing(null)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {!historyListing.history || historyListing.history.length === 0 ? (
                <p className="text-center py-6 text-slate-400 text-xs">No hay operaciones registradas todavía.</p>
              ) : (
                <div className="relative border-l-2 border-indigo-100 ml-4 space-y-6">
                  {historyListing.history.map((entry: TeacherScrewdriverHistoryEntry, idx: number) => {
                    const dateFormatted = new Date(entry.timestamp).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <div key={idx} className="relative pl-6">
                        {/* Dot indicator */}
                        <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${
                          entry.action === 'venta' 
                            ? 'bg-emerald-600' 
                            : entry.action === 'creacion' 
                            ? 'bg-amber-600' 
                            : entry.action === 'retirada' 
                            ? 'bg-rose-600' 
                            : 'bg-indigo-600'
                        }`} />

                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500">
                              {entry.action === 'creacion' && '🟢 Publicación de anuncio'}
                              {entry.action === 'edicion' && '✏️ Modificación de condiciones'}
                              {entry.action === 'activacion' && '▶️ Activación del anuncio'}
                              {entry.action === 'desactivacion' && '⏸️ Pausa del anuncio'}
                              {entry.action === 'retirada' && '🛑 Retirada del mercado'}
                              {entry.action === 'venta' && '💰 Venta a alumno Nivel 2'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{dateFormatted}</span>
                          </div>

                          <p className="font-semibold text-slate-800">{entry.description || (entry as any).details}</p>

                          {entry.action === 'venta' && entry.buyerName && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                              <span className="text-slate-600">Comprador: <strong>{entry.buyerName}</strong></span>
                              <span className="font-bold text-emerald-700 font-mono">
                                + {formatNumber(entry.totalAmount || (entry as any).totalPrice || 0)} €
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setHistoryListing(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
              >
                Cerrar historial
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
