/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from './types.js';
import LoginForm from './components/LoginForm.js';
import TeacherDashboard from './components/TeacherDashboard.js';
import StudentDashboard from './components/StudentDashboard.js';
import MainHub from './components/MainHub.js';
import RealEstatePortal from './components/RealEstatePortal.js';
import CompanyDashboard from './components/CompanyDashboard.js';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeModule, setActiveModule] = useState<'hub' | 'bank' | 'real_estate' | 'company'>('hub');
  const [availablePropertiesCount, setAvailablePropertiesCount] = useState<number>(5);

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

  useEffect(() => {
    if (currentUser) {
      // Fetch property count for hub badge
      fetch('/api/properties')
        .then(res => res.json())
        .then(data => {
          if (data.properties) {
            setAvailablePropertiesCount(data.properties.length);
          }
        })
        .catch(() => {});
    }
  }, [currentUser, activeModule]);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setActiveModule('hub');
    localStorage.setItem('bes_sim_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveModule('hub');
    localStorage.removeItem('bes_sim_user');
  };

  const handleUserBalanceUpdated = (newBalance: number) => {
    if (currentUser) {
      const updatedUser = { ...currentUser, balance: newBalance };
      setCurrentUser(updatedUser);
      localStorage.setItem('bes_sim_user', JSON.stringify(updatedUser));
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center font-sans">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 text-sm font-semibold">Iniciando Simulador de Daniel Arnaiz Boluda...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  if (activeModule === 'bank') {
    if (currentUser.role === 'teacher') {
      return (
        <TeacherDashboard
          currentUser={currentUser}
          onLogout={handleLogout}
          onBackToHub={() => setActiveModule('hub')}
        />
      );
    }
    return (
      <StudentDashboard
        currentUser={currentUser}
        onLogout={handleLogout}
        onBackToHub={() => setActiveModule('hub')}
      />
    );
  }

  if (activeModule === 'real_estate') {
    return (
      <RealEstatePortal
        currentUser={currentUser}
        onBackToHub={() => setActiveModule('hub')}
        onUserBalanceUpdated={handleUserBalanceUpdated}
      />
    );
  }

  if (activeModule === 'company') {
    return (
      <CompanyDashboard
        currentUser={currentUser}
        onBackToHub={() => setActiveModule('hub')}
        onGoToBank={() => setActiveModule('bank')}
        onUserBalanceUpdated={handleUserBalanceUpdated}
      />
    );
  }

  // Default: Main Hub (3 Cards)
  return (
    <MainHub
      currentUser={currentUser}
      onSelectModule={(module) => setActiveModule(module)}
      onLogout={handleLogout}
      availablePropertiesCount={availablePropertiesCount}
    />
  );
}
