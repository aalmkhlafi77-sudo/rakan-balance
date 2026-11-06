/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Core Domain Types & Future Contracts
 */

export type EntryType = 'owedByAccount' | 'owedToAccount';

export type AccountStatus = 'active' | 'archived';

export type TransferRole = 'source' | 'destination';

export interface InterAccountTransferInput {
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;
  date: string;
  description: string;
  notes?: string;
  isDemo?: boolean;
}

export interface InterAccountTransferMeta {
  transferId: string;
  transferRole: TransferRole;
  counterpartyAccountId: string;
}

/**
 * Core Account Entity
 * Follows Document v2 Section 5 & 15
 */
export interface AccountModel {
  id: string;
  name: string;
  parentId: string | null;
  categoryId: string;
  openingBalanceMinor: number; // Signed integer (halalas)
  status: AccountStatus;
  phone?: string;
  notes?: string; // Private account notes (strictly hidden from statements, lists, CSVs, and global search)
  isDemo?: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Account Category
 */
export interface CategoryModel {
  id: string;
  name: string;
  sortOrder: number;
  isDemo?: boolean;
}

/**
 * Financial Movement / Transaction
 * Follows Document v2 Section 3: A transaction links to ONE account only
 * owedByAccount = +amountMinor (عليه - يزيد الرصيد)
 * owedToAccount = -amountMinor (له - ينقص الرصيد)
 * For inter-account transfers:
 * - Source account: owedToAccount (-amountMinor) reduces debt
 * - Destination account: owedByAccount (+amountMinor) increases debt
 */
export interface TransactionModel {
  id: string;
  accountId: string;
  entryType: EntryType;
  amountMinor: number; // Positive integer > 0 (halalas)
  date: string; // YYYY-MM-DD
  description: string;
  notes?: string;
  attachmentIds: string[];
  isDemo?: boolean;
  transferId?: string;
  transferRole?: TransferRole;
  counterpartyAccountId?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Transaction Attachment Entity
 */
export interface AttachmentModel {
  id: string;
  transactionId: string;
  originalName: string;
  mimeType: string;
  size: number; // bytes
  dataUrl: string; // Base64 data URL
  createdAt: string;
}

/**
 * Independent Sticky Note
 * Zero impact on finances
 */
export interface StickyNoteModel {
  id: string;
  title: string;
  content: string;
  color: 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'slate';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * User Settings Entity
 * Single owner, single local currency
 */
export interface UserSettings {
  ownerName: string;
  currencyCode: 'SAR';
  currencySymbol: string; // 'ر.س'
  currencyDecimals: number; // 2
  pinCodeHash: string | null; // Salted SHA-256 or null if no lock
  pinSalt: string | null;
  isLocked: boolean;
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  activeScope: 'real' | 'demo'; // Workspace isolation
}

/**
 * Statement Calculation Row
 */
export interface StatementRow {
  transaction: TransactionModel;
  signedAmountMinor: number;
  runningBalanceMinor: number;
}

/**
 * Backup File Manifest
 * Follows Document v2 Section 6 & 15
 */
export interface BackupManifest {
  formatName: 'RAKAN_BALANCE_BACKUP';
  backupFormatVersion: 2;
  schemaVersion: 2;
  exportedAt: string;
  appName: string;
  checksum: string; // SHA-256 of payload
  recordCounts: {
    accounts: number;
    categories: number;
    transactions: number;
    attachments: number;
    notes: number;
  };
}

export interface BackupBundle {
  manifest: BackupManifest;
  data: {
    accounts: AccountModel[];
    categories: CategoryModel[];
    transactions: TransactionModel[];
    attachments: AttachmentModel[];
    notes: StickyNoteModel[];
    dues?: DueItemContract[];
    allocations?: PaymentAllocationContract[];
    reminders?: ReminderContract[];
    settings?: Partial<UserSettings>;
  };
}

/**
 * =========================================================================
 * FUTURE EXPANSION SEAMS (N1 & N2 Contracts)
 * Document v2 Section 15 & 18: Defined contracts for future phases.
 * Kept strictly as architectural boundaries in N0 without phantom UI stubs.
 * =========================================================================
 */

/** N2: a due item is a non-financial follow-up record, not a ledger movement. */
export interface DueItemContract {
  id: string;
  accountId: string;
  sourceTransactionId?: string;
  entryType: EntryType;
  dueDate: string;
  originalAmountMinor: number;
  settledAmountMinor: number;
  status: 'pending' | 'partially_settled' | 'settled' | 'overdue';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** N2: allocation only references an existing financial movement (never creates a second one). */
export interface PaymentAllocationContract {
  id: string;
  dueItemId: string;
  paymentTransactionId: string;
  amountMinor: number;
}

/** N2: manual reminder without automatic messaging or device notification. */
export interface ReminderContract {
  id: string;
  dueItemId: string;
  remindAt: string;
  templateText: string;
  isCompleted: boolean;
  channel?: 'manual';
}
