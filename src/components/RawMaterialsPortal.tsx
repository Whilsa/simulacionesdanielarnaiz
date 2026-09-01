/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { User, RawMaterialAnnouncement, RawMaterialOrder, PurchasedVehicle, HiredEmployee, MarketMessage, CompanyProfile, TradingPartner, PromissoryNoteData } from '../types.js';
import { formatNumber, numberToSpanishWords } from '../lib/formatters.js';
import { calculateSpanishDistanceKm } from '../lib/spanishDistances.js';
import { downloadElementAsPDF, printElementFallback } from '../lib/pdfUtils.js';
import {
  Package,
  Layers,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  Info,
  Building,
  Building2,
  Scale,
  RefreshCw,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  ChevronRight,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  Edit,
  UserCheck,
  Calendar,
  DollarSign,
  Search,
  Filter,
  Send,
  MessageSquare,
  FileText,
  Printer,
  Receipt,
  Download,
  Wrench,
  Users,
  Check,
  PackageCheck,
  FileCheck,
  Image,
  Upload,
  Store,
  FileSignature,
  ShieldCheck,
  Landmark,
  CreditCard,
  Stamp,
  ArrowUpRight,
  User as UserIcon,
  TrendingDown,
  Megaphone
} from 'lucide-react';

interface RawMaterialsPortalProps {
  currentUser: User;
  initialTab?: 'catalogo' | 'mensajeria' | 'facturacion';
  onRefreshUser?: () => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

interface RawMaterialCartItem {
  announcement: RawMaterialAnnouncement;
  quantity: number;
}

const PRODUCT_PRESETS = {
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

const REALISTIC_PRICE_ALERT_TEMPLATES = [
  {
    id: 't1',
    label: 'Demanda insatisfecha por precio excesivo',
    text: 'Los potenciales compradores se quejan del precio tan alto. No pueden asumirlo.'
  },
  {
    id: 't2',
    label: 'Sondeo comercial desfavorable en canal minorista',
    text: 'El sondeo de clientes en El Des-Tornillo indica que la cotización actual está muy por encima del valor de mercado. Con estas condiciones no habrá salida comercial.'
  },
  {
    id: 't3',
    label: 'Paralización de demanda y presupuestos',
    text: 'La demanda de destornilladores se ha paralizado debido al alto coste unitario ofertado. Se sugiere un ajuste sustancial a la baja para formalizar ventas.'
  },
  {
    id: 't4',
    label: 'Presupuestos de compra rechazados por sobreprecio',
    text: 'Los presupuestos de compra de los clientes están descartando este lote por sobrecoste. Rebaja el margen por unidad para captar pedidos.'
  }
];

export default function RawMaterialsPortal({ currentUser, initialTab, onRefreshUser, onUserBalanceUpdated }: RawMaterialsPortalProps) {
  const isTeacher = currentUser.role === 'teacher' || currentUser.username === 'pupdaniel';
  const studentLevel = currentUser.level || 1;
  const isLevel1 = studentLevel === 1;

  const [announcements, setAnnouncements] = useState<RawMaterialAnnouncement[]>([]);
  const [orders, setOrders] = useState<RawMaterialOrder[]>([]);
  const [vehicles, setVehicles] = useState<PurchasedVehicle[]>([]);
  const [employees, setEmployees] = useState<HiredEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Property & Floorplan State
  const [floorPlans, setFloorPlans] = useState<any[]>([]);
  const [acquisitions, setAcquisitions] = useState<any[]>([]);
  const [producedGoods, setProducedGoods] = useState<any>(null);
  const [rawMaterialsState, setRawMaterialsState] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);

  // Cart State
  const [cart, setCart] = useState<RawMaterialCartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartNeedsTransport, setCartNeedsTransport] = useState(true);
  const [selectedCartWarehouseKey, setSelectedCartWarehouseKey] = useState<number>(1);

  // Selected announcement for single order modal
  const [selectedAnn, setSelectedAnn] = useState<RawMaterialAnnouncement | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [needsTransport, setNeedsTransport] = useState<boolean>(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  // Teacher / Student Announcement Modal State
  const [isAnnModalOpen, setIsAnnModalOpen] = useState(false);
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);
  const [deletingAnnId, setDeletingAnnId] = useState<string | null>(null);
  const [isDeletingAnn, setIsDeletingAnn] = useState(false);
  const [annPreset, setAnnPreset] = useState<'hierro' | 'plastico' | 'epoxi'>('hierro');
  const [annTitle, setAnnTitle] = useState('Fragmentos de hierro');
  const [annPresentation, setAnnPresentation] = useState('Pallet de 1.000 kg (Fragmentos)');
  const [annDescription, setAnnDescription] = useState('Materia prima metálica de alta calidad para producción en línea de varilla y punta. Presentación en palet de 1.000 kg.');
  const [annPrice, setAnnPrice] = useState<number | string>(450);
  const [annDurationDays, setAnnDurationDays] = useState<number | 'indefinido'>('indefinido');
  const [annStock, setAnnStock] = useState<number | string | 'ilimitado'>('ilimitado');
  const [annUnitWeightKg, setAnnUnitWeightKg] = useState<number>(1000);
  const [annIsPallet, setAnnIsPallet] = useState<boolean>(true);

  // Mercado Filters
  const [mercadoFilter, setMercadoFilter] = useState<'todos' | 'comprables' | 'materia_prima' | 'producto_final' | 'mis_anuncios'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Teacher Rejection Modal State
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Student Level Restriction Alert Modal State
  const [showLevelRestrictionModal, setShowLevelRestrictionModal] = useState(false);

  // Main Mercado Cards Tabs State
  const [activeMainTab, setActiveMainTab] = useState<'catalogo' | 'mensajeria' | 'facturacion'>(initialTab || 'catalogo');

  useEffect(() => {
    if (initialTab) {
      setActiveMainTab(initialTab);
    }
  }, [initialTab]);

  // Messaging / Chat State
  const [tradingPartners, setTradingPartners] = useState<TradingPartner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<MarketMessage[]>([]);
  const [chatInputText, setChatInputText] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevLastMessageIdRef = useRef<string | null>(null);
  const activePartnerIdRef = useRef<string>('');

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    } else if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  // Manual Invoice Modal State
  const [isManualInvoiceModalOpen, setIsManualInvoiceModalOpen] = useState(false);
  const [manualInvoiceConcept, setManualInvoiceConcept] = useState('Suministro de productos/servicios comerciales');
  const [manualInvoiceItems, setManualInvoiceItems] = useState<Array<{ title: string; quantity: number; unitPrice: number }>>([
    { title: 'Productos / Servicios Comerciales', quantity: 1, unitPrice: 100 }
  ]);
  const [manualInvoiceDiscount, setManualInvoiceDiscount] = useState<number | string>(0);
  const [manualInvoiceTransport, setManualInvoiceTransport] = useState<number | string>(0);
  const [manualInvoiceInsurance, setManualInvoiceInsurance] = useState<number | string>(0);
  const [manualInvoiceSelectedOrderId, setManualInvoiceSelectedOrderId] = useState<string>('');
  const [isSubmittingManualInvoice, setIsSubmittingManualInvoice] = useState(false);

  // Invoice Modal State
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<RawMaterialOrder | null>(null);
  const rawInvoicePrintRef = useRef<HTMLDivElement>(null);
  const [isDownloadingRawInvoice, setIsDownloadingRawInvoice] = useState(false);

  // Promissory Note (Pagaré Cambiario) Modal State
  const [isPromissoryNoteModalOpen, setIsPromissoryNoteModalOpen] = useState(false);
  const [selectedPromissoryNoteForView, setSelectedPromissoryNoteForView] = useState<PromissoryNoteData | null>(null);
  const [promissoryAmount, setPromissoryAmount] = useState<number | string>(1000);
  const [promissoryDueDate, setPromissoryDueDate] = useState<string>('');
  const [promissoryDaysTerm, setPromissoryDaysTerm] = useState<number>(30);
  const [promissoryConcept, setPromissoryConcept] = useState<string>('');
  const [promissoryOrderType, setPromissoryOrderType] = useState<'no_a_la_orden' | 'a_la_orden'>('no_a_la_orden');
  const [promissoryIssuePlace, setPromissoryIssuePlace] = useState<string>('Madrid');
  const [promissoryBankName, setPromissoryBankName] = useState<string>('Banco Central Mercantil S.A.');
  const [promissoryBankIban, setPromissoryBankIban] = useState<string>('');
  const [promissoryBeneficiaryName, setPromissoryBeneficiaryName] = useState<string>('');
  const [promissoryBeneficiaryNif, setPromissoryBeneficiaryNif] = useState<string>('');
  const [promissoryIssuerName, setPromissoryIssuerName] = useState<string>('');
  const [promissoryIssuerNif, setPromissoryIssuerNif] = useState<string>('');
  const [isSubmittingPromissory, setIsSubmittingPromissory] = useState(false);
  const [noteForDiscountModal, setNoteForDiscountModal] = useState<{ messageId: string; note: PromissoryNoteData } | null>(null);
  const [isSubmittingDiscount, setIsSubmittingDiscount] = useState(false);
  const [noteForCollectionModal, setNoteForCollectionModal] = useState<{ messageId: string; note: PromissoryNoteData } | null>(null);
  const [isSubmittingCollection, setIsSubmittingCollection] = useState(false);
  const promissoryPrintRef = useRef<HTMLDivElement>(null);
  const [isDownloadingPromissoryPDF, setIsDownloadingPromissoryPDF] = useState(false);

  const handleDownloadRawInvoicePDF = async () => {
    if (!rawInvoicePrintRef.current || !selectedInvoiceOrder) return;
    setIsDownloadingRawInvoice(true);
    try {
      const invNum = selectedInvoiceOrder.invoiceNumber || `FACT-2026-${selectedInvoiceOrder.id.slice(-4)}`;
      await downloadElementAsPDF(rawInvoicePrintRef.current, `Factura_Comercial_${invNum}`);
    } catch (e) {
      console.error('PDF error:', e);
      if (rawInvoicePrintRef.current) printElementFallback(rawInvoicePrintRef.current);
    } finally {
      setIsDownloadingRawInvoice(false);
    }
  };

  const handlePrintRawInvoice = () => {
    if (rawInvoicePrintRef.current) {
      printElementFallback(rawInvoicePrintRef.current);
    } else if (selectedInvoiceOrder) {
      openPrintableInvoiceWindow(selectedInvoiceOrder);
    }
  };

  // Company Profile Modal State
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfile[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileDescription, setProfileDescription] = useState('');
  const [profileLogoUrl, setProfileLogoUrl] = useState('');

  // Price Alert Modal State (Teacher -> Student Level 3)
  const [isPriceAlertModalOpen, setIsPriceAlertModalOpen] = useState(false);
  const [selectedAnnForPriceAlert, setSelectedAnnForPriceAlert] = useState<RawMaterialAnnouncement | null>(null);
  const [priceAlertCustomMessage, setPriceAlertCustomMessage] = useState('');
  const [priceAlertSuggestedPrice, setPriceAlertSuggestedPrice] = useState<string | number>('');
  const [isSubmittingPriceAlert, setIsSubmittingPriceAlert] = useState(false);

  const handleOpenPriceAlertModal = (ann: RawMaterialAnnouncement) => {
    setSelectedAnnForPriceAlert(ann);
    setPriceAlertCustomMessage(
      ann.priceAlert?.message || 'Los potenciales compradores se quejan del precio tan alto. No pueden asumirlo.'
    );
    setPriceAlertSuggestedPrice(ann.priceAlert?.suggestedPrice !== undefined ? ann.priceAlert.suggestedPrice : '');
    setIsPriceAlertModalOpen(true);
  };

  const handleSubmitPriceAlert = async () => {
    if (!selectedAnnForPriceAlert) return;
    setIsSubmittingPriceAlert(true);
    try {
      const res = await fetch(`/api/raw-materials/announcements/${selectedAnnForPriceAlert.id}/price-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: priceAlertCustomMessage,
          suggestedPrice: priceAlertSuggestedPrice !== '' ? Number(priceAlertSuggestedPrice) : undefined,
          teacherName: currentUser.name || 'Profesor Daniel'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al enviar aviso de precio.');
      }
      setMsg({ type: 'success', text: `Aviso comercial de demanda enviado correctamente al vendedor (${selectedAnnForPriceAlert.sellerName}).` });
      setIsPriceAlertModalOpen(false);
      fetchData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Error al enviar aviso.' });
    } finally {
      setIsSubmittingPriceAlert(false);
    }
  };

  const handleWithdrawPriceAlert = async (annId: string) => {
    try {
      const res = await fetch(`/api/raw-materials/announcements/${annId}/price-alert`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: 'Aviso de precio retirado del anuncio.' });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
    fetchTradingPartners();
    fetchCompanyProfiles();
  }, [currentUser.id]);

  const fetchCompanyProfiles = async () => {
    try {
      const res = await fetch(`/api/market/company-profiles?viewerId=${currentUser.id}`);
      const data = await res.json();
      if (data.companyProfiles) setCompanyProfiles(data.companyProfiles);
    } catch (e) {
      console.error('Error cargando perfiles de empresa:', e);
    }
  };

  const handleOpenMyProfileModal = () => {
    const myProfile = companyProfiles.find(p => p.studentId === currentUser.id);
    setProfileDescription(myProfile?.description || '');
    setProfileLogoUrl(myProfile?.logoUrl || '');
    setIsProfileModalOpen(true);
  };

  const handleSaveCompanyProfile = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/market/company-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          description: profileDescription,
          logoUrl: profileLogoUrl
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: 'Perfil de empresa guardado y publicado en el mercado correctamente.' });
        setIsProfileModalOpen(false);
        fetchCompanyProfiles();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al guardar el perfil de empresa.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de red al guardar el perfil de empresa.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContactCompany = async (targetStudentId: string) => {
    try {
      const res = await fetch('/api/market/contact-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          partnerId: targetStudentId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchTradingPartners();
        setSelectedPartnerId(targetStudentId);
        setActiveMainTab('mensajeria');
        fetchChatMessages(targetStudentId);
      }
    } catch (e) {
      console.error('Error contactando empresa:', e);
    }
  };

  const fetchTradingPartners = async () => {
    try {
      const res = await fetch(`/api/market/trading-partners?userId=${currentUser.id}`);
      const data = await res.json();
      if (data.partners) {
        // Guarantee sorted by most recent first
        const sorted = [...data.partners].sort((a: TradingPartner, b: TradingPartner) => {
          const timeA = a.lastMessageTimestamp
            ? new Date(a.lastMessageTimestamp).getTime()
            : (a.contactTimestamp ? new Date(a.contactTimestamp).getTime() : 0);
          const timeB = b.lastMessageTimestamp
            ? new Date(b.lastMessageTimestamp).getTime()
            : (b.contactTimestamp ? new Date(b.contactTimestamp).getTime() : 0);
          if (timeB !== timeA) return timeB - timeA;
          return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        });

        setTradingPartners(sorted);
        if (sorted.length > 0 && !selectedPartnerId) {
          setSelectedPartnerId(sorted[0].id);
        }
      }
    } catch (e) {
      console.error('Error cargando socios comerciales:', e);
    }
  };

  const fetchChatMessages = async (partnerId: string, isInitialOrPartnerChange = false) => {
    if (!partnerId) return;
    if (isInitialOrPartnerChange) setLoadingChat(true);
    try {
      const res = await fetch(`/api/market/messages?userId=${currentUser.id}&partnerId=${partnerId}`);
      const data = await res.json();
      if (data.messages) {
        const newMessages: MarketMessage[] = data.messages;
        const lastMsg = newMessages[newMessages.length - 1];
        const newLastId = lastMsg ? lastMsg.id : null;
        const partnerChanged = activePartnerIdRef.current !== partnerId;
        const hasNewMessage = Boolean(newLastId && newLastId !== prevLastMessageIdRef.current);

        setChatMessages(newMessages);
        prevLastMessageIdRef.current = newLastId;
        activePartnerIdRef.current = partnerId;

        // Only auto-scroll on initial open, partner change, or when a new message is received
        if (partnerChanged || isInitialOrPartnerChange || hasNewMessage) {
          setTimeout(() => scrollToBottom(isInitialOrPartnerChange ? false : true), 60);
        }
      }
    } catch (e) {
      console.error('Error cargando mensajes:', e);
    } finally {
      if (isInitialOrPartnerChange) setLoadingChat(false);
    }
  };

  useEffect(() => {
    if (activeMainTab === 'mensajeria') {
      fetchTradingPartners();
      if (selectedPartnerId) {
        fetchChatMessages(selectedPartnerId, true);
      }
      const interval = setInterval(() => {
        fetchTradingPartners();
        if (selectedPartnerId) {
          fetchChatMessages(selectedPartnerId, false);
        }
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [activeMainTab, selectedPartnerId]);

  const handleSendMessage = async () => {
    if (!selectedPartnerId || !chatInputText.trim()) return;
    try {
      const res = await fetch('/api/market/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          recipientId: selectedPartnerId,
          content: chatInputText.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setChatInputText('');
        await fetchChatMessages(selectedPartnerId, false);
        await fetchTradingPartners();
        setTimeout(() => scrollToBottom(true), 50);
      } else {
        setMsg({ type: 'error', text: data.error || 'Error enviando mensaje' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión enviando mensaje' });
    }
  };

  const handleOpenManualInvoiceModal = () => {
    setManualInvoiceConcept('Suministro de productos/servicios comerciales');
    setManualInvoiceItems([{ title: 'Productos / Servicios Comerciales', quantity: 1, unitPrice: 100 }]);
    setManualInvoiceDiscount(0);
    setManualInvoiceTransport(0);
    setManualInvoiceInsurance(0);
    setManualInvoiceSelectedOrderId('');
    setIsManualInvoiceModalOpen(true);
  };

  const handleAddManualInvoiceItem = () => {
    setManualInvoiceItems(prev => [...prev, { title: 'Nuevo concepto / producto', quantity: 1, unitPrice: 50 }]);
  };

  const handleRemoveManualInvoiceItem = (index: number) => {
    if (manualInvoiceItems.length <= 1) return;
    setManualInvoiceItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateManualInvoiceItem = (index: number, field: 'title' | 'quantity' | 'unitPrice', value: any) => {
    setManualInvoiceItems(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          [field]: field === 'title' ? value : Math.max(0, Number(value) || 0)
        };
      }
      return item;
    }));
  };

  const handleSendManualInvoiceSubmit = async () => {
    if (!selectedPartnerId) {
      setMsg({ type: 'error', text: 'Selecciona un destinatario de la lista en la conversación.' });
      return;
    }

    setIsSubmittingManualInvoice(true);
    try {
      const res = await fetch('/api/market/messages/send-manual-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          recipientId: selectedPartnerId,
          concept: manualInvoiceConcept,
          items: manualInvoiceItems,
          discountAmount: Number(manualInvoiceDiscount) || 0,
          transportCost: Number(manualInvoiceTransport) || 0,
          insuranceFee: Number(manualInvoiceInsurance) || 0,
          orderId: manualInvoiceSelectedOrderId || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo emitir la factura.');
      }

      setMsg({ type: 'success', text: `Factura ${data.invoiceNumber} emitida y enviada con éxito por chat.` });
      setIsManualInvoiceModalOpen(false);
      fetchChatMessages(selectedPartnerId, false);
      fetchTradingPartners();
      setTimeout(() => scrollToBottom(true), 50);
      fetchData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Error al enviar la factura.' });
    } finally {
      setIsSubmittingManualInvoice(false);
    }
  };

  const handleOpenPromissoryNoteModal = () => {
    const partner = tradingPartners.find(p => p.id === selectedPartnerId);
    const defaultDays = 30;
    const targetDueDate = new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const partnerNif = partner?.id ? (partner.id.startsWith('user-') ? partner.id : `user-${partner.id}`) : 'user-destinatario';
    const currentNif = currentUser.id ? (currentUser.id.startsWith('user-') ? currentUser.id : `user-${currentUser.id}`) : 'user-emisor';

    setPromissoryAmount(1000);
    setPromissoryConcept(`Operaciones y relaciones comerciales directas con ${partner?.name || 'Vendedor'}`);

    setPromissoryBeneficiaryName(partner?.name || 'Vendedor');
    setPromissoryBeneficiaryNif(partnerNif);
    setPromissoryIssuerName((currentUser as any).companyName || currentUser.name || 'Comprador');
    setPromissoryIssuerNif(currentNif);

    setPromissoryDaysTerm(defaultDays);
    setPromissoryDueDate(targetDueDate);
    setPromissoryOrderType('no_a_la_orden');
    setPromissoryIssuePlace('Madrid');
    setPromissoryBankName('Banco Central Mercantil S.A.');
    setPromissoryBankIban(currentUser.accountNumber || `ES21 0049 1500 05 ${Math.floor(1000000000 + Math.random() * 9000000000)}`);
    setIsPromissoryNoteModalOpen(true);
  };

  const handleSignPromissoryNoteSubmit = async () => {
    if (!selectedPartnerId) {
      setMsg({ type: 'error', text: 'Selecciona una empresa destinataria en la conversación.' });
      return;
    }

    const numAmt = Number(promissoryAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setMsg({ type: 'error', text: 'El importe del pagaré debe ser mayor a 0,00 €.' });
      return;
    }

    if (!promissoryDueDate) {
      setMsg({ type: 'error', text: 'Indica la fecha de vencimiento legal del pagaré.' });
      return;
    }

    setIsSubmittingPromissory(true);
    try {
      const res = await fetch('/api/market/messages/sign-promissory-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          recipientId: selectedPartnerId,
          amount: numAmt,
          dueDate: promissoryDueDate,
          issuePlace: promissoryIssuePlace,
          concept: promissoryConcept,
          orderType: promissoryOrderType,
          bankIban: promissoryBankIban,
          bankName: promissoryBankName,
          issuerNif: promissoryIssuerNif,
          beneficiaryNif: promissoryBeneficiaryNif
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al firmar y emitir el pagaré.');
      }

      setMsg({
        type: 'success',
        text: `Pagaré oficial ${data.promissoryNoteNumber} firmado y emitido con éxito por ${formatNumber(numAmt)} €.`
      });
      setIsPromissoryNoteModalOpen(false);
      fetchChatMessages(selectedPartnerId, false);
      fetchTradingPartners();
      setTimeout(() => scrollToBottom(true), 50);
      fetchData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Error al firmar el pagaré.' });
    } finally {
      setIsSubmittingPromissory(false);
    }
  };

  const handleCollectPromissoryNote = async (messageId: string, note: PromissoryNoteData) => {
    setIsSubmittingPromissory(true);
    try {
      const res = await fetch('/api/market/messages/collect-promissory-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          beneficiaryId: currentUser.id,
          noteNumber: note.promissoryNoteNumber
        })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar el cobro bancario del pagaré.');
      }

      if (data.isImpagado) {
        setMsg({
          type: 'error',
          text: `❌ PAGARÉ IMPAGADO: El librador (${note.issuerName}) no dispone de saldo suficiente en su cuenta bancaria. El efecto ha quedado registrado como impagado.`
        });
      } else {
        setMsg({
          type: 'success',
          text: `✓ ${data.message || `Pagaré ${note.promissoryNoteNumber} cobrado con éxito. Tu saldo ha aumentado en +${formatNumber(note.amount)} €.`}`
        });
        if (typeof data.newBalance === 'number' && onUserBalanceUpdated) {
          onUserBalanceUpdated(data.newBalance);
        }
        if (onRefreshUser) {
          onRefreshUser();
        }
      }

      if (selectedPartnerId) {
        fetchChatMessages(selectedPartnerId, false);
      }
      fetchTradingPartners();
      fetchData();

      if (selectedPromissoryNoteForView && selectedPromissoryNoteForView.promissoryNoteNumber === note.promissoryNoteNumber) {
        setSelectedPromissoryNoteForView({
          ...selectedPromissoryNoteForView,
          status: data.isImpagado ? 'impagado' : 'pagado',
          paidAt: data.transfer?.timestamp || new Date().toISOString(),
          paidTransferId: data.transfer?.id,
          collectRequested: true,
          collectRequestedAt: new Date().toISOString()
        });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Error al cobrar el pagaré.' });
    } finally {
      setIsSubmittingPromissory(false);
    }
  };

  const handleDiscountPromissoryNote = async (messageId: string, note: PromissoryNoteData) => {
    setIsSubmittingDiscount(true);
    try {
      const res = await fetch('/api/market/messages/discount-promissory-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          beneficiaryId: currentUser.id,
          noteNumber: note.promissoryNoteNumber
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar el descuento bancario del pagaré.');
      }

      setMsg({
        type: 'success',
        text: `✓ ${data.message || `Pagaré ${note.promissoryNoteNumber} descontado con éxito. Se han ingresado los fondos líquidos en tu cuenta.`}`
      });

      if (typeof data.newBalance === 'number' && onUserBalanceUpdated) {
        onUserBalanceUpdated(data.newBalance);
      }
      if (onRefreshUser) {
        onRefreshUser();
      }

      if (selectedPartnerId) {
        fetchChatMessages(selectedPartnerId, false);
      }
      fetchTradingPartners();
      fetchData();

      if (selectedPromissoryNoteForView && selectedPromissoryNoteForView.promissoryNoteNumber === note.promissoryNoteNumber) {
        setSelectedPromissoryNoteForView({
          ...selectedPromissoryNoteForView,
          status: 'descontado',
          isDiscounted: true,
          discountedAt: new Date().toISOString(),
          discountDays: data.calculation?.daysRemaining,
          discountRate: 6,
          discountInterest: data.calculation?.discountInterest,
          discountCommissionRate: 0.5,
          discountCommission: data.calculation?.discountCommission,
          discountNetReceived: data.calculation?.netAmount,
          discountTransferId: data.transfer?.id
        });
      }

      setNoteForDiscountModal(null);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Error al descontar el pagaré.' });
    } finally {
      setIsSubmittingDiscount(false);
    }
  };

  const handleCollectionManagementPromissoryNote = async (messageId: string, note: PromissoryNoteData) => {
    setIsSubmittingCollection(true);
    try {
      const res = await fetch('/api/market/messages/collection-management-promissory-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          beneficiaryId: currentUser.id,
          noteNumber: note.promissoryNoteNumber
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al tramitar la gestión de cobro del pagaré.');
      }

      setMsg({
        type: 'success',
        text: `✓ ${data.message || `Pagaré ${note.promissoryNoteNumber} entregado en gestión de cobro bancaria.`}`
      });

      if (typeof data.newBalance === 'number' && onUserBalanceUpdated) {
        onUserBalanceUpdated(data.newBalance);
      }
      if (onRefreshUser) {
        onRefreshUser();
      }

      if (selectedPartnerId) {
        fetchChatMessages(selectedPartnerId, false);
      }
      fetchTradingPartners();
      fetchData();

      if (selectedPromissoryNoteForView && selectedPromissoryNoteForView.promissoryNoteNumber === note.promissoryNoteNumber) {
        setSelectedPromissoryNoteForView({
          ...selectedPromissoryNoteForView,
          status: 'gestion_cobro',
          isCollectionManagement: true,
          collectionManagementAt: new Date().toISOString(),
          collectionCommissionRate: 0.005,
          collectionCommission: data.commission,
          collectionTransferId: data.transfer?.id
        });
      }

      setNoteForCollectionModal(null);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Error al solicitar la gestión de cobro.' });
    } finally {
      setIsSubmittingCollection(false);
    }
  };

  const openPrintablePromissoryNoteWindow = (note: PromissoryNoteData) => {
    const printWindow = window.open('', '_blank', 'width=950,height=750');
    if (!printWindow) {
      alert('Por favor habilita las ventanas emergentes en tu navegador para imprimir el pagaré.');
      return;
    }

    const formattedIssueDate = new Date(note.issueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const formattedDueDate = new Date(note.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const isNoALaOrden = note.orderType === 'no_a_la_orden';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Pagaré mercantil - ${note.promissoryNoteNumber}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 15mm;
          }
          * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          }
          body {
            background-color: #f8fafc;
            color: #0f172a;
            padding: 20px;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .promissory-container {
            width: 100%;
            max-width: 850px;
            background: #ffffff;
            border: 3px double #065f46;
            border-radius: 12px;
            padding: 24px 30px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
            position: relative;
            background-image: radial-gradient(#e6f4ea 1px, transparent 1px);
            background-size: 16px 16px;
          }
          .security-badge {
            position: absolute;
            top: 12px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 9px;
            letter-spacing: 2px;
            font-weight: 700;
            color: #047857;
            text-transform: uppercase;
            border: 1px dashed #10b981;
            padding: 2px 10px;
            border-radius: 999px;
            background: #f0fdf4;
          }
          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 10px;
            padding-bottom: 12px;
            border-bottom: 2px solid #065f46;
          }
          .title-area h1 {
            font-size: 22px;
            font-weight: 900;
            letter-spacing: 3px;
            margin: 0 0 4px 0;
            color: #064e3b;
          }
          .title-area p {
            font-size: 10px;
            color: #475569;
            margin: 0;
            max-width: 420px;
          }
          .amount-box {
            background: #f0fdf4;
            border: 2px solid #059669;
            border-radius: 8px;
            padding: 8px 18px;
            text-align: right;
          }
          .amount-box .label {
            font-size: 10px;
            font-weight: 700;
            color: #047857;
            text-transform: uppercase;
          }
          .amount-box .value {
            font-size: 24px;
            font-weight: 900;
            font-family: monospace;
            color: #064e3b;
            letter-spacing: 1px;
          }
          .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px 24px;
            margin: 16px 0;
            background: rgba(255, 255, 255, 0.85);
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #cbd5e1;
          }
          .field {
            font-size: 11px;
          }
          .field .label {
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            font-size: 9px;
            margin-bottom: 2px;
          }
          .field .val {
            font-weight: 600;
            color: #0f172a;
          }
          .legal-clause {
            margin: 16px 0;
            padding: 12px 16px;
            background: #f8fafc;
            border-left: 4px solid #059669;
            border-radius: 4px;
            font-size: 12px;
            line-height: 1.6;
            color: #1e293b;
          }
          .legal-clause strong {
            color: #064e3b;
          }
          .words-amount {
            background: #f1f5f9;
            padding: 8px 12px;
            border: 1px dashed #94a3b8;
            border-radius: 6px;
            font-family: monospace;
            font-size: 11px;
            font-weight: 700;
            color: #0f172a;
            letter-spacing: 0.5px;
            margin: 10px 0;
          }
          .bottom-grid {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: 20px;
            margin-top: 18px;
            padding-top: 14px;
            border-top: 1px dashed #cbd5e1;
          }
          .bank-domiciliation {
            background: #fafafa;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 14px;
          }
          .bank-domiciliation .bank-title {
            font-size: 10px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
          }
          .bank-domiciliation .iban {
            font-family: monospace;
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 4px;
          }
          .signature-box {
            border: 2px solid #059669;
            background: #f0fdf4;
            border-radius: 8px;
            padding: 10px 14px;
            text-align: center;
            position: relative;
          }
          .signature-box .sign-label {
            font-size: 9px;
            font-weight: 800;
            color: #047857;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .signature-box .sign-name {
            font-size: 13px;
            font-weight: 800;
            color: #064e3b;
            margin: 6px 0 2px 0;
          }
          .signature-box .sign-nif {
            font-size: 10px;
            color: #475569;
          }
          .signature-box .digital-stamp {
            margin-top: 6px;
            font-size: 8px;
            font-family: monospace;
            color: #059669;
            background: #d1fae5;
            padding: 2px 6px;
            border-radius: 4px;
            display: inline-block;
          }
          .footer-legal {
            margin-top: 16px;
            text-align: center;
            font-size: 8px;
            color: #94a3b8;
            letter-spacing: 0.5px;
          }
          .no-print-bar {
            text-align: center;
            margin-bottom: 16px;
          }
          .btn-print {
            background: #059669;
            color: #ffffff;
            border: none;
            padding: 10px 24px;
            font-size: 14px;
            font-weight: 700;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
          }
          .btn-print:hover {
            background: #047857;
          }
          @media print {
            .no-print-bar {
              display: none !important;
            }
            body {
              padding: 0;
              background: transparent;
            }
            .promissory-container {
              box-shadow: none;
              border-color: #000;
            }
          }
        </style>
      </head>
      <body>
        <div style="width: 100%; max-width: 850px;">
          <div class="no-print-bar">
            <button class="btn-print" onclick="window.print()">🖨️ Imprimir / guardar pagaré como PDF</button>
          </div>

          <div class="promissory-container">
            <div class="security-badge">Documento cambiario oficial mercantil</div>

            <div class="header-row">
              <div class="title-area">
                <h1>PAGARÉ</h1>
                <p>Emitido al amparo de la Ley 19/1985, de 16 de julio, Cambiaria y del Cheque (arts. 94 y ss.)</p>
                <div style="margin-top: 4px; font-size: 11px; font-weight: 700; color: ${isNoALaOrden ? '#b91c1c' : '#047857'};">
                  CLÁUSULA: ${isNoALaOrden ? 'NO A LA ORDEN (No endosable)' : 'A LA ORDEN'}
                </div>
              </div>
              <div class="amount-box">
                <div class="label">Importe en cifras</div>
                <div class="value"># ${formatNumber(note.amount)} € #</div>
              </div>
            </div>

            <div class="details-grid">
              <div class="field">
                <div class="label">Número de pagaré</div>
                <div class="val" style="font-family: monospace; font-size: 13px; color: #065f46;">${note.promissoryNoteNumber}</div>
              </div>
              <div class="field">
                <div class="label">Fecha de vencimiento</div>
                <div class="val" style="font-size: 13px; color: #b91c1c; font-weight: 800;">${formattedDueDate}</div>
              </div>
              <div class="field">
                <div class="label">Lugar y fecha de emisión</div>
                <div class="val">${note.issuePlace || 'Madrid'}, a ${formattedIssueDate}</div>
              </div>
              <div class="field">
                <div class="label">Concepto / referencia comercial</div>
                <div class="val">${note.concept || 'Operación comercial mercantil'}</div>
              </div>
            </div>

            <div class="legal-clause">
              Por este <strong>PAGARÉ ${isNoALaOrden ? 'NO A LA ORDEN' : 'A LA ORDEN'}</strong>, la entidad libradora se compromete a pagar incondicionalmente en la fecha de vencimiento a la orden de:
              <div style="font-size: 14px; font-weight: 800; color: #064e3b; margin: 4px 0;">
                ${note.beneficiaryName} (NIF/CIF: ${note.beneficiaryNifCif || (note.beneficiaryId?.startsWith('user-') ? note.beneficiaryId : `user-${note.beneficiaryId || 'beneficiario'}`)})
              </div>
            </div>

            <div>
              <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">La cantidad expresada en letra:</div>
              <div class="words-amount">
                # ${note.amountInWords || numberToSpanishWords(note.amount)} #
              </div>
            </div>

            <div class="bottom-grid">
              <div class="bank-domiciliation">
                <div class="bank-title">Domiciliación de pago (entidad y cuenta de cargo):</div>
                <div style="font-size: 11px; font-weight: 700; color: #334155; margin-top: 2px;">${note.bankName || 'Banco Central Mercantil S.A.'}</div>
                <div class="iban">IBAN: ${note.bankIban || 'ES21 0049 1500 05 1234567890'}</div>
                <div style="font-size: 9px; color: #64748b; margin-top: 4px;">Clave CCC / pago por cuenta corriente autorizada</div>
              </div>

              <div class="signature-box">
                <div class="sign-label">Firmante / librador (deudor)</div>
                <div class="sign-name">${note.issuerName}</div>
                <div class="sign-nif">NIF/CIF: ${note.issuerNifCif || (note.issuerId?.startsWith('user-') ? note.issuerId : `user-${note.issuerId || 'librador'}`)} &bull; Nivel ${note.issuerLevel || 1}</div>
                <div class="digital-stamp">
                  Firma digital certificada: ${note.signatureHash || 'EC-CAMB-OK'}
                </div>
              </div>
            </div>

            <div class="footer-legal">
              Este documento goza de fuerza ejecutiva y eficacia cambiaria con arreglo a la legislación mercantil española vigente.
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadPromissoryPDF = async () => {
    if (!promissoryPrintRef.current || !selectedPromissoryNoteForView) return;
    setIsDownloadingPromissoryPDF(true);
    try {
      await downloadElementAsPDF(promissoryPrintRef.current, `Pagare_Oficial_${selectedPromissoryNoteForView.promissoryNoteNumber}`);
    } catch (e) {
      console.error('PDF error:', e);
      if (promissoryPrintRef.current) printElementFallback(promissoryPrintRef.current);
    } finally {
      setIsDownloadingPromissoryPDF(false);
    }
  };

  const normalizeInvoiceOrder = (order: RawMaterialOrder | any): RawMaterialOrder => {
    if (!order) return order;

    const sellerLvl = order.sellerLevel !== undefined ? order.sellerLevel : (order.sellerId === 'profesor-1' || order.sellerId === 'LOGISTICA_EXTERIOR' ? 'Proveedor Oficial' : 1);
    const buyerLvl = order.buyerLevel !== undefined ? order.buyerLevel : (order.studentLevel || 1);
    const delAddress = order.deliveryAddress || 'Dirección comercial registrada';

    let items = order.items && order.items.length > 0
      ? order.items.map((i: any) => {
          const title = i.title || i.materialTitle || order.materialTitle || 'Concepto';
          const q = Number(i.quantity) || 1;
          const baseP = Number(i.basePrice) || Number(i.subtotal) || Number(i.totalCost) || 0;
          const p = Number(i.unitPrice) || (baseP > 0 ? baseP / q : (Number(order.unitPrice) || (Number(order.basePrice) && order.quantity ? Number(order.basePrice) / order.quantity : 0)));
          const sub = i.subtotal !== undefined && Number(i.subtotal) > 0 ? Number(i.subtotal) : (baseP > 0 ? baseP : (q * p));
          const cost = i.totalCost !== undefined && Number(i.totalCost) > 0 ? Number(i.totalCost) : sub;
          const isScrewdriverItem = (i.materialType === 'producto_final') || (title && title.toLowerCase().includes('destornillador'));
          return {
            ...i,
            announcementId: i.announcementId || 'item',
            title,
            materialTitle: title,
            quantity: q,
            unitPrice: Math.round(p * 100) / 100,
            totalKg: isScrewdriverItem ? 0 : (Number(i.totalKg) || (q * (Number(i.unitWeightKg) || 1000))),
            subtotal: Math.round(sub * 100) / 100,
            totalCost: Math.round(cost * 100) / 100
          };
        })
      : [];

    if (items.length === 0 && (order.materialTitle || order.concept)) {
      const q = Number(order.quantity) || 1;
      const baseP = Number(order.subtotalAmount) || Number(order.basePrice) || 0;
      const p = Number(order.unitPrice) || (baseP > 0 ? baseP / q : 0);
      const sub = baseP > 0 ? baseP : (q * p);
      const isScrewdriverOrd = (order.materialType === 'producto_final') || (order.materialTitle && order.materialTitle.toLowerCase().includes('destornillador')) || (order.concept && order.concept.toLowerCase().includes('destornillador'));
      items = [{
        announcementId: order.announcementId || 'item',
        title: order.materialTitle || order.concept || 'Materia prima',
        materialTitle: order.materialTitle || order.concept || 'Materia prima',
        quantity: q,
        unitPrice: Math.round(p * 100) / 100,
        totalKg: isScrewdriverOrd ? 0 : (Number(order.totalKg) || 0),
        subtotal: Math.round(sub * 100) / 100,
        totalCost: Math.round(sub * 100) / 100
      }];
    }

    const itemsSubtotal = order.subtotalAmount !== undefined && Number(order.subtotalAmount) > 0
      ? Number(order.subtotalAmount)
      : (items.length > 0
          ? items.reduce((s: number, i: any) => s + (i.subtotal || i.totalCost || (i.quantity * i.unitPrice)), 0)
          : (order.unitPrice ? Number(order.unitPrice) * (Number(order.quantity) || 1) : (Number(order.basePrice) || 0)));

    const disc = Number(order.discountAmount) || (order.discountPercentage ? (itemsSubtotal * Number(order.discountPercentage) / 100) : 0);
    const trans = Number(order.transportCost) || 0;
    const ins = Number(order.insuranceFee) || Number(order.insuranceCost) || 0;
    // Insurance is not subject to VAT (exempt). Taxable base = subtotal - disc + trans
    const baseImp = order.taxableBase !== undefined ? Number(order.taxableBase) : Math.max(0, itemsSubtotal - disc + trans);
    const iva = order.vatAmount !== undefined ? Number(order.vatAmount) : (order.ivaAmount !== undefined ? Number(order.ivaAmount) : Math.round(baseImp * 0.21 * 100) / 100);
    const tot = order.totalAmount !== undefined && Number(order.totalAmount) > 0 ? Number(order.totalAmount) : Math.round((baseImp + iva + ins) * 100) / 100;

    return {
      ...order,
      sellerLevel: sellerLvl,
      buyerLevel: buyerLvl,
      deliveryAddress: delAddress,
      subtotalAmount: itemsSubtotal,
      discountAmount: disc,
      transportCost: trans,
      insuranceFee: ins,
      insuranceCost: ins,
      basePrice: baseImp,
      taxableBase: baseImp,
      ivaAmount: iva,
      vatAmount: iva,
      totalAmount: tot,
      items
    };
  };

  const handleViewInvoiceFromMessage = (invData: any) => {
    if (!invData) return;

    // Search if matching order is already in state
    const existingOrder = orders.find(o =>
      o.id === invData.id ||
      o.id === invData.orderId ||
      (o.invoiceNumber && invData.invoiceNumber && o.invoiceNumber === invData.invoiceNumber)
    );

    if (existingOrder) {
      const normalized = normalizeInvoiceOrder({
        ...existingOrder,
        sellerLevel: existingOrder.sellerLevel || invData.sellerLevel,
        buyerLevel: existingOrder.buyerLevel || invData.buyerLevel,
        deliveryAddress: existingOrder.deliveryAddress || invData.deliveryAddress,
        invoiceNumber: invData.invoiceNumber || existingOrder.invoiceNumber,
        discountAmount: invData.discountAmount !== undefined ? invData.discountAmount : existingOrder.discountAmount,
        transportCost: invData.transportCost !== undefined ? invData.transportCost : existingOrder.transportCost,
        insuranceFee: invData.insuranceFee !== undefined ? invData.insuranceFee : (invData.insuranceCost !== undefined ? invData.insuranceCost : ((existingOrder as any).insuranceFee || (existingOrder as any).insuranceCost)),
        subtotalAmount: invData.itemsSubtotal || existingOrder.subtotalAmount,
        basePrice: invData.taxableBase || existingOrder.basePrice,
        ivaAmount: invData.vatAmount || existingOrder.ivaAmount,
        vatAmount: invData.vatAmount || existingOrder.vatAmount,
        totalAmount: invData.totalAmount || existingOrder.totalAmount,
        items: (invData.items && invData.items.length > 0) ? invData.items : existingOrder.items
      });
      setSelectedInvoiceOrder(normalized);
      return normalized;
    }

    const itemsCount = invData.items ? invData.items.reduce((acc: number, i: any) => acc + (i.quantity || 1), 0) : 1;
    const itemsSubtotal = invData.itemsSubtotal || (invData.items && invData.items.length > 0
      ? invData.items.reduce((acc: number, i: any) => acc + (i.subtotal || ((i.quantity || 1) * (i.unitPrice || 0))), 0)
      : (invData.taxableBase || 0));

    const dummyOrder = normalizeInvoiceOrder({
      id: invData.orderId || invData.id || `ord_${Date.now()}`,
      studentId: invData.buyerId,
      studentName: invData.buyerName,
      sellerId: invData.sellerId,
      sellerName: invData.sellerName,
      sellerLevel: invData.sellerLevel,
      buyerLevel: invData.buyerLevel,
      announcementId: 'manual',
      materialType: 'hierro',
      materialTitle: invData.concept || (invData.items && invData.items[0] ? (invData.items[0].title || invData.items[0].materialTitle) : 'Factura comercial'),
      quantity: itemsCount,
      unitWeightKg: 1,
      totalKg: itemsCount,
      subtotalAmount: itemsSubtotal,
      basePrice: invData.taxableBase || 0,
      discountAmount: invData.discountAmount || 0,
      insuranceFee: invData.insuranceFee || invData.insuranceCost || 0,
      transportCost: invData.transportCost || 0,
      ivaAmount: invData.vatAmount || 0,
      vatAmount: invData.vatAmount || 0,
      totalAmount: invData.totalAmount || 0,
      needsTransport: Boolean(invData.transportCost > 0),
      deliveryAddress: invData.deliveryAddress || 'Dirección comercial registrada',
      status: 'facturado',
      requestedAt: invData.issuedAt || new Date().toISOString(),
      invoicedAt: invData.issuedAt || new Date().toISOString(),
      invoiceNumber: invData.invoiceNumber,
      items: invData.items || []
    });

    setSelectedInvoiceOrder(dummyOrder);
    return dummyOrder;
  };

  const isTransportInvoiceOrder = (order: RawMaterialOrder) => {
    if (!order) return false;
    return (
      order.sellerId === 'LOGISTICA_EXTERIOR' ||
      order.sellerId === 'transporte-logistica-oficial' ||
      order.sellerId === 'SUMINISTROS_ESTACION_SERVICIO' ||
      order.sellerId === 'gasolinera-oficial' ||
      Boolean(order.sellerName && (
        order.sellerName.toLowerCase().includes('servicio exterior') ||
        order.sellerName.toLowerCase().includes('logística') ||
        order.sellerName.toLowerCase().includes('logistica') ||
        order.sellerName.toLowerCase().includes('transporte') ||
        order.sellerName.toLowerCase().includes('estación de servicio') ||
        order.sellerName.toLowerCase().includes('estacion de servicio')
      )) ||
      Boolean(order.materialTitle && (
        order.materialTitle.toLowerCase().includes('servicio exterior') ||
        order.materialTitle.toLowerCase().includes('transporte') ||
        order.materialTitle.toLowerCase().includes('logística') ||
        order.materialTitle.toLowerCase().includes('logistica') ||
        order.materialTitle.toLowerCase().includes('gasto de transporte') ||
        order.materialTitle.toLowerCase().includes('combustible')
      )) ||
      Boolean(order.id && order.id.includes('trans'))
    );
  };

  const isOfficialCommercialInvoice = (order: RawMaterialOrder) => {
    if (!order) return false;
    const isFacturado = order.status === 'facturado' || Boolean(order.invoiceNumber) || (order.status === 'entregado' && (order.totalAmount || 0) > 0);
    if (!isFacturado) return false;

    // Exclude invoices sent/received via direct messaging (chat / manual invoice)
    if (
      order.announcementId === 'manual_invoice' ||
      order.isDirectMessageInvoice === true ||
      order.isChatInvoice === true ||
      order.source === 'chat' ||
      (order.note && (
        order.note.includes('chat') ||
        order.note.includes('mensajería') ||
        order.note.includes('Emitida manualmente') ||
        order.note.includes('chat de mensajería')
      ))
    ) {
      return false;
    }

    return true;
  };

  const getTransportConcept = (order: RawMaterialOrder) => {
    let address = order.deliveryAddress;
    if (!address || address === 'Almacén del destinatario' || address === 'Almacén Central' || address === 'Dirección comercial registrada') {
      const recipientAcq = acquisitions.find((a: any) => 
        (a.studentId && order.materialTitle?.includes(a.studentName)) ||
        a.location
      );
      if (recipientAcq && (recipientAcq.location || recipientAcq.propertyTitle)) {
        address = recipientAcq.location || recipientAcq.propertyTitle;
      } else {
        address = 'Polígono Industrial San Fernando, Av. de la Industria 14, San Fernando de Henares (Madrid)';
      }
    }

    const title = order.materialTitle || 'Servicio exterior de transporte - Envío de existencias';
    if (title.toLowerCase().includes('dirección') || title.toLowerCase().includes('inmueble') || title.includes(address)) {
      return title;
    }

    return `${title} — Dirección del inmueble de destino: ${address}`;
  };

  const openPrintableInvoiceWindow = (rawOrder: RawMaterialOrder) => {
    if (!rawOrder) return;
    const order = normalizeInvoiceOrder(rawOrder);
    const invoiceNum = order.invoiceNumber || `FACT-2026-${order.id.slice(-4)}`;
    const invDate = order.invoicedAt ? new Date(order.invoicedAt).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES');

    const isTransport = isTransportInvoiceOrder(order);

    const subtotal = order.subtotalAmount || (
      order.items && order.items.length > 0
        ? order.items.reduce((sum, i) => sum + (i.subtotal || ((i.quantity || 1) * (i.unitPrice || 0))), 0)
        : (order.unitPrice ? order.unitPrice * order.quantity : (order.basePrice || order.totalAmount / 1.21))
    );
    const disc = Number(order.discountAmount) || (order.discountPercentage ? (subtotal * Number(order.discountPercentage) / 100) : 0);
    const trans = Number(order.transportCost) || 0;
    const ins = Number(order.insuranceFee) || Number((order as any).insuranceCost) || 0;
    const baseImp = order.taxableBase !== undefined ? Number(order.taxableBase) : Math.max(0, subtotal - disc + trans);
    const iva = order.vatAmount !== undefined ? Number(order.vatAmount) : (order.ivaAmount !== undefined ? Number(order.ivaAmount) : Math.round(baseImp * 0.21 * 100) / 100);
    const tot = order.totalAmount !== undefined && Number(order.totalAmount) > 0 ? Number(order.totalAmount) : Math.round((baseImp + iva + ins) * 100) / 100;

    const conceptText = isTransport ? getTransportConcept(order) : '';

    const itemsList = order.items && order.items.length > 0 ? order.items.map(it => {
      const q = Number(it.quantity) || 1;
      const baseP = Number(it.basePrice) || Number(it.subtotal) || Number(it.totalCost) || 0;
      const uPrice = Number(it.unitPrice) || (baseP > 0 ? baseP / q : (Number(order.unitPrice) || 0));
      const lineTotal = Number(it.totalCost) || Number(it.subtotal) || (baseP > 0 ? baseP : (q * uPrice));
      return {
        ...it,
        quantity: q,
        unitPrice: Math.round(uPrice * 100) / 100,
        subtotal: Math.round(lineTotal * 100) / 100,
        totalCost: Math.round(lineTotal * 100) / 100
      };
    }) : [{
      announcementId: 'item',
      materialTitle: order.materialTitle || 'Materiales Industriales / Productos',
      title: order.materialTitle || 'Materiales Industriales / Productos',
      quantity: order.quantity || 1,
      totalKg: order.totalKg || 0,
      unitPrice: Number(order.unitPrice) || (order.basePrice ? Number(order.basePrice) / (order.quantity || 1) : 0),
      subtotal: order.subtotalAmount || order.basePrice || ((order.unitPrice || 0) * (order.quantity || 1)),
      totalCost: order.subtotalAmount || order.basePrice || ((order.unitPrice || 0) * (order.quantity || 1))
    }];

    const itemsRows = isTransport ? `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">${conceptText}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">1 u.</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f172a;">${formatNumber(subtotal)} €</td>
      </tr>
    ` : itemsList.map(it => {
      const isScrewdriverItem = (it.materialType === 'producto_final') || (it.materialTitle && it.materialTitle.toLowerCase().includes('destornillador')) || ((it as any).title && (it as any).title.toLowerCase().includes('destornillador'));
      return `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #1e293b;">${it.materialTitle || (it as any).title || 'Material'}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">${it.quantity || 1} u.</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">${isScrewdriverItem ? '-' : `${formatNumber(it.totalKg || 0)} kg`}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">${formatNumber(it.unitPrice || 0)} €</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f172a;">${formatNumber(it.totalCost || (it.quantity * it.unitPrice))} €</td>
      </tr>
    `;
    }).join('');

    const tableHeader = isTransport ? `
      <thead>
        <tr>
          <th>Concepto</th>
          <th style="text-align: right;">Cantidad</th>
          <th style="text-align: right;">Total neto</th>
        </tr>
      </thead>
    ` : `
      <thead>
        <tr>
          <th>Concepto / Material</th>
          <th style="text-align: right;">Cantidad</th>
          <th style="text-align: right;">Peso (kg)</th>
          <th style="text-align: right;">Precio unid.</th>
          <th style="text-align: right;">Total neto</th>
        </tr>
      </thead>
    `;

    const subtotalLabel = isTransport ? 'Subtotal transporte:' : 'Subtotal Materiales / Productos:';

    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura comercial ${invoiceNum}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; padding: 20px; background: #f8fafc; }
    .print-bar { max-width: 800px; margin: 0 auto 16px auto; display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 12px; }
    .print-btn { background: #6366f1; color: #fff; border: none; padding: 8px 18px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size: 13px; }
    .print-btn:hover { background: #4f46e5; }
    .invoice-card { max-width: 800px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; padding: 36px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
    .title { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
    .inv-num { font-family: monospace; font-weight: bold; color: #7e22ce; font-size: 16px; text-align: right; }
    .inv-date { font-size: 12px; color: #64748b; margin-top: 4px; text-align: right; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f1f5f9; padding: 16px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 24px; font-size: 12px; }
    .party-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8; display: block; margin-bottom: 6px; }
    .party-name { font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
    th { text-align: left; padding: 10px 8px; border-bottom: 2px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #475569; font-weight: 800; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-box { width: 300px; font-size: 12px; line-height: 1.8; }
    .totals-row { display: flex; justify-content: space-between; }
    .totals-grand { border-top: 2px solid #0f172a; font-weight: bold; font-size: 15px; padding-top: 6px; margin-top: 6px; color: #047857; }
    @media print {
      .print-bar { display: none !important; }
      body { background: #fff; padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <span style="font-weight: bold; font-size: 14px;">Factura comercial oficial — ${invoiceNum}</span>
    <button class="print-btn" onclick="window.print()">🖨️ Imprimir / guardar como PDF</button>
  </div>
  <div class="invoice-card">
    <div class="header">
      <div>
        <h1 class="title">FACTURA COMERCIAL</h1>
        <div class="subtitle">Simulador empresarial — operaciones de cadena de suministro</div>
      </div>
      <div>
        <div class="inv-num">${invoiceNum}</div>
        <div class="inv-date">Fecha: ${invDate}</div>
        <div class="inv-date">Ref. Pedido: ${order.id}</div>
      </div>
    </div>

    <div class="party-grid">
      <div>
        <span class="party-label">EMISOR (VENDEDOR)</span>
        <div class="party-name">${order.sellerName || 'Proveedor Oficial — Profesor'}</div>
        <div>Nivel: ${order.sellerLevel || 'Proveedor Oficial'}</div>
        <div>ID: ${order.sellerId || 'profesor-1'}</div>
      </div>
      <div>
        <span class="party-label">RECEPTOR (COMPRADOR)</span>
        <div class="party-name">${order.studentName}</div>
        <div>Nivel: Nivel ${order.buyerLevel || 1}</div>
        <div>ID: ${order.studentId}</div>
        <div>Entrega: ${order.deliveryAddress || 'Almacén Central'}</div>
      </div>
    </div>

    <table>
      ${tableHeader}
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="totals-row">
          <span>${subtotalLabel}</span>
          <span style="font-family: monospace;">${formatNumber(subtotal)} €</span>
        </div>
        ${disc > 0 ? `<div class="totals-row" style="color: #047857;"><span>Descuento comercial:</span><span style="font-family: monospace;">-${formatNumber(disc)} €</span></div>` : ''}
        ${!isTransport && trans > 0 ? `<div class="totals-row"><span>Gastos transporte / portes:</span><span style="font-family: monospace;">+${formatNumber(trans)} €</span></div>` : ''}
        <div class="totals-row" style="font-weight: bold; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 4px;">
          <span>Base imponible (21% IVA):</span>
          <span style="font-family: monospace;">${formatNumber(baseImp)} €</span>
        </div>
        <div class="totals-row">
          <span>Cuota I.V.A. (21%):</span>
          <span style="font-family: monospace;">${formatNumber(iva)} €</span>
        </div>
        ${ins > 0 ? `<div class="totals-row" style="color: #475569;"><span>Seguro mercancía (no sujeto a IVA):</span><span style="font-family: monospace;">+${formatNumber(ins)} €</span></div>` : ''}
        <div class="totals-row totals-grand">
          <span>TOTAL FACTURA:</span>
          <span style="font-family: monospace;">${formatNumber(tot)} €</span>
        </div>
      </div>
    </div>
  </div>
  <script>
    setTimeout(function() {
      try { window.print(); } catch(e) {}
    }, 300);
  </script>
</body>
</html>`;

    let printWin: Window | null = null;
    try {
      printWin = window.open('', '_blank');
    } catch (e) {
      printWin = null;
    }

    if (printWin) {
      printWin.document.open();
      printWin.document.write(htmlContent);
      printWin.document.close();
    } else {
      setSelectedInvoiceOrder(order);
      setTimeout(() => {
        try {
          window.print();
        } catch (e) {
          console.error('Print error:', e);
        }
      }, 100);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const ordUrl = isTeacher ? '/api/raw-materials/orders' : `/api/raw-materials/orders?studentId=${currentUser.id}`;
      const [annRes, ordRes, compRes, invRes] = await Promise.all([
        fetch('/api/raw-materials/announcements'),
        fetch(ordUrl),
        fetch(`/api/company/${currentUser.id}`),
        fetch(`/api/raw-materials/inventory/${currentUser.id}`)
      ]);

      const annData = await annRes.json();
      const ordData = await ordRes.json();
      const compData = await compRes.json();
      const invData = await invRes.json();

      if (annData.announcements) setAnnouncements(annData.announcements);
      if (ordData.orders) setOrders(ordData.orders);

      if (compData) {
        if (compData.purchasedVehicles) setVehicles(compData.purchasedVehicles);
        if (compData.hiredEmployees) setEmployees(compData.hiredEmployees);
        if (compData.naveFloorPlans) setFloorPlans(compData.naveFloorPlans);
        if (compData.acquisitions) setAcquisitions(compData.acquisitions);
      }

      if (invData) {
        if (invData.inventory) setInventoryData(invData.inventory);
        if (invData.producedGoods) setProducedGoods(invData.producedGoods);
        if (invData.rawMaterials) setRawMaterialsState(invData.rawMaterials);
      }
    } catch (e) {
      console.error('Error cargando datos de materias primas:', e);
    } finally {
      setLoading(false);
    }
  };

  // Warehouse Properties & Storage Surface Calculation (aligned with "Existencias" in CompanyDashboard)
  const warehouseProperties = (acquisitions || []).filter((a: any) => {
    const pType = (a.propertyType || a.type || "").toLowerCase();
    const title = (a.propertyTitle || a.title || "").toLowerCase();
    return (
      ["nave_industrial", "almacen", "almacen_logistico", "industrial", "warehouse"].includes(pType) ||
      title.includes("nave") ||
      title.includes("almacen") ||
      title.includes("almacén")
    );
  });

  let realWarehouseM2 = 0;
  let maxPalletsAllowed = 0;

  if (warehouseProperties.length === 0) {
    realWarehouseM2 = 65;
    maxPalletsAllowed = Math.max(1, Math.floor((realWarehouseM2 / 30) * 25));
  } else {
    warehouseProperties.forEach((acq: any) => {
      const pType = (acq.propertyType || acq.type || "").toLowerCase();
      const isLogisticsWarehouse = pType.includes("almacen") || pType.includes("almacén");
      let storageM2 = 0;
      if (isLogisticsWarehouse) {
        storageM2 = Number(acq.surfaceM2 || acq.m2 || 300);
      } else {
        const matchedPlan = (floorPlans || []).find(
          (p: any) =>
            String(p.acquisitionId) === String(acq.id) ||
            String(p.propertyId) === String(acq.id) ||
            String(p.propertyId) === String(acq.propertyId) ||
            (p.propertyTitle && acq.propertyTitle && p.propertyTitle.trim().toLowerCase() === acq.propertyTitle.trim().toLowerCase())
        );
        if (matchedPlan) {
          const raw = Number(matchedPlan.rawMaterialsStorageM2);
          const fin = Number(matchedPlan.finishedGoodsStorageM2);
          const semi = Number(matchedPlan.semiFinishedStorageM2);
          const totalPlanStorage = (isNaN(raw) ? 0 : raw) + (isNaN(fin) ? 0 : fin) + (isNaN(semi) ? 0 : semi);
          storageM2 = totalPlanStorage > 0 ? totalPlanStorage : (Number(matchedPlan.storageZoneM2) || 65);
        } else {
          storageM2 = 65;
        }
      }
      if (!storageM2 || storageM2 <= 0) storageM2 = 65;

      realWarehouseM2 += storageM2;
      maxPalletsAllowed += Math.max(1, Math.floor((storageM2 / 30) * 25));
    });
  }

  const rawMaterialWarehousesCount = Math.max(1, warehouseProperties.length);

  // Forklifts requirement check (1 forklift for the property)
  const ownedForklifts = vehicles.filter(v => v.vehicleType === 'carretilla_elevadora').length;
  const hasEnoughForklifts = rawMaterialWarehousesCount > 0 && ownedForklifts >= 1;
  const canPurchaseRawMaterials = (isLevel1 || isTeacher) && rawMaterialWarehousesCount > 0 && hasEnoughForklifts;

  // Stored inventory quantities & pallet conversions (Identical to "Existencias" in CompanyDashboard)
  const ironKg = inventoryData?.ironKg ?? rawMaterialsState?.fragmentos_hierro_kg ?? 0;
  const plasticKg = inventoryData?.plasticKg ?? rawMaterialsState?.pellets_plastico_kg ?? 0;
  const epoxiKg = inventoryData?.epoxiKg ?? rawMaterialsState?.pegamento_epoxi_kg ?? 0;

  const starRods = inventoryData?.producedStarRodsUnits ?? inventoryData?.producedIronRodsUnits ?? producedGoods?.varillas_punta_estrella ?? 0;
  const flatRods = inventoryData?.producedFlatRodsUnits ?? inventoryData?.producedMetalRodsUnits ?? producedGoods?.varillas_punta_plana ?? 0;
  const starScrewdrivers = inventoryData?.starScrewdriversUnits ?? inventoryData?.ironScrewdriversUnits ?? producedGoods?.destornilladores_punta_estrella ?? 0;
  const flatScrewdrivers = inventoryData?.flatScrewdriversUnits ?? inventoryData?.metalScrewdriversUnits ?? producedGoods?.destornilladores_punta_plana ?? 0;

  const ironPallets = ironKg / 1000;
  const plasticPallets = plasticKg / 1000;
  const epoxiPallets = epoxiKg / 1000;
  const rawMaterialsPallets = ironPallets + plasticPallets + epoxiPallets;

  const rodsPallets = (isLevel1 ? starRods + flatRods : 0) / 10000;
  const screwdriversPallets = (starScrewdrivers + flatScrewdrivers) / 10000;
  const finishedGoodsPallets = rodsPallets + screwdriversPallets;

  const totalOccupiedPallets = rawMaterialsPallets + finishedGoodsPallets;

  // Overall warehouse metrics (strictly identical to Existencias)
  const occupiedPercentage = maxPalletsAllowed > 0 ? (totalOccupiedPallets / maxPalletsAllowed) * 100 : 0;
  const clampedOccupiedPercentage = Math.min(100, Math.max(0, occupiedPercentage));
  const freePercentage = Math.max(0, 100 - occupiedPercentage);
  const freePallets = Math.max(0, maxPalletsAllowed - totalOccupiedPallets);
  const clampedFreePercentage = Math.max(0, 100 - clampedOccupiedPercentage);
  const isOverCapacity = totalOccupiedPallets > maxPalletsAllowed || occupiedPercentage > 100;

  const ownedTruck = vehicles.find(v => v.vehicleType === 'camion_trailer');
  const hiredDriver = employees.find(e => e.role === 'camionero');
  const canPickupWithoutTransport = Boolean(ownedTruck && hiredDriver);

  // Preset selector
  const handleSelectPreset = (key: 'hierro' | 'plastico' | 'epoxi') => {
    setAnnPreset(key);
    const p = PRODUCT_PRESETS[key];
    setAnnTitle(p.title);
    setAnnPresentation(p.presentation);
    setAnnDescription(p.description);
    setAnnPrice(p.defaultPrice);
    setAnnUnitWeightKg(p.unitWeightKg);
    setAnnIsPallet(p.isPallet);
  };

  const getAvailableStockForProductType = (productTitle: string) => {
    const pTitleLower = (productTitle || '').toLowerCase();
    const isPlana = pTitleLower.includes('plana');
    const isEstrella = pTitleLower.includes('estrella');
    const isHierro = pTitleLower.includes('hierro');
    const isMetal = pTitleLower.includes('metal') && !isPlana;
    const isPlastico = pTitleLower.includes('plást') || pTitleLower.includes('plast');
    const isEpoxi = pTitleLower.includes('epoxi');

    let totalProduced = 0;
    if (isPlana) {
      const flat = producedGoods?.destornilladores_punta_plana ?? producedGoods?.destornilladores_metal;
      const star = producedGoods?.destornilladores_punta_estrella ?? producedGoods?.destornilladores_hierro;
      if (flat !== undefined) {
        totalProduced = flat;
      } else if (star !== undefined) {
        totalProduced = 0;
      } else {
        totalProduced = producedGoods?.producedScrewdriversUnits ?? producedGoods?.productos_ensamblados ?? 0;
      }
    } else if (isEstrella) {
      const star = producedGoods?.destornilladores_punta_estrella ?? producedGoods?.destornilladores_hierro;
      const flat = producedGoods?.destornilladores_punta_plana ?? producedGoods?.destornilladores_metal;
      if (star !== undefined) {
        totalProduced = star;
      } else if (flat !== undefined) {
        totalProduced = 0;
      } else {
        totalProduced = producedGoods?.producedScrewdriversUnits ?? producedGoods?.productos_ensamblados ?? 0;
      }
    } else if (isHierro && !isEstrella) {
      totalProduced = rawMaterialsState?.fragmentos_hierro_kg ?? 0;
    } else if (isMetal) {
      totalProduced = rawMaterialsState?.fragmentos_metal_kg ?? 0;
    } else if (isPlastico) {
      totalProduced = rawMaterialsState?.pellets_plastico_kg ?? 0;
    } else if (isEpoxi) {
      totalProduced = rawMaterialsState?.pegamento_epoxi_kg ?? 0;
    } else {
      totalProduced = producedGoods?.producedScrewdriversUnits ?? producedGoods?.productos_ensamblados ?? 0;
    }

    const lockedOther = announcements
      .filter(a => a.sellerId === currentUser.id && a.active && a.id !== editingAnnId)
      .filter(a => {
        const aTitleLower = (a.title || '').toLowerCase();
        if (isPlana) return aTitleLower.includes('plana');
        if (isEstrella) return aTitleLower.includes('estrella');
        if (isHierro) return aTitleLower.includes('hierro') && !aTitleLower.includes('estrella');
        if (isMetal) return aTitleLower.includes('metal') && !aTitleLower.includes('plana');
        if (isPlastico) return aTitleLower.includes('plást') || aTitleLower.includes('plast');
        if (isEpoxi) return aTitleLower.includes('epoxi');
        return true;
      })
      .reduce((sum, a) => sum + (typeof a.stock === 'number' ? a.stock : 0), 0);

    return {
      totalProduced,
      lockedOther,
      availableMax: Math.max(0, totalProduced - lockedOther)
    };
  };

  const handleOpenCreateAnnModal = () => {
    setEditingAnnId(null);
    if (isTeacher) {
      handleSelectPreset('hierro');
      setAnnDurationDays('indefinido');
      setAnnStock('ilimitado');
    } else if (studentLevel === 3) {
      const defaultTitle = 'Destornillador de Punta Plana';
      setAnnTitle(defaultTitle);
      setAnnPresentation('Unidades');
      setAnnDescription('Destornilladores de Punta Plana de alta precisión para El Des-Tornillo.');
      setAnnPrice(1);
      const stockInfo = getAvailableStockForProductType(defaultTitle);
      setAnnStock(stockInfo.availableMax);
      setAnnDurationDays('indefinido');
      setAnnUnitWeightKg(0);
      setAnnIsPallet(false);
    } else {
      const defaultTitle = 'Producto final alumno';
      setAnnTitle(defaultTitle);
      setAnnPresentation('Unidades');
      setAnnDescription('');
      setAnnPrice(1);
      const stockInfo = getAvailableStockForProductType(defaultTitle);
      setAnnStock(stockInfo.availableMax);
      setAnnDurationDays('indefinido');
      setAnnUnitWeightKg(0);
      setAnnIsPallet(false);
    }
    setIsAnnModalOpen(true);
  };

  const handleOpenEditAnnModal = (ann: RawMaterialAnnouncement) => {
    setEditingAnnId(ann.id);
    setAnnTitle(ann.title);
    setAnnPresentation(ann.presentation || 'Unidades');
    setAnnDescription(ann.description);
    setAnnPrice(ann.pricePerUnit);
    setAnnDurationDays(ann.durationDays || 'indefinido');
    setAnnUnitWeightKg(ann.materialType === 'producto_final' ? 0 : (ann.unitWeightKg || (ann.materialType === 'epoxi' ? 5 : 1000)));
    setAnnIsPallet(ann.isPallet !== undefined ? ann.isPallet : (ann.materialType !== 'epoxi' && ann.materialType !== 'producto_final'));

    if (isTeacher) {
      setAnnStock(ann.stock === undefined || ann.stock === null || ann.stock === 'ilimitado' ? 'ilimitado' : ann.stock);
    } else {
      const stockInfo = getAvailableStockForProductType(ann.title);
      if (typeof ann.stock === 'number') {
        setAnnStock(Math.min(ann.stock, stockInfo.availableMax));
      } else {
        setAnnStock(stockInfo.availableMax);
      }
    }

    // Detect preset if matches
    const lower = (ann.title || '').toLowerCase();
    if (lower.includes('hierro') || lower.includes('metal')) setAnnPreset('hierro');
    else if (lower.includes('plást') || lower.includes('plast')) setAnnPreset('plastico');
    else if (lower.includes('epoxi')) setAnnPreset('epoxi');
    else setAnnPreset('custom');

    setIsAnnModalOpen(true);
  };

  const handleQuickSyncAnnStock = async (ann: RawMaterialAnnouncement) => {
    const stockInfo = getAvailableStockForProductType(ann.title);
    try {
      const res = await fetch(`/api/raw-materials/announcements/${ann.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: stockInfo.availableMax })
      });
      if (res.ok) {
        fetchData();
        setMsg({ type: 'success', text: `Anuncio sincronizado con el stock real (${stockInfo.availableMax} u.)` });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAnnouncement = async () => {
    if (!annTitle.trim()) {
      setMsg({ type: 'error', text: 'Debes indicar el nombre/título del producto.' });
      return;
    }
    if (!annPrice || Number(annPrice) <= 0) {
      setMsg({ type: 'error', text: 'Debes especificar un precio unitario válido.' });
      return;
    }

    if (!isTeacher && studentLevel === 3) {
      const stockInfo = getAvailableStockForProductType(annTitle);
      const requestedNum = Number(annStock);
      if (isNaN(requestedNum) || requestedNum <= 0) {
        setMsg({ type: 'error', text: 'Debes indicar una cantidad válida de unidades a la venta.' });
        return;
      }
      if (requestedNum > stockInfo.availableMax) {
        setMsg({
          type: 'error',
          text: `No dispones de suficiente stock en tu almacén. Intentas poner a la venta ${requestedNum} u. de "${annTitle}", pero solo tienes ${stockInfo.availableMax} u. disponibles (${stockInfo.totalProduced} u. producidas - ${stockInfo.lockedOther} u. en otros anuncios).`
        });
        return;
      }
    }

    setIsSubmitting(true);
    setMsg(null);
    try {
      let materialType = 'producto_final';
      let unitWeightKg = 0;
      let isPallet = false;

      if (isTeacher) {
        const preset = PRODUCT_PRESETS[annPreset];
        const lower = annTitle.toLowerCase();
        materialType = preset 
          ? preset.materialType 
          : (lower.includes('plast') ? 'plastico' : lower.includes('epoxi') ? 'epoxi' : 'hierro');
        unitWeightKg = annUnitWeightKg ? Number(annUnitWeightKg) : (preset ? preset.unitWeightKg : (materialType === 'epoxi' ? 5 : 1000));
        isPallet = annIsPallet !== undefined ? annIsPallet : (preset ? preset.isPallet : materialType !== 'epoxi');
      }

      const primaryWh = studentWarehouses.find((w: any) => String(w.id) === String(selectedDestinationNaveId)) || studentWarehouses[0];
      const payload = {
        materialType,
        title: annTitle,
        presentation: annPresentation,
        description: annDescription,
        unitWeightKg,
        isPallet,
        pricePerUnit: Number(annPrice),
        durationDays: annDurationDays,
        stock: annStock === '' || annStock === 'ilimitado' ? 'ilimitado' : Number(annStock),
        sellerId: currentUser.id,
        sellerName: isTeacher ? 'BricoMaster Distribuciones, S.A.' : currentUser.name,
        sellerLevel: isTeacher ? 'official' : (currentUser.level || 1),
        sellerLocation: primaryWh?.location || primaryWh?.municipality || primaryWh?.propertyTitle || (currentUser as any).location || (currentUser as any).municipality || '',
        sellerMunicipality: primaryWh?.municipality || (currentUser as any).municipality || (currentUser as any).city || '',
        sellerProvince: primaryWh?.province || (currentUser as any).province || (currentUser as any).provincia || '',
        isDesTornillo: !isTeacher && studentLevel === 3
      };

      let res;
      if (editingAnnId) {
        res = await fetch(`/api/raw-materials/announcements/${editingAnnId}`, {
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

      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: editingAnnId ? 'Anuncio actualizado con éxito' : 'Anuncio publicado correctamente en el Mercado' });
        setIsAnnModalOpen(false);
        setEditingAnnId(null);
        fetchData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al guardar el anuncio' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = (annId: string) => {
    setDeletingAnnId(annId);
  };

  const handleConfirmDeleteAnnouncement = async () => {
    if (!deletingAnnId) return;
    setIsDeletingAnn(true);
    try {
      const res = await fetch(`/api/raw-materials/announcements/${deletingAnnId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: 'Anuncio eliminado correctamente del Mercado.' });
        setAnnouncements(prev => prev.filter(a => a.id !== deletingAnnId));
        setDeletingAnnId(null);
        if (editingAnnId === deletingAnnId) {
          setIsAnnModalOpen(false);
          setEditingAnnId(null);
        }
        fetchData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al eliminar el anuncio.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error al eliminar anuncio.' });
    } finally {
      setIsDeletingAnn(false);
    }
  };

  // Level-based purchasing restriction check
  const canBuyFromSeller = (ann: RawMaterialAnnouncement): { allowed: boolean; reason?: string } => {
    if (ann.isDesTornillo) {
      if (isTeacher || currentUser.username === 'pupdaniel') {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Sección "El Des-Tornillo": Solo el Profesor puede comprar anuncios de esta sección.'
      };
    }

    if (isTeacher) return { allowed: true };
    const sId = ann.sellerId || 'proveedor-materia-prima';
    const sLevel = ann.sellerLevel || 'official';

    if (studentLevel === 1) {
      if (sId === 'proveedor-materia-prima' || sLevel === 'official' || sLevel === 1) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Los alumnos de Nivel 1 solo pueden comprar materias primas o productos al Proveedor Oficial o a otros alumnos de Nivel 1.'
      };
    } else if (studentLevel === 2) {
      if (sLevel === 1) return { allowed: true };
      return {
        allowed: false,
        reason: 'Los alumnos de Nivel 2 solo pueden realizar solicitudes de compra a los alumnos de Nivel 1.'
      };
    } else if (studentLevel === 3) {
      if (sLevel === 2) return { allowed: true };
      return {
        allowed: false,
        reason: 'Los alumnos de Nivel 3 solo pueden realizar solicitudes de compra a los alumnos de Nivel 2.'
      };
    }

    return { allowed: false, reason: 'No cumples los requisitos de nivel para esta compra.' };
  };

  // Mercado Filtered Items
  const filteredAnnouncements = announcements.filter(ann => {
    // Hide inactive or sold-out announcements unless viewing "Mis Anuncios"
    if (mercadoFilter !== 'mis_anuncios') {
      if (ann.active === false) return false;
      if (typeof ann.stock === 'number' && ann.stock <= 0) return false;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const titleMatch = ann.title?.toLowerCase().includes(q);
      const descMatch = ann.description?.toLowerCase().includes(q);
      const sellerMatch = ann.sellerName?.toLowerCase().includes(q);
      if (!titleMatch && !descMatch && !sellerMatch) return false;
    }

    if (mercadoFilter === 'comprables') {
      return canBuyFromSeller(ann).allowed;
    }
    if (mercadoFilter === 'mis_anuncios') {
      return ann.sellerId === currentUser.id;
    }
    if (mercadoFilter === 'materia_prima') {
      return ann.materialType !== 'producto_final';
    }
    if (mercadoFilter === 'producto_final') {
      return ann.materialType === 'producto_final';
    }

    return true;
  });

  const studentWarehouses = acquisitions.filter((a: any) => {
    const t = (a.type || a.propertyType || '').toLowerCase();
    const title = (a.propertyTitle || a.title || '').toLowerCase();
    return ['nave_industrial', 'almacen', 'almacen_logistico', 'industrial'].includes(t) ||
           title.includes('nave') || title.includes('almacén') || title.includes('almacen');
  });

  const checkWarehouseHasForklift = (w: any) => {
    if (!w) return false;
    const wIdStr = String(w.id || w.propertyId);
    return vehicles.some((v: any) =>
      v.vehicleType === 'carretilla_elevadora' &&
      (
        String(v.assignedPropertyId) === wIdStr ||
        (studentWarehouses.length === 1 && (v.assignedWarehouseIndex !== undefined && v.assignedWarehouseIndex !== null))
      )
    );
  };

  const [selectedDestinationNaveId, setSelectedDestinationNaveId] = useState<string>('');

  useEffect(() => {
    if (studentWarehouses.length > 0 && !selectedDestinationNaveId) {
      setSelectedDestinationNaveId(studentWarehouses[0].id);
    }
  }, [acquisitions]);

  // Negotiation State
  const [negotiatingOrder, setNegotiatingOrder] = useState<RawMaterialOrder | null>(null);
  const [negDiscount, setNegDiscount] = useState<number>(0);
  const [negInsurance, setNegInsurance] = useState<number>(0);
  const [negTransportMethod, setNegTransportMethod] = useState<'vendedor_envio' | 'comprador_recogida'>('vendedor_envio');
  const [negPricePerUnit, setNegPricePerUnit] = useState<number>(0);
  const [negQty, setNegQty] = useState<number>(1);
  const [negNote, setNegNote] = useState<string>('');

  // Cart operations
  const handleAddToCart = (ann: RawMaterialAnnouncement, qty: number = 1) => {
    const check = canBuyFromSeller(ann);
    if (!check.allowed) {
      setMsg({ type: 'error', text: check.reason || 'No cumples los requisitos para comprar este producto.' });
      setShowLevelRestrictionModal(true);
      return;
    }
    setCart(prev => {
      const idx = prev.findIndex(item => item.announcement.id === ann.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx].quantity += qty;
        return updated;
      } else {
        return [...prev, { announcement: ann, quantity: qty }];
      }
    });
  };

  const updateCartQty = (annId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.announcement.id === annId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean) as RawMaterialCartItem[]);
  };

  const removeFromCart = (annId: string) => {
    setCart(prev => prev.filter(item => item.announcement.id !== annId));
  };

  // Cart calculations
  const cartTotalKg = cart.reduce((sum, item) => {
    const isScrewdriver = item.announcement.materialType === 'producto_final' || (item.announcement.title && item.announcement.title.toLowerCase().includes('destornillador'));
    return sum + (isScrewdriver ? 0 : (item.announcement.unitWeightKg * item.quantity));
  }, 0);
  const cartBasePrice = cart.reduce((sum, item) => sum + (item.announcement.pricePerUnit * item.quantity), 0);
  const cartRequestedPallets = cart.reduce((sum, item) => {
    const isScrewdriver = item.announcement.materialType === 'producto_final' || (item.announcement.title && item.announcement.title.toLowerCase().includes('destornillador'));
    const itemKg = isScrewdriver ? 0 : (item.announcement.unitWeightKg * item.quantity);
    const itemP = isScrewdriver ? (item.quantity / 10000) : (itemKg / 1000);
    return sum + itemP;
  }, 0);
  const cartChargedPallets = cartRequestedPallets > 0 ? Math.max(1, Math.ceil(cartRequestedPallets)) : 0;
  const primarySellerAnn = cart[0]?.announcement;
  const cartDestNave = studentWarehouses.find((w: any) => String(w.id) === String(selectedDestinationNaveId)) || studentWarehouses[0];
  const cartDistanceKm = calculateSpanishDistanceKm(
    cartDestNave || currentUser,
    primarySellerAnn || 'Almacén Central Oficial'
  );
  const cartTransportCost = cartNeedsTransport && cart.length > 0 ? Math.round(cartChargedPallets * cartDistanceKm * 0.38 * 100) / 100 : 0;
  const cartIvaAmount = Math.round(((cartBasePrice + cartTransportCost) * 0.21) * 100) / 100;
  const cartGrandTotal = Math.round((cartBasePrice + cartTransportCost + cartIvaAmount) * 100) / 100;
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartExceedsWarehouse = (isLevel1 && !isTeacher) && (totalOccupiedPallets + cartRequestedPallets) > (maxPalletsAllowed + 0.001);

  const handleCheckoutCart = async () => {
    if (cart.length === 0) return;
    for (const item of cart) {
      const check = canBuyFromSeller(item.announcement);
      if (!check.allowed) {
        setMsg({ type: 'error', text: check.reason || 'No cumples los requisitos de nivel para esta compra.' });
        return;
      }
    }

    if (cartExceedsWarehouse) {
      setMsg({
        type: 'error',
        text: `Exceso de capacidad en almacén: Tienes ${realWarehouseM2} m² de zona de almacén (${maxPalletsAllowed} palets máx.). Tu stock actual ocupa ${totalOccupiedPallets.toFixed(2)} palets y la cesta suma ${cartRequestedPallets.toFixed(2)} palets, superando el límite máximo permitido (${freePallets.toFixed(2)} palets libres actuales).`
      });
      return;
    }

    setIsSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch('/api/raw-materials/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          items: cart.map(item => ({
            announcementId: item.announcement.id,
            quantity: item.quantity
          })),
          needsTransport: cartNeedsTransport,
          pickupVehicleId: !cartNeedsTransport && ownedTruck ? ownedTruck.id : undefined,
          destinationWarehouseIndex: selectedCartWarehouseKey,
          destinationNaveId: selectedDestinationNaveId || (studentWarehouses[0]?.id)
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: `¡Solicitud de compra conjunta (${cart.length} productos) remitida exitosamente!` });
        setCart([]);
        setIsCartOpen(false);
        fetchData();
        if (onRefreshUser) onRefreshUser();
      } else {
        setMsg({ type: 'error', text: data.error || 'No se pudo procesar la solicitud de compra.' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Error de conexión al tramitar el pedido.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenOrderModalChecked = (ann: RawMaterialAnnouncement) => {
    const check = canBuyFromSeller(ann);
    if (!check.allowed) {
      setMsg({ type: 'error', text: check.reason || 'No cumples los requisitos para comprar este producto.' });
      return;
    }
    setSelectedAnn(ann);
    setQuantity(1);
    setNeedsTransport(true);
    if (ownedTruck) setSelectedVehicleId(ownedTruck.id);
  };

  const handleOpenNegotiationModal = (ord: RawMaterialOrder) => {
    setNegotiatingOrder(ord);
    setNegDiscount(ord.discountPercentage || 0);
    setNegInsurance(ord.insuranceFee || 0);
    setNegTransportMethod(ord.transportMethod || (ord.needsTransport ? 'vendedor_envio' : 'comprador_recogida'));
    setNegQty(ord.quantity || 1);
    setNegPricePerUnit(ord.basePrice && ord.quantity ? Math.round((ord.basePrice / ord.quantity) * 100) / 100 : 0);
    setNegNote('');
  };

  const handleSendNegotiation = async () => {
    if (!negotiatingOrder) return;
    setIsSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/raw-materials/orders/${negotiatingOrder.id}/negotiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          discountPercentage: negDiscount,
          insuranceFee: negInsurance,
          transportMethod: negTransportMethod,
          pricePerUnit: negPricePerUnit,
          quantity: negQty,
          note: negNote
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message });
        setNegotiatingOrder(null);
        fetchData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al enviar contraoferta.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión al negociar.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedAnn) return;
    const check = canBuyFromSeller(selectedAnn);
    if (!check.allowed) {
      setMsg({ type: 'error', text: check.reason || 'No cumples los requisitos de nivel para esta compra.' });
      return;
    }

    if (orderExceedsWarehouse) {
      setMsg({
        type: 'error',
        text: `Exceso de capacidad en almacén: Tienes ${realWarehouseM2} m² de zona de almacén (${maxPalletsAllowed} palets máx.). Tu stock actual ocupa ${totalOccupiedPallets.toFixed(2)} palets y el pedido suma ${orderRequestedPallets.toFixed(2)} palets, superando el límite máximo permitido (${freePallets.toFixed(2)} palets libres actuales).`
      });
      return;
    }

    setIsSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch('/api/raw-materials/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: currentUser.id,
          announcementId: selectedAnn.id,
          quantity,
          needsTransport,
          pickupVehicleId: !needsTransport ? selectedVehicleId : undefined,
          destinationNaveId: selectedDestinationNaveId || (studentWarehouses[0]?.id)
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message });
        setSelectedAnn(null);
        fetchData();
        if (onRefreshUser) onRefreshUser();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al procesar la solicitud' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión al enviar la solicitud.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelivery = async (orderId: string) => {
    try {
      const res = await fetch(`/api/raw-materials/orders/${orderId}/deliver`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al confirmar la recepción' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión.' });
    }
  };

  const handleShipOrder = async (orderId: string) => {
    setIsSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/raw-materials/orders/${orderId}/ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message });
        fetchData();
        if (onRefreshUser) onRefreshUser();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al expedir la mercancía.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión al procesar el envío.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendInvoice = async (orderId: string) => {
    setIsSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/raw-materials/orders/${orderId}/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: `Factura ${data.invoiceNumber} emitida y notificada al comprador.` });
        fetchData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al emitir la factura.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión al emitir factura.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Order Approval / Rejection Handlers (for Sellers - Teachers & Students)
  const handleApproveOrder = async (orderId: string) => {
    setIsSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/raw-materials/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: data.message });
        fetchData();
        if (onRefreshUser) onRefreshUser();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al aceptar la solicitud.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectingOrderId) return;
    setIsSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/raw-materials/orders/${rejectingOrderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason, userId: currentUser.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: 'Solicitud rechazada con éxito.' });
        setRejectingOrderId(null);
        setRejectionReason('');
        fetchData();
      } else {
        setMsg({ type: 'error', text: data.error || 'Error al rechazar la solicitud.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Error de conexión.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single Order Modal calculations
  const isSelectedScrewdriver = selectedAnn && (selectedAnn.materialType === 'producto_final' || selectedAnn.isDesTornillo || (selectedAnn.title && selectedAnn.title.toLowerCase().includes('destornillador')));
  const totalKg = (selectedAnn && !isSelectedScrewdriver) ? selectedAnn.unitWeightKg * quantity : 0;
  const basePrice = selectedAnn ? Math.round((selectedAnn.pricePerUnit * quantity) * 100) / 100 : 0;
  const orderRequestedPallets = selectedAnn ? (isSelectedScrewdriver ? (quantity / 10000) : (totalKg / 1000)) : 0;
  const orderChargedPallets = orderRequestedPallets > 0 ? Math.max(1, Math.ceil(orderRequestedPallets)) : 0;
  const selectedDestNave = studentWarehouses.find((w: any) => String(w.id) === String(selectedDestinationNaveId)) || studentWarehouses[0];
  const orderDistanceKm = selectedAnn ? calculateSpanishDistanceKm(
    selectedDestNave || currentUser,
    selectedAnn
  ) : 35;
  const transportCost = needsTransport ? Math.round(orderChargedPallets * orderDistanceKm * 0.38 * 100) / 100 : 0;
  const ivaAmount = Math.round(((basePrice + transportCost) * 0.21) * 100) / 100;
  const totalAmount = Math.round((basePrice + transportCost + ivaAmount) * 100) / 100;

  const orderExceedsWarehouse = (isLevel1 && !isTeacher) && (totalOccupiedPallets + orderRequestedPallets) > (maxPalletsAllowed + 0.001);

  const pendingReceivedOrders = orders.filter(o => {
    const isSeller = o.sellerId === currentUser.id || (isTeacher && (o.sellerId === 'proveedor-materia-prima' || !o.sellerId));
    return isSeller && (o.status === 'pendiente' || o.status === 'en_negociacion');
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-amber-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold uppercase tracking-wider border border-amber-500/30">
              <ShoppingBag className="w-3.5 h-3.5" />
              Suministros Industriales San Fernando S.A.
              {isTeacher && <span className="bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded ml-1 text-[10px]">PROFESOR (pupdaniel)</span>}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Mercado</h1>
            <p className="text-slate-300 text-sm max-w-2xl">
              {isTeacher
                ? 'Panel de control de la cuenta pupdaniel para publicar anuncios de venta de materias primas y gestionar solicitudes de compra de los alumnos.'
                : 'Portal para la adquisición de fragmentos metálicos, pellets de plástico y pegamento epoxi para las líneas de fabricación.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {(isTeacher || studentLevel >= 3) && (
              <button
                onClick={handleOpenCreateAnnModal}
                className="px-4 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-extrabold text-xs shadow-lg transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{studentLevel === 3 && !isTeacher ? 'Publicar en El Des-Tornillo' : 'Publicar Anuncio en Mercado'}</span>
              </button>
            )}

            {!isTeacher && (
              <div className="hidden sm:flex bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-xl p-3 items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Tu nivel de mercado</div>
                  <div className="text-xs font-bold text-white">Nivel {studentLevel}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notification Messages */}
      {msg && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          msg.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <div className="flex items-center gap-3">
            {msg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span className="text-sm font-medium">{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-white text-sm">Cerrar</button>
        </div>
      )}

      {/* Seller Received Purchase Requests Section (Teachers & Students) */}
      {pendingReceivedOrders.length > 0 && (
        <div className="bg-slate-900 border-2 border-amber-500/30 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-xl font-bold text-amber-300 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-400" />
              Solicitudes de Compra Recibidas como Vendedor ({pendingReceivedOrders.length})
            </h2>
            <span className="text-xs text-slate-400">Acciones disponibles: Aceptar, Negociar o Rechazar</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Comprador</th>
                  <th className="py-3 px-4 font-semibold">Producto / Anuncio</th>
                  <th className="py-3 px-4 font-semibold">Cantidad</th>
                  <th className="py-3 px-4 font-semibold">Logística</th>
                  <th className="py-3 px-4 font-semibold">Importe total</th>
                  <th className="py-3 px-4 font-semibold text-right">Acciones de vendedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pendingReceivedOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white">{ord.studentName}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {ord.buyerLevel ? `Alumno Nivel ${ord.buyerLevel}` : ord.studentId}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-amber-300">
                      <div>{ord.materialTitle}</div>
                      {ord.items && ord.items.length > 1 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {ord.items.map((it, idx) => {
                            const isItScrewdriver = it.materialType === 'producto_final' || (it.materialTitle && it.materialTitle.toLowerCase().includes('destornillador'));
                            return (
                              <span key={idx} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700/80 px-1.5 py-0.5 rounded font-mono">
                                {it.materialTitle} ({it.quantity} u.{!isItScrewdriver && it.totalKg ? ` - ${formatNumber(it.totalKg)} kg` : ''})
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200">{ord.quantity} unidades</div>
                      {ord.materialType !== 'producto_final' && !ord.materialTitle?.toLowerCase().includes('destornillador') && ord.totalKg > 0 && (
                        <div className="text-[11px] text-slate-400">{formatNumber(ord.totalKg)} kg</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {ord.needsTransport ? (
                        <span className="inline-flex items-center gap-1 text-xs text-indigo-400 font-medium">
                          <Truck className="w-3.5 h-3.5" /> Envío por vendedor (+{formatNumber(ord.transportCost)} €)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                          <Building className="w-3.5 h-3.5" /> Recogida por comprador
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-black text-emerald-400 text-base">
                      {formatNumber(ord.totalAmount)} €
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleApproveOrder(ord.id)}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow transition-colors inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Aceptar</span>
                      </button>
                      <button
                        onClick={() => handleOpenNegotiationModal(ord)}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs shadow transition-colors inline-flex items-center gap-1"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>Negociar</span>
                      </button>
                      <button
                        onClick={() => {
                          setRejectingOrderId(ord.id);
                          setRejectionReason('');
                        }}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs transition-colors inline-flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rechazar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warehouse Surface & Equipment Requirements Banner for Level 1 Students */}
      {!isTeacher && isLevel1 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Superficie y capacidad de almacén (Nivel 1)</h2>
                <p className="text-xs text-slate-400">Capacidad legal y estocaje: Máximo 25 palets por cada 30 m² de almacén ({maxPalletsAllowed} palets en {realWarehouseM2} m²).</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-slate-800/90 px-3.5 py-2 rounded-xl border border-slate-700 text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Superficie Almacén</div>
                <div className="text-sm font-black text-indigo-400">{realWarehouseM2} m²</div>
              </div>
              <div className="bg-slate-800/90 px-3.5 py-2 rounded-xl border border-slate-700 text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Capacidad máx.</div>
                <div className="text-sm font-black text-white">{maxPalletsAllowed} palets</div>
              </div>
              <div className="bg-slate-800/90 px-3.5 py-2 rounded-xl border border-slate-700 text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Ocupación almacén</div>
                <div className={`text-sm font-black ${isOverCapacity ? 'text-rose-400' : 'text-amber-400'}`}>
                  {occupiedPercentage.toFixed(1)}% <span className="text-[10px] text-slate-400 font-normal">({totalOccupiedPallets.toFixed(2)} pal.)</span>
                </div>
              </div>
              <div className="bg-slate-800/90 px-3.5 py-2 rounded-xl border border-slate-700 text-right">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Disponible compra</div>
                <div className="text-sm font-black text-emerald-400">
                  {freePercentage.toFixed(1)}% <span className="text-[10px] text-emerald-300/80 font-normal">({freePallets.toFixed(2)} pal.)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Occupancy and Capacity Progress Bar (Identical to "Existencias") */}
          <div className="space-y-1.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 text-[11px]">0 palets (0%)</span>
              <span className="font-bold text-slate-200 text-[11px]">
                Almacén ocupado: {totalOccupiedPallets.toFixed(2)} / {maxPalletsAllowed} palets ({occupiedPercentage.toFixed(1)}%) — Espacio libre: {freePallets.toFixed(2)} palets
              </span>
              <span className="text-slate-400 text-[11px]">Capacidad máx: {maxPalletsAllowed} palets (100%)</span>
            </div>
            <div className="h-3.5 w-full bg-slate-800 rounded-full overflow-hidden flex border border-slate-700 shadow-inner">
              <div
                style={{ width: `${clampedOccupiedPercentage}%` }}
                className={`h-full transition-all duration-500 flex items-center justify-center text-[9px] font-bold text-white ${
                  occupiedPercentage > 100
                    ? "bg-gradient-to-r from-rose-500 to-rose-600 animate-pulse"
                    : occupiedPercentage > 85
                    ? "bg-gradient-to-r from-amber-500 to-amber-600"
                    : "bg-gradient-to-r from-indigo-500 to-indigo-600"
                }`}
                title={`Ocupado: ${occupiedPercentage.toFixed(1)}% (${totalOccupiedPallets.toFixed(2)} palets)`}
              >
                {clampedOccupiedPercentage >= 15 && (
                  <span className="px-1 truncate">{occupiedPercentage.toFixed(1)}%</span>
                )}
              </div>
              <div
                style={{ width: `${clampedFreePercentage}%` }}
                className="h-full bg-emerald-500/80 transition-all duration-500 flex items-center justify-center text-[9px] font-bold text-white"
                title={`Libre: ${freePercentage.toFixed(1)}% (${freePallets.toFixed(2)} palets)`}
              >
                {clampedFreePercentage >= 15 && (
                  <span className="px-1 truncate">{freePercentage.toFixed(1)}%</span>
                )}
              </div>
            </div>
          </div>

          {/* Overcapacity Warning Banner */}
          {isOverCapacity && (
            <div className="p-3 bg-rose-950/70 border border-rose-500/60 rounded-xl text-xs text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-medium shadow-md">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  ⚠️ <strong>Exceso de capacidad en almacén:</strong> Superas la capacidad máxima de tu almacén por +{(totalOccupiedPallets - maxPalletsAllowed).toFixed(2)} palets (+{(occupiedPercentage - 100).toFixed(1)}%).
                </span>
              </span>
              <span className="text-[11px] bg-rose-900/90 text-rose-200 font-bold px-2.5 py-1 rounded-md border border-rose-700 shrink-0 self-start sm:self-auto">
                Sanción: 1.000 € / semana
              </span>
            </div>
          )}

          {/* Pallet Breakdown (Exact standards from Existencias) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/70">
              <span className="text-slate-400 block text-[10px]">⚖️ Fragmentos hierro (1.000 kg/palet)</span>
              <span className="font-bold font-mono text-slate-200">
                {formatNumber(ironKg, 1)} kg → {ironPallets.toFixed(2)} palets
              </span>
            </div>
            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/70">
              <span className="text-slate-400 block text-[10px]">📦 Pellets plástico (1.000 kg / 40 sacos)</span>
              <span className="font-bold font-mono text-slate-200">
                {formatNumber(plasticKg, 1)} kg → {plasticPallets.toFixed(2)} palets
              </span>
            </div>
            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/70">
              <span className="text-slate-400 block text-[10px]">🧪 Pegamento epoxi (1.000 kg/palet)</span>
              <span className="font-bold font-mono text-slate-200">
                {formatNumber(epoxiKg, 1)} kg → {epoxiPallets.toFixed(2)} palets
              </span>
            </div>
            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/70">
              <span className="text-slate-400 block text-[10px]">🔩 Terminados (varillas y destornilladores)</span>
              <span className="font-bold font-mono text-slate-200">
                {formatNumber((isLevel1 ? starRods + flatRods : 0) + starScrewdrivers + flatScrewdrivers, 0)} u. → {finishedGoodsPallets.toFixed(2)} palets
              </span>
            </div>
          </div>

          {/* Requirements Status Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between font-medium ${
              rawMaterialWarehousesCount > 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <span>1. Almacén configurado:</span>
              <strong className="font-bold">{rawMaterialWarehousesCount > 0 ? `${realWarehouseM2} m² (${maxPalletsAllowed} pal.) ✅` : '0 m² ❌'}</strong>
            </div>

            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between font-medium ${
              hasEnoughForklifts ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <span>2. Carretilla elevadora (mín. 1 en propiedad):</span>
              <strong className="font-bold">{ownedForklifts}/1 {hasEnoughForklifts ? '✅ OK' : '❌ Pendiente'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Main Mercado Navigation Sub-Tabs */}
      <div className="bg-slate-900 border border-slate-800 p-2 rounded-2xl flex flex-wrap items-center gap-2 mb-6 shadow-xl">
        <button
          onClick={() => setActiveMainTab('catalogo')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeMainTab === 'catalogo'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Catálogo de mercado</span>
        </button>

        <button
          onClick={() => setActiveMainTab('mensajeria')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative ${
            activeMainTab === 'mensajeria'
              ? 'bg-indigo-500 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Mensajería directa ({tradingPartners.length})</span>
          {tradingPartners.reduce((acc, p) => acc + (p.unreadCount || 0), 0) > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm">
              {tradingPartners.reduce((acc, p) => acc + (p.unreadCount || 0), 0) > 99
                ? '99+'
                : tradingPartners.reduce((acc, p) => acc + (p.unreadCount || 0), 0)}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('facturacion')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeMainTab === 'facturacion'
              ? 'bg-purple-500 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Facturas ({orders.filter(isOfficialCommercialInvoice).length})</span>
        </button>
      </div>

      {/* 1. TAB: CATALOGO / PERFILES DE EMPRESA Y MERCADO */}
      {activeMainTab === 'catalogo' && (
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              Mercado Comercial & Directorio de Empresas
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Consulta los perfiles de empresa de tus posibles socios comerciales según las reglas del mercado e inicia conversaciones directas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isTeacher && (
              <button
                onClick={handleOpenMyProfileModal}
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl shadow transition-all"
              >
                <Building2 className="w-4 h-4" />
                <span>{companyProfiles.some(p => p.studentId === currentUser.id) ? 'Editar mi perfil de empresa' : 'Publicar perfil de empresa'}</span>
              </button>
            )}
            {isTeacher && (
              <button
                onClick={handleOpenCreateAnnModal}
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-2 rounded-xl shadow transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Publicar oferta oficial</span>
              </button>
            )}
            <button
              onClick={() => { fetchData(); fetchCompanyProfiles(); }}
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* SECTION 1: PERFILES DE EMPRESA DISPONIBLES */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Perfiles de empresa comercial ({companyProfiles.length})</span>
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              Visibilidad regulada por Nivel de Empresa
            </span>
          </div>

          {companyProfiles.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400 font-medium">No se han publicado perfiles de empresa en tu segmento de mercado todavía.</p>
              {!isTeacher && (
                <button
                  onClick={handleOpenMyProfileModal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white rounded-xl transition"
                >
                  Sé el primero en publicar el perfil de tu empresa
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {companyProfiles.map((p) => {
                const isMe = p.studentId === currentUser.id;
                const levelLabels: Record<number, string> = {
                  1: 'Nivel 1 • Empresa Fabricante',
                  2: 'Nivel 2 • Distribuidora Mayorista',
                  3: 'Nivel 3 • Distribuidora Minorista'
                };

                return (
                  <div
                    key={p.id}
                    className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all shadow-lg ${
                      isMe ? 'border-indigo-500/50 bg-indigo-950/20' : 'border-slate-800 hover:border-indigo-500/30'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Logo and Header */}
                      <div className="flex items-start gap-3">
                        {p.logoUrl ? (
                          <img
                            src={p.logoUrl}
                            alt={p.companyName}
                            className="w-12 h-12 rounded-xl object-cover border border-slate-700 bg-slate-950 shrink-0"
                            referrerPolicy="no-referrer"
                            onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=120&q=80'; }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                            <Building2 className="w-6 h-6 text-indigo-400" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-base font-bold text-white truncate">{p.companyName}</h4>
                            {isMe && (
                              <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.5 rounded">
                                Tu Empresa
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-medium text-indigo-400 mt-0.5">
                            {levelLabels[p.level] || `Nivel ${p.level}`}
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 leading-relaxed line-clamp-3 min-h-[64px]">
                        {p.description || 'Esta empresa aún no ha personalizado su descripción comercial.'}
                      </p>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2 border-t border-slate-800">
                      {isMe ? (
                        <button
                          onClick={handleOpenMyProfileModal}
                          className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <Edit className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Editar perfil de empresa</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleContactCompany(p.studentId)}
                          className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md flex items-center justify-center gap-2"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>Contactar en mensajería directa</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: SUMINISTRO OFICIAL Y OFERTAS DE MATERIA PRIMA */}
        {announcements.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-400" />
                <span>Suministro oficial de materias primas ({announcements.length})</span>
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                  Lotes Oficiales habilitados para compra
                </span>
                {!isTeacher && (
                  <button
                    onClick={() => setIsCartOpen(true)}
                    className="relative px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-extrabold text-xs shadow-lg transition flex items-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>Cesta</span>
                    {cartItemCount > 0 && (
                      <span className="bg-slate-950 text-amber-400 font-black text-[10px] px-2 py-0.5 rounded-full">
                        {cartItemCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

        {/* Mercado Filters & Search Bar */}
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl mb-5 space-y-3 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por producto, material o empresa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setMercadoFilter(prev => prev === 'comprables' ? 'todos' : 'comprables')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  mercadoFilter === 'comprables'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-bold'
                    : 'bg-slate-950 text-emerald-400 border border-slate-800 hover:border-emerald-500/40'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Comprables para mi nivel</span>
              </button>
              {(isTeacher || studentLevel === 3) && (
                <button
                  onClick={handleOpenCreateAnnModal}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{studentLevel === 3 ? 'Publicar en El Des-Tornillo' : 'Publicar anuncio'}</span>
                </button>
              )}
              <button
                onClick={() => setIsCartOpen(true)}
                className="relative px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-xl font-bold text-xs shadow-md transition flex items-center gap-1.5"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
                <span>Cesta ({cartItemCount})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Catalog Grid with Sections */}
        {filteredAnnouncements.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <Package className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-sm text-slate-400 font-medium">No se encontraron anuncios con los filtros seleccionados.</p>
            <button
              onClick={() => { setMercadoFilter('comprables'); setSearchTerm(''); }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white rounded-xl border border-slate-700"
            >
              Restablecer Filtros
            </button>
          </div>
        ) : (() => {
          const officialAnnouncements = filteredAnnouncements.filter(a => !a.isDesTornillo && (a.sellerLevel === 'official' || a.sellerId === 'proveedor-materia-prima'));
          const desTornilloAnnouncements = filteredAnnouncements.filter(a => a.isDesTornillo === true);
          const studentAnnouncements = filteredAnnouncements.filter(a => !a.isDesTornillo && a.sellerLevel !== 'official' && a.sellerId !== 'proveedor-materia-prima');

          const renderCard = (ann: RawMaterialAnnouncement) => {
            const inCartItem = cart.find(item => item.announcement.id === ann.id);
            const isMyAnnouncement = isTeacher
              ? (ann.sellerId === currentUser.id || ann.sellerLevel === 'official' || ann.sellerId === 'proveedor-materia-prima' || ann.sellerId === 'profesor-1' || ann.materialType !== 'producto_final')
              : ann.sellerId === currentUser.id;
            const eligibility = canBuyFromSeller(ann);
            const isFinishedProduct = ann.materialType === 'producto_final';

            return (
              <div
                key={ann.id}
                className={`bg-slate-900 border transition-all rounded-2xl p-5 flex flex-col justify-between group shadow-lg relative ${
                  isMyAnnouncement 
                    ? isTeacher
                      ? 'border-amber-500/40 bg-amber-950/15 hover:border-amber-400'
                      : 'border-purple-500/40 bg-purple-950/10' 
                    : ann.isDesTornillo
                      ? 'border-amber-500/40 bg-amber-950/20 hover:border-amber-400'
                      : eligibility.allowed 
                        ? 'border-slate-800 hover:border-amber-500/40' 
                        : 'border-slate-800/80 opacity-85'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    {ann.isDesTornillo ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border bg-amber-500/20 text-amber-300 border-amber-500/40">
                        <Wrench className="w-3 h-3 text-amber-400" />
                        El Des-Tornillo
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                        isFinishedProduct
                          ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {isFinishedProduct ? '🏆 Producto final' : '📦 Materia prima'}
                      </span>
                    )}

                    {isMyAnnouncement ? (
                      <span className={`${isTeacher ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-purple-500/20 text-purple-300 border-purple-500/40'} border font-bold text-[10px] px-2 py-0.5 rounded-md`}>
                        {isTeacher ? 'Gestión Profesor' : 'Tu Anuncio'}
                      </span>
                    ) : inCartItem ? (
                      <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-md">
                        En Cesta ({inCartItem.quantity})
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                      {ann.title}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-xs font-semibold text-slate-300 truncate">
                        {ann.sellerName}
                      </span>
                      {ann.sellerLevel === 'official' ? (
                        <span className="bg-amber-400/20 text-amber-300 text-[9px] font-bold px-1.5 py-0.2 rounded border border-amber-400/30">
                          OFICIAL
                        </span>
                      ) : (
                        <span className="bg-slate-800 text-slate-400 text-[9px] font-bold px-1.5 py-0.2 rounded border border-slate-700">
                          Nivel {ann.sellerLevel}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-amber-300/80 mt-1">{ann.presentation}</p>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{ann.description}</p>

                  {/* Alerta de Demanda Comercial si existe */}
                  {ann.priceAlert && ann.priceAlert.active && (
                    <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 space-y-1.5 shadow-sm">
                      <div className="flex items-center gap-1.5 text-amber-300 font-bold text-[11px]">
                        <TrendingDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Alerta de demanda comercial:</span>
                      </div>
                      <p className="text-xs text-amber-100/90 leading-relaxed italic">
                        "{ann.priceAlert.message}"
                      </p>
                      {ann.priceAlert.suggestedPrice && (
                        <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1 mt-1">
                          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>Precio sugerido por el mercado: máx. {formatNumber(ann.priceAlert.suggestedPrice)} €/u.</span>
                        </div>
                      )}
                      {isMyAnnouncement && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditAnnModal(ann)}
                          className="mt-1.5 w-full py-1.5 px-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] rounded-lg transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Ajustar / reducir precio ahora</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Eligibility Badge */}
                  {!isMyAnnouncement && (
                    <div className="pt-1">
                      {eligibility.allowed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                          <CheckCircle2 className="w-3 h-3" />
                          {ann.isDesTornillo ? 'Comprable por el Profesor' : `Comprable para Nivel ${studentLevel}`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg" title={eligibility.reason}>
                          <ShieldAlert className="w-3 h-3 text-amber-400" />
                          {ann.isDesTornillo ? 'Venta exclusiva al Profesor' : 'No comprable para tu nivel'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-3 mt-3 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs py-1.5 px-3 bg-slate-950/70 rounded-xl border border-slate-800">
                    <span className="text-slate-400 font-medium flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-amber-400" />
                      <span>Unidades disponibles:</span>
                    </span>
                    <span className={`font-bold font-mono text-xs ${
                      typeof ann.stock === 'number'
                        ? ann.stock <= 0
                          ? 'text-rose-400'
                          : ann.stock <= 5
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        : 'text-slate-300'
                    }`}>
                      {ann.stock === undefined || ann.stock === null || ann.stock === 'ilimitado'
                        ? 'Ilimitado'
                        : `${formatNumber(ann.stock)} u.`}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-400 font-medium">Precio base</span>
                    <div className="text-right">
                      <span className="text-xl font-bold text-white">{formatNumber(ann.pricePerUnit)} €</span>
                      <span className="text-[10px] text-slate-400 block">+ 21% IVA</span>
                    </div>
                  </div>

                  {isMyAnnouncement ? (
                    <div className="space-y-2 pt-1">
                      {!isTeacher && (() => {
                        const stockInfo = getAvailableStockForProductType(ann.title);
                        const isOutOfSync = typeof ann.stock === 'number' && ann.stock !== stockInfo.availableMax;
                        return (
                          <>
                            <div className="text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                              <span className="text-slate-400 font-medium">Existencias reales:</span>
                              <span className="font-bold font-mono text-amber-300">{stockInfo.availableMax} u.</span>
                            </div>
                            {isOutOfSync && stockInfo.availableMax > 0 && (
                              <button
                                onClick={() => handleQuickSyncAnnStock(ann)}
                                className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[11px] border border-amber-500/40 flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <RefreshCw className="w-3 h-3 text-amber-400" />
                                <span>Ajustar anuncio a {stockInfo.availableMax} u.</span>
                              </button>
                            )}
                          </>
                        );
                      })()}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEditAnnModal(ann)}
                          className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                          title="Eliminar anuncio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAddToCart(ann, 1)}
                        disabled={!eligibility.allowed}
                        className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                          eligibility.allowed
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        }`}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>Añadir a la cesta</span>
                      </button>

                      <button
                        onClick={() => handleOpenOrderModalChecked(ann)}
                        disabled={!eligibility.allowed}
                        className={`py-2.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 transition-all ${
                          eligibility.allowed
                            ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                            : 'bg-slate-800/50 text-slate-600 border border-slate-800 cursor-not-allowed'
                        }`}
                        title={eligibility.allowed ? 'Solicitar unidades directamente' : eligibility.reason}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Teacher Price Warning Alert Button (pupdaniel / teacher role) */}
                  {isTeacher && !isMyAnnouncement && (ann.isDesTornillo || ann.sellerLevel === 3 || (ann.sellerId && ann.sellerId !== 'proveedor-materia-prima' && ann.sellerId !== 'profesor-1')) && (
                    <div className="pt-1.5 border-t border-slate-800/80">
                      {ann.priceAlert && ann.priceAlert.active ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPriceAlertModal(ann)}
                            className="flex-1 py-1.5 px-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold text-[11px] border border-amber-500/40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            title="Modificar o reenviar aviso de demanda de mercado"
                          >
                            <Megaphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Aviso de precio enviado</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleWithdrawPriceAlert(ann.id)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer"
                            title="Retirar aviso de precio excesivo"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPriceAlertModal(ann)}
                          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 hover:from-amber-500/25 hover:to-orange-500/25 text-amber-200 font-bold text-[11px] border border-amber-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer group/btn shadow-sm"
                          title="Enviar aviso simulado de mercado al alumno indicando que los clientes se quejan del precio tan alto"
                        >
                          <Megaphone className="w-3.5 h-3.5 text-amber-400 group-hover/btn:scale-110 transition-transform shrink-0" />
                          <span>Avisar de precio excesivo</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-8">
              {/* SECTION 1: SUMINISTRO OFICIAL DE MATERIAS PRIMAS */}
              {officialAnnouncements.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-400" />
                      <span>Suministro oficial de materias primas ({officialAnnouncements.length})</span>
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {officialAnnouncements.map(renderCard)}
                  </div>
                </div>
              )}

              {/* SECTION 2: EL DES-TORNILLO (DESPUÉS DE SUMINISTRO OFICIAL) */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 p-4 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl">
                      <Store className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span>El Des-Tornillo</span>
                        <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">Nivel 3</span>
                      </h3>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Anuncios de productos finales publicados por alumnos de Nivel 3.
                      </p>
                    </div>
                  </div>

                  {(isTeacher || studentLevel >= 3) && (
                    <button
                      onClick={handleOpenCreateAnnModal}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-extrabold text-xs shadow-lg transition flex items-center gap-2"
                    >
                      <Store className="w-4 h-4" />
                      <span>Publicar en El Des-Tornillo</span>
                    </button>
                  )}
                </div>

                {/* Student Active Alert Warning Banner in El Des-Tornillo */}
                {studentLevel >= 3 && !isTeacher && desTornilloAnnouncements.some(a => a.sellerId === currentUser.id && a.priceAlert?.active) && (
                  <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-4 flex items-start gap-3 text-amber-200 shadow-lg animate-pulse-slow">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <span className="font-bold text-amber-300 text-sm">Avisos de demanda comercial activos en El Des-Tornillo</span>
                      <p className="text-slate-300 leading-relaxed">
                        Los clientes y compradores del mercado han reportado que el precio fijado en tus productos es excesivo y no pueden asumirlo. Revisa y reduce tus publicaciones de precio para reactivar la demanda y no bloquear tus ventas.
                      </p>
                    </div>
                  </div>
                )}

                {desTornilloAnnouncements.length === 0 ? (
                  <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 text-center space-y-2">
                    <Wrench className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">No hay publicaciones en la sección El Des-Tornillo en este momento.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {desTornilloAnnouncements.map(renderCard)}
                  </div>
                )}
              </div>

              {/* SECTION 3: MERCADO SECUNDARIO Y PRODUCTOS ENTRE ALUMNOS */}
              {studentAnnouncements.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-indigo-400" />
                      <span>Mercado secundario entre alumnos ({studentAnnouncements.length})</span>
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {studentAnnouncements.map(renderCard)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        </div>
        )}
      </div>
      )}

      {/* 2. TAB: MENSAJERÍA Y NEGOCIACIÓN DIRECTA */}
      {activeMainTab === 'mensajeria' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-400" />
                Mensajería Directa y Canal de Negociación Comercial
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Comunícate en tiempo real con las empresas y proveedores habilitados para comerciar con tu nivel.
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-xl self-start">
              Tu Rol: {isTeacher ? 'Profesor (Evaluador)' : `Nivel ${studentLevel}`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[480px]">
            {/* Left: Trading Partners List */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Empresas & Socios Disponibles ({tradingPartners.length})</span>
              </h3>

              {tradingPartners.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No hay otros usuarios habilitados según las reglas del mercado.
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[400px] pr-1">
                  {tradingPartners.map((p) => {
                    const isSelected = selectedPartnerId === p.id;
                    const unread = Number(p.unreadCount) || 0;
                    return (
                      <button
                        key={p.id}
                        id={`partner-btn-${p.id}`}
                        onClick={() => {
                          setSelectedPartnerId(p.id);
                          if (p.unreadCount && p.unreadCount > 0) {
                            setTradingPartners(prev =>
                              prev.map(partner => partner.id === p.id ? { ...partner, unreadCount: 0 } : partner)
                            );
                          }
                          fetchChatMessages(p.id, true);
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 relative ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-xs truncate">{p.name}</span>
                            {unread > 0 && (
                              <span
                                id={`unread-badge-${p.id}`}
                                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-sm flex-shrink-0 animate-pulse"
                              >
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-800 text-slate-400 border border-slate-700 whitespace-nowrap flex-shrink-0">
                            {p.levelName}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <div className="flex items-center gap-2">
                            {p.canSellToMe && <span className="text-emerald-400">✓ Vendedor</span>}
                            {p.canBuyFromMe && <span className="text-indigo-400">✓ Comprador</span>}
                          </div>
                          {p.lastMessageTimestamp && (
                            <span className="text-[9px] text-slate-500 font-mono">
                              {new Date(p.lastMessageTimestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit' }) === new Date().toLocaleDateString([], { day: '2-digit', month: '2-digit' })
                                ? new Date(p.lastMessageTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : new Date(p.lastMessageTimestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Chat Window */}
            <div className="md:col-span-2 bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
              {selectedPartnerId ? (
                <>
                  {/* Chat Messages */}
                  <div ref={chatContainerRef} className="flex-1 overflow-y-auto max-h-[380px] space-y-3 pr-1">
                    {loadingChat ? (
                      <div className="text-center py-12 text-xs text-slate-500 animate-pulse">
                        Cargando conversación...
                      </div>
                    ) : chatMessages.length === 0 ? (
                      <div className="text-center py-12 text-xs text-slate-500 space-y-2">
                        <MessageSquare className="w-8 h-8 text-slate-700 mx-auto" />
                        <p>No hay mensajes en esta conversación aún.</p>
                        <p className="text-[11px] text-slate-600">Envía un mensaje para acordar cantidades, precios o condiciones antes de solicitar la orden.</p>
                      </div>
                    ) : (
                      <>
                        {chatMessages.map((msg) => {
                        const isMe = msg.senderId === currentUser.id;
                        const isInvoiceMsg = msg.type === 'invoice' || Boolean(msg.invoiceData);
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                          >
                            <div className="text-[10px] text-slate-400 mb-1 px-1">
                              {msg.senderName} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>

                            {isInvoiceMsg && msg.invoiceData ? (
                              <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 max-w-sm sm:max-w-md space-y-3 shadow-xl">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                  <div className="flex items-center gap-2">
                                    <Receipt className="w-4 h-4 text-amber-400" />
                                    <span className="font-mono font-bold text-xs text-amber-300">
                                      FACTURA {msg.invoiceData.invoiceNumber}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    FACTURADO
                                  </span>
                                </div>

                                <div className="text-xs space-y-1">
                                  <div className="flex justify-between text-slate-400 text-[11px]">
                                    <span>Emisor:</span>
                                    <span className="font-semibold text-white">{msg.invoiceData.sellerName}</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400 text-[11px]">
                                    <span>Receptor:</span>
                                    <span className="font-semibold text-white">{msg.invoiceData.buyerName}</span>
                                  </div>
                                </div>

                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs space-y-1">
                                  <p className="font-semibold text-amber-200 text-[11px] border-b border-slate-800 pb-1">
                                    {msg.invoiceData.concept || 'Factura comercial'}
                                  </p>
                                  {msg.invoiceData.items && msg.invoiceData.items.map((it, idx) => (
                                    <div key={idx} className="flex justify-between text-[11px] text-slate-300 pt-0.5">
                                      <span>{it.quantity}x {it.title}</span>
                                      <span className="font-mono">{formatNumber(it.subtotal)} €</span>
                                    </div>
                                  ))}
                                </div>

                                <div className="pt-1 border-t border-slate-800 text-xs space-y-1">
                                  {Boolean(msg.invoiceData.discountAmount > 0 || msg.invoiceData.transportCost > 0 || msg.invoiceData.insuranceFee > 0) && (
                                    <div className="flex justify-between text-slate-400 text-[11px]">
                                      <span>Subtotal conceptos:</span>
                                      <span className="font-mono">{formatNumber(msg.invoiceData.itemsSubtotal || (msg.invoiceData.items ? msg.invoiceData.items.reduce((s: number, i: any) => s + (i.subtotal || 0), 0) : msg.invoiceData.taxableBase))} €</span>
                                    </div>
                                  )}
                                  {Boolean(msg.invoiceData.discountAmount > 0) && (
                                    <div className="flex justify-between text-emerald-400 text-[11px] font-medium">
                                      <span>Descuento comercial:</span>
                                      <span className="font-mono">-{formatNumber(msg.invoiceData.discountAmount)} €</span>
                                    </div>
                                  )}
                                  {Boolean(msg.invoiceData.transportCost > 0) && (
                                    <div className="flex justify-between text-slate-300 text-[11px]">
                                      <span>Gastos de transporte:</span>
                                      <span className="font-mono">+{formatNumber(msg.invoiceData.transportCost)} €</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-slate-300 font-semibold text-[11px] pt-0.5 border-t border-slate-800/80">
                                    <span>Base imponible:</span>
                                    <span className="font-mono">{formatNumber(msg.invoiceData.taxableBase)} €</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400 text-[11px]">
                                    <span>IVA (21%):</span>
                                    <span className="font-mono">{formatNumber(msg.invoiceData.vatAmount)} €</span>
                                  </div>
                                  {Boolean(msg.invoiceData.insuranceFee > 0) && (
                                    <div className="flex justify-between text-slate-300 text-[11px]">
                                      <span>Seguro (no sujeto a IVA):</span>
                                      <span className="font-mono">+{formatNumber(msg.invoiceData.insuranceFee)} €</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-xs font-black text-amber-400 pt-1 border-t border-slate-800">
                                    <span>TOTAL FACTURA:</span>
                                    <span className="font-mono text-sm">{formatNumber(msg.invoiceData.totalAmount)} €</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                  <button
                                    type="button"
                                    onClick={() => handleViewInvoiceFromMessage(msg.invoiceData)}
                                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    <span>Ver documento completo</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const dummy = handleViewInvoiceFromMessage(msg.invoiceData);
                                      if (dummy) {
                                        openPrintableInvoiceWindow(dummy);
                                      }
                                    }}
                                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                    title="Imprimir o guardar en PDF"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>Imprimir / PDF</span>
                                  </button>
                                </div>
                              </div>
                            ) : (msg.type === 'promissory_note' && msg.promissoryNoteData) ? (
                              <div className="p-4 rounded-2xl max-w-lg bg-gradient-to-br from-slate-900 via-emerald-950/40 to-slate-900 border-2 border-emerald-500/40 text-slate-200 shadow-xl space-y-3 relative overflow-hidden">
                                <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                                      <FileSignature className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <div>
                                      <span className="font-extrabold text-xs text-emerald-300 uppercase tracking-wider block">Pagaré cambiario oficial</span>
                                      <span className="text-[10px] text-slate-400">Ley 19/1985 &bull; Efecto ejecutivo</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                      {msg.promissoryNoteData.promissoryNoteNumber}
                                    </span>
                                  </div>
                                </div>

                                <div className="bg-slate-950/80 rounded-xl p-3 border border-emerald-500/20 space-y-2 text-xs">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Beneficiario / tomador:</span>
                                      <span className="font-bold text-white text-xs">{msg.promissoryNoteData.beneficiaryName}</span>
                                      <span className="text-[10px] text-slate-400 block">NIF: {msg.promissoryNoteData.beneficiaryNifCif}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Vencimiento:</span>
                                      <span className="font-mono font-bold text-emerald-400 text-xs bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                                        {new Date(msg.promissoryNoteData.dueDate).toLocaleDateString('es-ES')}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="pt-1 border-t border-slate-800">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Importe en letra:</span>
                                    <div className="font-mono text-[11px] font-bold text-emerald-200 italic bg-emerald-950/40 p-1.5 rounded border border-emerald-500/20">
                                      &laquo; {msg.promissoryNoteData.amountInWords} &raquo;
                                    </div>
                                  </div>

                                  <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                                    <div>
                                      <span className="text-[10px] text-slate-400 block">Cláusula:</span>
                                      <span className="text-[11px] font-bold text-amber-300">
                                        {msg.promissoryNoteData.orderType === 'no_a_la_orden' ? 'NO A LA ORDEN' : 'A LA ORDEN'}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[10px] text-slate-400 block">Importe en cifras:</span>
                                      <span className="text-base font-black font-mono text-emerald-400">
                                        {formatNumber(msg.promissoryNoteData.amount)} €
                                      </span>
                                    </div>
                                  </div>

                                  <div className="pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between">
                                    <span>Banco: {msg.promissoryNoteData.bankName}</span>
                                    <span className="font-mono">IBAN: {msg.promissoryNoteData.bankIban.slice(0, 8)}...{msg.promissoryNoteData.bankIban.slice(-4)}</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                                  <span>Librador: <strong className="text-slate-200">{msg.promissoryNoteData.issuerName}</strong></span>
                                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Firma digital validada
                                  </span>
                                </div>

                                {/* Payment Status Badge & Direct Bank Collection / Discount / Collection Management Action */}
                                <div className="pt-1 border-t border-slate-800">
                                  {msg.promissoryNoteData.status === 'pagado' ? (
                                    <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-xl p-2 text-center text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5 shadow-md">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                      <span>COBRADO Y LIQUIDADO EN BANCO</span>
                                    </div>
                                  ) : msg.promissoryNoteData.status === 'descontado' ? (
                                    <div className="space-y-1.5 bg-gradient-to-br from-cyan-950/70 to-slate-900 border border-cyan-500/50 rounded-xl p-2.5 shadow-md">
                                      <div className="text-center text-xs font-black text-cyan-300 flex items-center justify-center gap-1.5">
                                        <Landmark className="w-4 h-4 text-cyan-400 shrink-0" />
                                        <span>DESCONTADO EN BANCO (COBRO ANTICIPADO)</span>
                                      </div>
                                      <div className="text-[10px] text-cyan-200/90 text-center leading-relaxed font-medium">
                                        Líquido percibido por el acreedor: <span className="text-white font-mono font-bold">+{formatNumber(msg.promissoryNoteData.discountNetReceived || (msg.promissoryNoteData.amount - (msg.promissoryNoteData.discountInterest || 0) - (msg.promissoryNoteData.discountCommission || 0)))} €</span>
                                        <div className="text-[9px] text-cyan-400/90 mt-0.5">
                                          (Nominal: {formatNumber(msg.promissoryNoteData.amount)} € &bull; Dto. 6%: -{formatNumber(msg.promissoryNoteData.discountInterest || 0)} € &bull; Com. 0,5%: -{formatNumber(msg.promissoryNoteData.discountCommission || 0)} €)
                                        </div>
                                        <div className="text-[9px] text-slate-400 mt-1 italic">
                                          Liquidación bancaria automática con el librador al vencimiento ({new Date(msg.promissoryNoteData.dueDate).toLocaleDateString('es-ES')}).
                                        </div>
                                      </div>
                                    </div>
                                  ) : msg.promissoryNoteData.status === 'gestion_cobro' ? (
                                    <div className="space-y-1.5 bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/50 rounded-xl p-2.5 shadow-md">
                                      <div className="text-center text-xs font-black text-indigo-300 flex items-center justify-center gap-1.5">
                                        <Landmark className="w-4 h-4 text-indigo-400 shrink-0" />
                                        <span>EN GESTIÓN DE COBRO BANCARIO</span>
                                      </div>
                                      <div className="text-[10px] text-indigo-200/90 text-center leading-relaxed font-medium">
                                        Entregado al banco para tramitación de cobro automático.
                                        <div className="text-[9px] text-indigo-300/90 mt-0.5">
                                          (Comisión de gestión abonada: {formatNumber(msg.promissoryNoteData.collectionCommission || Math.max(20, msg.promissoryNoteData.amount * 0.005))} €)
                                        </div>
                                        <div className="text-[9px] text-slate-400 mt-1 italic">
                                          Al vencimiento ({new Date(msg.promissoryNoteData.dueDate).toLocaleDateString('es-ES')}), el banco ingresará automáticamente el 100% del nominal (+{formatNumber(msg.promissoryNoteData.amount)} €) en tu cuenta.
                                        </div>
                                      </div>
                                    </div>
                                  ) : msg.promissoryNoteData.status === 'impagado' ? (
                                    <div className="space-y-1.5 bg-rose-950/80 border border-rose-500/60 rounded-xl p-2.5 shadow-md text-left">
                                      <div className="text-center text-xs font-bold text-rose-300 flex items-center justify-center gap-1.5">
                                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                                        <span>IMPAGADO (DEVUELTO POR FALTA DE FONDOS)</span>
                                      </div>
                                      {(msg.promissoryNoteData.isDiscounted || msg.promissoryNoteData.unpaidFeeRate || msg.promissoryNoteData.unpaidNominalReimbursed) ? (
                                        <div className="text-[10px] text-rose-200 bg-rose-900/40 border border-rose-500/30 rounded-lg p-2 space-y-1">
                                          <div className="font-bold text-rose-300 text-center">
                                            Efecto descontado devuelto: Reintegro de anticipo bancario
                                          </div>
                                          <div className="flex justify-between text-[9.5px]">
                                            <span className="text-slate-300">• Reintegro del nominal adelantado:</span>
                                            <span className="font-mono font-bold text-rose-300">-{formatNumber(msg.promissoryNoteData.amount)} €</span>
                                          </div>
                                          <div className="flex justify-between text-[9.5px]">
                                            <span className="text-slate-300">• Comisión de devolución bancaria (1%):</span>
                                            <span className="font-mono font-bold text-rose-300">-{formatNumber(msg.promissoryNoteData.unpaidFeeAmount || msg.promissoryNoteData.amount * 0.01)} €</span>
                                          </div>
                                          <div className="border-t border-rose-500/30 pt-0.5 flex justify-between font-bold text-[10px]">
                                            <span className="text-rose-200">Total cargado al cedente:</span>
                                            <span className="font-mono text-rose-200">-{formatNumber(msg.promissoryNoteData.unpaidTotalDebited || ((msg.promissoryNoteData.amount) + (msg.promissoryNoteData.unpaidFeeAmount || msg.promissoryNoteData.amount * 0.01)))} €</span>
                                          </div>
                                        </div>
                                      ) : msg.promissoryNoteData.isCollectionManagement ? (
                                        <div className="text-[10px] text-rose-200 text-center font-medium">
                                          Pagaré devuelto en gestión de cobro. Comisión bancaria fija de devolución aplicada: -40,00 €.
                                        </div>
                                      ) : (
                                        <div className="text-[10px] text-center text-rose-400/90 font-medium">
                                          Efecto devuelto por impago bancario del deudor.
                                        </div>
                                      )}
                                      <div className="text-[9.5px] text-center text-slate-400 italic">
                                        Efecto ejecutable en la vía judicial (Portal Judicial).
                                      </div>
                                    </div>
                                  ) : (() => {
                                    const now = new Date();
                                    const localY = now.getFullYear();
                                    const localM = String(now.getMonth() + 1).padStart(2, '0');
                                    const localD = String(now.getDate()).padStart(2, '0');
                                    const todayLocalStr = `${localY}-${localM}-${localD}`;
                                    const todayUtcStr = now.toISOString().slice(0, 10);
                                    const dueStr = (msg.promissoryNoteData.dueDate || '').slice(0, 10);
                                    const isDueOrPast = todayLocalStr >= dueStr || todayUtcStr >= dueStr || now.getTime() >= new Date(msg.promissoryNoteData.dueDate).getTime() || isTeacher;
                                    const isBeneficiary = currentUser.id === msg.promissoryNoteData.beneficiaryId || 
                                                          currentUser.name?.toLowerCase() === msg.promissoryNoteData.beneficiaryName?.toLowerCase() ||
                                                          currentUser.username === 'pupdaniel' ||
                                                          isTeacher;
                                    const isIssuer = currentUser.id === msg.promissoryNoteData.issuerId ||
                                                     currentUser.name?.toLowerCase() === msg.promissoryNoteData.issuerName?.toLowerCase();

                                    // Discount calculation preview
                                    const diffTime = new Date(msg.promissoryNoteData.dueDate).getTime() - now.getTime();
                                    const daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                                    const discountInterest = Number(((msg.promissoryNoteData.amount * 0.06 * daysRemaining) / 360).toFixed(2));
                                    const discountCommission = Number((msg.promissoryNoteData.amount * 0.005).toFixed(2));
                                    const netDiscountAmount = Number((msg.promissoryNoteData.amount - discountInterest - discountCommission).toFixed(2));
                                    const collectionCommission = Math.max(20, Number((msg.promissoryNoteData.amount * 0.005).toFixed(2)));

                                    return (
                                      <div className="space-y-2">
                                        <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-2 text-center text-[11px] text-amber-300 font-medium flex items-center justify-center gap-1.5">
                                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                          <span>
                                            {isDueOrPast
                                              ? `Vencido el ${new Date(msg.promissoryNoteData.dueDate).toLocaleDateString('es-ES')} (Listo para cobro ordinario)`
                                              : `Vence el ${new Date(msg.promissoryNoteData.dueDate).toLocaleDateString('es-ES')} (${daysRemaining} días restantes)`}
                                          </span>
                                        </div>

                                        {/* Beneficiary Actions: Cobrar al Vencimiento / Descontar por Adelantado / Gestión de Cobro */}
                                        {isBeneficiary && (
                                          isDueOrPast ? (
                                            <button
                                              type="button"
                                              disabled={isSubmittingPromissory}
                                              onClick={() => handleCollectPromissoryNote(msg.id, msg.promissoryNoteData!)}
                                              className="w-full py-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                            >
                                              <CreditCard className="w-4 h-4" />
                                              <span>Cobrar pagaré al vencimiento ({formatNumber(msg.promissoryNoteData.amount)} €)</span>
                                            </button>
                                          ) : (
                                            <div className="space-y-2">
                                              {/* Opción 1: Descuento Comercial */}
                                              <div className="space-y-1 bg-slate-950/50 border border-teal-500/30 rounded-xl p-2">
                                                <button
                                                  type="button"
                                                  disabled={isSubmittingDiscount}
                                                  onClick={() => setNoteForDiscountModal({ messageId: msg.id, note: msg.promissoryNoteData! })}
                                                  className="w-full py-2 bg-gradient-to-r from-teal-600 via-emerald-600 to-emerald-500 hover:from-teal-500 hover:to-emerald-400 text-slate-950 font-black text-xs rounded-lg shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transform active:scale-98"
                                                >
                                                  <Landmark className="w-4 h-4 text-slate-950 shrink-0" />
                                                  <span>Descontar pagaré (cobro anticipado +{formatNumber(netDiscountAmount)} €)</span>
                                                </button>
                                                <div className="text-[9.5px] text-center text-slate-400 leading-tight">
                                                  Anticipo bancario con interés 6% anual (-{formatNumber(discountInterest)} €) y com. 0,5% (-{formatNumber(discountCommission)} €).
                                                </div>
                                              </div>

                                              {/* Opción 2: Gestión de Cobro */}
                                              <div className="space-y-1 bg-slate-950/50 border border-indigo-500/30 rounded-xl p-2">
                                                <button
                                                  type="button"
                                                  disabled={isSubmittingCollection}
                                                  onClick={() => setNoteForCollectionModal({ messageId: msg.id, note: msg.promissoryNoteData! })}
                                                  className="w-full py-2 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-black text-xs rounded-lg shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transform active:scale-98"
                                                >
                                                  <Landmark className="w-4 h-4 text-indigo-200 shrink-0" />
                                                  <span>Gestión de cobro (cobro automático al vencer)</span>
                                                </button>
                                                <div className="text-[9.5px] text-center text-indigo-200/80 leading-tight">
                                                  El banco ingresará automáticamente el 100% del nominal al vencer. Comisión servicio: <strong>{formatNumber(collectionCommission)} €</strong> (0,5%, mín. 20 €).
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        )}

                                        {isIssuer && (
                                          <div className="text-[10px] text-center text-slate-400 italic">
                                            {isDueOrPast
                                              ? 'Pagaré vencido. El banco cargará el importe automáticamente cuando el tenedor lo liquide.'
                                              : `El banco cargará ${formatNumber(msg.promissoryNoteData.amount)} € en tu cuenta a la fecha de vencimiento (${new Date(msg.promissoryNoteData.dueDate).toLocaleDateString('es-ES')}).`}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPromissoryNoteForView(msg.promissoryNoteData)}
                                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>Ver pagaré oficial</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPrintablePromissoryNoteWindow(msg.promissoryNoteData)}
                                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                    title="Imprimir o descargar en PDF oficial"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>Imprimir / PDF</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className={`p-3 rounded-2xl max-w-md text-xs leading-relaxed shadow-md ${
                                  isMe
                                    ? 'bg-indigo-600 text-white rounded-br-none'
                                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                                }`}
                              >
                                {msg.content}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </>
                    )}
                  </div>

                  {/* Input Form */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-3 border-t border-slate-800">
                    <input
                      type="text"
                      placeholder="Escribe un mensaje o propuesta comercial..."
                      value={chatInputText}
                      onChange={(e) => setChatInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={handleOpenManualInvoiceModal}
                        className="px-3 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl font-bold text-xs shadow transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                        title="Emitir y enviar una factura comercial a este chat"
                      >
                        <Receipt className="w-3.5 h-3.5 text-amber-400" />
                        <span>Enviar factura</span>
                      </button>

                      <button
                        type="button"
                        id="btn-firmar-pagare-chat"
                        onClick={handleOpenPromissoryNoteModal}
                        className="px-3 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl font-bold text-xs shadow transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                        title="Firmar y emitir un pagaré mercantil con validez legal cambiaria en favor del vendedor"
                      >
                        <FileSignature className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Firmar pagaré</span>
                      </button>

                      <button
                        onClick={handleSendMessage}
                        disabled={!chatInputText.trim()}
                        className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-20 text-xs text-slate-500">
                  Selecciona una empresa de la lista para iniciar la conversación.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB: FACTURACIÓN COMERCIAL */}
      {activeMainTab === 'facturacion' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-purple-400" />
                {studentLevel === 1
                  ? 'Facturas compras materias primas y servicios transporte'
                  : 'Facturas servicios de transporte'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Consulta e imprime los documentos tributarios y facturas emitidas y recibidas en tus operaciones de mercado.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs text-slate-400 uppercase bg-slate-950 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Nº factura</th>
                  <th className="py-3 px-4 font-semibold">Fecha emisión</th>
                  <th className="py-3 px-4 font-semibold">Vendedor / emisor</th>
                  <th className="py-3 px-4 font-semibold">Comprador / receptor</th>
                  <th className="py-3 px-4 font-semibold">Base imponible</th>
                  <th className="py-3 px-4 font-semibold">IVA (21%)</th>
                  <th className="py-3 px-4 font-semibold">Total facturado</th>
                  <th className="py-3 px-4 font-semibold text-right">Documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders
                  .filter(isOfficialCommercialInvoice)
                  .map((rawOrd) => {
                    const ord = normalizeInvoiceOrder(rawOrd);
                    const invNumber = ord.invoiceNumber || `FACT-2026-${ord.id.slice(-4)}`;
                    const invDate = ord.invoicedAt ? new Date(ord.invoicedAt).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES');

                    return (
                      <tr key={ord.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-xs font-bold text-purple-300">
                          {invNumber}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-400">
                          {invDate}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {ord.sellerName || 'Profesor'}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-300">
                          {ord.studentName}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                          <div>{formatNumber(ord.basePrice)} €</div>
                          {(ord.discountAmount > 0 || ord.transportCost > 0 || ord.insuranceFee > 0) && (
                            <div className="text-[10px] text-slate-400 mt-0.5 space-x-1">
                              {ord.discountAmount > 0 && <span className="text-emerald-400">Desc: -{formatNumber(ord.discountAmount)}€</span>}
                              {ord.transportCost > 0 && <span className="text-amber-300">Portes: +{formatNumber(ord.transportCost)}€</span>}
                              {ord.insuranceFee > 0 && <span className="text-indigo-300">Seguro: +{formatNumber(ord.insuranceFee)}€</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-indigo-300">
                          {formatNumber(ord.ivaAmount)} €
                        </td>
                        <td className="py-3.5 px-4 font-mono text-sm font-bold text-emerald-400">
                          {formatNumber(ord.totalAmount)} €
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setSelectedInvoiceOrder(ord)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 font-bold text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Imprimir / Ver</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Commercial Formal Invoice Modal */}
      {selectedInvoiceOrder && createPortal(
        <div className="printable-modal-backdrop fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto print:static print:p-0 print:bg-white print:block">
          <div className="printable-document-modal bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-8 space-y-6 shadow-2xl relative text-slate-200 print:bg-white print:text-black print:p-0 print:shadow-none print:border-none print:w-full">
            {/* Header / Actions */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 no-print print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-6 h-6 text-purple-400" />
                <h3 className="text-xl font-bold text-white">Factura comercial oficial</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadRawInvoicePDF}
                  disabled={isDownloadingRawInvoice}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Descargar factura en PDF"
                >
                  {isDownloadingRawInvoice ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{isDownloadingRawInvoice ? 'Generando...' : 'Descargar PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceOrder(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Invoice Body */}
            <div ref={rawInvoicePrintRef} className="bg-white text-slate-900 p-6 rounded-xl space-y-6 shadow-inner font-sans print:p-0 print:shadow-none">
              {/* Header Company & Invoice Title */}
              <div className="flex justify-between items-start border-b pb-4 border-slate-200">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">FACTURA COMERCIAL</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Simulador empresarial — Operaciones de cadena de suministro</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-purple-700">
                    {selectedInvoiceOrder.invoiceNumber || `FACT-2026-${selectedInvoiceOrder.id.slice(-4)}`}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Fecha: {selectedInvoiceOrder.invoicedAt ? new Date(selectedInvoiceOrder.invoicedAt).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES')}
                  </div>
                  <div className="text-xs text-slate-500">
                    Ref. Pedido: {selectedInvoiceOrder.id}
                  </div>
                </div>
              </div>

              {/* Seller & Buyer Grid */}
              <div className="grid grid-cols-2 gap-6 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div>
                  <span className="font-bold uppercase text-[10px] text-slate-400 block mb-1">EMISOR (VENDEDOR)</span>
                  <div className="font-bold text-slate-800 text-sm">{selectedInvoiceOrder.sellerName || 'Proveedor Oficial — Profesor'}</div>
                  <div className="text-slate-600 mt-0.5">Nivel: {selectedInvoiceOrder.sellerLevel || 'Proveedor Oficial'}</div>
                  <div className="text-slate-500 mt-0.5">ID: {selectedInvoiceOrder.sellerId || 'profesor-1'}</div>
                </div>
                <div>
                  <span className="font-bold uppercase text-[10px] text-slate-400 block mb-1">RECEPTOR (COMPRADOR)</span>
                  <div className="font-bold text-slate-800 text-sm">{selectedInvoiceOrder.studentName}</div>
                  <div className="text-slate-600 mt-0.5">Nivel: Nivel {selectedInvoiceOrder.buyerLevel || 1}</div>
                  <div className="text-slate-500 mt-0.5">ID: {selectedInvoiceOrder.studentId}</div>
                  <div className="text-slate-500 mt-0.5">Entrega: {selectedInvoiceOrder.deliveryAddress || 'Almacén Central'}</div>
                </div>
              </div>

              {/* Line Items Table & Breakdown Totals */}
              {(() => {
                const isTransport = isTransportInvoiceOrder(selectedInvoiceOrder);
                const conceptText = isTransport ? getTransportConcept(selectedInvoiceOrder) : '';
                const itemsList = selectedInvoiceOrder.items && selectedInvoiceOrder.items.length > 0
                  ? selectedInvoiceOrder.items
                  : [{
                      materialTitle: selectedInvoiceOrder.materialTitle || 'Materiales',
                      quantity: selectedInvoiceOrder.quantity || 1,
                      totalKg: selectedInvoiceOrder.totalKg || 0,
                      unitPrice: selectedInvoiceOrder.unitPrice || (selectedInvoiceOrder.basePrice ? selectedInvoiceOrder.basePrice / (selectedInvoiceOrder.quantity || 1) : 0),
                      totalCost: selectedInvoiceOrder.subtotalAmount || selectedInvoiceOrder.basePrice || ((selectedInvoiceOrder.unitPrice || 0) * (selectedInvoiceOrder.quantity || 1))
                    }];

                const subtotal = selectedInvoiceOrder.subtotalAmount || itemsList.reduce((sum, i) => {
                  const qty = i.quantity || 1;
                  const baseP = Number(i.basePrice) || Number(i.subtotal) || Number(i.totalCost) || 0;
                  const uP = Number(i.unitPrice) || (baseP > 0 ? baseP / qty : 0);
                  return sum + (Number(i.totalCost) || Number(i.subtotal) || (baseP > 0 ? baseP : (qty * uP)));
                }, 0);

                const disc = Number(selectedInvoiceOrder.discountAmount) || (selectedInvoiceOrder.discountPercentage ? (subtotal * Number(selectedInvoiceOrder.discountPercentage) / 100) : 0);
                const trans = Number(selectedInvoiceOrder.transportCost) || 0;
                const ins = Number(selectedInvoiceOrder.insuranceFee) || Number(selectedInvoiceOrder.insuranceCost) || 0;
                const baseImp = selectedInvoiceOrder.taxableBase !== undefined ? Number(selectedInvoiceOrder.taxableBase) : Math.max(0, subtotal - disc + trans);
                const iva = selectedInvoiceOrder.vatAmount !== undefined ? Number(selectedInvoiceOrder.vatAmount) : (selectedInvoiceOrder.ivaAmount !== undefined ? Number(selectedInvoiceOrder.ivaAmount) : Math.round(baseImp * 0.21 * 100) / 100);
                const tot = selectedInvoiceOrder.totalAmount !== undefined && Number(selectedInvoiceOrder.totalAmount) > 0 ? Number(selectedInvoiceOrder.totalAmount) : Math.round((baseImp + iva + ins) * 100) / 100;

                return (
                  <>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-300 text-slate-600 uppercase font-bold text-[10px]">
                          {isTransport ? (
                            <>
                              <th className="py-2 px-2">Concepto</th>
                              <th className="py-2 px-2 text-right">Cantidad</th>
                              <th className="py-2 px-2 text-right">Total neto</th>
                            </>
                          ) : (
                            <>
                              <th className="py-2 px-2">Concepto / material</th>
                              <th className="py-2 px-2 text-right">Cantidad</th>
                              <th className="py-2 px-2 text-right">Peso (kg)</th>
                              <th className="py-2 px-2 text-right">Precio unid.</th>
                              <th className="py-2 px-2 text-right">Total neto</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {isTransport ? (
                          <tr>
                            <td className="py-2 px-2 font-medium">{conceptText}</td>
                            <td className="py-2 px-2 text-right">1 u.</td>
                            <td className="py-2 px-2 text-right font-bold">{formatNumber(subtotal)} €</td>
                          </tr>
                        ) : (
                          itemsList.map((it, idx) => {
                            const qty = it.quantity || 1;
                            const baseP = Number(it.basePrice) || Number(it.subtotal) || Number(it.totalCost) || 0;
                            const uPrice = Number(it.unitPrice) || (baseP > 0 ? baseP / qty : 0);
                            const lineTotal = Number(it.totalCost) || Number(it.subtotal) || (baseP > 0 ? baseP : (qty * uPrice));

                            const isScrewdriverItem = (it.materialType === 'producto_final') || (it.materialTitle && it.materialTitle.toLowerCase().includes('destornillador')) || ((it as any).title && (it as any).title.toLowerCase().includes('destornillador'));

                            return (
                              <tr key={idx}>
                                <td className="py-2 px-2 font-medium">{it.materialTitle || (it as any).title || selectedInvoiceOrder.materialTitle || 'Concepto'}</td>
                                <td className="py-2 px-2 text-right">{qty} u.</td>
                                <td className="py-2 px-2 text-right">{isScrewdriverItem ? '-' : `${formatNumber(it.totalKg)} kg`}</td>
                                <td className="py-2 px-2 text-right">{formatNumber(uPrice)} €</td>
                                <td className="py-2 px-2 text-right font-bold">{formatNumber(lineTotal)} €</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>

                    <div className="flex justify-end pt-2 border-t border-slate-200">
                      <div className="w-72 space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>{isTransport ? 'Subtotal transporte:' : 'Subtotal materiales / productos:'}</span>
                          <span className="font-mono">{formatNumber(subtotal)} €</span>
                        </div>
                        {disc > 0 && (
                          <div className="flex justify-between text-emerald-600 font-medium">
                            <span>Descuento comercial:</span>
                            <span className="font-mono">-{formatNumber(disc)} €</span>
                          </div>
                        )}
                        {!isTransport && (trans > 0 || selectedInvoiceOrder.needsTransport) && (
                          <div className="flex justify-between text-slate-600">
                            <span>Gastos de transporte / portes:</span>
                            <span className="font-mono">+{formatNumber(trans)} €</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1">
                          <span>Base imponible (21% IVA):</span>
                          <span className="font-mono">{formatNumber(baseImp)} €</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Cuota IVA (21%):</span>
                          <span className="font-mono">{formatNumber(iva)} €</span>
                        </div>
                        {ins > 0 && (
                          <div className="flex justify-between text-slate-600">
                            <span>Seguro de mercancía (no sujeto a IVA):</span>
                            <span className="font-mono">+{formatNumber(ins)} €</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-900 font-bold text-sm pt-2 border-t border-slate-300">
                          <span>TOTAL FACTURA:</span>
                          <span className="font-mono text-purple-700">{formatNumber(tot)} €</span>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Teacher / Student Announcement Creation/Edit Modal */}
      {isAnnModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3 sticky top-0 bg-slate-900 z-10 pt-1">
              <div>
                <span className={`text-xs font-bold uppercase tracking-wider ${isTeacher ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {isTeacher ? 'Anuncio oficial — Profesor (pupdaniel)' : `Publicación de producto final — Alumno (Nivel ${studentLevel})`}
                </span>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  {editingAnnId 
                    ? 'Editar anuncio' 
                    : isTeacher 
                      ? 'Publicar anuncio de materia prima / producto' 
                      : 'Publicar producto final en mercado'}
                </h3>
              </div>
              <button
                onClick={() => setIsAnnModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {!isTeacher && studentLevel < 3 && (
              <div className="bg-indigo-500/10 border border-indigo-500/30 p-3.5 rounded-xl text-xs text-indigo-200 flex items-start gap-2.5 font-medium">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-indigo-300 font-bold mb-0.5">Normativa de venta para alumnos:</strong>
                  Los alumnos de Nivel 1 y 2 solo pueden vender <strong>producto final</strong> (no materia prima). Rellena los datos de tu oferta para publicarla en el mercado.
                </div>
              </div>
            )}

            {/* Level 3 Screwdriver Selector */}
            {!isTeacher && studentLevel === 3 && (() => {
              const currentStockInfo = getAvailableStockForProductType(annTitle);
              return (
                <div className="space-y-2.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <label className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
                    Selecciona el Producto a Vender (Exclusivo Nivel 3):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const title = 'Destornillador de punta plana';
                        setAnnTitle(title);
                        setAnnDescription('Destornilladores de punta plana de alta resistencia fabricados en fábrica N3 para El Des-Tornillo.');
                        const info = getAvailableStockForProductType(title);
                        setAnnStock(info.availableMax);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        annTitle.toLowerCase().includes('plana')
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-white">Destornillador punta plana</div>
                      <div className="text-[10px] text-slate-400 mt-1">Varilla de acero cromo-vanadio</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const title = 'Destornillador de punta estrella';
                        setAnnTitle(title);
                        setAnnDescription('Destornilladores de punta estrella (Phillips) de alta precisión fabricados en fábrica N3 para El Des-Tornillo.');
                        const info = getAvailableStockForProductType(title);
                        setAnnStock(info.availableMax);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        annTitle.toLowerCase().includes('estrella')
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-white">Destornillador punta estrella</div>
                      <div className="text-[10px] text-slate-400 mt-1">Varilla de acero cromo-vanadio - Phillips</div>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Real Stock Live Info Card for Students */}
            {!isTeacher && (() => {
              const stockInfo = getAvailableStockForProductType(annTitle);
              return (
                <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-200 font-semibold">
                      <PackageCheck className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Existencias reales en almacén ({annTitle || 'Producto'}):</span>
                    </div>
                    <span className="font-bold text-amber-300 font-mono text-sm">
                      {stockInfo.availableMax} u. libres
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    <div>Producido / Almacenado: <strong className="text-white">{stockInfo.totalProduced} u.</strong></div>
                    <div>En otros anuncios: <strong className="text-amber-400">{stockInfo.lockedOther} u.</strong></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnnStock(stockInfo.availableMax)}
                    className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs border border-amber-500/40 transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sincronizar anuncio con existencias reales ({stockInfo.availableMax} u.)</span>
                  </button>
                </div>
              );
            })()}

            {/* Preset Selection Buttons - Teacher ONLY */}
            {isTeacher && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Seleccionar materia prima a publicar:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['hierro', 'plastico', 'epoxi'] as const).map((presetKey) => {
                    const preset = PRODUCT_PRESETS[presetKey];
                    const isSelected = annPreset === presetKey;
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => handleSelectPreset(presetKey)}
                        className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold text-white">{preset.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{preset.presentation}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Title / Name Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">
                Nombre / título del {isTeacher ? 'anuncio' : 'producto final'}:
              </label>
              <input
                type="text"
                placeholder={isTeacher ? 'Ej: Fragmentos de hierro' : 'Ej: Destornillador de punta plana'}
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                readOnly={!isTeacher && studentLevel === 3}
                className={`w-full border rounded-xl px-3.5 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-500 placeholder-slate-600 ${
                  !isTeacher && studentLevel === 3 ? 'bg-slate-900 border-amber-500/40 text-amber-300' : 'bg-slate-950 border-slate-700'
                }`}
              />
            </div>

            {/* Presentation & Stock */}
            {!isTeacher ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                  <span>Stock / unidades puestas a la venta:</span>
                  <span className="text-amber-400 text-[10px] font-mono">
                    Máx. Real: {getAvailableStockForProductType(annTitle).availableMax} u.
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={getAvailableStockForProductType(annTitle).availableMax}
                  placeholder={`Máximo ${getAvailableStockForProductType(annTitle).availableMax} u.`}
                  value={String(annStock)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setAnnStock('');
                      return;
                    }
                    const num = Number(val);
                    const maxAvail = getAvailableStockForProductType(annTitle).availableMax;
                    if (num > maxAvail) {
                      setAnnStock(maxAvail);
                    } else {
                      setAnnStock(num);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-amber-500 placeholder-slate-600"
                />
                <span className="text-[10px] text-slate-400 block font-medium">
                  Las unidades a la venta se sincronizan con las existencias reales de tu almacén. Máximo disponible: <strong>{getAvailableStockForProductType(annTitle).availableMax} u.</strong>
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">
                    Presentación / formato:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Pallet, Caja de 50 u., Lote"
                    value={annPresentation}
                    onChange={(e) => setAnnPresentation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-amber-500 placeholder-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 block">
                    Stock / cantidad disponible:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 50 o ilimitado"
                    value={String(annStock)}
                    onChange={(e) => setAnnStock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-semibold focus:outline-none focus:border-amber-500 placeholder-slate-600"
                  />
                </div>
              </div>
            )}

            {/* Price & Duration Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  Precio base por unidad (€)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ej: 1"
                  value={annPrice}
                  onChange={(e) => setAnnPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-500 placeholder-slate-600"
                />
                {annPrice !== '' && Number(annPrice) > 0 && (
                  <span className="text-[10px] text-slate-400 block">+ 21% IVA ({formatNumber(Number(annPrice) * 1.21)} € total)</span>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  Duración del anuncio
                </label>
                <select
                  value={String(annDurationDays)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnnDurationDays(val === 'indefinido' ? 'indefinido' : Number(val));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="indefinido">Indefinido (activo)</option>
                  <option value="7">7 días</option>
                  <option value="15">15 días</option>
                  <option value="30">30 días</option>
                </select>
              </div>
            </div>

            {/* Description Details */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Descripción detallada de la oferta:</label>
              <textarea
                rows={3}
                placeholder="Describe las especificaciones técnicas, acabado o garantía del producto..."
                value={annDescription}
                onChange={(e) => setAnnDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500 placeholder-slate-600"
              />
            </div>

            <div className="flex gap-3 pt-2">
              {editingAnnId && (
                <button
                  type="button"
                  onClick={() => handleDeleteAnnouncement(editingAnnId)}
                  className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  title="Eliminar anuncio"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar anuncio</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsAnnModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAnnouncement}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{editingAnnId ? 'Guardar cambios' : 'Publicar anuncio'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teacher Rejection Modal */}
      {rejectingOrderId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              Rechazar solicitud de compra
            </h3>
            <p className="text-xs text-slate-400">
              Indica opcionalmente el motivo por el cual rechazas esta solicitud de materias primas para informar al alumno.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Motivo del rechazo (opcional):</label>
              <textarea
                rows={3}
                placeholder="Ej: No se reune la documentación de transporte o saldo insuficiente..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setRejectingOrderId(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectOrder}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs shadow-lg transition-colors"
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Level Restriction Modal */}
      {showLevelRestrictionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative text-center">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white">Comprobación de requisitos de suministro</h3>
            <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 text-left">
              <p className="text-sm font-medium text-slate-200 leading-relaxed">
                Tras realizar las comprobaciones pertinentes, usted no reúne los requisitos exigidos por la empresa suministradora para completar la compra. Lamentamos las molestias
              </p>
            </div>
            <button
              onClick={() => setShowLevelRestrictionModal(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-lg transition-colors"
            >
              Entendido / cerrar
            </button>
          </div>
        </div>
      )}

      {/* Single Order Modal */}
      {selectedAnn && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Solicitud de compra</span>
                <h3 className="text-xl font-bold text-white mt-0.5">{selectedAnn.title}</h3>
                <p className="text-xs text-slate-400">{selectedAnn.presentation}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-amber-300 border border-slate-700">
                    Vendedor: {selectedAnn.sellerName} {selectedAnn.sellerLevel && selectedAnn.sellerLevel !== 'official' ? `(Alumno Nivel ${selectedAnn.sellerLevel})` : '(Proveedor Oficial)'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-emerald-400 border border-slate-700">
                    Stock disponible: {selectedAnn.stock === undefined || selectedAnn.stock === null || selectedAnn.stock === 'ilimitado' ? 'Ilimitado' : `${selectedAnn.stock} u.`}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedAnn(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Cantidad ({isSelectedScrewdriver ? 'Unidades de destornilladores a solicitar' : 'Unidades / formatos a solicitar'}):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-white font-bold text-lg focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {isSelectedScrewdriver ? (
                      <span>Total: <strong className="text-amber-400 font-mono">{formatNumber(quantity)} unidades</strong></span>
                    ) : (
                      <span>Total: <strong className="text-amber-400 font-mono">{formatNumber(totalKg)} kg</strong></span>
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Opciones de entrega y logística:
                </label>

                <div className="grid grid-cols-1 gap-2">
                  <label
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      needsTransport
                        ? 'bg-amber-500/10 border-amber-500/50 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="transport"
                        checked={needsTransport}
                        onChange={() => setNeedsTransport(true)}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <div>
                        <div className="font-semibold text-xs text-white">Contratar transporte del vendedor</div>
                        <div className="text-[11px] text-slate-400">Envío directo a tu nave en San Fernando / Madrid</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-amber-400 text-xs">+{formatNumber(transportCost)} €</span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      !needsTransport
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="transport"
                        checked={!needsTransport}
                        onChange={() => setNeedsTransport(false)}
                        className="text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <div className="font-semibold text-xs text-white">Recoger con flota propia</div>
                        <div className="text-[11px] text-slate-400">Requiere camión tráiler y camionero contratado</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-emerald-400 text-xs">0.00 €</span>
                  </label>
                </div>

                {!needsTransport && !canPickupWithoutTransport && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2 mt-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Para recogida propia debes poseer un <strong>camión tráiler</strong> y un <strong>camionero</strong> contratado.
                    </span>
                  </div>
                )}
              </div>

              {studentWarehouses.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Inmueble / almacén de destino:</span>
                    {studentWarehouses.length > 1 && (
                      <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                        ⚠️ Selecciona el almacén de destino
                      </span>
                    )}
                  </label>
                  <select
                    value={selectedDestinationNaveId}
                    onChange={(e) => setSelectedDestinationNaveId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-medium"
                  >
                    {studentWarehouses.map((w: any) => {
                      const hasF = checkWarehouseHasForklift(w);
                      return (
                        <option key={w.id} value={w.id}>
                          {w.propertyTitle || w.title || 'Almacén'} ({w.location || w.direccion || 'Polígono industrial'}) — {hasF ? '🚜 [Carretilla OK]' : '⚠️ [Falta carretilla]'}
                        </option>
                      );
                    })}
                  </select>
                  {(() => {
                    const currentWh = studentWarehouses.find((w: any) => String(w.id) === String(selectedDestinationNaveId)) || studentWarehouses[0];
                    const hasF = checkWarehouseHasForklift(currentWh);
                    if (!hasF && currentWh) {
                      return (
                        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-medium flex items-center gap-1.5 mt-1.5">
                          <span>⚠️ Este almacén no tiene carretilla elevadora asignada. Asigna una desde la gestión de flotas / concesionario.</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              <div className="bg-slate-950 rounded-xl p-4 space-y-2 border border-slate-800/80 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Precio base ({quantity} u. x {formatNumber(selectedAnn.pricePerUnit)} €):</span>
                  <span className="text-white">{formatNumber(basePrice)} €</span>
                </div>
                {needsTransport && (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>Gasto de transporte ({orderChargedPallets} {orderChargedPallets === 1 ? 'palet' : 'palets'} × {orderDistanceKm} km × 0,38 €):</span>
                      <span className="text-amber-400 font-bold">{formatNumber(transportCost)} €</span>
                    </div>
                    <div className="text-[10px] text-slate-500 italic">
                      * Tarifa unificada de 0,38 €/palet/km ({orderRequestedPallets.toFixed(2)} palets reales → {orderChargedPallets} {orderChargedPallets === 1 ? 'palet facturable' : 'palets facturables'})
                    </div>
                  </>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>IVA (21%):</span>
                  <span className="text-white">{formatNumber(ivaAmount)} €</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline text-sm">
                  <span className="font-bold text-white font-sans">Total a pagar:</span>
                  <span className="font-bold text-emerald-400 text-lg">{formatNumber(totalAmount)} €</span>
                </div>
              </div>

              {orderExceedsWarehouse && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <div className="leading-relaxed">
                    <strong className="text-rose-200">Exceso de capacidad:</strong> Este pedido sumaría <strong>{orderRequestedPallets.toFixed(2)} palets</strong>, superando la capacidad máxima de tu almacén ({totalOccupiedPallets.toFixed(2)} / {maxPalletsAllowed} palets ocupados, <strong>{freePallets.toFixed(2)} palets libres</strong>).
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedAnn(null)}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={isSubmitting || (!needsTransport && !canPickupWithoutTransport) || orderExceedsWarehouse}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Tramitar pedido</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shopping Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end">
          <div className="bg-slate-900 border-l border-slate-800 max-w-md w-full h-full p-6 flex flex-col shadow-2xl relative animate-in slide-in-from-right overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">Cesta de materias primas</h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Cart Items */}
            <div className="flex-1 overflow-y-auto my-4 space-y-4 pr-1">
              {cart.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-3">
                  <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto" />
                  <p className="text-sm font-medium">Tu cesta de materias primas está vacía.</p>
                  <p className="text-xs text-slate-500">Añade productos del catálogo para tramitar tu pedido.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.announcement.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-white text-sm">{item.announcement.title}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-amber-400">{item.announcement.presentation}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              (Stock: {item.announcement.stock === undefined || item.announcement.stock === null || item.announcement.stock === 'ilimitado' ? 'Ilimitado' : `${item.announcement.stock} u.`})
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.announcement.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2 bg-slate-900 rounded-lg p-1 border border-slate-800">
                          <button
                            onClick={() => updateCartQty(item.announcement.id, -1)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-300"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-white text-xs px-2">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQty(item.announcement.id, 1)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-300"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-bold text-emerald-400 text-sm">
                          {formatNumber(item.announcement.pricePerUnit * item.quantity)} €
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sticky Drawer Footer */}
            {cart.length > 0 && (
              <div className="shrink-0 pt-4 border-t border-slate-800 bg-slate-900 space-y-3">
                {studentWarehouses.length > 0 && (
                  <div className="space-y-1.5 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Inmueble / almacén de destino:</span>
                      {studentWarehouses.length > 1 && (
                        <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                          ⚠️ Selecciona almacén
                        </span>
                      )}
                    </label>
                    <select
                      value={selectedDestinationNaveId}
                      onChange={(e) => setSelectedDestinationNaveId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-medium"
                    >
                      {studentWarehouses.map((w: any) => {
                        const hasF = checkWarehouseHasForklift(w);
                        return (
                          <option key={w.id} value={w.id}>
                            {w.propertyTitle || w.title || 'Almacén'} ({w.location || w.direccion || 'Polígono industrial'}) — {hasF ? '🚜 [Carretilla OK]' : '⚠️ [Falta carretilla]'}
                          </option>
                        );
                      })}
                    </select>
                    {(() => {
                      const currentWh = studentWarehouses.find((w: any) => String(w.id) === String(selectedDestinationNaveId)) || studentWarehouses[0];
                      const hasF = checkWarehouseHasForklift(currentWh);
                      if (!hasF && currentWh) {
                        return (
                          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-medium flex items-center gap-1.5 mt-1">
                            <span>⚠️ Este almacén no tiene carretilla elevadora asignada. Asigna una desde la gestión de flotas / concesionario.</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Base imponible:</span>
                    <span className="text-white">{formatNumber(cartBasePrice)} €</span>
                  </div>
                  {cartNeedsTransport && (
                    <>
                      <div className="flex justify-between text-slate-400">
                        <span>Transporte ({cartChargedPallets} pal. × {cartDistanceKm} km × 0,38 €):</span>
                        <span className="text-amber-400 font-bold">{formatNumber(cartTransportCost)} €</span>
                      </div>
                      <div className="text-[10px] text-slate-500 italic">
                        * Tarifa unificada de 0,38 €/palet/km ({cartRequestedPallets.toFixed(2)} palets reales → {cartChargedPallets} {cartChargedPallets === 1 ? 'palet facturable' : 'palets facturables'})
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-slate-400">
                    <span>IVA (21%):</span>
                    <span className="text-white">{formatNumber(cartIvaAmount)} €</span>
                  </div>
                  <div className="pt-1.5 border-t border-slate-800 flex justify-between text-sm font-sans font-bold">
                    <span className="text-white">Total a pagar:</span>
                    <span className="text-emerald-400 text-base">{formatNumber(cartGrandTotal)} €</span>
                  </div>
                </div>

                {cartExceedsWarehouse && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <div className="leading-relaxed">
                      <strong className="text-rose-200">Exceso de capacidad:</strong> La cesta sumaría <strong>{cartRequestedPallets.toFixed(2)} palets</strong>, superando la capacidad máxima de tu almacén ({totalOccupiedPallets.toFixed(2)} / {maxPalletsAllowed} palets ocupados, <strong>{freePallets.toFixed(2)} palets libres</strong>).
                    </div>
                  </div>
                )}

                <button
                  onClick={handleCheckoutCart}
                  disabled={isSubmitting || cartExceedsWarehouse}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Tramitar pedido de cesta ({cartItemCount} items)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Negotiation Modal */}
      {negotiatingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 max-w-xl w-full p-6 rounded-2xl shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">Herramienta de negociación de compra</h3>
              </div>
              <button
                onClick={() => setNegotiatingOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-1">
              <div className="text-slate-400 font-medium">Pedido ref: <span className="font-mono text-amber-400 font-bold">{negotiatingOrder.id}</span></div>
              <div className="text-white font-bold text-sm">{negotiatingOrder.materialTitle}</div>
              <div className="text-slate-400">Comprador: <span className="text-white">{negotiatingOrder.studentName}</span></div>
            </div>

            {/* Negotiation History */}
            {negotiatingOrder.negotiationHistory && negotiatingOrder.negotiationHistory.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Historial de negociación</h4>
                <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                  {negotiatingOrder.negotiationHistory.map((entry, idx) => (
                    <div key={idx} className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-lg text-xs space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-slate-500">
                        <span className="font-bold text-indigo-300">{entry.authorName}</span>
                        <span>{new Date(entry.timestamp).toLocaleString('es-ES')}</span>
                      </div>
                      <div className="text-slate-300 font-medium">
                        Desc: <span className="text-amber-400 font-bold">{entry.discountPercentage}%</span> |
                        Seguro: <span className="text-emerald-400 font-bold">{entry.insuranceFee} €</span> |
                        Transp: <span className="text-indigo-400">{entry.transportMethod === 'vendedor_envio' ? 'Envío vendedor' : 'Recogida comprador'}</span>
                      </div>
                      {entry.note && <div className="text-slate-400 italic font-sans text-[11px]">"{entry.note}"</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Negotiation Controls */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Precio unitario (€)</label>
                  <input
                    type="number"
                    min="1"
                    value={negPricePerUnit}
                    onChange={(e) => setNegPricePerUnit(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cantidad solicitada (u.)</label>
                  <input
                    type="number"
                    min="1"
                    value={negQty}
                    onChange={(e) => setNegQty(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Descuento (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={negDiscount}
                    onChange={(e) => setNegDiscount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Prima de seguro (€)</label>
                  <input
                    type="number"
                    min="0"
                    value={negInsurance}
                    onChange={(e) => setNegInsurance(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Método de transporte</label>
                <select
                  value={negTransportMethod}
                  onChange={(e: any) => setNegTransportMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="vendedor_envio">Envío a cargo del vendedor (+ portes)</option>
                  <option value="comprador_recogida">Recogida por el comprador (requiere camión + camionero)</option>
                </select>
                {negTransportMethod === 'comprador_recogida' && !canPickupWithoutTransport && (
                  <p className="text-[11px] text-amber-400 mt-1">
                    ⚠️ Advertencia: Para recoger la mercancía debes disponer de un camión tráiler y un chofer camionero contratado.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nota / propuesta de la contraoferta</label>
                <textarea
                  rows={2}
                  value={negNote}
                  onChange={(e) => setNegNote(e.target.value)}
                  placeholder="Propongo descuento por volumen de compra e inclusión de seguro..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setNegotiatingOrder(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendNegotiation}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar contraoferta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Profile Publishing Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 max-w-lg w-full p-6 rounded-2xl shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">Perfil comercial de empresa</h3>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Company Name (Read-only mandatory) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nombre oficial de la empresa <span className="text-indigo-400 text-[10px] font-normal">(Asignado por el profesor)</span>
                </label>
                <input
                  type="text"
                  value={currentUser.name}
                  disabled
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 font-bold cursor-not-allowed"
                />
              </div>

              {/* Description & Business Info */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Información y descripción de la empresa
                </label>
                <textarea
                  rows={4}
                  value={profileDescription}
                  onChange={(e) => setProfileDescription(e.target.value)}
                  placeholder="Describe la actividad de tu empresa, productos disponibles en tu catálogo, capacidad de suministro y condiciones comerciales para tus clientes..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Logo Upload & URL */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Logotipo de la empresa
                </label>
                <div className="flex gap-3 items-center">
                  <div className="w-14 h-14 rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center shrink-0 overflow-hidden">
                    {profileLogoUrl ? (
                      <img
                        src={profileLogoUrl}
                        alt="Logo Preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as any).src = 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=120&q=80'; }}
                      />
                    ) : (
                      <Building2 className="w-7 h-7 text-indigo-400" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={profileLogoUrl}
                      onChange={(e) => setProfileLogoUrl(e.target.value)}
                      placeholder="URL de imagen del logotipo (ej: https://...)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />

                    <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Subir logotipo desde mi dispositivo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              if (typeof reader.result === 'string') {
                                setProfileLogoUrl(reader.result);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCompanyProfile}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Guardar y publicar perfil</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Announcement Confirmation Modal */}
      {deletingAnnId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Eliminar anuncio del mercado</h3>
                <p className="text-xs text-slate-400 mt-0.5">Retirar oferta comercial del catálogo</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 leading-relaxed">
              ¿Estás seguro de que deseas eliminar este anuncio? Los compradores ya no podrán ver esta oferta en el mercado ni realizar solicitudes sobre ella.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingAnnId(null)}
                disabled={isDeletingAnn}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAnnouncement}
                disabled={isDeletingAnn}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-1.5"
              >
                {isDeletingAnn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeletingAnn ? 'Eliminando...' : 'Confirmar eliminación'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Invoice Creation Modal */}
      {isManualInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative my-8 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Emitir factura manual en chat</h3>
                  <p className="text-xs text-slate-400">
                    Enviar documento oficial a <span className="text-amber-300 font-bold">{tradingPartners.find(p => p.id === selectedPartnerId)?.name || 'Cliente'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManualInvoiceModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Concept Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Concepto general / título de factura
                </label>
                <input
                  type="text"
                  value={manualInvoiceConcept}
                  onChange={(e) => setManualInvoiceConcept(e.target.value)}
                  placeholder="Ej: Suministro de pellets de plástico y aditivos"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Líneas de detalle de productos / servicios
                  </label>
                  <button
                    type="button"
                    onClick={handleAddManualInvoiceItem}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir línea</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {manualInvoiceItems.map((item, idx) => {
                    const lineSubtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    return (
                      <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleUpdateManualInvoiceItem(idx, 'title', e.target.value)}
                          placeholder="Descripción del concepto"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                        />
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleUpdateManualInvoiceItem(idx, 'quantity', e.target.value)}
                              placeholder="Cant"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-amber-500"
                            />
                          </div>
                          <span className="text-slate-500 text-xs">x</span>
                          <div className="w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unitPrice}
                              onChange={(e) => handleUpdateManualInvoiceItem(idx, 'unitPrice', e.target.value)}
                              placeholder="Precio €"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-right focus:outline-none focus:border-amber-500"
                            />
                          </div>
                          <div className="w-24 text-right font-mono font-bold text-xs text-amber-300 px-1">
                            {formatNumber(lineSubtotal)} €
                          </div>
                          {manualInvoiceItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveManualInvoiceItem(idx)}
                              className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                              title="Eliminar línea"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Extras: Discount, Transport, Insurance */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Descuento (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualInvoiceDiscount}
                    onChange={(e) => setManualInvoiceDiscount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white text-right focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Transporte (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualInvoiceTransport}
                    onChange={(e) => setManualInvoiceTransport(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white text-right focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Seguro (€) <span className="text-[10px] text-amber-400/90 font-normal">(No sujeto a IVA)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualInvoiceInsurance}
                    onChange={(e) => setManualInvoiceInsurance(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white text-right focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Totals Summary Card */}
              {(() => {
                const subtotal = manualInvoiceItems.reduce((acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
                const disc = Number(manualInvoiceDiscount) || 0;
                const trans = Number(manualInvoiceTransport) || 0;
                const ins = Number(manualInvoiceInsurance) || 0;
                // Insurance is not subject to VAT (exempt). Base Imponible only includes items - discount + transport
                const base = Math.max(0, subtotal - disc + trans);
                const vat = Math.round((base * 0.21) * 100) / 100;
                const total = Math.round((base + vat + ins) * 100) / 100;

                return (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>Suma de conceptos:</span>
                      <span className="font-mono">{formatNumber(subtotal)} €</span>
                    </div>
                    {disc > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Descuento comercial:</span>
                        <span className="font-mono">-{formatNumber(disc)} €</span>
                      </div>
                    )}
                    {trans > 0 && (
                      <div className="flex justify-between text-slate-300">
                        <span>Gastos de transporte:</span>
                        <span className="font-mono">+{formatNumber(trans)} €</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-300 border-t border-slate-800/80 pt-1 font-semibold">
                      <span>Base imponible (21% IVA):</span>
                      <span className="font-mono">{formatNumber(base)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Cuota IVA (21%):</span>
                      <span className="font-mono">{formatNumber(vat)} €</span>
                    </div>
                    {ins > 0 && (
                      <div className="flex justify-between text-slate-300">
                        <span>Seguro de mercancía (no sujeto a IVA):</span>
                        <span className="font-mono">+{formatNumber(ins)} €</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black text-amber-300 border-t border-amber-500/40 pt-1.5 mt-1">
                      <span>TOTAL FACTURA EMITIDA:</span>
                      <span className="font-mono text-base">{formatNumber(total)} €</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsManualInvoiceModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendManualInvoiceSubmit}
                disabled={isSubmittingManualInvoice}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingManualInvoice ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                <span>Emitir y enviar factura al chat</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promissory Note Creation / Signing Modal */}
      {isPromissoryNoteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl relative my-8 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <FileSignature className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Firmar y emitir pagaré cambiario</span>
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                      Ley 19/1985
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Emisión con efecto ejecutivo en favor de <strong className="text-emerald-300">{promissoryBeneficiaryName || 'Vendedor'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPromissoryNoteModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Legal Requirements Notice */}
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-200/90 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-emerald-300">Requisitos formales obligatorios (art. 94 de la Ley Cambiaria):</div>
                <div className="text-[11px] text-emerald-300/80 leading-relaxed">
                  Contiene denominación explícita de pagaré, promesa incondicional de pago en euros, fecha de vencimiento, domiciliación bancaria completa con IBAN, beneficiario identificado con NIF y firma del librador con registro de obligación financiera.
                </div>
              </div>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Amount & Due Date row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Importe del pagaré (€) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={promissoryAmount}
                      onChange={(e) => setPromissoryAmount(Number(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                      placeholder="0.00"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-bold">EUR</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Fecha de vencimiento <span className="text-rose-400">*</span>
                    </label>
                    <div className="flex gap-1">
                      {[30, 60, 90].map(days => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + days);
                            setPromissoryDueDate(d.toISOString().slice(0, 10));
                          }}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded font-semibold transition"
                        >
                          +{days}d
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="date"
                    value={promissoryDueDate}
                    onChange={(e) => setPromissoryDueDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Amount In Spanish Words */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                  Importe en letra (fórmula legal obligatoria)
                </label>
                <div className="font-mono text-xs font-bold text-emerald-300 italic bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  &laquo; {numberToSpanishWords(Number(promissoryAmount) || 0)} &raquo;
                </div>
              </div>

              {/* Parties Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Beneficiary (Vendor) */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>Tomador / beneficiario</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">Razón social / titular:</label>
                    <input
                      type="text"
                      value={promissoryBeneficiaryName}
                      onChange={(e) => setPromissoryBeneficiaryName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">NIF / CIF:</label>
                    <input
                      type="text"
                      value={promissoryBeneficiaryNif}
                      onChange={(e) => setPromissoryBeneficiaryNif(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Issuer (Buyer / Signer) */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Librador / firmante emisor</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">Razón social / titular:</label>
                    <input
                      type="text"
                      value={promissoryIssuerName}
                      onChange={(e) => setPromissoryIssuerName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">NIF / CIF:</label>
                    <input
                      type="text"
                      value={promissoryIssuerNif}
                      onChange={(e) => setPromissoryIssuerNif(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Bank Domiciliation & Clause */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Entidad bancaria
                  </label>
                  <input
                    type="text"
                    value={promissoryBankName}
                    onChange={(e) => setPromissoryBankName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: Banco Santander"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    IBAN domiciliación de pago
                  </label>
                  <input
                    type="text"
                    value={promissoryBankIban}
                    onChange={(e) => setPromissoryBankIban(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    placeholder="ES91 0049 1500 0512 3456 7890"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Cláusula cambiaria
                  </label>
                  <select
                    value={promissoryOrderType}
                    onChange={(e) => setPromissoryOrderType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                  >
                    <option value="no_a_la_orden">No a la orden (recomendado)</option>
                    <option value="a_la_orden">A la orden (endosable)</option>
                  </select>
                </div>
              </div>

              {/* Issue Place & Concept */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Lugar de emisión
                  </label>
                  <input
                    type="text"
                    value={promissoryIssuePlace}
                    onChange={(e) => setPromissoryIssuePlace(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: Madrid"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Concepto de la operación / factura
                  </label>
                  <input
                    type="text"
                    value={promissoryConcept}
                    onChange={(e) => setPromissoryConcept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: Suministro de materia prima según contrato"
                  />
                </div>
              </div>

              {/* Live Physical Promissory Note Preview */}
              <div className="pt-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Vista previa del título ejecutivo (efecto cambiario):</span>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/95 via-amber-100/90 to-amber-50/95 border-2 border-amber-300 text-slate-900 shadow-md space-y-3 font-serif select-none relative overflow-hidden">
                  <div className="flex justify-between items-start border-b-2 border-slate-900/20 pb-2">
                    <div>
                      <div className="text-lg font-black tracking-widest uppercase font-sans text-slate-950">PAGARÉ</div>
                      <div className="text-[10px] font-mono text-slate-600">Nº PAG-{Date.now().toString().slice(-8)} &bull; {promissoryOrderType === 'no_a_la_orden' ? 'CLÁUSULA: NO A LA ORDEN' : 'CLÁUSULA: A LA ORDEN'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-slate-600">IMPORTE EN CIFRAS</div>
                      <div className="text-lg font-black font-mono text-slate-950 bg-amber-200/80 px-3 py-0.5 rounded border border-amber-400">
                        {formatNumber(Number(promissoryAmount) || 0)} €
                      </div>
                    </div>
                  </div>

                  <div className="text-xs leading-relaxed text-slate-800 space-y-1">
                    <p>
                      Por este <strong>PAGARÉ</strong> me comprometo a pagar el día <strong>{promissoryDueDate ? new Date(promissoryDueDate).toLocaleDateString('es-ES') : '---'}</strong> a{' '}
                      <strong>{promissoryBeneficiaryName || 'Beneficiario'}</strong> (NIF: {promissoryBeneficiaryNif || '---'}) o a su orden, la cantidad de:
                    </p>
                    <p className="font-bold uppercase text-slate-950 bg-amber-200/60 p-2 rounded border border-amber-300 font-mono text-[11px]">
                      {numberToSpanishWords(Number(promissoryAmount) || 0)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] border-t border-slate-900/20">
                    <div>
                      <div className="text-[10px] text-slate-600 font-sans font-bold">LUGAR DE PAGO Y DOMICILIACIÓN:</div>
                      <div className="font-semibold">{promissoryBankName}</div>
                      <div className="font-mono text-[10px]">{promissoryBankIban}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-600 font-sans font-bold">LUGAR Y FECHA DE EMISIÓN:</div>
                      <div className="font-semibold">{promissoryIssuePlace}, {new Date().toLocaleDateString('es-ES')}</div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-between items-end border-t border-slate-900/20">
                    <div className="text-[10px] text-slate-600">
                      <div>LIBRADOR: <strong>{promissoryIssuerName}</strong></div>
                      <div>NIF: {promissoryIssuerNif}</div>
                    </div>
                    <div className="text-right">
                      <div className="inline-block border-2 border-dashed border-emerald-700/60 px-3 py-1.5 rounded-lg bg-emerald-100/60 text-emerald-900 text-[10px] font-sans font-bold">
                        <div className="flex items-center gap-1">
                          <Stamp className="w-3 h-3 text-emerald-700" />
                          <span>FIRMA DIGITAL LIBRADOR</span>
                        </div>
                        <div className="text-[9px] font-mono text-emerald-800">HASH: SHA256-REGISTRO-VALIDADO</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPromissoryNoteModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirmar-firmar-pagare"
                onClick={handleSignPromissoryNoteSubmit}
                disabled={isSubmittingPromissory || Number(promissoryAmount) <= 0}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingPromissory ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSignature className="w-4 h-4" />
                )}
                <span>Firmar y enviar pagaré al vendedor</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promissory Note Viewer Modal */}
      {selectedPromissoryNoteForView && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative my-8 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <FileSignature className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Pagaré mercantil oficial</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    N.º {selectedPromissoryNoteForView.promissoryNoteNumber} &bull; Efecto cambiario registrado
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPromissoryNoteForView(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Body */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-amber-50 via-amber-100 to-amber-50 border-2 border-amber-300 text-slate-900 shadow-xl space-y-4 font-serif relative overflow-hidden">
              {selectedPromissoryNoteForView.status === 'pagado' && (
                <div className="absolute top-8 right-8 rotate-12 border-4 border-emerald-700 text-emerald-800 font-black text-sm px-4 py-1.5 rounded-xl uppercase tracking-widest bg-emerald-100/90 shadow-lg pointer-events-none z-10">
                  ✓ Cobrado en banco
                </div>
              )}
              {selectedPromissoryNoteForView.status === 'impagado' && (
                <div className="absolute top-8 right-8 rotate-12 border-4 border-rose-700 text-rose-800 font-black text-sm px-4 py-1.5 rounded-xl uppercase tracking-widest bg-rose-100/90 shadow-lg pointer-events-none z-10">
                  ❌ Efecto impagado
                </div>
              )}
              <div className="flex justify-between items-start border-b-2 border-slate-900/20 pb-3">
                <div>
                  <div className="text-2xl font-black tracking-widest uppercase font-sans text-slate-950">PAGARÉ</div>
                  <div className="text-xs font-mono text-slate-600">N.º {selectedPromissoryNoteForView.promissoryNoteNumber}</div>
                  <div className="text-[11px] font-bold text-amber-900 mt-1 uppercase font-sans">
                    CLÁUSULA: {selectedPromissoryNoteForView.orderType === 'no_a_la_orden' ? 'NO A LA ORDEN' : 'A LA ORDEN'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-slate-600">IMPORTE EN CIFRAS</div>
                  <div className="text-xl font-black font-mono text-slate-950 bg-amber-200/90 px-4 py-1 rounded border border-amber-400">
                    {formatNumber(selectedPromissoryNoteForView.amount)} €
                  </div>
                </div>
              </div>

              <div className="text-sm leading-relaxed text-slate-800 space-y-2">
                <p>
                  Por este <strong>PAGARÉ</strong> me comprometo a pagar el día{' '}
                  <strong className="text-slate-950 bg-amber-200/50 px-1 rounded">
                    {new Date(selectedPromissoryNoteForView.dueDate).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </strong>{' '}
                  a <strong>{selectedPromissoryNoteForView.beneficiaryName}</strong> (NIF: {selectedPromissoryNoteForView.beneficiaryNifCif}) o a su orden, la cantidad de:
                </p>
                <div className="font-bold uppercase text-slate-950 bg-amber-200/70 p-3 rounded-lg border border-amber-300 font-mono text-xs text-center tracking-wide">
                  &laquo; {selectedPromissoryNoteForView.amountInWords} &raquo;
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 text-xs border-t border-slate-900/20">
                <div>
                  <div className="text-[10px] text-slate-600 font-sans font-bold uppercase">Lugar de pago / entidad domiciliataria:</div>
                  <div className="font-bold text-slate-900">{selectedPromissoryNoteForView.bankName}</div>
                  <div className="font-mono text-[11px] text-slate-700">{selectedPromissoryNoteForView.bankIban}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-600 font-sans font-bold uppercase">Lugar y fecha de emisión:</div>
                  <div className="font-semibold text-slate-900">
                    {selectedPromissoryNoteForView.issuePlace}, {new Date(selectedPromissoryNoteForView.issueDate).toLocaleDateString('es-ES')}
                  </div>
                  {selectedPromissoryNoteForView.concept && (
                    <div className="text-[10px] text-slate-600 mt-1 italic">
                      Ref: {selectedPromissoryNoteForView.concept}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 flex justify-between items-end border-t-2 border-slate-900/20">
                <div className="text-xs text-slate-700">
                  <div className="text-[10px] text-slate-600 font-sans font-bold uppercase">Librador (firmante):</div>
                  <div className="font-bold text-slate-950">{selectedPromissoryNoteForView.issuerName}</div>
                  <div className="font-mono text-[11px]">NIF/CIF: {selectedPromissoryNoteForView.issuerNifCif}</div>
                </div>
                <div className="text-right">
                  <div className="inline-block border-2 border-emerald-800/80 px-4 py-2 rounded-xl bg-emerald-100/80 text-emerald-950 text-xs font-sans font-bold shadow-sm">
                    <div className="flex items-center justify-end gap-1.5 text-emerald-800">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span>Firma electrónica válida</span>
                    </div>
                    <div className="text-[9px] font-mono text-emerald-700 mt-0.5">
                      HASH: {selectedPromissoryNoteForView.digitalSignatureHash || 'SHA256-LEGAL-REGISTRO'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPromissoryNoteForView(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition cursor-pointer"
              >
                Cerrar
              </button>

              {/* Vendor Cobrar / Descontar / Gestión de cobro action in modal */}
              {selectedPromissoryNoteForView.status === 'descontado' && (
                <div className="flex-1 py-2.5 px-4 rounded-xl bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-bold text-xs shadow-lg flex items-center justify-center gap-1.5 text-center">
                  <Landmark className="w-4 h-4 text-cyan-400" />
                  <span>Descontado en banco (cobro anticipado liquidado)</span>
                </div>
              )}

              {selectedPromissoryNoteForView.status === 'gestion_cobro' && (
                <div className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-950/80 border border-indigo-500/50 text-indigo-300 font-bold text-xs shadow-lg flex items-center justify-center gap-1.5 text-center">
                  <Landmark className="w-4 h-4 text-indigo-400" />
                  <span>En gestión de cobro bancario (liquidación automática al vencimiento)</span>
                </div>
              )}

              {selectedPromissoryNoteForView.status === 'impagado' && (
                <div className="flex-1 py-2.5 px-4 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 font-bold text-xs shadow-lg flex flex-col items-center justify-center gap-1 text-center">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Efecto impagado (devuelto por falta de fondos del deudor)</span>
                  </div>
                  {(selectedPromissoryNoteForView.isDiscounted || selectedPromissoryNoteForView.unpaidFeeRate || selectedPromissoryNoteForView.unpaidNominalReimbursed) && (
                    <div className="text-[10px] text-rose-200/90 font-normal">
                      Cargado al cedente: Reintegro de anticipo nominal (-{formatNumber(selectedPromissoryNoteForView.amount)} €) + Comisión devolución 1% (-{formatNumber(selectedPromissoryNoteForView.unpaidFeeAmount || selectedPromissoryNoteForView.amount * 0.01)} €). Total adeudado: -{formatNumber(selectedPromissoryNoteForView.unpaidTotalDebited || (selectedPromissoryNoteForView.amount + (selectedPromissoryNoteForView.unpaidFeeAmount || selectedPromissoryNoteForView.amount * 0.01)))} €.
                    </div>
                  )}
                </div>
              )}

              {selectedPromissoryNoteForView.status === 'pendiente' &&
                (currentUser.id === selectedPromissoryNoteForView.beneficiaryId ||
                 currentUser.name?.toLowerCase() === selectedPromissoryNoteForView.beneficiaryName?.toLowerCase() ||
                 currentUser.username === 'pupdaniel' ||
                 isTeacher) &&
                (() => {
                  const now = new Date();
                  const localY = now.getFullYear();
                  const localM = String(now.getMonth() + 1).padStart(2, '0');
                  const localD = String(now.getDate()).padStart(2, '0');
                  const todayLocalStr = `${localY}-${localM}-${localD}`;
                  const todayUtcStr = now.toISOString().slice(0, 10);
                  const dueStr = (selectedPromissoryNoteForView.dueDate || '').slice(0, 10);
                  const isDueOrPast = todayLocalStr >= dueStr || todayUtcStr >= dueStr || now.getTime() >= new Date(selectedPromissoryNoteForView.dueDate).getTime() || isTeacher;

                  const activeMsg = chatMessages.find(
                    m => m.type === 'promissory_note' && m.promissoryNoteData?.promissoryNoteNumber === selectedPromissoryNoteForView.promissoryNoteNumber
                  );
                  const targetId = activeMsg ? activeMsg.id : (selectedPromissoryNoteForView.id || selectedPromissoryNoteForView.promissoryNoteNumber);

                  return isDueOrPast ? (
                    <button
                      type="button"
                      disabled={isSubmittingPromissory}
                      onClick={() => handleCollectPromissoryNote(targetId, selectedPromissoryNoteForView)}
                      className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Cobrar pagaré en banco ({formatNumber(selectedPromissoryNoteForView.amount)} €)</span>
                    </button>
                  ) : (
                    <div className="flex-1 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        disabled={isSubmittingDiscount}
                        onClick={() => setNoteForDiscountModal({ messageId: targetId, note: selectedPromissoryNoteForView })}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Landmark className="w-4 h-4 text-slate-950" />
                        <span>Descontar pagaré (anticipar)</span>
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingCollection}
                        onClick={() => setNoteForCollectionModal({ messageId: targetId, note: selectedPromissoryNoteForView })}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Landmark className="w-4 h-4 text-indigo-200" />
                        <span>Gestión de cobro (automático)</span>
                      </button>
                    </div>
                  );
                })()}

              <button
                type="button"
                onClick={() => openPrintablePromissoryNoteWindow(selectedPromissoryNoteForView)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir / guardar en PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de descuento bancario de pagaré mercantil */}
      {noteForDiscountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Descuento comercial de pagaré</h3>
                  <p className="text-xs text-slate-400">Anticipo de fondos bancarios sobre efecto mercantil</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNoteForDiscountModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const note = noteForDiscountModal.note;
              const now = new Date();
              const diffTime = new Date(note.dueDate).getTime() - now.getTime();
              const daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
              const discountInterest = Number(((note.amount * 0.06 * daysRemaining) / 360).toFixed(2));
              const discountCommission = Number((note.amount * 0.005).toFixed(2));
              const netAmount = Number((note.amount - discountInterest - discountCommission).toFixed(2));
              const unpaidPenaltyFee = Number((note.amount * 0.01).toFixed(2));

              return (
                <div className="space-y-4">
                  {/* Note details */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Pagaré n.º:</span>
                      <span className="font-mono font-bold text-white">{note.promissoryNoteNumber}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Librador (comprador deudor):</span>
                      <span className="font-semibold text-slate-200">{note.issuerName}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Fecha de vencimiento:</span>
                      <span className="font-medium text-amber-300">
                        {new Date(note.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} ({daysRemaining} días restantes)
                      </span>
                    </div>
                  </div>

                  {/* Financial Calculation Breakdown */}
                  <div className="bg-slate-950/80 border border-teal-500/30 rounded-xl p-4 space-y-3">
                    <div className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-2">
                      <span>Liquidación bancaria del descuento</span>
                      <span className="text-[10px] lowercase text-slate-400 font-normal">(Base año comercial: 360 días)</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Importe nominal del pagaré:</span>
                        <span className="font-mono font-bold text-white">+{formatNumber(note.amount)} €</span>
                      </div>

                      <div className="flex justify-between items-center text-rose-300">
                        <span>Intereses de descuento (6,00% nominal anual &bull; {daysRemaining} días):</span>
                        <span className="font-mono font-bold">-{formatNumber(discountInterest)} €</span>
                      </div>
                      <div className="text-[10px] text-slate-500 pl-2">
                        Fórmula: ({formatNumber(note.amount)} € &times; 6% &times; {daysRemaining} / 360)
                      </div>

                      <div className="flex justify-between items-center text-amber-300">
                        <span>Comisión bancaria de descuento (0,50% sobre nominal):</span>
                        <span className="font-mono font-bold">-{formatNumber(discountCommission)} €</span>
                      </div>
                      <div className="text-[10px] text-slate-500 pl-2">
                        Fórmula: ({formatNumber(note.amount)} € &times; 0,5%)
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center bg-teal-950/40 -mx-4 -mb-4 p-4 rounded-b-xl border border-teal-500/40">
                      <div>
                        <div className="text-xs font-bold text-teal-200">TOTAL LÍQUIDO A PERCIBIR HOY:</div>
                        <div className="text-[10px] text-teal-400/80">Abono inmediato en cuenta corriente</div>
                      </div>
                      <div className="text-xl font-black font-mono text-emerald-400">
                        +{formatNumber(netAmount)} €
                      </div>
                    </div>
                  </div>

                  {/* Terms and Legal Notice */}
                  <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-200/90 leading-relaxed space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-amber-300">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>Condiciones de vencimiento del descuento:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-300 text-[10px] pl-1">
                      <li>
                        <strong className="text-emerald-300">Si el deudor paga al vencimiento:</strong> Tu banco liquidará el cobro directamente con el comprador. No se te aplicará ningún coste adicional.
                      </li>
                      <li>
                        <strong className="text-rose-300">Si el deudor no tiene saldo (impago al vencimiento):</strong> Como el banco te anticipó el dinero hoy, te cargará en cuenta el <strong>reintegro del importe nominal (-{formatNumber(note.amount)} €)</strong> más la <strong>comisión bancaria de devolución del 1,00% (-{formatNumber(unpaidPenaltyFee)} €)</strong>, totalizando un cargo de <strong>-{formatNumber(note.amount + unpaidPenaltyFee)} €</strong>. Conservarás el efecto cambiario impagado para reclamar el cobro en el juzgado (portal judicial).
                      </li>
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setNoteForDiscountModal(null)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingDiscount}
                      onClick={() => handleDiscountPromissoryNote(noteForDiscountModal.messageId, note)}
                      className="flex-2 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Landmark className="w-4 h-4 text-slate-950" />
                      <span>{isSubmittingDiscount ? 'Procesando descuento...' : `Confirmar descuento (+${formatNumber(netAmount)} €)`}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal de gestión de cobro bancaria de pagaré mercantil */}
      {noteForCollectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Gestión de cobro bancaria</h3>
                  <p className="text-xs text-slate-400">Tramitación y cobro automático de pagaré al vencimiento</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNoteForCollectionModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const note = noteForCollectionModal.note;
              const now = new Date();
              const diffTime = new Date(note.dueDate).getTime() - now.getTime();
              const daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
              const commission = Math.max(20, Number((note.amount * 0.005).toFixed(2)));

              return (
                <div className="space-y-4">
                  {/* Note details */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Pagaré n.º:</span>
                      <span className="font-mono font-bold text-white">{note.promissoryNoteNumber}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Librador (comprador deudor):</span>
                      <span className="font-semibold text-slate-200">{note.issuerName}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Fecha de vencimiento:</span>
                      <span className="font-medium text-indigo-300">
                        {new Date(note.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} ({daysRemaining} días restantes)
                      </span>
                    </div>
                  </div>

                  {/* Financial Calculation Breakdown */}
                  <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4 space-y-3">
                    <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-2">
                      <span>Condiciones de gestión bancaria</span>
                      <span className="text-[10px] text-slate-400 font-normal">Tarifa por gestión de efectos</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Importe nominal a cobrar al vencer:</span>
                        <span className="font-mono font-bold text-emerald-400">+{formatNumber(note.amount)} €</span>
                      </div>

                      <div className="flex justify-between items-center text-indigo-300">
                        <span>Comisión de servicio de gestión de cobro (0,5% nominal, mín. 20 €):</span>
                        <span className="font-mono font-bold">-{formatNumber(commission)} €</span>
                      </div>
                      <div className="text-[10px] text-slate-500 pl-2">
                        Fórmula: max(20,00 €, {formatNumber(note.amount)} € &times; 0,5%)
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center bg-indigo-950/40 -mx-4 -mb-4 p-4 rounded-b-xl border border-indigo-500/40">
                      <div>
                        <div className="text-xs font-bold text-indigo-200">COSTE DE TRAMITACIÓN BANCARIA HOY:</div>
                        <div className="text-[10px] text-indigo-300/80">Cargo inmediato por emisión de remesa</div>
                      </div>
                      <div className="text-xl font-black font-mono text-indigo-300">
                        -{formatNumber(commission)} €
                      </div>
                    </div>
                  </div>

                  {/* Terms and Legal Notice */}
                  <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-3 text-[11px] text-slate-300 leading-relaxed space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-indigo-300">
                      <Info className="w-4 h-4 shrink-0 text-indigo-400" />
                      <span>Cómo funciona el servicio de gestión de cobro:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1.5 text-[10.5px] pl-1">
                      <li>
                        <strong className="text-emerald-300">Cobro 100% automático al vencimiento:</strong> En la fecha de vencimiento ({new Date(note.dueDate).toLocaleDateString('es-ES')}), el banco tramitará la compensación e ingresará directamente los <strong>+{formatNumber(note.amount)} €</strong> en tu cuenta corriente <span className="text-emerald-400 font-bold">sin necesidad de tener que darle al botón de cobrar</span>.
                      </li>
                      <li>
                        <strong className="text-rose-300">En caso de impago por falta de fondos del librador:</strong> Si el comprador deudor no dispone de saldo suficiente en su cuenta, el banco te devolverá el pagaré como <em>impagado</em> con una <span className="text-rose-300 font-bold">comisión fija adicional de 40,00 €</span>. Conservarás el efecto para presentar demanda ejecutiva cambiaria en el Juzgado (Portal Judicial).
                      </li>
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setNoteForCollectionModal(null)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingCollection}
                      onClick={() => handleCollectionManagementPromissoryNote(noteForCollectionModal.messageId, note)}
                      className="flex-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-black text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Landmark className="w-4 h-4 text-white" />
                      <span>{isSubmittingCollection ? 'Tramitando gestión...' : `Confirmar gestión de cobro (-${formatNumber(commission)} €)`}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal de Aviso de Demanda Comercial / Precio Excesivo (Profesor -> Alumno Nivel 3) */}
      {isPriceAlertModalOpen && selectedAnnForPriceAlert && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded-xl">
                  <Megaphone className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Aviso de demanda de mercado</h3>
                  <p className="text-xs text-slate-400">Feedback comercial sobre precio en El Des-Tornillo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPriceAlertModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info Anuncio */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Producto:</span>
                <span className="font-bold text-white">{selectedAnnForPriceAlert.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Vendedor / alumno:</span>
                <span className="font-bold text-indigo-300">{selectedAnnForPriceAlert.sellerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Precio unitario fijado:</span>
                <span className="font-mono font-bold text-amber-400 text-sm">
                  {formatNumber(selectedAnnForPriceAlert.pricePerUnit)} € + IVA
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Stock publicado:</span>
                <span className="font-mono text-slate-300">
                  {selectedAnnForPriceAlert.stock === 'ilimitado' || selectedAnnForPriceAlert.stock === undefined || selectedAnnForPriceAlert.stock === null
                    ? 'Ilimitado'
                    : `${formatNumber(selectedAnnForPriceAlert.stock)} u.`}
                </span>
              </div>
            </div>

            {/* Preset Realistic Message Templates */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Plantillas de simulación de mercado (feedback realista):</span>
              </label>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {REALISTIC_PRICE_ALERT_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setPriceAlertCustomMessage(tpl.text)}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                      priceAlertCustomMessage === tpl.text
                        ? 'bg-amber-500/20 border-amber-500 text-amber-100 shadow'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold block text-amber-300 text-[11px] mb-0.5">{tpl.label}</span>
                    <span className="italic leading-snug text-[11px]">"{tpl.text}"</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mensaje editable */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Mensaje simulado para el alumno:</span>
                <span className="text-[10px] text-slate-400 font-normal">Puedes personalizar el texto</span>
              </label>
              <textarea
                rows={3}
                value={priceAlertCustomMessage}
                onChange={e => setPriceAlertCustomMessage(e.target.value)}
                placeholder="Escribe el aviso de mercado..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-xs text-slate-200 outline-none resize-none"
              />
            </div>

            {/* Precio orientativo sugerido opcional */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Precio orientativo sugerido (€/u) (opcional):</span>
                <span className="text-[10px] text-slate-400 font-normal">Guía de precio de venta</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceAlertSuggestedPrice}
                  onChange={e => setPriceAlertSuggestedPrice(e.target.value)}
                  placeholder="Ej: 3.50 (dejar en blanco si no se especifica)"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none pr-8 font-mono"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-500 font-bold">€</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPriceAlertModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmittingPriceAlert || !priceAlertCustomMessage.trim()}
                onClick={handleSubmitPriceAlert}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingPriceAlert ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Megaphone className="w-4 h-4" />
                )}
                <span>Enviar aviso al alumno</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
