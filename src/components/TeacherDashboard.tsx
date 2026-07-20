/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Landmark, UserPlus, Coins, History, RotateCcw, 
  Trash2, Search, ArrowUpRight, ArrowDownLeft, Eye, EyeOff, 
  X, Plus, Minus, Settings, FileText, CheckCircle2, AlertTriangle, LogOut,
  Download, Upload, Database, Cloud, CloudOff, RefreshCw
} from 'lucide-react';
import { User, Transfer, SystemLog } from '../types.js';

interface TeacherDashboardProps {
  currentUser: User;
  onLogout: () => void;
}

export default function TeacherDashboard({ currentUser, onLogout }: TeacherDashboardProps) {
  const [activeTab, setActiveTab] = useState<'students' | 'transfers' | 'logs' | 'reset'>('students');
  const [users, setUsers] = useState<User[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create user form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserInitialBalance, setNewUserInitialBalance] = useState('1000');
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Balance adjustment modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustAction, setAdjustAction] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustError, setAdjustError] = useState('');

  // Reset simulation state
  const [resetKeepUsers, setResetKeepUsers] = useState(true);
  const [resetDefaultBalance, setResetDefaultBalance] = useState('1000');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  // Password viewing state
  const [visiblePasswords, setVisiblePasswords] = useState<{ [key: string]: boolean }>({});

  // Delete user state
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Backup and restore state
  const [showRestoreSuggestion, setShowRestoreSuggestion] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState('');
  const [backupError, setBackupError] = useState('');

  // Firebase backup state
  const [firebaseConfig, setFirebaseConfig] = useState<{ configured: boolean; projectId: string } | null>(null);
  const [firebaseStatus, setFirebaseStatus] = useState<{ success: boolean; reason?: string; details?: string } | null>(null);
  const [checkingFirebase, setCheckingFirebase] = useState(false);
  const [firebaseActionLoading, setFirebaseActionLoading] = useState(false);
  const [firebaseSuccess, setFirebaseSuccess] = useState('');
  const [firebaseError, setFirebaseError] = useState('');

  const fetchFirebaseConfig = async () => {
    try {
      const res = await fetch('/api/firebase/config');
      if (res.ok) {
        const data = await res.json();
        setFirebaseConfig(data);
        if (data.configured) {
          checkFirebaseStatus();
        }
      }
    } catch (e) {
      console.error('Error fetching Firebase config:', e);
    }
  };

  const checkFirebaseStatus = async () => {
    setCheckingFirebase(true);
    try {
      const res = await fetch('/api/firebase/status');
      if (res.ok) {
        const data = await res.json();
        setFirebaseStatus(data);
      } else {
        setFirebaseStatus({ success: false, reason: 'server_error', details: 'No se pudo comunicar con el servidor para verificar Firestore.' });
      }
    } catch (e: any) {
      setFirebaseStatus({ success: false, reason: 'network_error', details: e.message });
    } finally {
      setCheckingFirebase(false);
    }
  };

  const handleFirebaseBackup = async () => {
    setFirebaseError('');
    setFirebaseSuccess('');
    setFirebaseActionLoading(true);
    try {
      const res = await fetch('/api/firebase/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFirebaseSuccess(data.message || 'Copia de seguridad en la nube guardada con éxito.');
        checkFirebaseStatus();
      } else {
        setFirebaseError(data.error || 'Error al guardar la copia de seguridad en la nube.');
      }
    } catch (e: any) {
      setFirebaseError('Error de red: ' + e.message);
    } finally {
      setFirebaseActionLoading(false);
    }
  };

  const handleFirebaseRestore = async () => {
    if (!window.confirm('¿Estás seguro de que deseas restaurar la base de datos completa desde Firebase? Esto reemplazará todos los datos actuales de alumnos, transferencias e historiales.')) {
      return;
    }
    setFirebaseError('');
    setFirebaseSuccess('');
    setFirebaseActionLoading(true);
    try {
      const res = await fetch('/api/firebase/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFirebaseSuccess(data.message || 'Base de datos restaurada con éxito desde Firestore.');
        fetchData();
      } else {
        setFirebaseError(data.error || 'Error al restaurar la base de datos desde la nube.');
      }
    } catch (e: any) {
      setFirebaseError('Error de red: ' + e.message);
    } finally {
      setFirebaseActionLoading(false);
    }
  };

  useEffect(() => {
    fetchFirebaseConfig();
  }, []);

  useEffect(() => {
    fetchData();
    // Poll dashboard data every 4 seconds to maintain real-time sync with student activities
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchData = async () => {
    try {
      // 1. Get the local storage backup (if any) to check against server state
      let localBackup: any = null;
      const savedBackupStr = localStorage.getItem('egobey_db_backup');
      if (savedBackupStr) {
        try {
          localBackup = JSON.parse(savedBackupStr);
        } catch (e) {
          console.error('Error parsing local backup for sync:', e);
        }
      }

      // 2. Perform bi-directional automatic synchronization with the server
      const syncResponse = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localBackup || { users: [], transfers: [], systemLogs: [] })
      });

      if (syncResponse.ok) {
        const syncData = await syncResponse.json();
        if (syncData.success && syncData.db) {
          const db = syncData.db;
          setUsers(db.users || []);
          setTransfers(db.transfers || []);
          setLogs(db.systemLogs || []);

          // Save the most authoritative state back to local storage
          const hasStudents = db.users?.some((u: any) => u.role === 'student');
          if (hasStudents) {
            const updatedBackup = {
              users: db.users,
              transfers: db.transfers,
              systemLogs: db.systemLogs,
              defaultInitialBalance: db.defaultInitialBalance || 1000,
              version: db.version,
              lastUpdated: db.lastUpdated
            };
            localStorage.setItem('egobey_db_backup', JSON.stringify(updatedBackup));
            setShowRestoreSuggestion(false);
          }
          return; // Skip normal fetching since sync has returned the absolute authoritative state!
        }
      }

      // Fallback: If sync endpoint fails or is slow, perform normal individual fetches
      const [usersRes, transfersRes, logsRes] = await Promise.all([
        fetch('/users?role=teacher'),
        fetch('/transfers?role=teacher'),
        fetch('/logs')
      ]);

      let usersList: User[] = [];
      let transfersList: Transfer[] = [];
      let logsList: SystemLog[] = [];

      if (usersRes.ok && usersRes.headers.get('content-type')?.includes('application/json')) {
        const usersData = await usersRes.json();
        usersList = usersData.users || [];
      }
      if (transfersRes.ok && transfersRes.headers.get('content-type')?.includes('application/json')) {
        const transfersData = await transfersRes.json();
        transfersList = transfersData.transfers || [];
      }
      if (logsRes.ok && logsRes.headers.get('content-type')?.includes('application/json')) {
        const logsData = await logsRes.json();
        logsList = logsData.logs || [];
      }

      setUsers(usersList);
      setTransfers(transfersList);
      setLogs(logsList);

      // Save a browser-side copy of the database to local storage as a safety fallback
      if (usersList.length > 0) {
        const hasStudents = usersList.some(u => u.role === 'student');
        if (hasStudents) {
          const backupObj = {
            users: usersList,
            transfers: transfersList,
            systemLogs: logsList,
            defaultInitialBalance: 1000
          };
          localStorage.setItem('egobey_db_backup', JSON.stringify(backupObj));
          // If we have students on server, we don't need the restore suggestion anymore
          setShowRestoreSuggestion(false);
        } else {
          // No students on server. Check if we have a non-empty backup in localStorage
          if (savedBackupStr) {
            try {
              const savedBackup = JSON.parse(savedBackupStr);
              if (savedBackup.users && savedBackup.users.some((u: any) => u.role === 'student')) {
                setShowRestoreSuggestion(true);
              }
            } catch (e) {
              console.error('Error parsing local db backup:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  };

  const handleRestoreFromLocalStorage = async () => {
    const savedBackupStr = localStorage.getItem('egobey_db_backup');
    if (!savedBackupStr) return;
    try {
      const response = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: savedBackupStr
      });
      if (response.ok) {
        setShowRestoreSuggestion(false);
        fetchData();
        alert('¡Sincronización completada con éxito! Todos los alumnos, saldos e historial de transferencias han sido restaurados desde tu copia local.');
      } else {
        const data = await response.json();
        alert(data.error || 'Error al restaurar los datos.');
      }
    } catch (err: any) {
      alert('Error de red al restaurar los datos: ' + err.message);
    }
  };

  const handleManualExport = () => {
    window.location.href = '/api/backup';
  };

  const handleManualImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupError('');
    setBackupSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const json = JSON.parse(content);
        
        const response = await fetch('/api/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json)
        });

        if (response.ok) {
          setBackupSuccess('Copia de seguridad importada y restaurada de forma exitosa.');
          fetchData();
        } else {
          const data = await response.json();
          setBackupError(data.error || 'Error al procesar el archivo en el servidor.');
        }
      } catch (err: any) {
        setBackupError('Error al leer el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');

    if (!newUserName.trim() || !newUserUsername.trim() || !newUserPassword.trim()) {
      setCreateError('Todos los campos son obligatorios.');
      return;
    }

    try {
      const response = await fetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          username: newUserUsername,
          password: newUserPassword,
          initialBalance: Number(newUserInitialBalance) || 0
        }),
      });

      let data: any = {};
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.error('Failed to parse JSON response', jsonErr);
        }
      }

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear usuario');
      }

      setCreateSuccess(`¡Cuenta creada para ${data.user?.name || ''}!`);
      setNewUserName('');
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserInitialBalance('1000');
      
      // Refresh list
      fetchData();
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateSuccess('');
      }, 1500);
    } catch (err: any) {
      setCreateError(err.message || 'Error de red al crear el usuario.');
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError('');

    if (!selectedUser) return;
    if (!adjustAmount || isNaN(Number(adjustAmount)) || Number(adjustAmount) < 0) {
      setAdjustError('Introduce una cantidad válida mayor o igual a cero.');
      return;
    }

    try {
      const response = await fetch(`/users/${selectedUser.id}/adjust-balance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(adjustAmount),
          actionType: adjustAction
        }),
      });

      let data: any = {};
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.error('Failed to parse JSON response', jsonErr);
        }
      }

      if (!response.ok) {
        throw new Error(data.error || 'Error al ajustar el saldo');
      }

      // Success
      setAdjustAmount('');
      setSelectedUser(null);
      fetchData();
    } catch (err: any) {
      setAdjustError(err.message || 'Error de red.');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteError('');

    try {
      const response = await fetch(`/users/${deleteTarget.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let data: any = {};
        if (response.headers.get('content-type')?.includes('application/json')) {
          try {
            data = await response.json();
          } catch (e) {
            console.error(e);
          }
        }
        throw new Error(data.error || 'Error al eliminar usuario');
      }

      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      setDeleteError(err.message || 'Error de red al eliminar usuario.');
    }
  };

  const handleResetSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetSuccess('');

    if (resetConfirmText.toLowerCase() !== 'reiniciar') {
      alert('Por favor, escribe "REINICIAR" para confirmar la operación.');
      return;
    }

    try {
      const response = await fetch('/reset-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepUsers: resetKeepUsers,
          defaultBalance: Number(resetDefaultBalance) || 0
        }),
      });

      let data: any = {};
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.error('Failed to parse JSON response', jsonErr);
        }
      }

      if (!response.ok) {
        throw new Error(data.error || 'Error al reiniciar la simulación');
      }

      setResetSuccess('¡Simulación restablecida con éxito!');
      setResetConfirmText('');
      fetchData();
      setTimeout(() => setResetSuccess(''), 3000);
    } catch (err: any) {
      alert(err.message || 'Error de red.');
    }
  };

  const togglePasswordVisibility = (userId: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const filteredStudents = users
    .filter(u => u.role === 'student')
    .filter(u => 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.accountNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const totalMoneySupply = users
    .filter(u => u.role === 'student')
    .reduce((sum, u) => sum + u.balance, 0);

  const totalStudents = users.filter(u => u.role === 'student').length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header Bar */}
      <header className="bg-slate-900 text-white sticky top-0 z-10 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
                <Landmark className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="font-display font-bold text-lg tracking-tight block">EGOBEY Simulador</span>
                <span className="text-[10px] text-amber-400 font-semibold tracking-wider uppercase">Portal del Profesor</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden md:block text-right">
                <p className="text-sm font-semibold">{currentUser.name}</p>
                <p className="text-xs text-slate-400">Docente Principal</p>
              </div>
              <button 
                onClick={onLogout}
                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {showRestoreSuggestion && (
          <div className="bg-amber-500 text-white rounded-2xl p-5 mb-6 shadow-md border-l-4 border-amber-600 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 shrink-0 text-white mt-0.5" />
              <div>
                <h4 className="text-base font-bold font-display">¿Se ha actualizado el servidor?</h4>
                <p className="text-xs text-amber-50 mt-1 leading-relaxed">
                  Hemos detectado que el servidor no tiene cuentas de alumnos registradas, pero tienes una copia de seguridad guardada en la memoria de este navegador. ¿Deseas restaurarla ahora mismo para no perder ningún dato de la práctica?
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3 shrink-0">
              <button
                onClick={handleRestoreFromLocalStorage}
                className="bg-white hover:bg-slate-100 text-amber-700 hover:text-amber-800 text-xs font-bold px-4 py-2 rounded-xl transition-all shadow cursor-pointer"
              >
                Sincronizar y Recuperar Alumnos
              </button>
              <button
                onClick={() => setShowRestoreSuggestion(false)}
                className="text-white hover:bg-amber-600/50 text-xs font-medium px-3 py-2 rounded-xl transition-all cursor-pointer"
              >
                Descartar
              </button>
            </div>
          </div>
        )}
        
        {/* Welcome Section */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display text-slate-900">Control de Contabilidad Bancaria</h1>
            <p className="text-sm text-slate-500">Supervisa cuentas, audita transferencias y simula flujos de caja en el aula.</p>
          </div>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-md shadow-amber-100 transition-all cursor-pointer w-full md:w-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Crear Cuenta Alumno</span>
          </button>
        </div>

        {/* Financial Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Alumnos Registrados</p>
              <p className="text-2xl font-bold text-slate-900 font-display mt-0.5">{totalStudents}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Masa Monetaria Total</p>
              <p className="text-2xl font-bold text-slate-900 font-display mt-0.5 font-mono">{totalMoneySupply.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl">
              <History className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Transferencias Hechas</p>
              <p className="text-2xl font-bold text-slate-900 font-display mt-0.5">{transfers.length}</p>
            </div>
          </div>
        </div>

        {/* Tabs switcher */}
        <div className="flex border-b border-slate-200 mb-6 overflow-x-auto whitespace-nowrap">
          <button 
            onClick={() => setActiveTab('students')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'students' 
                ? 'border-amber-600 text-amber-600 bg-amber-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Cuentas de Alumnos</span>
          </button>
          <button 
            onClick={() => setActiveTab('transfers')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'transfers' 
                ? 'border-amber-600 text-amber-600 bg-amber-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Libro Diario de Transferencias</span>
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'logs' 
                ? 'border-amber-600 text-amber-600 bg-amber-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Auditoría de Ajustes</span>
          </button>
          <button 
            onClick={() => setActiveTab('reset')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'reset' 
                ? 'border-rose-600 text-rose-600 bg-rose-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Copia y Reinicio</span>
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <AnimatePresence mode="wait">
            
            {/* STUDENTS LIST TAB */}
            {activeTab === 'students' && (
              <motion.div
                key="students-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center pb-2">
                  <div className="relative rounded-xl shadow-sm flex-1 max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por alumno, usuario o IBAN..."
                      className="block w-full pl-9 pr-3 py-2 border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 rounded-xl text-sm"
                    />
                  </div>
                  <div className="text-xs font-semibold text-slate-400 self-center">
                    Mostrando {filteredStudents.length} de {totalStudents} alumnos
                  </div>
                </div>

                {filteredStudents.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
                    <p className="font-semibold text-slate-600">No se encontraron cuentas de alumnos</p>
                    <p className="text-xs text-slate-400 mt-1">Usa el botón "Crear Cuenta Alumno" para empezar la clase.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-4 px-2">Alumno</th>
                          <th className="py-4 px-2">Detalles de Acceso</th>
                          <th className="py-4 px-2">Número de Cuenta (IBAN)</th>
                          <th className="py-4 px-2 text-right">Saldo Actual</th>
                          <th className="py-4 px-2 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredStudents.map((student) => (
                          <tr key={student.id} className="hover:bg-slate-50/50 transition-all text-sm text-slate-700">
                            <td className="py-4 px-2">
                              <div>
                                <p className="font-bold text-slate-950 font-display">{student.name}</p>
                                <p className="text-xs text-slate-400">ID: {student.id}</p>
                              </div>
                            </td>
                            <td className="py-4 px-2">
                              <div className="space-y-1">
                                <p className="text-xs">
                                  <span className="font-semibold text-slate-400">Usuario:</span>{' '}
                                  <span className="font-mono bg-slate-100 px-1 rounded font-medium text-slate-800">{student.username}</span>
                                </p>
                                <div className="text-xs flex items-center space-x-1.5">
                                  <span className="font-semibold text-slate-400">Clave:</span>{' '}
                                  <span className="font-mono bg-slate-100 px-1 rounded font-medium text-slate-800">
                                    {visiblePasswords[student.id] ? student.password : '••••••'}
                                  </span>
                                  <button
                                    onClick={() => togglePasswordVisibility(student.id)}
                                    className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                                    title="Mostrar/Ocultar Contraseña"
                                  >
                                    {visiblePasswords[student.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-2">
                              <span className="font-mono text-xs bg-amber-50/50 text-amber-800 px-2 py-1 rounded-md font-semibold tracking-tight border border-amber-50/50">
                                {student.accountNumber}
                              </span>
                            </td>
                            <td className="py-4 px-2 text-right">
                              <span className="font-mono font-bold text-slate-900 text-base">
                                {student.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                              </span>
                            </td>
                            <td className="py-4 px-2">
                              <div className="flex justify-center items-center space-x-2">
                                <button
                                  onClick={() => setSelectedUser(student)}
                                  className="flex items-center space-x-1 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                  title="Añadir o quitar saldo"
                                >
                                  <Coins className="w-3.5 h-3.5" />
                                  <span>Fondos</span>
                                </button>
                                <button
                                  onClick={() => { setDeleteTarget(student); setDeleteError(''); }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                  title="Eliminar Cuenta"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}

            {/* TRANSFERS LEDGER TAB */}
            {activeTab === 'transfers' && (
              <motion.div
                key="transfers-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center pb-2">
                  <h3 className="font-display font-bold text-slate-800 text-base">Libro Diario de Asientos de Transferencia</h3>
                  <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    {transfers.length} Operaciones
                  </span>
                </div>

                {transfers.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
                    <p className="font-semibold text-slate-600">Aún no se han realizado transferencias</p>
                    <p className="text-xs text-slate-400 mt-1">Los movimientos de los alumnos aparecerán en este diario mercantil de manera inmediata.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-2">Fecha y Hora</th>
                          <th className="py-3 px-2">Emisor (Debe)</th>
                          <th className="py-3 px-2">Receptor (Haber)</th>
                          <th className="py-3 px-2">Concepto Contable</th>
                          <th className="py-3 px-2 text-right">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {transfers.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-50/50 transition-all text-sm text-slate-700">
                            <td className="py-4 px-2 whitespace-nowrap text-xs text-slate-400 font-mono">
                              {new Date(tx.timestamp).toLocaleString('es-ES')}
                            </td>
                            <td className="py-4 px-2">
                              <div>
                                <span className="font-semibold text-slate-900">{tx.senderName}</span>
                                <span className="block font-mono text-[10px] text-slate-400 tracking-tight">{tx.senderAccount}</span>
                              </div>
                            </td>
                            <td className="py-4 px-2">
                              <div>
                                <span className="font-semibold text-slate-900">{tx.receiverName}</span>
                                <span className="block font-mono text-[10px] text-slate-400 tracking-tight">{tx.receiverAccount}</span>
                              </div>
                            </td>
                            <td className="py-4 px-2 max-w-xs truncate text-slate-600" title={tx.concept}>
                              {tx.concept}
                            </td>
                            <td className="py-4 px-2 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                              {tx.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}

            {/* AUDIT LOGS TAB */}
            {activeTab === 'logs' && (
              <motion.div
                key="logs-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center pb-2">
                  <h3 className="font-display font-bold text-slate-800 text-base">Registro de Acciones del Banco Central (Profesor)</h3>
                  <p className="text-xs text-slate-400">Historial de auditoría inmutable de creaciones, eliminaciones y regulaciones de capital.</p>
                </div>

                {logs.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
                    <p className="font-semibold text-slate-600">No hay registros de auditoría todavía</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {logs.map((log) => (
                      <div key={log.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-start space-x-3 text-xs text-slate-600">
                        <span className="font-mono text-slate-400 mt-0.5 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString('es-ES')}
                        </span>
                        
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              log.action === 'BALANCE_ADJUSTMENT' ? 'bg-amber-100 text-amber-800' :
                              log.action === 'CREATE_USER' ? 'bg-emerald-100 text-emerald-800' :
                              log.action === 'DELETE_USER' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-800'
                            }`}>
                              {log.action}
                            </span>
                          </div>
                          <p className="text-slate-800 font-medium text-sm leading-relaxed">{log.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* RESET SIMULATION TAB */}
            {activeTab === 'reset' && (
              <motion.div
                key="reset-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-xl mx-auto py-4 space-y-6"
              >
                {/* BACKUP & RESTORE SECTION */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm space-y-5 animate-fade-in">
                  <div className="flex items-center space-x-3 text-slate-800">
                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold font-display text-slate-900">Copias de Seguridad y Salvaguarda</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Descarga o restaura los datos del simulador en un solo archivo offline.</p>
                    </div>
                  </div>

                  {backupSuccess && (
                    <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3.5 rounded-r-xl flex items-center space-x-2.5 text-xs text-emerald-800 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{backupSuccess}</span>
                    </div>
                  )}

                  {backupError && (
                    <div className="bg-rose-50 border-l-4 border-rose-500 p-3.5 rounded-r-xl flex items-center space-x-2.5 text-xs text-rose-800 font-semibold">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{backupError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Export Card */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-700 block mb-1">Exportar Copia</span>
                        <span className="text-[11px] text-slate-400 leading-relaxed block mb-4">
                          Descarga un archivo JSON con todos los alumnos, contraseñas, saldos e historial de transferencias actuales.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleManualExport}
                        className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg transition-all flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Descargar JSON</span>
                      </button>
                    </div>

                    {/* Import Card */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-700 block mb-1">Importar Copia</span>
                        <span className="text-[11px] text-slate-400 leading-relaxed block mb-4">
                          Sube un archivo JSON de copia de seguridad previamente descargado para restaurar el estado completo de la clase.
                        </span>
                      </div>
                      <label className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg transition-all flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer text-center">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Subir Copia JSON</span>
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleManualImport}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* FIREBASE CLOUD BACKUP SECTION */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm space-y-5 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 text-slate-800">
                      <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold font-display text-slate-900">Copia de Seguridad en la Nube (Firebase)</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Sincroniza y salvaguarda los datos de la simulación en Google Cloud Firestore.</p>
                      </div>
                    </div>

                    {firebaseConfig?.configured && (
                      <button
                        type="button"
                        onClick={checkFirebaseStatus}
                        disabled={checkingFirebase}
                        className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-all"
                        title="Verificar conexión de nuevo"
                      >
                        <RefreshCw className={`w-4 h-4 ${checkingFirebase ? 'animate-spin text-sky-600' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Config Status Info */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 font-medium">Estado del Entorno Firebase:</span>
                      {firebaseConfig === null ? (
                        <span className="text-slate-400 animate-pulse">Cargando...</span>
                      ) : !firebaseConfig.configured ? (
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 font-semibold rounded-md flex items-center space-x-1 border border-rose-100">
                          <CloudOff className="w-3 h-3 shrink-0" />
                          <span>Falta Configuración</span>
                        </span>
                      ) : firebaseStatus?.success ? (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-md flex items-center space-x-1 border border-emerald-100">
                          <Cloud className="w-3 h-3 shrink-0 animate-pulse" />
                          <span>Conectado y Listo</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold rounded-md flex items-center space-x-1 border border-amber-100">
                          <CloudOff className="w-3 h-3 shrink-0" />
                          <span>Requiere Atención</span>
                        </span>
                      )}
                    </div>

                    {firebaseConfig?.configured && (
                      <div className="text-[11px] text-slate-600 space-y-1 bg-white p-3 rounded-lg border border-slate-100 font-mono">
                        <div><span className="text-slate-400 font-semibold select-none">ID Proyecto:</span> {firebaseConfig.projectId}</div>
                        {firebaseStatus && !firebaseStatus.success && firebaseStatus.details && (
                          <div className="mt-2.5 pt-2 border-t border-dashed border-slate-100 text-xs text-amber-800 leading-relaxed font-sans font-medium space-y-1">
                            <div className="flex items-start space-x-1.5 text-amber-700 font-bold mb-1">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>Base de Datos no Inicializada:</span>
                            </div>
                            <p className="pl-5">{firebaseStatus.details}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {firebaseSuccess && (
                    <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3.5 rounded-r-xl flex items-center space-x-2.5 text-xs text-emerald-800 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{firebaseSuccess}</span>
                    </div>
                  )}

                  {firebaseError && (
                    <div className="bg-rose-50 border-l-4 border-rose-500 p-3.5 rounded-r-xl flex items-start space-x-2.5 text-xs text-rose-800 font-semibold">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div>{firebaseError}</div>
                        {firebaseStatus && !firebaseStatus.success && (
                          <div className="text-[11px] font-normal text-rose-700 bg-white/50 p-2 rounded border border-rose-100 mt-1.5">
                            {firebaseStatus.details}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Cloud Backup Card */}
                    <button
                      type="button"
                      disabled={!firebaseConfig?.configured || checkingFirebase || firebaseActionLoading}
                      onClick={handleFirebaseBackup}
                      className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-sky-50/50 hover:border-sky-100 text-left transition-all group cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <span className="text-xs font-bold text-slate-700 block mb-1 group-hover:text-sky-950">Respaldar en la Nube</span>
                      <span className="text-[11px] text-slate-400 leading-relaxed block mb-4">
                        Guarda el estado actual de la clase de manera segura y duradera en Firestore para prevenir pérdidas de datos.
                      </span>
                      <div className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 group-hover:bg-sky-700 text-white font-semibold text-xs rounded-lg transition-all flex items-center justify-center space-x-1.5 shadow-sm">
                        <Cloud className="w-3.5 h-3.5" />
                        <span>{firebaseActionLoading ? 'Guardando...' : 'Respaldar Ahora'}</span>
                      </div>
                    </button>

                    {/* Cloud Restore Card */}
                    <button
                      type="button"
                      disabled={!firebaseConfig?.configured || checkingFirebase || firebaseActionLoading}
                      onClick={handleFirebaseRestore}
                      className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-amber-50/50 hover:border-amber-100 text-left transition-all group cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <span className="text-xs font-bold text-slate-700 block mb-1 group-hover:text-amber-950">Restaurar de la Nube</span>
                      <span className="text-[11px] text-slate-400 leading-relaxed block mb-4">
                        Recupera la copia de seguridad más reciente de Firestore para restablecer toda la simulación al último guardado.
                      </span>
                      <div className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 group-hover:bg-amber-700 text-white font-semibold text-xs rounded-lg transition-all flex items-center justify-center space-x-1.5 shadow-sm">
                        <RefreshCw className={`w-3.5 h-3.5 ${firebaseActionLoading ? 'animate-spin' : ''}`} />
                        <span>{firebaseActionLoading ? 'Restaurando...' : 'Restaurar Ahora'}</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl">
                  <div className="flex space-x-3">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-rose-900 font-display">Zona de Peligro: Reinicio Contable</h4>
                      <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                        Esta acción permite reiniciar los balances y limpiar el libro diario de transferencias para comenzar una nueva práctica mercantil o una clase diferente.
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleResetSimulation} className="space-y-6">
                  {resetSuccess && (
                    <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-xl flex items-center space-x-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <span className="text-sm text-emerald-800 font-semibold">{resetSuccess}</span>
                    </div>
                  )}

                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                    <h4 className="text-sm font-bold text-slate-800">Opciones de Reinicio</h4>
                    
                    <div className="space-y-3">
                      <label className="flex items-start space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          checked={resetKeepUsers === true}
                          onChange={() => setResetKeepUsers(true)}
                          className="mt-1 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-semibold text-slate-800 block">Mantener Alumnos y Restablecer Saldos</span>
                          <span className="text-xs text-slate-400 block mt-0.5">Mantiene las cuentas y claves de los alumnos, pero borra su historial y establece sus saldos al valor predefinido.</span>
                        </div>
                      </label>

                      <label className="flex items-start space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          checked={resetKeepUsers === false}
                          onChange={() => setResetKeepUsers(false)}
                          className="mt-1 text-rose-600 focus:ring-rose-500"
                        />
                        <div>
                          <span className="text-sm font-semibold text-slate-800 block">Eliminar Todo (Cero Absoluto)</span>
                          <span className="text-xs text-slate-400 block mt-0.5">Elimina todas las cuentas de alumnos, claves, transferencias y registros del sistema para empezar de cero.</span>
                        </div>
                      </label>
                    </div>

                    <div className="border-t border-slate-200/50 pt-4 mt-4">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Saldo Inicial por Defecto para Alumnos
                      </label>
                      <div className="relative rounded-xl max-w-[200px]">
                        <input
                          type="number"
                          value={resetDefaultBalance}
                          onChange={(e) => setResetDefaultBalance(e.target.value)}
                          min="0"
                          required
                          className="block w-full pr-10 py-2 border border-slate-200 bg-white rounded-xl text-sm font-mono text-slate-900"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-sm font-mono">
                          €
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Escribe <code className="font-mono bg-slate-100 px-1 border rounded text-rose-600 font-bold">reiniciar</code> para confirmar:
                    </label>
                    <input
                      type="text"
                      value={resetConfirmText}
                      onChange={(e) => setResetConfirmText(e.target.value)}
                      required
                      placeholder="reiniciar"
                      className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resetConfirmText.toLowerCase() !== 'reiniciar'}
                    className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-rose-100 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    <span>Ejecutar Reinicio del Simulador</span>
                  </button>
                </form>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* CREATE STUDENT MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="font-display font-bold text-base flex items-center">
                  <UserPlus className="w-5 h-5 mr-2 text-amber-400" />
                  Nueva Cuenta de Alumno
                </h3>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                {createError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700">
                    {createError}
                  </div>
                )}
                {createSuccess && (
                  <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg text-xs font-semibold text-emerald-700">
                    {createSuccess}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Completo del Alumno</label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="ej. Daniel Arnaiz"
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario de Acceso</label>
                    <input
                      type="text"
                      required
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      placeholder="ej. daniel"
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña</label>
                    <input
                      type="text"
                      required
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="ej. 123"
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Saldo de Apertura (€)</label>
                  <input
                    type="number"
                    value={newUserInitialBalance}
                    onChange={(e) => setNewUserInitialBalance(e.target.value)}
                    min="0"
                    placeholder="1000"
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Número de cuenta (IBAN) simulado de la UE se generará de manera automática.
                  </p>
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-colors cursor-pointer"
                  >
                    Crear Cuenta
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADJUST FUNDS MODAL */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="font-display font-bold text-base flex items-center">
                  <Coins className="w-5 h-5 mr-2 text-amber-400" />
                  Regular Fondos de Alumno
                </h3>
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAdjustBalance} className="p-6 space-y-4">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Alumno</p>
                    <p className="font-bold text-slate-800 font-display text-sm">{selectedUser.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 uppercase">Saldo Actual</p>
                    <p className="font-mono font-bold text-slate-900 text-base">{selectedUser.balance.toLocaleString('es-ES')} €</p>
                  </div>
                </div>

                {adjustError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700">
                    {adjustError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Acción Contable</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustAction('add')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer ${
                        adjustAction === 'add' 
                          ? 'border-amber-600 bg-amber-50 text-amber-700' 
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>Añadir (+)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustAction('subtract')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer ${
                        adjustAction === 'subtract' 
                          ? 'border-rose-600 bg-rose-50 text-rose-700' 
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Minus className="w-4 h-4" />
                      <span>Quitar (-)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustAction('set')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer ${
                        adjustAction === 'set' 
                          ? 'border-slate-900 bg-slate-900 text-white' 
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Settings className="w-4 h-4" />
                      <span>Fijar (=)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Importe en Euros (€)</label>
                  <div className="relative rounded-xl">
                    <input
                      type="number"
                      required
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      min="0"
                      placeholder="0.00"
                      className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 font-mono text-sm">
                      €
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Esta modificación se registrará en el diario de auditoría indicando los saldos previos y posteriores.
                  </p>
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-colors cursor-pointer"
                  >
                    Guardar Ajuste
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-rose-950 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="font-display font-bold text-base flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-rose-400" />
                  Confirmar Eliminación de Cuenta
                </h3>
                <button 
                  onClick={() => setDeleteTarget(null)}
                  className="p-1 rounded-lg text-rose-300 hover:text-white hover:bg-rose-900 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl space-y-2">
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider">¡Atención! Operación Irreversible</h4>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    Estás a punto de eliminar permanentemente la cuenta de <strong className="font-bold">{deleteTarget.name}</strong>. Se destruirá su saldo disponible de <strong className="font-bold">{deleteTarget.balance.toLocaleString('es-ES')} €</strong> y no podrá volver a iniciar sesión.
                  </p>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100/80 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Nombre:</span>
                    <span className="font-bold text-slate-800">{deleteTarget.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Usuario:</span>
                    <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">{deleteTarget.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">IBAN:</span>
                    <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">{deleteTarget.accountNumber}</span>
                  </div>
                </div>

                {deleteError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700">
                    {deleteError}
                  </div>
                )}

                <p className="text-[11px] text-slate-400 leading-normal italic text-center">
                  Para mantener la integridad mercantil, el registro de las transferencias emitidas o recibidas por este alumno no se eliminará del libro diario de operaciones.
                </p>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteUser}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-colors cursor-pointer"
                  >
                    Sí, Eliminar Cuenta
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
