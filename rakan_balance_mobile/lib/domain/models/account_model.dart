class AccountModel {
  final String id;
  final String name;
  final String? parentId;
  final String categoryId;
  final int openingBalanceMinor;
  final String status; // 'active' | 'archived'
  final String? phone;
  final String? notes; // Private notes - strictly isolated from search/statements/CSVs/reports
  final String createdAt;
  final String updatedAt;

  AccountModel({
    required this.id,
    required this.name,
    this.parentId,
    required this.categoryId,
    required this.openingBalanceMinor,
    this.status = 'active',
    this.notes,
    this.phone,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'parentId': parentId,
      'categoryId': categoryId,
      'openingBalanceMinor': openingBalanceMinor,
      'status': status,
      'notes': notes,
      'phone': phone,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }

  factory AccountModel.fromMap(Map<String, dynamic> map) {
    return AccountModel(
      id: map['id'] as String,
      name: map['name'] as String,
      parentId: map['parentId'] as String?,
      categoryId: map['categoryId'] as String,
      openingBalanceMinor: map['openingBalanceMinor'] as int,
      status: map['status'] as String? ?? 'active',
      notes: map['notes'] as String?,
      phone: map['phone'] as String?,
      createdAt: map['createdAt'] as String,
      updatedAt: map['updatedAt'] as String,
    );
  }

  AccountModel copyWith({
    String? name,
    String? parentId,
    String? categoryId,
    int? openingBalanceMinor,
    String? status,
    String? notes,
    String? phone,
    String? updatedAt,
  }) {
    return AccountModel(
      id: id,
      name: name ?? this.name,
      parentId: parentId ?? this.parentId,
      categoryId: categoryId ?? this.categoryId,
      openingBalanceMinor: openingBalanceMinor ?? this.openingBalanceMinor,
      status: status ?? this.status,
      notes: notes ?? this.notes,
      phone: phone ?? this.phone,
      createdAt: createdAt,
      updatedAt: updatedAt ?? DateTime.now().toIso8601String(),
    );
  }
}
