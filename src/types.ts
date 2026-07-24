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
  defaultInitialBalance: number;
  isSeed?: boolean;
}
