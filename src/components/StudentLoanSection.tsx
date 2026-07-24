/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Building2, Landmark, Calculator, AlertCircle, CheckCircle2, Clock, 
  ChevronRight, Shield, FileText, ArrowUpRight, HelpCircle, Sparkles, Check, X, Receipt, XCircle
} from 'lucide-react';
import { User, BankLoan, PropertyAcquisition } from '../types.js';
import LoanAmortizationTable from './LoanAmortizationTable.js';
import DocumentViewerModal, { DocumentViewerData } from './DocumentViewerModal.js';

interface StudentLoanSectionProps {
  currentUser: User;
  onBalanceUpdated?: (newBalance: number) => void;
}

export default function StudentLoanSection({ currentUser, onBalanceUpdated }: StudentLoanSectionProps) {
  const [loans, setLoans] = useState<BankLoan[]>([]);
  const [acquisitions, setAcquisitions] = useState<PropertyAcquisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoanForTable, setSelectedLoanForTable] = useState<BankLoan | null>(null);
  const [activeDocumentModal, setActiveDocumentModal] = useState<DocumentViewerData | null>(null);

  // Form State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestedAmount, setRequestedAmount] = useState('50000');
  const [termMonths, setTermMonths] = useState('36');
  const [collateralType, setCollateralType] = useState<'property' | 'private_residence'>('property');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [surfaceM2, setSurfaceM2] = useState('120');
  const [appraisalValue, setAppraisalValue] = useState('100000');

  // Request status state
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => {
    fetchLoansAndAcquisitions();
  }, []);

  const fetchLoansAndAcquisitions = async () => {
    setLoading(true);
    try {
      // 1. Fetch Student Loans
      const loansRes = await fetch(`/api/loans?studentId=${currentUser.id}`);
      if (loansRes.ok) {
        const loansData = await loansRes.json();
        if (loansData.success && loansData.loans) {
          setLoans(loansData.loans);
        }
      }

      // 2. Fetch Student Property Acquisitions (for collateral dropdown)
      const acqRes = await fetch(`/api/acquisitions?studentId=${currentUser.id}`);
      if (acqRes.ok) {
        const acqData = await acqRes.json();
        if (acqData.success && acqData.acquisitions) {
          const bought = acqData.acquisitions.filter((a: PropertyAcquisition) => a.operation === 'compra');
          setAcquisitions(bought);
          if (bought.length > 0 && !selectedPropertyId) {
            setSelectedPropertyId(bought[0].id);
            setAppraisalValue(String(bought[0].totalPrice));
          }
        }
      }
    } catch (err) {
      console.error('Error loading loan data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper for real-time calculations in the form
  const reqAmtNum = Number(requestedAmount) || 0;
  const termMonthsNum = Number(termMonths) || 12;
  const appraisalValNum = Number(appraisalValue) || 0;

  const maxLtvAutoApproved = Number((0.80 * appraisalValNum).toFixed(2));
  const estimatedOfferedAmount = Math.min(reqAmtNum, maxLtvAutoApproved);
  const euriborRate = 3.50;
  const spread = 1.00;
  const annualRate = euriborRate + spread; // 4.50%
  const openingFeeAmt = Number((0.001 * estimatedOfferedAmount).toFixed(2));

  // Calculate monthly payment using French method
  const monthlyRate = (annualRate / 100) / 12;
  let estimatedMonthlyPayment = 0;
  if (monthlyRate > 0 && estimatedOfferedAmount > 0) {
    estimatedMonthlyPayment = Number((estimatedOfferedAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonthsNum)) / (Math.pow(1 + monthlyRate, termMonthsNum) - 1)).toFixed(2));
  }

  const handlePropertyChange = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    const match = acquisitions.find(a => a.id === propertyId);
    if (match) {
      setAppraisalValue(String(match.totalPrice));
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');

    if (reqAmtNum <= 0) {
      setActionError('Introduce un importe solicitado válido y mayor a cero.');
      return;
    }
    if (appraisalValNum <= 0) {
      setActionError('El valor de tasación de la garantía debe ser superior a cero.');
      return;
    }
    if (collateralType === 'property' && !selectedPropertyId && acquisitions.length > 0) {
      setActionError('Debes seleccionar un inmueble de tu propiedad como garantía hipotecaria.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/loans/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          requestedAmount: reqAmtNum,
          termMonths: termMonthsNum,
          collateralType,
          propertyId: collateralType === 'property' ? selectedPropertyId : undefined,
          surfaceM2: collateralType === 'private_residence' ? Number(surfaceM2) : undefined,
          appraisalValue: appraisalValNum
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar la solicitud de préstamo.');

      setActionSuccess(data.message);
      setShowRequestModal(false);
      fetchLoansAndAcquisitions();
    } catch (err: any) {
      setActionError(err.message || 'Error de conexión.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptLoanOffer = async (loanId: string) => {
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`/api/loans/${loanId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentUser.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al formalizar el préstamo.');

      setActionSuccess(data.message);
      if (data.updatedBalance !== undefined && onBalanceUpdated) {
        onBalanceUpdated(data.updatedBalance);
      }
      fetchLoansAndAcquisitions();
    } catch (err: any) {
      setActionError(err.message || 'Error al aceptar la oferta de préstamo.');
    }
  };

  const handleRejectLoanOffer = async (loanId: string) => {
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`/api/loans/${loanId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentUser.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al rechazar el préstamo.');

      setActionSuccess(data.message);
      fetchLoansAndAcquisitions();
    } catch (err: any) {
      setActionError(err.message || 'Error al rechazar la oferta.');
    }
  };

  const activeOrPendingLoans = loans.filter(l => ['active', 'offered', 'teacher_offered', 'pending_teacher'].includes(l.status));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-8">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-100/70 rounded-xl flex items-center justify-center text-amber-800">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-slate-900 text-lg">Financiación Hipotecaria</h3>
            <p className="text-xs text-slate-500">Préstamos a tipo francés (Euribor 3,5% + 1%) y comisión de apertura del 1‰</p>
          </div>
        </div>

        <button
          onClick={() => setShowRequestModal(true)}
          className="bg-amber-800 hover:bg-amber-900 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 shadow-sm cursor-pointer"
        >
          <Calculator className="w-4 h-4" />
          <span>Solicitar Nuevo Préstamo</span>
        </button>
      </div>

      {actionError && (
        <div className="mb-4 bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="p-1 text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg text-xs font-semibold text-emerald-700 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} className="p-1 text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loans List */}
      {loading ? (
        <div className="py-8 text-center text-slate-400 text-xs">Cargando información de préstamos...</div>
      ) : loans.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">No tienes préstamos solicitados actualmente</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Puedes solicitar financiación bancaria ofreciendo como garantía hipotecaria un inmueble que hayas adquirido en el Portal Inmobiliario o tu vivienda habitual.
          </p>
          <button
            onClick={() => setShowRequestModal(true)}
            className="inline-flex items-center space-x-2 bg-amber-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-900 transition"
          >
            <span>Simular y Solicitar Préstamo</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {loans.map((loan) => {
            const isOffered = loan.status === 'offered' || loan.status === 'teacher_offered';
            const isPendingTeacher = loan.status === 'pending_teacher';
            const isActive = loan.status === 'active';
            const isPaidOff = loan.status === 'paid_off';
            const isRejected = loan.status === 'rejected' || loan.status === 'denied_teacher';

            return (
              <div 
                key={loan.id}
                className={`border rounded-2xl p-5 transition-all ${
                  isRejected
                    ? 'bg-red-50/40 border-red-200/90 shadow-2xs'
                    : isOffered 
                    ? 'bg-amber-50/50 border-amber-300 shadow-sm' 
                    : isPendingTeacher 
                    ? 'bg-slate-50 border-slate-300' 
                    : isActive 
                    ? 'bg-white border-slate-200 hover:border-amber-200 shadow-sm' 
                    : 'bg-slate-50/80 border-slate-200 opacity-75'
                }`}
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100/80 pb-4 mb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        Préstamo #{loan.id}
                      </span>
                      {isActive && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Concedido y Activo
                        </span>
                      )}
                      {isOffered && (
                        <span className="bg-amber-200 text-amber-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center animate-pulse">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Oferta del Banco Pendiente de Aceptación
                        </span>
                      )}
                      {isPendingTeacher && (
                        <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          En Revisión por el Profesor
                        </span>
                      )}
                      {isRejected && (
                        <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center border border-red-200">
                          <XCircle className="w-3 h-3 mr-1 text-red-600" />
                          {loan.status === 'denied_teacher' ? 'Rechazada por el Profesor' : 'Rechazada'}
                        </span>
                      )}
                      {isPaidOff && (
                        <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                          Amortizado Totalmente
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Garantía: <span className="font-semibold text-slate-700">
                        {loan.collateral.type === 'property' 
                          ? (loan.collateral.propertyTitle || 'Inmueble Comercial') 
                          : `Vivienda Privada (${loan.collateral.surfaceM2} m²)`}
                      </span> • Tasación: <span className="font-mono">{loan.collateral.appraisalValue.toLocaleString('es-ES')} €</span>
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setSelectedLoanForTable(loan)}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-600" />
                      <span>Tabla de Amortización</span>
                    </button>
                    <button
                      onClick={() => setActiveDocumentModal({ type: 'loan_statement', loan })}
                      className="bg-amber-900 hover:bg-amber-800 text-white px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                    >
                      <Receipt className="w-3.5 h-3.5 text-amber-300" />
                      <span>Ver Documento Bancario</span>
                    </button>
                  </div>
                </div>

                {/* Offer Action Banner */}
                {isOffered && (
                  <div className="bg-gradient-to-r from-amber-600 to-amber-800 text-white rounded-xl p-4 mb-4 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="space-y-1">
                      <p className="font-bold text-sm">¡El banco te ofrece {loan.offeredAmount.toLocaleString('es-ES')} €!</p>
                      <p className="text-xs text-amber-100">
                        Cuota mensual: <strong className="font-mono text-white">{loan.monthlyPayment.toLocaleString('es-ES')} €</strong> • TIN: <strong className="font-mono text-white">{loan.annualInterestRate}%</strong> • Comisión apertura (1‰): <strong className="font-mono text-white">{loan.openingFee.toLocaleString('es-ES')} €</strong>
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => handleRejectLoanOffer(loan.id)}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-lg transition cursor-pointer"
                      >
                        Rechazar
                      </button>
                      <button
                        onClick={() => handleAcceptLoanOffer(loan.id)}
                        className="px-4 py-2 bg-white text-amber-900 hover:bg-amber-50 font-bold text-xs rounded-lg transition shadow cursor-pointer flex items-center space-x-1"
                      >
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Aceptar e Ingresar Dinero</span>
                      </button>
                    </div>
                  </div>
                )}

                {isPendingTeacher && (
                  <div className="bg-sky-50 border border-sky-200 text-sky-800 rounded-xl p-3 mb-4 text-xs">
                    <p className="font-semibold">
                      ℹ️ Solicitud enviada a revisión del Profesor.
                    </p>
                    <p className="text-sky-700 mt-0.5">
                      Al tener ya concedido un primer préstamo, esta operación requiere autorización manual desde el panel del docente.
                    </p>
                  </div>
                )}

                {isRejected && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 mb-4 text-xs">
                    <p className="font-bold flex items-center gap-1.5 text-red-900">
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span>Solicitud de Préstamo Rechazada</span>
                    </p>
                    <p className="text-red-700 mt-0.5">
                      {loan.rejectionReason || (loan.status === 'denied_teacher' 
                        ? 'Operación denegada por el docente tras la evaluación de riesgos del alumno.' 
                        : 'La oferta de préstamo fue denegada o rechazada.')}
                    </p>
                  </div>
                )}

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-sans">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Capital Ofrecido / Concedido</span>
                    <span className="text-sm font-bold font-mono text-slate-900">
                      {(loan.approvedAmount || loan.offeredAmount).toLocaleString('es-ES')} €
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Cuota Mensual</span>
                    <span className="text-sm font-bold font-mono text-amber-800">
                      {loan.monthlyPayment.toLocaleString('es-ES')} € / mes
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Tipo de Interés Anual</span>
                    <span className="text-sm font-bold font-mono text-emerald-700">
                      {loan.annualInterestRate.toFixed(2)} % <span className="text-[9px] text-slate-400 font-normal">(Euribor + 1%)</span>
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Comisión Apertura (1‰)</span>
                    <span className="text-sm font-bold font-mono text-slate-700">
                      {loan.openingFee.toLocaleString('es-ES')} €
                    </span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* REQUEST MODAL */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="bg-gradient-to-r from-amber-800 to-amber-900 text-white p-6 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold font-display">Solicitud de Préstamo Hipotecario</h3>
                <p className="text-xs text-amber-200">Condiciones de mercado fijadas por el banco simulado</p>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} className="p-6 space-y-5 text-xs">
              
              {/* Requested Amount & Term */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Importe Solicitado (€)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={requestedAmount}
                    onChange={(e) => setRequestedAmount(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-sm font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Plazo de Devolución
                  </label>
                  <select
                    value={termMonths}
                    onChange={(e) => setTermMonths(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold text-slate-800 bg-white"
                  >
                    <option value="12">12 meses (1 año)</option>
                    <option value="24">24 meses (2 años)</option>
                    <option value="36">36 meses (3 años)</option>
                    <option value="48">48 meses (4 años)</option>
                    <option value="60">60 meses (5 años)</option>
                    <option value="120">120 meses (10 años)</option>
                    <option value="180">180 meses (15 años)</option>
                  </select>
                </div>
              </div>

              {/* Collateral Guarantee Selector */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Garantía Hipotecaria de Respaldado
                </label>
                
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCollateralType('property')}
                    className={`p-3 rounded-xl border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                      collateralType === 'property' 
                        ? 'border-amber-600 bg-amber-50/60 ring-2 ring-amber-500/20 text-amber-900 font-bold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 font-medium'
                    }`}
                  >
                    <Building2 className="w-4 h-4 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-xs">Inmueble del Portal</p>
                      <p className="text-[10px] text-slate-500 font-normal">Nave, local o almacén comprado</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCollateralType('private_residence')}
                    className={`p-3 rounded-xl border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                      collateralType === 'private_residence' 
                        ? 'border-amber-600 bg-amber-50/60 ring-2 ring-amber-500/20 text-amber-900 font-bold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600 font-medium'
                    }`}
                  >
                    <Shield className="w-4 h-4 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-xs">Casa / Vivienda Privada</p>
                      <p className="text-[10px] text-slate-500 font-normal">Vivienda habitual particular</p>
                    </div>
                  </button>
                </div>

                {collateralType === 'property' ? (
                  acquisitions.length > 0 ? (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Selecciona el Inmueble de tu propiedad
                      </label>
                      <select
                        value={selectedPropertyId}
                        onChange={(e) => handlePropertyChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-800 bg-white"
                      >
                        {acquisitions.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.propertyTitle} ({a.surfaceM2} m²) - Tasación: {a.totalPrice.toLocaleString('es-ES')} €
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-[11px] text-amber-800">
                      ⚠️ No tienes inmuebles comprados aún en el Portal Inmobiliario. Si utilizas esta opción, introduce la tasación o selecciona Vivienda Privada.
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Superficie Vivienda (m²)
                      </label>
                      <input
                        type="number"
                        min="20"
                        value={surfaceM2}
                        onChange={(e) => setSurfaceM2(e.target.value)}
                        required
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Valor de Tasación (€)
                      </label>
                      <input
                        type="number"
                        min="10000"
                        step="5000"
                        value={appraisalValue}
                        onChange={(e) => setAppraisalValue(e.target.value)}
                        required
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono text-xs font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Live Bank Breakdown Box */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2 font-mono">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-[11px] text-slate-400 font-sans">Límite Máximo Aprobado (80% Tasación):</span>
                  <span className="font-bold text-amber-300">{maxLtvAutoApproved.toLocaleString('es-ES')} €</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-[11px] text-slate-400 font-sans">Importe a Conceder:</span>
                  <span className="font-bold text-emerald-400">{estimatedOfferedAmount.toLocaleString('es-ES')} €</span>
                </div>
                <div className="flex justify-between items-center text-[11px] border-b border-slate-800 pb-2">
                  <span className="text-slate-400 font-sans">Interés Anual (Euribor 3,5% + 1%):</span>
                  <span className="text-amber-200">4,50 % TIN</span>
                </div>
                <div className="flex justify-between items-center text-[11px] border-b border-slate-800 pb-2">
                  <span className="text-slate-400 font-sans">Comisión Bancaria de Apertura (1‰):</span>
                  <span className="text-rose-300">{openingFeeAmt.toLocaleString('es-ES')} €</span>
                </div>
                <div className="flex justify-between items-center pt-1 text-xs">
                  <span className="font-sans font-bold text-slate-200">Cuota Mensual Estimada (Francés):</span>
                  <span className="font-extrabold text-amber-400 text-sm">{estimatedMonthlyPayment.toLocaleString('es-ES')} € / mes</span>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white font-bold rounded-xl transition cursor-pointer flex items-center space-x-2"
                >
                  {submitting ? 'Procesando...' : 'Enviar Solicitud al Banco'}
                </button>
              </div>

            </form>

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

      {/* BANK DOCUMENT VIEWER MODAL */}
      {activeDocumentModal && (
        <DocumentViewerModal
          data={activeDocumentModal}
          onClose={() => setActiveDocumentModal(null)}
        />
      )}

    </div>
  );
}
