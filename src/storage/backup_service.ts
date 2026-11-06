/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Backup & Restore Integrity Service
 * Follows Document v2 Section 6, 14.15 & Final N0 Verification:
 * - Generates manifest with SHA-256 integrity hash
 * - Deeply inspects schema, versions, types, required fields, and relational integrity
 * - Validates foreign keys (categories, accounts, attachments) and tree cycles before allowing restore
 * - Rejects duplicate IDs, incomplete payloads, unsafe amounts, and invalid references
 * - Includes safe owner settings while strictly excluding sensitive PIN/lock secrets
 * - Triggers safe atomic restore via IndexedDB
 */

import {
  AccountModel,
  AttachmentModel,
  BackupBundle,
  BackupManifest,
  CategoryModel,
  StickyNoteModel,
  TransactionModel,
  DueItemContract,
  PaymentAllocationContract,
  ReminderContract,
  UserSettings,
} from '../domain/types.ts';
import { checkTreeCycle } from '../domain/balance_calculator.ts';
import { dbStorage, STORES_REAL } from './indexed_db.ts';
import { MAX_SAFE_MINOR_AMOUNT } from '../domain/money.ts';
import {
  getOwnerNamePref,
  getSidebarCollapsedPref,
  getThemePref,
} from './local_storage.ts';
import { validateTransferPairs } from '../domain/inter_account_transfer.ts';
import { validateDueLedger } from '../domain/dues.ts';

/**
 * Computes a standard SHA-256 checksum string for any text or payload.
 */
export async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates a complete export bundle with manifest and checksum.
 * Includes owner settings while strictly excluding sensitive authentication secrets.
 */
export async function exportBackupBundle(): Promise<{ jsonString: string; filename: string }> {
  const [accounts, categories, transactions, attachments, notes, dues, allocations, reminders] = await Promise.all([
    dbStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
    dbStorage.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
    dbStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
    dbStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
    dbStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES),
    dbStorage.getAll<DueItemContract>(STORES_REAL.DUES),
    dbStorage.getAll<PaymentAllocationContract>(STORES_REAL.ALLOCATIONS),
    dbStorage.getAll<ReminderContract>(STORES_REAL.REMINDERS),
  ]);

  // Safe non-sensitive owner settings (PIN hashes/salts are explicitly excluded)
  const safeSettings: Partial<UserSettings> = {
    ownerName: typeof window !== 'undefined' ? getOwnerNamePref() : 'راكان',
    theme: typeof window !== 'undefined' ? getThemePref() : 'dark',
    sidebarCollapsed: typeof window !== 'undefined' ? getSidebarCollapsedPref() : false,
    currencyCode: 'SAR',
    currencySymbol: 'ر.س',
    currencyDecimals: 2,
  };

  const payload = {
    accounts,
    categories,
    transactions,
    attachments,
    notes,
    dues,
    allocations,
    reminders,
    settings: safeSettings,
  };

  const payloadString = JSON.stringify(payload);
  const checksum = await computeSHA256(payloadString);

  const manifest: BackupManifest = {
    formatName: 'RAKAN_BALANCE_BACKUP',
    backupFormatVersion: 2,
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    appName: 'راكان بلانس | RAKAN BALANCE',
    checksum,
    recordCounts: {
      accounts: accounts.length,
      categories: categories.length,
      transactions: transactions.length,
      attachments: attachments.length,
      notes: notes.length,
      dues: dues.length,
      allocations: allocations.length,
      reminders: reminders.length,
    },
  };

  const bundle: BackupBundle = {
    manifest,
    data: payload as any,
  };

  const jsonString = JSON.stringify(bundle, null, 2);
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `rakan_balance_backup_${dateStr}.json`;

  return { jsonString, filename };
}

/**
 * Triggers a browser download of the backup file.
 */
export function downloadBackupFile(jsonString: string, filename: string): void {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates a backup file before attempting restore (Final N0 Validation).
 * Performs deep inspection of:
 * - Format and schema version
 * - Record count consistency
 * - SHA-256 Checksum
 * - Entity completeness (all tables required)
 * - Duplicate ID prevention across all tables
 * - Safe numeric amounts (positive Halalas, within MAX_SAFE_MINOR_AMOUNT)
 * - Relational foreign-key integrity (accounts -> categories, transactions -> accounts, etc.)
 * - Circular tree hierarchy cycles
 * - Safe owner settings (rejection/sanitization of sensitive credentials)
 */
export async function validateBackupFile(fileContent: string): Promise<{
  isValid: boolean;
  error?: string;
  bundle?: BackupBundle;
  counts?: BackupManifest['recordCounts'];
}> {
  try {
    if (!fileContent || typeof fileContent !== 'string') {
      return { isValid: false, error: 'محتوى ملف النسخة الاحتياطية فارغ أو غير صالح.' };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(fileContent);
    } catch {
      return { isValid: false, error: 'الملف ليس بتنسيق JSON سليم أو يحتوي على أخطاء هيكلية.' };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { isValid: false, error: 'هيكل كائن النسخة الاحتياطية غير صالح.' };
    }

    const { manifest, data } = parsed;

    // 1. Manifest and Version Checks
    if (!manifest || typeof manifest !== 'object') {
      return { isValid: false, error: 'بيان النسخة الاحتياطية (Manifest) مفقود في الملف.' };
    }
    if (manifest.formatName !== 'RAKAN_BALANCE_BACKUP') {
      return { isValid: false, error: 'الملف غير متوافق: تنسيق الحزمة ليس خاصاً بـ RAKAN_BALANCE_BACKUP.' };
    }
    if (manifest.schemaVersion !== 2 || manifest.backupFormatVersion !== 2) {
      return {
        isValid: false,
        error: `إصدار المخطط غير مدعوم: (مخطط ${manifest.schemaVersion} / حزمة ${manifest.backupFormatVersion}). النسخة الحالية تدعم الإصدار 2 فقط.`,
      };
    }

    // 2. Data Container Check & Completeness
    if (!data || typeof data !== 'object') {
      return { isValid: false, error: 'حاوية بيانات النسخة (Data) مفقودة أو غير صالحة.' };
    }

    if (
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.categories) ||
      !Array.isArray(data.transactions) ||
      !Array.isArray(data.attachments) ||
      !Array.isArray(data.notes)
    ) {
      return {
        isValid: false,
        error: 'النسخة الاحتياطية ناقصة: يجب أن تحتوي حزمة البيانات على جميع الجداول (الحسابات، التصنيفات، الحركات، المرفقات، والملاحظات).',
      };
    }

    const accounts: AccountModel[] = data.accounts;
    const categories: CategoryModel[] = data.categories;
    const transactions: TransactionModel[] = data.transactions;
    const attachments: AttachmentModel[] = data.attachments;
    const notes: StickyNoteModel[] = data.notes;

    // 3. Count consistency check
    if (manifest.recordCounts) {
      if (
        accounts.length !== manifest.recordCounts.accounts ||
        categories.length !== manifest.recordCounts.categories ||
        transactions.length !== manifest.recordCounts.transactions ||
        attachments.length !== manifest.recordCounts.attachments ||
        notes.length !== manifest.recordCounts.notes ||
        (manifest.recordCounts.dues !== undefined && (typeof manifest.recordCounts.dues !== 'number' || (data.dues || []).length !== manifest.recordCounts.dues)) ||
        (manifest.recordCounts.allocations !== undefined && (typeof manifest.recordCounts.allocations !== 'number' || (data.allocations || []).length !== manifest.recordCounts.allocations)) ||
        (manifest.recordCounts.reminders !== undefined && (typeof manifest.recordCounts.reminders !== 'number' || (data.reminders || []).length !== manifest.recordCounts.reminders))
      ) {
        return {
          isValid: false,
          error: 'فشل تطابق أعداد السجلات بين البيان الوصفي (Manifest) والسجلات الفعلية داخل الحزمة.',
        };
      }
    }

    // 4. SHA-256 Checksum Verification
    const payloadToHash: any = {
      accounts,
      categories,
      transactions,
      attachments,
      notes,
    };
    if (data.settings !== undefined) {
      payloadToHash.settings = data.settings;
    }

    const payloadString = JSON.stringify(payloadToHash);
    const calculatedChecksum = await computeSHA256(payloadString);
    if (calculatedChecksum !== manifest.checksum) {
      return {
        isValid: false,
        error: 'فشل فحص التجزئة التشفيرية (SHA-256): يبدو أن ملف النسخة تالف أو تم التعديل عليه خارج النظام.',
      };
    }

    // 5. Deep Field, Duplicate IDs, and Relational Integrity Checks

    // A. Categories: Validate and Check Duplicate IDs
    const categoryIds = new Set<string>();
    for (const cat of categories) {
      if (!cat.id || typeof cat.id !== 'string' || !cat.name || typeof cat.name !== 'string') {
        return { isValid: false, error: `سجل تصنيف غير صالح في النسخة: معرف أو اسم مفقود (${cat.id}).` };
      }
      if (categoryIds.has(cat.id)) {
        return { isValid: false, error: `معرف تصنيف مكرر في النسخة الاحتياطية (${cat.id}).` };
      }
      categoryIds.add(cat.id);
    }

    // B. Accounts: Validate, Check Duplicate IDs, Safe Amounts, and Foreign Keys
    const accountIds = new Set<string>();
    for (const acc of accounts) {
      if (!acc.id || typeof acc.id !== 'string' || !acc.name || typeof acc.name !== 'string') {
        return { isValid: false, error: `سجل حساب غير صالح في النسخة: معرف أو اسم مفقود (${acc.id}).` };
      }
      if (accountIds.has(acc.id)) {
        return { isValid: false, error: `معرف حساب مكرر في النسخة الاحتياطية (${acc.id}).` };
      }
      if (
        typeof acc.openingBalanceMinor !== 'number' ||
        !Number.isSafeInteger(acc.openingBalanceMinor) ||
        Math.abs(acc.openingBalanceMinor) > MAX_SAFE_MINOR_AMOUNT
      ) {
        return { isValid: false, error: `الرصيد الافتتاحي للحساب "${acc.name}" ليس عدداً صحيحاً آمناً بالهللات.` };
      }
      if (acc.status !== 'active' && acc.status !== 'archived') {
        return { isValid: false, error: `حالة الحساب "${acc.name}" غير صالحة (${acc.status}).` };
      }
      // Foreign Key: categoryId must exist
      if (!categoryIds.has(acc.categoryId)) {
        return {
          isValid: false,
          error: `الحساب "${acc.name}" مرتبط بتصنيف غير موجود في النسخة (${acc.categoryId}).`,
        };
      }
      accountIds.add(acc.id);
    }

    // Check account parents and tree cycles
    for (const acc of accounts) {
      if (acc.parentId) {
        if (!accountIds.has(acc.parentId)) {
          return {
            isValid: false,
            error: `الحساب الفرعي "${acc.name}" مرتبط بحساب أب مفقود في النسخة (${acc.parentId}).`,
          };
        }
        if (acc.parentId === acc.id) {
          return {
            isValid: false,
            error: `الحساب "${acc.name}" لا يمكن أن يكون أباً لنفسه.`,
          };
        }
        if (checkTreeCycle(accounts, acc.id, acc.parentId)) {
          return {
            isValid: false,
            error: `علاقة دائرية تالفة في شجرة الحسابات للحساب "${acc.name}" والأب "${acc.parentId}".`,
          };
        }
      }
    }

    // C. Transactions: Validate, Check Duplicate IDs, Foreign Keys, and Positive Safe Amounts
    const transactionIds = new Set<string>();
    for (const tx of transactions) {
      if (!tx.id || typeof tx.id !== 'string') {
        return { isValid: false, error: 'حركة مالية بدون معرف صالح.' };
      }
      if (transactionIds.has(tx.id)) {
        return { isValid: false, error: `معرف حركة مكرر في النسخة الاحتياطية (${tx.id}).` };
      }
      if (!accountIds.has(tx.accountId)) {
        return {
          isValid: false,
          error: `الحركة المالية "${tx.description}" مرتبطة بحساب غير موجود في النسخة (${tx.accountId}).`,
        };
      }
      if (tx.entryType !== 'owedByAccount' && tx.entryType !== 'owedToAccount') {
        return { isValid: false, error: `نوع الحركة "${tx.description}" غير صالح (${tx.entryType}).` };
      }
      if (
        typeof tx.amountMinor !== 'number' ||
        !Number.isSafeInteger(tx.amountMinor) ||
        tx.amountMinor <= 0 ||
        tx.amountMinor > MAX_SAFE_MINOR_AMOUNT
      ) {
        return {
          isValid: false,
          error: `مبلغ الحركة "${tx.description}" يجب أن يكون عدداً صحيحاً موجباً وآمناً بالهللات (> 0 ولا يتجاوز الحد الأقصى).`,
        };
      }
      if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
        return { isValid: false, error: `تاريخ الحركة "${tx.description}" غير صالح (${tx.date}).` };
      }
      transactionIds.add(tx.id);
    }

    // Validate Inter-Account Transfer Pairs (Milestone N1)
    const transferValidation = validateTransferPairs(transactions);
    if (!transferValidation.isValid) {
      return {
        isValid: false,
        error: transferValidation.error || 'فشل فحص سلامة الحركات البينية في النسخة الاحتياطية.',
      };
    }

    // D. Attachments: Validate, Check Duplicate IDs, and Links to Transactions
    const attachmentIds = new Set<string>();
    for (const att of attachments) {
      if (!att.id || typeof att.id !== 'string' || !att.dataUrl || typeof att.dataUrl !== 'string') {
        return { isValid: false, error: `سجل مرفق غير صالح في النسخة (${att.id}).` };
      }
      if (attachmentIds.has(att.id)) {
        return { isValid: false, error: `معرف مرفق مكرر في النسخة الاحتياطية (${att.id}).` };
      }
      if (!transactionIds.has(att.transactionId)) {
        return {
          isValid: false,
          error: `المرفق "${att.originalName}" مرتبط بحركة مالية غير موجودة (${att.transactionId}).`,
        };
      }
      attachmentIds.add(att.id);
    }

    // Check transaction attachments reference
    for (const tx of transactions) {
      if (Array.isArray(tx.attachmentIds)) {
        for (const attId of tx.attachmentIds) {
          if (!attachmentIds.has(attId)) {
            return {
              isValid: false,
              error: `الحركة "${tx.description}" تشير إلى مرفق مفقود (${attId}).`,
            };
          }
        }
      }
    }

    // E. Notes: Check Duplicate IDs
    const noteIds = new Set<string>();
    for (const note of notes) {
      if (!note.id || typeof note.id !== 'string') {
        return { isValid: false, error: 'سجل ملاحظة بدون معرف صالح.' };
      }
      if (noteIds.has(note.id)) {
        return { isValid: false, error: `معرف ملاحظة مكرر في النسخة الاحتياطية (${note.id}).` };
      }
      noteIds.add(note.id);
    }

    // N2 lists are optional for backups produced before this milestone.
    if (
      (data.dues !== undefined && !Array.isArray(data.dues)) ||
      (data.allocations !== undefined && !Array.isArray(data.allocations)) ||
      (data.reminders !== undefined && !Array.isArray(data.reminders))
    ) {
      return { isValid: false, error: 'بيانات الاستحقاقات أو تخصيصات السداد أو التذكيرات غير صالحة.' };
    }
    try {
      validateDueLedger(data.dues || [], data.allocations || [], data.reminders || [], accounts, transactions);
    } catch (error) {
      return { isValid: false, error: 'فشل فحص بيانات N2: ' + (error instanceof Error ? error.message : String(error)) };
    }

    // F. Safe Settings Validation
    if (data.settings !== undefined) {
      if (typeof data.settings !== 'object' || data.settings === null) {
        return { isValid: false, error: 'كائن إعدادات المالك في النسخة غير صالح.' };
      }
      if (data.settings.currencyCode && data.settings.currencyCode !== 'SAR') {
        return { isValid: false, error: `عملة النسخة غير متوافقة (${data.settings.currencyCode}). التطبيق يعتمد SAR فقط.` };
      }
      if (data.settings.currencyDecimals && data.settings.currencyDecimals !== 2) {
        return { isValid: false, error: 'دقة العملة يجب أن تكون 2 (100 هللة).' };
      }
      // Security boundary check: ensure sensitive PIN secrets are sanitized
      if (data.settings.pinCodeHash || data.settings.pinSalt) {
        delete data.settings.pinCodeHash;
        delete data.settings.pinSalt;
        delete data.settings.isLocked;
      }
    }

    return {
      isValid: true,
      bundle: parsed as BackupBundle,
      counts: manifest.recordCounts,
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: `تعذر فحص ملف النسخة: ${err.message || 'خطأ غير معروف'}`,
    };
  }
}
