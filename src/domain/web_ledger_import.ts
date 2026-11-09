/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Web CSV/XLSX Ledger Import Service
 * Stage WEB-F1: Import accounts & transactions from CSV and Excel files.
 * - Enforces financial precision via tryToMinorUnits (Halalas).
 * - Enforces 100 Billion SAR boundary & max 2 decimal places.
 * - Resolves account references, detects duplicates, detects conflicting external refs.
 * - All-or-nothing atomic batch drafting & previewing.
 */

import Papa from 'papaparse';
import ExcelJS from '@andreeewill/exceljs';
import { AccountModel, CategoryModel, EntryType, TransactionModel } from './types.ts';
import { tryToMinorUnits, MAX_SAFE_MINOR_AMOUNT } from './money.ts';

export interface ImportIssue {
  section: 'file' | 'accounts' | 'transactions';
  rowNumber: number;
  message: string;
  blocking: boolean;
}

export interface ImportAccountDraft {
  sourceRow: number;
  externalRef?: string;
  name: string;
  categoryName: string;
  openingBalanceMinor: number;
  phone?: string;
  notes?: string;
  duplicate: boolean;
}

export interface ImportTransactionDraft {
  sourceRow: number;
  accountRef: string;
  entryType: EntryType;
  amountMinor: number;
  date: string;
  description: string;
  notes?: string;
  duplicate: boolean;
}

export class LedgerImportPreview {
  public sourceName: string;
  public accounts: ImportAccountDraft[];
  public transactions: ImportTransactionDraft[];
  public issues: ImportIssue[];

  constructor(data: {
    sourceName: string;
    accounts: ImportAccountDraft[];
    transactions: ImportTransactionDraft[];
    issues: ImportIssue[];
  }) {
    this.sourceName = data.sourceName;
    this.accounts = data.accounts;
    this.transactions = data.transactions;
    this.issues = data.issues;
  }

  get blockingIssues(): ImportIssue[] {
    return this.issues.filter((issue) => issue.blocking);
  }

  get warnings(): ImportIssue[] {
    return this.issues.filter((issue) => !issue.blocking);
  }

  get duplicateAccounts(): number {
    return this.accounts.filter((row) => row.duplicate).length;
  }

  get duplicateTransactions(): number {
    return this.transactions.filter((row) => row.duplicate).length;
  }

  get importableAccounts(): number {
    return this.accounts.length - this.duplicateAccounts;
  }

  get importableTransactions(): number {
    return this.transactions.length - this.duplicateTransactions;
  }

  get canCommit(): boolean {
    return (
      this.blockingIssues.length === 0 &&
      (this.importableAccounts > 0 || this.importableTransactions > 0)
    );
  }
}

export interface LedgerImportCommitResult {
  importedAccounts: number;
  skippedAccounts: number;
  importedTransactions: number;
  skippedTransactions: number;
}

const ALIASES_EXTERNAL_REF = [
  'externalref',
  'externalid',
  'reference',
  'ref',
  'المرجع',
  'المعرفالخارجي',
];

const ALIASES_ACCOUNT_NAME = [
  'name',
  'accountname',
  'اسم',
  'اسمالحساب',
  'الحساب',
];

const ALIASES_CATEGORY = [
  'category',
  'categoryname',
  'التصنيف',
  'الفئة',
];

const ALIASES_OPENING_BALANCE = [
  'openingbalance',
  'opening',
  'openingamount',
  'الرصيدالافتتاحي',
];

const ALIASES_PHONE = ['phone', 'mobile', 'الهاتف', 'الجوال'];
const ALIASES_NOTES = ['notes', 'note', 'ملاحظات', 'الملاحظات'];

const ALIASES_ACCOUNT_REF = [
  'accountref',
  'accountid',
  'account',
  'accountname',
  'مرجعالحساب',
  'الحساب',
  'اسمالحساب',
];

const ALIASES_ENTRY_TYPE = [
  'entrytype',
  'direction',
  'transactiontype',
  'نوعالحركة',
  'الاتجاه',
];

const ALIASES_AMOUNT = ['amount', 'value', 'المبلغ', 'القيمة'];
const ALIASES_DATE = ['date', 'transactiondate', 'التاريخ'];
const ALIASES_DESCRIPTION = [
  'description',
  'statement',
  'memo',
  'البيان',
  'الوصف',
];
const ALIASES_RECORD_TYPE = ['recordtype', 'نوعالسجل'];

function normalizeToken(value: any): string {
  return (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, '')
    .replace(/﻿/g, '')
    .replace(/[\s_\-]+/g, '');
}

function cleanDisplay(value: any): string {
  return (value ?? '').toString().trim();
}

function cleanAmountStr(raw: string): string {
  let v = raw.trim().replace(/\s+/g, '');
  if (v.includes(',') && v.includes('.')) {
    v = v.replace(/,/g, '');
  }
  return v;
}

function getRowValue(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const key = normalizeToken(alias);
    const value = row[key];
    if (value !== undefined && value !== null && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function mapRow(headers: any[], values: any[]): Record<string, string> {
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeToken(headers[i]);
    if (!key) continue;
    row[key] = i < values.length ? cleanDisplay(values[i]) : '';
  }
  return row;
}

function tableToRows(table: any[][]): Array<Record<string, string>> {
  if (!table || table.length === 0) return [];
  const headers = table[0];
  const result: Array<Record<string, string>> = [];

  for (let i = 1; i < table.length; i++) {
    const values = table[i];
    if (!values || values.every((cell) => cleanDisplay(cell).length === 0)) {
      continue;
    }
    const mapped = mapRow(headers, values);
    mapped['__sourcerow'] = `${i + 1}`;
    result.push(mapped);
  }
  return result;
}

export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

function normalizeDate(raw: string): string {
  const value = raw.trim();
  const slashMatch = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (slashMatch) {
    const y = slashMatch[1];
    const m = slashMatch[2].padStart(2, '0');
    const d = slashMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
  return isoMatch ? isoMatch[0] : value;
}

function parseEntryType(raw: string): EntryType | null {
  const token = normalizeToken(raw);
  if (
    ['owedbyaccount', 'owedby', 'receivable', 'لك', 'مستحقليك'].includes(token)
  ) {
    return 'owedByAccount';
  }
  if (
    ['owedtoaccount', 'owedto', 'payable', 'عليك', 'مستحقعليك'].includes(token)
  ) {
    return 'owedToAccount';
  }
  return null;
}

function sameTransaction(
  accountId: string,
  entryType: EntryType,
  amountMinor: number,
  date: string,
  description: string,
  existing: TransactionModel
): boolean {
  return (
    existing.accountId === accountId &&
    existing.entryType === entryType &&
    existing.amountMinor === amountMinor &&
    existing.date === date &&
    existing.description.trim() === description.trim()
  );
}

function csvCell(value: string): string {
  const safe = /^[\s]*[=+@-]/.test(value) ? `\t${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildIssuesCsv(preview: LedgerImportPreview): string {
  const lines: string[] = [
    ['المصدر', csvCell(preview.sourceName)].join(','),
    [
      'حسابات جديدة',
      `${preview.importableAccounts}`,
      'حركات جديدة',
      `${preview.importableTransactions}`,
      'مكررات',
      `${preview.duplicateAccounts + preview.duplicateTransactions}`,
      'أخطاء مانعة',
      `${preview.blockingIssues.length}`,
    ].join(','),
    '',
    'القسم,الصف,الحالة,الرسالة',
  ];

  for (const issue of preview.issues) {
    lines.push(
      [
        csvCell(issue.section),
        `${issue.rowNumber}`,
        csvCell(issue.blocking ? 'مرفوض' : 'تنبيه'),
        csvCell(issue.message),
      ].join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function buildCommitReportCsv(
  preview: LedgerImportPreview,
  result: LedgerImportCommitResult
): string {
  const lines: string[] = [
    ['المصدر', csvCell(preview.sourceName)].join(','),
    ['الحالة', csvCell('تم التنفيذ ذريًا')].join(','),
    ['الحسابات المستوردة', `${result.importedAccounts}`].join(','),
    ['الحسابات المتجاهلة', `${result.skippedAccounts}`].join(','),
    ['الحركات المستوردة', `${result.importedTransactions}`].join(','),
    ['الحركات المتجاهلة', `${result.skippedTransactions}`].join(','),
    '',
    'القسم,الصف,الحالة,الرسالة',
  ];

  for (const issue of preview.issues) {
    lines.push(
      [
        csvCell(issue.section),
        `${issue.rowNumber}`,
        csvCell(issue.blocking ? 'مرفوض' : 'تنبيه'),
        csvCell(issue.message),
      ].join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function buildAccountsCsvTemplate(): string {
  const csv =
    'externalRef,name,category,openingBalance,phone,notes\n' +
    'A-001,أحمد,أفراد,0.00,0500000000,';
  return `\uFEFF${csv}\r\n`;
}

export function buildTransactionsCsvTemplate(): string {
  const csv =
    'accountRef,entryType,amount,date,description,notes\n' +
    'A-001,لك,125.50,2026-11-07,مثال حركة,';
  return `\uFEFF${csv}\r\n`;
}

export async function buildXlsxTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const accounts = workbook.addWorksheet('Accounts');
  accounts.addRows([
    ['externalRef', 'name', 'category', 'openingBalance', 'phone', 'notes'],
    ['A-001', 'أحمد', 'أفراد', '0.00', '0500000000', ''],
  ]);
  const transactions = workbook.addWorksheet('Transactions');
  transactions.addRows([
    ['accountRef', 'entryType', 'amount', 'date', 'description', 'notes'],
    ['A-001', 'لك', '125.50', '2026-11-07', 'مثال حركة', ''],
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export function previewFromRows(options: {
  sourceName: string;
  accountRows: Array<Record<string, string>>;
  transactionRows: Array<Record<string, string>>;
  existingAccounts: AccountModel[];
  existingTransactions: TransactionModel[];
}): LedgerImportPreview {
  const {
    sourceName,
    accountRows,
    transactionRows,
    existingAccounts,
    existingTransactions,
  } = options;

  const issues: ImportIssue[] = [];
  const accounts: ImportAccountDraft[] = [];
  const transactions: ImportTransactionDraft[] = [];

  const existingByName: Record<string, AccountModel> = {};
  for (const acc of existingAccounts) {
    existingByName[normalizeToken(acc.name)] = acc;
  }

  const importedNames = new Set<string>();
  const importedRefs = new Set<string>();
  const importedRefOwners: Record<string, string> = {};

  const batchNameKeys = new Set<string>();
  for (const row of accountRows) {
    const n = getRowValue(row, ALIASES_ACCOUNT_NAME);
    if (n) batchNameKeys.add(normalizeToken(n));
  }

  for (let i = 0; i < accountRows.length; i++) {
    const row = accountRows[i];
    const rowNumber = parseInt(row['__sourcerow'] || `${i + 2}`, 10);

    const name = getRowValue(row, ALIASES_ACCOUNT_NAME);
    const category = getRowValue(row, ALIASES_CATEGORY);
    const rawOpening = getRowValue(row, ALIASES_OPENING_BALANCE) || '0';
    const ref = getRowValue(row, ALIASES_EXTERNAL_REF);
    const phone = getRowValue(row, ALIASES_PHONE);
    const notes = getRowValue(row, ALIASES_NOTES);

    if (!name || name.trim().length === 0) {
      issues.push({
        section: 'accounts',
        rowNumber,
        message: 'اسم الحساب مطلوب.',
        blocking: true,
      });
      continue;
    }

    if (!category || category.trim().length === 0) {
      issues.push({
        section: 'accounts',
        rowNumber,
        message: 'تصنيف الحساب مطلوب.',
        blocking: true,
      });
      continue;
    }

    const cleanOpening = cleanAmountStr(rawOpening);
    const openingRes = tryToMinorUnits(cleanOpening);
    if (!openingRes.success) {
      issues.push({
        section: 'accounts',
        rowNumber,
        message: openingRes.error || 'الرصيد الافتتاحي غير صالح.',
        blocking: true,
      });
      continue;
    }

    const normalizedName = normalizeToken(name);
    const normalizedRef = ref ? normalizeToken(ref) : null;

    if (normalizedRef) {
      const importedOwner = importedRefOwners[normalizedRef];
      const existingAliasOwners = existingAccounts.filter(
        (acc) =>
          normalizeToken(acc.id) === normalizedRef ||
          normalizeToken(acc.name) === normalizedRef
      );
      const conflictsWithExistingAlias = existingAliasOwners.some(
        (acc) => normalizeToken(acc.name) !== normalizedName
      );
      const conflictsWithBatchName =
        batchNameKeys.has(normalizedRef) && normalizedRef !== normalizedName;

      if (
        (importedOwner && importedOwner !== normalizedName) ||
        conflictsWithExistingAlias ||
        conflictsWithBatchName
      ) {
        issues.push({
          section: 'accounts',
          rowNumber,
          message:
            'المرجع الخارجي مرتبط بحساب مختلف؛ يجب تصحيح المراجع قبل الاستيراد.',
          blocking: true,
        });
        continue;
      }
      importedRefOwners[normalizedRef] = normalizedName;
    }

    const duplicate =
      !!existingByName[normalizedName] ||
      importedNames.has(normalizedName) ||
      (!!normalizedRef && importedRefs.has(normalizedRef));

    if (duplicate) {
      issues.push({
        section: 'accounts',
        rowNumber,
        message: 'الحساب مكرر وسيتم تجاهل صفه عند التنفيذ.',
        blocking: false,
      });
    }

    importedNames.add(normalizedName);
    if (normalizedRef) {
      importedRefs.add(normalizedRef);
    }

    accounts.push({
      sourceRow: rowNumber,
      externalRef: ref || undefined,
      name: name.trim(),
      categoryName: category.trim(),
      openingBalanceMinor: openingRes.minor,
      phone: phone || undefined,
      notes: notes || undefined,
      duplicate,
    });
  }

  const knownRefs = new Set<string>();
  for (const acc of existingAccounts) {
    knownRefs.add(normalizeToken(acc.id));
    knownRefs.add(normalizeToken(acc.name));
  }
  for (const acc of accounts) {
    knownRefs.add(normalizeToken(acc.name));
    if (acc.externalRef) {
      knownRefs.add(normalizeToken(acc.externalRef));
    }
  }

  const seenImportTransactions = new Set<string>();

  for (let i = 0; i < transactionRows.length; i++) {
    const row = transactionRows[i];
    const rowNumber = parseInt(row['__sourcerow'] || `${i + 2}`, 10);

    if (row['__invalidrecordtype']) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message: `نوع السجل غير معروف: ${row['__invalidrecordtype']}`,
        blocking: true,
      });
      continue;
    }

    const accountRef = getRowValue(row, ALIASES_ACCOUNT_REF);
    const rawType = getRowValue(row, ALIASES_ENTRY_TYPE);
    const rawAmount = getRowValue(row, ALIASES_AMOUNT);
    const rawDate = getRowValue(row, ALIASES_DATE);
    const description = getRowValue(row, ALIASES_DESCRIPTION);
    const notes = getRowValue(row, ALIASES_NOTES);

    if (!accountRef || !knownRefs.has(normalizeToken(accountRef))) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message: 'مرجع الحساب غير موجود في البيانات الحالية أو صفوف الحسابات.',
        blocking: true,
      });
      continue;
    }

    const entryType = rawType ? parseEntryType(rawType) : null;
    if (!entryType) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message:
          'نوع الحركة مطلوب صراحةً: لك / عليك أو owedByAccount / owedToAccount.',
        blocking: true,
      });
      continue;
    }

    if (!rawAmount || rawAmount.trim().length === 0) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message: 'مبلغ الحركة مطلوب.',
        blocking: true,
      });
      continue;
    }

    const cleanAmount = cleanAmountStr(rawAmount);
    const amountRes = tryToMinorUnits(cleanAmount);
    if (!amountRes.success || amountRes.minor <= 0) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message: amountRes.error || 'مبلغ الحركة يجب أن يكون موجبًا.',
        blocking: true,
      });
      continue;
    }

    if (!rawDate || rawDate.trim().length === 0) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message: 'تاريخ الحركة مطلوب.',
        blocking: true,
      });
      continue;
    }

    const date = normalizeDate(rawDate);
    if (!isValidDateString(date)) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message: 'التاريخ غير صالح. استخدم YYYY-MM-DD.',
        blocking: true,
      });
      continue;
    }

    if (!description || description.trim().length === 0) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message: 'بيان الحركة مطلوب.',
        blocking: true,
      });
      continue;
    }

    const normalizedAccountRef = normalizeToken(accountRef);
    let existingAccount: AccountModel | undefined;
    for (const acc of existingAccounts) {
      if (
        normalizeToken(acc.id) === normalizedAccountRef ||
        normalizeToken(acc.name) === normalizedAccountRef
      ) {
        existingAccount = acc;
        break;
      }
    }

    const signature = `${normalizedAccountRef}|${entryType}|${amountRes.minor}|${date}|${description.trim()}`;
    let duplicate = seenImportTransactions.has(signature);
    if (!duplicate) {
      seenImportTransactions.add(signature);
    }

    if (!duplicate && existingAccount) {
      duplicate = existingTransactions.some((existing) =>
        sameTransaction(
          existingAccount!.id,
          entryType,
          amountRes.minor,
          date,
          description.trim(),
          existing
        )
      );
    }

    if (duplicate) {
      issues.push({
        section: 'transactions',
        rowNumber,
        message: 'الحركة مكررة وسيتم تجاهل صفها عند التنفيذ.',
        blocking: false,
      });
    }

    transactions.push({
      sourceRow: rowNumber,
      accountRef: accountRef.trim(),
      entryType,
      amountMinor: amountRes.minor,
      date,
      description: description.trim(),
      notes: notes || undefined,
      duplicate,
    });
  }

  return new LedgerImportPreview({
    sourceName,
    accounts,
    transactions,
    issues,
  });
}

export async function parseAndPreviewFile(options: {
  buffer: ArrayBuffer | Uint8Array;
  fileName: string;
  existingAccounts: AccountModel[];
  existingTransactions: TransactionModel[];
}): Promise<LedgerImportPreview> {
  const { buffer, fileName, existingAccounts, existingTransactions } = options;
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.csv')) {
    let text: string;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      text = decoder.decode(buffer);
    } catch (e: any) {
      return new LedgerImportPreview({
        sourceName: fileName,
        accounts: [],
        transactions: [],
        issues: [
          {
            section: 'file',
            rowNumber: 1,
            message: `ترميز الملف غير صالح (يجب أن يكون UTF-8): ${e.message || e}`,
            blocking: true,
          },
        ],
      });
    }

    const normalizedCsv = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parsed = Papa.parse(normalizedCsv, {
      skipEmptyLines: true,
    });

    if (parsed.errors && parsed.errors.length > 0) {
      // Check for unclosed quote error
      const quoteError = parsed.errors.find((err) =>
        err.message.toLowerCase().includes('quote')
      );
      if (quoteError) {
        return new LedgerImportPreview({
          sourceName: fileName,
          accounts: [],
          transactions: [],
          issues: [
            {
              section: 'file',
              rowNumber: quoteError.row !== undefined ? quoteError.row + 1 : 1,
              message: `تنسيق CSV غير صالح أو يحتوي علامات تنصيص غير مغلقة: ${quoteError.message}`,
              blocking: true,
            },
          ],
        });
      }
    }

    const table = parsed.data as any[][];
    const rows = tableToRows(table);

    const accountRows: Array<Record<string, string>> = [];
    const transactionRows: Array<Record<string, string>> = [];

    const hasRecordType = rows.some(
      (row) => getRowValue(row, ALIASES_RECORD_TYPE) !== null
    );

    if (hasRecordType) {
      for (const row of rows) {
        const type = normalizeToken(getRowValue(row, ALIASES_RECORD_TYPE));
        if (['account', 'accounts', 'حساب', 'حسابات'].includes(type)) {
          accountRows.push(row);
        } else if (
          ['transaction', 'transactions', 'movement', 'حركة', 'حركات'].includes(
            type
          )
        ) {
          transactionRows.push(row);
        } else {
          transactionRows.push({
            ...row,
            __invalidrecordtype: getRowValue(row, ALIASES_RECORD_TYPE) || '',
          });
        }
      }
    } else if (rows.length > 0) {
      const sample = rows[0];
      const looksAccounts =
        getRowValue(sample, ALIASES_ACCOUNT_NAME) !== null &&
        getRowValue(sample, ALIASES_CATEGORY) !== null;
      const looksTransactions =
        getRowValue(sample, ALIASES_ACCOUNT_REF) !== null &&
        getRowValue(sample, ALIASES_ENTRY_TYPE) !== null &&
        getRowValue(sample, ALIASES_AMOUNT) !== null;

      if (looksAccounts && !looksTransactions) {
        accountRows.push(...rows);
      } else if (looksTransactions) {
        transactionRows.push(...rows);
      } else {
        return new LedgerImportPreview({
          sourceName: fileName,
          accounts: [],
          transactions: [],
          issues: [
            {
              section: 'file',
              rowNumber: 1,
              message:
                'تعذر تحديد نوع CSV. استخدم أعمدة الحسابات أو الحركات المعتمدة، أو أضف عمود recordType.',
              blocking: true,
            },
          ],
        });
      }
    }

    return previewFromRows({
      sourceName: fileName,
      accountRows,
      transactionRows,
      existingAccounts,
      existingTransactions,
    });
  }

  if (lower.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    try {
      const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    } catch (e: any) {
      return new LedgerImportPreview({
        sourceName: fileName,
        accounts: [],
        transactions: [],
        issues: [
          {
            section: 'file',
            rowNumber: 1,
            message: `ملف Excel غير صالح أو تالف: ${e.message || e}`,
            blocking: true,
          },
        ],
      });
    }

    const accountRows: Array<Record<string, string>> = [];
    const transactionRows: Array<Record<string, string>> = [];

    for (const worksheet of workbook.worksheets) {
      const sheetToken = normalizeToken(worksheet.name);
      const rawRows: any[][] = [];
      for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const values: any[] = [];
        for (let column = 1; column <= Math.max(row.cellCount, worksheet.columnCount); column++) {
          const cell = row.getCell(column);
          const value = cell.value;
          if (value === null || value === undefined) {
            values.push('');
          } else if (typeof value === 'object' && 'formula' in value) {
            values.push(String((value as any).result ?? ''));
          } else if (typeof value === 'object' && 'text' in value) {
            values.push(String((value as any).text ?? ''));
          } else if (value instanceof Date) {
            values.push(value.toISOString().slice(0, 10));
          } else {
            values.push(String(value));
          }
        }
        rawRows.push(values);
      }
      const rows = tableToRows(rawRows);

      if (['accounts', 'account', 'الحسابات', 'حسابات'].includes(sheetToken)) {
        accountRows.push(...rows);
      } else if (
        ['transactions', 'transaction', 'movements', 'الحركات', 'حركات'].includes(
          sheetToken
        )
      ) {
        transactionRows.push(...rows);
      }
    }

    if (accountRows.length === 0 && transactionRows.length === 0) {
      return new LedgerImportPreview({
        sourceName: fileName,
        accounts: [],
        transactions: [],
        issues: [
          {
            section: 'file',
            rowNumber: 1,
            message:
              'ملف Excel يجب أن يحتوي ورقة Accounts/الحسابات و/أو Transactions/الحركات.',
            blocking: true,
          },
        ],
      });
    }

    return previewFromRows({
      sourceName: fileName,
      accountRows,
      transactionRows,
      existingAccounts,
      existingTransactions,
    });
  }

  return new LedgerImportPreview({
    sourceName: fileName,
    accounts: [],
    transactions: [],
    issues: [
      {
        section: 'file',
        rowNumber: 1,
        message: 'صيغة الملف غير مدعومة. يجب استخدام ملف بصيغة CSV أو XLSX فقط.',
        blocking: true,
      },
    ],
  });
}
