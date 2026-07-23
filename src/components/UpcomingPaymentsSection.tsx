/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  CalendarClock, AlertTriangle, CheckCircle2, ShieldAlert, Lock, Clock, 
  Building, FileText, Landmark, RefreshCw, ArrowUpRight, Info
} from 'lucide-react';
import { User, UpcomingPaymentItem } from '../types.js';

interface UpcomingPaymentsSectionProps {
  currentUser: User;
  onRefreshTrigger?: () => void;
}

interface PaymentStatusResponse {
  isBlocked: boolean;
  totalOverdueAmount: number;
  totalUpcoming30DaysAmount: number;
  overdueItems: UpcomingPaymentItem[];
  upcoming30DaysItems: UpcomingPaymentItem[];
  projected30DaysTotal: number;
  currentBalance: number;
  insufficientProjectedBalance: boolean;
}

export default function UpcomingPaymentsSection({ currentUser, onRefreshTrigger }: UpcomingPaymentsSectionProps) {
  const [data, setData] = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUpcomingPayments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/student/upcoming-payments?studentId=${currentUser.id}`);
      if (!res.ok) throw new Error('Error al consultar los pagos previstos');
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpcomingPayments();
  }, [currentUser.id, currentUser.balance]);

  const getPaymentIcon = (type: string) => {
    switch (type) {
      case 'cuota_alquiler':
      case 'cuota_compra':
        return <Building className="w-4 h-4 text-amber-700" />;
      case 'pagare':
      case 'letra_cambio':
        return <FileText className="w-4 h-4 text-blue-700" />;
      case 'cuota_prestamo':
        return <Landmark className="w-4 h-4 text-emerald-700" />;
      default:
        return <CalendarClock className="w-4 h-4 text-slate-700" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'cuota_alquiler': return 'Cuota de Alquiler';
      case 'cuota_compra': return 'Cuota Aplazada de Compra';
      case 'pagare': return 'Pagaré Comercial';
      case 'letra_cambio': return 'Letra de Cambio';
      case 'cuota_prestamo': return 'Préstamo Hipotecario';
      default: return 'Cargo Domiciliado';
    }
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex items-center justify-center space-x-2 text-xs text-slate-400">
        <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
        <span>Cargando calendario de pagos a 30 días...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-100/80 rounded-xl flex items-center justify-center text-amber-900 font-bold">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-slate-900 text-base flex items-center gap-2">
              <span>Pagos Automáticos Domiciliados</span>
              <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Siguientes 30 días reales
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Cargos que se procesarán automáticamente en tu cuenta bancaria a su vencimiento
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            fetchUpcomingPayments();
            if (onRefreshTrigger) onRefreshTrigger();
          }}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center space-x-1 text-xs self-start sm:self-auto"
          title="Actualizar estado de pagos"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualizar</span>
        </button>
      </div>

      {/* ALERT 1: OVERDUE DEBT / BLOCKED OUTFLOWS */}
      {data.isBlocked && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-rose-600 text-white rounded-xl shadow-sm">
              <Lock className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-rose-900 text-sm flex items-center justify-between">
                <span>⚠️ Salidas de Dinero Manuales Bloqueadas (Mora por Impago)</span>
                <span className="text-xs font-mono font-bold bg-rose-200 text-rose-900 px-2.5 py-0.5 rounded-full">
                  5% Int. Demora
                </span>
              </h4>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                Tu cuenta bancaria <strong>no admite números rojos</strong>. Al no disponer de saldo suficiente a la fecha de vencimiento, las operaciones de salida manuales (transferencias, compras e inversiones) han sido <strong>bloqueadas</strong>. Se ha aplicado un <strong>5 % de interés de demora</strong> sobre las cantidades impagadas.
              </p>
            </div>
          </div>

          {/* Overdue Items Table */}
          <div className="overflow-x-auto bg-white rounded-xl border border-rose-200/80 shadow-inner">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-rose-100/50 text-rose-900 font-bold border-b border-rose-200/80">
                  <th className="p-2.5">Concepto / Referencia</th>
                  <th className="p-2.5">Vencimiento</th>
                  <th className="p-2.5 text-right">Principal</th>
                  <th className="p-2.5 text-right">Int. Demora (5%)</th>
                  <th className="p-2.5 text-right">Total Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100 text-slate-800 font-mono">
                {data.overdueItems.map((item) => (
                  <tr key={item.id} className="hover:bg-rose-50/50">
                    <td className="p-2.5 font-sans font-medium text-slate-900 flex items-center space-x-1.5">
                      {getPaymentIcon(item.type)}
                      <div>
                        <span className="font-bold block">{item.title}</span>
                        <span className="text-[10px] text-slate-500 font-normal">{item.concept}</span>
                      </div>
                    </td>
                    <td className="p-2.5 text-rose-700 font-bold font-sans">
                      {new Date(item.dueDate).toLocaleDateString('es-ES')}
                    </td>
                    <td className="p-2.5 text-right">{item.principalAmount.toLocaleString('es-ES')} €</td>
                    <td className="p-2.5 text-right text-rose-600 font-bold">+{item.penaltyInterest.toLocaleString('es-ES')} €</td>
                    <td className="p-2.5 text-right font-bold text-rose-900">{item.totalAmount.toLocaleString('es-ES')} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-rose-100/80 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-rose-950 font-semibold text-xs">
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 text-rose-700 shrink-0" />
              <span>Importe total acumulado necesario para desbloquear la cuenta:</span>
            </div>
            <span className="font-mono font-bold text-sm bg-rose-200 px-3 py-1 rounded-lg border border-rose-300">
              {data.totalOverdueAmount.toLocaleString('es-ES')} €
            </span>
          </div>
          <p className="text-[11px] text-rose-800 text-center italic">
            💡 En cuanto tu saldo bancario alcance los {data.totalOverdueAmount.toLocaleString('es-ES')} €, el cobro se ejecutará automáticamente y tu cuenta volverá a estar libre de restricciones.
          </p>
        </div>
      )}

      {/* COVERAGE STATUS BANNER (When NOT blocked) */}
      {!data.isBlocked && (
        <>
          {data.insufficientProjectedBalance ? (
            <div className="bg-amber-50 border border-amber-200/80 p-4 rounded-xl flex items-start space-x-3 text-amber-900 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">⚠️ Atención: Alerta de cobertura de saldo a 30 días</p>
                <p className="mt-0.5 leading-relaxed text-amber-800">
                  Tu saldo disponible actual (<strong>{data.currentBalance.toLocaleString('es-ES')} €</strong>) es inferior al importe total de pagos previstos en los próximos 30 días (<strong>{data.projected30DaysTotal.toLocaleString('es-ES')} €</strong>). Te faltan <strong>{(data.projected30DaysTotal - data.currentBalance).toLocaleString('es-ES')} €</strong>. Ingresa fondos antes de las fechas de vencimiento para evitar entrar en mora.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200/80 p-3.5 rounded-xl flex items-center justify-between text-emerald-900 text-xs font-medium">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Cobertura suficiente para los compromisos automáticos a 30 días.</span>
              </div>
              <span className="font-mono font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg">
                Previsto: {data.totalUpcoming30DaysAmount.toLocaleString('es-ES')} €
              </span>
            </div>
          )}
        </>
      )}

      {/* UPCOMING 30 DAYS LIST */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
          <span>Próximos Vencimientos Programados</span>
          <span className="text-slate-500 font-mono font-normal">
            ({data.upcoming30DaysItems.length} cargos en 30 días)
          </span>
        </h4>

        {data.upcoming30DaysItems.length === 0 ? (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 text-center text-slate-500 text-xs">
            No tienes pagos domiciliados ni cuotas con vencimiento programado en los siguientes 30 días reales.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.upcoming30DaysItems.map((item) => (
              <div 
                key={item.id}
                className="bg-slate-50/80 border border-slate-200/70 hover:border-amber-300 rounded-xl p-3.5 transition-all space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                      {getPaymentIcon(item.type)}
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 text-xs block leading-tight">{item.title}</span>
                      <span className="text-[10px] text-slate-500 block">{getTypeName(item.type)}</span>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-slate-900 bg-white px-2 py-1 rounded-lg border border-slate-200/80">
                    {item.principalAmount.toLocaleString('es-ES')} €
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/50">
                  <span className="text-slate-600 font-medium flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Vence el {new Date(item.dueDate).toLocaleDateString('es-ES')}</span>
                  </span>

                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    item.daysRemaining <= 5 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-slate-200/80 text-slate-700'
                  }`}>
                    {item.daysRemaining === 0 ? '¡Vence hoy!' : `En ${item.daysRemaining} días`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
