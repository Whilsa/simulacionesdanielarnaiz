/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, PropertyAcquisition, MachineryAcquisition, HiredEmployee, ElectricityContract, NaveFloorPlan, PurchasedVehicle } from '../types.js';
import { 
  Landmark, Building2, Briefcase, ArrowRight, LogOut, ShieldCheck, Sparkles, 
  Wrench, Users, KeyRound, GripVertical, RotateCcw, Zap, PhoneCall, ShoppingBag, Truck, Package, Lock, MessageSquare, Scale
} from 'lucide-react';
import Footer from './Footer.js';
import { ChangePasswordModal } from './ChangePasswordModal.js';
import { formatNumber } from '../lib/formatters.js';

interface MainHubProps {
  currentUser: User;
  onSelectModule: (module: 'bank' | 'real_estate' | 'machinery' | 'jobs' | 'company' | 'electricity' | 'telecom' | 'office_store' | 'vehicles' | 'raw_materials' | 'court') => void;
  onLogout: () => void;
  onOpenDirectMessaging?: () => void;
  availablePropertiesCount?: number;
}

type ModuleType = 'bank' | 'company' | 'real_estate' | 'machinery' | 'jobs' | 'electricity' | 'telecom' | 'office_store' | 'vehicles' | 'raw_materials' | 'court';

export default function MainHub({ currentUser, onSelectModule, onLogout, onOpenDirectMessaging, availablePropertiesCount = 5 }: MainHubProps) {
  const isTeacher = currentUser.role === 'teacher';
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const [unreadCourtCount, setUnreadCourtCount] = useState<number>(0);

  useEffect(() => {
    const fetchUnread = () => {
      fetch(`/api/market/messages/unread-count?userId=${currentUser.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && typeof d.unreadCount === 'number') {
            setUnreadMessagesCount(d.unreadCount);
          }
        })
        .catch(() => {});

      fetch(`/api/court/unread-count?userId=${currentUser.id}&role=${currentUser.role || ''}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && typeof d.unreadCount === 'number') {
            setUnreadCourtCount(d.unreadCount);
          }
        })
        .catch(() => {});
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 5000);
    return () => clearInterval(interval);
  }, [currentUser.id, currentUser.role]);

  // Electricity & Asset State
  const [acquisitions, setAcquisitions] = useState<PropertyAcquisition[]>([]);
  const [machinery, setMachinery] = useState<MachineryAcquisition[]>([]);
  const [employees, setEmployees] = useState<HiredEmployee[]>([]);
  const [purchasedVehicles, setPurchasedVehicles] = useState<PurchasedVehicle[]>([]);
  const [electricityContracts, setElectricityContracts] = useState<ElectricityContract[]>([]);
  const [floorPlans, setFloorPlans] = useState<NaveFloorPlan[]>([]);
  const [telecomContracts, setTelecomContracts] = useState<any[]>([]);
  const [officeOrders, setOfficeOrders] = useState<any[]>([]);
  const [showMarketLockModal, setShowMarketLockModal] = useState(false);


  const fetchHubData = async () => {
    try {
      const [compRes, cRes, fpRes, telRes, offRes] = await Promise.all([
        fetch(`/api/company/${currentUser.id}`),
        fetch(`/api/electricity/contracts?studentId=${currentUser.id}`),
        fetch(`/api/electricity/floor-plans?studentId=${currentUser.id}`),
        fetch(`/api/telecom/contracts?studentId=${currentUser.id}`),
        fetch(`/api/office-store/orders?studentId=${currentUser.id}`)
      ]);
      if (compRes.ok && compRes.headers.get('content-type')?.includes('application/json')) {
        const cData = await compRes.json();
        setAcquisitions(cData.acquisitions || []);
        setMachinery(cData.machineryAcquisitions || []);
        setEmployees(cData.hiredEmployees || []);
        setPurchasedVehicles(cData.purchasedVehicles || []);
      }
      if (cRes.ok && cRes.headers.get('content-type')?.includes('application/json')) {
        const elecJson = await cRes.json();
        setElectricityContracts(elecJson.contracts || []);
      }
      if (fpRes.ok && fpRes.headers.get('content-type')?.includes('application/json')) {
        const fpJson = await fpRes.json();
        setFloorPlans(fpJson.floorPlans || []);
      }
      if (telRes.ok && telRes.headers.get('content-type')?.includes('application/json')) {
        const telJson = await telRes.json();
        setTelecomContracts(telJson.contracts || []);
      }
      if (offRes.ok && offRes.headers.get('content-type')?.includes('application/json')) {
        const offJson = await offRes.json();
        setOfficeOrders(offJson.orders || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isTeacher) {
      fetchHubData();
    }
  }, [currentUser.id, isTeacher]);

  
  const hasTelecomContract = telecomContracts.some((c: any) => c.status === "active");
  const hasOfficeDevice = officeOrders.some((order: any) => {
    const items = order.items || order.cartItems || [];
    return items.some((item: any) => {
      const cat = item.category || "";
      const name = (item.itemName || item.name || "").toLowerCase();
      return (
        ["sobremesa", "portatiles", "telefonos_fijos", "telefonos_moviles"].includes(cat) ||
        name.includes("ordenador") || name.includes("portátil") || name.includes("portatil") ||
        name.includes("teléfono") || name.includes("telefono") || name.includes("pc") ||
        name.includes("laptop") || name.includes("smartphone")
      );
    });
  });

  const warehouseAcquisitions = acquisitions.filter((a: any) => {
    const t = (a.type || a.propertyType || '').toLowerCase();
    const title = (a.propertyTitle || a.title || '').toLowerCase();
    return a.status !== 'cancelado' && (
      t === 'almacen' || t === 'almacén' || t === 'nave_industrial' ||
      title.includes('almacen') || title.includes('almacén') || title.includes('nave')
    );
  });
  const hasWarehouse = warehouseAcquisitions.length > 0;

  const hasElectricityInWarehouse = electricityContracts.some((ec: any) => {
    if (ec.status !== 'active') return false;
    return warehouseAcquisitions.some((a: any) => a.propertyId === ec.propertyId || a.id === ec.propertyId);
  });

  const hasForklift = purchasedVehicles.some((v: any) => v.vehicleType === 'carretilla_elevadora');

  const userLevel = currentUser.level || 1;
  let canAccessMarket = false;
  if (isTeacher) {
    canAccessMarket = true;
  } else if (userLevel === 1) {
    canAccessMarket = hasTelecomContract && hasOfficeDevice;
  } else {
    // Level 2 & Level 3 requirement
    canAccessMarket = hasTelecomContract && hasOfficeDevice && hasWarehouse && hasElectricityInWarehouse && hasForklift;
  }

  const handleCardClick = (moduleId: ModuleType) => {
    if (moduleId === "raw_materials" && !canAccessMarket) {
      setShowMarketLockModal(true);
      return;
    }
    if (moduleId === 'court') {
      setUnreadCourtCount(0);
      fetch('/api/court/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, role: currentUser.role })
      }).catch(() => {});
    }
    onSelectModule(moduleId);
  };

  const defaultOrder: ModuleType[] = ['bank', 'company', 'real_estate', 'machinery', 'jobs', 'electricity', 'telecom', 'office_store', 'vehicles', 'raw_materials', 'court'];

  const [cardOrder, setCardOrder] = useState<ModuleType[]>(() => {
    try {
      const saved = localStorage.getItem(`hub_cards_order_${currentUser.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          if (!parsed.includes('electricity')) parsed.push('electricity');
          if (!parsed.includes('telecom')) parsed.push('telecom');
          if (!parsed.includes('office_store')) parsed.push('office_store');
          if (!parsed.includes('vehicles')) parsed.push('vehicles');
          if (!parsed.includes('raw_materials')) parsed.push('raw_materials');
          if (!parsed.includes('court')) parsed.push('court');
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return defaultOrder;
  });

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) return;

    const newOrder = [...cardOrder];
    const [movedItem] = newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, movedItem);

    setCardOrder(newOrder);
    setDraggedIdx(null);
    try {
      localStorage.setItem(`hub_cards_order_${currentUser.id}`, JSON.stringify(newOrder));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  const handleResetOrder = () => {
    setCardOrder(defaultOrder);
    try {
      localStorage.setItem(`hub_cards_order_${currentUser.id}`, JSON.stringify(defaultOrder));
    } catch (e) {
      console.error(e);
    }
  };

  const getCardDetails = (type: ModuleType) => {
    switch (type) {
      case 'bank':
        return {
          id: 'bank' as ModuleType,
          title: 'Banco',
          badge: 'Simulador',
          badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200/80',
          hoverBorder: 'hover:border-amber-400',
          hoverBg: 'group-hover:bg-amber-500',
          hoverText: 'group-hover:text-amber-600',
          iconBg: 'bg-amber-50 text-amber-600 border-amber-100',
          Icon: Landmark,
          description: 'Acceso al simulador bancario corporativo. Realiza transferencias, gestiona tu IBAN, consulta extractos de movimientos e historial de cobros y pagos.',
          statLabel: 'Saldo Disponible',
          statValue: `${formatNumber(currentUser.balance)} €`
        };
      case 'company':
        return {
          id: 'company' as ModuleType,
          title: 'Patrimonio de la empresa',
          badge: 'Patrimonio',
          badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
          hoverBorder: 'hover:border-emerald-400',
          hoverBg: 'group-hover:bg-emerald-600',
          hoverText: 'group-hover:text-emerald-600',
          iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
          Icon: Briefcase,
          description: 'Resumen corporativo: saldo bancario, inmuebles en propiedad (% Suelo/Edificación y amortizaciones), contratos de alquiler, máquinas y nóminas.',
          statLabel: 'Empresa',
          statValue: currentUser.name
        };
      case 'real_estate':
        return {
          id: 'real_estate' as ModuleType,
          title: 'Portal inmobiliario',
          badge: 'Mercado',
          badgeStyle: 'bg-blue-50 text-blue-800 border-blue-200/80',
          hoverBorder: 'hover:border-blue-400',
          hoverBg: 'group-hover:bg-blue-600',
          hoverText: 'group-hover:text-blue-600',
          iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
          Icon: Building2,
          description: 'Mercado de naves industriales, almacenes y locales comerciales. Compra o alquila inmuebles con opción de pago aplazado o fianza.',
          statLabel: 'Ofertas Activas',
          statValue: `${availablePropertiesCount} Disponibles`
        };
      case 'machinery':
        return {
          id: 'machinery' as ModuleType,
          title: 'Maquinaria industrial',
          badge: 'Industrial',
          badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200/80',
          hoverBorder: 'hover:border-amber-500',
          hoverBg: 'group-hover:bg-amber-600',
          hoverText: 'group-hover:text-amber-600',
          iconBg: 'bg-amber-50 text-amber-700 border-amber-200',
          Icon: Wrench,
          description: 'Adquisición de lotes de maquinaria para producción (Metal/Hierro y Plástico/Ensamblaje) e instalación dentro de Nave Industrial.',
          statLabel: 'Lotes de Fabricación',
          statValue: '2 Líneas Disponibles'
        };
      case 'jobs':
        return {
          id: 'jobs' as ModuleType,
          title: 'Foro de empleo',
          badge: 'Laboral',
          badgeStyle: 'bg-violet-50 text-violet-800 border-violet-200/80',
          hoverBorder: 'hover:border-violet-500',
          hoverBg: 'group-hover:bg-violet-600',
          hoverText: 'group-hover:text-violet-600',
          iconBg: 'bg-violet-50 text-violet-700 border-violet-200',
          Icon: Users,
          description: 'Contratación de empleados operarios publicados por el Profesor y asignación a máquinas para cubrir los turnos de trabajo.',
          statLabel: 'Bolsa de Empleo',
          statValue: 'Contratación Activa'
        };
      case 'electricity':
        return {
          id: 'electricity' as ModuleType,
          title: 'Suministro Eléctrico',
          badge: 'Energía',
          badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200/80',
          hoverBorder: 'hover:border-amber-500',
          hoverBg: 'group-hover:bg-amber-500',
          hoverText: 'group-hover:text-amber-600',
          iconBg: 'bg-amber-50 text-amber-700 border-amber-200',
          Icon: Zap,
          description: 'Contratación de potencia, asesoría energética, facturación y configuración del suministro eléctrico individual para cada uno de los inmuebles.',
          statLabel: 'Suministros por Inmueble',
          statValue: electricityContracts.length > 0 
            ? `${electricityContracts.length} ${electricityContracts.length === 1 ? 'Contrato Activo' : 'Contratos Activos'}`
            : 'Contratación Activa'
        };
      case 'telecom':
        return {
          id: 'telecom' as ModuleType,
          title: 'Servicios de Teléfono e Internet',
          badge: 'Telecom',
          badgeStyle: 'bg-blue-50 text-blue-800 border-blue-200/80',
          hoverBorder: 'hover:border-blue-500',
          hoverBg: 'group-hover:bg-blue-600',
          hoverText: 'group-hover:text-blue-600',
          iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
          Icon: PhoneCall,
          description: 'Contratación de ofertas realistas de teléfono, fibra simétrica de alta velocidad y centralitas para empresas. Pago automático el 1 de cada mes con facturas descargables en PDF.',
          statLabel: 'Comunicaciones Pyme',
          statValue: 'Fibra & Teléfono'
        };
      case 'office_store':
        return {
          id: 'office_store' as ModuleType,
          title: 'Tienda de Equipamiento e Informática',
          badge: 'Mobiliario & IT',
          badgeStyle: 'bg-amber-50 text-amber-900 border-amber-200/80',
          hoverBorder: 'hover:border-amber-500',
          hoverBg: 'group-hover:bg-amber-500',
          hoverText: 'group-hover:text-amber-600',
          iconBg: 'bg-amber-50 text-amber-800 border-amber-200',
          Icon: ShoppingBag,
          description: 'Tienda en línea corporativa con estanterías, mesas, sillas, ordenadores de sobremesa y portátiles, periféricos, impresoras, software contable y de texto, y teléfonos.',
          statLabel: 'Muebles e Informática',
          statValue: 'Catálogo de Oficina'
        };
      case 'vehicles':
        return {
          id: 'vehicles' as ModuleType,
          title: 'Concesionario de Vehículos',
          badge: 'Automoción & Flota',
          badgeStyle: 'bg-blue-50 text-blue-900 border-blue-200/80',
          hoverBorder: 'hover:border-blue-500',
          hoverBg: 'group-hover:bg-blue-600',
          hoverText: 'group-hover:text-blue-600',
          iconBg: 'bg-blue-50 text-blue-700 border-blue-200',
          Icon: Truck,
          description: 'Venta de vehículos corporativos e industriales: camiones con tráiler para logística, carretillas elevadoras contrapesadas para almacenes y coches de empresa.',
          statLabel: 'Concesionario',
          statValue: '3 Categorías'
        };
      case 'raw_materials':
        return {
          id: 'raw_materials' as ModuleType,
          title: 'Mercado',
          badge: canAccessMarket ? 'Suministros' : '🔒 Requisitos Previos',
          badgeStyle: canAccessMarket ? 'bg-emerald-50 text-emerald-900 border-emerald-200/80' : 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
          hoverBorder: 'hover:border-emerald-500',
          hoverBg: 'group-hover:bg-emerald-600',
          hoverText: 'group-hover:text-emerald-600',
          iconBg: canAccessMarket ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200',
          Icon: Package,
          description: 'Adquisición de fragmentos de hierro y metal, pellets de plástico y pegamento epoxi para las líneas de fabricación.',
          statLabel: 'Suministro Industrial',
          statValue: canAccessMarket ? 'Catálogo de Suministros' : '🔒 Requiere Teléfono/Informática'
        };
      case 'court':
        return {
          id: 'court' as ModuleType,
          title: 'Juzgado de 1ª Instancia',
          badge: 'Sede Judicial',
          badgeStyle: 'bg-amber-50 text-amber-900 border-amber-200/80',
          hoverBorder: 'hover:border-amber-500',
          hoverBg: 'group-hover:bg-amber-600',
          hoverText: 'group-hover:text-amber-600',
          iconBg: 'bg-amber-50 text-amber-800 border-amber-200',
          Icon: Scale,
          description: 'Sede judicial para interponer demandas ordinarias por incumplimiento contractual (falta de pago o entrega en compraventas) y demandas de juicio cambiario por pagarés impagados.',
          statLabel: 'Procedimientos',
          statValue: 'Sede Judicial & Litigios'
        };
    }
  };

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
              <h1 className="text-lg font-bold tracking-tight text-white">ContaLab</h1>
              <p className="text-xs text-slate-400 font-medium">Simulador de negocios para contabilidad</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Botón Abogado / Juzgado */}
            <button
              type="button"
              onClick={() => {
                setUnreadCourtCount(0);
                fetch('/api/court/notifications/mark-read', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: currentUser.id, role: currentUser.role })
                }).catch(() => {});
                onSelectModule('court');
              }}
              className="relative flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-3 py-1.5 rounded-xl border border-amber-500/40 transition cursor-pointer group shadow-sm"
              title="Acceder a Sede Judicial / Abogado y Notificaciones de Litigios"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold hidden sm:inline">Abogado</span>
              {unreadCourtCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-900 shadow-md animate-pulse">
                  {unreadCourtCount > 99 ? '99+' : unreadCourtCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenDirectMessaging) {
                  onOpenDirectMessaging();
                } else {
                  onSelectModule('raw_materials');
                }
              }}
              className="relative flex items-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 px-3 py-1.5 rounded-xl border border-indigo-500/40 transition cursor-pointer group shadow-sm"
              title="Acceder a Mensajería Directa"
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold hidden sm:inline">Mensajería directa</span>
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-900 shadow-md animate-pulse">
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="hidden sm:flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-xl border border-slate-700/60 transition cursor-pointer group"
              title="Haz clic para cambiar tu contraseña"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs text-slate-400 font-medium">Usuario:</span>
              <span className="text-xs font-bold text-slate-200 underline decoration-dashed decoration-slate-500 underline-offset-2">{currentUser.name}</span>
            </button>

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

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        currentUser={currentUser}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col justify-center">
        
        {/* Welcome Hero & Controls */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Panel Principal de Operaciones</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Bienvenido, {currentUser.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              Puedes arrastrar y soltar las tarjetas para personalizarlas según tu preferencia. Por defecto, Banco y Patrimonio ocupan las primeras posiciones.
            </p>
          </div>

          <button
            onClick={handleResetOrder}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold shadow-xs transition cursor-pointer"
            title="Restablecer el orden predeterminado de las tarjetas"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Orden inicial</span>
          </button>
        </div>

        {/* 2-Column Square Cards Grid with Drag & Drop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {cardOrder.map((modType, index) => {
            const card = getCardDetails(modType);
            const IconComponent = card.Icon;
            const isDragging = draggedIdx === index;

            return (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => handleCardClick(card.id)}
                className={`flex flex-col justify-between bg-white rounded-3xl border-2 border-slate-200/80 p-6 sm:p-7 shadow-sm hover:shadow-2xl transition-all duration-300 relative overflow-hidden group cursor-pointer select-none ${card.hoverBorder} transform hover:-translate-y-1 h-auto ${
                  isDragging ? 'opacity-40 scale-95 border-dashed border-amber-500 bg-amber-50/50' : ''
                }`}
              >
                {/* Background decorative accent */}
                <div className="absolute top-0 right-0 w-44 h-44 bg-slate-500/5 rounded-full -mr-12 -mt-12 transition-transform duration-500 group-hover:scale-125" />

                {/* Drag Handle Top Right */}
                <div 
                  className="absolute top-5 right-5 z-20 flex items-center gap-1 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-xl text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing transition"
                  title="Haz clic y arrastra para reordenar"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="w-4 h-4" />
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Mover</span>
                </div>

                {/* Card Header & Content */}
                <div>
                  <div className={`w-16 h-16 rounded-2xl ${card.iconBg} flex items-center justify-center mb-6 shadow-xs border ${card.hoverBg} group-hover:text-white transition-colors duration-300`}>
                    <IconComponent className="w-8 h-8" />
                  </div>

                  <div className="flex items-center gap-3 mb-3 pr-20">
                    <h3 className={`text-2xl font-bold text-slate-900 ${card.hoverText} transition-colors tracking-tight line-clamp-1`}>
                      {card.title}
                    </h3>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${card.badgeStyle} shrink-0`}>
                      {card.badge}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                    {card.description}
                  </p>
                </div>

                {/* Card Footer */}
                <div className="pt-5 border-t border-slate-100 flex items-center justify-between mt-4">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                      {card.statLabel}
                    </span>
                    <span className="text-base sm:text-lg font-extrabold text-slate-900 line-clamp-1">
                      {card.statValue}
                    </span>
                  </div>

                  <div className={`w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center ${card.hoverBg} transition-colors shadow-md`}>
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );
          })}
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
          <div className="text-xs text-slate-500 font-mono">v1.2.2 • Academic</div>
        </div>
      </main>

      <Footer />

      {/* Mercado Prerequisites Lock Modal */}
      {showMarketLockModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Acceso Restringido a Mercado</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {userLevel === 1 ? 'Requisitos obligatorios (Nivel 1)' : `Requisitos obligatorios (Nivel ${userLevel})`}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {userLevel === 1 
                ? 'Para poder gestionar compras y pedidos en el Mercado de materias primas, tu empresa debe disponer de línea de comunicación y equipamiento informático para tramitar los pedidos:'
                : 'Para poder acceder al Mercado en Nivel 2/3, tu empresa debe disponer de comunicaciones, equipamiento, un almacén con contrato de luz activo y una carretilla elevadora:'}
            </p>

            <div className="space-y-3">
              {/* Requirement 1: Telecom */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                hasTelecomContract ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
              }`}>
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900 block">1. Servicio de Teléfono e Internet</span>
                  <p className="text-[11px] text-slate-500">
                    {hasTelecomContract ? "✓ Plan activo contratado" : "✕ Sin contrato de teléfono/internet activo"}
                  </p>
                </div>
                {!hasTelecomContract ? (
                  <button
                    onClick={() => {
                      setShowMarketLockModal(false);
                      onSelectModule("telecom");
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                  >
                    Contratar
                  </button>
                ) : (
                  <span className="text-emerald-700 text-xs font-extrabold px-2.5 py-1 bg-emerald-100 rounded-lg shrink-0">Completado</span>
                )}
              </div>

              {/* Requirement 2: Computer or Phone */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                hasOfficeDevice ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
              }`}>
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900 block">2. Ordenador o Teléfono de Oficina</span>
                  <p className="text-[11px] text-slate-500">
                    {hasOfficeDevice ? "✓ Equipamiento adquirido" : "✕ Se requiere mín. 1 ordenador o teléfono"}
                  </p>
                </div>
                {!hasOfficeDevice ? (
                  <button
                    onClick={() => {
                      setShowMarketLockModal(false);
                      onSelectModule("office_store");
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                  >
                    Comprar
                  </button>
                ) : (
                  <span className="text-emerald-700 text-xs font-extrabold px-2.5 py-1 bg-emerald-100 rounded-lg shrink-0">Completado</span>
                )}
              </div>

              {/* Extra requirements for Level 2 and Level 3 */}
              {userLevel >= 2 && (
                <>
                  {/* Requirement 3: Warehouse */}
                  <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                    hasWarehouse ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
                  }`}>
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 block">3. Almacén Adquirido (Inmueble)</span>
                      <p className="text-[11px] text-slate-500">
                        {hasWarehouse ? "✓ Dispones de un almacén/nave" : "✕ Se requiere comprar o alquilar un almacén"}
                      </p>
                    </div>
                    {!hasWarehouse ? (
                      <button
                        onClick={() => {
                          setShowMarketLockModal(false);
                          onSelectModule("real_estate");
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                      >
                        Adquirir
                      </button>
                    ) : (
                      <span className="text-emerald-700 text-xs font-extrabold px-2.5 py-1 bg-emerald-100 rounded-lg shrink-0">Completado</span>
                    )}
                  </div>

                  {/* Requirement 4: Electricity in Warehouse */}
                  <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                    hasElectricityInWarehouse ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
                  }`}>
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 block">4. Luz Contratada en el Almacén</span>
                      <p className="text-[11px] text-slate-500">
                        {hasElectricityInWarehouse ? "✓ Contrato eléctrico activo en el almacén" : "✕ Se requiere contratar luz para el almacén"}
                      </p>
                    </div>
                    {!hasElectricityInWarehouse ? (
                      <button
                        onClick={() => {
                          setShowMarketLockModal(false);
                          onSelectModule("electricity");
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                      >
                        Contratar
                      </button>
                    ) : (
                      <span className="text-emerald-700 text-xs font-extrabold px-2.5 py-1 bg-emerald-100 rounded-lg shrink-0">Completado</span>
                    )}
                  </div>

                  {/* Requirement 5: Forklift */}
                  <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                    hasForklift ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
                  }`}>
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-900 block">5. Carretilla Elevadora</span>
                      <p className="text-[11px] text-slate-500">
                        {hasForklift ? "✓ Dispones de carretilla elevadora" : "✕ Se requiere adquirir una carretilla elevadora"}
                      </p>
                    </div>
                    {!hasForklift ? (
                      <button
                        onClick={() => {
                          setShowMarketLockModal(false);
                          onSelectModule("vehicles");
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                      >
                        Comprar
                      </button>
                    ) : (
                      <span className="text-emerald-700 text-xs font-extrabold px-2.5 py-1 bg-emerald-100 rounded-lg shrink-0">Completado</span>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowMarketLockModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Entendido / Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
