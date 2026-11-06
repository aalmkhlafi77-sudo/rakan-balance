import 'package:sqflite/sqflite.dart';
import '../../domain/financial/inter_account_transfer_engine.dart';
import '../../domain/models/due_item_model.dart';
import '../../domain/models/transaction_model.dart';
import '../../domain/models/transfer_model.dart';
import 'tables_schema.dart';

class SqliteStorageAdapter {
  final Database _db;

  SqliteStorageAdapter(this._db);

  // =========================================================================
  // N1: Inter-Account Transfer Atomic SQLite Operations
  // =========================================================================

  Future<void> saveTransferAtomic({
    required InterAccountTransferInput input,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final transferId = 'trsf_${DateTime.now().millisecondsSinceEpoch}_${input.sourceAccountId.substring(0, 3)}';

      final accountsTable = isDemo ? TablesSchema.demoAccounts : TablesSchema.accounts;
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;

      // Fetch account names inside transaction
      final srcMaps = await txn.query(accountsTable, where: 'id = ?', whereArgs: [input.sourceAccountId]);
      final dstMaps = await txn.query(accountsTable, where: 'id = ?', whereArgs: [input.destinationAccountId]);

      if (srcMaps.isEmpty || dstMaps.isEmpty) {
        throw Exception('الحساب المصدر أو الوجهة غير موجود.');
      }

      final srcName = srcMaps.first['name'] as String;
      final dstName = dstMaps.first['name'] as String;

      final entries = InterAccountTransferEngine.buildTransferEntries(
        input: input,
        transferId: transferId,
        sourceAccountName: srcName,
        destinationAccountName: dstName,
      );

      final pairValidation = InterAccountTransferEngine.validateTransferPair(entries);
      if (!pairValidation.isValid) {
        throw Exception(pairValidation.error ?? 'فشل إنشاء طرفي الحركة البينية.');
      }

      for (final entry in entries) {
        await txn.insert(txTable, entry.toMap(), conflictAlgorithm: ConflictAlgorithm.abort);
      }
    });
  }

  Future<void> updateTransferAtomic({
    required String transferId,
    required InterAccountTransferInput input,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final accountsTable = isDemo ? TablesSchema.demoAccounts : TablesSchema.accounts;
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;

      final existingMaps = await txn.query(txTable, where: 'transferId = ?', whereArgs: [transferId]);
      if (existingMaps.length != 2) {
        throw Exception('الحركة البينية غير موجودة أو تالفة.');
      }

      // Delete old pair
      await txn.delete(txTable, where: 'transferId = ?', whereArgs: [transferId]);

      final srcMaps = await txn.query(accountsTable, where: 'id = ?', whereArgs: [input.sourceAccountId]);
      final dstMaps = await txn.query(accountsTable, where: 'id = ?', whereArgs: [input.destinationAccountId]);

      if (srcMaps.isEmpty || dstMaps.isEmpty) {
        throw Exception('الحساب المصدر أو الوجهة غير موجود.');
      }

      final entries = InterAccountTransferEngine.buildTransferEntries(
        input: input,
        transferId: transferId,
        sourceAccountName: srcMaps.first['name'] as String,
        destinationAccountName: dstMaps.first['name'] as String,
      );

      for (final entry in entries) {
        await txn.insert(txTable, entry.toMap(), conflictAlgorithm: ConflictAlgorithm.abort);
      }
    });
  }

  Future<void> deleteTransferAtomic({
    required String transferId,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
      final existingMaps = await txn.query(txTable, where: 'transferId = ?', whereArgs: [transferId]);
      if (existingMaps.length != 2) {
        throw Exception('الحركة البينية التالفة لا يمكن حذفها إفرادياً.');
      }
      await txn.delete(txTable, where: 'transferId = ?', whereArgs: [transferId]);
    });
  }

  // Single transaction edit/delete guards
  Future<void> updateTransactionGuarded({
    required TransactionModel updatedTx,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
      final allocTable = isDemo ? TablesSchema.demoPaymentAllocations : TablesSchema.paymentAllocations;

      final existingMaps = await txn.query(txTable, where: 'id = ?', whereArgs: [updatedTx.id]);
      if (existingMaps.isNotEmpty && existingMaps.first['transferId'] != null) {
        throw Exception('لا يمكن تعديل قيد بيني منفردًا؛ استخدم تعديل الحركة البينية.');
      }

      final allocMaps = await txn.query(allocTable, where: 'paymentTransactionId = ?', whereArgs: [updatedTx.id]);
      if (allocMaps.isNotEmpty) {
        throw Exception('الحركة مرتبطة بسداد استحقاق ولا يمكن تعديلها منفردة.');
      }

      await txn.update(txTable, updatedTx.toMap(), where: 'id = ?', whereArgs: [updatedTx.id]);
    });
  }

  Future<void> deleteTransactionGuarded({
    required String txId,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
      final allocTable = isDemo ? TablesSchema.demoPaymentAllocations : TablesSchema.paymentAllocations;

      final existingMaps = await txn.query(txTable, where: 'id = ?', whereArgs: [txId]);
      if (existingMaps.isNotEmpty && existingMaps.first['transferId'] != null) {
        throw Exception('لا يمكن حذف قيد بيني منفردًا؛ استخدم حذف الحركة البينية.');
      }

      final allocMaps = await txn.query(allocTable, where: 'paymentTransactionId = ?', whereArgs: [txId]);
      if (allocMaps.isNotEmpty) {
        throw Exception('الحركة مرتبطة بسداد استحقاق ولا يمكن حذفها منفردة.');
      }

      await txn.delete(txTable, where: 'id = ?', whereArgs: [txId]);
    });
  }

  // =========================================================================
  // N2: Due Follow-Up & Atomic Partial Settlements
  // =========================================================================

  Future<void> recordDuePaymentAtomic({
    required String dueId,
    required TransactionModel payment,
    required PaymentAllocationModel allocation,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final dueTable = isDemo ? TablesSchema.demoDues : TablesSchema.dues;
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
      final allocTable = isDemo ? TablesSchema.demoPaymentAllocations : TablesSchema.paymentAllocations;

      final dueMaps = await txn.query(dueTable, where: 'id = ?', whereArgs: [dueId]);
      if (dueMaps.isEmpty) throw Exception('الاستحقاق غير موجود.');

      final due = DueItemModel.fromMap(dueMaps.first);
      if (payment.amountMinor > due.remainingAmountMinor) {
        throw Exception('الدفعة تتجاوز المبلغ المتبقي للاستحقاق.');
      }

      final updatedSettled = due.settledAmountMinor + payment.amountMinor;
      final newStatus = updatedSettled == due.originalAmountMinor ? 'settled' : 'partially_settled';

      await txn.update(
        dueTable,
        {
          'settledAmountMinor': updatedSettled,
          'status': newStatus,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [dueId],
      );

      await txn.insert(txTable, payment.toMap());
      await txn.insert(allocTable, allocation.toMap());
    });
  }

  Future<void> deleteUnpaidDueAtomic({
    required String dueId,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final dueTable = isDemo ? TablesSchema.demoDues : TablesSchema.dues;
      final reminderTable = isDemo ? TablesSchema.demoReminders : TablesSchema.reminders;
      final allocTable = isDemo ? TablesSchema.demoPaymentAllocations : TablesSchema.paymentAllocations;

      final allocMaps = await txn.query(allocTable, where: 'dueItemId = ?', whereArgs: [dueId]);
      if (allocMaps.isNotEmpty) {
        throw Exception('الاستحقاق يحتوي على دفعات مخصصة ولا يمكن حذفه.');
      }

      await txn.delete(reminderTable, where: 'dueItemId = ?', whereArgs: [dueId]);
      await txn.delete(dueTable, where: 'id = ?', whereArgs: [dueId]);
    });
  }

  // =========================================================================
  // Atomic Backup Import & Restore
  // =========================================================================

  Future<void> atomicRestoreBackup(Map<String, dynamic> bundleData) async {
    await _db.transaction((txn) async {
      // Clear all real tables
      await txn.delete(TablesSchema.accounts);
      await txn.delete(TablesSchema.categories);
      await txn.delete(TablesSchema.transactions);
      await txn.delete(TablesSchema.attachments);
      await txn.delete(TablesSchema.notes);
      await txn.delete(TablesSchema.dues);
      await txn.delete(TablesSchema.paymentAllocations);
      await txn.delete(TablesSchema.reminders);

      // Insert restored accounts
      for (final accMap in (bundleData['accounts'] as List? ?? [])) {
        await txn.insert(TablesSchema.accounts, Map<String, dynamic>.from(accMap));
      }
      // Insert categories
      for (final catMap in (bundleData['categories'] as List? ?? [])) {
        await txn.insert(TablesSchema.categories, Map<String, dynamic>.from(catMap));
      }
      // Insert transactions
      for (final txMap in (bundleData['transactions'] as List? ?? [])) {
        await txn.insert(TablesSchema.transactions, Map<String, dynamic>.from(txMap));
      }
      // Insert attachments
      for (final attMap in (bundleData['attachments'] as List? ?? [])) {
        await txn.insert(TablesSchema.attachments, Map<String, dynamic>.from(attMap));
      }
      // Insert notes
      for (final noteMap in (bundleData['notes'] as List? ?? [])) {
        await txn.insert(TablesSchema.notes, Map<String, dynamic>.from(noteMap));
      }
      // Insert dues
      for (final dueMap in (bundleData['dues'] as List? ?? [])) {
        await txn.insert(TablesSchema.dues, Map<String, dynamic>.from(dueMap));
      }
      // Insert payment allocations
      for (final allocMap in (bundleData['allocations'] as List? ?? [])) {
        await txn.insert(TablesSchema.paymentAllocations, Map<String, dynamic>.from(allocMap));
      }
      // Insert reminders
      for (final remMap in (bundleData['reminders'] as List? ?? [])) {
        await txn.insert(TablesSchema.reminders, Map<String, dynamic>.from(remMap));
      }
    });
  }
}
