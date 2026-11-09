/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Accounts & Parties Directory
 * Tree hierarchy, category management, direct balance calculations, safe archiving & deletion guard
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { AccountModel } from '../domain/types.ts';
import { formatCurrency, fromMinorUnits, toMinorUnits } from '../domain/money.ts';
import { checkTreeCycle } from '../domain/balance_calculator.ts';
import { matchesPublicAccountSearch } from '../domain/account_privacy.ts';
import {
  Users,
  Plus,
  Search,
  FolderTree,
  List,
  Edit2,
  Archive,
  RefreshCw,
  Trash2,
  Phone,
  FileSpreadsheet,
  AlertTriangle,
  X,
  Check,
  CornerDownLeft,
  ArrowLeftRight,
  Shield,
  Info,
} from 'lucide-react';

interface AccountsViewProps {
  onOpenStatementForAccount: (accountId: string) => void;
  onOpenQuickTx: (accountId: string) => void;
  onOpenInterAccountTransfer?: (sourceAccountId?: string) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  onOpenStatementForAccount,
  onOpenQuickTx,
  onOpenInterAccountTransfer,
}) => {
  const {
    accounts,
    categories,
    addAccount,
    updateAccount,
    archiveAccount,
    unarchiveAccount,
    deleteAccount,
    getAccountBalance,
    addCategory,
    settings,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountModel | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalCategoryId, setModalCategoryId] = useState('');
  const [modalOpeningBalance, setModalOpeningBalance] = useState('');
  const [modalParentId, setModalParentId] = useState<string>('');
  const [modalPhone, setModalPhone] = useState('');
  const [modalError, setModalError] = useState('');

  // Delete Guard State
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  // New Category State
  const [isAddCatOpen, setIsAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Account Details & Private Notes Modal State (Milestone N1)
  const [viewingDetailsAccount, setViewingDetailsAccount] = useState<AccountModel | null>(null);
  const [privateNotesDraft, setPrivateNotesDraft] = useState<string>('');
  const [saveNotesSuccess, setSaveNotesSuccess] = useState<boolean>(false);

  // Filtered accounts (Notes are strictly private and excluded from search query)
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (acc.status !== statusFilter) return false;
      if (selectedCategory !== 'all' && acc.categoryId !== selectedCategory) return false;
      if (!matchesPublicAccountSearch(acc, searchQuery)) return false;
      return true;
    });
  }, [accounts, statusFilter, selectedCategory, searchQuery]);

  // Root accounts & Children mapping for tree view
  const rootAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => !a.parentId);
  }, [filteredAccounts]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, AccountModel[]>();
    for (const acc of filteredAccounts) {
      if (acc.parentId) {
        const list = map.get(acc.parentId) || [];
        list.push(acc);
        map.set(acc.parentId, list);
      }
    }
    return map;
  }, [filteredAccounts]);

  // Open modal for add
  const openAddModal = (parentAccountId?: string) => {
    setEditingAccount(null);
    setModalName('');
    setModalCategoryId(categories[0]?.id || '');
    setModalOpeningBalance('0.00');
    setModalParentId(parentAccountId || '');
    setModalPhone('');
    setModalError('');
    setIsModalOpen(true);
  };

  // Open modal for edit
  const openEditModal = (acc: AccountModel) => {
    setEditingAccount(acc);
    setModalName(acc.name);
    setModalCategoryId(acc.categoryId);
    setModalOpeningBalance(fromMinorUnits(acc.openingBalanceMinor).toFixed(2));
    setModalParentId(acc.parentId || '');
    setModalPhone(acc.phone || '');
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!modalName.trim()) {
      setModalError('يرجى إدخال اسم الحساب أو الطرف.');
      return;
    }
    if (!modalCategoryId) {
      setModalError('يرجى تحديد التصنيف.');
      return;
    }

    const openingMinor = toMinorUnits(modalOpeningBalance);
    const parentIdClean = modalParentId ? modalParentId : null;

    // Check tree cycle
    if (editingAccount && parentIdClean) {
      if (checkTreeCycle(accounts, editingAccount.id, parentIdClean)) {
        setModalError('لا يمكن تعيين هذا الحساب كأب نظراً لوجود علاقة دائرية في الشجرة.');
        return;
      }
    }

    try {
      if (editingAccount) {
        await updateAccount({
          ...editingAccount,
          name: modalName.trim(),
          categoryId: modalCategoryId,
          openingBalanceMinor: openingMinor,
          parentId: parentIdClean,
          phone: modalPhone.trim() || undefined,
        });
      } else {
        await addAccount({
          name: modalName.trim(),
          categoryId: modalCategoryId,
          openingBalanceMinor: openingMinor,
          parentId: parentIdClean,
          status: 'active',
          phone: modalPhone.trim() || undefined,
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || 'حدث خطأ أثناء حفظ الحساب.');
    }
  };

  const handleDeleteClick = async (accountId: string) => {
    const res = await deleteAccount(accountId);
    if (!res.success && res.error) {
      setDeleteWarning(res.error);
    }
  };

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await addCategory(newCatName.trim());
    setNewCatName('');
    setIsAddCatOpen(false);
  };

  // Render Account Card / Row
  const renderAccountRow = (acc: AccountModel, isChild = false) => {
    const balance = getAccountBalance(acc.id);
    const category = categories.find((c) => c.id === acc.categoryId);
    const children = childrenByParent.get(acc.id) || [];

    return (
      <div key={acc.id} className="space-y-2">
        <div
          className={`p-4 rounded-xl border transition-all ${
            isChild
              ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800 mr-5'
              : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-xs'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Account Info */}
            <div className="flex items-start gap-3">
              {isChild && (
                <CornerDownLeft className="w-4 h-4 text-slate-400 mt-1 shrink-0 rotate-90" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {acc.name}
                  </h4>
                  {acc.status === 'archived' && (
                    <span className="text-[10px] text-slate-500 font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                      مؤرشف
                    </span>
                  )}
                  {isChild && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      (فرعي)
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-1">
                  <span>{category?.name || 'عام'}</span>
                  {acc.phone && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{acc.phone}</span>
                      </span>
                    </>
                  )}
                  {acc.openingBalanceMinor !== 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        افتتاح: <span className="font-mono tabular-nums">{formatCurrency(acc.openingBalanceMinor, { showSign: true })}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Balance & Action Buttons */}
            <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800/80">
              {/* Balance */}
              <div className="text-right sm:text-left font-mono">
                <div
                  className={`text-sm font-bold tabular-nums ${
                    balance > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : balance < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {formatCurrency(balance, { showSign: true })}
                </div>
                <div className="text-[10px] text-slate-400 font-sans">
                  {balance > 0 ? 'مستحق لك' : balance < 0 ? 'التزام عليك' : 'متوازن'}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                {acc.status === 'active' && balance > 0 && onOpenInterAccountTransfer && (
                  <button
                    type="button"
                    onClick={() => onOpenInterAccountTransfer(acc.id)}
                    className="p-1.5 rounded-lg text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/50 cursor-pointer"
                    title="نقل مديونية من هذا الحساب (حركة بينية)"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                )}

                {acc.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => onOpenQuickTx(acc.id)}
                    className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 cursor-pointer"
                    title="تسجيل حركة لهذا الحساب"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onOpenStatementForAccount(acc.id)}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  title="عرض كشف الحساب التفصيلي"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewingDetailsAccount(acc);
                    setPrivateNotesDraft(acc.notes || '');
                    setSaveNotesSuccess(false);
                  }}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  title="تفاصيل الحساب والملاحظات الخاصة"
                >
                  <Info className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => openEditModal(acc)}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  title="تعديل بيانات الحساب"
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                {acc.status === 'active' ? (
                  <button
                    type="button"
                    onClick={() => archiveAccount(acc.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                    title="أرشفة الحساب (يوصى به لحفظ التاريخ المالي)"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => unarchiveAccount(acc.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                    title="إلغاء الأرشفة وإعادة التفعيل"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDeleteClick(acc.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  title="حذف الحساب نهائياً"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Render Children (in tree mode) */}
        {viewMode === 'tree' && children.length > 0 && (
          <div className="space-y-2 pr-4 border-r-2 border-slate-200 dark:border-slate-800 mr-2">
            {children.map((child) => renderAccountRow(child, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            دليل الحسابات والأطراف
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            إدارة أطراف التعامل، الحسابات الرئيسية والفرعية، وأرصدتها المباشرة
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenInterAccountTransfer && (
            <button
              type="button"
              onClick={() => onOpenInterAccountTransfer()}
              className="py-2 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm shadow-purple-600/30 cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>حركة بينية (نقل مديونية)</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsAddCatOpen(true)}
            className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
          >
            <span>+ تصنيف جديد</span>
          </button>
          <button
            type="button"
            onClick={() => openAddModal()}
            className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة حساب جديد</span>
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs">
        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="البحث بالاسم أو رقم الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 px-3 pr-8 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
        </div>

        {/* Category & Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Segmented Control */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              النشطة ({accounts.filter((a) => a.status === 'active').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('archived')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'archived'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              المؤرشفة ({accounts.filter((a) => a.status === 'archived').length})
            </button>
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-8 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 focus:outline-hidden"
          >
            <option value="all">كل التصنيفات</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* View Mode Toggle: Tree vs Flat List */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'tree'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-400'
              }`}
              title="عرض شجري (الرئيسي والفروع)"
            >
              <FolderTree className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-400'
              }`}
              title="قائمة مسطحة"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Safe Delete Guard Warning Popup */}
      {deleteWarning && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold mb-1">تنبيه حماية سلامة التاريخ المالي:</h4>
              <p>{deleteWarning}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDeleteWarning(null)}
            className="p-1 text-amber-600 hover:text-amber-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Accounts List / Tree */}
      {filteredAccounts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-400 text-xs">
          لا توجد حسابات مطابقة للمحددات الحالية.
        </div>
      ) : viewMode === 'tree' ? (
        <div className="space-y-3">
          {rootAccounts.map((acc) => renderAccountRow(acc, false))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAccounts.map((acc) => renderAccountRow(acc, Boolean(acc.parentId)))}
        </div>
      )}

      {/* Add / Edit Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden my-8">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingAccount ? 'تعديل بيانات الحساب' : 'إضافة حساب أو طرف جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveAccount} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  اسم الحساب / الطرف:
                </label>
                <input
                  type="text"
                  placeholder="ابحث باسم الحساب أو الجهة..."
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    التصنيف:
                  </label>
                  <select
                    value={modalCategoryId}
                    onChange={(e) => setModalCategoryId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    الحساب الأب (إن كان فرعاً):
                  </label>
                  <select
                    value={modalParentId}
                    onChange={(e) => setModalParentId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="">حساب رئيسي (بدون أب)</option>
                    {accounts
                      .filter((a) => !editingAccount || a.id !== editingAccount.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  الرصيد الافتتاحي (بالعملة المحلية {settings.currencySymbol}):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={modalOpeningBalance}
                    onChange={(e) => setModalOpeningBalance(e.target.value)}
                    className="w-full h-10 px-3 pl-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-400">
                    {settings.currencyCode}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  قيمة موجبة تعني «لك»، وقيمة سالبة تعني «عليك».
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  رقم الهاتف (اختياري للمشاركة):
                </label>
                <input
                  type="tel"
                  placeholder="05XXXXXXXX"
                  value={modalPhone}
                  onChange={(e) => setModalPhone(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-2 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm cursor-pointer"
                >
                  حفظ الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Category Simple Modal */}
      {isAddCatOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-5">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
              إضافة تصنيف حسابات جديد
            </h4>
            <form onSubmit={handleAddCategorySubmit} className="space-y-3">
              <input
                type="text"
                placeholder="اسم التصنيف (مثال: مستودع، شحن...)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                required
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCatOpen(false)}
                  className="py-1.5 px-3 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="py-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                >
                  إضافة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Account Details & Private Notes Modal (Milestone N1) */}
      {viewingDetailsAccount && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold">
                  {viewingDetailsAccount.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {viewingDetailsAccount.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {categories.find((c) => c.id === viewingDetailsAccount.categoryId)?.name || 'عام'} ·{' '}
                    {viewingDetailsAccount.status === 'active' ? 'حساب نشط' : 'حساب مؤرشف'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingDetailsAccount(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Financial Overview */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs font-mono">
              <div>
                <span className="text-slate-500 font-sans block text-[11px]">الرصيد الافتتاحي:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {formatCurrency(viewingDetailsAccount.openingBalanceMinor, { showSign: true })}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-sans block text-[11px]">الرصيد الحالي المباشر:</span>
                <span
                  className={`font-bold ${
                    getAccountBalance(viewingDetailsAccount.id) > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : getAccountBalance(viewingDetailsAccount.id) < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-500'
                  }`}
                >
                  {formatCurrency(getAccountBalance(viewingDetailsAccount.id), { showSign: true })}
                </span>
              </div>
            </div>

            {/* Private Account Notes Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>ملاحظات الحساب الخاصة (سرية):</span>
                </label>
                {saveNotesSuccess && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium animate-pulse flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>تم حفظ الملاحظات</span>
                  </span>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40 text-[11px] text-purple-800 dark:text-purple-300 leading-relaxed">
                ملاحظات سرية لا تظهر إطلاقاً في كشوف الحسابات أو فواتير الحركات أو التقارير المالية أو القوائم العامة، وتُحفظ بأمان داخل النسخ الاحتياطي التابع لك.
              </div>

              <textarea
                rows={4}
                value={privateNotesDraft}
                onChange={(e) => setPrivateNotesDraft(e.target.value)}
                placeholder="اكتب ملاحظات خاصة وسرية حول هذا الطرف أو شروط الاتفاق معه..."
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    await updateAccount({
                      ...viewingDetailsAccount,
                      notes: privateNotesDraft.trim() || undefined,
                    });
                    setSaveNotesSuccess(true);
                    setTimeout(() => setSaveNotesSuccess(false), 2000);
                  }}
                  className="py-1.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>حفظ الملاحظات الخاصة</span>
                </button>
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = viewingDetailsAccount.id;
                    setViewingDetailsAccount(null);
                    onOpenStatementForAccount(id);
                  }}
                  className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>كشف الحساب</span>
                </button>

                {viewingDetailsAccount.status === 'active' &&
                  getAccountBalance(viewingDetailsAccount.id) > 0 &&
                  onOpenInterAccountTransfer && (
                    <button
                      type="button"
                      onClick={() => {
                        const id = viewingDetailsAccount.id;
                        setViewingDetailsAccount(null);
                        onOpenInterAccountTransfer(id);
                      }}
                      className="py-1.5 px-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>نقل مديونية</span>
                    </button>
                  )}
              </div>

              <button
                type="button"
                onClick={() => setViewingDetailsAccount(null)}
                className="py-1.5 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
