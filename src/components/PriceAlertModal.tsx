/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { RawMaterialAnnouncement } from '../types.js';
import { formatNumber } from '../lib/formatters.js';
import { Megaphone, AlertTriangle, TrendingDown, Sparkles, ArrowRight, X, Package } from 'lucide-react';

interface PriceAlertModalProps {
  isOpen: boolean;
  announcement: RawMaterialAnnouncement;
  onClose: () => void;
  onGoToMarket: () => void;
}

export default function PriceAlertModal({
  isOpen,
  announcement,
  onClose,
  onGoToMarket
}: PriceAlertModalProps) {
  if (!isOpen || !announcement || !announcement.priceAlert) return null;

  const { priceAlert } = announcement;

  return (
    <div
      id="price-alert-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        id="price-alert-modal-card"
        className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-6 shadow-2xl shadow-amber-500/10 relative text-slate-200 animate-in zoom-in-95 duration-200"
      >
        {/* Close Button */}
        <button
          id="btn-close-price-alert-modal"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Cerrar aviso"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with Icon */}
        <div className="flex items-start gap-3.5 pr-8">
          <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-2xl shrink-0 shadow-inner">
            <Megaphone className="w-7 h-7 text-amber-400 animate-bounce-subtle" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Aviso Comercial Urgente
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white mt-1 leading-tight">
              Alerta de Demanda en El Des-Tornillo
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Informe de sondeo sobre la comercialización de tu producto
            </p>
          </div>
        </div>

        {/* Simulated Market Feedback Quote Box */}
        <div className="bg-gradient-to-br from-amber-950/40 via-amber-900/20 to-slate-950 border border-amber-500/40 rounded-2xl p-4.5 space-y-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
            <TrendingDown className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Respuesta de los Compradores en Mercado:</span>
          </div>
          <blockquote className="text-sm sm:text-base font-semibold text-amber-100 italic pl-3 border-l-2 border-amber-500/70 leading-relaxed">
            "{priceAlert.message}"
          </blockquote>
          {priceAlert.suggestedPrice !== undefined && priceAlert.suggestedPrice !== null && (
            <div className="pt-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Precio máximo recomendado por el mercado: {formatNumber(priceAlert.suggestedPrice)} €/u.</span>
            </div>
          )}
        </div>

        {/* Product Details Card */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Package className="w-3.5 h-3.5 text-slate-500" />
              Producto Afectado:
            </span>
            <span className="font-bold text-white text-sm">{announcement.title}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Formato / Presentación:</span>
            <span className="text-slate-300 font-medium">{announcement.presentation || 'Unidades'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Precio Unitario Ofertado:</span>
            <span className="font-mono font-bold text-rose-400 text-sm">
              {formatNumber(announcement.pricePerUnit)} € + 21% IVA
            </span>
          </div>
        </div>

        {/* Informative Guidance */}
        <div className="flex items-start gap-2.5 text-xs text-slate-300 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p>
            Los clientes han paralizado sus compras de este producto por considerar el precio fuera de mercado. Para evitar acumulación de existencias en tu nave y reactivar la salida comercial, se aconseja reducir el precio unitario fijado.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <button
            id="btn-dismiss-price-alert"
            type="button"
            onClick={onClose}
            className="sm:w-1/3 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer text-center"
          >
            Entendido
          </button>
          <button
            id="btn-goto-market-price-alert"
            type="button"
            onClick={onGoToMarket}
            className="sm:flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer group"
          >
            <span>Ir a El Des-Tornillo / Ajustar Precio</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
