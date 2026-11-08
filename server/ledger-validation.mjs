/**
 * Defensive boundary for the owner's financial snapshot.
 * All values are in integer minor units; never trust browser-only validation.
 * Phase B consciously rejects all demo records and all auth/PIN secrets.
 */
const MAX_SAFE_MINOR = 900_000_000_000_000;
const KINDS = ['accounts', 'categories', 'transactions', 'attachments', 'notes', 'dues', 'allocations', 'reminders'];
const ACCOUNT_STATES = new Set(['active', 'archived']);
const ENTRY_TYPES = new Set(['owedByAccount', 'owedToAccount']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T/;
const CODES = new Set(['SAR','YER','AED','QAR','OMR','BHD','KWD','EGP','JOD','USD','EUR','GBP','TRY']);
const maxCounts = {accounts:50000,categories:1000,transactions:100000,attachments:3000,notes:25000,dues:100000,allocations:100000,reminders:100000};

export class InvalidLedger extends Error {
  constructor(message) { super(message); this.name = 'InvalidLedger'; }
}
function bad(message) { throw new InvalidLedger(message); }
function obj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function str(x, max = 5000, blank = false) {
  return typeof x === 'string' && x.length <= max && (blank || x.trim().length > 0);
}
function key(x) { return str(x,128) && !/[\u0000-\u001f]/.test(x); }
function money(x, zero = false, signed = false) {
  return Number.isSafeInteger(x) && (signed ? Math.abs(x) <= MAX_SAFE_MINOR : x >= (zero ? 0 : 1) && x <= MAX_SAFE_MINOR);
}
function date(x) {
  if (!str(x,10) || !DATE.test(x)) return false;
  const d = new Date(x + 'T00:00:00.000Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === x;
}
function iso(x) { return str(x,45) && ISO.test(x) && !Number.isNaN(Date.parse(x)); }
function records(data, name) {
  if (!Array.isArray(data[name]) || data[name].length > maxCounts[name]) bad('invalid_' + name);
  const ids = new Map();
  for (const row of data[name]) {
    if (!obj(row) || !key(row.id) || ids.has(row.id) || row.isDemo === true) bad('invalid_or_duplicate_' + name);
    ids.set(row.id,row);
  }
  return ids;
}
function stringOpt(x,max) { return x === undefined || str(x,max,true); }
function value(x) { return x === undefined || x === null || str(x, 3000, true); }

export function validateOwnerLedger(data) {
  if (!obj(data)) bad('invalid_ledger');
  for (const prop of Object.keys(data)) if (![...KINDS,'settings'].includes(prop)) bad('unexpected_ledger_property');
  const ids = Object.fromEntries(KINDS.map(k => [k, records(data,k)]));
  if (!obj(data.settings)) bad('invalid_settings');
  const settings = data.settings;
  if (Object.keys(settings).some(k => !['ownerName','currencyCode','currencySymbol','currencyName','currencyDecimals','isFirstSetupDone','theme','sidebarCollapsed'].includes(k))) bad('unsafe_settings');
  if (settings.currencyCode !== undefined && !CODES.has(settings.currencyCode)) bad('invalid_currency');
  if (settings.currencyDecimals !== undefined && settings.currencyDecimals !== 2) bad('invalid_minor_units');
  if (!stringOpt(settings.ownerName,120) || !stringOpt(settings.currencySymbol,20) ||
      !stringOpt(settings.currencyName,80) || (settings.theme !== undefined && !['dark','light'].includes(settings.theme)) ||
      (settings.sidebarCollapsed !== undefined && typeof settings.sidebarCollapsed !== 'boolean') ||
      (settings.isFirstSetupDone !== undefined && typeof settings.isFirstSetupDone !== 'boolean')) bad('invalid_settings_fields');
  for (const a of data.accounts) {
    if (!str(a.name,180) || !key(a.categoryId) || !ids.categories.has(a.categoryId) ||
        (a.parentId !== null && a.parentId !== undefined && (!key(a.parentId) || !ids.accounts.has(a.parentId))) ||
        !ACCOUNT_STATES.has(a.status) || !money(a.openingBalanceMinor,true,true) ||
        !stringOpt(a.phone,50) || !stringOpt(a.notes,3000) || !iso(a.createdAt) || !iso(a.updatedAt)) bad('invalid_account');
  }
  for (const c of data.categories) if (!str(c.name,180) || !Number.isSafeInteger(c.sortOrder) || c.sortOrder < 0) bad('invalid_category');
  // Trees cannot contain parent cycles; do not permit self-parenting.
  const visit = new Map();
  function walk(id) {
    const mark = visit.get(id);
    if (mark === 1) bad('account_cycle');
    if (mark === 2) return;
    visit.set(id,1);
    const parent = ids.accounts.get(id).parentId;
    if (parent) walk(parent);
    visit.set(id,2);
  }
  for (const id of ids.accounts.keys()) walk(id);

  const transfers = new Map();
  for (const t of data.transactions) {
    if (!ids.accounts.has(t.accountId) || !ENTRY_TYPES.has(t.entryType) ||
        !money(t.amountMinor) || !date(t.date) || !str(t.description,5000) ||
        !stringOpt(t.notes,5000) || !iso(t.createdAt) || !iso(t.updatedAt) ||
        !Array.isArray(t.attachmentIds) || t.attachmentIds.length > 50 ||
        t.attachmentIds.some(id => !key(id) || !ids.attachments.has(id)) ||
        new Set(t.attachmentIds).size !== t.attachmentIds.length) bad('invalid_transaction');
    if (t.transferId !== undefined) {
      if (!key(t.transferId) || !['source','destination'].includes(t.transferRole) ||
          !key(t.counterpartyAccountId) || t.counterpartyAccountId === t.accountId ||
          !ids.accounts.has(t.counterpartyAccountId)) bad('invalid_transfer');
      const list = transfers.get(t.transferId) || [];
      list.push(t);
      if (list.length > 2) bad('invalid_transfer_pair');
      transfers.set(t.transferId,list);
    } else if (t.transferRole !== undefined || t.counterpartyAccountId !== undefined) bad('orphan_transfer_meta');
  }
  for (const pair of transfers.values()) {
    if (pair.length !== 2) bad('incomplete_transfer');
    const src = pair.find(t => t.transferRole === 'source');
    const dst = pair.find(t => t.transferRole === 'destination');
    if (!src || !dst || src.accountId === dst.accountId ||
        src.counterpartyAccountId !== dst.accountId ||
        dst.counterpartyAccountId !== src.accountId ||
        src.entryType !== 'owedToAccount' || dst.entryType !== 'owedByAccount' ||
        src.amountMinor !== dst.amountMinor || src.date !== dst.date ||
        src.description !== dst.description) bad('invalid_transfer_pair');
  }
  for (const att of data.attachments) {
    const tx = ids.transactions.get(att.transactionId);
    if (!tx || !tx.attachmentIds.includes(att.id) ||
        !str(att.originalName,250) || !str(att.mimeType,120) || !money(att.size,true) ||
        att.size > 10 * 1024 * 1024 ||
        !str(att.dataUrl,14 * 1024 * 1024) ||
        !/^data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/.test(att.dataUrl) ||
        !iso(att.createdAt)) bad('invalid_attachment');
  }
  for (const n of data.notes) {
    if (!str(n.title,500) || !str(n.content,20000,true) ||
        !['emerald','amber','rose','blue','purple','slate'].includes(n.color) ||
        typeof n.archived !== 'boolean' || !iso(n.createdAt) || !iso(n.updatedAt)) bad('invalid_note');
  }
  for (const d of data.dues) {
    if (!ids.accounts.has(d.accountId) || !ENTRY_TYPES.has(d.entryType) ||
        !date(d.dueDate) || !money(d.originalAmountMinor) ||
        !money(d.settledAmountMinor,true) || d.settledAmountMinor > d.originalAmountMinor ||
        !['pending','partially_settled','settled','overdue'].includes(d.status) ||
        (d.sourceTransactionId !== undefined && !ids.transactions.has(d.sourceTransactionId)) ||
        !value(d.notes) || !iso(d.createdAt) || !iso(d.updatedAt)) bad('invalid_due');
    if (d.settledAmountMinor === d.originalAmountMinor && d.status !== 'settled') bad('due_status_inconsistent');
    if (d.settledAmountMinor > 0 && d.settledAmountMinor < d.originalAmountMinor && d.status !== 'partially_settled') bad('due_status_inconsistent');
    if (d.settledAmountMinor === 0 && !['pending','overdue'].includes(d.status)) bad('due_status_inconsistent');
  }
  const paymentSum = new Map();
  for (const a of data.allocations) {
    const due = ids.dues.get(a.dueItemId);
    const tx = ids.transactions.get(a.paymentTransactionId);
    if (!due || !tx || !money(a.amountMinor) ||
        tx.accountId !== due.accountId || tx.entryType === due.entryType || tx.transferId) bad('invalid_allocation');
    paymentSum.set(a.dueItemId, (paymentSum.get(a.dueItemId)||0) + a.amountMinor);
    if (paymentSum.get(a.dueItemId) > MAX_SAFE_MINOR) bad('allocation_overflow');
  }
  for (const d of data.dues) {
    if ((paymentSum.get(d.id)||0) !== d.settledAmountMinor) bad('due_allocation_mismatch');
  }
  for (const rem of data.reminders) {
    if (!ids.dues.has(rem.dueItemId) || !date(rem.remindAt) ||
        !str(rem.templateText,5000) || typeof rem.isCompleted !== 'boolean' ||
        (rem.channel !== undefined && rem.channel !== 'manual')) bad('invalid_reminder');
  }
  return data;
}
