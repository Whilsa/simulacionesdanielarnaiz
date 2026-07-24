/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User } from '../types.js';
import { Landmark, Building2, Briefcase, ArrowRight, LogOut, ShieldCheck, Sparkles, MapPin, CreditCard, ChevronRight, Wrench } from 'lucide-react';
import Footer from './Footer.js';

interface MainHubProps {
  currentUser: User;
  onSelectModule: (module: 'bank' | 'real_estate' | 'machinery' | 'company') => void;
  onLogout: () => void;
  availablePropertiesCount?: number;
}

export default function MainHub({ currentUser, onSelectModule, onLogout, availablePropertiesCount = 5 }: MainHubProps) {
  const isTeacher = currentUser.role === 'teacher';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-inner">
              E
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">Simulador de Daniel Arnaiz Boluda</h1>
                <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full ${
                  isTeacher ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {isTeacher ? 'Profesor / Admin' : 'Empresa Alumno'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Simulador de negocios para contabilidad</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
              <span className="text-xs text-slate-400 font-medium">Usuario:</span>
              <span className="text-xs font-bold text-slate-200">{currentUser.name}</span>
            </div>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 shadow-xs cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col justify-center">
        {/* Welcome Hero */}
        <div className="mb-8 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Panel Principal de Operaciones</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Bienvenido, {currentUser.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Selecciona la plataforma a la que deseas acceder. Todas las transacciones e inversiones están sincronizadas en tiempo real con la contabilidad de tu empresa.
          </p>
        </div>

        {/* 4 Main Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* CARD 1: BANCO */}
          <div
            onClick={() => onSelectModule('bank')}
            className="group relative bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-xl hover:border-amber-400 transition-all duration-300 flex flex-col justify-between cursor-pointer overflow-hidden transform hover:-translate-y-1"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-125" />
            
            <div>
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 shadow-inner border border-amber-100 group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
                <Landmark className="w-7 h-7" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                  Banco
                </h3>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                  Simulador
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                Acceso al simulador bancario corporativo. Realiza transferencias, gestiona tu IBAN, consulta el extracto de movimientos e historial de pagos.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Saldo Disponible</span>
                <span className="text-base font-extrabold text-slate-900">
                  {currentUser.balance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>

              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:bg-amber-500 transition-colors shadow-xs">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* CARD 2: PORTAL INMOBILIARIO */}
          <div
            onClick={() => onSelectModule('real_estate')}
            className="group relative bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-xl hover:border-blue-400 transition-all duration-300 flex flex-col justify-between cursor-pointer overflow-hidden transform hover:-translate-y-1"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-125" />

            <div>
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 shadow-inner border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                <Building2 className="w-7 h-7" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  Portal inmobiliario
                </h3>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                  Mercado
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                Mercado de naves industriales, almacenes y locales comerciales. Compra o alquila inmuebles con opción de pago aplazado (Pagarés / Letras de cambio) o fianza.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Inmuebles Activos</span>
                <span className="text-base font-extrabold text-blue-900">
                  {availablePropertiesCount} Ofertas disponibles
                </span>
              </div>

              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:bg-blue-600 transition-colors shadow-xs">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* CARD 3: MAQUINARIA */}
          <div
            onClick={() => onSelectModule('machinery')}
            className="group relative bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-xl hover:border-amber-500 transition-all duration-300 flex flex-col justify-between cursor-pointer overflow-hidden transform hover:-translate-y-1"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-125" />

            <div>
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-6 shadow-inner border border-amber-200 group-hover:bg-amber-600 group-hover:text-white transition-colors duration-300">
                <Wrench className="w-7 h-7" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                  Maquinaria
                </h3>
                <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  Industrial
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                Adquisición de lotes de maquinaria para producción (Línea de Metal/Hierro y Línea de Plástico/Ensamblaje). Instalación en Nave Industrial.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Lotes de Fabricación</span>
                <span className="text-base font-extrabold text-amber-900">
                  2 Líneas Disponibles
                </span>
              </div>

              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:bg-amber-600 transition-colors shadow-xs">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* CARD 4: EMPRESA (NOMBRE DEL ALUMNO / PROFESOR) */}
          <div
            onClick={() => onSelectModule('company')}
            className="group relative bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-xl hover:border-emerald-400 transition-all duration-300 flex flex-col justify-between cursor-pointer overflow-hidden transform hover:-translate-y-1"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-125" />

            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 shadow-inner border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <Briefcase className="w-7 h-7" />
              </div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors line-clamp-1" title={currentUser.name}>
                  {currentUser.name}
                </h3>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                  Patrimonio
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                Resumen de la empresa: saldo bancario, inmuebles en propiedad (% Suelo/Edificación y amortización), contratos de alquiler y gestión de vencimientos (Pagarés/Letras).
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Estado de Empresa</span>
                <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                  Ver Estado Contable
                </span>
              </div>

              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:bg-emerald-600 transition-colors shadow-xs">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Informational Footer Note */}
        <div className="mt-12 bg-slate-200/60 rounded-2xl p-4 sm:p-6 border border-slate-300/60 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl text-slate-700 shadow-xs border border-slate-200">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">Sincronización Contable en Tiempo Real</h4>
              <p className="text-xs text-slate-600">Cualquier alquiler, compra de inmueble o pago de pagaré reflejará el cargo directamente en la cuenta bancaria.</p>
            </div>
          </div>
          <div className="text-xs text-slate-500 font-mono">v1.2.1 • Academic</div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
