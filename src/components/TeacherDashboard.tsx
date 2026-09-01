/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, Landmark, UserPlus, Coins, History, RotateCcw, 
  Trash2, Search, ArrowUpRight, ArrowDownLeft, Eye, EyeOff, 
  X, Plus, Minus, Settings, FileText, CheckCircle2, AlertTriangle, LogOut,
  Download, Upload, Database, RefreshCw, Edit, Edit3, Building2, Wrench, Package, Layers, Truck, Check, XCircle
} from 'lucide-react';
import { User, Transfer, SystemLog, PropertyAcquisition, MachineryAcquisition, RawMaterialAnnouncement, RawMaterialOrder } from '../types.js';
import TeacherLoanManagement from './TeacherLoanManagement.js';
import TeacherAssetsAndDebtsManagement from './TeacherAssetsAndDebtsManagement.js';
import Footer from './Footer.js';
import { formatNumber } from '../lib/formatters.js';

interface TeacherDashboardProps {
  currentUser: User;
  onLogout: () => void;
  onBackToHub?: () => void;
}

const TEACHER_PRODUCT_PRESETS = {
  hierro: {
    materialType: 'hierro' as const,
    title: 'Fragmentos de hierro',
    presentation: 'Pallet de 1.000 kg (Fragmentos)',
    description: 'Materia prima metálica de alta calidad para producción en línea de varilla y punta. Presentación en palet de 1.000 kg.',
    unitWeightKg: 1000,
    isPallet: true,
    defaultPrice: 450
  },
  plastico: {
    materialType: 'plastico' as const,
    title: 'Pellets de plástico',
    presentation: 'Pallet de 1.000 kg (40 sacos de 25 kg)',
    description: 'Polímero plástico en pellets para inyección de mangos. 40 sacos de 25 kg por palet (total 1.000 kg).',
    unitWeightKg: 1000,
    isPallet: true,
    defaultPrice: 380
  },
  epoxi: {
    materialType: 'epoxi' as const,
    title: 'Pegamento epoxi',
    presentation: 'Lata de 5 kg',
    description: 'Resina y pegamento epoxi bicomponente de grado industrial para ensamblaje final. Lata de 5 kg.',
    unitWeightKg: 5,
    isPallet: false,
    defaultPrice: 45
  }
};

export default function TeacherDashboard({ currentUser, onLogout, onBackToHub }: TeacherDashboardProps) {
  const [activeTab, setActiveTab] = useState<'students' | 'assets' | 'transfers' | 'loans' | 'logs' | 'reset' | 'raw_materials'>('students');
  const [users, setUsers] = useState<User[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Raw Materials Teacher Management State
  const [rmAnnouncements, setRmAnnouncements] = useState<RawMaterialAnnouncement[]>([]);
  const [rmOrders, setRmOrders] = useState<RawMaterialOrder[]>([]);
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);
  const [editPriceInput, setEditPriceInput] = useState<string>('');

  // Raw Material Announcement Modal & Deletion State
  const [isAnnModalOpen, setIsAnnModalOpen] = useState(false);
  const [editingAnnFullId, setEditingAnnFullId] = useState<string | null>(null);
  const [annPreset, setAnnPreset] = useState<'hierro' | 'plastico' | 'epoxi' | 'custom'>('hierro');
  const [annTitle, setAnnTitle] = useState('Fragmentos de hierro');
  const [annPresentation, setAnnPresentation] = useState('Pallet de 1.000 kg (Fragmentos)');
  const [annDescription, setAnnDescription] = useState('Materia prima metálica de alta calidad para producción en línea de varilla y punta. Presentación en palet de 1.000 kg.');
  const [annPrice, setAnnPrice] = useState<number | string>(450);
  const [annStock, setAnnStock] = useState<number | string>('ilimitado');
  const [annUnitWeightKg, setAnnUnitWeightKg] = useState<number | string>(1000);
  const [annIsPallet, setAnnIsPallet] = useState(true);
  const [annMaterialType, setAnnMaterialType] = useState<'hierro' | 'plastico' | 'epoxi' | 'producto_final'>('hierro');
  const [annError, setAnnError] = useState('');
  const [isSubmittingAnn, setIsSubmittingAnn] = useState(false);

  // Deletion modal state for raw material announcement
  const [deletingAnn, setDeletingAnn] = useState<RawMaterialAnnouncement | null>(null);
  const [isDeletingAnn, setIsDeletingAnn] = useState(false);
  
  // Create user form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserInitialBalance, setNewUserInitialBalance] = useState('1000');
  const [newUserLevel, setNewUserLevel] = useState<'1' | '2' | '3'>('1');
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Balance adjustment modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustAction, setAdjustAction] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustConcept, setAdjustConcept] = useState('');
  const [adjustError, setAdjustError] = useState('');

  // Edit user state
  const [editUserTarget, setEditUserTarget] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [isEditingUser, setIsEditingUser] = useState(false);

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

  // Supabase Status State
  const [supabaseStatus, setSupabaseStatus] = useState<{
    connected: boolean;
    cuentasCount?: number;
    movimientosCount?: number;
    dbUrlMasked?: string;
    message?: string;
    error?: string;
  } | null>(null);

  const [supabaseUrlInput, setSupabaseUrlInput] = useState('');
  const [isConnectingSupabase, setIsConnectingSupabase] = useState(false);
  const [supabaseMsg, setSupabaseMsg] = useState('');
  const [supabaseErr, setSupabaseErr] = useState('');

  const handleConnectSupabase = async () => {
    if (!supabaseUrlInput.trim()) return;
    setIsConnectingSupabase(true);
    setSupabaseMsg('');
    setSupabaseErr('');
    try {
      const res = await fetch('/api/supabase-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: supabaseUrlInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSupabaseMsg(data.message || 'Conectado a Supabase correctamente.');
        fetchData();
      } else {
        setSupabaseErr(data.error || 'Error al conectar con Supabase.');
      }
    } catch (e: any) {
      setSupabaseErr('Error de red: ' + (e.message || String(e)));
    } finally {
      setIsConnectingSupabase(false);
    }
  };

  const handleSyncSupabase = async () => {
    setIsConnectingSupabase(true);
    setSupabaseMsg('');
    setSupabaseErr('');
    try {
      const res = await fetch('/api/supabase-sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSupabaseMsg(data.message || 'Sincronización completada.');
        fetchData();
      } else {
        setSupabaseErr(data.error || 'Error en la sincronización.');
      }
    } catch (e: any) {
      setSupabaseErr('Error de red: ' + (e.message || String(e)));
    } finally {
      setIsConnectingSupabase(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll dashboard data every 4 seconds to maintain real-time sync with student activities
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const [usersRes, transfersRes, logsRes, supabaseRes, annRes, ordRes] = await Promise.all([
        fetch('/users?role=teacher'),
        fetch('/transfers?role=teacher'),
        fetch('/logs'),
        fetch('/api/supabase-status').catch(() => null),
        fetch('/api/raw-materials/announcements').catch(() => null),
        fetch('/api/raw-materials/orders?studentId=profesor-1').catch(() => null)
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
      if (supabaseRes && supabaseRes.ok) {
        const sbData = await supabaseRes.json();
        setSupabaseStatus(sbData);
        if (sbData.dbUrlMasked && !supabaseUrlInput) {
          setSupabaseUrlInput(sbData.dbUrlMasked);
        }
      }
      if (annRes && annRes.ok) {
        const annData = await annRes.json();
        if (annData.announcements) setRmAnnouncements(annData.announcements);
      }
      if (ordRes && ordRes.ok) {
        const ordData = await ordRes.json();
        if (ordData.orders) setRmOrders(ordData.orders);
      }

      setUsers(usersList);
      setTransfers(transfersList);
      setLogs(logsList);

      // Save a browser-side copy of the database to local storage as a safety fallback
      if (usersList.length > 0) {
        const hasStudents = usersList.some(u => u.role === 'student');
        
        const backupObj = {
          users: usersList,
          transfers: transfersList,
          systemLogs: logsList,
          defaultInitialBalance: 1000
        };
        const dbStr = JSON.stringify(backupObj);

        if (hasStudents) {
          localStorage.setItem('egobey_db_backup', dbStr);
          setShowRestoreSuggestion(false);
        } else {
          const savedBackupStr = localStorage.getItem('egobey_db_backup');
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
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          username: newUserUsername,
          password: newUserPassword,
          initialBalance: Number(newUserInitialBalance) || 0,
          level: Number(newUserLevel) || 1
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

      setCreateSuccess(`¡Cuenta de nivel ${data.user?.level || newUserLevel} creada para ${data.user?.name || ''}!`);
      setNewUserName('');
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserInitialBalance('1000');
      setNewUserLevel('1');
      
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
          actionType: adjustAction,
          concept: adjustConcept
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
      setAdjustConcept('');
      setSelectedUser(null);
      fetchData();
    } catch (err: any) {
      setAdjustError(err.message || 'Error de red.');
    }
  };

  const handleOpenEditUser = (user: User) => {
    setEditUserTarget(user);
    setEditName(user.name);
    setEditUsername(user.username);
    setEditPassword(user.password || '');
    setEditError('');
    setEditSuccess('');
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserTarget) return;
    setEditError('');
    setEditSuccess('');
    setIsEditingUser(true);

    try {
      const res = await fetch(`/api/users/${editUserTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          username: editUsername,
          password: editPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Error al actualizar los datos del alumno');
      } else {
        setEditSuccess('¡Datos del alumno actualizados con éxito!');
        fetchData();
        setTimeout(() => {
          setEditUserTarget(null);
          setEditSuccess('');
        }, 1200);
      }
    } catch (err) {
      setEditError('Error de red al actualizar los datos');
    } finally {
      setIsEditingUser(false);
    }
  };

  const handleUpdateStudentLevel = async (studentId: string, level: number) => {
    try {
      const res = await fetch(`/api/teacher/students/${studentId}/level`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error('Error updating student level:', e);
    }
  };

  const handleSelectAnnPreset = (key: 'hierro' | 'plastico' | 'epoxi') => {
    setAnnPreset(key);
    const p = TEACHER_PRODUCT_PRESETS[key];
    setAnnTitle(p.title);
    setAnnPresentation(p.presentation);
    setAnnDescription(p.description);
    setAnnPrice(p.defaultPrice);
    setAnnUnitWeightKg(p.unitWeightKg);
    setAnnIsPallet(p.isPallet);
    setAnnMaterialType(p.materialType);
    setAnnError('');
  };

  const handleOpenCreateAnnouncementModal = () => {
    setEditingAnnFullId(null);
    handleSelectAnnPreset('hierro');
    setAnnStock('ilimitado');
    setAnnError('');
    setIsAnnModalOpen(true);
  };

  const handleOpenEditFullAnnouncementModal = (ann: RawMaterialAnnouncement) => {
    setEditingAnnFullId(ann.id);
    setAnnTitle(ann.title || '');
    setAnnPresentation(ann.presentation || 'Pallet');
    setAnnDescription(ann.description || '');
    setAnnPrice(ann.pricePerUnit || 0);
    setAnnStock(ann.stock === undefined || ann.stock === null || ann.stock === 'ilimitado' ? 'ilimitado' : ann.stock);
    setAnnUnitWeightKg(ann.unitWeightKg || 1000);
    setAnnIsPallet(ann.isPallet !== undefined ? ann.isPallet : true);
    setAnnMaterialType((ann.materialType as any) || 'hierro');

    const lower = (ann.title || '').toLowerCase();
    if (lower.includes('hierro')) setAnnPreset('hierro');
    else if (lower.includes('plást') || lower.includes('plast')) setAnnPreset('plastico');
    else if (lower.includes('epoxi')) setAnnPreset('epoxi');
    else setAnnPreset('custom');

    setAnnError('');
    setIsAnnModalOpen(true);
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim()) {
      setAnnError('Debes indicar un título para el anuncio.');
      return;
    }
    const numPrice = Number(annPrice);
    if (isNaN(numPrice) || numPrice <= 0) {
      setAnnError('Debes indicar un precio unitario válido mayor a 0 €.');
      return;
    }

    setIsSubmittingAnn(true);
    setAnnError('');
    try {
      const payload = {
        title: annTitle.trim(),
        presentation: annPresentation.trim(),
        description: annDescription.trim(),
        pricePerUnit: numPrice,
        stock: annStock === '' || annStock === 'ilimitado' ? 'ilimitado' : Number(annStock),
        unitWeightKg: Number(annUnitWeightKg) || 1000,
        isPallet: annIsPallet,
        materialType: annMaterialType,
        sellerId: 'profesor-1',
        sellerName: 'BricoMaster Distribuciones, S.A.',
        durationDays: 'indefinido'
      };

      let res;
      if (editingAnnFullId) {
        res = await fetch(`/api/raw-materials/announcements/${editingAnnFullId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/raw-materials/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        setIsAnnModalOpen(false);
        setEditingAnnFullId(null);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        setAnnError(data.error || 'Error al guardar el anuncio.');
      }
    } catch (err) {
      setAnnError('Error de conexión con el servidor.');
    } finally {
      setIsSubmittingAnn(false);
    }
  };

  const handleConfirmDeleteAnnouncement = async () => {
    if (!deletingAnn) return;
    setIsDeletingAnn(true);
    try {
      const res = await fetch(`/api/raw-materials/announcements/${deletingAnn.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setDeletingAnn(null);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Error al eliminar el anuncio.');
      }
    } catch (err) {
      alert('Error de conexión al eliminar el anuncio.');
    } finally {
      setIsDeletingAnn(false);
    }
  };

  const handleSaveAnnouncementPrice = async (annId: string) => {
    const p = parseFloat(editPriceInput);
    if (isNaN(p) || p < 0) return;
    try {
      const res = await fetch(`/api/teacher/raw-materials/announcements/${annId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricePerUnit: p })
      });
      if (res.ok) {
        setEditingAnnId(null);
        setEditPriceInput('');
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/raw-materials/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'profesor-1' })
      });
      if (res.ok) {
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error || 'Error al aprobar solicitud');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/raw-materials/orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'profesor-1', rejectionReason: 'Rechazado por el profesor' })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteError('');

    try {
      const response = await fetch(`/api/users/${deleteTarget.id}`, {
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
      const response = await fetch('/api/reset-simulation', {
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
              {onBackToHub && (
                <button
                  onClick={onBackToHub}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 hover:text-white transition cursor-pointer"
                  title="Volver al menú principal"
                >
                  <ArrowDownLeft className="w-4 h-4 transform rotate-45" />
                </button>
              )}
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
                <Landmark className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="font-display font-bold text-lg tracking-tight block">ContaLab</span>
                <span className="text-[10px] text-amber-400 font-semibold tracking-wider uppercase">Banco simulado • Profesor</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden md:block text-right">
                <p className="text-sm font-semibold">{currentUser.name}</p>
                <p className="text-xs text-slate-400">Docente principal</p>
              </div>
              <button 
                onClick={onLogout}
                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar sesión</span>
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
                Sincronizar y recuperar alumnos
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
            <h1 className="text-2xl font-bold font-display text-slate-900">Control de contabilidad bancaria</h1>
            <p className="text-sm text-slate-500">Supervisa cuentas, audita transferencias y simula flujos de caja en el aula.</p>
          </div>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-md shadow-amber-100 transition-all cursor-pointer w-full md:w-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Crear cuenta alumno</span>
          </button>
        </div>

        {/* Financial Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Alumnos registrados</p>
              <p className="text-2xl font-bold text-slate-900 font-display mt-0.5">{totalStudents}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Masa monetaria total</p>
              <p className="text-2xl font-bold text-slate-900 font-display mt-0.5 font-mono">{formatNumber(totalMoneySupply)} €</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl">
              <History className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Transferencias hechas</p>
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
            <span>Cuentas de alumnos</span>
          </button>
          <button 
            onClick={() => setActiveTab('assets')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'assets' 
                ? 'border-amber-600 text-amber-600 bg-amber-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Activos, deudas y pasivos</span>
          </button>
          <button 
            onClick={() => setActiveTab('raw_materials')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'raw_materials' 
                ? 'border-amber-600 text-amber-600 bg-amber-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Materias primas ({rmOrders.filter(o => o.status === 'pending').length})</span>
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
            <span>Libro diario de transferencias</span>
          </button>
          <button 
            onClick={() => setActiveTab('loans')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'loans' 
                ? 'border-amber-600 text-amber-600 bg-amber-50/20' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>Préstamos hipotecarios</span>
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
            <span>Auditoría de ajustes</span>
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
            <span>Copia y reinicio</span>
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
                    <p className="text-xs text-slate-400 mt-1">Usa el botón "Crear cuenta de alumno" para empezar la clase.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-4 px-2">Alumno</th>
                          <th className="py-4 px-2">Clasificación / nivel</th>
                          <th className="py-4 px-2">Detalles de acceso</th>
                          <th className="py-4 px-2">Número de cuenta (IBAN)</th>
                          <th className="py-4 px-2 text-right">Saldo actual</th>
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
                              <select
                                value={student.level || 1}
                                onChange={(e) => handleUpdateStudentLevel(student.id, Number(e.target.value))}
                                className="bg-slate-100 hover:bg-white text-slate-900 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                              >
                                <option value={1}>Nivel 1 (Materias primas)</option>
                                <option value={2}>Nivel 2</option>
                                <option value={3}>Nivel 3</option>
                              </select>
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
                                    title="Mostrar/Ocultar contraseña"
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
                                {formatNumber(student.balance)} €
                              </span>
                            </td>
                            <td className="py-4 px-2">
                              <div className="flex justify-center items-center space-x-2">
                                <button
                                  onClick={() => handleOpenEditUser(student)}
                                  className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                  title="Editar nombre, usuario y contraseña"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Editar</span>
                                </button>
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
                                  title="Eliminar cuenta"
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

            {/* ACTIVOS Y PASIVOS MANAGEMENT TAB */}
            {activeTab === 'assets' && (
              <motion.div
                key="assets-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <TeacherAssetsAndDebtsManagement students={users.filter(u => u.role === 'student')} />
              </motion.div>
            )}

            {/* RAW MATERIALS MANAGEMENT TAB */}
            {activeTab === 'raw_materials' && (
              <motion.div
                key="raw-materials-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Section A: Catalog & Pricing */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                        <Package className="w-5 h-5 text-amber-600" />
                        <span>Publicación de anuncios y precios de materias primas</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        El profesor puede crear, editar y eliminar los anuncios de materias primas disponibles para los alumnos de nivel 1.
                      </p>
                    </div>
                    <button
                      onClick={handleOpenCreateAnnouncementModal}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Publicar nuevo anuncio</span>
                    </button>
                  </div>

                  {rmAnnouncements.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                      <Package className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
                      <p className="text-sm font-semibold text-slate-700">No hay anuncios de materias primas publicados</p>
                      <p className="text-xs text-slate-400 mt-1">Haz clic en &ldquo;Publicar nuevo anuncio&rdquo; para ofertar suministros a los alumnos.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {rmAnnouncements.map((ann) => (
                        <div key={ann.id} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-bold text-slate-900 text-sm leading-snug">{ann.title || ann.materialName}</h4>
                                <p className="text-xs text-slate-500 font-medium">{ann.presentation}</p>
                              </div>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                {ann.unit || (ann.isPallet ? 'Pallet' : 'Unidad')}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                              {ann.materialType !== 'producto_final' && !ann.title?.toLowerCase().includes('destornillador') && (
                                <>
                                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-mono">
                                    {ann.unitWeightKg ? `${ann.unitWeightKg} kg` : '1.000 kg'}
                                  </span>
                                  <span>•</span>
                                </>
                              )}
                              <span className="font-mono font-bold text-slate-600">
                                Stock: {ann.stock === undefined || ann.stock === null || ann.stock === 'ilimitado' ? 'Ilimitado' : `${ann.stock} u.`}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{ann.description}</p>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Precio unitario</span>
                                {editingAnnId === ann.id ? (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={editPriceInput}
                                      onChange={(e) => setEditPriceInput(e.target.value)}
                                      className="w-24 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      autoFocus
                                    />
                                    <span className="text-xs font-bold text-slate-600">€</span>
                                  </div>
                                ) : (
                                  <span className="text-lg font-bold font-mono text-emerald-700">
                                    {ann.pricePerUnit.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                  </span>
                                )}
                              </div>

                              {editingAnnId === ann.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleSaveAnnouncementPrice(ann.id)}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    onClick={() => setEditingAnnId(null)}
                                    className="px-2 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2 pt-1 border-t border-slate-50">
                              <button
                                onClick={() => handleOpenEditFullAnnouncementModal(ann)}
                                className="flex-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                title="Editar todos los campos del anuncio"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                                <span>Editar</span>
                              </button>
                              <button
                                onClick={() => {
                                  setEditingAnnId(ann.id);
                                  setEditPriceInput(ann.pricePerUnit.toString());
                                }}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                                title="Editar precio rápidamente"
                              >
                                <Coins className="w-3.5 h-3.5 text-amber-700" />
                                <span>Precio</span>
                              </button>
                              <button
                                onClick={() => setDeletingAnn(ann)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
                                title="Eliminar anuncio"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section B: Purchase Orders Approval */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>Solicitudes de compra de alumnos (nivel 1)</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Al aprobar una solicitud, se descontará automáticamente el importe del saldo bancario del alumno y la materia prima pasará a su inventario.
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-200">
                      {rmOrders.filter(o => o.status === 'pending').length} pendientes
                    </span>
                  </div>

                  {rmOrders.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-500" />
                      <p className="text-sm font-semibold text-slate-600">No hay solicitudes de compra registradas</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-100 uppercase tracking-wider">
                            <th className="py-3 px-3">Alumno</th>
                            <th className="py-3 px-3">Materia prima</th>
                            <th className="py-3 px-3 text-center">Cantidad</th>
                            <th className="py-3 px-3 text-right">Precio total</th>
                            <th className="py-3 px-3 text-center">Estado</th>
                            <th className="py-3 px-3 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rmOrders.map((ord) => {
                            const student = users.find(u => u.id === ord.studentId);
                            const ann = rmAnnouncements.find(a => a.id === ord.announcementId);
                            return (
                              <tr key={ord.id} className="hover:bg-slate-50">
                                <td className="py-3 px-3">
                                  <div className="font-bold text-slate-900">{ord.studentName}</div>
                                  <div className="text-[11px] text-slate-400">
                                    Nivel: {student?.level || 1} • {new Date(ord.createdAt).toLocaleString('es-ES')}
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="font-semibold text-slate-800">{ord.materialName}</div>
                                  <div className="text-[11px] text-slate-500">{ann?.presentation || ''}</div>
                                </td>
                                <td className="py-3 px-3 text-center font-bold font-mono text-slate-800">
                                  {ord.quantity} {ord.unit}
                                </td>
                                <td className="py-3 px-3 text-right font-bold font-mono text-emerald-700">
                                  {ord.totalPrice.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {ord.status === 'pending' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      Pendiente
                                    </span>
                                  )}
                                  {ord.status === 'approved' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      Aprobada
                                    </span>
                                  )}
                                  {ord.status === 'rejected' && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                      Rechazada
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {ord.status === 'pending' ? (
                                    <div className="flex justify-center gap-1.5">
                                      <button
                                        onClick={() => handleApproveOrder(ord.id)}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                        title="Aprobar y cobrar"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Aprobar</span>
                                      </button>
                                      <button
                                        onClick={() => handleRejectOrder(ord.id)}
                                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                        title="Rechazar solicitud"
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                        <span>Rechazar</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-[11px]">Procesada</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
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
                  <h3 className="font-display font-bold text-slate-800 text-base">Libro diario de asientos de transferencia</h3>
                  <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    {transfers.length} {transfers.length === 1 ? 'operación' : 'operaciones'}
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
                          <th className="py-3 px-2">Fecha y hora</th>
                          <th className="py-3 px-2">Emisor (debe)</th>
                          <th className="py-3 px-2">Receptor (haber)</th>
                          <th className="py-3 px-2">Concepto contable</th>
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
                              {formatNumber(tx.amount)} €
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
                  <h3 className="font-display font-bold text-slate-800 text-base">Registro de acciones del banco central (profesor)</h3>
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

            {/* LOANS MANAGEMENT TAB */}
            {activeTab === 'loans' && (
              <motion.div
                key="loans-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <TeacherLoanManagement />
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
                      <h4 className="text-sm font-bold font-display text-slate-900">Copias de seguridad y salvaguarda</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Guarda los datos del simulador en Google Drive o descárgalos localmente.</p>
                    </div>
                  </div>

                  {backupSuccess && (
                    <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3.5 rounded-r-xl flex items-center space-x-2.5 text-xs text-emerald-800 font-semibold animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{backupSuccess}</span>
                    </div>
                  )}

                  {backupError && (
                    <div className="bg-rose-50 border-l-4 border-rose-500 p-3.5 rounded-r-xl flex items-center space-x-2.5 text-xs text-rose-800 font-semibold animate-fade-in">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{backupError}</span>
                    </div>
                  )}

                  {/* Supabase Database Connection Block */}
                  <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className={`p-2 rounded-xl ${supabaseStatus?.connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          <Database className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800 block">Base de datos PostgreSQL (Supabase)</span>
                          <span className="text-[10px] text-slate-500 block">
                            {supabaseStatus?.connected 
                              ? `Conectado: ${supabaseStatus.dbUrlMasked || 'DATABASE_URL'}`
                              : 'Ingresa tu DATABASE_URL de Supabase para conectar y crear las tablas.'}
                          </span>
                        </div>
                      </div>

                      {supabaseStatus?.connected ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 rounded-lg">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Conectado
                          </span>
                          <button
                            type="button"
                            disabled={isConnectingSupabase}
                            onClick={handleSyncSupabase}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all flex items-center space-x-1 cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isConnectingSupabase ? 'animate-spin' : ''}`} />
                            <span>Sincronizar tablas</span>
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Sin conexión
                        </span>
                      )}
                    </div>

                    {/* Messages */}
                    {supabaseMsg && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{supabaseMsg}</span>
                      </div>
                    )}

                    {(supabaseErr || (supabaseStatus && !supabaseStatus.connected && supabaseStatus.error)) && (
                      <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{supabaseErr || supabaseStatus?.error || 'No se pudo establecer conexión con Supabase.'}</span>
                      </div>
                    )}

                    {/* Connection Form */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-xs space-y-3">
                      <label className="block text-xs font-semibold text-slate-700">
                        {supabaseStatus?.connected ? 'Actualizar URL de conexión (DATABASE_URL):' : 'URL de conexión PostgreSQL / Supabase (DATABASE_URL):'}
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={supabaseUrlInput}
                          onChange={(e) => setSupabaseUrlInput(e.target.value)}
                          placeholder="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
                          className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        />
                        <button
                          type="button"
                          disabled={isConnectingSupabase || !supabaseUrlInput.trim()}
                          onClick={handleConnectSupabase}
                          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                        >
                          <Database className="w-3.5 h-3.5 text-amber-400" />
                          <span>{isConnectingSupabase ? 'Conectando...' : 'Conectar y crear tablas'}</span>
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-700 mb-2">Tablas automáticas en Supabase:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                            <div>
                              <span className="font-mono text-slate-700 font-bold block">cuentas</span>
                              <span className="text-[10px] text-slate-400">id, alumno, saldo</span>
                            </div>
                            <span className="text-slate-600 font-mono text-[11px] font-bold">
                              {supabaseStatus?.cuentasCount !== undefined ? `${supabaseStatus.cuentasCount} registros` : '-'}
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                            <div>
                              <span className="font-mono text-slate-700 font-bold block">movimientos</span>
                              <span className="text-[10px] text-slate-400">id, cuenta_id, tipo, importe, fecha, concepto</span>
                            </div>
                            <span className="text-slate-600 font-mono text-[11px] font-bold">
                              {supabaseStatus?.movimientosCount !== undefined ? `${supabaseStatus.movimientosCount} registros` : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Export Card */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-700 block mb-1">Exportar copia</span>
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
                        <span className="text-xs font-bold text-slate-700 block mb-1">Importar copia</span>
                        <span className="text-[11px] text-slate-400 leading-relaxed block mb-4">
                          Sube un archivo JSON de copia de seguridad previamente descargado para restaurar el estado completo de la clase.
                        </span>
                      </div>
                      <label className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg transition-all flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer text-center">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Subir copia JSON</span>
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

                <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl">
                  <div className="flex space-x-3">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-rose-900 font-display">Zona de peligro: reinicio contable</h4>
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
                    <h4 className="text-sm font-bold text-slate-800">Opciones de reinicio</h4>
                    
                    <div className="space-y-3">
                      <label className="flex items-start space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          checked={resetKeepUsers === true}
                          onChange={() => setResetKeepUsers(true)}
                          className="mt-1 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-sm font-semibold text-slate-800 block">Mantener alumnos y restablecer saldos</span>
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
                          <span className="text-sm font-semibold text-slate-800 block">Eliminar todo (cero absoluto)</span>
                          <span className="text-xs text-slate-400 block mt-0.5">Elimina todas las cuentas de alumnos, claves, transferencias y registros del sistema para empezar de cero.</span>
                        </div>
                      </label>
                    </div>

                    <div className="border-t border-slate-200/50 pt-4 mt-4">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Saldo inicial por defecto para alumnos
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
                      placeholder="Reiniciar"
                      className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resetConfirmText.toLowerCase() !== 'reiniciar'}
                    className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-rose-100 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    <span>Ejecutar reinicio del simulador</span>
                  </button>
                </form>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      <Footer />

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
                  Nueva cuenta de alumno
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre completo del alumno</label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Ej. Daniel Arnaiz"
                    className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario de acceso</label>
                    <input
                      type="text"
                      required
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      placeholder="Ej. daniel"
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
                      placeholder="Ej. 123"
                      className="block w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nivel de la cuenta del alumno</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewUserLevel('1')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border flex flex-col items-center justify-center space-y-0.5 transition-all cursor-pointer ${
                        newUserLevel === '1'
                          ? 'border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>Nivel 1</span>
                      <span className="text-[10px] text-slate-400 font-normal">Inicial</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserLevel('2')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border flex flex-col items-center justify-center space-y-0.5 transition-all cursor-pointer ${
                        newUserLevel === '2'
                          ? 'border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>Nivel 2</span>
                      <span className="text-[10px] text-slate-400 font-normal">Intermedio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserLevel('3')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border flex flex-col items-center justify-center space-y-0.5 transition-all cursor-pointer ${
                        newUserLevel === '3'
                          ? 'border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>Nivel 3</span>
                      <span className="text-[10px] text-slate-400 font-normal">Avanzado</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Indica las capacidades operativas del alumno (Nivel 1: Venta de producto final y compras a Nivel 1).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Saldo de apertura (€)</label>
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
                    Crear cuenta
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
                  Regular fondos de alumno
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
                    <p className="text-xs font-bold text-slate-400 uppercase">Saldo actual</p>
                    <p className="font-mono font-bold text-slate-900 text-base">{formatNumber(selectedUser.balance)} €</p>
                  </div>
                </div>

                {adjustError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700">
                    {adjustError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Acción contable</label>
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Importe en euros (€)</label>
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
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Concepto de la transacción forzada</label>
                  <input
                    type="text"
                    value={adjustConcept}
                    onChange={(e) => setAdjustConcept(e.target.value)}
                    placeholder="Ej. Corrección de saldo por el profesor, ajuste de evaluación..."
                    className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Este concepto aparecerá registrado en el libro diario de transferencias del alumno.
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
                    Guardar ajuste
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT STUDENT DETAILS MODAL */}
      <AnimatePresence>
        {editUserTarget && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="font-display font-bold text-base flex items-center">
                  <Edit3 className="w-5 h-5 mr-2 text-amber-400" />
                  Editar datos de alumno
                </h3>
                <button 
                  onClick={() => setEditUserTarget(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditUserSubmit} className="p-6 space-y-4">
                {editError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700">
                    {editError}
                  </div>
                )}
                {editSuccess && (
                  <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg text-xs font-semibold text-emerald-700">
                    {editSuccess}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre completo</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario de acceso</label>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña personalizada</label>
                  <input
                    type="text"
                    required
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Esta contraseña quedará guardada de forma permanente y sincronizada en Supabase.
                  </p>
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditUserTarget(null)}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isEditingUser}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isEditingUser ? 'Guardando...' : 'Guardar cambios'}
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
                  Confirmar eliminación de cuenta
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
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider">¡Atención! Operación irreversible</h4>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    Estás a punto de eliminar permanentemente la cuenta de <strong className="font-bold">{deleteTarget.name}</strong>. Se destruirá su saldo disponible de <strong className="font-bold">{formatNumber(deleteTarget.balance)} €</strong> y no podrá volver a iniciar sesión.
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
                    Sí, eliminar cuenta
                  </button>
                </div>
              </div>
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
              className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="font-display font-bold text-base flex items-center">
                  <Coins className="w-5 h-5 mr-2 text-amber-400" />
                  Regular fondos de alumno
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
                    <p className="text-xs font-bold text-slate-400 uppercase">Saldo actual</p>
                    <p className="font-mono font-bold text-slate-900 text-base">{formatNumber(selectedUser.balance)} €</p>
                  </div>
                </div>

                {adjustError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700">
                    {adjustError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Acción contable</label>
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Importe en euros (€)</label>
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
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Concepto de la transacción forzada</label>
                  <input
                    type="text"
                    value={adjustConcept}
                    onChange={(e) => setAdjustConcept(e.target.value)}
                    placeholder="Ej. Corrección de saldo por el profesor, ajuste de evaluación..."
                    className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Este concepto aparecerá registrado en el libro diario de transferencias del alumno.
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
                    Guardar ajuste
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT STUDENT DETAILS MODAL */}
      <AnimatePresence>
        {editUserTarget && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                <h3 className="font-display font-bold text-base flex items-center">
                  <Edit3 className="w-5 h-5 mr-2 text-amber-400" />
                  Editar datos de alumno
                </h3>
                <button 
                  onClick={() => setEditUserTarget(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditUserSubmit} className="p-6 space-y-4">
                {editError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700">
                    {editError}
                  </div>
                )}
                {editSuccess && (
                  <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg text-xs font-semibold text-emerald-700">
                    {editSuccess}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre completo</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Usuario de acceso</label>
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Contraseña personalizada</label>
                  <input
                    type="text"
                    required
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="block w-full py-2.5 px-3 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Esta contraseña quedará guardada de forma permanente y sincronizada en Supabase.
                  </p>
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditUserTarget(null)}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isEditingUser}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isEditingUser ? 'Guardando...' : 'Guardar cambios'}
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
                  Confirmar eliminación de cuenta
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
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider">¡Atención! Operación irreversible</h4>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    Estás a punto de eliminar permanentemente la cuenta de <strong className="font-bold">{deleteTarget.name}</strong>. Se destruirá su saldo disponible de <strong className="font-bold">{formatNumber(deleteTarget.balance)} €</strong> y no podrá volver a iniciar sesión.
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
                    Sí, eliminar cuenta
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* RAW MATERIALS ANNOUNCEMENT CREATE / EDIT MODAL */}
      <AnimatePresence>
        {isAnnModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 my-8"
            >
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Package className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    {editingAnnFullId ? 'Editar anuncio de suministro' : 'Publicar nuevo anuncio de materia prima'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAnnModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveAnnouncement} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {/* Preset Selector */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
                    Plantillas rápidas:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['hierro', 'plastico', 'epoxi'] as const).map((key) => {
                      const preset = TEACHER_PRODUCT_PRESETS[key];
                      const isSelected = annPreset === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleSelectAnnPreset(key)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900 leading-snug">{preset.title}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{preset.presentation}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Título del suministro *
                  </label>
                  <input
                    type="text"
                    required
                    value={annTitle}
                    onChange={(e) => {
                      setAnnTitle(e.target.value);
                      setAnnPreset('custom');
                    }}
                    placeholder="Ej. Fragmentos de hierro"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                {/* Presentation & Material Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Presentación *
                    </label>
                    <input
                      type="text"
                      required
                      value={annPresentation}
                      onChange={(e) => setAnnPresentation(e.target.value)}
                      placeholder="Ej. Pallet de 1.000 kg"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Tipo de material
                    </label>
                    <select
                      value={annMaterialType}
                      onChange={(e) => setAnnMaterialType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    >
                      <option value="hierro">Fragmentos de hierro (Materia prima)</option>
                      <option value="plastico">Pellets de plástico (Inyección mangos)</option>
                      <option value="epoxi">Pegamento epoxi (Lata pegamento)</option>
                      <option value="producto_final">Otro / Producto terminado</option>
                    </select>
                  </div>
                </div>

                {/* Price and Stock */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Precio unitario (€) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={annPrice}
                      onChange={(e) => setAnnPrice(e.target.value)}
                      placeholder="450.00"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Stock inicial (u. o &ldquo;ilimitado&rdquo;)
                    </label>
                    <input
                      type="text"
                      value={annStock}
                      onChange={(e) => setAnnStock(e.target.value)}
                      placeholder="ilimitado o número"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                </div>

                {/* Unit Weight and IsPallet */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Peso unitario (kg)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={annUnitWeightKg}
                      onChange={(e) => setAnnUnitWeightKg(e.target.value)}
                      placeholder="1000"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={annIsPallet}
                        onChange={(e) => setAnnIsPallet(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-semibold text-slate-700">Ocupa espacio de palet en nave</span>
                    </label>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Descripción del producto
                  </label>
                  <textarea
                    rows={3}
                    value={annDescription}
                    onChange={(e) => setAnnDescription(e.target.value)}
                    placeholder="Detalles sobre especificaciones técnicas, empaque, etc."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>

                {annError && (
                  <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg text-xs font-semibold text-rose-700">
                    {annError}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsAnnModalOpen(false)}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAnn}
                    className="flex-1 py-2.5 text-center text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingAnn ? 'Guardando...' : editingAnnFullId ? 'Actualizar anuncio' : 'Publicar anuncio'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE ANNOUNCEMENT CONFIRMATION MODAL */}
      <AnimatePresence>
        {deletingAnn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
            >
              <div className="bg-rose-600 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-white" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Eliminar anuncio de suministro
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletingAnn(null)}
                  className="p-1 rounded-lg text-rose-200 hover:text-white hover:bg-rose-700 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-700 font-medium">
                  ¿Estás seguro de que deseas eliminar este anuncio de materia prima? Los alumnos de nivel 1 ya no podrán comprar este ítem en el mercado.
                </p>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-xs">
                  <div className="font-bold text-slate-900">{deletingAnn.title || deletingAnn.materialName}</div>
                  <div className="text-slate-500">{deletingAnn.presentation}</div>
                  <div className="font-mono font-bold text-emerald-700">{deletingAnn.pricePerUnit.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € / ud</div>
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setDeletingAnn(null)}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteAnnouncement}
                    disabled={isDeletingAnn}
                    className="flex-1 py-2.5 text-center text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isDeletingAnn ? 'Eliminando...' : 'Sí, eliminar anuncio'}
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
