import React, { useEffect, useState } from 'react';
import { Download, Upload, ShieldCheck, AlertTriangle } from 'lucide-react';
import { validateBackupFile } from '../storage/backup_service.ts';
import { useOwnerAccess } from './OwnerAccessGate.tsx';
import type { BackupBundle } from '../domain/types.ts';

type CurrentLedger = { revision: number; bundle: BackupBundle | null };
const MAX_FILE_SIZE = 16 * 1024 * 1024;

export const OwnerBackupRestoreView: React.FC = () => {
  const access = useOwnerAccess();
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState('');
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function readCurrent(): Promise<CurrentLedger> {
    const response = await fetch('/api/owner/ledger', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('تعذر الاتصال ببيانات المالك.');
    const data = await response.json() as CurrentLedger;
    if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('تعذر التحقق من إصدار البيانات.');
    return data;
  }
  useEffect(() => {
    let active = true;
    void readCurrent().then((data) => {
      if (!active) return;
      const records = data.bundle?.data;
      setExisting(Boolean(records && ((records.accounts?.length || 0) > 0 ||
        (records.transactions?.length || 0) > 0 || (records.dues?.length || 0) > 0)));
    }).catch(() => { if (active) setNotice('تعذر فحص النسخة الحالية على الخادم.'); });
    return () => { active = false; };
  }, []);

  const exportOwner = async () => {
    setBusy(true); setNotice('');
    try {
      const data = await readCurrent();
      if (!data.bundle) { setNotice('لا توجد نسخة مالية محفوظة للمالك حتى الآن.'); return; }
      const blob = new Blob([JSON.stringify(data.bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'rakan_owner_backup_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setNotice('تم تجهيز النسخة الاحتياطية الخاصة للتحميل.');
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر تصدير النسخة الخاصة.');
    } finally { setBusy(false); }
  };

  const importOwner = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setNotice('');
    try {
      if (file.size > MAX_FILE_SIZE) throw new Error('الملف كبير جدًا للنقل الحالي. الحد 16 ميجابايت.');
      const contents = await file.text();
      const verified = await validateBackupFile(contents);
      if (!verified.isValid || !verified.bundle) {
        throw new Error(verified.error || 'ملف النسخة الاحتياطية غير صالح.');
      }
      const current = await readCurrent();
      const occupied = Boolean(current.bundle?.data && (
        current.bundle.data.accounts.length || current.bundle.data.transactions.length ||
        (current.bundle.data.dues?.length || 0)));
      if (occupied && confirm.trim() !== 'استبدال') {
        throw new Error('البيانات الحالية ليست فارغة. اكتب «استبدال» بعد تنزيل نسخة احتياطية منها.');
      }
      const response = await fetch('/api/owner/ledger', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': access.csrfToken },
        body: JSON.stringify({ expectedRevision: current.revision, bundle: verified.bundle }),
      });
      if (response.status === 409) throw new Error('تغيرت البيانات على جهاز آخر. لم تستبدل أي بيانات. حدّث الصفحة أولاً.');
      if (!response.ok) throw new Error('رفض الخادم الاستعادة ولم يغيّر النسخة الحالية.');
      setNotice('تم الحفظ المركزي بنجاح. تُحدَّث الآن مساحة المالك.');
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر استعادة البيانات.');
    } finally { setBusy(false); }
  };

  return (
    <section className="max-w-3xl mx-auto space-y-5" dir="rtl">
      <div className="rounded-2xl border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/30 p-5">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="w-5 h-5" /> <h2 className="text-lg font-bold">النسخ الاحتياطي الخاص بالمالك</h2>
        </div>
        <p className="mt-2 text-xs leading-7 text-slate-600 dark:text-slate-300">
          النسخ المستخرجة من هذا القسم تأتي حصراً من الخادم الخاص بعد تسجيل الدخول.
          لا تُقرأ بيانات الزوار المحلية ولا تُرفع تلقائيًا. للاحتفاظ ببيانات متصفح قديمة، صدّرها أولاً من وضع الزائر ثم اختر ملفها هنا صراحةً.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h3 className="font-bold text-sm">تنزيل نسخة المالك من MySQL</h3>
        <button type="button" disabled={busy} onClick={() => void exportOwner()}
          className="min-h-11 px-5 py-2 bg-emerald-700 text-white rounded-xl inline-flex items-center gap-2 text-sm disabled:opacity-50">
          <Download className="w-4 h-4" /> تنزيل النسخة الخاصة
        </button>
      </div>
      <form onSubmit={(e) => void importOwner(e)}
        className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="font-bold text-sm">استيراد نسخة مالية إلى MySQL</h3>
        <p className="text-xs text-slate-500 leading-6">
          يراجع الخادم سلامة جميع القيود والحركات البينية والاستحقاقات والمرفقات قبل استبدال البيانات. لا يوجد دمج تلقائي.
        </p>
        <input type="file" accept=".json,application/json"
          aria-label="اختر نسخة مالية بصيغة JSON"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-3" />
        {existing && (
          <div className="rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
            <p className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              توجد بيانات مالية خاصة محفوظة على الخادم. نزّل نسخة احتياطية أولًا ثم اكتب «استبدال» لتأكيد الاستبدال الكامل.
            </p>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)}
              aria-label="اكتب استبدال للتأكيد" placeholder="اكتب استبدال"
              className="w-full border rounded-lg p-2 text-sm bg-white dark:bg-slate-900" />
          </div>
        )}
        <button type="submit" disabled={busy || !file || (existing && confirm.trim() !== 'استبدال')}
          className="min-h-11 px-5 py-2 bg-purple-700 text-white rounded-xl inline-flex items-center gap-2 text-sm disabled:opacity-50">
          <Upload className="w-4 h-4" /> فحص واستعادة النسخة على الخادم
        </button>
      </form>
      {notice && <p role="status" className="text-xs text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 p-3">{notice}</p>}
    </section>
  );
};
