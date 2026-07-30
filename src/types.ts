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
  [key: string]: any;
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
  purchasedVehicles?: PurchasedVehicle[];
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
  adminZoneM2: number;
  freeZoneM2: number;
  warehousesCount: number;
  updatedAt: string;
}

export type JobRole = 'operario' | 'camionero' | 'carretillero';

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
  status: 'activo' | 'mantenimiento';
  imageUrl: string;
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

