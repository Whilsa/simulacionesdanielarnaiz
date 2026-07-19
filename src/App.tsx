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

  if (!currentUser) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentUser.role === 'teacher') {
    return <TeacherDashboard currentUser={currentUser} onLogout={handleLogout} />;
  }

  return <StudentDashboard currentUser={currentUser} onLogout={handleLogout} />;
}
