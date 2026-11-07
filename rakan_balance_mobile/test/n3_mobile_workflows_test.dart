import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/data/sqlite/tables_schema.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';
import 'package:rakan_balance_mobile/presentation/state/app_state_notifier.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('account create, private notes, edit and archive persist in SQLite', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    final state = AppStateNotifier.forTesting(db);
    try {
      await state.reloadWorkspace();
      await state.createAccount(
        name: 'شركة اختبار', categoryName: 'عملاء',
        openingBalanceMinor: -7500, privateNotes: 'معلومة خاصة',
      );
      expect(state.accounts.length, 1);
      final id = state.accounts.single.id;
      expect(state.accounts.single.openingBalanceMinor, -7500);
      expect(state.accounts.single.notes, 'معلومة خاصة');
      expect((await db.query(TablesSchema.categories)).length, 1);

      await state.updateAccount(accountId: id, name: 'شركة جديدة',
        privateNotes: 'ملاحظة معدلة');
      expect(state.accounts.single.name, 'شركة جديدة');
      expect(state.accounts.single.notes, 'ملاحظة معدلة');

      await state.setAccountArchived(id, true);
      expect(state.accounts.single.status, 'archived');
      await state.setAccountArchived(id, false);
      expect(state.accounts.single.status, 'active');

      // No duplicate category created when adding another account.
      await state.createAccount(
        name: 'حساب آخر', categoryName: 'عملاء', openingBalanceMinor: 0);
      expect((await db.query(TablesSchema.categories)).length, 1);
    } finally {
      state.dispose();
      await db.close();
    }
  });

  test('regular ledger movements are persisted, editable and deletable', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    final state = AppStateNotifier.forTesting(db);
    try {
      await state.createAccount(name: 'طرف أ', categoryName: 'عام',
        openingBalanceMinor: 10000);
      final id = state.accounts.single.id;
      await state.createTransaction(accountId: id,
        entryType: EntryType.owedByAccount, amountMinor: 5500,
        date: '2026-11-07', description: 'فاتورة');
      expect(state.transactions.length, 1);
      expect(state.getAccountBalance(id), 15500);

      final original = state.transactions.single;
      await state.updateRegularTransaction(TransactionModel(
        id: original.id, accountId: id, entryType: EntryType.owedToAccount,
        amountMinor: 2500, date: original.date, description: 'سداد',
        attachmentIds: original.attachmentIds,
        createdAt: original.createdAt, updatedAt: original.updatedAt));
      expect(state.getAccountBalance(id), 7500);

      await state.deleteRegularTransaction(original.id);
      expect(state.transactions, isEmpty);
      expect(state.getAccountBalance(id), 10000);
    } finally {
      state.dispose();
      await db.close();
    }
  });

  test('archived accounts reject new regular movements', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    final state = AppStateNotifier.forTesting(db);
    try {
      await state.createAccount(name: 'مؤرشف', categoryName: 'عام',
        openingBalanceMinor: 0);
      final id = state.accounts.single.id;
      await state.setAccountArchived(id, true);
      await expectLater(state.createTransaction(
        accountId: id, entryType: EntryType.owedByAccount,
        amountMinor: 100, date: '2026-11-07', description: 'محظور'),
        throwsArgumentError);
      expect(await db.query(TablesSchema.transactions), isEmpty);
    } finally {
      state.dispose();
      await db.close();
    }
  });

  test('demo workspace movements never pollute real accounts or transactions', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    final state = AppStateNotifier.forTesting(db);
    try {
      await state.reloadWorkspace();
      await state.createAccount(name: 'الحقيقي', categoryName: 'عام',
        openingBalanceMinor: 1000);
      await state.toggleScope('demo');
      expect(state.accounts, isEmpty);
      await state.createAccount(name: 'التجريبي', categoryName: 'تجريبي',
        openingBalanceMinor: 500);
      await state.createTransaction(accountId: state.accounts.single.id,
        entryType: EntryType.owedByAccount, amountMinor: 100,
        date: '2026-11-07', description: 'حركة تجريبية');
      expect((await db.query(TablesSchema.demoTransactions)).length, 1);
      expect(await db.query(TablesSchema.transactions), isEmpty);
      await state.toggleScope('real');
      expect(state.accounts.length, 1);
      expect(state.accounts.single.name, 'الحقيقي');
      expect(state.transactions, isEmpty);
    } finally {
      state.dispose();
      await db.close();
    }
  });
  test('general notes can be created, updated and deleted independently', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    final state = AppStateNotifier.forTesting(db);
    try {
      await state.reloadWorkspace();
      await state.createGeneralNote('ملاحظة عامة');
      expect(state.notes.single.content, 'ملاحظة عامة');
      final id = state.notes.single.id;
      await state.updateGeneralNote(id, 'تم التعديل');
      expect(state.notes.single.content, 'تم التعديل');
      await state.deleteGeneralNote(id);
      expect(state.notes, isEmpty);
    } finally {
      state.dispose();
      await db.close();
    }
  });

  test('manual due reminder can be created, completed and deleted', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    final state = AppStateNotifier.forTesting(db);
    try {
      await state.reloadWorkspace();
      await state.createAccount(name: 'حساب متابعة', categoryName: 'عام',
        openingBalanceMinor: 0);
      await state.createDue(
        accountId: state.accounts.single.id,
        entryType: EntryType.owedByAccount,
        dueDate: '2026-11-30', amountMinor: 1000);
      expect(state.dues.length, 1);
      await state.createReminder(
        dueId: state.dues.single.id,
        remindAt: '2026-11-20', templateText: 'متابعة الاستحقاق');
      expect(state.reminders.single.isCompleted, false);
      final id = state.reminders.single.id;
      await state.setReminderCompleted(id, true);
      expect(state.reminders.single.isCompleted, true);
      await state.deleteReminder(id);
      expect(state.reminders, isEmpty);
      expect(state.transactions, isEmpty); // Reminders are non-financial.
    } finally {
      state.dispose();
      await db.close();
    }
  });

}
