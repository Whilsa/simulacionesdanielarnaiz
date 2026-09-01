/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, InitialUserSeedConfig, DatabaseSchema } from '../types.js';

/**
 * Standardized Central Seed Configuration for All Initial Users
 */
export const STANDARDIZED_SEED_USERS: User[] = [
  {
    id: 'profesor-1',
    name: 'Profesor de Contabilidad',
    username: 'pupdaniel',
    password: '1987',
    role: 'teacher',
    accountNumber: 'ES000000000000000000',
    balance: 0,
    initialBalance: 0,
    level: 1,
    companyName: 'Administración Docente',
    nifCif: 'P00000000',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-tie33g796',
    name: 'Tododestornilladores, S.A.',
    username: 'cliente01',
    password: '1987',
    role: 'student',
    accountNumber: 'ES36000100029058060348',
    balance: 260959.17,
    initialBalance: 260959.17,
    level: 1,
    companyName: 'Tododestornilladores, S.A.',
    nifCif: 'A36000100',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-wu3u6x6zz',
    name: 'Productora Varillas, S.A.',
    username: 'cliente02',
    password: '1987',
    role: 'student',
    accountNumber: 'ES38000100022204910071',
    balance: 30080.42,
    initialBalance: 30080.42,
    level: 1,
    companyName: 'Productora Varillas, S.A.',
    nifCif: 'A38000100',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-yqafq0s1b',
    name: 'Destornilladores S.A.',
    username: 'cliente03',
    password: '1987',
    role: 'student',
    accountNumber: 'ES50000100021406089898',
    balance: -32593.53,
    initialBalance: -32593.53,
    level: 1,
    companyName: 'Destornilladores S.A.',
    nifCif: 'A50000100',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-3p8azs8z1',
    name: 'Destornilladores Por Mayor S.A.',
    username: 'cliente04',
    password: '1987',
    role: 'student',
    accountNumber: 'ES51000100024856898921',
    balance: 151565.00,
    initialBalance: 151565.00,
    level: 1,
    companyName: 'Destornilladores Por Mayor S.A.',
    nifCif: 'A51000100',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-n4szf2cvx',
    name: 'Leroy Merlin, S.A.',
    username: 'cliente05',
    password: '1987',
    role: 'student',
    accountNumber: 'ES23000100023677414359',
    balance: 186720.75,
    initialBalance: 186720.75,
    level: 1,
    companyName: 'Leroy Merlin, S.A.',
    nifCif: 'A23000100',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-26iyne9mz',
    name: 'Minorista',
    username: 'cliente06',
    password: '1987',
    role: 'student',
    accountNumber: 'ES82000100022178917770',
    balance: 57335.36,
    initialBalance: 57335.36,
    level: 1,
    companyName: 'Minorista S.L.',
    nifCif: 'B82000100',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'user-4rd635i0n',
    name: 'Fabricante',
    username: 'cliente07',
    password: '1987',
    role: 'student',
    accountNumber: 'ES41000100029262515901',
    balance: 60000.00,
    initialBalance: 60000.00,
    level: 1,
    companyName: 'Fabricante Industrial S.A.',
    nifCif: 'A41000100',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'alumno-1',
    name: 'Ana López',
    username: 'ana',
    password: '123',
    role: 'student',
    accountNumber: 'ES910001000212345678',
    balance: 1000.00,
    initialBalance: 1000.00,
    level: 1,
    companyName: 'Ana López',
    nifCif: '91234567A',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'alumno-2',
    name: 'Carlos Ruiz',
    username: 'carlos',
    password: '123',
    role: 'student',
    accountNumber: 'ES910001000287654321',
    balance: 1000.00,
    initialBalance: 1000.00,
    level: 1,
    companyName: 'Carlos Ruiz',
    nifCif: '91876543B',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'alumno-3',
    name: 'Beatriz Gómez',
    username: 'beatriz',
    password: '123',
    role: 'student',
    accountNumber: 'ES910001000244556677',
    balance: 1000.00,
    initialBalance: 1000.00,
    level: 1,
    companyName: 'Beatriz Gómez',
    nifCif: '91445566C',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];

export const INITIAL_USERS: InitialUserSeedConfig[] = STANDARDIZED_SEED_USERS.map(u => ({
  id: u.id,
  username: u.username || '',
  password: u.password,
  name: u.name,
  role: u.role,
  accountNumber: u.accountNumber,
  balance: u.balance,
  level: u.level,
  companyName: u.companyName,
  nifCif: u.nifCif
}));

/**
 * Standardize any arbitrary user object to conform to the canonical User structure.
 */
export function standardizeUserObject(raw: Partial<User> & { alumno?: string; saldo?: number | string; usuario?: string; account_number?: string }): User {
  const id = String(raw.id || `user-${Date.now()}`);
  const name = String(raw.name || raw.alumno || 'Usuario');
  const role: 'student' | 'teacher' = raw.role === 'teacher' || id === 'profesor-1' ? 'teacher' : 'student';
  const balance = Number(raw.balance !== undefined ? raw.balance : raw.saldo !== undefined ? raw.saldo : 1000);
  const initialBalance = Number(raw.initialBalance !== undefined ? raw.initialBalance : balance);
  const username = String(raw.username || raw.usuario || name.toLowerCase().replace(/[^a-z0-9]/gi, '')).trim();
  const password = String(raw.password || (role === 'teacher' ? '1987' : '123'));
  const accountNumber = String(raw.accountNumber || raw.account_number || `ES9100010002${Math.floor(10000000 + Math.random() * 90000000)}`);
  const level: 1 | 2 | 3 = (raw.level === 2 || raw.level === 3) ? raw.level : 1;
  const companyName = raw.companyName || name;
  const nifCif = raw.nifCif || (role === 'teacher' ? 'P00000000' : 'B' + accountNumber.slice(-8));

  return {
    id,
    name,
    username,
    password,
    role,
    accountNumber,
    balance: Number.isFinite(balance) ? balance : 0,
    initialBalance: Number.isFinite(initialBalance) ? initialBalance : balance,
    level,
    companyName,
    nifCif,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString()
  };
}

/**
 * Return cloned list of all standardized seed users
 */
export function getStandardizedInitialUsers(): User[] {
  return JSON.parse(JSON.stringify(STANDARDIZED_SEED_USERS));
}
