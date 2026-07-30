import React, { useState, useEffect } from 'react';
import { 
  User, 
  PurchasedVehicle, 
  HiredEmployee, 
  Transfer, 
  SystemLog 
} from '../types.js';
import { 
  ArrowLeft, 
  Truck, 
  Check, 
  AlertCircle, 
  CreditCard, 
  FileText, 
  ShieldCheck, 
  Sparkles,
  Users,
  Building2,
  Car,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X
} from 'lucide-react';

interface VehicleDealershipPortalProps {
  currentUser: User;
  onBackToHub: () => void;
  onUserBalanceUpdated: (newBalance: number) => void;
}

interface VehicleCatalogItem {
  type: 'camion_trailer' | 'carretilla_elevadora' | 'coche_empresa';
  title: string;
  categoryLabel: string;
  badgeStyle: string;
  basePrice: number;
  description: string;
  specs: string[];
  requirementNotes: string;
  imageUrl: string;
}

interface CartItem {
  vehicleType: 'camion_trailer' | 'carretilla_elevadora' | 'coche_empresa';
  title: string;
  basePrice: number;
  quantity: number;
  imageUrl: string;
}

const VEHICLE_CATALOG: VehicleCatalogItem[] = [
  {
    type: 'camion_trailer',
    title: 'Camión de Gran Tonelaje con Tráiler',
    categoryLabel: 'Logística Heavy-Duty',
    badgeStyle: 'bg-blue-100 text-blue-900 border-blue-200',
    basePrice: 85000,
    description: 'Camión cabeza tractora de gran tonelaje con semirremolque tráiler para transporte interurbano y aprovisionamiento de materia prima.',
    specs: [
      'Motor Diésel 480 CV Euro VI',
      'Capacidad de carga: 24.000 kg',
      'Semirremolque de lonas correderas',
      'GPS & Telemetría corporativa'
    ],
    requirementNotes: 'Requiere contratación de Camionero / Conductor en el Foro de Empleo.',
    imageUrl: '/images/vehicles/camion_trailer.jpg'
  },
  {
    type: 'carretilla_elevadora',
    title: 'Carretilla Elevadora Contrapesada 2.5T',
    categoryLabel: 'Maquinaria de Almacén',
    badgeStyle: 'bg-amber-100 text-amber-900 border-amber-200',
    basePrice: 18500,
    description: 'Carretilla industrial contrapesada eléctrica/diésel de 2.5 Tn. Indispensable para operaciones de carga, descarga y movimiento de pallets en cada almacén.',
    specs: [
      'Capacidad nominal: 2.500 kg',
      'Mástil tríplex elevación 4,8 metros',
      'Desplazador lateral integral de horquillas',
      'Requisito: 1 por cada almacén activo'
    ],
    requirementNotes: 'Obligatoria en cada almacén para que funcione la maquinaria. Requiere Carretillero.',
    imageUrl: '/images/vehicles/carretilla_elevadora.jpg'
  },
  {
    type: 'coche_empresa',
    title: 'Coche de Empresa / Berlina Corporativa',
    categoryLabel: 'Flota Comercial',
    badgeStyle: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    basePrice: 24000,
    description: 'Vehículo de flota corporativa para desplazamientos del equipo comercial, dirección y gestión de clientes.',
    specs: [
      'Motor Híbrido Etiqueta ECO',
      'Navegador GPS y manos libres integrado',
      'Consumo reducido 4.2 L/100km',
      'Mantenimiento e IVA deducible'
    ],
    requirementNotes: 'Mejora la representación corporativa y eficiencia de desplazamientos.',
    imageUrl: '/images/vehicles/coche_empresa.jpg'
  }
];

export default function VehicleDealershipPortal({
  currentUser,
  onBackToHub,
  onUserBalanceUpdated
}: VehicleDealershipPortalProps) {
  const [activeTab, setActiveTab] = useState<'catalog' | 'my_fleet'>('catalog');
  const [purchasedVehicles, setPurchasedVehicles] = useState<PurchasedVehicle[]>([]);
  const [hiredEmployees, setHiredEmployees] = useState<HiredEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isBuyingCart, setIsBuyingCart] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartSuccess, setCartSuccess] = useState<string | null>(null);

  // Single Purchase modal state
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleCatalogItem | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const fetchFleetData = async () => {
    setIsLoading(true);
    try {
      const [vRes, eRes] = await Promise.all([
        fetch(`/api/student/vehicles?studentId=${currentUser.id}`),
        fetch(`/api/student/employees?studentId=${currentUser.id}`)
      ]);
      const vData = await vRes.json();
      const eData = await eRes.json();

      if (vData.vehicles) setPurchasedVehicles(vData.vehicles);
      if (eData.employees) setHiredEmployees(eData.employees);
    } catch (err) {
      console.error('Error fetching vehicle fleet:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, [currentUser.id]);

  const addToCart = (item: VehicleCatalogItem, qty: number = 1) => {
    setCart(prev => {
      const existingIndex = prev.findIndex(c => c.vehicleType === item.type);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].quantity += qty;
        return updated;
      } else {
        return [...prev, {
          vehicleType: item.type,
          title: item.title,
          basePrice: item.basePrice,
          quantity: qty,
          imageUrl: item.imageUrl
        }];
      }
    });
  };

  const updateCartQuantity = (vehicleType: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.vehicleType === vehicleType) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (vehicleType: string) => {
    setCart(prev => prev.filter(item => item.vehicleType !== vehicleType));
  };

  const cartBaseSubtotal = cart.reduce((sum, item) => sum + (item.basePrice * item.quantity), 0);
  const cartIvaTotal = cartBaseSubtotal * 0.21;
  const cartGrandTotal = cartBaseSubtotal + cartIvaTotal;
  const cartTotalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleBuyCart = async () => {
    if (cart.length === 0) return;
    setIsBuyingCart(true);
    setCartError(null);
    setCartSuccess(null);

    if (currentUser.balance < cartGrandTotal) {
      setCartError(`Saldo insuficiente en cuenta bancaria (${formatNumber(currentUser.balance)} €). La cesta requiere ${formatNumber(cartGrandTotal)} € (IVA incl.).`);
      setIsBuyingCart(false);
      return;
    }

    try {
      const res = await fetch('/api/vehicles/buy-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          cartItems: cart
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setCartError(data.error || 'No se pudo procesar la compra de la cesta.');
      } else {
        setCartSuccess(`¡Compra combinada completada! Se han añadido ${data.createdCount} vehículo(s) a tu flota por ${formatNumber(cartGrandTotal)} € (IVA incl.).`);
        if (data.newBalance !== undefined) {
          onUserBalanceUpdated(data.newBalance);
        }
        setCart([]);
        await fetchFleetData();
        setTimeout(() => {
          setIsCartOpen(false);
          setCartSuccess(null);
          setActiveTab('my_fleet');
        }, 1800);
      }
    } catch (err: any) {
      setCartError(err.message || 'Error de conexión con el concesionario.');
    } finally {
      setIsBuyingCart(false);
    }
  };

  const handleBuyVehicle = async () => {
    if (!selectedVehicle) return;
    setIsBuying(true);
    setPurchaseError(null);
    setPurchaseSuccess(null);

    const basePrice = selectedVehicle.basePrice;
    const iva = basePrice * 0.21;
    const totalPrice = basePrice + iva;

    if (currentUser.balance < totalPrice) {
      setPurchaseError(`Saldo insuficiente en cuenta bancaria (${formatNumber(currentUser.balance)} €). Se requieren ${formatNumber(totalPrice)} € (IVA incl.).`);
      setIsBuying(false);
      return;
    }

    try {
      const res = await fetch('/api/vehicles/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          vehicleType: selectedVehicle.type,
          title: selectedVehicle.title,
          basePrice: selectedVehicle.basePrice,
          paymentMethod: 'contado'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPurchaseError(data.error || 'No se pudo procesar la compra del vehículo.');
      } else {
        setPurchaseSuccess(`¡Vehículo "${selectedVehicle.title}" adquirido exitosamente por ${formatNumber(totalPrice)} € (IVA incl.)!`);
        if (data.newBalance !== undefined) {
          onUserBalanceUpdated(data.newBalance);
        }
        await fetchFleetData();
        setTimeout(() => {
          setSelectedVehicle(null);
          setPurchaseSuccess(null);
          setActiveTab('my_fleet');
        }, 1800);
      }
    } catch (err: any) {
      setPurchaseError(err.message || 'Error de conexión con el concesionario.');
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16 font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHub}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a la Central</span>
            </button>
            <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">Concesionario de Vehículos</h1>
                <p className="text-[11px] text-slate-500 hidden sm:block">Camiones con tráiler, carretillas elevadoras y flota corporativa</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-100 px-3.5 py-1.5 rounded-xl border border-slate-200 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Saldo Banco</span>
              <span className="text-sm font-extrabold text-slate-900 font-mono">
                {formatNumber(currentUser.balance)} €
              </span>
            </div>

            {/* Shopping Cart Trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative px-3.5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition flex items-center gap-2 text-xs font-bold shadow-xs"
            >
              <ShoppingCart className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Cesta</span>
              {cartTotalItemsCount > 0 && (
                <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.5 rounded-full">
                  {cartTotalItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'catalog'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Catálogo de Vehículos</span>
            </button>

            <button
              onClick={() => setActiveTab('my_fleet')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'my_fleet'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Mi Flota Corporativa ({purchasedVehicles.length})</span>
            </button>
          </div>
        </div>

        {/* CATALOG TAB */}
        {activeTab === 'catalog' && (
          <div className="space-y-6">
            <div className="bg-blue-900 text-white p-6 rounded-3xl shadow-xs relative overflow-hidden">
              <div className="relative z-10 space-y-2 max-w-3xl">
                <span className="inline-flex items-center gap-1.5 bg-blue-800 text-blue-200 text-[11px] font-extrabold px-3 py-1 rounded-full border border-blue-700">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Suministro Vehicular para Empresas</span>
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Equipa tu Empresa con Logística, Maquinaria y Movilidad
                </h2>
                <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
                  Adquiere camiones con tráiler para el transporte de mercancías, carretillas elevadoras contrapesadas obligatorias para la operativa de tus almacenes y coches de empresa para la representación comercial. Puedes comprar unidades sueltas o añadirlas a tu cesta de la compra.
                </p>
              </div>
            </div>

            {/* Vehicle Catalog Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {VEHICLE_CATALOG.map(item => {
                const iva = item.basePrice * 0.21;
                const total = item.basePrice + iva;
                const inCartItem = cart.find(c => c.vehicleType === item.type);

                return (
                  <div key={item.type} className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between hover:border-blue-300 transition group">
                    <div>
                      <div className="relative h-48 bg-slate-100 overflow-hidden">
                        <img 
                          src={item.imageUrl} 
                          alt={item.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                        />
                        <div className="absolute top-3 left-3 flex items-center gap-2">
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${item.badgeStyle}`}>
                            {item.categoryLabel}
                          </span>
                          {inCartItem && (
                            <span className="bg-slate-900 text-amber-400 font-extrabold text-[10px] px-2 py-0.5 rounded-md border border-slate-700">
                              En Cesta ({inCartItem.quantity})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-5 space-y-3">
                        <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>

                        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Especificaciones Técnicas</span>
                          <ul className="space-y-1">
                            {item.specs.map((spec, idx) => (
                              <li key={idx} className="text-[11px] text-slate-700 flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{spec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-1.5 font-medium">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>{item.requirementNotes}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 pt-0 space-y-3">
                      <div className="border-t border-slate-100 pt-3 flex items-end justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Precio Base + IVA 21%</span>
                          <span className="text-sm font-semibold text-slate-500 font-mono">{formatNumber(item.basePrice)} € + {formatNumber(iva)} €</span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-slate-900 font-mono block">{formatNumber(total)} €</span>
                          <span className="text-[9px] text-emerald-600 font-bold uppercase">Total Unidad</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            addToCart(item, 1);
                          }}
                          className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-2xl font-extrabold text-xs transition shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>Añadir a la Cesta</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedVehicle(item);
                            setPurchaseError(null);
                            setPurchaseSuccess(null);
                          }}
                          className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs transition shadow-xs flex items-center justify-center gap-1"
                          title="Comprar directamente 1 unidad"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span className="hidden lg:inline">Comprar Ya</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MY FLEET TAB */}
        {activeTab === 'my_fleet' && (
          <div className="space-y-6">
            {isLoading ? (
              <div className="py-12 text-center text-slate-500 font-medium">Cargando flota corporativa...</div>
            ) : purchasedVehicles.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs space-y-3">
                <Truck className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-lg font-bold text-slate-800">Aún no dispones de vehículos en tu flota</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Accede al catálogo para adquirir carretillas elevadoras contrapesadas para tus almacenes, camiones para transporte o coches corporativos.
                </p>
                <button
                  onClick={() => setActiveTab('catalog')}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-blue-700 transition"
                >
                  Ver Catálogo de Vehículos
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {purchasedVehicles.map(v => (
                  <div key={v.id} className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <img 
                        src={v.imageUrl || '/images/vehicles/carretilla_elevadora.jpg'} 
                        alt={v.title} 
                        className="w-16 h-16 rounded-2xl object-cover border border-slate-200" 
                      />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider block">
                          {v.vehicleType === 'carretilla_elevadora' ? 'Maquinaria de Almacén' : v.vehicleType === 'camion_trailer' ? 'Camión con Tráiler' : 'Coche de Empresa'}
                        </span>
                        <h4 className="font-bold text-slate-900 text-sm leading-snug">{v.title}</h4>
                        <span className="text-[11px] text-slate-500 block font-mono mt-0.5">
                          Fecha Compra: {v.purchaseDate ? v.purchaseDate.split('T')[0] : 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1.5 font-medium">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Precio de Adquisición:</span>
                        <strong className="text-slate-900 font-mono">{formatNumber(v.totalPrice)} €</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Forma de Pago:</span>
                        <span className="text-emerald-700 font-bold uppercase">{v.paymentMethod === 'contado' ? 'Al Contado' : 'Aplazado'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Estado Operativo:</span>
                        <span className="text-emerald-600 font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Activo / Disponible</span>
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 font-medium">
                      {v.vehicleType === 'carretilla_elevadora' && (
                        <span>🚜 Asignable a almacenes en el panel de patrimonio para permitir producción.</span>
                      )}
                      {v.vehicleType === 'camion_trailer' && (
                        <span>🚛 Asignable a camioneros contratados para logística corporativa.</span>
                      )}
                      {v.vehicleType === 'coche_empresa' && (
                        <span>🚗 Vehículo corporativo de flota para representación y gestión comercial.</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SHOPPING CART MODAL / SLIDE-OVER */}
        {isCartOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-end p-0 sm:p-4">
            <div className="bg-white w-full max-w-md h-full sm:h-auto sm:max-h-[90vh] sm:rounded-3xl shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
              {/* Header */}
              <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="font-bold text-base text-white">Cesta de la Compra</h3>
                    <p className="text-[11px] text-slate-300">Concesionario de Vehículos Industriales</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items List */}
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {cart.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-xs font-semibold">Tu cesta de vehículos está vacía</p>
                    <p className="text-[11px]">Añade camiones, carretillas o coches para comprarlos todos juntos en una sola operación.</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.vehicleType} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img src={item.imageUrl} alt={item.title} className="w-12 h-12 rounded-xl object-cover border border-slate-200" />
                        <div>
                          <h4 className="font-bold text-slate-900 text-xs leading-snug">{item.title}</h4>
                          <span className="text-[11px] text-slate-500 font-mono">{formatNumber(item.basePrice)} € / un. (+IVA)</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                          <button 
                            onClick={() => updateCartQuantity(item.vehicleType, -1)}
                            className="p-1 text-slate-500 hover:text-slate-900"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-extrabold font-mono text-slate-900">{item.quantity}</span>
                          <button 
                            onClick={() => updateCartQuantity(item.vehicleType, 1)}
                            className="p-1 text-slate-500 hover:text-slate-900"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button 
                          onClick={() => removeFromCart(item.vehicleType)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar de la cesta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Checkout Footer */}
              {cart.length > 0 && (
                <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-4">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Base Imponible Total:</span>
                      <span className="font-mono font-bold text-slate-900">{formatNumber(cartBaseSubtotal)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>IVA Soportado (21%):</span>
                      <span className="font-mono font-bold text-slate-900">{formatNumber(cartIvaTotal)} €</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-200 font-extrabold">
                      <span className="text-slate-900">Total Operación Cesta:</span>
                      <span className="font-mono text-blue-700 font-black text-base">{formatNumber(cartGrandTotal)} €</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
                      <span>Saldo Banco Disponible:</span>
                      <span className="font-mono font-bold">{formatNumber(currentUser.balance)} €</span>
                    </div>
                  </div>

                  {cartError && (
                    <div className="bg-red-50 text-red-900 p-3 rounded-2xl border border-red-200 text-xs flex items-start gap-2 font-medium">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{cartError}</span>
                    </div>
                  )}

                  {cartSuccess && (
                    <div className="bg-emerald-50 text-emerald-900 p-3 rounded-2xl border border-emerald-200 text-xs flex items-start gap-2 font-medium">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{cartSuccess}</span>
                    </div>
                  )}

                  <button
                    onClick={handleBuyCart}
                    disabled={isBuyingCart || !!cartSuccess}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isBuyingCart ? (
                      <span>Procesando compra de cesta...</span>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        <span>Comprar Todo en Una Sola Operación ({cartTotalItemsCount} u.)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SINGLE PURCHASE CONFIRMATION MODAL */}
        {selectedVehicle && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  <span>Confirmación de Compra de Vehículo</span>
                </h3>
                <button
                  onClick={() => setSelectedVehicle(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
                >
                  ✕
                </button>
              </div>

              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <img 
                  src={selectedVehicle.imageUrl} 
                  alt={selectedVehicle.title} 
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0" 
                />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{selectedVehicle.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedVehicle.categoryLabel}</p>
                </div>
              </div>

              {/* Invoice breakdown */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Base Imponible:</span>
                  <span className="font-mono font-bold text-slate-900">{formatNumber(selectedVehicle.basePrice)} €</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">IVA Soportado (21%):</span>
                  <span className="font-mono font-bold text-slate-900">{formatNumber(selectedVehicle.basePrice * 0.21)} €</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm">
                  <span className="font-bold text-slate-900">Importe Total Factura:</span>
                  <strong className="font-mono text-blue-700 font-extrabold">{formatNumber(selectedVehicle.basePrice * 1.21)} €</strong>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                  <span>Saldo Actual en Cuenta:</span>
                  <span className="font-mono font-semibold">{formatNumber(currentUser.balance)} €</span>
                </div>
              </div>

              {purchaseError && (
                <div className="bg-red-50 text-red-900 p-3 rounded-2xl border border-red-200 text-xs flex items-start gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{purchaseError}</span>
                </div>
              )}

              {purchaseSuccess && (
                <div className="bg-emerald-50 text-emerald-900 p-3 rounded-2xl border border-emerald-200 text-xs flex items-start gap-2 font-medium">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{purchaseSuccess}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setSelectedVehicle(null)}
                  disabled={isBuying}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleBuyVehicle}
                  disabled={isBuying || !!purchaseSuccess}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isBuying ? (
                    <span>Procesando pago...</span>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Confirmar y Pagar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
