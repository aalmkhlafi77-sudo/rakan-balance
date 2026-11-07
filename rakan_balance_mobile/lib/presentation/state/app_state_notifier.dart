import 'dart:math';
import 'package:flutter/material.dart';
import 'package:sqflite/sqflite.dart';
import '../../data/sqlite/database_helper.dart';
import '../../data/sqlite/sqlite_storage_adapter.dart';
import '../../data/sqlite/mobile_backup_service.dart';
import '../../domain/validators/backup_validator.dart';
import '../../domain/financial/balance_calculator.dart';
import '../../platform/security/pin_security_service.dart';
import '../../domain/financial/money_utils.dart';
import '../../domain/validators/transaction_validator.dart';
import '../../domain/models/account_model.dart';
import '../../domain/models/due_item_model.dart';
import '../../domain/models/transaction_model.dart';
import '../../domain/models/transfer_model.dart';

class AppStateNotifier extends ChangeNotifier {
  Database? _db;
  SqliteStorageAdapter? _storage;

  bool _isLoading = true;
  String _activeScope = 'real'; // 'real' | 'demo'
  ThemeMode _themeMode = ThemeMode.light;
  bool _isPinLocked = false;
  bool _hasPin = false;
  final PinSecurityService _pinService;

  List<AccountModel> _accounts = [];
  List<TransactionModel> _transactions = [];
  List<DueItemModel> _dues = [];
  List<PaymentAllocationModel> _allocations = [];
  List<ReminderModel> _reminders = [];
  List<NoteModel> _notes = [];

  AppStateNotifier() : _pinService = PinSecurityService(SecurePinCredentialStore());

  /// Isolated SQLite test injection only; never opens or mutates production storage.
  AppStateNotifier.forTesting(Database db, {PinSecurityService? pinSecurity})
      : _pinService = pinSecurity ?? PinSecurityService(SecurePinCredentialStore()) {
    _db = db;
    _storage = SqliteStorageAdapter(db);
    _isLoading = false;
  }

  bool get isLoading => _isLoading;
  String get activeScope => _activeScope;
  ThemeMode get themeMode => _themeMode;
  bool get isPinLocked => _isPinLocked;
  bool get hasPin => _hasPin;

  List<AccountModel> get accounts => _accounts;
  List<TransactionModel> get transactions => _transactions;
  List<DueItemModel> get dues => _dues;
  List<PaymentAllocationModel> get allocations => _allocations;
  List<ReminderModel> get reminders => _reminders;
  List<NoteModel> get notes => _notes;

  Future<void> init() async {
    _isLoading = true;
    notifyListeners();

    try {
      _hasPin = await _pinService.hasPin();
      _isPinLocked = _hasPin;
      notifyListeners();
      _db = await DatabaseHelper().database;
      _storage = SqliteStorageAdapter(_db!);
      await reloadWorkspace();
    } catch (e) {
      debugPrint('Failed to initialize database: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> toggleScope(String newScope) async {
    if (_activeScope == newScope) return;
    _activeScope = newScope;
    await reloadWorkspace();
  }

  void toggleThemeMode() {
    _themeMode = _themeMode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();
  }

  Future<void> setPin(String? pin, {String? currentPin}) async {
    if (pin == null) {
      if (currentPin == null) throw ArgumentError('رمز الحماية الحالي مطلوب.');
      await _pinService.disablePin(currentPin);
    } else {
      await _pinService.setPin(pin, previousPin: currentPin);
    }
    _hasPin = await _pinService.hasPin();
    _isPinLocked = _hasPin;
    notifyListeners();
  }

  Future<bool> unlockWithPin(String pin) async {
    if (await _pinService.verifyPin(pin)) {
      _isPinLocked = false;
      notifyListeners();
      return true;
    }
    return false;
  }

  Future<int> pinLockoutSecondsRemaining() =>
      _pinService.lockoutSecondsRemaining();

  void lockIfPinEnabled() {
    if (!_hasPin || _isPinLocked) return;
    _isPinLocked = true;
    notifyListeners();
  }

  Future<void> reloadWorkspace() async {
    if (_db == null) return;

    final isDemo = _activeScope == 'demo';
    final accTable = isDemo ? 'demo_accounts' : 'accounts';
    final txTable = isDemo ? 'demo_transactions' : 'transactions';
    final dueTable = isDemo ? 'demo_dues' : 'dues';
    final allocTable = isDemo ? 'demo_payment_allocations' : 'payment_allocations';
    final remTable = isDemo ? 'demo_reminders' : 'reminders';
    final noteTable = isDemo ? 'demo_notes' : 'notes';

    final accMaps = await _db!.query(accTable);
    final txMaps = await _db!.query(txTable, orderBy: 'date DESC, createdAt DESC');
    final dueMaps = await _db!.query(dueTable, orderBy: 'dueDate ASC');
    final allocMaps = await _db!.query(allocTable);
    final remMaps = await _db!.query(remTable, orderBy: 'remindAt ASC');
    final noteMaps = await _db!.query(noteTable, orderBy: 'updatedAt DESC');

    _accounts = accMaps.map((m) => AccountModel.fromMap(m)).toList();
    _transactions = txMaps.map((m) => TransactionModel.fromMap(m)).toList();
    _dues = dueMaps.map((m) => DueItemModel.fromMap(m)).toList();
    _allocations = allocMaps.map((m) => PaymentAllocationModel.fromMap(m)).toList();
    _reminders = remMaps.map((m) => ReminderModel.fromMap(m)).toList();
    _notes = noteMaps.map((m) => NoteModel.fromMap(m)).toList();

    notifyListeners();
  }

  int getAccountBalance(String accountId) {
    final acc = _accounts.firstWhere(
      (a) => a.id == accountId,
      orElse: () => AccountModel(id: '', name: '', categoryId: '', openingBalanceMinor: 0, createdAt: '', updatedAt: ''),
    );
    if (acc.id.isEmpty) return 0;
    return BalanceCalculator.calculateAccountBalance(account: acc, transactions: _transactions);
  }

  String _newId(String prefix) {
    final random = Random.secure();
    return '${prefix}_${DateTime.now().microsecondsSinceEpoch}_${random.nextInt(1 << 32)}';
  }

  /// Add an account and its category, without creating a financial movement.
  Future<void> createAccount({
    required String name,
    required String categoryName,
    required int openingBalanceMinor,
    String? privateNotes,
  }) async {
    if (_db == null) throw StateError('قاعدة البيانات غير مهيأة.');
    final cleanedName = name.trim();
    final cleanedCategory = categoryName.trim();
    if (cleanedName.isEmpty || cleanedCategory.isEmpty) {
      throw ArgumentError('اسم الحساب وتصنيفه مطلوبان.');
    }
    if (openingBalanceMinor.abs() > MoneyUtils.maxSafeHalalas) {
      throw ArgumentError('الرصيد الافتتاحي خارج الحدود المالية.');
    }
    final isDemo = _activeScope == 'demo';
    final accountTable = isDemo ? 'demo_accounts' : 'accounts';
    final categoryTable = isDemo ? 'demo_categories' : 'categories';
    final now = DateTime.now().toUtc().toIso8601String();

    await _db!.transaction((txn) async {
      final existing = await txn.query(categoryTable,
        where: 'name = ?', whereArgs: [cleanedCategory], limit: 1);
      final categoryId = existing.isNotEmpty
          ? existing.first['id'] as String : _newId('cat');
      if (existing.isEmpty) {
        await txn.insert(categoryTable, {
          'id': categoryId, 'name': cleanedCategory, 'sortOrder': 0,
        });
      }
      await txn.insert(accountTable, AccountModel(
        id: _newId('acc'), name: cleanedName, categoryId: categoryId,
        openingBalanceMinor: openingBalanceMinor, notes: privateNotes?.trim(),
        createdAt: now, updatedAt: now,
      ).toMap());
    });
    await reloadWorkspace();
  }

  Future<void> updateAccount({
    required String accountId,
    required String name,
    required String? privateNotes,
  }) async {
    final account = _accounts.where((a) => a.id == accountId).toList();
    if (account.length != 1 || name.trim().isEmpty) {
      throw ArgumentError('الحساب أو الاسم غير صالح.');
    }
    final table = _activeScope == 'demo' ? 'demo_accounts' : 'accounts';
    final count = await _db!.update(table, {
      'name': name.trim(),
      'notes': privateNotes?.trim(),
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    }, where: 'id = ?', whereArgs: [accountId]);
    if (count != 1) throw StateError('تعذر تحديث الحساب.');
    await reloadWorkspace();
  }

  Future<void> setAccountArchived(String accountId, bool archived) async {
    if (!_accounts.any((a) => a.id == accountId)) {
      throw StateError('الحساب غير موجود.');
    }
    final table = _activeScope == 'demo' ? 'demo_accounts' : 'accounts';
    final count = await _db!.update(table, {
      'status': archived ? 'archived' : 'active',
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    }, where: 'id = ?', whereArgs: [accountId]);
    if (count != 1) throw StateError('تعذر تغيير حالة الحساب.');
    await reloadWorkspace();
  }

  Future<void> createTransaction({
    required String accountId,
    required EntryType entryType,
    required int amountMinor,
    required String date,
    required String description,
  }) async {
    final valid = TransactionValidator.validate(
      accountId: accountId, entryType: entryType, amountMinor: amountMinor,
      date: date, description: description, accounts: _accounts);
    if (!valid.isValid) throw ArgumentError(valid.error);
    if (description.trim().isEmpty) throw ArgumentError('بيان الحركة مطلوب.');
    final now = DateTime.now().toUtc().toIso8601String();
    final tx = TransactionModel(
      id: _newId('tx'), accountId: accountId, entryType: entryType,
      amountMinor: amountMinor, date: date, description: description.trim(),
      attachmentIds: const [], createdAt: now, updatedAt: now,
    );
    final table = _activeScope == 'demo' ? 'demo_transactions' : 'transactions';
    await _db!.insert(table, tx.toMap());
    await reloadWorkspace();
  }

  Future<void> updateRegularTransaction(TransactionModel tx) async {
    final valid = TransactionValidator.validate(
      accountId: tx.accountId, entryType: tx.entryType,
      amountMinor: tx.amountMinor, date: tx.date,
      description: tx.description, accounts: _accounts);
    if (!valid.isValid || tx.description.trim().isEmpty) {
      throw ArgumentError(valid.error ?? 'بيان الحركة مطلوب.');
    }
    final original = _transactions.where((t) => t.id == tx.id).toList();
    if (original.length != 1 || original.single.transferId != null) {
      throw StateError('الحركة غير موجودة أو مرتبطة بتحويل بيني.');
    }
    await _storage!.updateTransactionGuarded(
      updatedTx: tx, isDemo: _activeScope == 'demo');
    await reloadWorkspace();
  }

  Future<void> deleteRegularTransaction(String txId) async {
    await _storage!.deleteTransactionGuarded(
      txId: txId, isDemo: _activeScope == 'demo');
    await reloadWorkspace();
  }

  // Inter-Account Transfer
  Future<void> createTransfer(InterAccountTransferInput input) async {
    await _storage!.saveTransferAtomic(input: input, isDemo: _activeScope == 'demo');
    await reloadWorkspace();
  }

  Future<void> updateTransfer(String transferId, InterAccountTransferInput input) async {
    await _storage!.updateTransferAtomic(transferId: transferId, input: input, isDemo: _activeScope == 'demo');
    await reloadWorkspace();
  }

  Future<void> deleteTransfer(String transferId) async {
    await _storage!.deleteTransferAtomic(transferId: transferId, isDemo: _activeScope == 'demo');
    await reloadWorkspace();
  }

  // Due Follow-up & Atomic Payment
  Future<void> createDue({
    required String accountId,
    required EntryType entryType,
    required String dueDate,
    required int amountMinor,
    String? notes,
  }) async {
    if (!_accounts.any((a) => a.id == accountId && a.status == 'active') ||
        amountMinor <= 0 || amountMinor > MoneyUtils.maxSafeHalalas ||
        !MoneyUtils.isValidDateString(dueDate)) {
      throw ArgumentError('بيانات الاستحقاق غير صالحة.');
    }
    final now = DateTime.now().toIso8601String();
    final due = DueItemModel(
      id: _newId('due'),
      accountId: accountId,
      entryType: entryType,
      dueDate: dueDate,
      originalAmountMinor: amountMinor,
      settledAmountMinor: 0,
      status: 'pending',
      notes: notes,
      createdAt: now,
      updatedAt: now,
    );

    final table = _activeScope == 'demo' ? 'demo_dues' : 'dues';
    await _db!.insert(table, due.toMap());
    await reloadWorkspace();
  }

  Future<void> settleDue({
    required String dueId,
    required int amountMinor,
    required String date,
  }) async {
    if (!MoneyUtils.isValidDateString(date) ||
        amountMinor <= 0 || amountMinor > MoneyUtils.maxSafeHalalas) {
      throw ArgumentError('مبلغ أو تاريخ الدفعة غير صالح.');
    }
    final due = _dues.firstWhere((d) => d.id == dueId);
    final now = DateTime.now().toIso8601String();

    final payment = TransactionModel(
      id: _newId('tx_pay'),
      accountId: due.accountId,
      entryType: due.entryType == EntryType.owedByAccount ? EntryType.owedToAccount : EntryType.owedByAccount,
      amountMinor: amountMinor,
      date: date,
      description: 'سداد استحقاق بتاريخ ${due.dueDate}',
      attachmentIds: [],
      createdAt: now,
      updatedAt: now,
    );

    final allocation = PaymentAllocationModel(
      id: _newId('alloc'),
      dueItemId: due.id,
      paymentTransactionId: payment.id,
      amountMinor: amountMinor,
    );

    await _storage!.recordDuePaymentAtomic(
      dueId: dueId,
      payment: payment,
      allocation: allocation,
      isDemo: _activeScope == 'demo',
    );

    await reloadWorkspace();
  }

  Future<void> deleteUnpaidDue(String dueId) async {
    await _storage!.deleteUnpaidDueAtomic(dueId: dueId, isDemo: _activeScope == 'demo');
    await reloadWorkspace();
  }

  Future<void> createGeneralNote(String content) async {
    if (content.trim().isEmpty) throw ArgumentError('نص الملاحظة مطلوب.');
    final now = DateTime.now().toUtc().toIso8601String();
    final table = _activeScope == 'demo' ? 'demo_notes' : 'notes';
    await _db!.insert(table, NoteModel(id: _newId('note'),
      content: content.trim(), createdAt: now, updatedAt: now).toMap());
    await reloadWorkspace();
  }

  Future<void> updateGeneralNote(String id, String content) async {
    if (content.trim().isEmpty) throw ArgumentError('نص الملاحظة مطلوب.');
    final table = _activeScope == 'demo' ? 'demo_notes' : 'notes';
    final count = await _db!.update(table, {
      'content': content.trim(),
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    }, where: 'id = ?', whereArgs: [id]);
    if (count != 1) throw StateError('الملاحظة غير موجودة.');
    await reloadWorkspace();
  }

  Future<void> deleteGeneralNote(String id) async {
    final table = _activeScope == 'demo' ? 'demo_notes' : 'notes';
    final count = await _db!.delete(table, where: 'id = ?', whereArgs: [id]);
    if (count != 1) throw StateError('الملاحظة غير موجودة.');
    await reloadWorkspace();
  }

  Future<void> createReminder({
    required String dueId,
    required String remindAt,
    required String templateText,
  }) async {
    if (!_dues.any((d) => d.id == dueId) ||
        !MoneyUtils.isValidDateString(remindAt) ||
        templateText.trim().isEmpty) {
      throw ArgumentError('الاستحقاق أو التاريخ أو نص التذكير غير صالح.');
    }
    final table = _activeScope == 'demo' ? 'demo_reminders' : 'reminders';
    await _db!.insert(table, ReminderModel(id: _newId('rem'),
      dueItemId: dueId, remindAt: remindAt,
      templateText: templateText.trim(), isCompleted: false).toMap());
    await reloadWorkspace();
  }

  Future<void> setReminderCompleted(String reminderId, bool completed) async {
    final table = _activeScope == 'demo' ? 'demo_reminders' : 'reminders';
    final changed = await _db!.update(table, {'isCompleted': completed ? 1 : 0},
      where: 'id = ?', whereArgs: [reminderId]);
    if (changed != 1) throw StateError('التذكير غير موجود.');
    await reloadWorkspace();
  }

  Future<void> deleteReminder(String reminderId) async {
    final table = _activeScope == 'demo' ? 'demo_reminders' : 'reminders';
    final deleted = await _db!.delete(table,
      where: 'id = ?', whereArgs: [reminderId]);
    if (deleted != 1) throw StateError('التذكير غير موجود.');
    await reloadWorkspace();
  }

  /// Backups contain only real workspace financial records, never PIN secrets.
  Future<String> exportBackupJson() async {
    if (_db == null) throw StateError('قاعدة البيانات غير مهيأة.');
    if (_activeScope != 'real') {
      throw StateError('انتقل إلى البيانات الحقيقية قبل تصدير النسخة الاحتياطية.');
    }
    return MobileBackupService.exportJson(_db!,
      theme: _themeMode == ThemeMode.dark ? 'dark' : 'light');
  }

  /// Verify checksum and all referential invariants BEFORE any destructive SQL.
  Future<void> restoreBackupJson(String jsonText) async {
    if (_db == null || _storage == null) {
      throw StateError('قاعدة البيانات غير مهيأة.');
    }
    if (_activeScope != 'real') {
      throw StateError('انتقل إلى البيانات الحقيقية قبل استعادة النسخة الاحتياطية.');
    }
    final verified = BackupValidator.validateBackupJson(jsonText);
    if (!verified.isValid) {
      throw FormatException(verified.error ?? 'ملف النسخة الاحتياطية غير صالح.');
    }
    final data = verified.parsedBundle!['data'] as Map<String, dynamic>;
    await _storage!.atomicRestoreBackup(data);
    await reloadWorkspace();
  }
}
