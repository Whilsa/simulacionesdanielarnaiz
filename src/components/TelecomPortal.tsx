/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, TelecomPlan, TelecomContract, TelecomInvoice, PropertyAcquisition } from '../types.js';
import { TELECOM_PLANS } from '../lib/officeStoreData.js';
import { TelecomInvoiceModal } from './TelecomInvoiceModal.js';
import Footer from './Footer.js';
import { formatNumber } from '../lib/formatters.js';
import { 
  ArrowLeft, PhoneCall, Wifi, ShieldCheck, CheckCircle2, Zap, 
  Clock, FileText, Download, Building2, AlertCircle, RefreshCw
} from 'lucide-react';

interface TelecomPortalProps {
  currentUser: User;
  onBackToHub: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

export default function TelecomPortal({ currentUser, onBackToHub, onUserBalanceUpdated }: TelecomPortalProps) {
  const [plans, setPlans] = useState<TelecomPlan[]>(TELECOM_PLANS);
  const [contracts, setContracts] = useState<TelecomContract[]>([]);
  const [invoices, setInvoices] = useState<TelecomInvoice[]>([]);
  const [acquisitions, setAcquisitions] = useState<PropertyAcquisition[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  
  const [selectedInvoice, setSelectedInvoice] = useState<TelecomInvoice | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, cRes, iRes, compRes] = await Promise.all([
        fetch('/api/telecom/plans'),
        fetch(`/api/telecom/contracts?studentId=${currentUser.id}`),
        fetch(`/api/telecom/invoices?studentId=${currentUser.id}`),
        fetch(`/api/company/${currentUser.id}`)
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData.plans && pData.plans.length > 0) setPlans(pData.plans);
      }
      if (cRes.ok) {
        const cData = await cRes.json();
        setContracts(cData.contracts || []);
      }
      if (iRes.ok) {
        const iData = await iRes.json();
        setInvoices(iData.invoices || []);
      }
      if (compRes.ok) {
        const compData = await compRes.json();
        setAcquisitions(compData.acquisitions || []);
      }
    } catch (err: any) {
      console.error(err);
      setError('Error al cargar la información de telecomunicaciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser.id]);

  const activeContract = contracts.find(c => c.status === 'active');

  const handleContractPlan = async (plan: TelecomPlan) => {
    if (!confirm(`¿Confirmas la contratación del "${plan.name}" por ${formatNumber(plan.monthlyPrice)} €/mes (+ IVA)? El servicio quedará activo inmediatamente. El cobro se domiciliará el día 1 del mes siguiente (calculando la parte proporcional según el día de alta).`)) {
      return;
    }

    setSubmittingPlanId(plan.id);
    setError(null);
    setSuccessMsg(null);

    try {
      const selectedProp = acquisitions.find(a => a.id === selectedPropertyId || a.propertyId === selectedPropertyId);
      const res = await fetch('/api/telecom/contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          planId: plan.id,
          propertyId: selectedProp ? (selectedProp.id || selectedProp.propertyId) : undefined,
          propertyTitle: selectedProp ? (selectedProp.propertyTitle || selectedProp.title) : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo contratar el plan');

      setSuccessMsg(`¡Contratado con éxito! ${data.message || ''}`);
      if (data.newBalance !== undefined && onUserBalanceUpdated) {
        onUserBalanceUpdated(data.newBalance);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Error al contratar el servicio.');
    } finally {
      setSubmittingPlanId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHub}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition cursor-pointer flex items-center gap-2 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver al Panel</span>
            </button>
            <div className="h-6 w-px bg-slate-800"></div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
                <PhoneCall className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white leading-none">Servicios de Teléfono e Internet</h1>
                <p className="text-[11px] text-slate-400 mt-0.5">Ofertas empresariales de fibra, móvil y centralita IP</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Saldo Banco</span>
              <span className="text-xs font-extrabold text-amber-400">
                {formatNumber(currentUser.balance)} €
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Banner Alert Info */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-blue-950 text-white p-6 rounded-2xl border border-slate-800 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-xs font-bold">
              <Zap className="w-3.5 h-3.5" />
              <span>Conectividad Corporativa para Empresas</span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">
              Contratación de Servicios de Fibra Óptica, Móvil y Centralita
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Selecciona el plan de telecomunicaciones adecuado para tu empresa. El pago se realizará de forma <strong className="text-amber-400">automática el día 1 del mes siguiente</strong> mediante adeudo directo en tu cuenta bancaria corporativa. Podrás descargar y consultar todas tus facturas con desglose oficial desde esta tarjeta y desde el patrimonio de la empresa.
            </p>
          </div>

          <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700 text-xs space-y-1.5 min-w-[220px]">
            <p className="font-extrabold text-slate-400 uppercase text-[10px] tracking-wider">ESTADO DE CONTRATACIÓN</p>
            {activeContract ? (
              <div>
                <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{activeContract.planName}</span>
                </p>
                <p className="text-slate-400 mt-1">{formatNumber(activeContract.monthlyPrice)} €/mes (+ IVA)</p>
              </div>
            ) : (
              <p className="font-bold text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>Sin Contrato Activo</span>
              </p>
            )}
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Property Selector for Telecom Assignment */}
        {acquisitions.length > 0 && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-xs font-bold text-slate-900">Vincular Sede de Destino (Opcional)</p>
                <p className="text-[11px] text-slate-500">Asigna la instalación de la línea de fibra a uno de tus inmuebles</p>
              </div>
            </div>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Oficina / Sede Principal General</option>
              {acquisitions.map(acq => (
                <option key={acq.id || acq.propertyId} value={acq.id || acq.propertyId}>
                  {acq.propertyTitle || acq.title} ({acq.surfaceM2} m²)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Plans Grid */}
        <section className="space-y-4">
          <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
            <Wifi className="w-5 h-5 text-blue-600" />
            <span>Ofertas Disponibles para Empresas</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const isCurrent = activeContract?.planId === plan.id;
              const isSubmitting = submittingPlanId === plan.id;

              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-2xl border flex flex-col justify-between overflow-hidden transition-all duration-200 shadow-xs hover:shadow-md ${
                    isCurrent ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-blue-400'
                  }`}
                >
                  <div>
                    {/* Card Header */}
                    <div className="relative p-5 bg-gradient-to-br from-slate-900 via-slate-850 to-blue-950 text-white border-b border-slate-800 space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="px-2.5 py-1 bg-slate-800/80 text-amber-400 border border-slate-700 text-[10px] font-extrabold uppercase rounded-full">
                          {plan.provider}
                        </span>
                        {isCurrent && (
                          <span className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-extrabold uppercase rounded-full flex items-center gap-1 shadow-sm">
                            <CheckCircle2 className="w-3 h-3" />
                            Contratado
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="font-extrabold text-base leading-snug">{plan.name}</h4>
                        <p className="text-xs text-slate-300">{plan.speedMbps >= 1000 ? `${plan.speedMbps / 1000} Gbps` : `${plan.speedMbps} Mbps`} Fibra Simétrica</p>
                      </div>
                    </div>

                    {/* Price & Features */}
                    <div className="p-6 space-y-5">
                      <div className="flex items-baseline gap-1 border-b border-slate-100 pb-4">
                        <span className="text-3xl font-black text-slate-900">{formatNumber(plan.monthlyPrice)} €</span>
                        <span className="text-xs font-semibold text-slate-500">/ mes (+ IVA)</span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">{plan.description}</p>

                      <ul className="space-y-2 text-xs text-slate-700">
                        {plan.features.map((feat, fIdx) => (
                          <li key={fIdx} className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="p-6 pt-0">
                    <button
                      onClick={() => handleContractPlan(plan)}
                      disabled={isCurrent || isSubmitting}
                      className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                        isCurrent
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-default'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md active:scale-98'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Contratando...</span>
                        </>
                      ) : isCurrent ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Plan Contratado Activo</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 text-amber-300" />
                          <span>Contratar Servicio</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Monthly Invoices Section */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <span>Histórico de Facturas Emitidas (Pago Automático el 1 de Mes)</span>
              </h3>
              <p className="text-xs text-slate-500">Facturación automática mensual por servicio de fibra e internet empresarial</p>
            </div>
            <span className="text-xs font-extrabold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
              {invoices.length} {invoices.length === 1 ? 'Factura' : 'Facturas'} Registradas
            </span>
          </div>

          {invoices.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">Aún no se han emitido facturas de telecomunicaciones.</p>
              <p className="text-[11px] text-slate-400 mt-1">Al contratar un plan, la primera factura se generará automáticamente el día 1 del siguiente mes.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold">
                    <th className="p-3">Nº Factura</th>
                    <th className="p-3">Periodo</th>
                    <th className="p-3">Plan / Proveedor</th>
                    <th className="p-3 text-right">Base Imponible</th>
                    <th className="p-3 text-right">IVA (21%)</th>
                    <th className="p-3 text-right">Total Factura</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-bold text-slate-900">{inv.invoiceNumber}</td>
                      <td className="p-3 font-medium text-slate-600">{inv.periodMonth}/{inv.periodYear}</td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{inv.planName}</p>
                        <p className="text-[10px] text-slate-500">{inv.provider}</p>
                      </td>
                      <td className="p-3 text-right font-medium">{formatNumber(inv.subtotal)} €</td>
                      <td className="p-3 text-right font-medium">{formatNumber(inv.ivaAmount)} €</td>
                      <td className="p-3 text-right font-black text-slate-900">{formatNumber(inv.totalAmount)} €</td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Pagado
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-[11px] rounded-xl transition cursor-pointer shadow-xs"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Descargar / PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>

      {/* Invoice Viewer Modal */}
      <TelecomInvoiceModal
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />

      <Footer />
    </div>
  );
}
