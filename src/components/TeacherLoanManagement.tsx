/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Landmark, Shield, CheckCircle2, Clock, AlertCircle, Calculator, 
  FileText, Search, Filter, Edit3, X, Check, ArrowRight
} from 'lucide-react';
import { BankLoan } from '../types.js';
import LoanAmortizationTable from './LoanAmortizationTable.js';

export default function TeacherLoanManagement() {
  const [loans, setLoans] = useState<BankLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'pending' | 'active' | 'offered' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedLoanForTable, setSelectedLoanForTable] = useState<BankLoan | null>(null);

  // Review modal / inline form state
  const [reviewLoan, setReviewLoan] = useState<BankLoan | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editRate, setEditRate] = useState('4.50');
  const [editTerm, setEditTerm] = useState('36');
  const [teacherNotes, setTeacherNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/loans');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.loans) {
          setLoans(data.loans);
        }
      }
    } catch (e) {
      console.error('Error fetching teacher loans:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReview = (loan: BankLoan) => {
    setReviewLoan(loan);
    setEditAmount(String(loan.offeredAmount || loan.requestedAmount));
    setEditRate(String(loan.annualInterestRate || 4.50));
    setEditTerm(String(loan.termMonths || 36));
    setTeacherNotes('');
    setMsg('');
    setErr('');
  };

  const handleReviewSubmit = async (action: 'approve' | 'deny') => {
    if (!reviewLoan) return;
    setSubmitting(true);
    setMsg('');
    setErr('');

    try {
      const res = await fetch(`/api/teacher/loans/${reviewLoan.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          offeredAmount: action === 'approve' ? Number(editAmount) : undefined,
          annualInterestRate: action === 'approve' ? Number(editRate) : undefined,
          termMonths: action === 'approve' ? Number(editTerm) : undefined,
          teacherNotes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar la revisión del préstamo.');

      setMsg(data.message);
      setReviewLoan(null);
      fetchLoans();
    } catch (e: any) {
      setErr(e.message || 'Error al procesar la revisión.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter loans
  const filteredLoans = loans.filter(loan => {
    const matchesSearch = loan.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          loan.id.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (selectedTab === 'pending') return loan.status === 'pending_teacher';
    if (selectedTab === 'active') return loan.status === 'active';
    if (selectedTab === 'offered') return loan.status === 'offered' || loan.status === 'teacher_offered';
    return true;
  });

  const pendingCount = loans.filter(l => l.status === 'pending_teacher').length;
  const activeCount = loans.filter(l => l.status === 'active').length;

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Stats */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-100/80 rounded-xl flex items-center justify-center text-amber-900">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-slate-900 text-lg">Gestión de Préstamos Hipotecarios</h2>
              <p className="text-xs text-slate-500">Supervisión de solicitudes de financiación de los alumnos (Segundos préstamos y revisiones)</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-full text-xs font-bold">
              {pendingCount} Pendientes de Profesor
            </span>
            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold">
              {activeCount} Concedidos Activos
            </span>
          </div>
        </div>

        {msg && (
          <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg text-xs font-semibold text-emerald-700 flex items-center justify-between">
            <span>{msg}</span>
            <button onClick={() => setMsg('')} className="p-1 text-emerald-500 hover:text-emerald-700"><X className="w-4 h-4" /></button>
          </div>
        )}

        {err && (
          <div className="mb-4 bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700 flex items-center justify-between">
            <span>{err}</span>
            <button onClick={() => setErr('')} className="p-1 text-rose-500 hover:text-rose-700"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t border-slate-100">
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setSelectedTab('pending')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedTab === 'pending' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pendientes ({pendingCount})
            </button>
            <button
              onClick={() => setSelectedTab('active')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedTab === 'active' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Activos ({activeCount})
            </button>
            <button
              onClick={() => setSelectedTab('offered')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedTab === 'offered' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Ofertas Enviadas
            </button>
            <button
              onClick={() => setSelectedTab('all')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                selectedTab === 'all' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos ({loans.length})
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por alumno o Ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 w-full sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Loans Grid / Table */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs">Cargando préstamos...</div>
      ) : filteredLoans.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-500 text-xs">
          No hay solicitudes de préstamo que coincidan con el filtro seleccionado.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLoans.map((loan) => {
            const isPendingTeacher = loan.status === 'pending_teacher';
            const isActive = loan.status === 'active';
            const isOffered = loan.status === 'offered' || loan.status === 'teacher_offered';

            return (
              <div 
                key={loan.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-amber-200 transition-all"
              >
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-4 mb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 text-sm">{loan.studentName}</span>
                      <span className="text-xs text-slate-400 font-mono">({loan.studentAccount})</span>
                      {isPendingTeacher && (
                        <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          Requiere Revisión del Profesor
                        </span>
                      )}
                      {isActive && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Activo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Garantía: <strong className="text-slate-700">
                        {loan.collateral.type === 'property' 
                          ? (loan.collateral.propertyTitle || 'Inmueble Comercial') 
                          : `Vivienda Privada (${loan.collateral.surfaceM2} m²)`}
                      </strong> • Valor Tasación: <strong className="font-mono text-slate-800">{loan.collateral.appraisalValue.toLocaleString('es-ES')} €</strong>
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setSelectedLoanForTable(loan)}
                      className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-600" />
                      <span>Tabla Amortización</span>
                    </button>

                    {isPendingTeacher && (
                      <button
                        onClick={() => handleOpenReview(loan)}
                        className="bg-amber-800 hover:bg-amber-900 text-white px-4 py-1.5 rounded-xl font-bold text-xs transition flex items-center space-x-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Revisar y Aprobar</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Solicitado</span>
                    <span className="text-xs font-bold font-mono text-slate-900">
                      {loan.requestedAmount.toLocaleString('es-ES')} €
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Ofrecido (80% LTV)</span>
                    <span className="text-xs font-bold font-mono text-amber-900">
                      {loan.offeredAmount.toLocaleString('es-ES')} €
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Interés TIN</span>
                    <span className="text-xs font-bold font-mono text-emerald-700">
                      {loan.annualInterestRate.toFixed(2)} %
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Plazo</span>
                    <span className="text-xs font-bold text-slate-800">
                      {loan.termMonths} meses
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Cuota Mensual</span>
                    <span className="text-xs font-bold font-mono text-amber-800">
                      {loan.monthlyPayment.toLocaleString('es-ES')} €
                    </span>
                  </div>
                </div>

                {loan.teacherNotes && (
                  <div className="mt-3 text-[11px] bg-amber-50/60 p-2.5 rounded-xl border border-amber-100 text-amber-900">
                    <strong>Observaciones del Profesor:</strong> {loan.teacherNotes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* REVIEW / APPROVAL MODAL */}
      {reviewLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="bg-gradient-to-r from-amber-800 to-amber-900 text-white p-6 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold font-display">Revisión de Préstamo • {reviewLoan.studentName}</h3>
                <p className="text-xs text-amber-200">Ajusta o confirma las condiciones de financiación antes de enviarlas al alumno</p>
              </div>
              <button onClick={() => setReviewLoan(null)} className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-amber-900 text-xs">
                <p className="font-bold">Garantía Hipotecaria presentada:</p>
                <p className="mt-0.5">
                  Tasación de <strong className="font-mono">{reviewLoan.collateral.appraisalValue.toLocaleString('es-ES')} €</strong>. El importe solicitado es de {reviewLoan.requestedAmount.toLocaleString('es-ES')} €.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Importe Concedido (€)
                </label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Tipo de Interés Anual (%)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Plazo (Meses)
                  </label>
                  <input
                    type="number"
                    value={editTerm}
                    onChange={(e) => setEditTerm(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Notas / Justificación del Profesor
                </label>
                <textarea
                  rows={3}
                  value={teacherNotes}
                  onChange={(e) => setTeacherNotes(e.target.value)}
                  placeholder="Instrucciones o motivos del ajuste para el alumno..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleReviewSubmit('deny')}
                  className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold rounded-xl transition cursor-pointer"
                >
                  Denegar Préstamo
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleReviewSubmit('approve')}
                  className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl transition cursor-pointer flex items-center space-x-1"
                >
                  <span>Aprobar y Enviar Oferta</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* AMORTIZATION TABLE MODAL */}
      {selectedLoanForTable && (
        <LoanAmortizationTable
          loan={selectedLoanForTable}
          onClose={() => setSelectedLoanForTable(null)}
        />
      )}

    </div>
  );
}
