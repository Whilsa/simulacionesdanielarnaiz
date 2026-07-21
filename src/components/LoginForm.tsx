/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Landmark, Lock, User as UserIcon, AlertCircle, ArrowRight } from 'lucide-react';
import { User } from '../types.js';

interface LoginFormProps {
  onLoginSuccess: (user: User) => void;
}

export default function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, introduce tu usuario y contraseña.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      let data: any = null;
      let text = '';
      try {
        text = await response.text();
        if (text) {
          data = JSON.parse(text);
        }
      } catch (jsonErr) {
        console.error('Failed to parse JSON response', jsonErr);
      }

      if (!response.ok) {
        throw new Error((data && data.error) || `Error del servidor (${response.status}): ${text.substring(0, 100)}`);
      }

      if (!data || !data.user) {
        const headersObj: Record<string, string> = {};
        try {
          response.headers.forEach((val, key) => {
            headersObj[key] = val;
          });
        } catch (e) {
          console.error(e);
        }
        throw new Error(`La respuesta del servidor (Status: ${response.status}) no contiene datos de usuario válidos. Headers: ${JSON.stringify(headersObj)}. Cuerpo recibido: "${text}"`);
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Update number in the top right */}
      <div className="absolute top-4 right-4 text-xs font-mono text-slate-400 bg-slate-100/80 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm z-20">
        Act. v2.4
      </div>

      {/* Decorative ambient blobs */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-amber-100 rounded-full filter blur-3xl opacity-30 -z-10 animate-pulse-slow"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-100 rounded-full filter blur-3xl opacity-30 -z-10 animate-pulse-slow" style={{ animationDelay: '4s' }}></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-200"
          >
            <Landmark className="w-9 h-9 text-white" />
          </motion.div>
        </div>
        
        <h2 className="mt-6 text-center text-3xl font-bold font-display tracking-tight text-slate-900">
          EGOBEY <span className="text-amber-500">Simulador</span>
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500 font-sans">
          Banco simulado creado por Daniel Arnaiz
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white py-8 px-4 shadow-xl shadow-slate-100 rounded-2xl border border-slate-100 sm:px-10"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg flex items-start space-x-3"
              >
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span className="text-sm text-rose-700 font-medium">{error}</span>
              </motion.div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-slate-700">
                Nombre de Usuario
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 h-5 text-slate-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white transition-all text-slate-900 text-sm font-sans"
                  placeholder="ej. ana, carlos, profesor"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                Contraseña
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 h-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white transition-all text-slate-900 text-sm font-sans"
                  placeholder="Contraseña"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span className="flex items-center">
                    Acceder a la Simulación <ArrowRight className="w-4 h-4 ml-2" />
                  </span>
                )}
              </button>
            </div>
          </form>


        </motion.div>
      </div>
    </div>
  );
}
