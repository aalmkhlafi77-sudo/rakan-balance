/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Dart Domain Specification & Export
 * Pure Dart source code specification corresponding 1:1 to the domain rules.
 * Ready for immediate copy / export into a Flutter project (Android / iOS).
 */

export const DART_ACCOUNT_MODEL_SOURCE = `// lib/shared/models/account_model.dart
// RAKAN BALANCE — Core Account Model for Flutter
import 'package:flutter/foundation.dart';

enum AccountStatus { active, archived }

@immutable
class AccountModel {
  final String id;
  final String name;
  final String? parentId;
  final String categoryId;
  final int openingBalanceMinor; // Stored in Halalas (1 SAR = 100 Halalas)
  final AccountStatus status;
  final String? phone;
  final String? notes;
  final DateTime createdAt;
  final DateTime updatedAt;

  const AccountModel({
    required this.id,
    required this.name,
    this.parentId,
    required this.categoryId,
    required this.openingBalanceMinor,
    this.status = AccountStatus.active,
    this.phone,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'parent_id': parentId,
      'category_id': categoryId,
      'opening_balance_minor': openingBalanceMinor,
      'status': status.name,
      'phone': phone,
      'notes': notes,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory AccountModel.fromMap(Map<String, dynamic> map) {
    return AccountModel(
      id: map['id'] as String,
      name: map['name'] as String,
      parentId: map['parent_id'] as String?,
      categoryId: map['category_id'] as String,
      openingBalanceMinor: (map['opening_balance_minor'] as num).toInt(),
      status: map['status'] == 'archived' ? AccountStatus.archived : AccountStatus.active,
      phone: map['phone'] as String?,
      notes: map['notes'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
`;

export const DART_TRANSACTION_MODEL_SOURCE = `// lib/shared/models/transaction_model.dart
// RAKAN BALANCE — Core Transaction Model for Flutter
import 'package:flutter/foundation.dart';

enum EntryType {
  owedByAccount, // 'عليه' (+amountMinor)
  owedToAccount,  // 'له' (-amountMinor)
}

@immutable
class TransactionModel {
  final String id;
  final String accountId;
  final EntryType entryType;
  final int amountMinor; // Strictly positive integer in Halalas (> 0)
  final DateTime date;
  final String description;
  final String? notes;
  final List<String> attachmentIds;
  final DateTime createdAt;
  final DateTime updatedAt;

  const TransactionModel({
    required this.id,
    required this.accountId,
    required this.entryType,
    required this.amountMinor,
    required this.date,
    required this.description,
    this.notes,
    this.attachmentIds = const [],
    required this.createdAt,
    required this.updatedAt,
  }) : assert(amountMinor > 0, 'Transaction amount must be strictly positive');

  int get signedAmountMinor {
    return entryType == EntryType.owedByAccount ? amountMinor : -amountMinor;
  }
}
`;

export const DART_BALANCE_CALCULATOR_SOURCE = `// lib/features/accounts/domain/account_balance_calculator.dart
// RAKAN BALANCE — Pure Financial Balance Engine for Flutter
import 'dart:math';
import '../../../shared/models/account_model.dart';
import '../../../shared/models/transaction_model.dart';

class AccountBalanceCalculator {
  /// B(account) = openingBalanceMinor + Σ signedTransactionsMinor
  static int calculateAccountBalance({
    required AccountModel account,
    required List<TransactionModel> transactions,
  }) {
    final movements = transactions
        .where((t) => t.accountId == account.id)
        .fold<int>(0, (acc, t) => acc + t.signedAmountMinor);
    return account.openingBalanceMinor + movements;
  }

  /// Calculates Dashboard Grand Totals:
  /// - totalReceivable = Σ max(B, 0) (لك)
  /// - totalPayable = Σ max(-B, 0) (عليك)
  /// - net = totalReceivable - totalPayable (الصافي)
  static DashboardSummary calculateDashboardSummary({
    required List<AccountModel> accounts,
    required List<TransactionModel> transactions,
  }) {
    int totalReceivable = 0;
    int totalPayable = 0;
    int activeCount = 0;

    for (final account in accounts) {
      if (account.status == AccountStatus.active) {
        activeCount++;
        final b = calculateAccountBalance(account: account, transactions: transactions);
        if (b > 0) {
          totalReceivable += b;
        } else if (b < 0) {
          totalPayable += b.abs();
        }
      }
    }

    return DashboardSummary(
      totalReceivableMinor: totalReceivable,
      totalPayableMinor: totalPayable,
      netBalanceMinor: totalReceivable - totalPayable,
      activeAccountsCount: activeCount,
    );
  }
}

class DashboardSummary {
  final int totalReceivableMinor;
  final int totalPayableMinor;
  final int netBalanceMinor;
  final int activeAccountsCount;

  const DashboardSummary({
    required this.totalReceivableMinor,
    required this.totalPayableMinor,
    required this.netBalanceMinor,
    required this.activeAccountsCount,
  });
}
`;
