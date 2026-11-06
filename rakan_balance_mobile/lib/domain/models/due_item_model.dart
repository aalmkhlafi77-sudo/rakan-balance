import 'transaction_model.dart';

class DueItemModel {
  final String id;
  final String accountId;
  final EntryType entryType;
  final String dueDate;
  final int originalAmountMinor;
  final int settledAmountMinor;
  final String status; // 'pending' | 'partially_settled' | 'settled'
  final String? notes;
  final String createdAt;
  final String updatedAt;

  DueItemModel({
    required this.id,
    required this.accountId,
    required this.entryType,
    required this.dueDate,
    required this.originalAmountMinor,
    required this.settledAmountMinor,
    required this.status,
    this.notes,
    required this.createdAt,
    required this.updatedAt,
  });

  int get remainingAmountMinor => originalAmountMinor - settledAmountMinor;

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'accountId': accountId,
      'entryType': entryType == EntryType.owedByAccount ? 'owedByAccount' : 'owedToAccount',
      'dueDate': dueDate,
      'originalAmountMinor': originalAmountMinor,
      'settledAmountMinor': settledAmountMinor,
      'status': status,
      'notes': notes,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }

  factory DueItemModel.fromMap(Map<String, dynamic> map) {
    return DueItemModel(
      id: map['id'] as String,
      accountId: map['accountId'] as String,
      entryType: map['entryType'] == 'owedByAccount'
          ? EntryType.owedByAccount
          : EntryType.owedToAccount,
      dueDate: map['dueDate'] as String,
      originalAmountMinor: map['originalAmountMinor'] as int,
      settledAmountMinor: map['settledAmountMinor'] as int,
      status: map['status'] as String? ?? 'pending',
      notes: map['notes'] as String?,
      createdAt: map['createdAt'] as String,
      updatedAt: map['updatedAt'] as String,
    );
  }
}

class PaymentAllocationModel {
  final String id;
  final String dueItemId;
  final String paymentTransactionId;
  final int amountMinor;

  PaymentAllocationModel({
    required this.id,
    required this.dueItemId,
    required this.paymentTransactionId,
    required this.amountMinor,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'dueItemId': dueItemId,
      'paymentTransactionId': paymentTransactionId,
      'amountMinor': amountMinor,
    };
  }

  factory PaymentAllocationModel.fromMap(Map<String, dynamic> map) {
    return PaymentAllocationModel(
      id: map['id'] as String,
      dueItemId: map['dueItemId'] as String,
      paymentTransactionId: map['paymentTransactionId'] as String,
      amountMinor: map['amountMinor'] as int,
    );
  }
}

class ReminderModel {
  final String id;
  final String dueItemId;
  final String remindAt;
  final String templateText;
  final bool isCompleted;
  final String channel;

  ReminderModel({
    required this.id,
    required this.dueItemId,
    required this.remindAt,
    required this.templateText,
    required this.isCompleted,
    this.channel = 'manual',
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'dueItemId': dueItemId,
      'remindAt': remindAt,
      'templateText': templateText,
      'isCompleted': isCompleted ? 1 : 0,
      'channel': channel,
    };
  }

  factory ReminderModel.fromMap(Map<String, dynamic> map) {
    return ReminderModel(
      id: map['id'] as String,
      dueItemId: map['dueItemId'] as String,
      remindAt: map['remindAt'] as String,
      templateText: map['templateText'] as String,
      isCompleted: map['isCompleted'] == 1 || map['isCompleted'] == true,
      channel: map['channel'] as String? ?? 'manual',
    );
  }
}
