import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LogOut, ShieldCheck, AlertCircle } from 'lucide-react';

type AccessState = 'checking' | 'visitor' | 'owner' | 'unavailable';
interface OwnerAccessContextValue {
  status: AccessState;
  openLogin: () => void;
}
const Context = createContext<OwnerAccessContextValue | null>(null);
export function useOwnerAccess(): OwnerAccessContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('OwnerAccessGate is required');
  return ctx;
}
interface Props {
  children: React.ReactNode;
}
export const OwnerAccessGate: React.FC<Props> = ({ children }) => {
  const [status, setStatus] = useState<AccessState>('checking');
  const [csrf, setCsrf] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [error, setError] = useState('');

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/status', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        setStatus('unavailable');
        return;
      }
      const data = await response.json();
      if (data.authenticated === true && typeof data.csrfToken === 'string') {
        setCsrf(data.csrfToken);
        setStatus('owner');
      } else {
        setCsrf('');
        setStatus('visitor');
      }
    } catch {
      setStatus('unavailable');
    }
  }, []);
  useEffect(() => { void checkSession(); }, [checkSession]);

  const openLogin = () => {
    if (status !== 'visitor') return;
    setPassword('');
    setError('');
    setLoginOpen(true);
  };
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loginBusy) return;
    setLoginBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? 'تم إيقاف المحاولات مؤقتاً. حاول لاحقاً.' :
          'تعذر تسجيل الدخول. تحقق من كلمة المرور.');
        return;
      }
      const data = await response.json();
      if (data.authenticated !== true || typeof data.csrfToken !== 'string') {
        setError('تعذر التحقق من جلسة المالك.');
        return;
      }
      setCsrf(data.csrfToken);
      setStatus('owner');
      setLoginOpen(false);
    } catch {
      setError('تعذر الاتصال بالخادم. لم تُحفَظ أي بيانات.');
    } finally {
      setPassword('');
      setLoginBusy(false);
    }
  };
  const logout = async () => {
    if (!csrf) return;
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'x-csrf-token': csrf },
      });
      if (response.status !== 204) {
        setError('تعذر تأكيد تسجيل الخروج. أعد المحاولة.');
        return;
      }
      setCsrf('');
      setPassword('');
      setStatus('visitor');
      setError('');
    } catch {
      setError('الخادم غير متاح؛ تعذر تأكيد إبطال الجلسة.');
    }
  };
  return (
    <Context.Provider value={{ status, openLogin }}>
      {status === 'checking' ? (
        <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
          <img src="/assets/rakan-icon-192.webp" width={64} height={64} alt="راكان بلانس" className="h-16 w-16 rounded-xl" />
          <p className="text-sm text-slate-600 dark:text-slate-300">جاري التحقق من حالة الاتصال...</p>
        </div>
      ) : status === 'owner' ? (
        <div dir="rtl" className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center px-4">
          <section className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-700 shadow-xl text-center space-y-4">
            <img src="/assets/rakan-icon-192.webp" alt="راكان بلانس" className="w-20 h-20 object-contain mx-auto rounded-xl" />
            <ShieldCheck aria-hidden="true" className="w-8 h-8 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-bold">مساحة المالك الخاصة</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-7">
              تم التحقق من تسجيل دخولك. لا تزال واجهة البيانات المالية الخاصة في مرحلة الربط بالخادم،
              ولذلك عُطّلت عملياتها مؤقتاً لحماية البيانات. لم يتم تحميل بيانات الزائر أو حفظ أي سجل خاص في متصفحه.
            </p>
            {error && <p role="alert" className="text-rose-600 text-xs">{error}</p>}
            <button type="button" onClick={() => void logout()}
              className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 text-white font-bold text-sm">
              <LogOut className="w-4 h-4" /> تسجيل الخروج
            </button>
          </section>
        </div>
      ) : children}
      {status === 'visitor' && loginOpen && (
        <div dir="rtl" role="dialog" aria-modal="true" aria-label="تسجيل دخول المالك"
          className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={(e) => void login(e)} className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
            <div className="text-center space-y-2">
              <LockKeyhole className="w-8 h-8 mx-auto text-emerald-600" />
              <h2 className="text-lg font-bold">دخول المالك الخاص</h2>
              <p className="text-xs text-slate-500">مساحة خاصة محمية بكلمة مرور على الخادم، ولا تتطلب إنشاء حسابات للزوار.</p>
            </div>
            <label className="block text-xs font-bold" htmlFor="owner-login-password">كلمة مرور المالك</label>
            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-xl px-3">
              <input id="owner-login-password" type={showPassword ? 'text' : 'password'}
                autoComplete="current-password" maxLength={128} required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full min-w-0 bg-transparent outline-none py-3 text-sm" />
              <button type="button" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                onClick={() => setShowPassword((v) => !v)} className="p-2">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p role="alert" className="flex items-center gap-2 text-xs text-rose-600">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>}
            <div className="flex gap-2">
              <button type="submit" disabled={loginBusy || !password}
                className="flex-1 min-h-11 bg-emerald-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                {loginBusy ? 'جاري التحقق...' : 'تسجيل الدخول'}
              </button>
              <button type="button" disabled={loginBusy} onClick={() => { setLoginOpen(false); setPassword(''); setError(''); }}
                className="min-h-11 px-4 border rounded-xl text-sm">إلغاء</button>
            </div>
          </form>
        </div>
      )}
    </Context.Provider>
  );
};
