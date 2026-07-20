import { pgTable, text, doublePrecision, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull(), // 'teacher' | 'student'
  name: text('name').notNull(),
  accountNumber: text('account_number').notNull().unique(),
  balance: doublePrecision('balance').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const transfers = pgTable('transfers', {
  id: text('id').primaryKey(),
  senderId: text('sender_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  senderName: text('sender_name').notNull(),
  senderAccount: text('sender_account').notNull(),
  receiverId: text('receiver_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  receiverName: text('receiver_name').notNull(),
  receiverAccount: text('receiver_account').notNull(),
  amount: doublePrecision('amount').notNull(),
  concept: text('concept').notNull(),
  timestamp: text('timestamp').notNull(),
});

export const systemLogs = pgTable('system_logs', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  details: text('details').notNull(),
  timestamp: text('timestamp').notNull(),
});

export const config = pgTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
