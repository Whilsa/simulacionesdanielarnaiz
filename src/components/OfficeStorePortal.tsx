/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, OfficeStoreItem, OfficeStoreCategory, OfficePurchaseOrder } from '../types.js';
import { OFFICE_STORE_CATALOG } from '../lib/officeStoreData.js';
import { resolveImageUrl, SVG_FALLBACK } from '../lib/imageAssets.js';
import { OfficeInvoiceModal } from './OfficeInvoiceModal.js';
import Footer from './Footer.js';
import { formatNumber } from '../lib/formatters.js';
import { 
  ArrowLeft, ShoppingBag, ShoppingCart, Search, Filter, CheckCircle2, 
  AlertCircle, Trash2, Plus, Minus, CreditCard, Euro, Download, Layers, RefreshCw
} from 'lucide-react';

interface OfficeStorePortalProps {
  currentUser: User;
  onBackToHub: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

interface CartItem {
  item: OfficeStoreItem;
  quantity: number;
}

export default function OfficeStorePortal({ currentUser, onBackToHub, onUserBalanceUpdated }: OfficeStorePortalProps) {
  const [catalog, setCatalog] = useState<OfficeStoreItem[]>(OFFICE_STORE_CATALOG);
  const [selectedCategory, setSelectedCategory] = useState<OfficeStoreCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  const [orders, setOrders] = useState<OfficePurchaseOrder[]>([]);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<OfficePurchaseOrder | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      const res = await fetch(`/api/office-store/orders?studentId=${currentUser.id}`);
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    fetchOrders();
  }, [currentUser.id]);

  // Categories list
  const categories: { key: OfficeStoreCategory | 'all'; label: string; icon: string }[] = [
    { key: 'all', label: 'Todos los productos', icon: '📦' },
    { key: 'estanterias', label: 'Estanterías', icon: '🗄️' },
    { key: 'mesas', label: 'Mesas de oficina', icon: '🪑' },
    { key: 'sillas', label: 'Sillas', icon: '💺' },
    { key: 'sobremesa', label: 'Ordenadores sobremesa', icon: '🖥️' },
    { key: 'portatiles', label: 'Portátiles', icon: '💻' },
    { key: 'perifericos', label: 'Periféricos', icon: '⌨️' },
    { key: 'impresoras', label: 'Impresoras', icon: '🖨️' },
    { key: 'software_texto', label: 'Software texto', icon: '📄' },
    { key: 'software_conta', label: 'Software contabilidad', icon: '📊' },
    { key: 'telefonos_fijos', label: 'Teléfonos fijos', icon: '☎️' },
    { key: 'telefonos_moviles', label: 'Teléfonos móviles', icon: '📱' }
  ];

  // Filter items
  const filteredItems = catalog.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.specs.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Cart operations
  const addToCart = (item: OfficeStoreItem) => {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === item.id);
      if (existing) {
        return prev.map(ci => ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci);
      }
      return [...prev, { item, quantity: 1 }];
    });
    setSuccessMsg(`Añadido a la cesta: ${item.name}`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const updateCartQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(ci => {
        if (ci.item.id === itemId) {
          const newQty = ci.quantity + delta;
          return newQty > 0 ? { ...ci, quantity: newQty } : null;
        }
        return ci;
      }).filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(ci => ci.item.id !== itemId));
  };

  const cartSubtotal = cart.reduce((sum, ci) => sum + (ci.item.price * ci.quantity), 0);
  const cartIva = cartSubtotal * 0.21;
  const cartTotal = cartSubtotal + cartIva;
  const cartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0);

  // Checkout execution
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    if (currentUser.balance < cartTotal) {
      setError(`Saldo insuficiente en el banco. Necesitas ${formatNumber(cartTotal)} € y tu saldo actual es de ${formatNumber(currentUser.balance)} €.`);
      return;
    }

    setIsCheckingOut(true);
    setError(null);

    try {
      const res = await fetch('/api/office-store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          cartItems: cart.map(ci => ({
            itemId: ci.item.id,
            quantity: ci.quantity
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo realizar la compra');

      setSuccessMsg(`¡Compra realizada con éxito! Se ha generado el pedido Nº ${data.order.orderNumber}.`);
      setCart([]);
      setIsCartOpen(false);

      if (data.newBalance !== undefined && onUserBalanceUpdated) {
        onUserBalanceUpdated(data.newBalance);
      }

      fetchOrders();
      if (data.order) {
        setSelectedInvoiceOrder(data.order);
      }
    } catch (err: any) {
      setError(err.message || 'Error al procesar el pago.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHub}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition cursor-pointer flex items-center gap-2 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver al panel</span>
            </button>
            <div className="h-6 w-px bg-slate-800"></div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white leading-none">Tienda de equipamiento e informática</h1>
                <p className="text-[11px] text-slate-400 mt-0.5">Suministros OfiTech para mobiliario, hardware y software</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Saldo disponible</span>
              <span className="text-xs font-extrabold text-amber-400">
                {formatNumber(currentUser.balance)} €
              </span>
            </div>

            {/* Cart trigger button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer shadow-md"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Cesta</span>
              {cartCount > 0 && (
                <span className="bg-slate-950 text-amber-400 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-amber-950 text-white p-6 rounded-2xl border border-slate-800 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-bold">
              <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
              <span>Suministrador oficial corporativo</span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">
              Mobiliario de oficina, equipos informáticos y software de gestión
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Equipa tu empresa con estanterías, mesas, sillas ergonómicas, ordenadores de sobremesa y portátiles, impresoras, software contable y de texto, y telefonía. Todo lo comprado se registrará automáticamente en el patrimonio de tu empresa en la pestaña <strong className="text-amber-400">"Muebles e informática"</strong>.
            </p>
          </div>

          <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700 text-xs space-y-1 min-w-[200px]">
            <p className="font-extrabold text-slate-400 uppercase text-[10px] tracking-wider">COMPRAS EN PATRIMONIO</p>
            <p className="font-extrabold text-amber-400 text-lg">{orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}</p>
            <p className="text-slate-400 text-[11px]">Facturas con IVA 21% deducible</p>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-b border-slate-100 pb-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Buscar estanterías, PCs, impresoras, software..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">
                Catálogo ({filteredItems.length} {filteredItems.length === 1 ? 'producto' : 'productos'})
              </span>
              {selectedCategory !== 'all' && (
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="text-xs text-amber-600 font-bold hover:underline cursor-pointer ml-1"
                >
                  (Limpiar filtro)
                </button>
              )}
            </div>
          </div>

          {/* Category Tags Wrapped (No Scrollbar) */}
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => {
              const count = cat.key === 'all' 
                ? catalog.length 
                : catalog.filter(i => i.category === cat.key).length;
              const isSelected = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer border ${
                    isSelected
                      ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="text-sm leading-none">{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                    isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Products Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-200 hover:border-amber-300 group"
            >
              <div>
                {/* Product Image Container */}
                <div className="relative w-full h-48 bg-slate-100 overflow-hidden border-b border-slate-100">
                  <img
                    src={resolveImageUrl(item.imageUrl, 'product', item.name)}
                    alt={item.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      if (target.src !== SVG_FALLBACK) target.src = SVG_FALLBACK;
                    }}
                  />
                  <span className="absolute top-3 left-3 bg-slate-900/90 text-amber-300 backdrop-blur-xs text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border border-slate-700/60 shadow-xs">
                    {item.categoryLabel}
                  </span>
                </div>

                {/* Details */}
                <div className="p-5 space-y-3">
                  <h3 className="font-bold text-sm text-slate-900 leading-snug line-clamp-2">
                    {item.name}
                  </h3>
                  
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {item.description}
                  </p>

                  <ul className="space-y-1 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                    {item.specs.map((spec, sIdx) => (
                      <li key={sIdx} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                        <span className="truncate">{spec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Price & Add to Cart */}
              <div className="p-5 pt-0 flex items-center justify-between gap-4 border-t border-slate-100 mt-2">
                <div>
                  <span className="text-xs text-slate-400 block font-semibold">Precio unid.</span>
                  <span className="text-xl font-black text-slate-900">{formatNumber(item.price)} €</span>
                </div>

                <button
                  onClick={() => addToCart(item)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold text-xs rounded-xl flex items-center gap-2 transition cursor-pointer shadow-xs active:scale-95"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Añadir</span>
                </button>
              </div>
            </div>
          ))}
        </section>

      </main>

      {/* Shopping Cart Drawer Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200">
            
            {/* Drawer Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm text-white">Cesta de equipamiento e informática</h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold p-1 cursor-pointer"
              >
                Cerrar ✕
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-2">
                  <ShoppingBag className="w-12 h-12 mx-auto text-slate-300" />
                  <p className="font-bold text-slate-700 text-sm">Tu cesta está vacía</p>
                  <p className="text-xs">Añade mobiliario o equipos informáticos para continuar.</p>
                </div>
              ) : (
                cart.map(({ item, quantity }) => (
                  <div key={item.id} className="pt-4 first:pt-0 flex items-center gap-3">
                    <img
                      src={resolveImageUrl(item.imageUrl, 'product', item.name)}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        if (target.src !== SVG_FALLBACK) target.src = SVG_FALLBACK;
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 truncate">{item.name}</h4>
                      <p className="text-[11px] text-slate-500">{formatNumber(item.price)} € / unid.</p>
                      
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => updateCartQuantity(item.id, -1)}
                          className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-black px-1">{quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(item.id, 1)}
                          className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-xs text-slate-900 block">{formatNumber(item.price * quantity)} €</span>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-500 hover:text-red-700 text-[10px] font-bold mt-1"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Footer Summary */}
            {cart.length > 0 && (
              <div className="p-5 bg-slate-50 border-t border-slate-200 space-y-4">
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Base imponible:</span>
                    <span className="font-semibold">{formatNumber(cartSubtotal)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA (21%):</span>
                    <span className="font-semibold">{formatNumber(cartIva)} €</span>
                  </div>
                  <div className="flex justify-between font-black text-sm text-slate-900 pt-2 border-t border-slate-200">
                    <span>Total a pagar:</span>
                    <span className="text-amber-600 text-base">{formatNumber(cartTotal)} €</span>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={isCheckingOut}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                >
                  {isCheckingOut ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Procesando pago y generando factura...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Completar compra y pagar ({formatNumber(cartTotal)} €)</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Invoice Modal Viewer */}
      <OfficeInvoiceModal
        order={selectedInvoiceOrder}
        onClose={() => setSelectedInvoiceOrder(null)}
      />

      <Footer />
    </div>
  );
}
