/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, RefreshCw, X, AlertTriangle, CheckCircle2, Lock, Clock, 
  Building, FileText, Landmark, PhoneCall, Zap, Wrench, Package, 
  Search, Filter, Printer, ExternalLink, ArrowDownRight, Layers, FileCheck, Info
} from 'lucide-react';
import { User, DeferredPaymentsAuditReport, DeferredPaymentVerificationRecord, DeferredPaymentCategory } from '../types.js';
import { formatNumber } from '../lib/formatters.js';

interface DeferredPaymentsVerificationModalProps {
  currentUser: User;
  onClose: () => void;
  onRefreshParent?: () => void;
}

export default function DeferredPaymentsVerificationModal({
  currentUser,
  onClose,
  onRefreshParent
}: DeferredPaymentsVerificationModalProps) {
  const [report, setReport] = useState<DeferredPaymentsAuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fetchAuditReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/student/deferred-payments-audit?studentId=${currentUser.id}`);
      if (!res.ok) throw new Error('Error al obtener la auditoría de pagos');
      const data = await res.json();
      if (data.success && data.audit) {
        setReport(data.audit);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunVerification = async () => {
    setVerifying(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch('/api/student/verify-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentUser.id })
      });
      const data = await res.json();
      if (data.success && data.audit) {
        setReport(data.audit);
        setFeedbackMessage('✅ Verificación y conciliación completada con éxito. Todos los registros han sido auditados.');
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err: any) {
      console.error(err);
      setFeedbackMessage('❌ Error al ejecutar la verificación de pagos.');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchAuditReport();
  }, [currentUser.id]);

  const getCategoryIcon = (category: DeferredPaymentCategory) => {
    switch (category) {
      case 'promissory_note':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'social_security':
        return <Landmark className="w-4 h-4 text-indigo-600" />;
      case 'tax_irpf':
        return <Landmark className="w-4 h-4 text-purple-600" />;
      case 'electricity':
        return <Zap className="w-4 h-4 text-amber-500" />;
      case 'telecom':
        return <PhoneCall className="w-4 h-4 text-sky-600" />;
      case 'machinery':
        return <Wrench className="w-4 h-4 text-orange-600" />;
      case 'property_rent':
      case 'property_purchase':
        return <Building className="w-4 h-4 text-emerald-600" />;
      case 'loan':
        return <Landmark className="w-4 h-4 text-teal-600" />;
      case 'commercial_order':
        return <Package className="w-4 h-4 text-slate-600" />;
      default:
        return <Clock className="w-4 h-4 text-slate-600" />;
    }
  };

  const filteredRecords = (report?.records || []).filter(r => {
    if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
    
    if (selectedStatus === 'pending') {
      if (r.status === 'verified_paid') return false;
    } else if (selectedStatus === 'overdue') {
      if (r.status !== 'verified_overdue' && r.status !== 'unpaid_returned') return false;
    } else if (selectedStatus === 'paid') {
      if (r.status !== 'verified_paid') return false;
    } else if (selectedStatus === 'bank') {
      if (r.status !== 'discounted' && r.status !== 'in_collection') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchConcept = r.concept.toLowerCase().includes(q);
      const matchCode = r.verificationCode.toLowerCase().includes(q);
      const matchCreditor = r.creditor.toLowerCase().includes(q);
      if (!matchTitle && !matchConcept && !matchCode && !matchCreditor) return false;
    }

    return true;
  });

  const categoriesList: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Todos los pagos', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'promissory_note', label: 'Pagarés comerciales', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'social_security', label: 'Seguridad Social (TGSS)', icon: <Landmark className="w-3.5 h-3.5" /> },
    { id: 'tax_irpf', label: 'Hacienda Pública (IRPF)', icon: <Landmark className="w-3.5 h-3.5" /> },
    { id: 'electricity', label: 'Electricidad (IberLuz)', icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'telecom', label: 'Teléfono e Internet', icon: <PhoneCall className="w-3.5 h-3.5" /> },
    { id: 'machinery', label: 'Maquinaria industrial', icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'property_rent', label: 'Alquileres de inmuebles', icon: <Building className="w-3.5 h-3.5" /> },
    { id: 'loan', label: 'Préstamos bancarios', icon: <Landmark className="w-3.5 h-3.5" /> },
    { id: 'property_purchase', label: 'Compraventa inmuebles', icon: <Building className="w-3.5 h-3.5" /> },
    { id: 'commercial_order', label: 'Compras y pedidos', icon: <Package className="w-3.5 h-3.5" /> }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* MODAL HEADER */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-lg sm:text-xl text-white">
                  Sistema de Verificación de Pagos Aplazados
                </h2>
                <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Auditoría Integral
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Pagarés (descontados y en gestión de cobro), Seguridad Social, Hacienda IRPF, Electricidad, Teléfono, Maquinaria, Alquileres y Préstamos
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.print()}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer text-xs flex items-center gap-1.5"
              title="Imprimir certificado de auditoría"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir Informe</span>
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNER IF VERIFIED */}
        {feedbackMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 text-xs text-emerald-900 font-semibold flex items-center justify-between">
            <span>{feedbackMessage}</span>
            <button onClick={() => setFeedbackMessage(null)} className="text-emerald-700 hover:text-emerald-950">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* BODY CONTENT */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          
          {loading && !report ? (
            <div className="p-16 flex flex-col items-center justify-center space-y-3 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-600" />
              <p className="text-sm font-medium">Verificando y auditando todos los pagos aplazados...</p>
            </div>
          ) : report ? (
            <>
              {/* TOP KPI CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Saldo Disponible</span>
                  <p className="text-lg sm:text-xl font-bold font-mono text-slate-900">{formatNumber(report.currentBalance)} €</p>
                  <span className="text-[10px] text-slate-400 block">Cuenta corriente operativa</span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Vencimientos a 30 días</span>
                  <p className="text-lg sm:text-xl font-bold font-mono text-amber-700">{formatNumber(report.totalScheduled30Days)} €</p>
                  <span className="text-[10px] text-slate-400 block">Compromisos automáticos previstos</span>
                </div>

                <div className={`p-4 rounded-2xl border shadow-xs space-y-1 ${
                  report.totalOverdueAmount > 0 
                    ? 'bg-rose-50/80 border-rose-300' 
                    : 'bg-white border-slate-200/80'
                }`}>
                  <span className={`text-[11px] font-bold uppercase tracking-wider block ${
                    report.totalOverdueAmount > 0 ? 'text-rose-700' : 'text-slate-500'
                  }`}>
                    Vencido en Mora (5%)
                  </span>
                  <p className={`text-lg sm:text-xl font-bold font-mono ${
                    report.totalOverdueAmount > 0 ? 'text-rose-900' : 'text-slate-900'
                  }`}>
                    {formatNumber(report.totalOverdueAmount)} €
                  </p>
                  <span className="text-[10px] text-slate-400 block">
                    {report.totalOverdueAmount > 0 ? '⚠️ Requiere cobertura urgente' : '0 € de recargos / Al día'}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Liquidado</span>
                  <p className="text-lg sm:text-xl font-bold font-mono text-emerald-700">{formatNumber(report.totalPaidHistorical)} €</p>
                  <span className="text-[10px] text-slate-400 block">Conciliado históricamente</span>
                </div>
              </div>

              {/* INTEGRITY STATUS BAR */}
              <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                report.systemIntegrityStatus === 'critical'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : report.systemIntegrityStatus === 'attention_required'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              }`}>
                <div className="flex items-start sm:items-center space-x-3">
                  {report.systemIntegrityStatus === 'critical' ? (
                    <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
                  ) : report.systemIntegrityStatus === 'attention_required' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                  )}
                  <div>
                    <span className="font-bold block">
                      {report.systemIntegrityStatus === 'critical'
                        ? 'Alerta de Conciliación: Mora activa'
                        : report.systemIntegrityStatus === 'attention_required'
                        ? 'Aviso de Cobertura de Saldo a 30 Días'
                        : 'Estado Óptimo: Pagos y Vencimientos Verificados'}
                    </span>
                    <p className="text-[11px] mt-0.5">{report.systemIntegrityMessage}</p>
                  </div>
                </div>

                <button
                  onClick={handleRunVerification}
                  disabled={verifying}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 shrink-0 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
                  <span>{verifying ? 'Verificando...' : 'Re-ejecutar Verificación'}</span>
                </button>
              </div>

              {/* FILTER BAR */}
              <div className="space-y-3">
                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
                  {categoriesList.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    const catSummary = report.categoriesSummary.find(c => c.category === cat.id);
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 whitespace-nowrap transition cursor-pointer border ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        {cat.icon}
                        <span>{cat.label}</span>
                        {catSummary && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            isSelected ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {catSummary.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Secondary filters & search */}
                <div className="flex flex-col sm:flex-row gap-2.5 justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 font-semibold">Estado:</span>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="bg-white border border-slate-200 text-xs rounded-xl px-3 py-1.5 font-medium text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="all">Todos los estados</option>
                      <option value="pending">Pendientes de vencimiento</option>
                      <option value="bank">En gestión bancaria / Descontados</option>
                      <option value="overdue">Vencidos en mora (5%)</option>
                      <option value="paid">Conciliados y liquidados</option>
                    </select>
                  </div>

                  <div className="relative flex-1 sm:max-w-xs">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por concepto, código o acreedor..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* RECORDS LIST / TABLE */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
                  <span>REGISTROS VERIFICADOS ({filteredRecords.length})</span>
                  <span>ORDENADOS POR FECHA DE VENCIMIENTO</span>
                </div>

                {filteredRecords.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 text-xs">
                    No se encontraron pagos aplazados que coincidan con los filtros seleccionados.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredRecords.map((record) => {
                      const isOverdue = record.status === 'verified_overdue' || record.status === 'unpaid_returned';
                      const isPaid = record.status === 'verified_paid';
                      const isBank = record.status === 'discounted' || record.status === 'in_collection';

                      return (
                        <div
                          key={record.id}
                          className={`bg-white rounded-2xl border p-4 transition shadow-2xs space-y-3 ${
                            isOverdue
                              ? 'border-rose-300 bg-rose-50/20'
                              : isPaid
                              ? 'border-emerald-200/70 bg-emerald-50/10'
                              : isBank
                              ? 'border-blue-200 bg-blue-50/10'
                              : 'border-slate-200/80 hover:border-slate-300'
                          }`}
                        >
                          {/* TOP ROW: Title, Category, Verification Badge, Amount */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-start space-x-3">
                              <div className="p-2 rounded-xl bg-slate-100 border border-slate-200/60 shadow-2xs shrink-0 mt-0.5">
                                {getCategoryIcon(record.category)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-slate-900 text-sm">{record.title}</span>
                                  <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                                    {record.verificationCode}
                                  </span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    isPaid
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isOverdue
                                      ? 'bg-rose-100 text-rose-800'
                                      : isBank
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {record.statusLabel}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-0.5">{record.concept}</p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-sm sm:text-base font-bold font-mono text-slate-900 block">
                                {formatNumber(record.totalAmount)} €
                              </span>
                              {record.penaltyInterest > 0 ? (
                                <span className="text-[10px] text-rose-600 font-bold block">
                                  Incluye +{formatNumber(record.penaltyInterest)} € (5% mora)
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-600 font-semibold block">
                                  0 € intereses de demora
                                </span>
                              )}
                            </div>
                          </div>

                          {/* MIDDLE DETAILS ROW */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Acreedor / Beneficiario</span>
                              <span className="font-semibold text-slate-800 truncate block">{record.creditor}</span>
                            </div>

                            <div>
                              <span className="text-slate-400 block text-[10px]">Vencimiento oficial</span>
                              <span className={`font-bold block ${isOverdue ? 'text-rose-700' : 'text-slate-800'}`}>
                                {new Date(record.dueDate).toLocaleDateString('es-ES')}
                                {!isPaid && (
                                  <span className="font-normal text-slate-500 ml-1">
                                    ({record.daysUntilDue === 0 ? '¡Hoy!' : record.daysUntilDue > 0 ? `en ${record.daysUntilDue}d` : `hace ${Math.abs(record.daysUntilDue)}d`})
                                  </span>
                                )}
                              </span>
                            </div>

                            <div>
                              <span className="text-slate-400 block text-[10px]">Forma de liquidación</span>
                              <span className="font-medium text-slate-700 truncate block">{record.paymentMethod || 'Adeudo directo'}</span>
                            </div>

                            <div>
                              <span className="text-slate-400 block text-[10px]">Cobertura de saldo</span>
                              <span className={`font-bold block ${
                                isPaid
                                  ? 'text-emerald-700'
                                  : record.isCoveredByBalance
                                  ? 'text-emerald-600'
                                  : 'text-amber-600'
                              }`}>
                                {isPaid ? 'Conciliado en cuenta' : record.isCoveredByBalance ? '✓ Saldo suficiente' : '⚠️ Saldo insuficiente'}
                              </span>
                            </div>
                          </div>

                          {/* FOOTER VERIFICATION NOTE */}
                          <div className="bg-slate-50 rounded-xl p-2.5 flex items-start space-x-2 text-[11px] text-slate-600 border border-slate-100">
                            <FileCheck className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span className="font-semibold text-slate-800">Dictamen de verificación: </span>
                              <span>{record.verificationMessage}</span>
                              {record.notes && (
                                <span className="block text-[10px] text-slate-500 mt-0.5">{record.notes}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </>
          ) : null}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Sistema oficial de verificación de obligaciones mercantiles y diferidas</span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition cursor-pointer"
          >
            Cerrar panel de verificación
          </button>
        </div>

      </div>
    </div>
  );
}
