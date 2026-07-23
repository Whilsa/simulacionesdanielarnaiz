/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Calendar, CheckCircle2, Clock, Calculator } from 'lucide-react';
import { BankLoan, AmortizationRow } from '../types.js';

interface LoanAmortizationTableProps {
  loan: BankLoan;
  onClose: () => void;
}

export default function LoanAmortizationTable({ loan, onClose }: LoanAmortizationTableProps) {
  const schedule: AmortizationRow[] = loan.schedule || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-amber-700 to-amber-900 text-white p-6 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-amber-200" />
              <h2 className="text-xl font-bold font-display">Cuadro de Amortización (Método Francés)</h2>
            </div>
            <p className="text-xs text-amber-100">
              Préstamo Hipotecario #{loan.id} • Ref. {loan.studentName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loan Key Parameters Summary */}
        <div className="bg-amber-50/70 border-b border-amber-100/80 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500 uppercase font-semibold text-[10px] tracking-wider block">Capital Concedido / Ofrecido</span>
            <span className="font-bold text-slate-900 text-sm font-mono">
              {(loan.approvedAmount || loan.offeredAmount).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
            </span>
          </div>
          <div>
            <span className="text-slate-500 uppercase font-semibold text-[10px] tracking-wider block">Tipo de Interés Anual (TIN)</span>
            <span className="font-bold text-emerald-700 text-sm font-mono">
              {loan.annualInterestRate.toFixed(2)} % <span className="text-[10px] text-slate-500 font-normal">(Euribor {loan.euriborRate}% + 1%)</span>
            </span>
          </div>
          <div>
            <span className="text-slate-500 uppercase font-semibold text-[10px] tracking-wider block">Plazo de Devolución</span>
            <span className="font-bold text-slate-900 text-sm">
              {loan.termMonths} meses ({Math.round((loan.termMonths / 12) * 10) / 10} años)
            </span>
          </div>
          <div>
            <span className="text-slate-500 uppercase font-semibold text-[10px] tracking-wider block">Cuota Mensual Constante</span>
            <span className="font-bold text-amber-800 text-sm font-mono">
              {loan.monthlyPayment.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € / mes
            </span>
          </div>
        </div>

        {/* Amortization Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase tracking-wider text-[10px] bg-slate-50">
                <th className="py-2.5 px-3 rounded-l-lg">Cuota #</th>
                <th className="py-2.5 px-3">Fecha Vencimiento</th>
                <th className="py-2.5 px-3 text-right">Cuota a Pagar</th>
                <th className="py-2.5 px-3 text-right">Intereses</th>
                <th className="py-2.5 px-3 text-right">Capital Amortizado</th>
                <th className="py-2.5 px-3 text-right">Total Amortizado</th>
                <th className="py-2.5 px-3 text-right">Capital Pendiente</th>
                <th className="py-2.5 px-3 text-center rounded-r-lg">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {schedule.map((row) => {
                const dateObj = new Date(row.dueDate);
                const formattedDate = dateObj.toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                });

                return (
                  <tr 
                    key={row.period} 
                    className={`hover:bg-amber-50/40 transition-colors ${row.paid ? 'bg-emerald-50/30' : ''}`}
                  >
                    <td className="py-2.5 px-3 font-bold text-slate-700">
                      {row.period}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{formattedDate}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-900">
                      {row.payment.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-600">
                      {row.interest.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-700 font-medium">
                      {row.principal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {row.totalAmortized.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {row.pendingBalance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      {row.paid ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Pagado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          <Clock className="w-3 h-3 mr-1 text-slate-400" />
                          Pendiente
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
          <p>
            * Amortización calculada mediante la fórmula de cuota fija mensual constante (Sistema Francés).
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition cursor-pointer"
          >
            Cerrar Tabla
          </button>
        </div>

      </div>
    </div>
  );
}
