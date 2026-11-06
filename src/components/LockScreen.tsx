/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Local Lock Screen
 * PIN protection for shared devices with clean keypad and verification feedback
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { Lock, Delete, ArrowRight, ShieldCheck } from 'lucide-react';

export const LockScreen: React.FC = () => {
  const { unlockWithPin, settings } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKeyPress = (digit: string) => {
    if (pin.length < 8) {
      setPin((prev) => prev + digit);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin) return;
    setIsSubmitting(true);
    const success = await unlockWithPin(pin);
    setIsSubmitting(false);
    if (!success) {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-2xl text-center text-slate-100">
        <div className="w-14 h-14 mx-auto mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center text-emerald-400">
          <Lock className="w-7 h-7" />
        </div>

        <h1 className="text-xl font-bold tracking-tight mb-1">راكان بلانس | RAKAN BALANCE</h1>
        <p className="text-xs text-slate-400 mb-6">
          تطبيق الذمم الشخصية مقفل محلياً لحماية خصوصيتك
        </p>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-3 mb-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                i < pin.length
                  ? 'bg-emerald-400 scale-110 shadow-sm shadow-emerald-400/50'
                  : 'bg-slate-700 border border-slate-600'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-rose-400 font-medium mb-4 animate-shake">
            رمز المرور غير صحيح، يرجى المحاولة مرة أخرى.
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto mb-5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
              className="h-12 rounded-xl bg-slate-700/60 hover:bg-slate-700 active:bg-slate-600 border border-slate-600/40 text-lg font-mono font-medium text-slate-100 transition-colors shadow-sm cursor-pointer"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-12 rounded-xl bg-slate-800/80 hover:bg-slate-700/50 text-xs text-slate-400 border border-slate-700/50 transition-colors cursor-pointer"
          >
            مسح
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="h-12 rounded-xl bg-slate-700/60 hover:bg-slate-700 active:bg-slate-600 border border-slate-600/40 text-lg font-mono font-medium text-slate-100 transition-colors shadow-sm cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-12 rounded-xl bg-slate-800/80 hover:bg-slate-700/50 flex items-center justify-center text-slate-300 border border-slate-700/50 transition-colors cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={pin.length === 0 || isSubmitting}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-950/40"
        >
          <span>فتح التطبيق</span>
          <ArrowRight className="w-4 h-4 rotate-180" />
        </button>

        <div className="mt-5 pt-4 border-t border-slate-700/50 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/70" />
          <span>حماية محلية على هذا المتصفح للمالك: {settings.ownerName}</span>
        </div>
      </div>
    </div>
  );
};
