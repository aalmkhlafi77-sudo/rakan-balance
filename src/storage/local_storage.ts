/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — LocalStorage Helper
 * STRICTLY restricted to non-sensitive display preferences as approved in plan:
 * - Theme (dark/light)
 * - Sidebar collapsed state
 * - Active workspace scope ('real' | 'demo')
 * - Owner name & Single local currency preferences
 * - Local PIN salt & hash
 */

const memoryStorage: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // fallback to memory
  }
  return memoryStorage[key] ?? null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fallback to memory
  }
  memoryStorage[key] = value;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {
    // fallback to memory
  }
  delete memoryStorage[key];
}

const KEYS = {
  THEME: 'rakan_theme_pref',
  SIDEBAR: 'rakan_sidebar_collapsed',
  ACTIVE_SCOPE: 'rakan_active_scope',
  PIN_HASH: 'rakan_pin_hash',
  PIN_SALT: 'rakan_pin_salt',
  OWNER_NAME: 'rakan_owner_name',
  CURRENCY_CODE: 'rakan_currency_code',
  CURRENCY_SYMBOL: 'rakan_currency_symbol',
  CURRENCY_NAME: 'rakan_currency_name',
  FIRST_SETUP_DONE: 'rakan_first_setup_done',
} as const;

export function getThemePref(): 'dark' | 'light' {
  const val = safeGetItem(KEYS.THEME);
  if (val === 'light' || val === 'dark') return val;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function setThemePref(theme: 'dark' | 'light'): void {
  safeSetItem(KEYS.THEME, theme);
  if (typeof document !== 'undefined') {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}

export function getSidebarCollapsedPref(): boolean {
  return safeGetItem(KEYS.SIDEBAR) === 'true';
}

export function setSidebarCollapsedPref(collapsed: boolean): void {
  safeSetItem(KEYS.SIDEBAR, collapsed ? 'true' : 'false');
}

export function getActiveScopePref(): 'real' | 'demo' {
  return (safeGetItem(KEYS.ACTIVE_SCOPE) as 'real' | 'demo') || 'real';
}

export function setActiveScopePref(scope: 'real' | 'demo'): void {
  safeSetItem(KEYS.ACTIVE_SCOPE, scope);
}

export function getOwnerNamePref(): string {
  return safeGetItem(KEYS.OWNER_NAME) || 'راكان';
}

export function setOwnerNamePref(name: string): void {
  safeSetItem(KEYS.OWNER_NAME, name);
}

export function getPinAuthPref(): { hash: string | null; salt: string | null } {
  return {
    hash: safeGetItem(KEYS.PIN_HASH),
    salt: safeGetItem(KEYS.PIN_SALT),
  };
}

export function setPinAuthPref(hash: string | null, salt: string | null): void {
  if (hash && salt) {
    safeSetItem(KEYS.PIN_HASH, hash);
    safeSetItem(KEYS.PIN_SALT, salt);
  } else {
    safeRemoveItem(KEYS.PIN_HASH);
    safeRemoveItem(KEYS.PIN_SALT);
  }
}

export function getCurrencyPref(): { code: string; symbol: string; name: string } {
  return {
    code: safeGetItem(KEYS.CURRENCY_CODE) || 'SAR',
    symbol: safeGetItem(KEYS.CURRENCY_SYMBOL) || 'ر.س',
    name: safeGetItem(KEYS.CURRENCY_NAME) || 'ريال سعودي',
  };
}

export function setCurrencyPref(code: string, symbol: string, name: string): void {
  safeSetItem(KEYS.CURRENCY_CODE, code);
  safeSetItem(KEYS.CURRENCY_SYMBOL, symbol);
  safeSetItem(KEYS.CURRENCY_NAME, name);
}

export function getFirstSetupDonePref(): boolean {
  return safeGetItem(KEYS.FIRST_SETUP_DONE) === 'true';
}

export function setFirstSetupDonePref(done: boolean): void {
  safeSetItem(KEYS.FIRST_SETUP_DONE, done ? 'true' : 'false');
}
