import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:sqflite/sqflite.dart';

import '../../domain/models/account_model.dart';
import '../../domain/models/due_item_model.dart';
import '../../domain/models/transaction_model.dart';
import '../../domain/models/transfer_model.dart';
import '../../domain/validators/backup_validator.dart';
import 'tables_schema.dart';

/// Generates a web-compatible backup in the established N2 JSON structure.
/// PIN/verifiers and device lock state are intentionally excluded.
class MobileBackupService {
  static Future<String> exportJson(Database db, {String theme = 'light'}) async {
    final accounts = (await db.query(TablesSchema.accounts))
        .map((row) => AccountModel.fromMap(row)).map((account) => {
          'id': account.id,
          'name': account.name,
          'parentId': account.parentId,
          'categoryId': account.categoryId,
          'openingBalanceMinor': account.openingBalanceMinor,
          'status': account.status,
          if (account.phone != null) 'phone': account.phone,
          if (account.notes != null) 'notes': account.notes,
          'createdAt': account.createdAt,
          'updatedAt': account.updatedAt,
        }).toList();

    final categories = (await db.query(TablesSchema.categories))
        .map((row) => {
          'id': row['id'], 'name': row['name'], 'sortOrder': row['sortOrder'],
        }).toList();

    final transactions = (await db.query(TablesSchema.transactions))
        .map((row) => TransactionModel.fromMap(row)).map((tx) => {
          'id': tx.id,
          'accountId': tx.accountId,
          'entryType': tx.entryType.name,
          'amountMinor': tx.amountMinor,
          'date': tx.date,
          'description': tx.description,
          if (tx.notes != null) 'notes': tx.notes,
          'attachmentIds': tx.attachmentIds,
          if (tx.transferId != null) 'transferId': tx.transferId,
          if (tx.transferRole != null) 'transferRole': tx.transferRole!.name,
          if (tx.counterpartyAccountId != null)
            'counterpartyAccountId': tx.counterpartyAccountId,
          'createdAt': tx.createdAt,
          'updatedAt': tx.updatedAt,
        }).toList();

    // v3 attachments had no transactionId column; recover ownership from the
    // authoritative movement attachmentIds where possible rather than dropping links.
    final attachmentOwners = <String, String>{};
    for (final tx in transactions) {
      final txId = tx['id'] as String;
      for (final id in tx['attachmentIds'] as List<String>) {
        if (attachmentOwners.containsKey(id) && attachmentOwners[id] != txId) {
          throw StateError('المرفق مرتبط بأكثر من حركة مالية.');
        }
        attachmentOwners[id] = txId;
      }
    }

    final attachments = (await db.query(TablesSchema.attachments))
        .map((row) => {
          'id': row['id'],
          'transactionId': row['transactionId'] ?? attachmentOwners[row['id']],
          'originalName': row['originalName'] ?? row['filename'],
          'mimeType': row['mimeType'],
          'size': row['size'] ?? row['sizeBytes'],
          'dataUrl': row['dataUrl'] ?? row['base64Data'],
          'createdAt': row['createdAt'],
        }).toList();

    final notes = (await db.query(TablesSchema.notes))
        .map((row) => NoteModel.fromMap(row)).map((note) => {
          'id': note.id,
          'title': note.title,
          'content': note.content,
          'color': note.color,
          'archived': note.archived,
          'createdAt': note.createdAt,
          'updatedAt': note.updatedAt,
        }).toList();

    final dues = (await db.query(TablesSchema.dues))
        .map((row) => DueItemModel.fromMap(row)).map((due) => {
          'id': due.id,
          'accountId': due.accountId,
          if (due.sourceTransactionId != null)
            'sourceTransactionId': due.sourceTransactionId,
          'entryType': due.entryType.name,
          'dueDate': due.dueDate,
          'originalAmountMinor': due.originalAmountMinor,
          'settledAmountMinor': due.settledAmountMinor,
          'status': due.status,
          if (due.notes != null) 'notes': due.notes,
          'createdAt': due.createdAt,
          'updatedAt': due.updatedAt,
        }).toList();

    final allocations = (await db.query(TablesSchema.paymentAllocations))
        .map((row) => PaymentAllocationModel.fromMap(row)).map((value) => {
          'id': value.id, 'dueItemId': value.dueItemId,
          'paymentTransactionId': value.paymentTransactionId,
          'amountMinor': value.amountMinor,
        }).toList();

    final reminders = (await db.query(TablesSchema.reminders))
        .map((row) => ReminderModel.fromMap(row)).map((value) => {
          'id': value.id, 'dueItemId': value.dueItemId,
          'remindAt': value.remindAt, 'templateText': value.templateText,
          'isCompleted': value.isCompleted, 'channel': value.channel,
        }).toList();

    final saved = <String, dynamic>{};
    const safeSettings = [
      'ownerName', 'theme', 'sidebarCollapsed', 'currencyCode',
      'currencySymbol', 'currencyDecimals',
    ];
    for (final row in await db.query(TablesSchema.settings)) {
      final key = row['key'] as String;
      if (!safeSettings.contains(key)) continue;
      try { saved[key] = jsonDecode(row['value'] as String); }
      catch (_) { continue; }
    }
    final settings = <String, dynamic>{
      'ownerName': saved['ownerName'] ?? 'راكان',
      'theme': saved['theme'] ?? theme,
      'sidebarCollapsed': saved['sidebarCollapsed'] ?? false,
      'currencyCode': 'SAR',
      'currencySymbol': 'ر.س',
      'currencyDecimals': 2,
    };

    final data = <String, dynamic>{
      'accounts': accounts,
      'categories': categories,
      'transactions': transactions,
      'attachments': attachments,
      'notes': notes,
      'dues': dues,
      'allocations': allocations,
      'reminders': reminders,
      'settings': settings,
    };
    final checksum = sha256.convert(utf8.encode(jsonEncode(data))).toString();
    final bundle = {
      'manifest': {
        'formatName': 'RAKAN_BALANCE_BACKUP',
        'backupFormatVersion': 2,
        'schemaVersion': 2,
        'exportedAt': DateTime.now().toUtc().toIso8601String(),
        'appName': 'راكان بلانس | RAKAN BALANCE',
        'checksum': checksum,
        'recordCounts': {
          'accounts': accounts.length,
          'categories': categories.length,
          'transactions': transactions.length,
          'attachments': attachments.length,
          'notes': notes.length,
          'dues': dues.length,
          'allocations': allocations.length,
          'reminders': reminders.length,
        },
      },
      'data': data,
    };
    final jsonString = const JsonEncoder.withIndent('  ').convert(bundle);
    final valid = BackupValidator.validateBackupJson(jsonString);
    if (!valid.isValid) {
      throw StateError('فشل فحص النسخة الاحتياطية المصدرة: ${valid.error}');
    }
    return jsonString;
  }
}
