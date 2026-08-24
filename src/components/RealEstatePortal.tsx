/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PropertyListing, User, PropertyType, OperationType, LocationScope, DeferredPaymentConfig } from '../types.js';
import { formatNumber } from '../lib/formatters.js';
import { SPANISH_REGIONS } from '../lib/realEstateData.js';
import { 
  Building2, Store, Warehouse, Factory, Search, Filter, Plus, Trash2, 
  CheckCircle2, ArrowLeft, Euro, MapPin, SlidersHorizontal, Sparkles, 
  AlertCircle, ShieldCheck, FileText, ChevronRight, Layers, RefreshCw
} from 'lucide-react';
import Footer from './Footer.js';

interface RealEstatePortalProps {
  currentUser: User;
  onBackToHub: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

export default function RealEstatePortal({ currentUser, onBackToHub, onUserBalanceUpdated }: RealEstatePortalProps) {
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedOperation, setSelectedOperation] = useState<string>('all');
  const [selectedCommunity, setSelectedCommunity] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [selectedPropertyForModal, setSelectedPropertyForModal] = useState<PropertyListing | null>(null);
  const [useDeferredPayment, setUseDeferredPayment] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Teacher Publication Drawer/Modal
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [publishMode, setPublishMode] = useState<'single' | 'batch'>('single');

  // Single Publication Form
  const [singleForm, setSingleForm] = useState({
    title: '',
    type: 'oficina' as PropertyType,
    operation: 'compra' as OperationType,
    surfaceM2: 150,
    price: 200000,
    landPercentage: 65,
    locationScope: 'municipio' as LocationScope,
    community: 'Comunidad de Madrid',
    municipality: 'Getafe',
    address: 'Calle Comercio, Nº 10',
    allowDeferred: true,
    minDownPaymentPercent: 20,
    installmentsCount: 12,
    instrument: 'pagare' as 'pagare' | 'letra_cambio'
  });

  // Batch Publication Form
  const [batchForm, setBatchForm] = useState({
    count: 3,
    type: 'oficina' as PropertyType,
    operation: 'compra' as OperationType,
    surfaceMin: 100,
    surfaceMax: 300,
    locationScope: 'espana' as LocationScope,
    community: 'Comunidad de Madrid',
    municipality: 'Madrid',
    priceMode: 'random' as 'random' | 'manual',
    manualPrice: 180000,
    landPercentageMode: 'random' as 'random' | 'manual',
    manualLandPercentage: 65,
    allowDeferred: true,
    minDownPaymentPercent: 20,
    installmentsCount: 12,
    instrument: 'pagare' as 'pagare' | 'letra_cambio'
  });

  const isTeacher = currentUser.role === 'teacher' || currentUser.username === 'profesor' || currentUser.username === 'pupdaniel' || currentUser.id === 'profesor-1';

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/properties');
      if (!res.ok) throw new Error('Error al obtener inmuebles');
      const data = await res.json();
      setProperties(data.properties || []);
    } catch (err: any) {
      setError(err.message || 'Error de red');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  // Filter properties
  const filteredProperties = properties.filter(p => {
    if (selectedType !== 'all' && p.type !== selectedType) return false;
    if (selectedOperation !== 'all' && p.operation !== selectedOperation) return false;
    if (selectedCommunity !== 'all' && p.community !== selectedCommunity) return false;
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(term);
      const matchLoc = (p.address + ' ' + p.municipality + ' ' + p.community).toLowerCase().includes(term);
      if (!matchTitle && !matchLoc) return false;
    }
    return true;
  });

  // Handle Acquire / Rent property
  const handleConfirmAcquisition = async () => {
    if (!selectedPropertyForModal) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/properties/buy-rent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyForModal.id,
          studentId: currentUser.id,
          useDeferredPayment
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar la operación');

      setSuccessMsg(data.message);
      if (data.updatedBalance !== undefined && onUserBalanceUpdated) {
        onUserBalanceUpdated(data.updatedBalance);
      }

      setSelectedPropertyForModal(null);
      fetchProperties();
    } catch (err: any) {
      setError(err.message || 'Error de servidor');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Teacher Create Single Property
  const handleCreateSingleProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    const payload = {
      mode: 'single',
      property: {
        title: singleForm.title || `${singleForm.type === 'nave_industrial' ? 'Nave industrial' : singleForm.type === 'almacen' ? 'Almacén' : 'Local comercial'} en ${singleForm.municipality}`,
        type: singleForm.type,
        operation: singleForm.operation,
        surfaceM2: singleForm.surfaceM2,
        price: singleForm.price,
        landPercentage: singleForm.landPercentage,
        locationScope: singleForm.locationScope,
        community: singleForm.community,
        municipality: singleForm.municipality,
        address: singleForm.address,
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        deferredPaymentConfig: singleForm.operation === 'compra' && singleForm.allowDeferred ? {
          allowed: true,
          minDownPaymentPercent: singleForm.minDownPaymentPercent,
          installmentsCount: singleForm.installmentsCount,
          instrument: singleForm.instrument
        } : undefined
      }
    };

    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear la propiedad');

      setSuccessMsg(data.message);
      setShowPublishModal(false);
      fetchProperties();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Teacher Create Batch
  const handleCreateBatchProperties = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    const payload = {
      mode: 'batch',
      batch: {
        count: batchForm.count,
        type: batchForm.type,
        operation: batchForm.operation,
        surfaceMin: batchForm.surfaceMin,
        surfaceMax: batchForm.surfaceMax,
        locationScope: batchForm.locationScope,
        community: batchForm.community,
        municipality: batchForm.municipality,
        priceMode: batchForm.priceMode,
        manualPrice: batchForm.manualPrice,
        landPercentageMode: batchForm.landPercentageMode,
        manualLandPercentage: batchForm.manualLandPercentage,
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        deferredPaymentConfig: batchForm.operation === 'compra' && batchForm.allowDeferred ? {
          allowed: true,
          minDownPaymentPercent: batchForm.minDownPaymentPercent,
          installmentsCount: batchForm.installmentsCount,
          instrument: batchForm.instrument
        } : undefined
      }
    };

    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear los inmuebles');

      setSuccessMsg(data.message);
      setShowPublishModal(false);
      fetchProperties();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Delete Property
  const handleDeleteProperty = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta oferta inmobiliaria?')) return;
    try {
      const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');
      setSuccessMsg(data.message);
      fetchProperties();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle Delete All Properties (Teacher)
  const handleDeleteAllProperties = async () => {
    if (!confirm('¿Seguro que deseas eliminar TODOS los inmuebles del portal inmobiliario?')) return;
    try {
      const res = await fetch('/api/properties', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');
      setSuccessMsg(data.message);
      fetchProperties();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getPropertyTypeLabel = (type: PropertyType) => {
    switch (type) {
      case 'nave_industrial': return 'Nave industrial';
      case 'almacen': return 'Almacén logístico';
      case 'oficina': return 'Oficina';
      case 'local_comercial': return 'Oficina';
      default: return 'Oficina';
    }
  };

  const getPropertyTypeIcon = (type: PropertyType) => {
    switch (type) {
      case 'nave_industrial': return <Factory className="w-4 h-4" />;
      case 'almacen': return <Warehouse className="w-4 h-4" />;
      case 'oficina':
      case 'local_comercial':
      default: return <Building2 className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      {/* Top Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHub}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700"
              title="Volver al menú principal"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Portal inmobiliario</h1>
                <p className="text-[11px] text-slate-400">Oferta de inmuebles industriales y comerciales</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="text-xs text-slate-400">Saldo empresa:</span>
              <span className="text-xs font-bold text-emerald-400">
                {formatNumber(currentUser.balance)} €
              </span>
            </div>

            {isTeacher && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Publicar ofertas</span>
                </button>

                {properties.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeleteAllProperties}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer"
                    title="Eliminar todos los inmuebles del portal"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Eliminar todos</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner Messages */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs underline text-red-600 hover:text-red-900 cursor-pointer">Cerrar</button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-xs underline text-emerald-600 hover:text-emerald-900 cursor-pointer">Cerrar</button>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 mb-6 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar por título, dirección..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
              />
            </div>

            {/* Type Filter */}
            <div>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">Todos los tipos (naves, almacenes, oficinas)</option>
                <option value="nave_industrial">Naves industriales</option>
                <option value="almacen">Almacenes logísticos</option>
                <option value="oficina">Oficinas</option>
              </select>
            </div>

            {/* Operation Filter */}
            <div>
              <select
                value={selectedOperation}
                onChange={(e) => setSelectedOperation(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">Todas las operaciones (compra y alquiler)</option>
                <option value="compra">En venta (compra)</option>
                <option value="alquiler">En alquiler mensual</option>
              </select>
            </div>

            {/* Community Filter */}
            <div>
              <select
                value={selectedCommunity}
                onChange={(e) => setSelectedCommunity(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">Todas las comunidades autónomas</option>
                {SPANISH_REGIONS.map(r => (
                  <option key={r.community} value={r.community}>{r.community}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Cargando catálogo inmobiliario...</p>
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center my-8">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No hay inmuebles disponibles</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {isTeacher
                ? 'No se han publicado inmuebles con estos filtros. Utiliza el botón "Publicar ofertas" para añadir anuncios.'
                : 'Actualmente no existen ofertas que coincidan con los criterios de búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProperties.map(prop => {
              const isRent = prop.operation === 'alquiler';
              const basePrice = prop.price;
              const ivaAmount = basePrice * 0.21;
              const totalPrice = basePrice + ivaAmount;
              const isAvailable = prop.status === 'available';

              return (
                <div
                  key={prop.id}
                  className={`bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
                    !isAvailable ? 'opacity-65 bg-slate-50' : ''
                  }`}
                >
                  <div className="p-5">
                    {/* Top Badges & Controls Header */}
                    <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-full text-white ${
                          isRent ? 'bg-indigo-600' : 'bg-emerald-600'
                        }`}>
                          {isRent ? 'Alquiler mensual' : 'En venta'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                          {getPropertyTypeIcon(prop.type)}
                          <span>{getPropertyTypeLabel(prop.type)}</span>
                        </span>
                      </div>

                      {/* Delete button for teacher */}
                      {isTeacher && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProperty(prop.id);
                          }}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs flex items-center gap-1"
                          title="Eliminar anuncio"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Eliminar</span>
                        </button>
                      )}
                    </div>

                    {/* Content Details */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2" title={prop.title}>
                          {prop.title}
                        </h3>
                        <span className="font-extrabold text-xs text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                          {prop.surfaceM2} m²
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-3 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{prop.address}, {prop.municipality} ({prop.community})</span>
                      </div>

                      {/* Key Indicators */}
                      <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-xl text-xs mb-4 border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-medium">Porcentaje suelo</span>
                          <span className="font-bold text-slate-800">{prop.landPercentage}% (terreno)</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-medium">Precio por m²</span>
                          <span className="font-bold text-slate-800">{formatNumber(prop.pricePerM2)} €/m²</span>
                        </div>
                      </div>

                      {/* Deferred Payment Banner */}
                      {!isRent && prop.deferredPaymentConfig?.allowed && (
                        <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-semibold text-amber-800 flex items-center justify-between">
                          <span>Admite {prop.deferredPaymentConfig.instrument === 'pagare' ? 'pagaré' : 'letra de cambio'}</span>
                          <span className="text-[10px] bg-amber-200/80 px-2 py-0.5 rounded-md">Entrada {prop.deferredPaymentConfig.minDownPaymentPercent}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Price & Action */}
                  <div className="p-5 pt-0 border-t border-slate-100 mt-2 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {isRent ? 'Renta base (IVA 21% no incl.)' : 'Precio base + 21% IVA'}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-slate-900">
                          {formatNumber(basePrice)} €
                        </span>
                        <span className="text-[10px] font-medium text-slate-500">
                          {isRent ? '/mes' : `(+ ${formatNumber(ivaAmount)} € IVA)`}
                        </span>
                      </div>
                    </div>

                    {isTeacher ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProperty(prop.id);
                          }}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                          title="Eliminar este inmueble"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
                        </button>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-xl">
                          {isAvailable ? 'Disponible' : 'Ocupado'}
                        </span>
                      </div>
                    ) : isAvailable ? (
                      <button
                        onClick={() => {
                          setSelectedPropertyForModal(prop);
                          setUseDeferredPayment(false);
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition cursor-pointer flex items-center gap-1 ${
                          isRent ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        <span>{isRent ? 'Alquilar' : 'Comprar'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                        {prop.status === 'sold' ? 'Vendido' : 'Alquilado'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />

      {/* MODAL: ACQUIRE / RENT PROPERTY FOR STUDENT */}
      {selectedPropertyForModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-blue-600">
                  {selectedPropertyForModal.operation === 'alquiler' ? 'Formalizar alquiler' : 'Formalizar compra'}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 line-clamp-1">
                  {selectedPropertyForModal.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPropertyForModal(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Financial Summary Breakdown */}
            <div className="space-y-4 mb-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Precio / renta base:</span>
                  <span className="font-bold text-slate-900">{formatNumber(selectedPropertyForModal.price)} €</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Impuesto IVA (21%):</span>
                  <span className="font-bold text-slate-900">{formatNumber(selectedPropertyForModal.price * 0.21)} €</span>
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-black text-slate-900">
                  <span>Total inmueble con IVA:</span>
                  <span className="text-blue-700">{formatNumber(selectedPropertyForModal.price * 1.21)} €</span>
                </div>
              </div>

              {/* Accounting Breakdown (% Suelo vs % Edificación) */}
              <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-2 text-xs">
                <h4 className="font-bold text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Desglose patrimonial contable</span>
                </h4>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-white p-2.5 rounded-xl border border-blue-100">
                    <span className="text-[10px] text-slate-400 font-medium block">Terreno / suelo ({selectedPropertyForModal.landPercentage}%)</span>
                    <span className="font-extrabold text-slate-900">
                      {formatNumber((selectedPropertyForModal.price * selectedPropertyForModal.landPercentage) / 100)} €
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">No amortizable</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-blue-100">
                    <span className="text-[10px] text-slate-400 font-medium block">Edificación / construcción ({100 - selectedPropertyForModal.landPercentage}%)</span>
                    <span className="font-extrabold text-slate-900">
                      {formatNumber((selectedPropertyForModal.price * (100 - selectedPropertyForModal.landPercentage)) / 100)} €
                    </span>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Amortizable al 2%/año</span>
                  </div>
                </div>
              </div>

              {/* Payment Mode Choice for Purchase */}
              {selectedPropertyForModal.operation === 'compra' && selectedPropertyForModal.deferredPaymentConfig?.allowed && (
                <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-3">
                  <span className="text-xs font-bold text-amber-900 block">Selecciona la modalidad de pago:</span>
                  
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-amber-200 cursor-pointer hover:border-amber-400 transition">
                      <input
                        type="radio"
                        name="paymentChoice"
                        checked={!useDeferredPayment}
                        onChange={() => setUseDeferredPayment(false)}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">Pago al contado (100%)</span>
                        <span className="text-[11px] text-slate-500">
                          Se deducirá el total de {formatNumber(selectedPropertyForModal.price * 1.21)} € en este momento.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-amber-200 cursor-pointer hover:border-amber-400 transition">
                      <input
                        type="radio"
                        name="paymentChoice"
                        checked={useDeferredPayment}
                        onChange={() => setUseDeferredPayment(true)}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Pago aplazado con {selectedPropertyForModal.deferredPaymentConfig.instrument === 'pagare' ? 'pagaré' : 'letra de cambio'}
                        </span>
                        <span className="text-[11px] text-slate-600 block mt-0.5">
                          • Entrada inicial ({selectedPropertyForModal.deferredPaymentConfig.minDownPaymentPercent}%) + Total IVA: {' '}
                          <strong className="text-amber-900">
                            {formatNumber(
                              (selectedPropertyForModal.price * (selectedPropertyForModal.deferredPaymentConfig.minDownPaymentPercent || 20) / 100) +
                              (selectedPropertyForModal.price * 0.21)
                            )} €
                          </strong>
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          • Restante en {selectedPropertyForModal.deferredPaymentConfig.installmentsCount || 12} vencimientos mensuales de {' '}
                          <strong>
                            {formatNumber(
                              (selectedPropertyForModal.price * (100 - (selectedPropertyForModal.deferredPaymentConfig.minDownPaymentPercent || 20)) / 100) /
                              (selectedPropertyForModal.deferredPaymentConfig.installmentsCount || 12)
                            )} €/mes
                          </strong>
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Rental Conditions Note */}
              {selectedPropertyForModal.operation === 'alquiler' && (
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-xs text-indigo-900 space-y-1">
                  <span className="font-bold block">Condiciones del contrato de arrendamiento:</span>
                  <p>
                    • Se abonará una fianza equivalente a 2 mensualidades ({ formatNumber(selectedPropertyForModal.price * 2) } €) + 1er mes con IVA ({ formatNumber(selectedPropertyForModal.price * 1.21) } €).
                  </p>
                  <p className="font-semibold text-indigo-950">
                    • Total a desembolsar hoy: { formatNumber((selectedPropertyForModal.price * 2) + (selectedPropertyForModal.price * 1.21)) } €
                  </p>
                  <p className="text-[11px] text-indigo-800 font-bold mt-1 bg-indigo-100/80 p-2 rounded-xl border border-indigo-200">
                    🔔 Aviso de pagos automáticos: Los 11 meses restantes ({ formatNumber(selectedPropertyForModal.price * 1.21) } €/mes) se programarán automáticamente como cargos domiciliados en tu cuenta bancaria a 30 días vista.
                  </p>
                </div>
              )}

              {/* Deferred Payment Warning */}
              {selectedPropertyForModal.operation === 'compra' && useDeferredPayment && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium">
                  🔔 <strong>Aviso de pagos automáticos programados:</strong> Al aplazar el pago, los vencimientos mensuales ({ formatNumber(((selectedPropertyForModal.price * (100 - (selectedPropertyForModal.deferredPaymentConfig?.minDownPaymentPercent || 20)) / 100) / (selectedPropertyForModal.deferredPaymentConfig?.installmentsCount || 12))) } €/mes) se domiciliarán automáticamente en tu cuenta. Recibirás avisos en tu panel para mantener fondos suficientes antes del vencimiento.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-3 justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedPropertyForModal(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmAcquisition}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirmar operación</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TEACHER PUBLISH LISTINGS (INDIVIDUAL / GROUP BATCH) */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Publicar anuncio inmobiliario</h3>
                  <p className="text-xs text-slate-500">Genera oferta individual o en grupo para los estudiantes</p>
                </div>
              </div>
              <button
                onClick={() => setShowPublishModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => setPublishMode('single')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                  publishMode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Anuncio individual
              </button>
              <button
                type="button"
                onClick={() => setPublishMode('batch')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                  publishMode === 'batch' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Publicación en grupo (batch)
              </button>
            </div>

            {/* FORM SINGLE */}
            {publishMode === 'single' && (
              <form onSubmit={handleCreateSingleProperty} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Título del anuncio</label>
                  <input
                    type="text"
                    placeholder="Ej. Nave industrial con puente grúa en polígono"
                    value={singleForm.title}
                    onChange={(e) => setSingleForm({ ...singleForm, title: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tipo de inmueble</label>
                    <select
                      value={singleForm.type}
                      onChange={(e) => setSingleForm({ ...singleForm, type: e.target.value as PropertyType })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="oficina">Oficina</option>
                      <option value="nave_industrial">Nave industrial</option>
                      <option value="almacen">Almacén logístico</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tipo de operación</label>
                    <select
                      value={singleForm.operation}
                      onChange={(e) => setSingleForm({ ...singleForm, operation: e.target.value as OperationType })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="compra">En venta (compra)</option>
                      <option value="alquiler">En alquiler mensual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Superficie (m²)</label>
                    <input
                      type="number"
                      min="20"
                      value={singleForm.surfaceM2}
                      onChange={(e) => setSingleForm({ ...singleForm, surfaceM2: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Precio base (€)</label>
                    <input
                      type="number"
                      min="100"
                      value={singleForm.price}
                      onChange={(e) => setSingleForm({ ...singleForm, price: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">% suelo (55-75%)</label>
                    <input
                      type="number"
                      min="50"
                      max="80"
                      value={singleForm.landPercentage}
                      onChange={(e) => setSingleForm({ ...singleForm, landPercentage: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Location */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Comunidad autónoma</label>
                    <select
                      value={singleForm.community}
                      onChange={(e) => setSingleForm({ ...singleForm, community: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {SPANISH_REGIONS.map(r => (
                        <option key={r.community} value={r.community}>{r.community}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Municipio / ciudad</label>
                    <input
                      type="text"
                      value={singleForm.municipality}
                      onChange={(e) => setSingleForm({ ...singleForm, municipality: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Dirección completa</label>
                  <input
                    type="text"
                    value={singleForm.address}
                    onChange={(e) => setSingleForm({ ...singleForm, address: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Deferred payment option */}
                {singleForm.operation === 'compra' && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-900">
                      <input
                        type="checkbox"
                        checked={singleForm.allowDeferred}
                        onChange={(e) => setSingleForm({ ...singleForm, allowDeferred: e.target.checked })}
                      />
                      <span>Permitir pago aplazado (pagarés / letras de cambio)</span>
                    </label>

                    {singleForm.allowDeferred && (
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <div>
                          <label className="text-[10px] text-amber-800 font-bold block">Entrada mínima (%)</label>
                          <input
                            type="number"
                            value={singleForm.minDownPaymentPercent}
                            onChange={(e) => setSingleForm({ ...singleForm, minDownPaymentPercent: Number(e.target.value) })}
                            className="w-full px-2 py-1 bg-white border border-amber-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-amber-800 font-bold block">Plazo (meses)</label>
                          <input
                            type="number"
                            value={singleForm.installmentsCount}
                            onChange={(e) => setSingleForm({ ...singleForm, installmentsCount: Number(e.target.value) })}
                            className="w-full px-2 py-1 bg-white border border-amber-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-amber-800 font-bold block">Instrumento</label>
                          <select
                            value={singleForm.instrument}
                            onChange={(e) => setSingleForm({ ...singleForm, instrument: e.target.value as any })}
                            className="w-full px-2 py-1 bg-white border border-amber-200 rounded-lg text-xs"
                          >
                            <option value="pagare">Pagaré</option>
                            <option value="letra_cambio">Letra de cambio</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPublishModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-6 py-2 rounded-xl bg-blue-600 text-white font-extrabold hover:bg-blue-500 cursor-pointer shadow-xs"
                  >
                    Publicar anuncio
                  </button>
                </div>
              </form>
            )}

            {/* FORM BATCH */}
            {publishMode === 'batch' && (
              <form onSubmit={handleCreateBatchProperties} className="space-y-4 text-xs">
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-blue-900">
                  <p className="font-semibold">
                    Publicación simultánea de múltiples inmuebles con distribución aleatoria realista de superficies, precios y ubicaciones.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Cantidad de inmuebles</label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={batchForm.count}
                      onChange={(e) => setBatchForm({ ...batchForm, count: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tipo de inmueble</label>
                    <select
                      value={batchForm.type}
                      onChange={(e) => setBatchForm({ ...batchForm, type: e.target.value as PropertyType })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="oficina">Oficina</option>
                      <option value="nave_industrial">Nave industrial</option>
                      <option value="almacen">Almacén logístico</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Operación</label>
                    <select
                      value={batchForm.operation}
                      onChange={(e) => setBatchForm({ ...batchForm, operation: e.target.value as OperationType })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="compra">En venta (compra)</option>
                      <option value="alquiler">En alquiler mensual</option>
                    </select>
                  </div>
                </div>

                {/* Surface Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Superficie mínima (m²)</label>
                    <input
                      type="number"
                      value={batchForm.surfaceMin}
                      onChange={(e) => setBatchForm({ ...batchForm, surfaceMin: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Superficie máxima (m²)</label>
                    <input
                      type="number"
                      value={batchForm.surfaceMax}
                      onChange={(e) => setBatchForm({ ...batchForm, surfaceMax: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Location Scope */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ámbito geográfico de localizaciones</label>
                  <select
                    value={batchForm.locationScope}
                    onChange={(e) => setBatchForm({ ...batchForm, locationScope: e.target.value as LocationScope })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="espana">Aleatorio por toda España</option>
                    <option value="comunidad">En una comunidad autónoma específica</option>
                    <option value="municipio">En un municipio concreto</option>
                  </select>
                </div>

                {batchForm.locationScope !== 'espana' && (
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Comunidad autónoma</label>
                      <select
                        value={batchForm.community}
                        onChange={(e) => setBatchForm({ ...batchForm, community: e.target.value })}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                      >
                        {SPANISH_REGIONS.map(r => (
                          <option key={r.community} value={r.community}>{r.community}</option>
                        ))}
                      </select>
                    </div>

                    {batchForm.locationScope === 'municipio' && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Municipio</label>
                        <input
                          type="text"
                          value={batchForm.municipality}
                          onChange={(e) => setBatchForm({ ...batchForm, municipality: e.target.value })}
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPublishModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-6 py-2 rounded-xl bg-blue-600 text-white font-extrabold hover:bg-blue-500 cursor-pointer shadow-xs flex items-center gap-2"
                  >
                    {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Generar grupo de {batchForm.count} anuncios</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
