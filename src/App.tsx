/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from './types.js';
import LoginForm from './components/LoginForm.js';
import TeacherDashboard from './components/TeacherDashboard.js';
import StudentDashboard from './components/StudentDashboard.js';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Restore session from localStorage if available
    const savedUser = localStorage.getItem('bes_sim_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Failed to restore user session', e);
        localStorage.removeItem('bes_sim_user');
      }
    }
    setIsInitializing(false);
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('bes_sim_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('bes_sim_user');
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center font-sans">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 text-sm font-semibold">Iniciando Simulador Bancario...</p>
      </div>
    );
  }

  const renderBadge = () => (
    <div className="fixed top-3 right-3 z-[9999] pointer-events-none select-none">
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-amber-950 bg-[#EABE3F] shadow-lg border border-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-950 animate-pulse"></span>
        Actualización #4
      </span>
    </div>
  );

  if (!currentUser) {
    return (
      <>
        {renderBadge()}
        <LoginForm onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  if (currentUser.role === 'teacher') {
    return (
      <>
        {renderBadge()}
        <TeacherDashboard currentUser={currentUser} onLogout={handleLogout} />
      </>
    );
  }

  return (
    <>
      {renderBadge()}
      <StudentDashboard currentUser={currentUser} onLogout={handleLogout} />
    </>
  );
}
