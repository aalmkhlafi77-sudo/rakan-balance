/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Backup & Restore Integrity Service
 * Follows Document v2 Section 6, 14.15 & Review Fix #3:
 * - Generates manifest with SHA-256 integrity hash
 * - Performs deep pre-validation on schema, versions, types, required fields, and relational integrity
 * - Validates foreign keys (categories, accounts, attachments) and tree cycles before allowing restore
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
} from '../domain/types.ts';
import { checkTreeCycle } from '../domain/balance_calculator.ts';
import { dbStorage, STORES_REAL } from './indexed_db.ts';

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
 */
export async function exportBackupBundle(): Promise<{ jsonString: string; filename: string }> {
  const [accounts, categories, transactions, attachments, notes] = await Promise.all([
    dbStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
    dbStorage.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
    dbStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
    dbStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
    dbStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES),
  ]);

  const payload = {
    accounts,
    categories,
    transactions,
    attachments,
    notes,
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
 * Validates a backup file before attempting restore (Review Fix #3).
 * Performs deep inspection of:
 * - Format and schema version
 * - Record count consistency
 * - SHA-256 Checksum
 * - Entity field types and required attributes
 * - Relational foreign-key integrity (accounts -> categories, transactions -> accounts, etc.)
 * - Circular tree hierarchy cycles
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

    // 2. Data Container Check
    if (!data || typeof data !== 'object') {
      return { isValid: false, error: 'حاوية بيانات النسخة (Data) مفقودة أو غير صالحة.' };
    }

    const accounts: AccountModel[] = Array.isArray(data.accounts) ? data.accounts : [];
    const categories: CategoryModel[] = Array.isArray(data.categories) ? data.categories : [];
    const transactions: TransactionModel[] = Array.isArray(data.transactions) ? data.transactions : [];
    const attachments: AttachmentModel[] = Array.isArray(data.attachments) ? data.attachments : [];
    const notes: StickyNoteModel[] = Array.isArray(data.notes) ? data.notes : [];

    // 3. Count consistency check
    if (manifest.recordCounts) {
      if (
        accounts.length !== manifest.recordCounts.accounts ||
        categories.length !== manifest.recordCounts.categories ||
        transactions.length !== manifest.recordCounts.transactions ||
        attachments.length !== manifest.recordCounts.attachments ||
        notes.length !== manifest.recordCounts.notes
      ) {
        return {
          isValid: false,
          error: 'فشل تطابق أعداد السجلات بين البيان الوصفي (Manifest) والسجلات الفعلية داخل الحزمة.',
        };
      }
    }

    // 4. SHA-256 Checksum Verification
    const payloadString = JSON.stringify({
      accounts,
      categories,
      transactions,
      attachments,
      notes,
    });

    const calculatedChecksum = await computeSHA256(payloadString);
    if (calculatedChecksum !== manifest.checksum) {
      return {
        isValid: false,
        error: 'فشل فحص التجزئة التشفيرية (SHA-256): يبدو أن ملف النسخة تالف أو تم التعديل عليه خارج النظام.',
      };
    }

    // 5. Deep Field & Type Validation
    // A. Categories
    const categoryIds = new Set<string>();
    for (const cat of categories) {
      if (!cat.id || typeof cat.id !== 'string' || !cat.name || typeof cat.name !== 'string') {
        return { isValid: false, error: `سجل تصنيف غير صالح في النسخة: معرف أو اسم مفقود (${cat.id}).` };
      }
      categoryIds.add(cat.id);
    }

    // B. Accounts
    const accountIds = new Set<string>();
    for (const acc of accounts) {
      if (!acc.id || typeof acc.id !== 'string' || !acc.name || typeof acc.name !== 'string') {
        return { isValid: false, error: `سجل حساب غير صالح في النسخة: معرف أو اسم مفقود (${acc.id}).` };
      }
      if (!Number.isSafeInteger(acc.openingBalanceMinor)) {
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
        if (checkTreeCycle(accounts, acc.id, acc.parentId)) {
          return {
            isValid: false,
            error: `علاقة دائرية تالفة في شجرة الحسابات للحساب "${acc.name}" والأب "${acc.parentId}".`,
          };
        }
      }
    }

    // C. Transactions
    const transactionIds = new Set<string>();
    for (const tx of transactions) {
      if (!tx.id || typeof tx.id !== 'string') {
        return { isValid: false, error: 'حركة مالية بدون معرف صالح.' };
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
      if (!Number.isSafeInteger(tx.amountMinor) || tx.amountMinor <= 0) {
        return { isValid: false, error: `مبلغ الحركة "${tx.description}" يجب أن يكون عدداً صحيحاً موجباً بالهللات.` };
      }
      if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
        return { isValid: false, error: `تاريخ الحركة "${tx.description}" غير صالح (${tx.date}).` };
      }
      transactionIds.add(tx.id);
    }

    // D. Attachments
    const attachmentIds = new Set<string>();
    for (const att of attachments) {
      if (!att.id || typeof att.id !== 'string' || !att.dataUrl || typeof att.dataUrl !== 'string') {
        return { isValid: false, error: `سجل مرفق غير صالح في النسخة (${att.id}).` };
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
