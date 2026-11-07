enum EntryType {
  owedByAccount, // لك (مستحق على الحساب) -> +amountMinor
  owedToAccount,  // عليك (مستحق للحساب) -> -amountMinor
}

enum TransferRole {
  source,
  destination,
}

class TransactionModel {
  final String id;
  final String accountId;
  final EntryType entryType;
  final int amountMinor;
  final String date;
  final String description;
  final String? notes;
  final List<String> attachmentIds;
  final String? transferId;
  final TransferRole? transferRole;
  final String? counterpartyAccountId;
  final String createdAt;
  final String updatedAt;

  TransactionModel({
    required this.id,
    required this.accountId,
    required this.entryType,
    required this.amountMinor,
    required this.date,
    required this.description,
    this.notes,
    required this.attachmentIds,
    this.transferId,
    this.transferRole,
    this.counterpartyAccountId,
    required this.createdAt,
    required this.updatedAt,
  });

  /// Signed financial impact in Halalas:
  /// owedByAccount -> +amountMinor
  /// owedToAccount -> -amountMinor
  int get signedAmountMinor {
    return entryType == EntryType.owedByAccount ? amountMinor : -amountMinor;
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'accountId': accountId,
      'entryType': entryType == EntryType.owedByAccount ? 'owedByAccount' : 'owedToAccount',
      'amountMinor': amountMinor,
      'date': date,
      'description': description,
      'notes': notes,
      'attachmentIds': attachmentIds.join(','),
      'transferId': transferId,
      'transferRole': transferRole?.name,
      'counterpartyAccountId': counterpartyAccountId,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }

  factory TransactionModel.fromMap(Map<String, dynamic> map) {
    List<String> parseAttachments(dynamic raw) {
      if (raw == null) return [];
      if (raw is List) return raw.map((e) => e.toString()).toList();
      if (raw is String) {
        if (raw.trim().isEmpty) return [];
        return raw.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
      }
      return [];
    }

    return TransactionModel(
      id: map['id'] as String,
      accountId: map['accountId'] as String,
      entryType: map['entryType'] == 'owedByAccount'
          ? EntryType.owedByAccount
          : EntryType.owedToAccount,
      amountMinor: map['amountMinor'] as int,
      date: map['date'] as String,
      description: map['description'] as String? ?? '',
      notes: map['notes'] as String?,
      attachmentIds: parseAttachments(map['attachmentIds']),
      transferId: map['transferId'] as String?,
      transferRole: map['transferRole'] != null
          ? TransferRole.values.firstWhere(
              (e) => e.name == map['transferRole'],
            )
          : null,
      counterpartyAccountId: map['counterpartyAccountId'] as String?,
      createdAt: map['createdAt'] as String,
      updatedAt: map['updatedAt'] as String,
    );
  }
}
