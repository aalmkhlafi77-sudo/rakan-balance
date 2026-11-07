import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/domain/validators/backup_validator.dart';
import 'package:rakan_balance_mobile/domain/financial/inter_account_transfer_engine.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/transfer_model.dart';

void main() {
  group('SHA-256 Web Export Backup Compatibility Suite', () {
    test('BackupValidator accepts valid v2 backup bundle with SHA-256 checksum', () {
      final dataObj = {
        'accounts': [
          {
            'id': 'acc-1',
            'name': 'عميل اختباري',
            'parentId': null,
            'categoryId': 'cat-1',
            'openingBalanceMinor': 20000,
            'status': 'active',
            'createdAt': '2026-01-01T00:00:00Z',
            'updatedAt': '2026-01-01T00:00:00Z',
          }
        ],
        'categories': [
          {'id': 'cat-1', 'name': 'عملاء', 'sortOrder': 1}
        ],
        'transactions': [],
        'attachments': [],
        'notes': [],
        'dues': [],
        'allocations': [],
        'reminders': [],
      };

      final dataStr = jsonEncode(dataObj);
      final checksum = sha256.convert(utf8.encode(dataStr)).toString();

      final bundleObj = {
        'manifest': {
          'formatName': 'RAKAN_BALANCE_BACKUP',
          'backupFormatVersion': 2,
          'schemaVersion': 2,
          'exportedAt': '2026-11-06T00:00:00Z',
          'appName': 'راكان بلانس | RAKAN BALANCE',
          'checksum': checksum,
          'recordCounts': {
            'accounts': 1,
            'categories': 1,
            'transactions': 0,
            'attachments': 0,
            'notes': 0,
            'dues': 0,
            'allocations': 0,
            'reminders': 0,
          },
        },
        'data': dataObj,
      };

      final res = BackupValidator.validateBackupJson(jsonEncode(bundleObj));
      expect(res.isValid, true);
      expect(res.error, isNull);
    });

    test('BackupValidator accepts only complete reciprocal transfer pairs', () {
      final accounts = [
        AccountModel(id: 'src', name: 'Source', categoryId: 'cat',
          openingBalanceMinor: 20000, createdAt: '', updatedAt: ''),
        AccountModel(id: 'dst', name: 'Destination', categoryId: 'cat',
          openingBalanceMinor: 0, createdAt: '', updatedAt: ''),
      ];
      final pair = InterAccountTransferEngine.buildTransferEntries(
        input: InterAccountTransferInput(sourceAccountId: 'src',
          destinationAccountId: 'dst', amountMinor: 5000,
          date: '2026-11-02', description: 'نقل مديونية'),
        transferId: 'transfer-test', sourceAccountName: 'Source',
        destinationAccountName: 'Destination');

      String buildBackup(List<Map<String, dynamic>> transactions) {
        final data = <String, dynamic>{
          'accounts': accounts.map((a) => a.toMap()).toList(),
          'categories': [
            {'id': 'cat', 'name': 'عام', 'sortOrder': 0},
          ],
          'transactions': transactions,
          'attachments': <dynamic>[],
          'notes': <dynamic>[],
          'dues': <dynamic>[],
          'allocations': <dynamic>[],
          'reminders': <dynamic>[],
        };
        return jsonEncode({
          'manifest': {
            'formatName': 'RAKAN_BALANCE_BACKUP',
            'backupFormatVersion': 2,
            'schemaVersion': 2,
            'checksum': sha256.convert(utf8.encode(jsonEncode(data))).toString(),
            'recordCounts': {
              'accounts': 2, 'categories': 1, 'transactions': transactions.length,
              'attachments': 0, 'notes': 0,
              'dues': 0, 'allocations': 0, 'reminders': 0,
            },
          },
          'data': data,
        });
      }

      final valid = buildBackup(pair.map((tx) => {
        ...tx.toMap(), 'attachmentIds': <String>[],
      }).toList());
      expect(BackupValidator.validateBackupJson(valid).isValid, true);

      final orphan = buildBackup([{
        ...pair.first.toMap(), 'attachmentIds': <String>[],
      }]);
      expect(BackupValidator.validateBackupJson(orphan).isValid, false);

      final broken = pair.map((tx) => {
        ...tx.toMap(), 'attachmentIds': <String>[],
      }).toList();
      broken[1] = {...broken[1], 'counterpartyAccountId': 'unknown'};
      expect(BackupValidator.validateBackupJson(buildBackup(broken)).isValid, false);
    });

    test('BackupValidator rejects tampered json with mismatched SHA-256 checksum', () {
      final bundleObj = {
        'manifest': {
          'formatName': 'RAKAN_BALANCE_BACKUP',
          'backupFormatVersion': 2,
          'schemaVersion': 2,
          'exportedAt': '2026-11-06T00:00:00Z',
          'appName': 'راكان بلانس | RAKAN BALANCE',
          'checksum': '0000000000000000000000000000000000000000000000000000000000000000',
          'recordCounts': {
            'accounts': 0,
            'categories': 0,
            'transactions': 0,
            'attachments': 0,
            'notes': 0,
          },
        },
        'data': {
          'accounts': [],
          'categories': [],
          'transactions': [],
          'attachments': [],
          'notes': [],
        },
      };

      final res = BackupValidator.validateBackupJson(jsonEncode(bundleObj));
      expect(res.isValid, false);
      expect(res.error, contains('SHA-256'));
    });
  });
}
