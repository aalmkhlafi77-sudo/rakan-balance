/** Test-only sample records: never imported by the production application. */
import type { AccountModel, StickyNoteModel, TransactionModel } from '../../src/domain/types.ts';

export const DEMO_ACCOUNTS: AccountModel[] = [
  {
    id: 'demo-acc-1',
    name: 'أحمد الشمري',
    parentId: null,
    categoryId: 'cat-friends',
    openingBalanceMinor: 150000, // +1,500.00 SAR (لك)
    status: 'active',
    phone: '0501234567',
    notes: 'معاملات شخصية ومشاركات',
    isDemo: true,
    createdAt: '2026-10-15T09:00:00Z',
    updatedAt: '2026-10-15T09:00:00Z',
  },
  {
    id: 'demo-acc-2',
    name: 'مؤسسة الأفق للتجارة',
    parentId: null,
    categoryId: 'cat-business',
    openingBalanceMinor: -240000, // -2,400.00 SAR (عليك)
    status: 'active',
    phone: '0112345678',
    notes: 'توريد حواسيب ومعدات مكتبية',
    isDemo: true,
    createdAt: '2026-10-18T11:00:00Z',
    updatedAt: '2026-10-18T11:00:00Z',
  },
  {
    id: 'demo-acc-3',
    name: 'فرع جدة — مؤسسة الأفق',
    parentId: 'demo-acc-2',
    categoryId: 'cat-business',
    openingBalanceMinor: -60000, // -600.00 SAR (عليك)
    status: 'active',
    phone: '0123456789',
    notes: 'حساب فرعي مستقل لتجهيزات فرع جدة',
    isDemo: true,
    createdAt: '2026-10-20T14:00:00Z',
    updatedAt: '2026-10-20T14:00:00Z',
  },
  {
    id: 'demo-acc-4',
    name: 'خالد بن عبدالعزيز',
    parentId: null,
    categoryId: 'cat-family',
    openingBalanceMinor: 45000, // +450.00 SAR (لك)
    status: 'active',
    phone: '0559876543',
    notes: 'سلف ومستحقات مشتركة',
    isDemo: true,
    createdAt: '2026-10-22T08:00:00Z',
    updatedAt: '2026-10-22T08:00:00Z',
  },
  {
    id: 'demo-acc-5',
    name: 'سالم الدوسري (مشروع قديم)',
    parentId: null,
    categoryId: 'cat-friends',
    openingBalanceMinor: 0,
    status: 'archived',
    notes: 'حساب مؤرشف تم تصفية ذمته بالكامل',
    isDemo: true,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  },
];

export const DEMO_TRANSACTIONS: TransactionModel[] = [
  {
    id: 'demo-tx-1',
    accountId: 'demo-acc-1',
    entryType: 'owedByAccount',
    amountMinor: 35000, // +350.00 SAR
    date: '2026-10-25',
    description: 'قيمة شراء قطع غيار مشتركة',
    notes: 'تم الدفع بالبطاقة',
    attachmentIds: [],
    isDemo: true,
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
  },
  {
    id: 'demo-tx-2',
    accountId: 'demo-acc-1',
    entryType: 'owedToAccount',
    amountMinor: 50000, // -500.00 SAR
    date: '2026-10-28',
    description: 'دفعة نقدية مستلمة من أحمد',
    notes: 'تحويل سريع',
    attachmentIds: [],
    isDemo: true,
    createdAt: '2026-10-28T16:30:00Z',
    updatedAt: '2026-10-28T16:30:00Z',
  },
  {
    id: 'demo-tx-3',
    accountId: 'demo-acc-2',
    entryType: 'owedToAccount',
    amountMinor: 120000, // -1,200.00 SAR
    date: '2026-10-30',
    description: 'استلام دفعة شاشات مكتبية إضافية',
    notes: 'فاتورة تسليم رقم 894',
    attachmentIds: [],
    isDemo: true,
    createdAt: '2026-10-30T12:00:00Z',
    updatedAt: '2026-10-30T12:00:00Z',
  },
  {
    id: 'demo-tx-4',
    accountId: 'demo-acc-2',
    entryType: 'owedByAccount',
    amountMinor: 100000, // +1,000.00 SAR
    date: '2026-11-02',
    description: 'سداد دفعة للأفق بحوالة بنكية',
    notes: 'تخفيض الالتزام المستحق عليهم',
    attachmentIds: [],
    isDemo: true,
    createdAt: '2026-11-02T11:15:00Z',
    updatedAt: '2026-11-02T11:15:00Z',
  },
  {
    id: 'demo-tx-5',
    accountId: 'demo-acc-4',
    entryType: 'owedByAccount',
    amountMinor: 15000, // +150.00 SAR
    date: '2026-11-04',
    description: 'قيمة اشتراك خدمة سحابية سنوية مشتركة',
    attachmentIds: [],
    isDemo: true,
    createdAt: '2026-11-04T09:45:00Z',
    updatedAt: '2026-11-04T09:45:00Z',
  },
];

export const DEMO_NOTES: StickyNoteModel[] = [
  {
    id: 'demo-note-1',
    title: 'مراجعة حساب مؤسسة الأفق',
    content: 'التأكد من خصم مرتجع الشاشتين المتضررتين من رصيد شهر نوفمبر.',
    color: 'emerald',
    archived: false,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'demo-note-2',
    title: 'تذكير ودي لأحمد الشمري',
    content: 'الاتفاق على موعد تسوية المتبقي من المشتريات المشتركة.',
    color: 'amber',
    archived: false,
    createdAt: '2026-11-03T14:00:00Z',
    updatedAt: '2026-11-03T14:00:00Z',
  },
];
