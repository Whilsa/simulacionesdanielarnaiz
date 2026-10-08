/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Landmark, ArrowUpRight, ArrowDownLeft, Send, Copy, Check, 
  Search, LogOut, Clock, Coins, Wallet, Info, CheckCircle2, AlertCircle, FileText, Sparkles
} from 'lucide-react';
import { User, Transfer, BankLoan } from '../types.js';
import { formatNumber } from '../lib/formatters.js';
import StudentLoanSection from './StudentLoanSection.js';
import UpcomingPaymentsSection from './UpcomingPaymentsSection.js';
import DocumentViewerModal from './DocumentViewerModal.js';
import Footer from './Footer.js';

interface StudentDashboardProps {
  currentUser: User;
  onLogout: () => void;
  onBackToHub?: () => void;
}

export default function StudentDashboard({ currentUser, onLogout, onBackToHub }: StudentDashboardProps) {
  const [balance, setBalance] = useState(currentUser.balance);
  const [bankTab, setBankTab] = useState<'operaciones' | 'vencimientos' | 'hipotecaria'>('operaciones');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [studentsList, setStudentsList] = useState<User[]>([]);
  const [copied, setCopied] = useState(false);
  const [selectedExtractTx, setSelectedExtractTx] = useState<Transfer | null>(null);

  // Listado de movimientos ordenados cronológicamente con saldo acumulado resultante
  const movementsWithBalance = useMemo(() => {
    if (!transfers || transfers.length === 0) return [];

    // 1. Orden cronológico determinista y estable:
    // Criterio 1: Del movimiento más antiguo al más reciente (fecha/hora ascendente).
    // Criterio 2: Si dos movimientos tienen exactamente la misma fecha/hora, desempate determinista por ID.
    const sorted = [...transfers].sort((a, b) => {
      const timeA = new Date(a.timestamp || (a as any).fecha || (a as any).date || 0).getTime();
      const timeB = new Date(b.timestamp || (b as any).fecha || (b as any).date || 0).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    // 2. Determinación del efecto económico real del movimiento:
    // Un gasto/cargo (transferencia emitida, compra, pago factura) disminuye el saldo (-).
    // Un ingreso/abono (transferencia recibida, venta, apertura, préstamo concedido) aumenta el saldo (+).
    const getMovementDelta = (tx: Transfer): { isOutbound: boolean; delta: number } => {
      const amt = Number(tx.amount || 0);
      const txType = (tx as any).type;
      if (txType === 'TRANSFER_OUT') {
        return { isOutbound: true, delta: -amt };
      }
      if (txType === 'TRANSFER_IN' || txType === 'DEPOSIT') {
        return { isOutbound: false, delta: amt };
      }
      const isOut = tx.senderId === currentUser.id || tx.senderAccount === currentUser.accountNumber;
      return { isOutbound: isOut, delta: isOut ? -amt : amt };
    };

    // 3. Obtener el saldo anterior al primer movimiento:
    // saldo_actual = saldo_anterior_al_primer_movimiento + suma(efectos_económicos)
    // saldo_anterior_al_primer_movimiento = saldo_actual - suma(efectos_económicos)
    const currentBalance = typeof balance === 'number' ? balance : Number(currentUser.balance || 0);

    let totalDelta = 0;
    for (const tx of sorted) {
      const { delta } = getMovementDelta(tx);
      totalDelta += delta;
    }

    const initialBalance = Math.round((currentBalance - totalDelta) * 100) / 100;

    // 4. Aplicar cada movimiento sucesivamente:
    // saldo después = saldo anterior + efecto económico del movimiento
    // Cada fila muestra el saldo resultante real acumulado SIN forzar artificialmente el último movimiento.
    let runningBalance = initialBalance;
    return sorted.map((tx) => {
      const { isOutbound, delta } = getMovementDelta(tx);
      runningBalance = Math.round((runningBalance + delta) * 100) / 100;

      return {
        ...tx,
        isOutbound,
        resultingBalance: runningBalance
      };
    });
  }, [transfers, balance, currentUser.id, currentUser.accountNumber, currentUser.balance]);

  // New Transfer Form State
  const [customIBAN, setCustomIBAN] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferConcept, setTransferConcept] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment Status Summary State
  const [paymentStatus, setPaymentStatus] = useState<{
    isBlocked: boolean;
    totalOverdueAmount: number;
    totalUpcoming30DaysAmount: number;
    upcomingCount: number;
    overdueCount: number;
    insufficientProjectedBalance: boolean;
    projected30DaysTotal: number;
  } | null>(null);

  // Pending Loan Offer State
  const [pendingLoanOffer, setPendingLoanOffer] = useState<BankLoan | null>(null);
  const [loanOfferActionError, setLoanOfferActionError] = useState('');
  const [loanOfferActionSuccess, setLoanOfferActionSuccess] = useState('');
  const [isProcessingLoanOffer, setIsProcessingLoanOffer] = useState(false);

  // Change Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');
    if (!newPassInput || newPassInput.trim().length < 1) {
      setPassError('Escribe una nueva contraseña');
      return;
    }

    setIsChangingPass(true);
    try {
      const res = await fetch('/api/student/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          currentPassword: currentPassInput,
          newPassword: newPassInput
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setPassError(data.error || 'Error al cambiar la contraseña');
      } else {
        setPassSuccess('¡Contraseña actualizada con éxito!');
        setCurrentPassInput('');
        setNewPassInput('');
        setTimeout(() => {
          setShowPasswordModal(false);
          setPassSuccess('');
        }, 1500);
      }
    } catch (err) {
      setPassError('Error de conexión al cambiar la contraseña');
    } finally {
      setIsChangingPass(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
    // Poll balance and transactions every 4 seconds to allow interactive double-entry real-time feedback in the classroom!
    const interval = setInterval(fetchStudentData, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchStudentData = async () => {
    try {
      // 1. Get student's updated user details (for real-time balance)
      const usersRes = await fetch('/api/users?role=student');
      if (!usersRes.ok) throw new Error(`HTTP error ${usersRes.status}`);
      
      const usersContentType = usersRes.headers.get('content-type');
      if (usersContentType && usersContentType.includes('application/json')) {
        const usersData = await usersRes.json();
        if (usersData && usersData.users) {
          const me = usersData.users.find((u: User) => u.id === currentUser.id);
          if (me) {
            setBalance(me.balance);
          } else {
            // Account was deleted by teacher, log out immediately
            onLogout();
            return;
          }

          // Filter out self from classmates list
          const classmates = usersData.users.filter((u: User) => u.id !== currentUser.id);
          setStudentsList(classmates);
        }
      }

      // 2. Get student's transfers
      const transfersRes = await fetch(`/api/transfers?userId=${currentUser.id}`);
      if (transfersRes.ok) {
        const transfersContentType = transfersRes.headers.get('content-type');
        if (transfersContentType && transfersContentType.includes('application/json')) {
          const transfersData = await transfersRes.json();
          if (transfersData && transfersData.transfers) {
            setTransfers(transfersData.transfers);
          }
        }
      }

      // 3. Get student's upcoming automatic payments status
      const paymentsRes = await fetch(`/api/student/upcoming-payments?studentId=${currentUser.id}`);
      if (paymentsRes.ok) {
        const pData = await paymentsRes.json();
        if (pData.success) {
          setPaymentStatus({
            isBlocked: pData.isBlocked,
            totalOverdueAmount: pData.totalOverdueAmount,
            totalUpcoming30DaysAmount: pData.totalUpcoming30DaysAmount,
            upcomingCount: pData.upcoming30DaysItems ? pData.upcoming30DaysItems.length : 0,
            overdueCount: pData.overdueItems ? pData.overdueItems.length : 0,
            insufficientProjectedBalance: pData.insufficientProjectedBalance,
            projected30DaysTotal: pData.projected30DaysTotal
          });
        }
      }
      // 4. Get student's loans to detect any pending offers directly from PostgreSQL canonical state
      const targetStudentId = currentUser.id || currentUser.username;
      const loansRes = await fetch(`/api/loans?studentId=${encodeURIComponent(targetStudentId)}`);
      if (loansRes.ok) {
        const loansData = await loansRes.json();
        if (loansData && loansData.success && Array.isArray(loansData.loans)) {
          const offer = loansData.loans.find((l: BankLoan) => l.status === 'offered' || l.status === 'teacher_offered');
          setPendingLoanOffer(offer || null);
        }
      }
    } catch (err) {
      console.error('Error polling student data:', err);
    }
  };

  const handleAcceptTopOffer = async (loanId: string) => {
    setLoanOfferActionError('');
    setLoanOfferActionSuccess('');
    setIsProcessingLoanOffer(true);
    try {
      const targetStudentId = currentUser.id || currentUser.username;
      const res = await fetch(`/api/loans/${loanId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: targetStudentId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al formalizar el préstamo.');

      setLoanOfferActionSuccess(data.message);
      if (data.updatedBalance !== undefined) {
        setBalance(data.updatedBalance);
      }
      setPendingLoanOffer(null);
      await fetchStudentData();
    } catch (err: any) {
      setLoanOfferActionError(err.message || 'Error al aceptar la oferta de préstamo.');
    } finally {
      setIsProcessingLoanOffer(false);
    }
  };

  const handleRejectTopOffer = async (loanId: string) => {
    setLoanOfferActionError('');
    setLoanOfferActionSuccess('');
    setIsProcessingLoanOffer(true);
    try {
      const targetStudentId = currentUser.id || currentUser.username;
      const res = await fetch(`/api/loans/${loanId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: targetStudentId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al rechazar el préstamo.');

      setLoanOfferActionSuccess(data.message);
      setPendingLoanOffer(null);
      await fetchStudentData();
    } catch (err: any) {
      setLoanOfferActionError(err.message || 'Error al rechazar la oferta.');
    } finally {
      setIsProcessingLoanOffer(false);
    }
  };

  const handleCopyIBAN = () => {
    navigator.clipboard.writeText(currentUser.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError('');
    setTransferSuccess('');

    if (!customIBAN.trim()) {
      setTransferError('Por favor, introduce el número de cuenta o IBAN de tu compañero.');
      return;
    }

    // Find classmate with entered IBAN
    const match = studentsList.find(s => s.accountNumber.replace(/\s+/g, '').toLowerCase() === customIBAN.replace(/\s+/g, '').toLowerCase());
    if (!match) {
      setTransferError('No se encontró ningún alumno con el número de cuenta / IBAN introducido. Asegúrate de pedirle el IBAN correcto a tu compañero.');
      return;
    }
    const recipientId = match.id;

    if (!transferAmount || isNaN(Number(transferAmount)) || Number(transferAmount) <= 0) {
      setTransferError('El importe debe ser una cantidad válida y mayor a cero.');
      return;
    }

    const amountNum = Number(transferAmount);
    if (amountNum > balance) {
      setTransferError('Saldo insuficiente para realizar esta transferencia.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: recipientId,
          amount: amountNum,
          concept: transferConcept
        }),
      });

      let data: any = {};
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.error('Failed to parse JSON response', jsonErr);
        }
      }

      if (!response.ok) {
        throw new Error(data.error || `Error al procesar la transferencia (HTTP ${response.status})`);
      }

      // Success
      setTransferSuccess('¡Transferencia realizada con éxito!');
      setBalance(data.senderBalance);
      setTransferAmount('');
      setTransferConcept('');
      setCustomIBAN('');
      
      fetchStudentData();
      setTimeout(() => setTransferSuccess(''), 4000);
    } catch (err: any) {
      setTransferError(err.message || 'Error de red al realizar la operación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      {/* Header Bar */}
      <header className="bg-amber-900 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              {onBackToHub && (
                <button
                  onClick={onBackToHub}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition cursor-pointer border border-white/10"
                  title="Volver al menú principal"
                >
                  <ArrowDownLeft className="w-4 h-4 transform rotate-45" />
                </button>
              )}
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/10">
                <Landmark className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <span className="font-display font-bold text-lg tracking-tight block">ContaLab</span>
                <span className="text-[10px] text-amber-200 font-semibold tracking-wider uppercase">Banco simulado • Alumno</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold">{currentUser.name}</p>
                <p className="text-xs text-amber-200">Titular de la cuenta</p>
              </div>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center space-x-1.5 bg-amber-800/80 hover:bg-amber-700/80 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer border border-amber-600/50"
                title="Cambiar contraseña"
              >
                <span>Clave</span>
              </button>
              <button 
                onClick={onLogout}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer border border-white/10"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Welcome Banner */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display text-slate-900">Hola, {currentUser.name}</h1>
            <p className="text-sm text-slate-500">Usa este portal bancario ficticio para tus ejercicios de contabilidad y transacciones de clase.</p>
          </div>
        </div>

        {/* PROMINENT TOP AUTOMATIC PAYMENTS NOTIFICATION BANNER */}
        {paymentStatus && paymentStatus.isBlocked && (
          <div className="mb-8 bg-rose-600 text-white p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-2 border-rose-700 animate-in fade-in">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-white/20 rounded-xl shrink-0">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>⛔ Salidas de dinero bloqueadas por mora</span>
                  <span className="text-xs bg-white text-rose-900 px-2.5 py-0.5 rounded-full font-mono font-extrabold">
                    5% int. demora
                  </span>
                </h3>
                <p className="text-xs text-rose-100 mt-1 leading-relaxed">
                  Tienes <strong>{formatNumber(paymentStatus.totalOverdueAmount)} €</strong> en vencimientos impagados acumulados. Tu cuenta no permite saldo negativo. Las transferencias y compras manuales están bloqueadas.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* PROMINENT LOAN OFFER BANNER (IMMEDIATE VISIBILITY FOR STUDENT) */}
        {pendingLoanOffer && (
          <div className="mb-8 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-900 text-white p-5 rounded-2xl shadow-lg border-2 border-amber-400 animate-in fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2">
                  <span className="bg-amber-300 text-amber-950 font-black text-[10px] uppercase px-2.5 py-0.5 rounded-full flex items-center shadow-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Oferta de préstamo concedida pendiente de aceptación
                  </span>
                  <span className="font-mono text-xs text-amber-200">Ref: #{pendingLoanOffer.id}</span>
                </div>
                <h3 className="font-display font-bold text-xl text-white">
                  ¡El banco te ofrece {formatNumber(pendingLoanOffer.offeredAmount)} €!
                </h3>
                <p className="text-xs text-amber-100 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Cuota mensual: <strong className="font-mono text-white">{formatNumber(pendingLoanOffer.monthlyPayment)} €</strong></span>
                  <span>•</span>
                  <span>Plazo: <strong className="text-white">{pendingLoanOffer.termMonths} meses</strong></span>
                  <span>•</span>
                  <span>TIN: <strong className="font-mono text-white">{pendingLoanOffer.annualInterestRate}%</strong></span>
                  <span>•</span>
                  <span>Comisión apertura (1‰): <strong className="font-mono text-white">{formatNumber(pendingLoanOffer.openingFee)} €</strong></span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
                <button
                  onClick={() => setBankTab('hipotecaria')}
                  className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center space-x-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-300" />
                  <span>Ver amortización</span>
                </button>
                <button
                  disabled={isProcessingLoanOffer}
                  onClick={() => handleRejectTopOffer(pendingLoanOffer.id)}
                  className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-400/30 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Rechazar
                </button>
                <button
                  disabled={isProcessingLoanOffer}
                  onClick={() => handleAcceptTopOffer(pendingLoanOffer.id)}
                  className="px-4 py-2 bg-white text-amber-950 hover:bg-amber-50 font-black text-xs rounded-xl transition shadow-md cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4 text-emerald-600 font-bold" />
                  <span>Aceptar e ingresar dinero</span>
                </button>
              </div>
            </div>

            {loanOfferActionError && (
              <div className="mt-3 p-2 bg-rose-900/60 border border-rose-400 text-rose-100 text-xs rounded-lg font-medium">
                {loanOfferActionError}
              </div>
            )}
            {loanOfferActionSuccess && (
              <div className="mt-3 p-2 bg-emerald-900/60 border border-emerald-400 text-emerald-100 text-xs rounded-lg font-medium">
                {loanOfferActionSuccess}
              </div>
            )}
          </div>
        )}

        {/* Top Card: Balance & Account Details */}
        <div className="mb-8">
          
          {/* Balance card */}
          <div className="bg-gradient-to-br from-amber-600 to-amber-800 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full filter blur-2xl -z-10"></div>
            
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-200 uppercase tracking-widest flex items-center">
                  <Wallet className="w-3.5 h-3.5 mr-1.5" />
                  Saldo disponible total
                </p>
                <h2 className="text-4xl sm:text-5xl font-extrabold font-display tracking-tight font-mono">
                  {formatNumber(balance)} <span className="text-2xl font-semibold">€</span>
                </h2>
              </div>
              <span className="bg-white/10 border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-amber-100 flex items-center">
                <Coins className="w-3 h-3 mr-1" />
                Simulado
              </span>
            </div>

            <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <p className="text-amber-200 font-medium">Titular de la cuenta:</p>
                <p className="font-semibold text-white">{currentUser.name}</p>
              </div>
              <div className="flex items-center space-x-2">
                <div className="bg-white/10 p-2 rounded-xl text-left">
                  <p className="text-amber-200 font-medium text-[10px] uppercase">Tu IBAN de alumno:</p>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="font-mono text-white font-semibold">{currentUser.accountNumber}</span>
                    <button 
                      onClick={handleCopyIBAN}
                      className="p-1 rounded bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                      title="Copiar IBAN"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Navigation Tabs for Bank Modules */}
        <div className="flex items-center space-x-2 border-b border-slate-200 mb-6 overflow-x-auto pb-1">
          <button
            onClick={() => setBankTab('operaciones')}
            className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              bankTab === 'operaciones'
                ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Send className="w-4 h-4 text-amber-500" />
            <span>Operaciones y transferencias</span>
          </button>

          <button
            onClick={() => setBankTab('vencimientos')}
            className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              bankTab === 'vencimientos'
                ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Próximos vencimientos programados</span>
            {paymentStatus && paymentStatus.upcomingCount > 0 && (
              <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full text-[10px] font-bold">
                {paymentStatus.upcomingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setBankTab('hipotecaria')}
            className={`pb-3 px-4 text-xs font-extrabold border-b-2 transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              bankTab === 'hipotecaria'
                ? 'border-amber-600 text-amber-700 bg-amber-50/50 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Landmark className="w-4 h-4 text-amber-500" />
            <span>Financiación hipotecaria</span>
            {pendingLoanOffer && (
              <span className="bg-amber-600 text-white px-2 py-0.5 rounded-full text-[10px] font-extrabold animate-pulse shadow-xs">
                Oferta disponible
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: PRÓXIMOS VENCIMIENTOS PROGRAMADOS */}
        {bankTab === 'vencimientos' && (
          <UpcomingPaymentsSection 
            currentUser={currentUser} 
          />
        )}

        {/* TAB 2: FINANCIACIÓN HIPOTECARIA */}
        {bankTab === 'hipotecaria' && (
          <StudentLoanSection 
            currentUser={currentUser} 
            onBalanceUpdated={(newBal) => setBalance(newBal)} 
            onLoansUpdated={fetchStudentData}
          />
        )}

        {/* TAB 3: OPERACIONES Y TRANSFERENCIAS */}
        {bankTab === 'operaciones' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            
            {/* MAKE TRANSFER PANEL */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 self-start">
              <div className="flex items-center space-x-2.5 mb-6">
                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                  <Send className="w-4 h-4" />
                </div>
                <h3 className="font-display font-bold text-slate-900 text-base">Emitir transferencia</h3>
              </div>

              <form onSubmit={handleTransferSubmit} className="space-y-4">
                {transferError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{transferError}</span>
                  </div>
                )}
                {transferSuccess && (
                  <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg text-xs font-semibold text-emerald-700 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{transferSuccess}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="recipient-iban" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Número de cuenta / IBAN del destinatario
                  </label>
                  <input
                    id="recipient-iban"
                    type="text"
                    required
                    value={customIBAN}
                    onChange={(e) => setCustomIBAN(e.target.value)}
                    placeholder="Ej. ES001234..."
                    className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-slate-900"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400 italic">
                    Para transferir saldo, pídele el IBAN completo a tu compañero de clase.
                  </p>
                </div>

                <div>
                  <label htmlFor="amount" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Importe (€)
                  </label>
                  <div className="relative rounded-xl">
                    <input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="0.00"
                      className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 font-mono text-sm">
                      €
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="concept" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Concepto contable
                  </label>
                  <input
                    id="concept"
                    type="text"
                    required
                    value={transferConcept}
                    onChange={(e) => setTransferConcept(e.target.value)}
                    placeholder="Ej. Factura F-01, pago de materiales"
                    className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-all shadow-md shadow-amber-100 cursor-pointer"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span className="flex items-center">
                      Emitir pago <Send className="w-4 h-4 ml-2" />
                    </span>
                  )}
                </button>
              </form>
            </div>

            {/* HISTORIAL DE TRANSFERENCIAS PANEL */}
            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <Clock className="w-4 h-4" />
                  </div>
                  <h3 className="font-display font-bold text-slate-900 text-base">Historial de movimientos</h3>
                </div>
                {movementsWithBalance.length > 0 && (
                  <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    {movementsWithBalance.length} {movementsWithBalance.length === 1 ? 'movimiento' : 'movimientos'}
                  </span>
                )}
              </div>

              {movementsWithBalance.length === 0 ? (
                <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">
                  <Coins className="w-12 h-12 mx-auto mb-3 opacity-20 text-slate-500" />
                  <p className="font-semibold text-slate-600">Aún no hay movimientos registrados</p>
                  <p className="text-xs text-slate-400 mt-1">Realiza pagos a tus compañeros o espera recibir fondos de ellos para ver tu historial.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
                  <AnimatePresence initial={false}>
                    {movementsWithBalance.map((tx, idx) => {
                      const isOutbound = tx.isOutbound;
                      const counterpartName = isOutbound ? tx.receiverName : tx.senderName;
                      const counterpartAccount = isOutbound ? tx.receiverAccount : tx.senderAccount;

                      return (
                        <motion.div
                          key={`${tx.id}-${idx}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isOutbound ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {isOutbound ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-900 truncate font-display">
                                {isOutbound ? `Transferencia enviada a ${counterpartName}` : `Transferencia recibida de ${counterpartName}`}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono truncate tracking-tight">{counterpartAccount}</p>
                              <p className="text-xs text-slate-400 mt-1 flex items-center flex-wrap gap-y-0.5">
                                <span className="italic truncate font-medium text-slate-600">"{tx.concept}"</span>
                                <span className="mx-1.5 text-slate-300">•</span>
                                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                  {new Date(tx.timestamp).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-3 sm:gap-4 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
                            <div className="text-right min-w-[85px] sm:min-w-[95px]">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Importe</span>
                              <p className={`text-sm sm:text-base font-bold font-mono ${
                                isOutbound ? 'text-rose-600' : 'text-emerald-600'
                              }`}>
                                {isOutbound ? '-' : '+'}{formatNumber(tx.amount)} €
                              </p>
                            </div>

                            <div className="text-right min-w-[90px] sm:min-w-[100px] pl-3 border-l border-slate-200/80">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Saldo</span>
                              <p className="text-sm sm:text-base font-bold font-mono text-slate-800">
                                {formatNumber(tx.resultingBalance)} €
                              </p>
                            </div>

                            <div className="pl-1">
                              <button
                                onClick={() => setSelectedExtractTx(tx)}
                                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded border border-indigo-200 transition cursor-pointer inline-flex items-center gap-1 shrink-0"
                                title="Descargar extracto bancario"
                              >
                                <FileText className="w-3 h-3 text-indigo-600" />
                                <span className="hidden sm:inline">Extracto</span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* DOCUMENT VIEWER MODAL FOR EXTRACTS */}
      {selectedExtractTx && (
        <DocumentViewerModal
          data={{
            type: 'transfer_statement',
            transfer: selectedExtractTx
          }}
          onClose={() => setSelectedExtractTx(null)}
        />
      )}

      {/* CHANGE PASSWORD MODAL */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Cambiar mi contraseña</h3>
            <p className="text-xs text-slate-500 mb-4">Actualiza la contraseña de acceso a tu cuenta bancaria y de alumno.</p>

            {passError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 mb-3 font-semibold">
                {passError}
              </div>
            )}

            {passSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 mb-3 font-semibold">
                {passSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña actual (opcional)</label>
                <input
                  type="password"
                  value={currentPassInput}
                  onChange={e => setCurrentPassInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                  placeholder="Tu clave actual"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nueva contraseña (*)</label>
                <input
                  type="password"
                  required
                  value={newPassInput}
                  onChange={e => setNewPassInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-amber-500"
                  placeholder="Escribe tu nueva contraseña personal"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPassError('');
                    setPassSuccess('');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isChangingPass ? 'Guardando...' : 'Guardar nueva contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
