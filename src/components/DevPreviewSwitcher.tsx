/** Development-only switcher. Never imported into production bundles. */
import React from 'react';
import { useApp } from '../context/AppContext.tsx';
import { Layers, Shield, FlaskConical } from 'lucide-react';
export const DevPreviewSwitcher: React.FC = () => {
  const { activeScope, switchScope } = useApp();
  return (
    <div className="p-3 mx-3 my-2.5 rounded-xl border transition-colors bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>مساحة البيانات</span>
            </span>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                activeScope === 'demo'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
              }`}
            >
              {activeScope === 'demo' ? 'تجريبي معزول' : 'حقيقي محلي'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-200 dark:bg-slate-900 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => switchScope('real')}
              className={`py-1 rounded-md font-medium transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeScope === 'real'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Shield className="w-3 h-3 text-emerald-600" />
              <span>البيانات الحقيقية</span>
            </button>
            <button
              type="button"
              onClick={() => switchScope('demo')}
              className={`py-1 rounded-md font-medium transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeScope === 'demo'
                  ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <FlaskConical className="w-3 h-3 text-amber-500" />
              <span>بيانات المعاينة</span>
            </button>
          </div>
        </div>
  );
};
