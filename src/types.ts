/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  name: string;
  username?: string;
  password?: string;
  role: 'student' | 'teacher';
  accountNumber: string;
  balance: number;
  initialBalance?: number;
  nifCif?: string;
  level?: 1 | 2 | 3;
}

export interface Transfer {
  id: string;
  senderId: string;
  senderName: string;
  senderAccount: string;
  receiverId: string;
  receiverName: string;
  receiverAccount: string;
  amount: number;
  concept: string;
  timestamp: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  studentId?: string;
  studentName?: string;
}

export type PropertyType = 'nave_industrial' | 'local_comercial' | 'oficina' | 'suelo_industrial' | 'almacen' | string;
export type OperationType = 'compra' | 'alquiler' | string;
export type LocationScope = string;

export interface DeferredPaymentConfig {
  downPaymentPercentage?: number;
  installmentsCount?: number;
  interestRate?: number;
  [key: string]: any;
}

export interface PropertyListing {
  id: string;
  title: string;
  type?: PropertyType;
  surfaceM2?: number;
  location?: string;
  imageUrl?: string;
  landPercentage?: number;
  buildingPercentage?: number;
  buyPrice?: number;
  rentPriceMonthly?: number;
  description?: string;
  isAvailable?: boolean;
  operation?: OperationType;
  ownerName?: string;
  ownerId?: string;
  status?: string;
  price?: number;
  pricePerM2?: number;
  community?: any;
  ivaRate?: number;
  address?: string;
  municipality?: string;
  deferredPaymentConfig?: DeferredPaymentConfig;
  [key: string]: any;
}

export interface PropertyAcquisition {
  id: string;
  propertyId: string;
  propertyTitle: string;
  type?: PropertyType;
  propertyType?: PropertyType;
  operation: OperationType;
  studentId: string;
  studentName: string;
  surfaceM2: number;
  location: string;
  imageUrl: string;
  landPercentage: number;
  basePrice: number;
  ivaAmount: number;
  totalPrice: number;
  purchaseDate: string;
  paymentMethod: 'contado' | 'aplazado_pagare' | 'aplazado_letra' | 'aplazado_cuotas' | string;
  monthlyRent?: number;
  nextRentDueDate?: string;
  depositPaid?: number;
  downPaymentPaid?: number;
  pendingBalance?: number;
  address?: string;
  municipality?: string;
  [key: string]: any;
}

export interface PaymentObligation {
  id: string;
  acquisitionId: string;
  studentId: string;
  studentName: string;
  propertyTitle: string;
  type: 'pagare' | 'letra_cambio' | 'cuota_alquiler' | 'cuota_compra' | string;
  amount: number;
  dueDate: string;
  status: 'pendiente' | 'pagado' | 'vencido' | string;
  paidDate?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  penaltyInterest?: number;
  totalOverdueAmount?: number;
}

export interface LoanCollateral {
  type: 'property' | 'private_residence' | string;
  propertyId?: string;
  propertyTitle?: string;
  surfaceM2: number;
  appraisalValue: number;
}

export interface MachineryLineOption {
  id: string;
  title?: string;
  label?: string;
  lathesCount?: number;
  capacityUnitsPerHour?: number;
  productionCapacityUnitsPerHour?: number;
  basePrice: number;
}

export type MachineryOption = MachineryLineOption;

export interface MachineryItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'metal_hierro' | 'plastico_montaje' | 'plastico_ensamblaje' | string;
  description: string;
  equipmentList?: string[];
  equipment?: string[];
  requiredSurfaceM2?: number;
  totalRequiredM2?: number;
  rawMaterialWarehouseM2?: number;
  finishedProductWarehouseM2?: number;
  productionFloorM2?: number;
  warehousesM2?: number;
  requiredStaff?: number;
  requiredPowerKW?: number;
  basePrice?: number;
  imageUrl?: string;
  options?: MachineryLineOption[];
  [key: string]: any;
}

export interface MachineryAcquisition {
  id: string;
  machineryId: string;
  lineTitle?: string;
  title?: string;
  optionTitle?: string;
  category: 'metal_hierro' | 'plastico_montaje' | 'plastico_ensamblaje' | string;
  studentId: string;
  studentName: string;
  basePrice: number;
  financedPrice?: number;
  deferredPrice?: number;
  ivaAmount: number;
  totalPrice: number;
  downPaymentPaid: number;
  pendingBalance: number;
  paymentMethod: 'contado' | 'aplazado_pagares' | string;
  installmentsCount?: number;
  installmentCount?: number;
  purchaseDate: string;
  assemblyDays?: number;
  assemblyEndDate?: string;
  assemblyFinishDate?: string;
  status: 'en_montaje' | 'operativa' | 'montaje' | string;
  installedAtNaveId?: string;
  installedAtNaveTitle?: string;
  installedNaveId?: string;
  installedNaveTitle?: string;
  installationNaveTitle?: string;
  requiredStaff?: number;
  requiredPowerKW?: number;
  powerKw?: number;
  lathesCount?: number;
  productionCapacityUnitsPerHour?: number;
  equipmentList?: string[];
  equipment?: string[];
  imageUrl?: string;
  relocationInvoice?: RelocationInvoice;
  relocationInvoices?: RelocationInvoice[];
  [key: string]: any;
}

export interface RelocationInvoice {
  id?: string;
  invoiceNumber: string;
  issueDate: string;
  studentId: string;
  studentName?: string;
  companyName?: string;
  cifNif?: string;
  machineryId: string;
  machineryTitle: string;
  sourceNaveId?: string;
  sourceNaveTitle?: string;
  sourceLocation?: string;
  targetNaveId?: string;
  targetNaveTitle?: string;
  targetLocation?: string;
  distanceKm: number;
  disassemblyFee: number;
  reassemblyFee: number;
  transportFee: number;
  subtotal: number;
  ivaRate: number;
  ivaAmount: number;
  totalAmount: number;
  status: string;
  paymentMethod: string;
}

export interface AmortizationRow {
  period: number;
  dueDate: string;
  payment: number;
  interest: number;
  principal: number;
  totalAmortized: number;
  pendingBalance: number;
  paid: boolean;
  paidDate?: string;
  isOverdue?: boolean;
  penaltyInterest?: number;
}

export interface UpcomingPaymentItem {
  id: string;
  sourceType: 'obligation' | 'loan' | string;
  type: 'pagare' | 'letra_cambio' | 'cuota_alquiler' | 'cuota_compra' | 'cuota_prestamo' | string;
  title: string;
  concept: string;
  dueDate: string;
  principalAmount: number;
  penaltyInterest: number;
  totalAmount: number;
  isOverdue: boolean;
  daysRemaining: number;
  installmentInfo?: string;
  loanId?: string;
}

export type LoanStatus = 
  | 'offered'          
  | 'pending_teacher'  
  | 'teacher_offered'  
  | 'active'           
  | 'rejected'         
  | 'denied_teacher'   
  | 'paid_off'
  | string;

export interface BankLoan {
  id: string;
  studentId: string;
  studentName: string;
  studentAccount: string;
  requestedAmount: number;
  offeredAmount: number;
  approvedAmount?: number;
  termMonths: number;
  annualInterestRate: number;
  euriborRate: number;
  spread: number;
  openingFee: number;
  monthlyPayment: number;
  collateral: LoanCollateral;
  status: LoanStatus;
  requiresTeacherApproval: boolean;
  teacherNotes?: string;
  createdAt: string;
  acceptedAt?: string;
  schedule: AmortizationRow[];
}

export type RawMaterialType = 'hierro' | 'metal' | 'plastico' | 'epoxi' | 'producto_final' | 'transporte' | 'combustible';

export interface PriceAlertFeedback {
  id: string;
  message: string;
  suggestedPrice?: number;
  timestamp: string;
  active: boolean;
  authorName?: string;
}

export interface RawMaterialAnnouncement {
  id: string;
  materialType: RawMaterialType;
  title: string;
  presentation: string;
  unitWeightKg: number;
  isPallet: boolean;
  pricePerUnit: number;
  description: string;
  updatedAt: string;
  durationDays?: number | 'indefinido';
  expirationDate?: string;
  stock?: number | 'ilimitado';
  active?: boolean;
  sellerId?: string;
  sellerName?: string;
  sellerLevel?: number | 'official';
  sellerLocation?: string;
  sellerMunicipality?: string;
  sellerProvince?: string;
  isDesTornillo?: boolean;
  priceAlert?: PriceAlertFeedback;
}

export interface RawMaterialOrderItem {
  announcementId: string;
  materialType?: RawMaterialType;
  materialTitle?: string;
  title?: string;
  quantity: number;
  unitWeightKg?: number;
  totalKg?: number;
  basePrice?: number;
  unitPrice?: number;
  subtotal?: number;
  totalCost?: number;
}

export interface NegotiationHistoryEntry {
  id: string;
  authorId: string;
  authorName: string;
  timestamp: string;
  action: 'propuesta_inicial' | 'contraoferta' | 'aceptado' | 'rechazado';
  quantity: number;
  pricePerUnit: number;
  discountPercentage: number;
  insuranceFee: number;
  transportCost: number;
  distanceKm?: number;
  chargedPallets?: number;
  transportMethod: 'vendedor_envio' | 'comprador_recogida';
  totalAmount: number;
  note?: string;
}

export interface RawMaterialOrder {
  id: string;
  studentId: string;
  studentName: string;
  buyerLevel?: number;
  sellerId?: string;
  sellerName?: string;
  sellerLevel?: number | 'official';
  announcementId: string;
  materialType: RawMaterialType;
  materialTitle: string;
  quantity: number;
  unitWeightKg: number;
  totalKg: number;
  basePrice: number;
  taxableBase?: number;
  discountPercentage?: number;
  discountAmount?: number;
  insuranceFee?: number;
  insuranceCost?: number;
  hasInsurance?: boolean;
  ivaAmount: number;
  transportCost: number;
  distanceKm?: number;
  chargedPallets?: number;
  transportMethod?: 'vendedor_envio' | 'comprador_recogida';
  totalAmount: number;
  needsTransport: boolean;
  deliveryAddress: string;
  pickupVehicleId?: string;
  status: 'pendiente' | 'en_negociacion' | 'aprobado' | 'en_transito' | 'entregado' | 'rechazado' | 'finalizado' | 'facturado';
  requestedAt: string;
  approvedAt?: string;
  shippedAt?: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
  invoicedAt?: string;
  invoiceNumber?: string;
  rejectionReason?: string;
  estimatedDeliveryDays?: number;
  items?: RawMaterialOrderItem[];
  lastTurnUserId?: string;
  negotiationHistory?: NegotiationHistoryEntry[];
  inventoryCredited?: boolean;
  destinationNaveId?: string;
  note?: string;
  isDirectMessageInvoice?: boolean;
  isChatInvoice?: boolean;
  source?: string;
  subtotalAmount?: number;
  vatRate?: number;
  vatAmount?: number;
  unitPrice?: number;
}

export interface PromissoryNoteData {
  id?: string;
  obligationId?: string;
  promissoryNoteNumber: string; // e.g. "PAG-2026-8492"
  concept: string; // Operación origen / Factura vinculada
  amount: number;
  amountInWords: string;
  issueDate: string; // Fecha de libramiento/emisión
  issuePlace: string; // Lugar de emisión (ej. "Madrid")
  dueDate: string; // Fecha de vencimiento
  daysTerm?: number; // Plazo en días (30, 60, 90, 120...)
  orderType: 'no_a_la_orden' | 'a_la_orden'; // Cláusula cambiaria
  
  // Tomador / Beneficiario (Vendedor)
  beneficiaryId: string;
  beneficiaryName: string;
  beneficiaryNifCif?: string;
  beneficiaryLevel?: number | string;
  
  // Firmante / Librador / Deudor (Comprador)
  issuerId: string;
  issuerName: string;
  issuerNifCif?: string;
  issuerAddress?: string;
  issuerLevel?: number | string;
  
  // Domiciliación Bancaria
  bankName: string;
  bankIban: string;
  
  // Firma electrónica
  signatureTimestamp: string;
  signatureHash: string;
  status: 'pendiente' | 'descontado' | 'gestion_cobro' | 'pagado' | 'impagado' | 'anulado';
  paidAt?: string;
  paidTransferId?: string;
  collectRequested?: boolean;
  collectRequestedAt?: string;

  // Descuento bancario de pagarés
  isDiscounted?: boolean;
  discountedAt?: string;
  discountDays?: number;
  discountRate?: number; // 6% anual nominal
  discountInterest?: number; // Intereses descontados
  discountCommissionRate?: number; // 0.5% sobre nominal
  discountCommission?: number; // Importe de la comisión de apertura/descuento
  discountNetReceived?: number; // Líquido abonado en cuenta al vendedor
  discountTransferId?: string;

  // Gestión de cobro bancario
  isCollectionManagement?: boolean;
  collectionManagementAt?: string;
  collectionCommissionRate?: number; // 0.5% sobre nominal (mínimo 20 €)
  collectionCommission?: number;
  collectionTransferId?: string;
  collectionAutoCollectedAt?: string;
  collectionUnpaidFeeAmount?: number; // 40 € en caso de impago

  // Gestión al vencimiento
  maturityProcessed?: boolean;
  unpaidReturnedAt?: string;
  unpaidFeeRate?: number; // 1%
  unpaidFeeAmount?: number;
  unpaidNominalReimbursed?: number;
  unpaidTotalDebited?: number;
  unpaidReturnTransferId?: string;
  unpaidFeeTransferId?: string;
}

export interface MarketMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  content: string;
  timestamp: string;
  read?: boolean;
  type?: 'text' | 'invoice' | 'promissory_note';
  invoiceData?: {
    id?: string;
    orderId?: string;
    invoiceNumber: string;
    concept: string;
    items: Array<{
      title: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    itemsSubtotal?: number;
    taxableBase: number;
    discountAmount?: number;
    transportCost?: number;
    insuranceFee?: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    issuedAt: string;
    sellerId: string;
    sellerName: string;
    sellerLevel?: number | string;
    buyerId: string;
    buyerName: string;
    buyerLevel?: number | string;
    deliveryAddress?: string;
    paymentMethod?: string;
    status?: 'facturado' | 'cobrado';
  };
  promissoryNoteData?: PromissoryNoteData;
}

export interface TradingPartner {
  id: string;
  name: string;
  username: string;
  role: string;
  level: number | string;
  levelName: string;
  canBuyFromMe: boolean;
  canSellToMe: boolean;
  canTrade: boolean;
  unreadCount?: number;
  lastMessageTimestamp?: string | null;
  lastMessageContent?: string | null;
  contactTimestamp?: string | null;
}

export interface MarketInvoice {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  sellerId: string;
  sellerName: string;
  sellerAccount?: string;
  buyerId: string;
  buyerName: string;
  buyerAccount?: string;
  orderId: string;
  concept: string;
  items: Array<{
    title: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  taxableBase: number;
  discountAmount: number;
  transportCost: number;
  insuranceFee: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  paymentMethod: string;
  status: 'facturado' | 'cobrado';
}

export interface AppNotification {
  id: string;
  userId: string;
  userName?: string;
  title: string;
  message: string;
  type: 'order_received' | 'order_negotiating' | 'order_approved' | 'order_rejected' | 'announcement_new' | 'transfer_received' | 'court_lawsuit' | string;
  read: boolean;
  createdAt: string;
  relatedOrderId?: string;
  relatedAnnouncementId?: string;
}

export interface RawMaterialNaveInventory {
  ironKg: number;
  metalKg?: number;
  plasticKg: number;
  epoxiKg: number;
  rodProductionMode?: 'estrella' | 'plana' | null;
  producedRodsUnits?: number;
  producedStarRodsUnits?: number;
  producedFlatRodsUnits?: number;
  producedScrewdriversUnits?: number;
  starScrewdriversUnits?: number;
  flatScrewdriversUnits?: number;
  ironScrewdriversUnits?: number;
  metalScrewdriversUnits?: number;
}

export interface RawMaterialInventory {
  studentId: string;
  ironKg: number;
  metalKg?: number;
  plasticKg: number;
  epoxiKg: number;
  rodProductionMode?: 'estrella' | 'plana' | null;
  producedRodsUnits: number;
  producedStarRodsUnits?: number;
  producedFlatRodsUnits?: number;
  producedIronRodsUnits?: number;
  producedMetalRodsUnits?: number;
  producedScrewdriversUnits: number;
  starScrewdriversUnits?: number;
  flatScrewdriversUnits?: number;
  ironScrewdriversUnits?: number;
  metalScrewdriversUnits?: number;
  line1PendingHours?: number;
  line2PendingHours?: number;
  naveInventories?: { [naveId: string]: RawMaterialNaveInventory };
  lastCalculatedAt: string;
  updatedAt: string;
}

export interface CompanyProfile {
  id: string;
  studentId: string;
  companyName: string;
  description: string;
  logoUrl?: string;
  level: number;
  updatedAt: string;
}

export interface MarketContact {
  id: string;
  userId: string;
  contactId: string;
  createdAt: string;
}

export interface DatabaseSchema {
  users: User[];
  transfers: Transfer[];
  systemLogs: SystemLog[];
  properties: PropertyListing[];
  acquisitions: PropertyAcquisition[];
  paymentObligations: PaymentObligation[];
  loans: BankLoan[];
  machineryAcquisitions?: MachineryAcquisition[];
  jobListings?: JobListing[];
  hiredEmployees?: HiredEmployee[];
  payrollRecords?: PayrollRecord[];
  taxObligations?: TaxObligation[];
  electricityContracts?: ElectricityContract[];
  electricityBills?: ElectricityBill[];
  naveFloorPlans?: NaveFloorPlan[];
  telecomContracts?: TelecomContract[];
  telecomInvoices?: TelecomInvoice[];
  officeOrders?: OfficePurchaseOrder[];
  relocationInvoices?: RelocationInvoice[];
  purchasedVehicles?: PurchasedVehicle[];
  unifiedMonthlyInvoices?: UnifiedMonthlyInvoice[];
  rawMaterialAnnouncements?: RawMaterialAnnouncement[];
  rawMaterialOrders?: RawMaterialOrder[];
  rawMaterialInventories?: RawMaterialInventory[];
  marketMessages?: MarketMessage[];
  companyProfiles?: CompanyProfile[];
  marketContacts?: MarketContact[];
  courtLawsuits?: CourtLawsuit[];
  notifications?: AppNotification[];
  defaultInitialBalance: number;
  isSeed?: boolean;
}

export interface ElectricityContract {
  id: string;
  studentId: string;
  studentName: string;
  propertyId?: string;
  propertyTitle?: string;
  contractedPowerKw: number;
  tariffName: string;
  pricePerKwDay: number;
  pricePerKwh: number;
  status: 'active' | 'cancelled';
  contractDate: string;
  cupsCode: string;
}

export interface ElectricityPropertyBreakdown {
  propertyId: string;
  propertyTitle: string;
  propertyType: string;
  surfaceM2: number;
  machineryCount: number;
  activeShifts: number;
  kwhMachinery: number;
  kwhLighting: number;
  kwhComputers: number;
  kwhHvac: number;
  totalKwh: number;
  kwPowerEstimate: number;
  costEstimate: number;
}

export interface ElectricityBill {
  id: string;
  studentId: string;
  studentName: string;
  contractId: string;
  billNumber: string;
  periodMonth: number;
  periodYear: number;
  startDate: string;
  endDate: string;
  daysCount: number;
  contractedPowerKw: number;
  pricePerKwDay: number;
  powerAmount: number;
  totalKwh: number;
  pricePerKwh: number;
  energyAmount: number;
  equipmentRental: number;
  taxableBase: number;
  electricityTax: number;
  subtotalWithTax: number;
  ivaRate: number;
  ivaAmount: number;
  totalAmount: number;
  dueDate: string;
  status: 'pendiente' | 'pagado';
  paidDate?: string;
  createdAt: string;
  cupsCode: string;
  companyName?: string;
  cifNif?: string;
  propertyBreakdown?: ElectricityPropertyBreakdown[];
}

export interface NaveFloorPlan {
  id: string;
  propertyId: string;
  acquisitionId?: string;
  propertyTitle?: string;
  studentId: string;
  machineryZoneM2: number;
  storageZoneM2: number;
  rawMaterialsStorageM2?: number;
  semiFinishedStorageM2?: number;
  finishedGoodsStorageM2?: number;
  adminZoneM2: number;
  freeZoneM2: number;
  warehousesCount: number;
  updatedAt: string;
}

export type JobRole = 'operario' | 'camionero' | 'carretillero' | 'mozo_almacen';

export interface JobListing {
  id: string;
  title: string;
  role?: JobRole;
  employeeName: string;
  gender: 'hombre' | 'mujer';
  grossSalaryMonthly: number;
  age: number;
  status: 'disponible' | 'contratado';
  hiredByStudentId?: string;
  hiredByStudentName?: string;
  hiredAtDate?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface HiredEmployee {
  id: string;
  jobListingId: string;
  studentId: string;
  studentName: string;
  employeeName: string;
  role?: JobRole;
  gender: 'hombre' | 'mujer';
  grossSalaryMonthly: number;
  age: number;
  hireDate: string;
  assignedMachineryId?: string;
  assignedMachineryTitle?: string;
  assignedVehicleId?: string;
  assignedVehicleTitle?: string;
  assignedWarehouseIndex?: number;
  shift?: number;
  avatarUrl?: string;
}

export interface PurchasedVehicle {
  id: string;
  studentId: string;
  studentName: string;
  vehicleType: 'camion_trailer' | 'carretilla_elevadora' | 'coche_empresa';
  title: string;
  basePrice: number;
  ivaAmount: number;
  totalPrice: number;
  paymentMethod: 'contado' | 'aplazado';
  purchaseDate: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedShift?: number;
  assignedWarehouseIndex?: number;
  assignedPropertyId?: string;
  assignedPropertyTitle?: string;
  assignedWarehouseName?: string;
  status: 'activo' | 'mantenimiento';
  imageUrl: string;
}

export interface UnifiedInvoiceItem {
  category: 'telecom' | 'electricity' | 'office' | 'deferred_payment' | 'other';
  title: string;
  concept: string;
  baseAmount: number;
  ivaAmount: number;
  totalAmount: number;
}

export interface UnifiedMonthlyInvoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  cifNif: string;
  periodMonth: number;
  periodYear: number;
  issueDate: string;
  dueDate: string;
  paidDate: string;
  items: UnifiedInvoiceItem[];
  subtotalBase: number;
  totalIva: number;
  grandTotal: number;
  paymentMethod: string;
  status: 'pagado';
}

export interface EmployeePayrollBreakdown {
  employeeId: string;
  employeeName: string;
  grossSalary: number;
  employeeSS: number;
  employeeIRPF: number;
  netSalary: number;
  companySS: number;
  isProportional?: boolean;
  workedDays?: number;
  totalMonthDays?: number;
  transferId?: string;
  paidAt?: string;
}

export interface PayrollRecord {
  id: string;
  studentId: string;
  studentName: string;
  payrollDate: string;
  periodMonth: number;
  periodYear: number;
  employeeCount: number;
  totalGrossSalary: number;
  totalEmployeeSS: number;
  totalEmployeeIRPF: number;
  totalNetSalaryPaid: number;
  totalCompanySS: number;
  isProportional: boolean;
  status: 'paid';
  createdAt: string;
  paidEmployeeIds?: string[];
  employeeBreakdown?: EmployeePayrollBreakdown[];
}

export interface TaxObligation {
  id: string;
  studentId: string;
  studentName: string;
  type: 'irpf' | 'ss_employee' | 'ss_company';
  concept: string;
  amount: number;
  dueDate: string;
  status: 'pendiente' | 'pagado';
  paidDate?: string;
  payrollRecordId?: string;
}

// Telecom / Phone & Internet Types
export interface TelecomPlan {
  id: string;
  name: string;
  provider: string;
  monthlyPrice: number;
  speedMbps: number;
  mobileLinesCount: number;
  includesStaticIP: boolean;
  includesSwitchboard: boolean;
  includes5G: boolean;
  slaHours: number;
  description: string;
  features: string[];
  imageUrl?: string;
}

export interface TelecomContract {
  id: string;
  studentId: string;
  studentName: string;
  planId: string;
  planName: string;
  provider: string;
  propertyId?: string;
  propertyTitle?: string;
  monthlyPrice: number;
  contractDate: string;
  phoneNumber?: string;
  status: 'active' | 'cancelled';
  speedMbps?: number;
  mobileLinesCount?: number;
}

export interface TelecomInvoiceItem {
  concept: string;
  amount: number;
}

export interface TelecomInvoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  companyName?: string;
  nifCif?: string;
  contractId: string;
  planName: string;
  provider: string;
  periodMonth: number;
  periodYear: number;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  ivaRate: number;
  ivaAmount: number;
  totalAmount: number;
  status: 'pagado' | 'pendiente';
  paidDate?: string;
  items: TelecomInvoiceItem[];
  paymentMethod?: string;
}

// Office Supplies & Equipment Store Types ("Muebles e Informática")
export type OfficeStoreCategory = 
  | 'estanterias' 
  | 'mesas' 
  | 'sillas' 
  | 'sobremesa' 
  | 'portatiles' 
  | 'perifericos' 
  | 'impresoras' 
  | 'software_texto' 
  | 'software_conta' 
  | 'telefonos_fijos' 
  | 'telefonos_moviles';

export interface OfficeStoreItem {
  id: string;
  name: string;
  category: OfficeStoreCategory;
  categoryLabel: string;
  price: number;
  description: string;
  specs: string[];
  imageUrl: string;
  stock?: number;
}

export interface OfficePurchaseOrderItem {
  itemId: string;
  itemName: string;
  category: OfficeStoreCategory;
  categoryLabel: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  imageUrl?: string;
}

export interface OfficePurchaseOrder {
  id: string;
  orderNumber: string;
  studentId: string;
  studentName: string;
  companyName?: string;
  nifCif?: string;
  purchaseDate: string;
  items: OfficePurchaseOrderItem[];
  subtotal: number;
  ivaRate: number;
  ivaAmount: number;
  totalAmount: number;
  status: 'completado_pagado';
  paymentMethod: 'banco' | string;
}

export type CourtLawsuitType = 'ordinaria' | 'cambiaria';

export type CourtLawsuitSubtype = 
  | 'incumplimiento_pago' 
  | 'incumplimiento_entrega' 
  | 'impago_pagare';

export type CourtLawsuitStatus = 
  | 'pendiente_admision'
  | 'admitida' 
  | 'inadmitida'
  | 'embargo_preventivo'
  | 'en_tramite' 
  | 'requerimiento_pago' 
  | 'allanada_pagada' 
  | 'estimada'
  | 'ejecutada' 
  | 'desestimada';

export interface CourtAttachment {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
  docType?: string;
}

export interface CourtLawsuit {
  id: string;
  caseNumber: string;
  courtName: string;
  type: CourtLawsuitType;
  subtype: CourtLawsuitSubtype;
  plaintiffId: string;
  plaintiffName: string;
  plaintiffNif?: string;
  plaintiffIban?: string;
  defendantId: string;
  defendantName: string;
  defendantNif?: string;
  defendantIban?: string;
  claimedAmount: number;
  interestAndCostsAmount: number;
  totalClaimAmount: number;
  contractDate?: string;
  goodsDescription: string;
  facts: string;
  legalBasis: string;
  petitum: string;
  evidenceSummary: string;
  attachments?: CourtAttachment[];
  relatedOrderId?: string;
  promissoryNoteNumber?: string;
  promissoryNoteId?: string;
  promissoryNoteDueDate?: string;
  promissoryNoteData?: PromissoryNoteData;
  status: CourtLawsuitStatus;
  createdAt: string;
  updatedAt: string;
  admissionDate?: string;
  admissionNotes?: string;
  resolutionDate?: string;
  resolutionNotes?: string;
  judgeComments?: string;
  executionTransferId?: string;
  lawyerFeeAmount?: number;
  lawyerFeeIva?: number;
  lawyerFeeTotal?: number;
  lawyerFeeInvoiceNumber?: string;
  embargoDate?: string;
  embargoAmount?: number;
  embargoTransferId?: string;
  embargoNotes?: string;
  defendantAnswered?: boolean;
  defendantAnswerDate?: string;
  defendantAnswerType?: 'ordinaria_contestacion' | 'cambiaria_ya_pagado' | 'cambiaria_paga_ahora';
  defendantAnswerFacts?: string;
  defendantAnswerAttachments?: CourtAttachment[];
  defendantDeadlineDate?: string;
  defendantLawyerFeeAmount?: number;
  defendantLawyerFeeIva?: number;
  defendantLawyerFeeTotal?: number;
  defendantLawyerFeeInvoiceNumber?: string;
  costsPaid?: number;
  costsTransferId?: string;
}


