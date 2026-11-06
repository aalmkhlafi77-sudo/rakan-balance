/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Dart Domain Specification & Export
 * Pure Dart source code specification corresponding 1:1 to the domain rules.
 * 
 * REVIEW FIX #6: Strict Architectural Boundary Documentation:
 * This Dart export represents the PURE FINANCIAL DOMAIN logic and immutable calculation models.
 * It does NOT claim immediate mobile/Flutter completeness. Releasing on Android/iOS requires
 * subsequent implementation of mobile storage adapters (sqflite), Flutter UI widgets, and device testing.
 */

export const DART_HEADER_NOTICE = `// =========================================================================
// RAKAN BALANCE — PURE FINANCIAL DOMAIN ENGINE (Flutter / Dart)
// المستودع المرجعي: github.com/aalmkhlafi77-sudo/rakan-accounts
//
// [تنبيه هندسي إلزامي حول حدود التصدير الحالية]:
// هذه الشيفرة تمثل فقط النواة المالية المجردة (Pure Financial Domain) وقواعد الرصيد الصارمة.
// هذه الملفات ليست تطبيق Flutter مكتملاً ولا تدعي الجاهزية الفورية للنشر على المتاجر.
// إطلاق نسخة الهواتف (Android / iOS) لاحقاً يتطلب بصورة إلزامية:
// 1. بناء واجهات العرض التفاعلية (Flutter UI Widgets / Riverpod State Management).
// 2. بناء محول تخزين SQLite المحلي (sqflite / ffi) مع عزل استدعاءات dart:io عن الويب.
// 3. تنفيذ واختبار عقود الاستحقاقات والدفعات والتذكيرات (N1 / N2).
// 4. إجراء اختبارات القبول الميدانية على أجهزة فيزيائية حقيقية (Android & iOS).
// =========================================================================
`;

export const DART_ACCOUNT_MODEL_SOURCE = `${DART_HEADER_NOTICE}
// lib/shared/models/account_model.dart
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

export const DART_TRANSACTION_MODEL_SOURCE = `${DART_HEADER_NOTICE}
// lib/shared/models/transaction_model.dart
import 'package:flutter/foundation.dart';

enum EntryType {
  owedByAccount, // 'عليه' (+amountMinor) - يزيد الرصيد
  owedToAccount,  // 'له' (-amountMinor) - ينقص الرصيد
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

export const DART_BALANCE_CALCULATOR_SOURCE = `${DART_HEADER_NOTICE}
// lib/features/accounts/domain/account_balance_calculator.dart
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
