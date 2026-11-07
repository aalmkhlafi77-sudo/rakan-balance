class InterAccountTransferInput {
  final String sourceAccountId;
  final String destinationAccountId;
  final int amountMinor;
  final String date;
  final String description;

  InterAccountTransferInput({
    required this.sourceAccountId,
    required this.destinationAccountId,
    required this.amountMinor,
    required this.date,
    required this.description,
  });
}

class AttachmentModel {
  final String id;
  final String filename;
  final String mimeType;
  final int sizeBytes;
  final String base64Data;
  final String? transactionId;
  final String? originalName;
  final int? size;
  final String? dataUrl;
  final String createdAt;

  const AttachmentModel({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.sizeBytes,
    required this.base64Data,
    this.transactionId,
    this.originalName,
    this.size,
    this.dataUrl,
    required this.createdAt,
  });

  String get displayName => originalName ?? filename;
  int get effectiveSize => size ?? sizeBytes;
  String get effectiveDataUrl => dataUrl ?? base64Data;

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'filename': filename,
      'mimeType': mimeType,
      'sizeBytes': sizeBytes,
      'base64Data': base64Data,
      'transactionId': transactionId,
      'originalName': originalName,
      'size': size,
      'dataUrl': dataUrl,
      'createdAt': createdAt,
    };
  }

  factory AttachmentModel.fromMap(Map<String, dynamic> map) {
    final legacyName = map['filename'] as String? ?? 'attachment';
    final legacySize = map['sizeBytes'] as int? ?? 0;
    final legacyData = map['base64Data'] as String? ?? '';
    return AttachmentModel(
      id: map['id'] as String,
      filename: legacyName,
      mimeType: map['mimeType'] as String? ?? 'application/octet-stream',
      sizeBytes: legacySize,
      base64Data: legacyData,
      transactionId: map['transactionId'] as String?,
      originalName: map['originalName'] as String?,
      size: map['size'] as int?,
      dataUrl: map['dataUrl'] as String?,
      createdAt: map['createdAt'] as String? ?? '',
    );
  }
}

class NoteModel {
  final String id;
  final String title;
  final String color;
  final bool archived;
  final String content;
  final String createdAt;
  final String updatedAt;

  NoteModel({
    required this.id,
    this.title = '',
    this.color = 'slate',
    this.archived = false,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'content': content,
      'title': title,
      'color': color,
      'archived': archived ? 1 : 0,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }

  factory NoteModel.fromMap(Map<String, dynamic> map) {
    return NoteModel(
      id: map['id'] as String,
      content: map['content'] as String,
      title: map['title'] as String? ?? '',
      color: map['color'] as String? ?? 'slate',
      archived: map['archived'] == true || map['archived'] == 1,
      createdAt: map['createdAt'] as String,
      updatedAt: map['updatedAt'] as String,
    );
  }
}
