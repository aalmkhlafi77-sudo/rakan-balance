/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Web CSV/XLSX Ledger Import View
 * Stage WEB-F1: Import accounts & movements from Excel and CSV files with previewing & atomic execution.
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  parseAndPreviewFile,
  LedgerImportPreview,
  LedgerImportCommitResult,
  buildIssuesCsv,
  buildCommitReportCsv,
  buildAccountsCsvTemplate,
  buildTransactionsCsvTemplate,
  buildXlsxTemplate,
} from '../domain/web_ledger_import.ts';
import { formatHalalaAmount } from '../domain/money.ts';
import {
  UploadCloud,
  FileSpreadsheet,
  ReceiptText,
  FileText,
  AlertTriangle,
  CheckCircle,
  Download,
  AlertCircle,
  FileCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const ImportView: React.FC = () => {
  const { accounts, transactions, activeScope, importLedger } = useApp();

  const [preview, setPreview] = useState<LedgerImportPreview | null>(null);
  const [lastCommittedPreview, setLastCommittedPreview] = useState<LedgerImportPreview | null>(null);
  const [lastResult, setLastResult] = useState<LedgerImportCommitResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isSuccess: boolean } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (file.size > 15 * 1024 * 1024) {
      setStatusMessage({ text: 'حجم ملف الاستيراد يتجاوز 15 ميغابايت.', isSuccess: false });
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    setPreview(null);
    setLastCommittedPreview(null);
    setLastResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const parsedPreview = await parseAndPreviewFile({
        buffer,
        fileName: file.name,
        existingAccounts: accounts,
        existingTransactions: transactions,
      });

      setPreview(parsedPreview);

      if (parsedPreview.blockingIssues.length > 0) {
        setStatusMessage({
          text: `المعاينة اكتملت مع ${parsedPreview.blockingIssues.length} خطأ مانع. لن يتم تعديل قاعدة البيانات.`,
          isSuccess: false,
        });
      } else {
        setStatusMessage({
          text: `المعاينة جاهزة: ${parsedPreview.importableAccounts} حساب جديد و ${parsedPreview.importableTransactions} حركة جديدة.`,
          isSuccess: true,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: `تعذر تحليل ملف الاستيراد: ${err.message || err}`,
        isSuccess: false,
      });
    } finally {
      setIsBusy(false);
      // Reset input value so re-selecting same file works
      e.target.value = '';
    }
  };

  const handleCommitImport = async () => {
    if (!preview || !preview.canCommit || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await importLedger(preview);
      setLastCommittedPreview(preview);
      setLastResult(result);
      setPreview(null);
      setConfirmModalOpen(false);
      setStatusMessage({
        text: `تم الاستيراد ذريًا بنجاح: ${result.importedAccounts} حساب و ${result.importedTransactions} حركة (تجاهل ${result.skippedAccounts} حساب و ${result.skippedTransactions} حركة).`,
        isSuccess: true,
      });
    } catch (err: any) {
      setStatusMessage({
        text: `فشل تنفيذ الاستيراد وتراجعت قاعدة البيانات بالكامل: ${err.message || err}`,
        isSuccess: false,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadFile = (content: string | Uint8Array, fileName: string, mimeType: string) => {
    const blob = new Blob([content as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAccountsCsvTemplate = () => {
    const csv = buildAccountsCsvTemplate();
    downloadFile(csv, 'rakan_accounts_template.csv', 'text/csv;charset=utf-8;');
  };

  const downloadTransactionsCsvTemplate = () => {
    const csv = buildTransactionsCsvTemplate();
    downloadFile(csv, 'rakan_transactions_template.csv', 'text/csv;charset=utf-8;');
  };

  const downloadXlsxTemplate = () => {
    const bytes = buildXlsxTemplate();
    downloadFile(
      bytes,
      'rakan_ledger_template.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  };

  const downloadIssuesReport = () => {
    if (!preview) return;
    const csv = buildIssuesCsv(preview);
    downloadFile(csv, 'rakan_import_validation.csv', 'text/csv;charset=utf-8;');
  };

  const downloadCommitReport = () => {
    if (!lastCommittedPreview || !lastResult) return;
    const csv = buildCommitReportCsv(lastCommittedPreview, lastResult);
    downloadFile(csv, 'rakan_import_result.csv', 'text/csv;charset=utf-8;');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>استيراد الحسابات والحركات (CSV / Excel)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            المعاينة لا تغيّر البيانات. التنفيذ النهائي ذري (All-or-Nothing): إما تُعتمد الدفعة كاملة أو تُلغى بالكامل عند أي خطأ.
          </p>
        </div>
      </div>

      {/* Scope Warning Banner if Demo */}
      {activeScope === 'demo' && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            أنت حالياً في المساحة التجريبية. يمكنك معاينة واستيراد البيانات هنا للاختبار، وتعتمد الحفظ في المساحة التجريبية الحالية.
          </div>
        </div>
      )}

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
            statusMessage.isSuccess
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
          }`}
        >
          {statusMessage.isSuccess ? (
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          )}
          <div className="font-semibold">{statusMessage.text}</div>
        </div>
      )}

      {/* Primary Action Card: Upload File & Templates */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
              اختر ملف الاستيراد (.csv, .xlsx, .xls)
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              يدعم الملفات التي تحتوي على جداول الحسابات والحركات بالعربية والإنجليزية (UTF-8)
            </div>
          </div>

          <label className="relative inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer transition-colors disabled:opacity-50">
            {isBusy ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>جاري معالجة الملف...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <UploadCloud className="w-4 h-4" />
                <span>اختيار ملف للمعاينة</span>
              </span>
            )}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={isBusy}
              className="hidden"
            />
          </label>
        </div>

        {/* Downloadable Templates Section */}
        <div>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>قوالب تعبئة البيانات المعتمدة:</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={downloadAccountsCsvTemplate}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>قالب الحسابات CSV</span>
            </button>

            <button
              onClick={downloadTransactionsCsvTemplate}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <ReceiptText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>قالب الحركات CSV</span>
            </button>

            <button
              onClick={downloadXlsxTemplate}
              className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 border border-emerald-200 dark:border-emerald-800 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>قالب Excel شامل (أوراق الحسابات والحركات)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Last Result Card */}
      {lastCommittedPreview && lastResult && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
              ✓
            </div>
            <div>
              <div className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                اكتمل الاستيراد الذري بنجاح
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                تم حفظ {lastResult.importedAccounts} حساب و {lastResult.importedTransactions} حركة مصلحة في قاعدة البيانات.
              </div>
            </div>
          </div>

          <button
            onClick={downloadCommitReport}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل تقرير النتيجة CSV</span>
          </button>
        </div>
      )}

      {/* Preview Section */}
      {preview && (
        <div className="space-y-6">
          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                حسابات جديدة
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {preview.importableAccounts}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                حركات جديدة
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {preview.importableTransactions}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                سجلات مكررة
              </div>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {preview.duplicateAccounts + preview.duplicateTransactions}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                أخطاء مانعة
              </div>
              <div className={`text-xl font-bold mt-1 ${
                preview.blockingIssues.length > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {preview.blockingIssues.length}
              </div>
            </div>
          </div>

          {/* Validation Issues Log */}
          {preview.issues.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>الملاحظات والأخطاء التشخيصية ({preview.issues.length})</span>
                </div>

                <button
                  onClick={downloadIssuesReport}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل التقرير CSV</span>
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {preview.issues.slice(0, 40).map((issue, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl text-xs flex items-start gap-2.5 border ${
                      issue.blocking
                        ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300'
                        : 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] shrink-0 ${
                      issue.blocking
                        ? 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100'
                        : 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100'
                    }`}>
                      {issue.blocking ? 'مرفوض' : 'تنبيه'}
                    </span>
                    <div className="flex-1">
                      <span className="font-bold">[{issue.section}] صف {issue.rowNumber}:</span>{' '}
                      <span>{issue.message}</span>
                    </div>
                  </div>
                ))}
                {preview.issues.length > 40 && (
                  <div className="text-center text-xs text-slate-400 py-1">
                    توجد {preview.issues.length - 40} ملاحظة إضافية في تقرير التحقق CSV.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Accounts Preview Table */}
          {preview.accounts.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center justify-between">
                <span>معاينة الحسابات المستوردة ({preview.accounts.length})</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  {preview.importableAccounts} جديد · {preview.duplicateAccounts} مكرر
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">الصف</th>
                      <th className="px-4 py-3">المرجع الخارجي</th>
                      <th className="px-4 py-3">اسم الحساب</th>
                      <th className="px-4 py-3">التصنيف</th>
                      <th className="px-4 py-3">الرصيد الافتتاحي</th>
                      <th className="px-4 py-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {preview.accounts.slice(0, 10).map((acc, idx) => (
                      <tr key={idx} className={acc.duplicate ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''}>
                        <td className="px-4 py-2.5 font-mono text-slate-400">{acc.sourceRow}</td>
                        <td className="px-4 py-2.5 font-mono">{acc.externalRef || '—'}</td>
                        <td className="px-4 py-2.5 font-bold">{acc.name}</td>
                        <td className="px-4 py-2.5">{acc.categoryName}</td>
                        <td className="px-4 py-2.5 font-mono dir-ltr text-right">
                          {formatHalalaAmount(acc.openingBalanceMinor)} ر.س
                        </td>
                        <td className="px-4 py-2.5">
                          {acc.duplicate ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                              مكرر (يتجاهل)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                              جديد
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.accounts.length > 10 && (
                  <div className="p-3 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    يتم عرض أول 10 حسابات من أصل {preview.accounts.length}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transactions Preview Table */}
          {preview.transactions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center justify-between">
                <span>معاينة الحركات المستوردة ({preview.transactions.length})</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  {preview.importableTransactions} جديد · {preview.duplicateTransactions} مكرر
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">الصف</th>
                      <th className="px-4 py-3">مرجع الحساب</th>
                      <th className="px-4 py-3">الاتجاه</th>
                      <th className="px-4 py-3">المبلغ</th>
                      <th className="px-4 py-3">التاريخ</th>
                      <th className="px-4 py-3">البيان</th>
                      <th className="px-4 py-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {preview.transactions.slice(0, 10).map((tx, idx) => (
                      <tr key={idx} className={tx.duplicate ? 'bg-amber-50/30 dark:bg-amber-950/20' : ''}>
                        <td className="px-4 py-2.5 font-mono text-slate-400">{tx.sourceRow}</td>
                        <td className="px-4 py-2.5 font-bold">{tx.accountRef}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tx.entryType === 'owedByAccount'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                          }`}>
                            {tx.entryType === 'owedByAccount' ? 'لك (عليه)' : 'عليك (له)'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold">
                          {formatHalalaAmount(tx.amountMinor)} ر.س
                        </td>
                        <td className="px-4 py-2.5 font-mono">{tx.date}</td>
                        <td className="px-4 py-2.5">{tx.description}</td>
                        <td className="px-4 py-2.5">
                          {tx.duplicate ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                              مكرر (يتجاهل)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                              جديد
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.transactions.length > 10 && (
                  <div className="p-3 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    يتم عرض أول 10 حركات من أصل {preview.transactions.length}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Commit Action Button */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setConfirmModalOpen(true)}
              disabled={!preview.canCommit || isSubmitting}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FileCheck className="w-5 h-5" />
              <span>تنفيذ الاستيراد الذري بعد التحقق</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && preview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <FileCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تأكيد الاستيراد الذري (All-or-Nothing)
              </h3>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
              <p>
                سيتم حفظ <strong className="text-emerald-600 dark:text-emerald-400">{preview.importableAccounts} حساب جديد</strong> و{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">{preview.importableTransactions} حركة جديدة</strong> في عملية واحدة مباشرة داخل قاعدة البيانات المحلية.
              </p>
              {preview.duplicateAccounts + preview.duplicateTransactions > 0 && (
                <p className="text-amber-700 dark:text-amber-400 font-semibold">
                  • سيتم تجنّب وتجاهل {preview.duplicateAccounts} حساب مكرر و {preview.duplicateTransactions} حركة مكررة أوتوماتيكياً.
                </p>
              )}
              <p className="text-slate-400">
                إذا حدث أي خطأ أثناء الحفظ، ستتراجع العملية كاملة ولن يتم تعديل قاعدة البيانات جزئياً.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>

              <button
                onClick={handleCommitImport}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>جاري التنفيذ...</span>
                  </>
                ) : (
                  <span>تأكيد واعتماد الاستيراد</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
