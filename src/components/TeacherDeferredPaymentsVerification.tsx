/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, Lock, Clock, 
  Building, FileText, Landmark, PhoneCall, Zap, Wrench, Package, 
  Search, Filter, Printer, ExternalLink, ArrowDownRight, Layers, FileCheck, User as UserIcon, Users
} from 'lucide-react';
import { User, DeferredPaymentVerificationRecord, DeferredPaymentCategory } from '../types.js';
import { formatNumber } from '../lib/formatters.js';

interface TeacherAuditStudentSummary {
  studentId: string;
  studentName: string;
  studentEmail: string;
  currentBalance: number;
  isBlocked: boolean;
  totalPending30Days: number;
  totalOverdue: number;
  totalPaid: number;
  recordsCount: number;
}

interface TeacherGlobalAuditData {
  generatedAt: string;
  totalStudentsAudited: number;
  globalTotalOverdue: number;
  globalTotalScheduled30Days: number;
  globalTotalPaidHistorical: number;
  studentsSummaries: TeacherAuditStudentSummary[];
  allRecords: DeferredPaymentVerificationRecord[];
}

export default function TeacherDeferredPaymentsVerification() {
  const [auditData, setAuditData] = useState<TeacherGlobalAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const fetchTeacherAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/teacher/deferred-payments-audit');
      if (!res.ok) throw new Error('Error al cargar la auditoría global de pagos');
      const data = await res.json();
      if (data.success) {
        setAuditData(data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeacherAudit();
  }, []);

  const getCategoryIcon = (category: DeferredPaymentCategory) => {
    switch (category) {
      case 'promissory_note': return <FileText className="w-4 h-4 text-blue-600" />;
      case 'social_security': return <Landmark className="w-4 h-4 text-indigo-600" />;
      case 'tax_irpf': return <Landmark className="w-4 h-4 text-purple-600" />;
      case 'electricity': return <Zap className="w-4 h-4 text-amber-500" />;
      case 'telecom': return <PhoneCall className="w-4 h-4 text-sky-600" />;
      case 'machinery': return <Wrench className="w-4 h-4 text-orange-600" />;
      case 'property_rent':
      case 'property_purchase': return <Building className="w-4 h-4 text-emerald-600" />;
      case 'loan': return <Landmark className="w-4 h-4 text-teal-600" />;
      case 'commercial_order': return <Package className="w-4 h-4 text-slate-600" />;
      default: return <Clock className="w-4 h-4 text-slate-600" />;
    }
  };

  const filteredRecords = (auditData?.allRecords || []).filter(r => {
    if (selectedStudentId !== 'all' && r.studentId !== selectedStudentId) return false;
    if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
    
    if (selectedStatus === 'pending') {
      if (r.status === 'verified_paid') return false;
    } else if (selectedStatus === 'overdue') {
      if (r.status !== 'verified_overdue' && r.status !== 'unpaid_returned') return false;
    } else if (selectedStatus === 'paid') {
      if (r.status !== 'verified_paid') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchConcept = r.concept.toLowerCase().includes(q);
      const matchCode = r.verificationCode.toLowerCase().includes(q);
      const matchCreditor = r.creditor.toLowerCase().includes(q);
      const matchDebtor = r.debtor.toLowerCase().includes(q);
      if (!matchTitle && !matchConcept && !matchCode && !matchCreditor && !matchDebtor) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* HEADER */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-800">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg text-slate-900">
                Auditoría Global de Pagos Aplazados
              </h2>
              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Verificación General
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Supervisión de pagarés comerciales, Seguridad Social, retenciones IRPF, suministros y préstamos
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer text-xs flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Informe</span>
          </button>
          <button
            onClick={fetchTeacherAudit}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition cursor-pointer text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar Auditoría</span>
          </button>
        </div>
      </div>

      {loading && !auditData ? (
        <div className="p-16 bg-white rounded-3xl border border-slate-200 flex flex-col items-center justify-center space-y-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-amber-600" />
          <p className="text-sm font-medium">Consolidando auditoría de todos los alumnos...</p>
        </div>
      ) : auditData ? (
        <>
          {/* KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Previsto a 30 Días</span>
              <p className="text-2xl font-bold font-mono text-slate-900">{formatNumber(auditData.globalTotalScheduled30Days)} €</p>
              <span className="text-[11px] text-slate-400 block">Compromisos de todas las empresas</span>
            </div>

            <div className={`p-5 rounded-3xl border shadow-xs space-y-1 ${
              auditData.globalTotalOverdue > 0 ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-slate-200'
            }`}>
              <span className={`text-xs font-bold uppercase tracking-wider block ${
                auditData.globalTotalOverdue > 0 ? 'text-rose-700' : 'text-slate-500'
              }`}>
                Total Vencido en Mora (5%)
              </span>
              <p className={`text-2xl font-bold font-mono ${
                auditData.globalTotalOverdue > 0 ? 'text-rose-900' : 'text-slate-900'
              }`}>
                {formatNumber(auditData.globalTotalOverdue)} €
              </p>
              <span className="text-[11px] text-slate-400 block">
                {auditData.globalTotalOverdue > 0 ? 'Alumnos con impagos pendientes' : 'Sin deudas vencidas'}
              </span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Liquidado Histórico</span>
              <p className="text-2xl font-bold font-mono text-emerald-700">{formatNumber(auditData.globalTotalPaidHistorical)} €</p>
              <span className="text-[11px] text-slate-400 block">Vencimientos conciliados correctamente</span>
            </div>
          </div>

          {/* STUDENTS SUMMARY TABLE */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span>Resumen de Obligaciones por Alumno / Empresa ({auditData.studentsSummaries.length})</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Alumno / Empresa</th>
                    <th className="py-2.5 px-3">Saldo Actual</th>
                    <th className="py-2.5 px-3">Vencimientos 30d</th>
                    <th className="py-2.5 px-3">Vencido en Mora</th>
                    <th className="py-2.5 px-3">Total Liquidado</th>
                    <th className="py-2.5 px-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditData.studentsSummaries.map((st) => (
                    <tr 
                      key={st.studentId}
                      onClick={() => setSelectedStudentId(selectedStudentId === st.studentId ? 'all' : st.studentId)}
                      className={`hover:bg-slate-50 cursor-pointer transition ${
                        selectedStudentId === st.studentId ? 'bg-amber-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{st.studentName}</div>
                        <div className="text-[10px] text-slate-400">{st.studentEmail}</div>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {formatNumber(st.currentBalance)} €
                      </td>
                      <td className="py-3 px-3 font-mono text-amber-700 font-semibold">
                        {formatNumber(st.totalPending30Days)} €
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {st.totalOverdue > 0 ? (
                          <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            {formatNumber(st.totalOverdue)} €
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">0,00 €</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-emerald-700 font-medium">
                        {formatNumber(st.totalPaid)} €
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStudentId(st.studentId);
                          }}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                            selectedStudentId === st.studentId
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {selectedStudentId === st.studentId ? 'Filtrando' : 'Ver Detalle'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DETAILED VERIFICATION LIST */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Detalle de Vencimientos y Pagos Aplazados ({filteredRecords.length})
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedStudentId !== 'all' ? `Filtrando por alumno seleccionado` : 'Mostrando todos los alumnos'}
                </p>
              </div>

              {/* FILTERS */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedStudentId !== 'all' && (
                  <button
                    onClick={() => setSelectedStudentId('all')}
                    className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold text-xs"
                  >
                    Quitar filtro de alumno ✕
                  </button>
                )}

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-1.5 font-medium text-slate-700"
                >
                  <option value="all">Todas las categorías</option>
                  <option value="promissory_note">Pagarés</option>
                  <option value="social_security">Seguridad Social</option>
                  <option value="tax_irpf">Hacienda IRPF</option>
                  <option value="electricity">Electricidad</option>
                  <option value="telecom">Teléfono / Internet</option>
                  <option value="machinery">Maquinaria</option>
                  <option value="property_rent">Alquileres</option>
                  <option value="loan">Préstamos</option>
                  <option value="commercial_order">Compras aplazadas</option>
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-1.5 font-medium text-slate-700"
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendientes a término</option>
                  <option value="overdue">Vencidos en mora (5%)</option>
                  <option value="paid">Conciliados y liquidados</option>
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400"
                  />
                </div>
              </div>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
                No hay registros que coincidan con los criterios de búsqueda.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRecords.map((record) => (
                  <div
                    key={record.id}
                    className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-slate-300 transition space-y-2 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-1.5 bg-white rounded-lg border border-slate-200 shrink-0">
                          {getCategoryIcon(record.category)}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900">{record.title}</span>
                          <span className="text-[10px] font-mono ml-2 bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            {record.verificationCode}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-2">
                            Empresa: <strong>{record.debtor}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold font-mono text-slate-900">{formatNumber(record.totalAmount)} €</span>
                        <span className="text-[10px] text-slate-400 ml-2">Vence: {new Date(record.dueDate).toLocaleDateString('es-ES')}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 pl-8">
                      {record.concept} — <span className="text-slate-500">{record.verificationMessage}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

    </div>
  );
}
