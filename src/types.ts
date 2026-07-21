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

export interface DatabaseSchema {
  users: User[];
  transfers: Transfer[];
  systemLogs: SystemLog[];
  defaultInitialBalance: number;
  isSeed?: boolean;
}
