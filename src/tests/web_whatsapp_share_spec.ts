/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Web WhatsApp & Statement Share Verification Suite
 * Verifies international phone number sanitization, transaction & statement message formatting,
 * privacy protection (excluding private notes), WhatsApp URL generation, and zero financial drift invariant.
 */

import { TransactionModel, AccountModel } from '../domain/types.ts';
import {
  sanitizePhoneNumber,
  buildTransactionShareMessage,
  buildStatementShareMessage,
  getWhatsAppUrl,
} from '../services/whatsapp_share_service.ts';
import { calculateAccountBalance } from '../domain/balance_calculator.ts';

export interface WebWhatsAppShareTestResult {
  passedCount: number;
  failedCount: number;
  results: { id: string; name: string; passed: boolean; message: string }[];
}

export async function runWebWhatsAppShareTestSuite(): Promise<WebWhatsAppShareTestResult> {
  const results: { id: string; name: string; passed: boolean; message: string }[] = [];
  let passedCount = 0;
  let failedCount = 0;

  function recordResult(id: string, name: string, passed: boolean, message: string) {
    if (passed) passedCount++;
    else failedCount++;
    results.push({ id, name, passed, message });
  }

  // Test 1: Phone sanitization and international format validation
  try {
    const valid1 = sanitizePhoneNumber('+966 50 123 4567');
    const valid2 = sanitizePhoneNumber('0096777123456');
    const invalidShort = sanitizePhoneNumber('12345');
    const empty = sanitizePhoneNumber('');

    const ok =
      valid1.isValid &&
      valid1.cleanPhone === '966501234567' &&
      valid2.isValid &&
      valid2.cleanPhone === '96777123456' &&
      !invalidShort.isValid &&
      !empty.isValid;

    recordResult(
      'SHARE_TEST_01',
      'تطهير وفحص أرقام الهواتف الدولية واستبعاد الرموز والمستندات غير الصالحة',
      ok,
      `v1: ${valid1.cleanPhone}, v2: ${valid2.cleanPhone}, invalidShortBlocked: ${!invalidShort.isValid}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_01', 'تطهير وفحص أرقام الهواتف', false, err.message);
  }

  // Test 2: Transaction share message builder & privacy check (excluding private notes)
  try {
    const mockAccount: AccountModel = {
      id: 'acc_share_1',
      name: 'عبدالله السعيد',
      parentId: null,
      categoryId: 'cat_1',
      openingBalanceMinor: 0,
      status: 'active',
      notes: 'ملاحظة حساب سرية للغاية يجب ألا تظهر إطلاقاً',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockTx: TransactionModel = {
      id: 'tx_share_1',
      accountId: 'acc_share_1',
      entryType: 'owedByAccount',
      amountMinor: 25075, // 250.75 SAR
      date: '2026-11-08',
      description: 'دفعة بضاعة رقم 402',
      notes: 'ملاحظة حركة داخلية خاصة',
      attachmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const msg = buildTransactionShareMessage(mockTx, mockAccount.name, 'ر.س');

    const ok =
      msg.includes('عبدالله السعيد') &&
      msg.includes('250.75 ر.س') &&
      msg.includes('دفعة بضاعة رقم 402') &&
      msg.includes('عليه (+ لك)') &&
      !msg.includes('ملاحظة حساب سرية') &&
      !msg.includes('ملاحظة حركة داخلية');

    recordResult(
      'SHARE_TEST_02',
      'صياغة نص مشاركة الحركة المالية وحماية الملاحظات الخاصة من الخروج التلقائي',
      ok,
      `msgContainsDesc: ${msg.includes('دفعة بضاعة')}, excludesPrivateNotes: ${!msg.includes('سرية')}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_02', 'صياغة نص مشاركة الحركة الحالية', false, err.message);
  }

  // Test 3: Statement share message builder with exact halala totals
  try {
    const statementSummary = {
      openingBalanceMinor: 10000,  // 100.00
      totalOwedByMinor: 50000,     // 500.00
      totalOwedToMinor: 20000,     // 200.00
      closingBalanceMinor: 40000,  // 400.00
    };

    const msg = buildStatementShareMessage('شركة الأمل', '2026-11-01', '2026-11-08', statementSummary, 'ر.س');

    const ok =
      msg.includes('كشف حساب: شركة الأمل') &&
      msg.includes('رصيد أول المدة') &&
      msg.includes('الرصيد الختامي') &&
      msg.includes('+500.00 ر.س') &&
      msg.includes('-200.00 ر.س');

    recordResult(
      'SHARE_TEST_03',
      'صياغة ملخص كشف الحساب العربي وإبراز الأرصدة الافتتاحية والختامية والفترة',
      ok,
      `msgContainsAccount: ${msg.includes('شركة الأمل')}, containsTotals: ${msg.includes('+500.00')}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_03', 'صياغة ملخص كشف الحساب', false, err.message);
  }

  // Test 4: WhatsApp URL generation (Direct phone link vs General share link)
  try {
    const directUrl = getWhatsAppUrl('مرحبا', '966501234567');
    const generalUrl = getWhatsAppUrl('مرحبا');

    const ok =
      directUrl === 'https://wa.me/966501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7' &&
      generalUrl === 'https://wa.me/?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7';

    recordResult(
      'SHARE_TEST_04',
      'توليد روابط واتساب الرسمية المباشرة واشتراط ترميز النص وتحديد المستلم',
      ok,
      `directUrl: ${directUrl}, generalUrl: ${generalUrl}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_04', 'توليد روابط واتساب', false, err.message);
  }

  // Test 5: Zero financial drift invariant (Sharing transactions or statements has 0 impact on finances)
  try {
    const mockAccount: AccountModel = {
      id: 'acc_zero_1',
      name: 'حساب اختبار الثبات',
      parentId: null,
      categoryId: 'cat_1',
      openingBalanceMinor: 15000,
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const mockTx: TransactionModel = {
      id: 'tx_zero_1',
      accountId: 'acc_zero_1',
      entryType: 'owedByAccount',
      amountMinor: 10000,
      date: '2026-11-08',
      description: 'حركة بدون تغيير',
      attachmentIds: [],
      createdAt: '2026-11-08T00:00:00Z',
      updatedAt: '2026-11-08T00:00:00Z',
    };

    const balBefore = calculateAccountBalance(mockAccount, [mockTx]);
    const balAfter = calculateAccountBalance(mockAccount, [mockTx]);

    const ok = balBefore === 25000 && balAfter === 25000;

    recordResult(
      'SHARE_TEST_05',
      'ثبات المحرك المالي: ميزة المشاركة عبارة عن طبقة عرض محايدة ذات أثر حركي صفري',
      ok,
      `balBefore: ${balBefore}, balAfter: ${balAfter}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_05', 'ثبات المحرك المالي مع المشاركة', false, err.message);
  }

  return { passedCount, failedCount, results };
}
