/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'teacher' | 'student';

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  name: string;
  accountNumber: string;
  balance: number;
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
  action: 'CREATE_USER' | 'UPDATE_USER' | 'DELETE_USER' | 'BALANCE_ADJUSTMENT' | 'RESET_SIMULATION' | 'LOGIN_ATTEMPT';
  details: string;
  timestamp: string;
}

export type PropertyType = 'nave_industrial' | 'almacen' | 'local_comercial';
export type OperationType = 'compra' | 'alquiler';
export type PaymentInstrument = 'pagare' | 'letra_cambio' | 'cuotas_mensuales';
export type LocationScope = 'espana' | 'comunidad' | 'municipio';

export interface DeferredPaymentConfig {
  allowed: boolean;
  minDownPaymentPercent: number; // e.g. 20%
  installmentsCount: number; // e.g. 12 months
  instrument: PaymentInstrument;
  interestRatePercent: number; // e.g. 0% or 3%
}

export interface PropertyListing {
  id: string;
  title: string;
  type: PropertyType;
  operation: OperationType;
  surfaceM2: number;
  price: number; // Base price before IVA
  pricePerM2: number;
  ivaRate: number; // e.g. 0.21 (21%)
  landPercentage: number; // 55 to 75
  locationScope: LocationScope;
  community: string;
  municipality: string;
  address: string;
  imageUrl: string;
  status: 'available' | 'sold' | 'rented';
  ownerId: string;
  ownerName: string;
  deferredPaymentConfig?: DeferredPaymentConfig;
  createdTimestamp: string;
}

export interface PropertyAcquisition {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyType: PropertyType;
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
  paymentMethod: 'contado' | 'aplazado_pagare' | 'aplazado_letra' | 'aplazado_cuotas';
  monthlyRent?: number;
  nextRentDueDate?: string;
  downPaymentPaid?: number;
  pendingBalance?: number;
}

export interface PaymentObligation {
  id: string;
  acquisitionId: string;
  studentId: string;
  studentName: string;
  propertyTitle: string;
  type: 'pagare' | 'letra_cambio' | 'cuota_alquiler' | 'cuota_compra';
  amount: number;
  dueDate: string;
  status: 'pendiente' | 'pagado' | 'vencido';
  paidDate?: string;
  installmentNumber?: number;
  totalInstallments?: number;
}

export interface DatabaseSchema {
  users: User[];
  transfers: Transfer[];
  systemLogs: SystemLog[];
  properties: PropertyListing[];
  acquisitions: PropertyAcquisition[];
  paymentObligations: PaymentObligation[];
  defaultInitialBalance: number;
  isSeed?: boolean;
}
