import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/domain/validators/backup_validator.dart';

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
