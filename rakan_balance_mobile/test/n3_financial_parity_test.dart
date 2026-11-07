import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/data/sqlite/sqlite_storage_adapter.dart';
import 'package:rakan_balance_mobile/data/sqlite/tables_schema.dart';
import 'package:rakan_balance_mobile/domain/financial/inter_account_transfer_engine.dart';
import 'package:rakan_balance_mobile/domain/financial/balance_calculator.dart';
import 'package:rakan_balance_mobile/domain/financial/money_utils.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/due_item_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';
import 'package:rakan_balance_mobile/domain/models/transfer_model.dart';

const _date = '2026-11-02';
AccountModel _account(String id, int opening, {String status = 'active'}) =>
    AccountModel(id: id, name: id, categoryId: 'cat', openingBalanceMinor: opening,
      status: status, createdAt: '', updatedAt: '');

InterAccountTransferInput _transfer(int amount, {String source = 'source',
    String destination = 'dest', String description = 'transfer'}) =>
    InterAccountTransferInput(sourceAccountId: source, destinationAccountId: destination,
      amountMinor: amount, date: _date, description: description);

TransactionModel _tx(String id, String accountId, EntryType type, int minor,
    {String? transferId, TransferRole? role, String? counterparty}) =>
    TransactionModel(id: id, accountId: accountId, entryType: type, amountMinor: minor,
      date: _date, description: 'record', attachmentIds: const [],
      transferId: transferId, transferRole: role, counterpartyAccountId: counterparty,
      createdAt: '', updatedAt: '');

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('N3.2 web parity - exact signed halalas', () {
    final valid = <String, int>{
      '0': 0, '0.01': 1, '1.2': 120, '150.25': 15025,
      '-50.00': -5000, '-0.01': -1, '100000000000.00': 10000000000000,
      '-100000000000.00': -10000000000000, '0001.02': 102,
    };
    valid.forEach((raw, expected) {
      test('accept exact base10 amount $raw', () {
        final result = MoneyUtils.toMinorUnits(raw);
        expect(result.success, true);
        expect(result.minor, expected);
      });
    });

    for (final raw in <String>['', '1.', '.50', '1.000', '1.230',
      '10.20.30', '1e3', '+10', 'a5', '--1', '100000000000.01',
      '-100000000000.01', '999999999999999999999999.00']) {
      test('reject malformed or overflow amount $raw', () {
        expect(MoneyUtils.toMinorUnits(raw).success, false);
      });
    }
    test('date rejects calendar overflow', () {
      expect(MoneyUtils.isValidDateString('2026-02-30'), false);
      expect(MoneyUtils.isValidDateString('2026-02-28'), true);
    });
  });

  group('N3.2 web parity - balance and statement', () {
    test('reference example: opening at final transaction date and closing', () {
      final account = _account('ref', 20000);
      final txs = [
        _tx('one', 'ref', EntryType.owedByAccount, 15000),
        _tx('two', 'ref', EntryType.owedToAccount, 8000),
        _tx('three', 'ref', EntryType.owedToAccount, 30000),
      ];
      // Earlier entries have explicit preceding dates.
      final ordered = [
        TransactionModel(id: 'one', accountId: 'ref', entryType: EntryType.owedByAccount,
          amountMinor: 15000, date: '2026-11-01', description: '',
          attachmentIds: const [], createdAt: '', updatedAt: ''),
        TransactionModel(id: 'two', accountId: 'ref', entryType: EntryType.owedToAccount,
          amountMinor: 8000, date: '2026-11-02', description: '',
          attachmentIds: const [], createdAt: '', updatedAt: ''),
        TransactionModel(id: 'three', accountId: 'ref', entryType: EntryType.owedToAccount,
          amountMinor: 30000, date: '2026-11-04', description: '',
          attachmentIds: const [], createdAt: '', updatedAt: ''),
      ];
      expect(txs.length, 3);
      final statement = BalanceCalculator.calculateAccountStatement(
        account: account, transactions: ordered,
        fromDate: '2026-11-04', toDate: '2026-11-04');
      expect(statement.openingBalanceMinor, 27000);
      expect(statement.closingBalanceMinor, -3000);
      expect(statement.rows.single.runningBalanceMinor, -3000);
    });
    test('dashboard totals correctly separate positive and negative accounts', () {
      final summary = BalanceCalculator.calculateSystemSummary(
        accounts: [_account('positive', 10000), _account('negative', -7000),
          _account('third', 2000)],
        transactions: <TransactionModel>[]);
      expect(summary.totalOwedByMinor, 12000);
      expect(summary.totalOwedToMinor, 7000);
      expect(summary.netBalanceMinor, 5000);
    });
    test('subaccount balances are counted directly without parent duplication', () {
      final child = AccountModel(id: 'child', parentId: 'parent',
        name: 'child', categoryId: 'cat', openingBalanceMinor: 3000,
        createdAt: '', updatedAt: '');
      final summary = BalanceCalculator.calculateSystemSummary(
        accounts: [_account('parent', 5000), child],
        transactions: <TransactionModel>[]);
      expect(summary.totalOwedByMinor, 8000);
      expect(summary.netBalanceMinor, 8000);
    });
    test('hierarchy check rejects self and descendant parent links', () {
      final root = _account('root', 0);
      final child = AccountModel(id: 'child', parentId: 'root',
        name: 'child', categoryId: 'cat', openingBalanceMinor: 0,
        createdAt: '', updatedAt: '');
      final grandchild = AccountModel(id: 'grandchild', parentId: 'child',
        name: 'grandchild', categoryId: 'cat', openingBalanceMinor: 0,
        createdAt: '', updatedAt: '');
      final accounts = [root, child, grandchild];
      expect(BalanceCalculator.hasHierarchyCycle('root', 'root', accounts), true);
      expect(BalanceCalculator.hasHierarchyCycle('root', 'grandchild', accounts), true);
      expect(BalanceCalculator.hasHierarchyCycle('grandchild', null, accounts), false);
    });
    test('stable statement sort includes date, createdAt and ID', () {
      final txs = [
        _tx('z', 'ref', EntryType.owedByAccount, 200),
        _tx('a', 'ref', EntryType.owedByAccount, 100),
      ];
      final statement = BalanceCalculator.calculateAccountStatement(
        account: _account('ref', 0), transactions: txs);
      expect(statement.rows.map((row) => row.transaction.id).toList(), ['a', 'z']);
      expect(statement.totalOwedByMinor, 300);
      expect(statement.closingBalanceMinor, 300);
    });
  });

  group('N3.2 domain - transfer ledger preconditions', () {
    final accounts = [_account('source', 10000), _account('dest', 0)];
    test('accept transfer smaller than available positive debt', () {
      final result = InterAccountTransferEngine.validateTransfer(
        input: _transfer(8000), accounts: accounts, currentTransactions: []);
      expect(result.isValid, true);
    });
    test('reject transfer exceeding positive source balance', () {
      final result = InterAccountTransferEngine.validateTransfer(
        input: _transfer(10001), accounts: accounts, currentTransactions: []);
      expect(result.isValid, false);
    });
    test('include existing source transactions in available debt', () {
      final result = InterAccountTransferEngine.validateTransfer(
        input: _transfer(8000), accounts: accounts,
        currentTransactions: [_tx('prior', 'source', EntryType.owedToAccount, 3000)]);
      expect(result.isValid, false);
    });
    test('editing a pair excludes the old pair from available debt', () {
      final result = InterAccountTransferEngine.validateTransfer(
        input: _transfer(9000), accounts: accounts, editingTransferId: 'old',
        currentTransactions: [
          _tx('old-src', 'source', EntryType.owedToAccount, 7000, transferId: 'old'),
          _tx('old-dst', 'dest', EntryType.owedByAccount, 7000, transferId: 'old')]);
      expect(result.isValid, true);
    });
    test('reject empty description and same-account transfer', () {
      expect(InterAccountTransferEngine.validateTransfer(
        input: _transfer(100, description: '   '), accounts: accounts,
        currentTransactions: []).isValid, false);
      expect(InterAccountTransferEngine.validateTransfer(
        input: _transfer(100, destination: 'source'), accounts: accounts,
        currentTransactions: []).isValid, false);
    });
    test('reject archived source or destination', () {
      expect(InterAccountTransferEngine.validateTransfer(
        input: _transfer(100), accounts: [_account('source', 10000, status: 'archived'), accounts.last],
        currentTransactions: []).isValid, false);
    });
    test('transfer entries have distinct stable IDs and matching web descriptions', () {
      final input = _transfer(1500, description: '  وصف معتمد  ');
      final first = InterAccountTransferEngine.buildTransferEntries(
        input: input, transferId: 'trsf_alpha', sourceAccountName: 'source',
        destinationAccountName: 'dest');
      final second = InterAccountTransferEngine.buildTransferEntries(
        input: input, transferId: 'trsf_beta', sourceAccountName: 'source',
        destinationAccountName: 'dest');
      expect(first[0].id, isNot(first[1].id));
      expect(first[0].id, isNot(second[0].id));
      expect(first[0].description, 'وصف معتمد');
      expect(first[1].description, 'وصف معتمد');
    });
    test('detect wrong transfer role and counterparty despite zero net', () {
      final input = _transfer(1500);
      final pair = InterAccountTransferEngine.buildTransferEntries(
        input: input, transferId: 'p1', sourceAccountName: 'source',
        destinationAccountName: 'dest');
      expect(InterAccountTransferEngine.validateTransferPair(pair).isValid, true);
      final badPair = [_tx('s', 'source', EntryType.owedToAccount, 1500,
          transferId: 'p1', role: TransferRole.source, counterparty: 'wrong'), pair[1]];
      expect(InterAccountTransferEngine.validateTransferPair(badPair).isValid, false);
      final badRoles = [_tx('s', 'source', EntryType.owedToAccount, 1500,
          transferId: 'p1', role: TransferRole.source, counterparty: 'dest'),
          _tx('d', 'dest', EntryType.owedByAccount, 1500,
          transferId: 'p1', role: TransferRole.source, counterparty: 'source')];
      expect(InterAccountTransferEngine.validateTransferPair(badRoles).isValid, false);
    });
  });

  group('N3.2 SQLite atomic rules', () {
    Future<Database> dbWithAccounts({int opening = 10000}) async {
      final db = await DatabaseHelper.initInMemoryDatabase();
      await db.insert(TablesSchema.accounts, _account('source', opening).toMap());
      await db.insert(TablesSchema.accounts, _account('dest', 0).toMap());
      return db;
    }
    test('reject insufficient transfer atomically: zero journal entries', () async {
      final db = await dbWithAccounts(opening: 1000);
      try {
        await expectLater(SqliteStorageAdapter(db).saveTransferAtomic(
          input: _transfer(5000), isDemo: false), throwsA(isA<StateError>()));
        expect(await db.query(TablesSchema.transactions), isEmpty);
      } finally { await db.close(); }
    });
    test('accept valid transfer then reject corrupted pair deletion', () async {
      final db = await dbWithAccounts();
      try {
        final storage = SqliteStorageAdapter(db);
        await storage.saveTransferAtomic(input: _transfer(3000), isDemo: false);
        final rows = await db.query(TablesSchema.transactions);
        expect(rows.length, 2);
        final transferId = rows.first['transferId'] as String;
        await db.update(TablesSchema.transactions, {'counterpartyAccountId': 'wrong'},
          where: 'transferRole = ?', whereArgs: ['destination']);
        await expectLater(storage.deleteTransferAtomic(transferId: transferId, isDemo: false),
          throwsA(isA<StateError>()));
        expect((await db.query(TablesSchema.transactions)).length, 2);
      } finally { await db.close(); }
    });
    test('reject transfer edit increasing source past its restored debt', () async {
      final db = await dbWithAccounts();
      try {
        final storage = SqliteStorageAdapter(db);
        await storage.saveTransferAtomic(input: _transfer(3000), isDemo: false);
        final id = (await db.query(TablesSchema.transactions)).first['transferId'] as String;
        await expectLater(storage.updateTransferAtomic(
          transferId: id, input: _transfer(10001), isDemo: false), throwsA(isA<StateError>()));
        final rows = await db.query(TablesSchema.transactions);
        expect(rows.length, 2);
        expect(rows.every((r) => r['amountMinor'] == 3000), true);
      } finally { await db.close(); }
    });

    test('full transfer moves all positive debt without changing global net', () async {
      final db = await dbWithAccounts();
      try {
        await SqliteStorageAdapter(db).saveTransferAtomic(
          input: _transfer(10000), isDemo: false);
        final txs = (await db.query(TablesSchema.transactions))
            .map((row) => TransactionModel.fromMap(row)).toList();
        expect(txs.length, 2);
        expect(txs.fold<int>(0, (sum, tx) => sum + tx.signedAmountMinor), 0);
        expect(txs.where((tx) => tx.accountId == 'source')
            .single.signedAmountMinor, -10000);
        expect(txs.where((tx) => tx.accountId == 'dest')
            .single.signedAmountMinor, 10000);
      } finally { await db.close(); }
    });
    test('valid transfer edit updates both entries in one transaction', () async {
      final db = await dbWithAccounts();
      try {
        final adapter = SqliteStorageAdapter(db);
        await adapter.saveTransferAtomic(input: _transfer(3000), isDemo: false);
        final id = (await db.query(TablesSchema.transactions))
            .first['transferId'] as String;
        await adapter.updateTransferAtomic(
          transferId: id, input: _transfer(7000), isDemo: false);
        final txs = (await db.query(TablesSchema.transactions))
            .map((row) => TransactionModel.fromMap(row)).toList();
        expect(txs.length, 2);
        expect(txs.every((tx) => tx.amountMinor == 7000), true);
        expect(InterAccountTransferEngine.validateTransferPair(txs).isValid, true);
      } finally { await db.close(); }
    });
    test('valid transfer deletion restores both original account balances', () async {
      final db = await dbWithAccounts();
      try {
        final adapter = SqliteStorageAdapter(db);
        await adapter.saveTransferAtomic(input: _transfer(4000), isDemo: false);
        final id = (await db.query(TablesSchema.transactions))
            .first['transferId'] as String;
        await adapter.deleteTransferAtomic(transferId: id, isDemo: false);
        expect(await db.query(TablesSchema.transactions), isEmpty);
      } finally { await db.close(); }
    });
    test('editing and deleting a missing transfer never inserts a replacement', () async {
      final db = await dbWithAccounts();
      try {
        final adapter = SqliteStorageAdapter(db);
        await expectLater(adapter.updateTransferAtomic(
          transferId: 'missing', input: _transfer(100), isDemo: false),
          throwsException);
        await expectLater(adapter.deleteTransferAtomic(
          transferId: 'missing', isDemo: false), throwsException);
        expect(await db.query(TablesSchema.transactions), isEmpty);
      } finally { await db.close(); }
    });
    test('an orphaned transfer cannot be modified or removed as a valid pair', () async {
      final db = await dbWithAccounts();
      try {
        final adapter = SqliteStorageAdapter(db);
        await adapter.saveTransferAtomic(input: _transfer(4000), isDemo: false);
        final rows = await db.query(TablesSchema.transactions);
        final id = rows.first['transferId'] as String;
        await db.delete(TablesSchema.transactions, where: 'id = ?',
          whereArgs: [rows.last['id']]);
        await expectLater(adapter.updateTransferAtomic(
          transferId: id, input: _transfer(2000), isDemo: false), throwsException);
        await expectLater(adapter.deleteTransferAtomic(
          transferId: id, isDemo: false), throwsException);
        expect((await db.query(TablesSchema.transactions)).length, 1);
      } finally { await db.close(); }
    });
    test('demo transfers do not write into real account ledger', () async {
      final db = await dbWithAccounts();
      try {
        await db.insert(TablesSchema.demoAccounts, _account('source', 10000).toMap());
        await db.insert(TablesSchema.demoAccounts, _account('dest', 0).toMap());
        await SqliteStorageAdapter(db).saveTransferAtomic(
          input: _transfer(3000), isDemo: true);
        expect(await db.query(TablesSchema.transactions), isEmpty);
        expect((await db.query(TablesSchema.demoTransactions)).length, 2);
      } finally { await db.close(); }
    });
    test('partial then full due payment creates two matching ledger allocations', () async {
      final db = await dbWithAccounts();
      try {
        final adapter = SqliteStorageAdapter(db);
        await db.insert(TablesSchema.dues, DueItemModel(
          id: 'due', accountId: 'source', entryType: EntryType.owedByAccount,
          dueDate: _date, originalAmountMinor: 5000, settledAmountMinor: 0,
          status: 'pending', createdAt: '', updatedAt: '').toMap());
        for (final amount in [2000, 3000]) {
          final id = 'payment_$amount';
          await adapter.recordDuePaymentAtomic(
            dueId: 'due', payment: _tx(id, 'source', EntryType.owedToAccount, amount),
            allocation: PaymentAllocationModel(id: 'alloc_$amount',
              dueItemId: 'due', paymentTransactionId: id, amountMinor: amount),
            isDemo: false);
        }
        final due = (await db.query(TablesSchema.dues)).single;
        expect(due['settledAmountMinor'], 5000);
        expect(due['status'], 'settled');
        expect((await db.query(TablesSchema.transactions)).length, 2);
        expect((await db.query(TablesSchema.paymentAllocations)).length, 2);
      } finally { await db.close(); }
    });
    test('reject invalid due payment without writing ledger or allocations', () async {
      final db = await dbWithAccounts();
      try {
        final due = DueItemModel(id: 'due', accountId: 'source',
          entryType: EntryType.owedByAccount, dueDate: _date,
          originalAmountMinor: 5000, settledAmountMinor: 0, status: 'pending',
          createdAt: '', updatedAt: '');
        await db.insert(TablesSchema.dues, due.toMap());
        final payment = _tx('payment', 'source', EntryType.owedToAccount, 1000);
        final wrongAllocation = PaymentAllocationModel(id: 'alloc',
          dueItemId: 'due', paymentTransactionId: 'payment', amountMinor: 2000);
        await expectLater(SqliteStorageAdapter(db).recordDuePaymentAtomic(
          dueId: 'due', payment: payment, allocation: wrongAllocation, isDemo: false),
          throwsA(isA<StateError>()));
        expect(await db.query(TablesSchema.transactions), isEmpty);
        expect(await db.query(TablesSchema.paymentAllocations), isEmpty);
        expect((await db.query(TablesSchema.dues)).single['settledAmountMinor'], 0);
      } finally { await db.close(); }
    });
  });
}
