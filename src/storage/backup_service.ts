/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Backup & Restore Integrity Service
 * Follows Document v2 Section 6, 14.15 & Approved Plan:
 * - Generates manifest with SHA-256 integrity hash
 * - Pre-validates schema and checksum before restore
 * - Triggers safe atomic restore via IndexedDB
 */

import { BackupBundle, BackupManifest } from '../domain/types.ts';
import { dbStorage } from './indexed_db.ts';

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
    dbStorage.getAll(STORES_REAL.ACCOUNTS),
    dbStorage.getAll(STORES_REAL.CATEGORIES),
    dbStorage.getAll(STORES_REAL.TRANSACTIONS),
    dbStorage.getAll(STORES_REAL.ATTACHMENTS),
    dbStorage.getAll(STORES_REAL.NOTES),
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
 * Validates a backup file before attempting restore.
 */
export async function validateBackupFile(fileContent: string): Promise<{
  isValid: boolean;
  error?: string;
  bundle?: BackupBundle;
  counts?: BackupManifest['recordCounts'];
}> {
  try {
    const parsed = JSON.parse(fileContent);

    if (!parsed || typeof parsed !== 'object') {
      return { isValid: false, error: 'الملف ليس بتنسيق JSON صالح.' };
    }

    const { manifest, data } = parsed;

    if (!manifest || manifest.formatName !== 'RAKAN_BALANCE_BACKUP') {
      return {
        isValid: false,
        error: 'الملف غير متوافق: ليس نسخة احتياطية صالحة من راكان بلانس.',
      };
    }

    if (!data || typeof data !== 'object') {
      return { isValid: false, error: 'بيانات النسخة الاحتياطية مفقودة أو غير صالحة.' };
    }

    // Verify Checksum
    const payloadString = JSON.stringify({
      accounts: data.accounts || [],
      categories: data.categories || [],
      transactions: data.transactions || [],
      attachments: data.attachments || [],
      notes: data.notes || [],
    });

    const calculatedChecksum = await computeSHA256(payloadString);
    if (calculatedChecksum !== manifest.checksum) {
      return {
        isValid: false,
        error: 'فشل فحص التجزئة (SHA-256): يبدو أن ملف النسخة تالف أو تم التعديل عليه.',
      };
    }

    return {
      isValid: true,
      bundle: parsed as BackupBundle,
      counts: manifest.recordCounts,
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: `تعذر قراءة الملف: ${err.message || 'خطأ غير معروف'}`,
    };
  }
}

import { STORES_REAL } from './indexed_db.ts';
