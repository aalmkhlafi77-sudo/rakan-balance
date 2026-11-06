/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Automated Financial Rules Verification View
 * Interactive in-app test runner executing the 6 invariant test cases
 */

import React, { useState, useEffect } from 'react';
import { runFinancialVerificationSuite, TestResult } from '../domain/financial_rules_spec.ts';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  ShieldCheck,
  Check,
  Code2,
} from 'lucide-react';

export const VerificationModal: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(true);

  const executeTests = async () => {
    setIsRunning(true);
    try {
      const results = await runFinancialVerificationSuite();
      setTestResults(results);
    } catch (err) {
      console.error('Error running test suite:', err);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    runFinancialVerificationSuite().then((results) => {
      if (mounted) {
        setTestResults(results);
        setIsRunning(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const allPassed = testResults.length > 0 && testResults.every((t) => t.passed);

  return (
    <div className="space-y-6 max-w-4xl" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <span>فحص واختبار القواعد المالية</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                allPassed
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {allPassed
                ? `كافة الاختبارات ناجحة (${testResults.filter((t) => t.passed).length}/${testResults.length})`
                : `توجد إخفاقات (${testResults.filter((t) => !t.passed).length})`}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            التحقق البرمجي التلقائي من انضباط قواعد الرصيد والمعادلات الرياضية وعمليات التخزين الذرية والنسخ وعزل الملاحظات التجريبية
          </p>
        </div>

        <button
          type="button"
          onClick={executeTests}
          disabled={isRunning}
          className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 cursor-pointer transition-all"
        >
          <RotateCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
          <span>إعادة تشغيل حزمة الاختبارات</span>
        </button>
      </div>

      {/* Summary Banner */}
      <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
          <p className="font-bold mb-0.5">
            محرك الرصيد المالي النقي (Pure Domain Engine) يعمل بدقة الهللة:
          </p>
          <p className="text-emerald-800 dark:text-emerald-300">
            تم فحص قواعد الإشارات (عليه = +amountMinor، له = -amountMinor)، ومعادلة رصيد بداية الفترة، وعدم تضاعف أرصدة الحسابات الفرعية، وتطابق الأرقام مع لوحة التحكم وكشف الحساب والتصدير.
          </p>
        </div>
      </div>

      {/* Test Cases Accordion / List */}
      <div className="space-y-3">
        {testResults.map((test, idx) => (
          <div
            key={test.id}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {test.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-500" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-400">#{idx + 1}</span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {test.title}
                    </h3>
                  </div>

                  <div className="mt-2 space-y-1 text-xs">
                    <div className="text-slate-500">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">المتوقع: </span>
                      <span className="font-mono">{test.expected}</span>
                    </div>

                    <div className="text-slate-500">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">الناتج الفعلي: </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {test.actual}
                      </span>
                    </div>

                    {test.details && (
                      <p className="text-[11px] text-slate-400 pt-1">
                        {test.details}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <span
                  className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                    test.passed
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {test.passed ? 'PASSED' : 'FAILED'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
