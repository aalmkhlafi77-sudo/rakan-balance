import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/data/sqlite/sqlite_storage_adapter.dart';
import 'package:rakan_balance_mobile/data/sqlite/tables_schema.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';
import 'package:rakan_balance_mobile/domain/models/transfer_model.dart';
import 'package:rakan_balance_mobile/domain/validators/attachment_policy.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

AttachmentModel _attachment({
  required String id,
  required String txId,
  String name = 'receipt.pdf',
}) {
  final mime = AttachmentPolicy.mimeForName(name);
  final dataUrl = 'data:$mime;base64,QUJDRA==';
  return AttachmentModel(
    id: id,
    filename: AttachmentPolicy.safeStoredName(id, name),
    mimeType: mime,
    sizeBytes: 4,
    base64Data: dataUrl,
    transactionId: txId,
    originalName: name,
    size: 4,
    dataUrl: dataUrl,
    createdAt: '2026-11-07T00:00:00Z',
  );
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('attachment policy rejects unsupported and oversized files and sanitizes names', () {
    expect(() => AttachmentPolicy.validate(name: 'malware.exe', size: 1),
      throwsArgumentError);
    expect(() => AttachmentPolicy.validate(
      name: 'large.pdf', size: AttachmentPolicy.maxBytes + 1),
      throwsArgumentError);
    expect(AttachmentPolicy.sanitizeOriginalName('../folder/invoice.pdf'),
      'invoice.pdf');
    expect(AttachmentPolicy.safeStoredName('att:1', 'invoice.PDF'),
      'att_1.pdf');
  });

  test('add/delete attachment updates the owning transaction atomically', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      await db.insert(TablesSchema.accounts, AccountModel(
        id: 'acc', name: 'عميل', categoryId: 'cat',
        openingBalanceMinor: 0, createdAt: '', updatedAt: '').toMap());
      final tx = TransactionModel(
        id: 'tx', accountId: 'acc', entryType: EntryType.owedByAccount,
        amountMinor: 1000, date: '2026-11-07', description: 'فاتورة',
        attachmentIds: const [], createdAt: '', updatedAt: '');
      await db.insert(TablesSchema.transactions, tx.toMap());

      final adapter = SqliteStorageAdapter(db);
      await adapter.addAttachmentAtomic(
        txId: 'tx', attachment: _attachment(id: 'att', txId: 'tx'),
        isDemo: false);

      final storedTx = TransactionModel.fromMap(
        (await db.query(TablesSchema.transactions,
          where: 'id = ?', whereArgs: ['tx'])).single);
      expect(storedTx.attachmentIds, ['att']);
      final attachments = await adapter.listAttachmentsForTransaction(
        txId: 'tx', isDemo: false);
      expect(attachments.length, 1);
      expect(attachments.single.displayName, 'receipt.pdf');

      await adapter.deleteAttachmentAtomic(
        txId: 'tx', attachmentId: 'att', isDemo: false);
      final afterDelete = TransactionModel.fromMap(
        (await db.query(TablesSchema.transactions,
          where: 'id = ?', whereArgs: ['tx'])).single);
      expect(afterDelete.attachmentIds, isEmpty);
      expect(await db.query(TablesSchema.attachments), isEmpty);
    } finally {
      await db.close();
    }
  });

  test('deleting a regular transaction removes its attachment rows', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      await db.insert(TablesSchema.accounts, AccountModel(
        id: 'acc', name: 'عميل', categoryId: 'cat',
        openingBalanceMinor: 0, createdAt: '', updatedAt: '').toMap());
      await db.insert(TablesSchema.transactions, TransactionModel(
        id: 'tx', accountId: 'acc', entryType: EntryType.owedByAccount,
        amountMinor: 1000, date: '2026-11-07', description: 'فاتورة',
        attachmentIds: const [], createdAt: '', updatedAt: '').toMap());
      final adapter = SqliteStorageAdapter(db);
      await adapter.addAttachmentAtomic(
        txId: 'tx', attachment: _attachment(id: 'att', txId: 'tx'),
        isDemo: false);
      await adapter.deleteTransactionGuarded(txId: 'tx', isDemo: false);
      expect(await db.query(TablesSchema.transactions), isEmpty);
      expect(await db.query(TablesSchema.attachments), isEmpty);
    } finally {
      await db.close();
    }
  });

  test('deleting an inter-account transfer removes attachments for both entries', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      await db.insert(TablesSchema.accounts, AccountModel(
        id: 'src', name: 'المصدر', categoryId: 'cat',
        openingBalanceMinor: 5000, createdAt: '', updatedAt: '').toMap());
      await db.insert(TablesSchema.accounts, AccountModel(
        id: 'dst', name: 'الوجهة', categoryId: 'cat',
        openingBalanceMinor: 0, createdAt: '', updatedAt: '').toMap());
      final adapter = SqliteStorageAdapter(db);
      await adapter.saveTransferAtomic(
        input: InterAccountTransferInput(
          sourceAccountId: 'src', destinationAccountId: 'dst',
          amountMinor: 1000, date: '2026-11-07', description: 'تحويل'),
        isDemo: false);
      final rows = await db.query(TablesSchema.transactions);
      final tx = TransactionModel.fromMap(rows.first);
      final transferId = tx.transferId!;
      await adapter.addAttachmentAtomic(
        txId: tx.id, attachment: _attachment(id: 'att', txId: tx.id),
        isDemo: false);

      await adapter.deleteTransferAtomic(
        transferId: transferId, isDemo: false);
      expect(await db.query(TablesSchema.transactions), isEmpty);
      expect(await db.query(TablesSchema.attachments), isEmpty);
    } finally {
      await db.close();
    }
  });

  test('attachments cannot be added to demo workspace or orphan transactions', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      final adapter = SqliteStorageAdapter(db);
      await expectLater(
        adapter.addAttachmentAtomic(
          txId: 'missing',
          attachment: _attachment(id: 'att', txId: 'missing'),
          isDemo: false),
        throwsStateError,
      );
      await expectLater(
        adapter.addAttachmentAtomic(
          txId: 'missing',
          attachment: _attachment(id: 'att2', txId: 'missing'),
          isDemo: true),
        throwsStateError,
      );
    } finally {
      await db.close();
    }
  });
}
