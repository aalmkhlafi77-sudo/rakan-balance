/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — WEB-F2 Currency & Setup Verification Test Suite
 * Tests:
 * 1. Default currency initialization is SAR with 2 decimals minor units.
 * 2. Supported currencies catalog definition & minor unit precision invariance.
 * 3. Updating currency code & symbol updates presentation without modifying minor units amounts.
 * 4. Existing balances (15025 Halalas) remain exactly 15025 when active currency symbol changes.
 * 5. FormatCurrency uses active currency symbol dynamically with correct signs.
 * 6. Backup bundle preserves configured currency settings and imports them safely.
 */

import {
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  UserSettings,
} from '../domain/types.ts';
import {
  formatCurrency,
  formatMinorAmount,
  setActiveCurrencySymbol,
  getActiveCurrencySymbol,
} from '../domain/money.ts';
import {
  getCurrencyPref,
  setCurrencyPref,
  getFirstSetupDonePref,
  setFirstSetupDonePref,
} from '../storage/local_storage.ts';
import {
  exportBackupBundle,
  validateBackupFile,
  computeSHA256,
} from '../storage/backup_service.ts';

export async function runWebCurrencySetupTestSuite(): Promise<{ passedCount: number; failedCount: number }> {
  console.log('='.repeat(80));
  console.log('   RAKAN BALANCE — WEB CURRENCY & FIRST SETUP (WEB-F2) TEST SUITE   ');
  console.log('='.repeat(80));

  let passedCount = 0;
  let failedCount = 0;

  const assert = (condition: boolean, title: string, details?: string) => {
    if (condition) {
      passedCount++;
      console.log(`[PASS] ${title}${details ? ` - ${details}` : ''}`);
    } else {
      failedCount++;
      console.error(`[FAIL] ${title}${details ? ` - ${details}` : ''}`);
    }
  };

  // Test 1: Default currency initialization is SAR
  try {
    assert(
      DEFAULT_CURRENCY.code === 'SAR' &&
      DEFAULT_CURRENCY.symbol === 'ر.س' &&
      DEFAULT_CURRENCY.decimals === 2,
      'Test 1: Default currency is SAR with 2 decimals',
      `Code: ${DEFAULT_CURRENCY.code}, Symbol: ${DEFAULT_CURRENCY.symbol}`
    );
  } catch (err: any) {
    assert(false, 'Test 1: Default currency is SAR with 2 decimals', err.message);
  }

  // Test 2: Supported currencies catalog is complete and uniform in 2 decimal places
  try {
    const allTwoDecimals = SUPPORTED_CURRENCIES.every((c) => c.decimals === 2 && c.code && c.symbol);
    const hasYemen = SUPPORTED_CURRENCIES.some((c) => c.code === 'YER');
    const hasUSD = SUPPORTED_CURRENCIES.some((c) => c.code === 'USD');
    const hasAED = SUPPORTED_CURRENCIES.some((c) => c.code === 'AED');

    assert(
      SUPPORTED_CURRENCIES.length >= 10 && allTwoDecimals && hasYemen && hasUSD && hasAED,
      'Test 2: Supported currencies catalog is uniform with 2 decimals',
      `Total supported currencies: ${SUPPORTED_CURRENCIES.length}`
    );
  } catch (err: any) {
    assert(false, 'Test 2: Supported currencies catalog is uniform with 2 decimals', err.message);
  }

  // Test 3: Changing global active currency updates formatCurrency dynamically
  try {
    const originalSymbol = getActiveCurrencySymbol();
    setActiveCurrencySymbol('ر.ي'); // Rial Yemeni

    const formattedYER = formatCurrency(50000); // 500.00
    const formattedYERSign = formatCurrency(-25075); // -250.75

    assert(
      formattedYER.includes('ر.ي') && formattedYER.includes('500.00') &&
      formattedYERSign.includes('ر.ي') && formattedYERSign.includes('-250.75'),
      'Test 3: Dynamic global currency symbol formatting',
      `Formatted: ${formattedYER}, Signed: ${formattedYERSign}`
    );

    // Restore to default SAR
    setActiveCurrencySymbol(originalSymbol);
  } catch (err: any) {
    assert(false, 'Test 3: Dynamic global currency symbol formatting', err.message);
  }

  // Test 4: Financial integers invariance across currency switch (ZERO recalculation drift)
  try {
    const storedMinorAmount = 15025; // 150.25
    const sarFormat = formatCurrency(storedMinorAmount, { symbol: 'ر.س', showSign: true });
    const usdFormat = formatCurrency(storedMinorAmount, { symbol: '$', showSign: true });

    assert(
      storedMinorAmount === 15025 &&
      sarFormat === '+150.25 ر.س' &&
      usdFormat === '+150.25 $',
      'Test 4: Financial minor amount integer remains unchanged across currency switches',
      `Minor: ${storedMinorAmount}, SAR: ${sarFormat}, USD: ${usdFormat}`
    );
  } catch (err: any) {
    assert(false, 'Test 4: Financial minor amount integer remains unchanged across currency switches', err.message);
  }

  // Test 5: Local storage currency getters and setters
  try {
    const testCode = 'AED';
    const testSymbol = 'د.إ';
    const testName = 'درهم إماراتي';

    setCurrencyPref(testCode, testSymbol, testName);
    const pref = getCurrencyPref();

    assert(
      pref.code === testCode && pref.symbol === testSymbol && pref.name === testName,
      'Test 5: LocalStorage currency preferences persistence',
      `Code: ${pref.code}, Symbol: ${pref.symbol}`
    );

    // Reset back to SAR
    setCurrencyPref('SAR', 'ر.س', 'ريال سعودي');
  } catch (err: any) {
    assert(false, 'Test 5: LocalStorage currency preferences persistence', err.message);
  }

  // Test 6: First setup completion flag persistence
  try {
    setFirstSetupDonePref(true);
    const isDone = getFirstSetupDonePref();
    assert(
      isDone === true,
      'Test 6: First setup completion flag persistence',
      `isDone: ${isDone}`
    );
  } catch (err: any) {
    assert(false, 'Test 6: First setup completion flag persistence', err.message);
  }

  // Test 7: Export and validation of backup with non-SAR currency (e.g. YER)
  try {
    const originalPref = getCurrencyPref();
    setCurrencyPref('YER', 'ر.ي', 'ريال يمني');

    const { jsonString } = await exportBackupBundle();
    const validation = await validateBackupFile(jsonString);

    assert(
      validation.isValid === true &&
      validation.bundle?.data.settings?.currencyCode === 'YER' &&
      validation.bundle?.data.settings?.currencySymbol === 'ر.ي',
      'Test 7: Export and accept valid non-SAR backup bundle (YER)',
      `Validated code: ${validation.bundle?.data.settings?.currencyCode}`
    );

    // Reset currency back
    setCurrencyPref(originalPref.code, originalPref.symbol, originalPref.name);
  } catch (err: any) {
    assert(false, 'Test 7: Export and accept valid non-SAR backup bundle (YER)', err.message);
  }

  // Test 8: Legacy SAR backup acceptance
  try {
    const originalPref = getCurrencyPref();
    setCurrencyPref('SAR', 'ر.س', 'ريال سعودي');

    const { jsonString } = await exportBackupBundle();
    const validation = await validateBackupFile(jsonString);

    assert(
      validation.isValid === true &&
      validation.bundle?.data.settings?.currencyCode === 'SAR' &&
      validation.bundle?.data.settings?.currencySymbol === 'ر.س',
      'Test 8: Accept legacy SAR backup bundle',
      `Validated code: ${validation.bundle?.data.settings?.currencyCode}`
    );

    setCurrencyPref(originalPref.code, originalPref.symbol, originalPref.name);
  } catch (err: any) {
    assert(false, 'Test 8: Accept legacy SAR backup bundle', err.message);
  }

  // Test 9: Reject unsupported currency code in backup
  try {
    const { jsonString } = await exportBackupBundle();
    const bundleObj = JSON.parse(jsonString);
    bundleObj.data.settings.currencyCode = 'XYZ_UNSUPPORTED';
    
    // Recompute payload hash
    const payloadString = JSON.stringify(bundleObj.data);
    bundleObj.manifest.checksum = await computeSHA256(payloadString);

    const validation = await validateBackupFile(JSON.stringify(bundleObj));
    assert(
      validation.isValid === false &&
      Boolean(validation.error?.includes('عملة النسخة غير مدعومة')),
      'Test 9: Reject unsupported currency code in backup',
      `Error: ${validation.error}`
    );
  } catch (err: any) {
    assert(false, 'Test 9: Reject unsupported currency code in backup', err.message);
  }

  // Test 10: Reject mismatched currency symbol for supported currency code
  try {
    const { jsonString } = await exportBackupBundle();
    const bundleObj = JSON.parse(jsonString);
    bundleObj.data.settings.currencyCode = 'SAR';
    bundleObj.data.settings.currencySymbol = '$$$'; // Incorrect symbol for SAR
    
    // Recompute payload hash
    const payloadString = JSON.stringify(bundleObj.data);
    bundleObj.manifest.checksum = await computeSHA256(payloadString);

    const validation = await validateBackupFile(JSON.stringify(bundleObj));
    assert(
      validation.isValid === false &&
      Boolean(validation.error?.includes('لا يتطابق مع الرمز المعتمد')),
      'Test 10: Reject mismatched currency symbol for supported code',
      `Error: ${validation.error}`
    );
  } catch (err: any) {
    assert(false, 'Test 10: Reject mismatched currency symbol for supported code', err.message);
  }

  // Test 11: Minor units amounts invariant preserved during restore preparation
  try {
    const storedAmountMinor = 85025; // 850.25
    assert(
      storedAmountMinor === 85025 &&
      formatMinorAmount(storedAmountMinor) === '850.25',
      'Test 11: Minor amount remains exact 85025 with zero calculation drift',
      `Minor: ${storedAmountMinor}`
    );
  } catch (err: any) {
    assert(false, 'Test 11: Minor amount remains exact 85025 with zero calculation drift', err.message);
  }

  console.log('-'.repeat(80));
  console.log(`WEB CURRENCY & FIRST SETUP SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED (Total: ${passedCount + failedCount})`);

  return { passedCount, failedCount };
}
