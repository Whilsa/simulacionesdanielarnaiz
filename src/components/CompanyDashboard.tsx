/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, PropertyAcquisition, PaymentObligation } from '../types.js';
import { 
  Briefcase, Landmark, Building2, ShieldCheck, ArrowLeft, RefreshCw, 
  Euro, Calendar, FileText, CheckCircle2, Clock, AlertTriangle, Layers, CreditCard
} from 'lucide-react';

interface CompanyDashboardProps {
  currentUser: User;
  onBackToHub: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

interface CompanyDataResponse {
  company: {
    id: string;
    name: string;
    username: string;
    accountNumber: string;
    balance: number;
    role: string;
  };
  summary: {
    bankBalance: number;
    ownedPropertiesCount: number;
    rentedPropertiesCount: number;
    totalRealEstateAssetsValue: number;
    totalLandValue: number;
    totalBuildingValue: number;
    annualBuildingDepreciation: number;
    totalPendingObligations: number;
    totalMonthlyRentCommitments: number;
  };
  acquisitions: PropertyAcquisition[];
  obligations: PaymentObligation[];
}

export default function CompanyDashboard({ currentUser, onBackToHub, onUserBalanceUpdated }: CompanyDashboardProps) {
  const [data, setData] = useState<CompanyDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [payingObligationId, setPayingObligationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'owned' | 'rented' | 'obligations'>('owned');

  const fetchCompanyData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company/${currentUser.id}`);
      if (!res.ok) throw new Error('Error al cargar la información patrimonial');
      const json = await res.json();
      setData(json);
      if (json.company?.balance !== undefined && onUserBalanceUpdated) {
        onUserBalanceUpdated(json.company.balance);
      }
    } catch (err: any) {
      setError(err.message || 'Error de servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanyData();
  }, [currentUser.id]);

  const handlePayObligation = async (obligationId: string) => {
    setPayingObligationId(obligationId);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/obligations/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obligationId,
          studentId: currentUser.id
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al procesar el pago');

      setSuccessMsg(json.message);
      fetchCompanyData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPayingObligationId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      {/* Header */}
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
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight line-clamp-1">{currentUser.name}</h1>
                <p className="text-[11px] text-slate-400">Estado Patrimonial y Contable de la Empresa</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 text-right">
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Cuenta Bancaria IBAN</span>
              <span className="text-xs font-mono font-bold text-slate-200">{currentUser.accountNumber}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner Messages */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
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

        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Cargando estado financiero de la empresa...</p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-xs text-slate-500">No se encontraron datos de la empresa.</div>
        ) : (
          <>
            {/* Balance Overview Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* Bank Balance */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Saldo Bancario</span>
                  <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                    <Landmark className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {data.summary.bankBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">Tesorería disponible en cuenta</span>
              </div>

              {/* Total Real Estate Value */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Activo Inmobiliario</span>
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {data.summary.totalRealEstateAssetsValue.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                </div>
                <span className="text-[10px] text-blue-700 font-medium mt-1 block">
                  {data.summary.ownedPropertiesCount} Inmueble(s) en Propiedad
                </span>
              </div>

              {/* Land vs Building Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Suelo vs Construcción</span>
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Terreno (No Amort.):</span>
                    <span className="font-bold text-slate-900">{data.summary.totalLandValue.toLocaleString('es-ES')} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Construcción (2%/año):</span>
                    <span className="font-bold text-slate-900">{data.summary.totalBuildingValue.toLocaleString('es-ES')} €</span>
                  </div>
                </div>
              </div>

              {/* Obligations & Commitments */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Deudas / Pagarés Pendientes</span>
                  <div className="p-2 bg-red-50 rounded-xl text-red-600">
                    <CreditCard className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-red-700">
                  {data.summary.totalPendingObligations.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Alquiler mensual comprometido: {data.summary.totalMonthlyRentCommitments.toLocaleString('es-ES')} €/mes
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 mb-6 gap-2">
              <button
                onClick={() => setActiveTab('owned')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 ${
                  activeTab === 'owned'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Inmuebles en Propiedad ({data.acquisitions.filter(a => a.operation === 'compra').length})</span>
              </button>

              <button
                onClick={() => setActiveTab('rented')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 ${
                  activeTab === 'rented'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Inmuebles en Alquiler ({data.acquisitions.filter(a => a.operation === 'alquiler').length})</span>
              </button>

              <button
                onClick={() => setActiveTab('obligations')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 ${
                  activeTab === 'obligations'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Obligaciones y Pagarés ({data.obligations.filter(o => o.status === 'pendiente').length} pendientes)</span>
              </button>
            </div>

            {/* TAB 1: OWNED PROPERTIES */}
            {activeTab === 'owned' && (
              <div className="space-y-4">
                {data.acquisitions.filter(a => a.operation === 'compra').length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    Tu empresa aún no posee ningún inmueble comercial o industrial en propiedad. Puedes adquirir naves, almacenes o locales desde el Portal Inmobiliario.
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="p-3.5">Inmueble</th>
                            <th className="p-3.5">Ubicación</th>
                            <th className="p-3.5">Superficie</th>
                            <th className="p-3.5">Precio Base</th>
                            <th className="p-3.5">IVA (21%)</th>
                            <th className="p-3.5">Desglose Suelo / Edificación</th>
                            <th className="p-3.5">Modalidad Pago</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {data.acquisitions.filter(a => a.operation === 'compra').map(acq => {
                            const landVal = (acq.basePrice * acq.landPercentage) / 100;
                            const buildVal = acq.basePrice - landVal;

                            return (
                              <tr key={acq.id} className="hover:bg-slate-50/80 transition">
                                <td className="p-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                                      <Building2 className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-900 block">{acq.propertyTitle}</span>
                                      <span className="text-[10px] text-slate-400">Comprado el {new Date(acq.purchaseDate).toLocaleDateString('es-ES')}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3.5 text-slate-600">{acq.location}</td>
                                <td className="p-3.5 font-bold">{acq.surfaceM2} m²</td>
                                <td className="p-3.5 font-bold text-slate-900">{acq.basePrice.toLocaleString('es-ES')} €</td>
                                <td className="p-3.5 text-slate-600">{acq.ivaAmount.toLocaleString('es-ES')} €</td>
                                <td className="p-3.5">
                                  <div className="text-[11px] space-y-0.5">
                                    <span className="block text-slate-700">
                                      Suelo ({acq.landPercentage}%): <strong>{landVal.toLocaleString('es-ES')} €</strong>
                                    </span>
                                    <span className="block text-slate-500">
                                      Edificación ({100 - acq.landPercentage}%): <strong>{buildVal.toLocaleString('es-ES')} €</strong>
                                    </span>
                                  </div>
                                </td>
                                <td className="p-3.5">
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                    acq.paymentMethod === 'contado'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {acq.paymentMethod === 'contado' ? 'Al Contado' : 'Pago Aplazado'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: RENTED PROPERTIES */}
            {activeTab === 'rented' && (
              <div className="space-y-4">
                {data.acquisitions.filter(a => a.operation === 'alquiler').length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    No dispones de contratos de alquiler vigentes.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data.acquisitions.filter(a => a.operation === 'alquiler').map(acq => (
                      <div key={acq.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">
                              Arrendamiento Comercial
                            </span>
                            <span className="text-xs text-slate-400">
                              Desde {new Date(acq.purchaseDate).toLocaleDateString('es-ES')}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 mb-1">{acq.propertyTitle}</h3>
                          <p className="text-xs text-slate-500 mb-4">{acq.location}</p>

                          <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs border border-slate-100">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Renta Mensual Total (con 21% IVA):</span>
                              <span className="font-extrabold text-slate-900">{(acq.monthlyRent || acq.totalPrice).toLocaleString('es-ES')} €/mes</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Domiciliación Bancaria:</span>
                              <span className="font-bold text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Activa</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: OBLIGATIONS & PROMISSORY NOTES */}
            {activeTab === 'obligations' && (
              <div className="space-y-4">
                {data.obligations.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    No existen obligaciones de pago ni pagarés emitidos.
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                            <th className="p-3.5">Instrumento</th>
                            <th className="p-3.5">Inmueble Vinculado</th>
                            <th className="p-3.5">Cuota / Vencimiento</th>
                            <th className="p-3.5">Importe (€)</th>
                            <th className="p-3.5">Fecha Vencimiento</th>
                            <th className="p-3.5">Estado</th>
                            <th className="p-3.5 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {data.obligations.map(ob => {
                            const isPaid = ob.status === 'pagado';
                            const isPending = ob.status === 'pendiente';

                            const label = ob.type === 'pagare'
                              ? 'Pagaré'
                              : ob.type === 'letra_cambio'
                              ? 'Letra de Cambio'
                              : 'Cuota Alquiler';

                            return (
                              <tr key={ob.id} className="hover:bg-slate-50/80 transition">
                                <td className="p-3.5 font-bold text-slate-800">
                                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 text-[11px]">
                                    {label}
                                  </span>
                                </td>
                                <td className="p-3.5 font-medium text-slate-900">{ob.propertyTitle}</td>
                                <td className="p-3.5 text-slate-600">
                                  Cuota {ob.installmentNumber || 1} de {ob.totalInstallments || 12}
                                </td>
                                <td className="p-3.5 font-black text-slate-900 text-sm">
                                  {ob.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="p-3.5 text-slate-700 font-mono">
                                  {new Date(ob.dueDate).toLocaleDateString('es-ES')}
                                </td>
                                <td className="p-3.5">
                                  {isPaid ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Pagado ({new Date(ob.paidDate!).toLocaleDateString('es-ES')})</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                      <Clock className="w-3 h-3" />
                                      <span>Pendiente de Cobro</span>
                                    </span>
                                  )}
                                </td>
                                <td className="p-3.5 text-right">
                                  {isPending && (
                                    <button
                                      disabled={payingObligationId === ob.id}
                                      onClick={() => handlePayObligation(ob.id)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-[11px] transition shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                    >
                                      {payingObligationId === ob.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                      <span>Pagar al Vencimiento</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
