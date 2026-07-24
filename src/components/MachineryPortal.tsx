/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Wrench, Building2, ShieldAlert, CheckCircle2, AlertCircle, ArrowLeft, 
  Coins, Zap, Users, Maximize2, Package, Clock, Check, Factory, ChevronRight
} from 'lucide-react';
import { User, MachineryItem, MachineryOption, PropertyAcquisition, MachineryAcquisition } from '../types.js';
import Footer from './Footer.js';

interface MachineryPortalProps {
  currentUser: User;
  onBackToHub: () => void;
  onUserBalanceUpdated: (newBalance: number) => void;
}

export default function MachineryPortal({ currentUser, onBackToHub, onUserBalanceUpdated }: MachineryPortalProps) {
  const [catalog, setCatalog] = useState<MachineryItem[]>([]);
  const [studentAcquisitions, setStudentAcquisitions] = useState<PropertyAcquisition[]>([]);
  const [myMachinery, setMyMachinery] = useState<MachineryAcquisition[]>([]);
  const [balance, setBalance] = useState<number>(currentUser.balance);
  const [loading, setLoading] = useState(true);

  // Selected purchase configuration
  const [selectedMachinery, setSelectedMachinery] = useState<MachineryItem | null>(null);
  const [selectedOption, setSelectedOption] = useState<MachineryOption | null>(null);
  const [selectedNaveId, setSelectedNaveId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'contado' | 'aplazado_pagares'>('contado');

  // Purchase Modal & Messages
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Catalog
      const catRes = await fetch('/api/machinery/catalog');
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData.catalog) setCatalog(catData.catalog);
      }

      // 2. Fetch Student Company info (properties + current machinery)
      const compRes = await fetch(`/api/company/${currentUser.id}`);
      if (compRes.ok) {
        const compData = await compRes.json();
        if (compData.company) {
          setBalance(compData.company.balance);
          onUserBalanceUpdated(compData.company.balance);
        }
        if (compData.acquisitions) setStudentAcquisitions(compData.acquisitions);
        if (compData.machineryAcquisitions) setMyMachinery(compData.machineryAcquisitions);
      }
    } catch (err) {
      console.error('Error fetching machinery portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter industrial naves owned or rented by student
  const industrialNaves = studentAcquisitions.filter(a => a.propertyType === 'nave_industrial');

  const handleOpenBuyModal = (machinery: MachineryItem, option: MachineryOption) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSelectedMachinery(machinery);
    setSelectedOption(option);

    // Auto-select first valid nave if available
    const validNave = industrialNaves.find(n => n.surfaceM2 >= machinery.totalRequiredM2);
    if (validNave) {
      setSelectedNaveId(validNave.id);
    } else if (industrialNaves.length > 0) {
      setSelectedNaveId(industrialNaves[0].id);
    } else {
      setSelectedNaveId('');
    }

    setShowConfirmModal(true);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedMachinery || !selectedOption) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedNaveId) {
      setErrorMsg('Debes seleccionar una Nave Industrial para poder realizar la instalación.');
      return;
    }

    const targetNave = studentAcquisitions.find(a => a.id === selectedNaveId);
    if (!targetNave || targetNave.propertyType !== 'nave_industrial') {
      setErrorMsg('El inmueble seleccionado no es una Nave Industrial. La maquinaria solo puede instalarse en Naves Industriales.');
      return;
    }

    if (targetNave.surfaceM2 < selectedMachinery.totalRequiredM2) {
      setErrorMsg(`La nave industrial seleccionada dispone de ${targetNave.surfaceM2} m², pero esta línea requiere al menos ${selectedMachinery.totalRequiredM2} m².`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/machinery/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          machineryId: selectedMachinery.id,
          optionId: selectedOption.id,
          targetNaveId: selectedNaveId,
          paymentMethod
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar la compra de maquinaria');
      }

      setSuccessMsg(data.message);
      if (data.updatedBalance !== undefined) {
        setBalance(data.updatedBalance);
        onUserBalanceUpdated(data.updatedBalance);
      }
      setShowConfirmModal(false);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBackToHub}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition cursor-pointer border border-slate-700"
              title="Volver al Menú Principal"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-black shadow-inner">
                <Wrench className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight">Portal de Maquinaria Industrial</h1>
                <p className="text-xs text-slate-400">Equipamiento técnico para la línea de fabricación de destornilladores</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="bg-slate-800/90 border border-slate-700 px-3.5 py-1.5 rounded-xl flex items-center space-x-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-medium leading-none">Saldo Banco</span>
                <span className="text-sm font-extrabold text-amber-300 font-mono">
                  {balance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Banner Alert for Mandatory Industrial Nave Requirement */}
        <div className="mb-8 bg-gradient-to-r from-amber-900 via-amber-800 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-amber-500/30">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-amber-500/20 rounded-xl text-amber-300 border border-amber-400/30 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-amber-200">
                  REQUISITO IMPRESCINDIBLE DE UBICACIÓN Y ESPACIO
                </h2>
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                  Normativa Técnica
                </span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed max-w-4xl">
                Para poder adquirir y montar cualquier línea de maquinaria es <strong>obligatorio disponer de una NAVE INDUSTRIAL</strong> (en propiedad o en alquiler) con la superficie mínima en m² requerida.
                Los locales comerciales y almacenes estándar <strong>no son válidos</strong> para la instalación de maquinaria de producción. Si no dispones de una nave apta, la orden de compra quedará bloqueada.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="bg-slate-800/80 px-2.5 py-1 rounded-lg text-amber-300 border border-slate-700/60 font-semibold">
                  Naves Industriales en tu empresa: <strong>{industrialNaves.length} disponib.</strong>
                </span>
                {industrialNaves.length === 0 && (
                  <span className="text-rose-300 font-bold bg-rose-900/60 px-2.5 py-1 rounded-lg border border-rose-500/40">
                    ⚠️ No posees naves industriales. Acude primero al Portal Inmobiliario.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Status Feedback Messages */}
        {errorMsg && (
          <div className="mb-6 bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl text-xs font-semibold text-rose-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg('')} className="p-1 text-rose-500 hover:text-rose-700">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-xl text-xs font-semibold text-emerald-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg('')} className="p-1 text-emerald-500 hover:text-emerald-700">✕</button>
          </div>
        )}

        {/* Existing Purchased Machinery List */}
        {myMachinery.length > 0 && (
          <div className="mb-10 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Factory className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">Maquinaria Adquirida por tu Empresa</h3>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                {myMachinery.length} Línea(s) instalada(s)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myMachinery.map(item => {
                const isAssembly = item.status === 'montaje';
                return (
                  <div key={item.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                          <p className="text-xs text-amber-800 font-semibold">{item.optionTitle}</p>
                        </div>
                        <span className={`text-[10px] uppercase font-extrabold px-2.5 py-1 rounded-full ${
                          isAssembly 
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse' 
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          {isAssembly ? 'En Montaje (5 días)' : 'Operativa'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 space-y-1 my-3 bg-white p-2.5 rounded-lg border border-slate-200/80">
                        <p>📍 <strong>Ubicación:</strong> {item.installationNaveTitle} ({item.installationSurfaceM2} m²)</p>
                        <p>⚡ <strong>Capacidad Producción:</strong> {item.productionCapacityUnitsPerHour} unidades / hora</p>
                        <p>💶 <strong>Inversión Total:</strong> {item.totalPrice.toLocaleString('es-ES')} € (Forma de Pago: {item.paymentMethod === 'contado' ? 'Contado' : 'Aplazada en 24 Pagarés'})</p>
                      </div>
                    </div>

                    <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-200 flex justify-between items-center">
                      <span>Adquirido: {new Date(item.purchaseDate).toLocaleDateString('es-ES')}</span>
                      {isAssembly && (
                        <span className="font-semibold text-amber-700">
                          Finaliza montaje: {new Date(item.assemblyFinishDate).toLocaleDateString('es-ES')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Machinery Catalog Cards */}
        <h3 className="font-extrabold text-slate-900 text-xl mb-4 tracking-tight flex items-center gap-2">
          <span>Catálogo de Líneas de Producción</span>
          <span className="text-xs font-normal text-slate-500 bg-slate-200 px-2.5 py-0.5 rounded-full">2 Lotes Oficiales</span>
        </h3>

        {loading ? (
          <div className="py-12 text-center text-slate-400 font-semibold text-sm">Cargando catálogo de maquinaria...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {catalog.map((machinery) => (
              <div 
                key={machinery.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition duration-200 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Image Header */}
                  <div className="relative h-52 bg-slate-900 overflow-hidden">
                    <img 
                      src={machinery.imageUrl} 
                      alt={machinery.title} 
                      className="w-full h-full object-cover opacity-90 hover:scale-105 transition duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                    
                    <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-amber-400 text-xs font-bold px-3 py-1 rounded-full border border-slate-700">
                      Lote de Fabricación
                    </div>

                    <div className="absolute bottom-3 left-4 right-4">
                      <h4 className="text-lg font-bold text-white tracking-tight leading-snug">{machinery.title}</h4>
                      <p className="text-xs text-slate-300 font-medium line-clamp-1">{machinery.description}</p>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 space-y-5">
                    
                    {/* Equipment Included Badges */}
                    <div>
                      <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">
                        Equipamiento Técnico Incluido en el Lote:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {machinery.equipment.map((eq, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200">
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{eq}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Requirements Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Superficie Total</span>
                        <span className="font-extrabold text-slate-900 flex items-center gap-1 mt-0.5">
                          <Maximize2 className="w-3.5 h-3.5 text-amber-600" />
                          {machinery.totalRequiredM2} m²
                        </span>
                        <span className="text-[10px] text-slate-500 block">({machinery.requiredSurfaceM2}m² + 2x30m² almacén)</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Personal Necesario</span>
                        <span className="font-extrabold text-slate-900 flex items-center gap-1 mt-0.5">
                          <Users className="w-3.5 h-3.5 text-blue-600" />
                          {machinery.requiredStaff} operarios
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Potencia Eléctrica</span>
                        <span className="font-extrabold text-slate-900 flex items-center gap-1 mt-0.5">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          {machinery.powerKw} kW
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Plazo de Montaje</span>
                        <span className="font-extrabold text-slate-900 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          {machinery.assemblyDays} días
                        </span>
                      </div>
                    </div>

                    {/* Options / Pricing Cards */}
                    <div className="space-y-3 pt-2">
                      <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        Opciones de Configuración y Capacidad de Producción:
                      </span>

                      {machinery.options.map(option => {
                        const basePrice = option.basePrice;
                        const iva = basePrice * 0.21;
                        const totalCash = basePrice + iva;

                        const baseDeferred = basePrice * 1.10;
                        const ivaDeferred = baseDeferred * 0.21;
                        const downPayment = (baseDeferred * 0.40) + ivaDeferred;
                        const installment24 = (baseDeferred * 0.60) / 24;

                        return (
                          <div 
                            key={option.id} 
                            className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-amber-400 transition"
                          >
                            <div className="space-y-1">
                              <h5 className="font-bold text-slate-900 text-sm">{option.title}</h5>
                              <p className="text-xs text-amber-800 font-semibold flex items-center gap-1">
                                <span>🚀 Capacidad:</span>
                                <strong className="font-mono text-amber-950 text-sm">{option.productionCapacityUnitsPerHour} unidades / hora</strong>
                              </p>
                              
                              <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
                                <div>
                                  💳 <strong>Al Contado:</strong> <span className="font-mono font-bold text-slate-900">{basePrice.toLocaleString('es-ES')} €</span> + IVA 21% = <strong className="font-mono text-emerald-700">{totalCash.toLocaleString('es-ES')} € Total</strong>
                                </div>
                                <div>
                                  📅 <strong>Pago Aplazado (+10%):</strong> Entrada de <strong className="font-mono text-slate-900">{downPayment.toLocaleString('es-ES')} €</strong> + 24 pagarés de <strong className="font-mono text-amber-800">{installment24.toLocaleString('es-ES')} €/mes</strong>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleOpenBuyModal(machinery, option)}
                              className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs shrink-0 flex items-center justify-center gap-1.5"
                            >
                              <span>Seleccionar y Comprar</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

      {/* CONFIRMATION & LOCATION BUY MODAL */}
      {showConfirmModal && selectedMachinery && selectedOption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-amber-950 text-white p-6 flex justify-between items-start">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Formalizar Adquisición</span>
                <h3 className="text-lg font-extrabold text-white">{selectedMachinery.title}</h3>
                <p className="text-xs text-slate-300 font-medium">{selectedOption.title}</p>
              </div>
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs">

              {errorMsg && (
                <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-rose-800 font-semibold flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Step 1: Select Industrial Nave Location */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  1. Selecciona la Nave Industrial donde se instalará:
                </label>
                
                {industrialNaves.length > 0 ? (
                  <select
                    value={selectedNaveId}
                    onChange={(e) => setSelectedNaveId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 font-semibold text-slate-800 bg-white text-xs"
                  >
                    <option value="">-- Selecciona una Nave Industrial --</option>
                    {industrialNaves.map(nave => {
                      const isEnough = nave.surfaceM2 >= selectedMachinery.totalRequiredM2;
                      return (
                        <option key={nave.id} value={nave.id}>
                          {nave.propertyTitle} ({nave.surfaceM2} m²) - {isEnough ? 'Apta para montaje' : '⚠️ m² insuficientes'}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-900 space-y-2">
                    <p className="font-bold flex items-center gap-1">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span>NO TIENES NINGUNA NAVE INDUSTRIAL DISPONIBLE</span>
                    </p>
                    <p className="text-[11px] text-rose-700">
                      Esta línea de maquinaria requiere de una Nave Industrial de al menos {selectedMachinery.totalRequiredM2} m². Actualmente no dispones de naves en propiedad ni en alquiler. Debes acudir primero al Portal Inmobiliario.
                    </p>
                  </div>
                )}
              </div>

              {/* Step 2: Select Payment Method */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  2. Selecciona la Forma de Pago:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Contado */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('contado')}
                    className={`p-4 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      paymentMethod === 'contado' 
                        ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20 text-emerald-950 font-bold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">Pago al Contado</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">Sin recargo</span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-normal">Cargo inmediato del 100% de la factura (Precio base + IVA 21%).</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-emerald-200/60 font-mono text-sm font-extrabold text-emerald-800">
                      {((selectedOption.basePrice * 1.21)).toLocaleString('es-ES')} € Total
                    </div>
                  </button>

                  {/* Pago Aplazado */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('aplazado_pagares')}
                    className={`p-4 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      paymentMethod === 'aplazado_pagares' 
                        ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20 text-amber-950 font-bold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">Pago Aplazado (Pagarés)</span>
                        <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full">+10% Recargo</span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-normal">
                        Entrada inicial del 40% + Total IVA 21%. El 60% restante se aplaza en 24 pagarés mensuales.
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-amber-200/60 font-mono text-[11px] text-amber-900">
                      Entrada: <strong className="text-slate-900">{(((selectedOption.basePrice * 1.10) * 0.40) + ((selectedOption.basePrice * 1.10) * 0.21)).toLocaleString('es-ES')} €</strong> + 24 pagarés de <strong className="text-amber-800">{((selectedOption.basePrice * 1.10 * 0.60) / 24).toLocaleString('es-ES')} €/m</strong>
                    </div>
                  </button>
                </div>
              </div>

              {/* Cost Summary Box */}
              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono">
                <div className="flex justify-between border-b border-slate-800 pb-1 text-[11px]">
                  <span className="text-slate-400 font-sans">Precio Base:</span>
                  <span>{(paymentMethod === 'contado' ? selectedOption.basePrice : selectedOption.basePrice * 1.10).toLocaleString('es-ES')} €</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1 text-[11px]">
                  <span className="text-slate-400 font-sans">IVA 21%:</span>
                  <span>{((paymentMethod === 'contado' ? selectedOption.basePrice : selectedOption.basePrice * 1.10) * 0.21).toLocaleString('es-ES')} €</span>
                </div>
                {paymentMethod === 'aplazado_pagares' ? (
                  <>
                    <div className="flex justify-between border-b border-slate-800 pb-1 text-[11px] text-amber-300">
                      <span className="font-sans">Entrada a pagar hoy (40% + 100% IVA):</span>
                      <span className="font-bold">{(((selectedOption.basePrice * 1.10) * 0.40) + ((selectedOption.basePrice * 1.10) * 0.21)).toLocaleString('es-ES')} €</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-300">
                      <span className="font-sans">24 Pagarés Mensuales Domiciliados:</span>
                      <span className="font-bold text-amber-400">{((selectedOption.basePrice * 1.10 * 0.60) / 24).toLocaleString('es-ES')} € / mes</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-xs text-emerald-400 pt-1 font-bold">
                    <span className="font-sans">Total a Deducir de Cuenta hoy:</span>
                    <span>{(selectedOption.basePrice * 1.21).toLocaleString('es-ES')} €</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || industrialNaves.length === 0}
                  onClick={handleConfirmPurchase}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl transition cursor-pointer flex items-center space-x-2"
                >
                  {isSubmitting ? 'Procesando Orden...' : 'Confirmar y Formalizar Compra'}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
