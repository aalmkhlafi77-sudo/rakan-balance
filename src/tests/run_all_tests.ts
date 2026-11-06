/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Automated Test Suite Runner (CLI)
 * Executes all 8 verification tests in Node.js environment with fake-indexeddb
 */

import 'fake-indexeddb/auto';
import { runFinancialVerificationSuite } from '../domain/financial_rules_spec.ts';

async function main() {
  console.log('='.repeat(80));
  console.log('   RAKAN BALANCE — AUTOMATED VERIFICATION TEST SUITE (N0 MILESTONE)   ');
  console.log('='.repeat(80));
  console.log('Starting automated execution of all 8 core invariant tests...\n');

  const startTime = Date.now();
  const results = await runFinancialVerificationSuite();
  const elapsedMs = Date.now() - startTime;

  let passedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < results.length; i++) {
    const t = results[i];
    const statusTag = t.passed ? '[PASS]' : '[FAIL]';
    if (t.passed) {
      passedCount++;
    } else {
      failedCount++;
    }

    console.log(`${statusTag} #${i + 1}: ${t.title}`);
    console.log(`       المتوقع: ${t.expected}`);
    console.log(`       الفعلي : ${t.actual}`);
    if (t.details) {
      console.log(`       تفاصيل : ${t.details}`);
    }
    console.log('-'.repeat(80));
  }

  console.log('\n' + '='.repeat(80));
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED, 0 PENDING (Total: ${results.length})`);
  console.log(`Time elapsed: ${elapsedMs}ms`);
  console.log('='.repeat(80));

  if (failedCount > 0) {
    console.error(`\nFAILED: ${failedCount} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All 8 invariant tests passed successfully (100%).');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
