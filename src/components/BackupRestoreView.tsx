/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Backup, Atomic Restore & Demo Manager
 * Single transaction All-or-Nothing restore, rollback snapshot, SHA-256 verification
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  downloadBackupFile,
  exportBackupBundle,
  validateBackupFile,
} from '../storage/backup_service.ts';
import { BackupBundle, BackupManifest } from '../domain/types.ts';
import {
  HardDriveDownload,
  Upload,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  FileCheck,
  Trash2,
  FlaskConical,
  Database,
  Layers,
} from 'lucide-react';

export const BackupRestoreView: React.FC = () => {
  const {
    accounts,
    transactions,
    categories,
    attachments,
    notes,
    activeScope,
    atomicRestoreData,
    rollbackLastRestore,
    purgeDemoData,
    loadDemoData,
  } = useApp();

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Staging Restore State
  const [stagedBundle, setStagedBundle] = useState<BackupBundle | null>(null);
  const [stagedCounts, setStagedCounts] = useState<BackupManifest['recordCounts'] | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState<string | null>(null);

  // Demo purge confirmation
  const [demoPurged, setDemoPurged] = useState(false);

  // Export action
  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const { jsonString, filename } = await exportBackupBundle();
      downloadBackupFile(jsonString, filename);
      setExportSuccess(`تم تصدير النسخة الاحتياطية بنجاح: ${filename}`);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Upload & Validation
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidationError(null);
    setStagedBundle(null);
    setStagedCounts(null);
    setRestoreSuccess(false);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const res = await validateBackupFile(content);

      if (!res.isValid || !res.bundle) {
        setValidationError(res.error || 'الملف غير صالح للاستعادة.');
      } else {
        setStagedBundle(res.bundle);
        setStagedCounts(res.counts || null);
      }
    };
    reader.readAsText(file);
  };

  // Execute Atomic Restore
  const handleExecuteRestore = async () => {
    if (!stagedBundle) return;
    setIsRestoring(true);
    setValidationError(null);

    try {
      // Executes inside a single transaction with automatic snapshot
      const restoreResult = await atomicRestoreData(stagedBundle.data);
      if (restoreResult.preferenceError) {
        setValidationError(
          `تم استرجاع السجلات المالية بنجاح في قاعدة البيانات، ولكن تعذر تطبيق بعض تفضيلات العرض: ${restoreResult.preferenceError}`
        );
      }
      setRestoreSuccess(true);
      setStagedBundle(null);
      setStagedCounts(null);
    } catch (err: any) {
      setValidationError(err.message || 'فشلت عملية الاستعادة.');
    } finally {
      setIsRestoring(false);
    }
  };

  // Revert / Rollback to snapshot
  const handleRollback = async () => {
    try {
      const ok = await rollbackLastRestore();
      if (ok) {
        setRollbackSuccess('تمت العودة إلى نقطة الأمان السابقة بنجاح.');
      } else {
        setRollbackSuccess('لا توجد نقاط استرجاع سابقة متوفرة.');
      }
    } catch (err: any) {
      setRollbackSuccess(`تعذر الاسترجاع: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl" dir="rtl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          النسخ الاحتياطي والاستعادة الآمنة
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          نسخة احتياطية مع فحص سلامة البيانات باستخدام SHA-256 واستعادة ذرية كاملة (All-or-Nothing)
        </p>
      </div>

      {/* Grid: Export Card & Restore Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Export Backup */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <HardDriveDownload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  تصدير نسخة احتياطية كاملة
                </h3>
                <p className="text-[11px] text-slate-500">
                  توليد ملف بيانات محمي بتجزئة التحقق من السلامة SHA-256
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              يقوم بتصدير كامل الحسابات، الحركات، المرفقات، التصنيفات، والملاحظات في ملف واحد صالح للحفظ والنقل.
            </p>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 mb-5 font-mono">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>الحسابات والأطراف:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{accounts.length}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>الحركات المالية:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{transactions.length}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>المرفقات والمستندات:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{attachments.length}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>الملاحظات المستقلة:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{notes.length}</span>
              </div>
            </div>

            {exportSuccess && (
              <div className="p-2.5 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">{exportSuccess}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/30 cursor-pointer transition-all"
          >
            <HardDriveDownload className="w-4 h-4" />
            <span>{isExporting ? 'جاري إنشاء النسخة...' : 'تنزيل ملف النسخة الآن (JSON)'}</span>
          </button>
        </div>

        {/* Card 2: Atomic Restore Wizard */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  استعادة نسخة احتياطية
                </h3>
                <p className="text-[11px] text-slate-500">
                  فحص سلامة ثم استبدال ذري آمن
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              تتم الاستعادة عبر معاملة واحدة (All-or-Nothing) مسبوقة بأخذ نقطة رجوع فورية. في حال وجود أي خطأ يتم إلغاء العملية تلقائياً.
            </p>

            {/* File Input */}
            <div className="mb-4">
              <label className="block w-full p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/30">
                <Upload className="w-6 h-6 mx-auto mb-1 text-slate-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  اختر ملف النسخة الاحتياطية (.json)
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  انقر هنا لتحديد الملف من جهازك
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Validation Error */}
            {validationError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Restore Success */}
            {restoreSuccess && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>تمت الاستعادة بنجاح وتحديث كافة الأرصدة والسجلات بدقة.</span>
              </div>
            )}

            {/* Staged File Preview */}
            {stagedBundle && stagedCounts && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2 mb-4">
                <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>اجتاز فحص التجزئة (SHA-256) بنجاح</span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5 font-mono">
                  <div>تاريخ التصدير: {new Date(stagedBundle.manifest.exportedAt).toLocaleString('ar-SA')}</div>
                  <div>المحتويات: {stagedCounts.accounts} حسابات · {stagedCounts.transactions} حركات · {stagedCounts.attachments} مرفقات</div>
                </div>

                {stagedBundle.data.settings && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">الإعدادات غير الحساسة المستعادة:</span>
                    <div>• اسم المالك: {stagedBundle.data.settings.ownerName || 'بدون تغيير'}</div>
                    {stagedBundle.data.settings.theme && (
                      <div>• المظهر العام: {stagedBundle.data.settings.theme === 'dark' ? 'داكن' : 'فاتح'}</div>
                    )}
                    <div className="text-emerald-700 dark:text-emerald-400 pt-0.5">
                      ✓ يُستثنى رمز المرور (PIN) وأمان الجهاز المحلي لضمان عدم التلاعب بحماية الجلسة الحالية.
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>سيتم أخذ لقطة أمان واستبدال البيانات الحالية فوراً.</span>
                </div>
              </div>
            )}
          </div>

          {stagedBundle ? (
            <button
              type="button"
              onClick={handleExecuteRestore}
              disabled={isRestoring}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
            >
              <FileCheck className="w-4 h-4" />
              <span>{isRestoring ? 'جاري الاستبدال الذري...' : 'تأكيد وبدء الاستعادة الذرية'}</span>
            </button>
          ) : (
            <div className="text-center text-[11px] text-slate-400 py-2">
              بانتظار اختيار ملف نسخة صالح للتحقق...
            </div>
          )}
        </div>
      </div>

      {/* Safety Snapshot Rollback & Isolated Demo Manager */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Rollback Box */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2.5 mb-2">
            <RotateCcw className="w-4 h-4 text-slate-500" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              نقطة الأمان والرجوع (Rollback Point)
            </h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            قبل أي عملية استعادة، ينشئ التطبيق لقطة سريعة لحالتك السابقة. إذا قمت باستعادة ملف بالخطأ، يمكنك الرجوع فوراً.
          </p>

          {rollbackSuccess && (
            <div className="p-2.5 mb-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300">
              {rollbackSuccess}
            </div>
          )}

          <button
            type="button"
            onClick={handleRollback}
            className="py-2 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>الرجوع للنسخة السابقة (Rollback)</span>
          </button>
        </div>

        {/* Developer-only preview manager: absent from release UI. */}
        {import.meta.env.DEV && <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2.5 mb-2">
            <FlaskConical className="w-4 h-4 text-amber-500" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              إدارة مساحة بيانات المعاينة (Demo Workspace)
            </h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">
            البيانات التجريبية محفوظة في مخزن مستقل تماماً (معزول في IndexedDB). تصفيرها لا يمس ولا يصل إلى بياناتك الحقيقية إطلاقاً.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await purgeDemoData();
                setDemoPurged(true);
                setTimeout(() => setDemoPurged(false), 3000);
              }}
              className="py-2 px-3.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>تصفير بيانات المعاينة</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await loadDemoData();
              }}
              className="py-2 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة شحن البيانات النموذجية</span>
            </button>
          </div>

          {demoPurged && (
            <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              تم تصفير مخزن البيانات التجريبية المعزول بنجاح.
            </div>
          )}
        </div>}
      </div>
    </div>
  );
};
