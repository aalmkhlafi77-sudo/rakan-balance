import 'package:flutter/material.dart';
import 'package:sqflite/sqflite.dart';
import '../../data/sqlite/database_helper.dart';
import '../../data/sqlite/sqlite_storage_adapter.dart';
import '../../domain/financial/balance_calculator.dart';
import '../../domain/financial/money_utils.dart';
import '../../domain/models/account_model.dart';
import '../../domain/models/due_item_model.dart';
import '../../domain/models/note_model.dart';
import '../../domain/models/transaction_model.dart';
import '../../domain/models/transfer_model.dart';

class AppStateNotifier extends ChangeNotifier {
  Database? _db;
  SqliteStorageAdapter? _storage;

  bool _isLoading = true;
  String _activeScope = 'real'; // 'real' | 'demo'
  ThemeMode _themeMode = ThemeMode.light;
  bool _isPinLocked = false;
  String? _pinCode;

  List<AccountModel> _accounts = [];
  List<TransactionModel> _transactions = [];
  List<DueItemModel> _dues = [];
  List<PaymentAllocationModel> _allocations = [];
  List<ReminderModel> _reminders = [];
  List<NoteModel> _notes = [];

  bool get isLoading => _isLoading;
  String get activeScope => _activeScope;
  ThemeMode get themeMode => _themeMode;
  bool get isPinLocked => _isPinLocked;
  bool get hasPin => _pinCode != null && _pinCode!.isNotEmpty;

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

  void setPin(String? pin) {
    _pinCode = pin;
    _isPinLocked = pin != null && pin.isNotEmpty;
    notifyListeners();
  }

  bool unlockWithPin(String pin) {
    if (_pinCode == pin) {
      _isPinLocked = false;
      notifyListeners();
      return true;
    }
    return false;
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
    final now = DateTime.now().toIso8601String();
    final due = DueItemModel(
      id: 'due_${DateTime.now().millisecondsSinceEpoch}',
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
    final due = _dues.firstWhere((d) => d.id == dueId);
    final now = DateTime.now().toIso8601String();

    final payment = TransactionModel(
      id: 'tx_pay_${DateTime.now().millisecondsSinceEpoch}',
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
      id: 'alloc_${DateTime.now().millisecondsSinceEpoch}',
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

  // Backup restore
  Future<void> restoreBackup(Map<String, dynamic> bundleData) async {
    await _storage!.atomicRestoreBackup(bundleData);
    await reloadWorkspace();
  }
}
