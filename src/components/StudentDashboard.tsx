/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Landmark, ArrowUpRight, ArrowDownLeft, Send, Copy, Check, 
  Search, LogOut, Clock, Coins, Wallet, Info, CheckCircle2, AlertCircle
} from 'lucide-react';
import { User, Transfer } from '../types.js';
import StudentLoanSection from './StudentLoanSection.js';
import UpcomingPaymentsSection from './UpcomingPaymentsSection.js';
import Footer from './Footer.js';

interface StudentDashboardProps {
  currentUser: User;
  onLogout: () => void;
  onBackToHub?: () => void;
}

export default function StudentDashboard({ currentUser, onLogout, onBackToHub }: StudentDashboardProps) {
  const [balance, setBalance] = useState(currentUser.balance);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [studentsList, setStudentsList] = useState<User[]>([]);
  const [copied, setCopied] = useState(false);

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

  useEffect(() => {
    fetchStudentData();
    // Poll balance and transactions every 4 seconds to allow interactive double-entry real-time feedback in the classroom!
    const interval = setInterval(fetchStudentData, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchStudentData = async () => {
    try {
      // 1. Get student's updated user details (for real-time balance)
      const usersRes = await fetch('/users?role=student');
      if (!usersRes.ok) throw new Error(`HTTP error ${usersRes.status}`);
      
      const usersContentType = usersRes.headers.get('content-type');
      if (usersContentType && usersContentType.includes('application/json')) {
        const usersData = await usersRes.json();
        if (usersData && usersData.users) {
          const me = usersData.users.find((u: User) => u.id === currentUser.id);
          if (me) {
            setBalance(me.balance);
          }

          // Filter out self from classmates list
          const classmates = usersData.users.filter((u: User) => u.id !== currentUser.id);
          setStudentsList(classmates);
        }
      }

      // 2. Get student's transfers
      const transfersRes = await fetch(`/transfers?userId=${currentUser.id}`);
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
    } catch (err) {
      console.error('Error polling student data:', err);
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
      const response = await fetch('/transfers', {
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
                  title="Volver al Menú Principal"
                >
                  <ArrowDownLeft className="w-4 h-4 transform rotate-45" />
                </button>
              )}
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/10">
                <Landmark className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <span className="font-display font-bold text-lg tracking-tight block">Simulador de Daniel Arnaiz Boluda</span>
                <span className="text-[10px] text-amber-200 font-semibold tracking-wider uppercase">Banco Simulado • Alumno</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold">{currentUser.name}</p>
                <p className="text-xs text-amber-200">Cliente de Simulación</p>
              </div>
              <button 
                onClick={onLogout}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer border border-white/10"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
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
                  <span>⛔ Salidas de Dinero Bloqueadas por Mora</span>
                  <span className="text-xs bg-white text-rose-900 px-2.5 py-0.5 rounded-full font-mono font-extrabold">
                    5% Int. Demora
                  </span>
                </h3>
                <p className="text-xs text-rose-100 mt-1 leading-relaxed">
                  Tienes <strong>{paymentStatus.totalOverdueAmount.toLocaleString('es-ES')} €</strong> en vencimientos impagados acumulados. Tu cuenta no permite saldo negativo. Las transferencias y compras manuales están bloqueadas.
                </p>
              </div>
            </div>
          </div>
        )}

        {paymentStatus && !paymentStatus.isBlocked && paymentStatus.upcomingCount > 0 && (
          <div className="mb-8 bg-gradient-to-r from-amber-50 to-amber-100/80 border-2 border-amber-300/80 p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-950">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-sm">🔔 Aviso de Pagos Automáticos Programados (Próximos 30 días)</span>
                  <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full uppercase">
                    {paymentStatus.upcomingCount} {paymentStatus.upcomingCount === 1 ? 'cargo' : 'cargos'}
                  </span>
                </div>
                <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                  Se realizarán cobros automáticos domiciliados en tu cuenta bancaria por un total de <strong>{paymentStatus.totalUpcoming30DaysAmount.toLocaleString('es-ES')} €</strong> en los próximos 30 días. {paymentStatus.insufficientProjectedBalance ? '⚠️ Revisa tu saldo para evitar recargos del 5% de mora.' : '✅ Cuentas con saldo suficiente para cubrirlos.'}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs text-amber-800 font-medium block">Total Compromisos 30d:</span>
              <span className="text-lg font-black font-mono text-amber-950 bg-amber-200/80 px-3 py-1 rounded-xl border border-amber-300">
                {paymentStatus.totalUpcoming30DaysAmount.toLocaleString('es-ES')} €
              </span>
            </div>
          </div>
        )}

        {/* Top Cards: Balance & Account Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Balance card */}
          <div className="bg-gradient-to-br from-amber-600 to-amber-800 text-white p-6 rounded-2xl shadow-lg md:col-span-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full filter blur-2xl -z-10"></div>
            
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-200 uppercase tracking-widest flex items-center">
                  <Wallet className="w-3.5 h-3.5 mr-1.5" />
                  Saldo Disponible Total
                </p>
                <h2 className="text-4xl sm:text-5xl font-extrabold font-display tracking-tight font-mono">
                  {balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} <span className="text-2xl font-semibold">€</span>
                </h2>
              </div>
              <span className="bg-white/10 border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-amber-100 flex items-center">
                <Coins className="w-3 h-3 mr-1" />
                Simulado
              </span>
            </div>

            <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <p className="text-amber-200 font-medium">Titular de Cuenta:</p>
                <p className="font-semibold text-white">{currentUser.name}</p>
              </div>
              <div className="flex items-center space-x-2">
                <div className="bg-white/10 p-2 rounded-xl text-left">
                  <p className="text-amber-200 font-medium text-[10px] uppercase">Tu IBAN de Alumno:</p>
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

          {/* Quick Notice Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                <Info className="w-5 h-5" />
              </div>
              <h3 className="font-display font-bold text-slate-900 text-sm">Instrucciones Contables</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Cada transferencia genera una contrapartida inmutable en los libros de la contraparte. Asegúrate de registrar correctamente los cargos en tu libro diario y de compras/ventas de la clase.
              </p>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-2.5 mt-4 flex items-center space-x-2 text-[11px] text-slate-500 border border-slate-100/50">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Saldos sincronizados en tiempo real</span>
            </div>
          </div>

        </div>

        {/* Upcoming 30-Day Automatic Payments Section */}
        <UpcomingPaymentsSection 
          currentUser={currentUser} 
        />

        {/* Bank Loans Section */}
        <StudentLoanSection 
          currentUser={currentUser} 
          onBalanceUpdated={(newBal) => setBalance(newBal)} 
        />

        {/* Bottom grid: Make Transfer & Transactions List */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          
          {/* MAKE TRANSFER PANEL */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 self-start">
            <div className="flex items-center space-x-2.5 mb-6">
              <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                <Send className="w-4 h-4" />
              </div>
              <h3 className="font-display font-bold text-slate-900 text-base">Emitir Transferencia</h3>
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

              {paymentStatus && paymentStatus.totalUpcoming30DaysAmount > 0 && (
                <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/80 text-amber-900 text-[11px] font-medium space-y-0.5">
                  <span className="font-bold flex items-center gap-1 text-amber-950">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Aviso de Cobros Domiciliados a 30 días:</span>
                  </span>
                  <p>
                    Tienes <strong>{paymentStatus.totalUpcoming30DaysAmount.toLocaleString('es-ES')} €</strong> en pagos automáticos previstos en los próximos 30 días. Procura no agotar tu saldo disponible.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="recipient-iban" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Número de Cuenta / IBAN del Destinatario
                </label>
                <input
                  id="recipient-iban"
                  type="text"
                  required
                  value={customIBAN}
                  onChange={(e) => setCustomIBAN(e.target.value)}
                  placeholder="ej. ES001234..."
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
                  Concepto Contable
                </label>
                <input
                  id="concept"
                  type="text"
                  required
                  value={transferConcept}
                  onChange={(e) => setTransferConcept(e.target.value)}
                  placeholder="ej. Factura F-01, Pago materiales"
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
                    Emitir Pago <Send className="w-4 h-4 ml-2" />
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
                <h3 className="font-display font-bold text-slate-900 text-base">Historial de Movimientos</h3>
              </div>
              <span className="text-xs text-slate-400 font-medium">Auto-actualizado</span>
            </div>

            {transfers.length === 0 ? (
              <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">
                <Coins className="w-12 h-12 mx-auto mb-3 opacity-20 text-slate-500" />
                <p className="font-semibold text-slate-600">Aún no hay movimientos registrados</p>
                <p className="text-xs text-slate-400 mt-1">Realiza pagos a tus compañeros o espera recibir fondos de ellos para ver tu historial.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2">
                <AnimatePresence initial={false}>
                  {transfers.map((tx) => {
                    const isOutbound = tx.senderId === currentUser.id;
                    const counterpartName = isOutbound ? tx.receiverName : tx.senderName;
                    const counterpartAccount = isOutbound ? tx.receiverAccount : tx.senderAccount;

                    return (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isOutbound ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {isOutbound ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate font-display">
                              {isOutbound ? `Transferencia enviada a ${counterpartName}` : `Transferencia recibida de ${counterpartName}`}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono truncate tracking-tight">{counterpartAccount}</p>
                            <p className="text-xs text-slate-400 mt-1 flex items-center">
                              <span className="italic truncate">"{tx.concept}"</span>
                              <span className="mx-1.5">•</span>
                              <span className="font-mono text-[10px] shrink-0">
                                {new Date(tx.timestamp).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className={`text-base font-bold font-mono ${
                            isOutbound ? 'text-rose-600' : 'text-emerald-600'
                          }`}>
                            {isOutbound ? '-' : '+'}{tx.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

        </div>

      </main>

      <Footer />
    </div>
  );
}
