/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — LocalStorage Helper
 * STRICTLY restricted to non-sensitive display preferences as approved in plan:
 * - Theme (dark/light)
 * - Sidebar collapsed state
 * - Active workspace scope ('real' | 'demo')
 */

const KEYS = {
  THEME: 'rakan_theme_pref',
  SIDEBAR: 'rakan_sidebar_collapsed',
  ACTIVE_SCOPE: 'rakan_active_scope',
  PIN_HASH: 'rakan_pin_hash',
  PIN_SALT: 'rakan_pin_salt',
  OWNER_NAME: 'rakan_owner_name',
} as const;

export function getThemePref(): 'dark' | 'light' {
  const val = localStorage.getItem(KEYS.THEME);
  if (val === 'light' || val === 'dark') return val;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setThemePref(theme: 'dark' | 'light'): void {
  localStorage.setItem(KEYS.THEME, theme);
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function getSidebarCollapsedPref(): boolean {
  return localStorage.getItem(KEYS.SIDEBAR) === 'true';
}

export function setSidebarCollapsedPref(collapsed: boolean): void {
  localStorage.setItem(KEYS.SIDEBAR, collapsed ? 'true' : 'false');
}

export function getActiveScopePref(): 'real' | 'demo' {
  return (localStorage.getItem(KEYS.ACTIVE_SCOPE) as 'real' | 'demo') || 'real';
}

export function setActiveScopePref(scope: 'real' | 'demo'): void {
  localStorage.setItem(KEYS.ACTIVE_SCOPE, scope);
}

export function getOwnerNamePref(): string {
  return localStorage.getItem(KEYS.OWNER_NAME) || 'راكان';
}

export function setOwnerNamePref(name: string): void {
  localStorage.setItem(KEYS.OWNER_NAME, name);
}

export function getPinAuthPref(): { hash: string | null; salt: string | null } {
  return {
    hash: localStorage.getItem(KEYS.PIN_HASH),
    salt: localStorage.getItem(KEYS.PIN_SALT),
  };
}

export function setPinAuthPref(hash: string | null, salt: string | null): void {
  if (hash && salt) {
    localStorage.setItem(KEYS.PIN_HASH, hash);
    localStorage.setItem(KEYS.PIN_SALT, salt);
  } else {
    localStorage.removeItem(KEYS.PIN_HASH);
    localStorage.removeItem(KEYS.PIN_SALT);
  }
}
