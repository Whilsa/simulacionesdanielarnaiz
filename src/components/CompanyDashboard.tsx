/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, PropertyAcquisition, PaymentObligation, BankLoan, MachineryAcquisition } from '../types.js';
import { 
  Briefcase, Landmark, Building2, ShieldCheck, ArrowLeft, RefreshCw, 
  Euro, Calendar, FileText, CheckCircle2, Clock, AlertTriangle, Layers, CreditCard, Receipt,
  ChevronRight, ExternalLink, X, Info, Calculator, Wrench, Factory
} from 'lucide-react';
import DocumentViewerModal, { DocumentViewerData } from './DocumentViewerModal.js';
import LoanAmortizationTable from './LoanAmortizationTable.js';
import Footer from './Footer.js';

interface CompanyDashboardProps {
  currentUser: User;
  onBackToHub: () => void;
  onGoToBank?: () => void;
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
    totalMachineryAssetsValue?: number;
    machineryCount?: number;
    totalObligationsPendingAmount?: number;
    totalLoansPendingAmount?: number;
    totalLoansPendingPrincipal?: number;
    totalPendingObligations: number;
    totalMonthlyRentCommitments: number;
    activeLoansCount?: number;
  };
  acquisitions: PropertyAcquisition[];
  obligations: PaymentObligation[];
  loans?: BankLoan[];
  machineryAcquisitions?: MachineryAcquisition[];
}

export default function CompanyDashboard({ currentUser, onBackToHub, onGoToBank, onUserBalanceUpdated }: CompanyDashboardProps) {
  const [data, setData] = useState<CompanyDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [payingObligationId, setPayingObligationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'owned' | 'rented' | 'machinery' | 'obligations'>('owned');
  const [activeDocumentModal, setActiveDocumentModal] = useState<DocumentViewerData | null>(null);
  
  // Modal for detailed breakdown of debts by operation origin
  const [showDebtDetailsModal, setShowDebtDetailsModal] = useState(false);
  const [debtFilterOrigin, setDebtFilterOrigin] = useState<'all' | 'loans' | 'obligations'>('all');
  const [selectedLoanForTable, setSelectedLoanForTable] = useState<BankLoan | null>(null);
  const [selectedPropertyForPayments, setSelectedPropertyForPayments] = useState<PropertyAcquisition | null>(null);

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
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-500">Saldo en Cuenta Bancaria</span>
                    <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                      <Landmark className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-slate-900">
                    {data.summary.bankBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Tesorería disponible en el Banco Simulado</span>
                </div>
                {onGoToBank && (
                  <div className="mt-4 pt-2 border-t border-slate-100">
                    <button
                      onClick={onGoToBank}
                      className="w-full py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Landmark className="w-3.5 h-3.5" />
                      <span>Acceder al Banco</span>
                    </button>
                  </div>
                )}
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
              <div 
                onClick={() => setShowDebtDetailsModal(true)}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-red-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between"
                title="Haz clic para ver el desglose completo de deudas por operación origen"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 group-hover:text-red-700 transition-colors">Deudas / Pagarés Pendientes</span>
                      <span className="text-[10px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full">
                        Ver Detalle
                      </span>
                    </div>
                    <div className="p-2 bg-red-50 group-hover:bg-red-100 rounded-xl text-red-600 transition-colors">
                      <CreditCard className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-red-700">
                    {data.summary.totalPendingObligations.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                  <div className="flex justify-between items-center">
                    <span>Pagarés / Letras:</span>
                    <span className="font-bold text-slate-800">
                      {(data.summary.totalObligationsPendingAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Préstamos Hipotecarios:</span>
                    <span className="font-bold text-slate-800">
                      {(data.summary.totalLoansPendingAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </span>
                  </div>
                  <div className="pt-1.5 flex items-center justify-between text-red-600 font-bold text-[11px] group-hover:translate-x-0.5 transition-transform">
                    <span>Desglose por operación origen</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 mb-6 gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('owned')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
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
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'rented'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Inmuebles en Alquiler ({data.acquisitions.filter(a => a.operation === 'alquiler').length})</span>
              </button>

              <button
                onClick={() => setActiveTab('machinery')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'machinery'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>Maquinaria Industrial ({data.machineryAcquisitions?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('obligations')}
                className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'obligations'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>
                  Deudas, Pagarés y Préstamos (
                  {data.obligations.filter(o => o.status === 'pendiente').length + (data.loans?.length || 0)} activos
                  )
                </span>
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
                            <th className="p-3.5 text-right">Documento</th>
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
                                <td className="p-3.5 text-right space-x-2">
                                  <button
                                    onClick={() => setSelectedPropertyForPayments(acq)}
                                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                    title="Ver historial y desglose de pagos realizados y pendientes"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 text-emerald-300" />
                                    <span>Detalle de Pagos</span>
                                  </button>
                                  <button
                                    onClick={() => setActiveDocumentModal({ type: 'property_invoice', acquisition: acq })}
                                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                                  >
                                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Ver Factura</span>
                                  </button>
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

                          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2 flex-wrap">
                            <button
                              onClick={() => setSelectedPropertyForPayments(acq)}
                              className="px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-indigo-200" />
                              <span>Detalle de Pagos Realizados y Pendientes</span>
                            </button>
                            <button
                              onClick={() => setActiveDocumentModal({ type: 'property_invoice', acquisition: acq })}
                              className="px-3.5 py-2 bg-indigo-900 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Receipt className="w-3.5 h-3.5 text-amber-400" />
                              <span>Ver Factura / Contrato</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MACHINERY */}
            {activeTab === 'machinery' && (
              <div className="space-y-4">
                {(!data.machineryAcquisitions || data.machineryAcquisitions.length === 0) ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                    Tu empresa aún no dispone de maquinaria industrial. Puedes adquirir líneas de producción desde la sección de Maquinaria.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data.machineryAcquisitions.map(mac => {
                      const isAssembly = mac.status === 'montaje';
                      return (
                        <div key={mac.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full border border-amber-200">
                                Linea de Producción
                              </span>
                              <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                                isAssembly ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              }`}>
                                {isAssembly ? 'En Montaje (5 días)' : 'Operativa'}
                              </span>
                            </div>

                            <h3 className="text-sm font-bold text-slate-900 mb-1">{mac.title}</h3>
                            <p className="text-xs text-amber-800 font-semibold mb-3">{mac.optionTitle}</p>

                            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs border border-slate-100 font-sans">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Ubicación Instalación:</span>
                                <span className="font-bold text-slate-900">{mac.installationNaveTitle} ({mac.installationSurfaceM2} m²)</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Capacidad Producción:</span>
                                <span className="font-bold text-amber-900 font-mono">{mac.productionCapacityUnitsPerHour} unid / hora</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Inversión Adquisición:</span>
                                <span className="font-bold text-slate-900">{mac.totalPrice.toLocaleString('es-ES')} €</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Modalidad Pago:</span>
                                <span className="font-semibold text-slate-800">{mac.paymentMethod === 'contado' ? 'Al Contado' : 'Aplazado (24 Pagarés)'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-2 text-[11px] text-slate-400 border-t border-slate-100 flex justify-between items-center">
                            <span>Adquirido: {new Date(mac.purchaseDate).toLocaleDateString('es-ES')}</span>
                            {isAssembly && (
                              <span className="font-semibold text-amber-700">
                                Fin montaje: {new Date(mac.assemblyFinishDate).toLocaleDateString('es-ES')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'obligations' && (
              <div className="space-y-6">
                {/* 1. BANK LOANS SECTION */}
                {data.loans && data.loans.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-emerald-600" />
                        <span>Préstamos Bancarios y Hipotecarios Activos ({data.loans.length})</span>
                      </h3>
                      <span className="text-xs text-slate-500 font-medium">
                        Origen: Banco Simulado (Financiación de Inmuebles)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.loans.map(loan => {
                        const unpaidRows = (loan.schedule || []).filter(r => !r.paid);
                        const unpaidSum = unpaidRows.reduce((acc, r) => acc + r.payment, 0);
                        const unpaidPrincipal = unpaidRows.reduce((acc, r) => acc + r.principal, 0);

                        return (
                          <div key={loan.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-colors">
                            <div>
                              <div className="flex items-start justify-between">
                                <div>
                                  <span className="inline-block text-[10px] uppercase font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 mb-1">
                                    Préstamo Hipotecario
                                  </span>
                                  <h4 className="text-sm font-black text-slate-900 line-clamp-1">
                                    {loan.collateral.propertyTitle || 'Garantía Inmobiliaria'}
                                  </h4>
                                </div>
                                <span className="text-xs font-mono font-bold text-slate-500">
                                  Ref: #{loan.id.slice(0, 8)}
                                </span>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-y border-slate-100 py-3 my-2">
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Capital Otorgado</span>
                                  <span className="font-extrabold text-slate-800">{loan.offeredAmount.toLocaleString('es-ES')} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Cuotas Pendientes</span>
                                  <span className="font-extrabold text-red-700">{unpaidSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Capital Vivo (Principal)</span>
                                  <span className="font-extrabold text-slate-800">{unpaidPrincipal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Cuota Mensual</span>
                                  <span className="font-extrabold text-slate-900">{loan.monthlyPayment.toLocaleString('es-ES')} €/mes</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-500">
                                <span>Plazo: {loan.termMonths} meses • {loan.annualInterestRate}% Int.</span>
                                <span>{unpaidRows.length} cuotas rest.</span>
                              </div>
                            </div>

                            <button
                              onClick={() => setSelectedLoanForTable(loan)}
                              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Ver Cuadro de Amortización Completo</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. PAYMENT OBLIGATIONS TABLE */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-amber-600" />
                      <span>Pagarés, Letras y Compromisos de Pago ({data.obligations.length})</span>
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      Origen: Compraventa / Arrendamientos Inmobiliarios
                    </span>
                  </div>

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
                              <th className="p-3.5 text-right">Acción / Documento</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {[...data.obligations]
                              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                              .map(ob => {
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
                                  <td className="p-3.5 text-right space-x-2">
                                    <button
                                      onClick={() => setActiveDocumentModal({ type: 'property_invoice', obligation: ob })}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-[11px] transition border border-slate-200 inline-flex items-center gap-1"
                                      title="Ver Factura Correspondiente"
                                    >
                                      <Receipt className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Factura</span>
                                    </button>
                                    {isPending && (
                                      <button
                                        disabled={payingObligationId === ob.id}
                                        onClick={() => handlePayObligation(ob.id)}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-[11px] transition shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                      >
                                        {payingObligationId === ob.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                        <span>Pagar</span>
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
              </div>
            )}
          </>
        )}
      </main>

      <Footer />

      {/* DETAILED DEBT BREAKDOWN MODAL BY OPERATION ORIGIN */}
      {showDebtDetailsModal && data && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-600/20 text-red-400 rounded-2xl border border-red-500/30">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Detalle de Deudas por Operación Origen</h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Simulador de Daniel Arnaiz Boluda • Contabilidad y Gestión Patrimonial
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDebtDetailsModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
              {/* Summary KPIs Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-900">
                  <span className="text-[10px] font-extrabold uppercase text-red-600 block mb-1">Deuda Total Pendiente</span>
                  <div className="text-xl font-black text-red-700">
                    {data.summary.totalPendingObligations.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                  <span className="text-[11px] text-red-600/80 mt-1 block">
                    Pagarés + Préstamos Bancarios
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900">
                  <span className="text-[10px] font-extrabold uppercase text-emerald-700 block mb-1">Préstamos Hipotecarios</span>
                  <div className="text-xl font-black text-emerald-800">
                    {(data.summary.totalLoansPendingAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                  <span className="text-[11px] text-emerald-700/80 mt-1 block">
                    {data.summary.activeLoansCount || 0} operación(es) con Banco Simulado
                  </span>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900">
                  <span className="text-[10px] font-extrabold uppercase text-amber-800 block mb-1">Pagarés / Letras de Cambio</span>
                  <div className="text-xl font-black text-amber-900">
                    {(data.summary.totalObligationsPendingAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </div>
                  <span className="text-[11px] text-amber-800/80 mt-1 block">
                    {data.obligations.filter(o => o.status === 'pendiente').length} cuota(s) por vencer
                  </span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setDebtFilterOrigin('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                    debtFilterOrigin === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Todas las Deudas
                </button>
                <button
                  onClick={() => setDebtFilterOrigin('loans')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                    debtFilterOrigin === 'loans'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Préstamos Bancarios ({(data.loans || []).length})</span>
                </button>
                <button
                  onClick={() => setDebtFilterOrigin('obligations')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                    debtFilterOrigin === 'obligations'
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Pagarés y Letras ({data.obligations.filter(o => o.status === 'pendiente' && o.type !== 'cuota_alquiler').length})</span>
                </button>
              </div>

              {/* LIST BY OPERATION ORIGIN */}
              <div className="space-y-6">
                {/* ORIGIN 1: BANK LOANS */}
                {(debtFilterOrigin === 'all' || debtFilterOrigin === 'loans') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-emerald-600" />
                        <span>Operación Origen: Financiación Hipotecaria Bancaria</span>
                      </h3>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                        Banco Simulado
                      </span>
                    </div>

                    {(!data.loans || data.loans.length === 0) ? (
                      <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200">
                        No existen préstamos bancarios o hipotecarios concedidos para esta empresa.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {data.loans.map(loan => {
                          const unpaidRows = (loan.schedule || []).filter(r => !r.paid);
                          const unpaidSum = unpaidRows.reduce((acc, r) => acc + r.payment, 0);
                          const unpaidPrincipal = unpaidRows.reduce((acc, r) => acc + r.principal, 0);
                          const paidCount = loan.termMonths - unpaidRows.length;

                          return (
                            <div key={loan.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300">
                                      Préstamo Bancario
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">Ref: #{loan.id}</span>
                                  </div>
                                  <h4 className="text-base font-black text-slate-900 mt-1">
                                    {loan.collateral.propertyTitle || 'Garantía Inmobiliaria'}
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                    Superficie: {loan.collateral.surfaceM2 || '—'} m² • Valor de Tasación: {loan.collateral.appraisalValue.toLocaleString('es-ES')} €
                                  </p>
                                </div>

                                <div className="text-right">
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Deuda Pendiente en Cuotas</span>
                                  <div className="text-lg font-black text-red-700">
                                    {unpaidSum.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Capital Otorgado</span>
                                  <span className="font-extrabold text-slate-900">{loan.offeredAmount.toLocaleString('es-ES')} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Capital Vivo Pendiente</span>
                                  <span className="font-extrabold text-slate-900">{unpaidPrincipal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Cuota Mensual</span>
                                  <span className="font-extrabold text-slate-900">{loan.monthlyPayment.toLocaleString('es-ES')} €/mes</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Interés y Plazo</span>
                                  <span className="font-extrabold text-slate-900">{loan.annualInterestRate}% • {paidCount}/{loan.termMonths} pagadas</span>
                                </div>
                              </div>

                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={() => {
                                    setShowDebtDetailsModal(false);
                                    setSelectedLoanForTable(loan);
                                  }}
                                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-2"
                                >
                                  <Calculator className="w-4 h-4 text-emerald-400" />
                                  <span>Ver Cuadro de Amortización Completo</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ORIGIN 2: PROMISSORY NOTES & BILLS OF EXCHANGE */}
                {(debtFilterOrigin === 'all' || debtFilterOrigin === 'obligations') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-amber-600" />
                        <span>Operación origen: compras</span>
                      </h3>
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                        Efectos Mercantiles
                      </span>
                    </div>

                    {data.obligations.filter(o => o.type !== 'cuota_alquiler').length === 0 ? (
                      <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200">
                        No existen pagarés ni letras de cambio pendientes de vencimiento.
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                              <th className="p-3">Instrumento</th>
                              <th className="p-3">Inmueble Origen</th>
                              <th className="p-3">Nº Cuota</th>
                              <th className="p-3">Importe</th>
                              <th className="p-3">Vencimiento</th>
                              <th className="p-3">Estado</th>
                              <th className="p-3 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {[...data.obligations]
                              .filter(o => o.type !== 'cuota_alquiler')
                              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                              .map(ob => {
                              const isPaid = ob.status === 'pagado';

                              return (
                                <tr key={ob.id} className="hover:bg-slate-50 transition">
                                  <td className="p-3 font-bold text-slate-800">
                                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] uppercase font-bold">
                                      {ob.type === 'pagare' ? 'Pagaré' : 'Letra de Cambio'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-900 font-bold">{ob.propertyTitle}</td>
                                  <td className="p-3 text-slate-600">
                                    Cuota {ob.installmentNumber || 1} / {ob.totalInstallments || 12}
                                  </td>
                                  <td className="p-3 font-black text-slate-900 text-sm">
                                    {ob.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                  </td>
                                  <td className="p-3 font-mono text-slate-700">
                                    {new Date(ob.dueDate).toLocaleDateString('es-ES')}
                                  </td>
                                  <td className="p-3">
                                    {isPaid ? (
                                      <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                        Pagado
                                      </span>
                                    ) : (
                                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                        Pendiente
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right space-x-1.5">
                                    <button
                                      onClick={() => setActiveDocumentModal({ type: 'property_invoice', obligation: ob })}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-[11px] border border-slate-200 inline-flex items-center gap-1"
                                    >
                                      <Receipt className="w-3 h-3 text-amber-600" />
                                      <span>Factura</span>
                                    </button>
                                    {!isPaid && (
                                      <button
                                        disabled={payingObligationId === ob.id}
                                        onClick={() => handlePayObligation(ob.id)}
                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow-xs cursor-pointer inline-flex items-center gap-1"
                                      >
                                        {payingObligationId === ob.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                        <span>Pagar</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ORIGIN 3: RENT COMMITMENTS */}
                {(debtFilterOrigin === 'all' || debtFilterOrigin === 'rent') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        <span>Operación origen: alquileres</span>
                      </h3>
                      <span className="text-[11px] font-bold text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full">
                        Alquileres
                      </span>
                    </div>

                    {data.obligations.filter(o => o.type === 'cuota_alquiler').length === 0 ? (
                      <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-500 border border-slate-200">
                        No existen recibos de alquiler pendientes de abono.
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                              <th className="p-3">Inmueble Alquilado</th>
                              <th className="p-3">Nº Cuota</th>
                              <th className="p-3">Importe Mensual</th>
                              <th className="p-3">Vencimiento</th>
                              <th className="p-3">Estado</th>
                              <th className="p-3 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {[...data.obligations]
                              .filter(o => o.type === 'cuota_alquiler')
                              .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                              .map(ob => {
                              const isPaid = ob.status === 'pagado';

                              return (
                                <tr key={ob.id} className="hover:bg-slate-50 transition">
                                  <td className="p-3 text-slate-900 font-bold">{ob.propertyTitle}</td>
                                  <td className="p-3 text-slate-600">
                                    Cuota {ob.installmentNumber || 1} / {ob.totalInstallments || 12}
                                  </td>
                                  <td className="p-3 font-black text-slate-900 text-sm">
                                    {ob.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                  </td>
                                  <td className="p-3 font-mono text-slate-700">
                                    {new Date(ob.dueDate).toLocaleDateString('es-ES')}
                                  </td>
                                  <td className="p-3">
                                    {isPaid ? (
                                      <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                        Pagado
                                      </span>
                                    ) : (
                                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                        Pendiente
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right space-x-1.5">
                                    <button
                                      onClick={() => setActiveDocumentModal({ type: 'property_invoice', obligation: ob })}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-[11px] border border-slate-200 inline-flex items-center gap-1"
                                    >
                                      <Receipt className="w-3 h-3 text-indigo-600" />
                                      <span>Factura</span>
                                    </button>
                                    {!isPaid && (
                                      <button
                                        disabled={payingObligationId === ob.id}
                                        onClick={() => handlePayObligation(ob.id)}
                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] shadow-xs cursor-pointer inline-flex items-center gap-1"
                                      >
                                        {payingObligationId === ob.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                        <span>Pagar</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">
                * Las cuotas de alquiler son gastos corrientes pagados por adelantado y no figuran como deudas financieras.
              </span>
              <button
                onClick={() => setShowDebtDetailsModal(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROPERTY PAYMENTS BREAKDOWN MODAL */}
      {selectedPropertyForPayments && data && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">{selectedPropertyForPayments.propertyTitle}</h2>
                  <p className="text-xs text-slate-400 font-medium">
                    {selectedPropertyForPayments.location} • {selectedPropertyForPayments.operation === 'compra' ? 'Inmueble en Propiedad' : 'Contrato de Arrendamiento / Alquiler'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPropertyForPayments(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50 text-xs">
              {(() => {
                const propObs = data.obligations.filter(o => 
                  o.propertyId === selectedPropertyForPayments.propertyId || 
                  o.propertyId === selectedPropertyForPayments.id ||
                  o.propertyTitle === selectedPropertyForPayments.propertyTitle
                );
                const paidObs = propObs.filter(o => o.status === 'pagado');
                const pendingObs = propObs.filter(o => o.status === 'pendiente');

                const totalPaid = paidObs.reduce((acc, o) => acc + o.amount, 0);
                const totalPending = pendingObs.reduce((acc, o) => acc + o.amount, 0);

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Precio / Renta Base</span>
                        <div className="text-lg font-black text-slate-900">
                          {selectedPropertyForPayments.operation === 'compra'
                            ? `${selectedPropertyForPayments.totalPrice.toLocaleString('es-ES')} €`
                            : `${(selectedPropertyForPayments.monthlyRent || selectedPropertyForPayments.totalPrice).toLocaleString('es-ES')} €/mes`}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          {selectedPropertyForPayments.operation === 'compra' ? 'Importe total operación' : 'Cuota mensual de alquiler'}
                        </span>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-900 shadow-2xs">
                        <span className="text-[10px] font-extrabold uppercase text-emerald-700 block mb-1">Pagos Realizados</span>
                        <div className="text-lg font-black text-emerald-800">
                          {totalPaid.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </div>
                        <span className="text-[10px] text-emerald-700 mt-0.5 block">
                          {paidObs.length} cuota(s) abonadas
                        </span>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 shadow-2xs">
                        <span className="text-[10px] font-extrabold uppercase text-amber-800 block mb-1">Pagos Pendientes</span>
                        <div className="text-lg font-black text-amber-900">
                          {totalPending.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </div>
                        <span className="text-[10px] text-amber-800 mt-0.5 block">
                          {pendingObs.length} cuota(s) pendientes
                        </span>
                      </div>
                    </div>

                    {/* Installments Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="p-3.5 bg-slate-100 border-b border-slate-200 font-bold text-slate-800 flex justify-between items-center">
                        <span>Historial y Plan de Pagos del Inmueble</span>
                        <span className="text-[11px] font-normal text-slate-500">{propObs.length} registros</span>
                      </div>

                      {propObs.length === 0 ? (
                        <div className="p-6 text-center text-slate-500">
                          {selectedPropertyForPayments.paymentMethod === 'contado' 
                            ? 'Inmueble abonado en su totalidad al contado en el momento de la compra.' 
                            : 'No hay cuotas ni pagos pendientes registrados para este inmueble.'}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                                <th className="p-3">Concepto / N° Cuota</th>
                                <th className="p-3">Importe (€)</th>
                                <th className="p-3">Vencimiento</th>
                                <th className="p-3">Estado</th>
                                <th className="p-3 text-right">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-xs">
                              {propObs.map((ob) => {
                                const isPaid = ob.status === 'pagado';
                                return (
                                  <tr key={ob.id} className="hover:bg-slate-50/80 transition">
                                    <td className="p-3">
                                      <span className="font-bold text-slate-800 block">
                                        {ob.type === 'cuota_alquiler' ? 'Renta de Alquiler' : ob.type === 'pagare' ? 'Pagaré' : 'Letra de Cambio'}
                                      </span>
                                      <span className="text-[10px] text-slate-400">
                                        Cuota {ob.installmentNumber || 1} de {ob.totalInstallments || 1}
                                      </span>
                                    </td>
                                    <td className="p-3 font-bold text-slate-900 font-mono">
                                      {ob.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                    </td>
                                    <td className="p-3 text-slate-600 font-mono">
                                      {new Date(ob.dueDate).toLocaleDateString('es-ES')}
                                    </td>
                                    <td className="p-3">
                                      {isPaid ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                          <CheckCircle2 className="w-3 h-3" />
                                          <span>Pagado</span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                          <Clock className="w-3 h-3" />
                                          <span>Pendiente</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 text-right space-x-2">
                                      <button
                                        onClick={() => setActiveDocumentModal({ type: 'property_invoice', obligation: ob })}
                                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-[11px] transition border border-slate-200 inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <Receipt className="w-3.5 h-3.5 text-amber-600" />
                                        <span>Factura</span>
                                      </button>
                                      {!isPaid && (
                                        <button
                                          disabled={payingObligationId === ob.id}
                                          onClick={() => handlePayObligation(ob.id)}
                                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] transition shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                        >
                                          {payingObligationId === ob.id && <RefreshCw className="w-3 h-3 animate-spin" />}
                                          <span>Pagar</span>
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedPropertyForPayments(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cerrar Detalle de Pagos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOAN AMORTIZATION SCHEDULE MODAL */}
      {selectedLoanForTable && (
        <LoanAmortizationTable
          loan={selectedLoanForTable}
          onClose={() => setSelectedLoanForTable(null)}
        />
      )}

      {/* DOCUMENT VIEWER MODAL */}
      {activeDocumentModal && (
        <DocumentViewerModal
          data={activeDocumentModal}
          onClose={() => setActiveDocumentModal(null)}
        />
      )}
    </div>
  );
}
