/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, RawMaterialAnnouncement } from './types.js';
import LoginForm from './components/LoginForm.js';
import TeacherDashboard from './components/TeacherDashboard.js';
import StudentDashboard from './components/StudentDashboard.js';
import MainHub from './components/MainHub.js';
import RealEstatePortal from './components/RealEstatePortal.js';
import CompanyDashboard from './components/CompanyDashboard.js';
import MachineryPortal from './components/MachineryPortal.js';
import JobForumPortal from './components/JobForumPortal.js';
import TelecomPortal from './components/TelecomPortal.js';
import OfficeStorePortal from './components/OfficeStorePortal.js';
import VehicleDealershipPortal from './components/VehicleDealershipPortal.js';
import RawMaterialsPortal from './components/RawMaterialsPortal.js';
import CourtPortal from './components/CourtPortal.js';
import PriceAlertModal from './components/PriceAlertModal.js';
import { ArrowLeft, Landmark } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeModule, setActiveModule] = useState<'hub' | 'bank' | 'real_estate' | 'machinery' | 'jobs' | 'company' | 'electricity' | 'telecom' | 'office_store' | 'vehicles' | 'raw_materials' | 'court'>('hub');
  const [rawMaterialsTab, setRawMaterialsTab] = useState<'catalogo' | 'mensajeria' | 'facturacion'>('catalogo');
  const [availablePropertiesCount, setAvailablePropertiesCount] = useState<number>(5);

  // Price Alert Popup State for Student
  const [pendingPriceAlertAnn, setPendingPriceAlertAnn] = useState<RawMaterialAnnouncement | null>(null);
  const [showPriceAlertModal, setShowPriceAlertModal] = useState(false);

  const handleOpenDirectMessaging = () => {
    setRawMaterialsTab('mensajeria');
    setActiveModule('raw_materials');
  };

  useEffect(() => {
    // Restore session from localStorage if available
    const savedUser = localStorage.getItem('bes_sim_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        fetch('/api/users')
          .then(res => (res.ok && res.headers.get('content-type')?.includes('application/json')) ? res.json() : null)
          .then(data => {
            if (data && Array.isArray(data.users)) {
              const exists = data.users.some((u: User) => u.id === parsed.id || u.username?.toLowerCase() === parsed.username?.toLowerCase());
              if (exists) {
                const freshUser = data.users.find((u: User) => u.id === parsed.id || u.username?.toLowerCase() === parsed.username?.toLowerCase());
                setCurrentUser(freshUser || parsed);
              } else {
                console.warn('Session user no longer exists on server, clearing session');
                localStorage.removeItem('bes_sim_user');
                setCurrentUser(null);
              }
            } else {
              setCurrentUser(parsed);
            }
          })
          .catch(() => {
            setCurrentUser(parsed);
          });
      } catch (e) {
        console.error('Failed to restore user session', e);
        localStorage.removeItem('bes_sim_user');
      }
    }
    setIsInitializing(false);
  }, []);

  // Check for active price alerts when student enters
  useEffect(() => {
    if (!currentUser || currentUser.role === 'teacher' || currentUser.username === 'pupdaniel') {
      setPendingPriceAlertAnn(null);
      setShowPriceAlertModal(false);
      return;
    }

    const checkStudentPriceAlerts = async () => {
      try {
        const res = await fetch('/api/raw-materials/announcements');
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.announcements)) {
          const myAnnouncementsWithAlert = data.announcements.filter(
            (a: RawMaterialAnnouncement) =>
              a.sellerId === currentUser.id &&
              a.priceAlert &&
              a.priceAlert.active === true
          );

          for (const ann of myAnnouncementsWithAlert) {
            const dismissedKey = `seen_price_alert_${currentUser.id}_${ann.id}_${ann.priceAlert!.timestamp}`;
            if (localStorage.getItem(dismissedKey) !== 'true') {
              setPendingPriceAlertAnn(ann);
              setShowPriceAlertModal(true);
              break;
            }
          }
        }
      } catch (err) {
        console.error('Error checking price alerts for student:', err);
      }
    };

    checkStudentPriceAlerts();
  }, [currentUser?.id]);

  const handleDismissPriceAlert = () => {
    if (pendingPriceAlertAnn && pendingPriceAlertAnn.priceAlert && currentUser) {
      const dismissedKey = `seen_price_alert_${currentUser.id}_${pendingPriceAlertAnn.id}_${pendingPriceAlertAnn.priceAlert.timestamp}`;
      localStorage.setItem(dismissedKey, 'true');
    }
    setShowPriceAlertModal(false);
  };

  const handleGoToMarketPriceAlert = () => {
    if (pendingPriceAlertAnn && pendingPriceAlertAnn.priceAlert && currentUser) {
      const dismissedKey = `seen_price_alert_${currentUser.id}_${pendingPriceAlertAnn.id}_${pendingPriceAlertAnn.priceAlert.timestamp}`;
      localStorage.setItem(dismissedKey, 'true');
    }
    setShowPriceAlertModal(false);
    setRawMaterialsTab('catalogo');
    setActiveModule('raw_materials');
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeModule]);

  useEffect(() => {
    if (currentUser) {
      // Fetch property count for hub badge
      fetch('/api/properties')
        .then(res => (res.ok && res.headers.get('content-type')?.includes('application/json')) ? res.json() : null)
        .then(data => {
          if (data && data.properties) {
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
        <p className="text-slate-500 text-sm font-semibold">Iniciando ContaLab...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  const renderActiveModule = () => {
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

    if (activeModule === 'machinery') {
      return (
        <MachineryPortal
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onUserBalanceUpdated={handleUserBalanceUpdated}
        />
      );
    }

    if (activeModule === 'jobs') {
      return (
        <JobForumPortal
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

    if (activeModule === 'electricity') {
      return (
        <CompanyDashboard
          currentUser={currentUser}
          initialTab="energia"
          onBackToHub={() => setActiveModule('hub')}
          onGoToBank={() => setActiveModule('bank')}
          onUserBalanceUpdated={handleUserBalanceUpdated}
        />
      );
    }

    if (activeModule === 'telecom') {
      return (
        <TelecomPortal
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onUserBalanceUpdated={handleUserBalanceUpdated}
        />
      );
    }

    if (activeModule === 'office_store') {
      return (
        <OfficeStorePortal
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onUserBalanceUpdated={handleUserBalanceUpdated}
        />
      );
    }

    if (activeModule === 'vehicles') {
      return (
        <VehicleDealershipPortal
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onUserBalanceUpdated={handleUserBalanceUpdated}
        />
      );
    }

    if (activeModule === 'raw_materials') {
      return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col">
          {/* Navigation Topbar */}
          <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-4 py-3 shadow-md">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <button
                onClick={() => setActiveModule('hub')}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors border border-slate-700"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al Hub Principal</span>
              </button>

              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-slate-400 font-medium">{currentUser.name}</div>
                  <div className="text-xs font-bold text-amber-400 font-mono">
                    {currentUser.balance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </div>
                </div>
                <button
                  onClick={() => setActiveModule('bank')}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl font-bold text-xs border border-amber-500/30 transition-colors flex items-center gap-1.5"
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Banca</span>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <RawMaterialsPortal
              currentUser={currentUser}
              initialTab={rawMaterialsTab}
              onUserBalanceUpdated={handleUserBalanceUpdated}
              onRefreshUser={() => {
                fetch('/api/users')
                  .then(r => (r.ok && r.headers.get('content-type')?.includes('application/json')) ? r.json() : null)
                  .then(d => {
                    if (d && d.users) {
                      const u = d.users.find((x: User) => x.id === currentUser.id);
                      if (u) {
                        setCurrentUser(u);
                        localStorage.setItem('bes_sim_user', JSON.stringify(u));
                      }
                    }
                  })
                  .catch(() => {});
              }}
            />
          </main>
        </div>
      );
    }

    if (activeModule === 'court') {
      return (
        <CourtPortal
          currentUser={currentUser}
          onBackToHub={() => setActiveModule('hub')}
          onUserBalanceUpdated={handleUserBalanceUpdated}
        />
      );
    }

    // Default: Main Hub (3 Cards)
    return (
      <MainHub
        currentUser={currentUser}
        onSelectModule={(module) => {
          if (module === 'raw_materials') {
            setRawMaterialsTab('catalogo');
          }
          setActiveModule(module);
        }}
        onOpenDirectMessaging={handleOpenDirectMessaging}
        onLogout={handleLogout}
        availablePropertiesCount={availablePropertiesCount}
      />
    );
  };

  return (
    <>
      {renderActiveModule()}

      {/* Student Entry Modal for Market Demand / Price Warnings */}
      {showPriceAlertModal && pendingPriceAlertAnn && (
        <PriceAlertModal
          isOpen={showPriceAlertModal}
          announcement={pendingPriceAlertAnn}
          onClose={handleDismissPriceAlert}
          onGoToMarket={handleGoToMarketPriceAlert}
        />
      )}
    </>
  );
}
