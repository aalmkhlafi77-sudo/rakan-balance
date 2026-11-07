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
  final String createdAt;

  AttachmentModel({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.sizeBytes,
    required this.base64Data,
    required this.createdAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'filename': filename,
      'mimeType': mimeType,
      'sizeBytes': sizeBytes,
      'base64Data': base64Data,
      'createdAt': createdAt,
    };
  }

  factory AttachmentModel.fromMap(Map<String, dynamic> map) {
    return AttachmentModel(
      id: map['id'] as String,
      filename: map['filename'] as String,
      mimeType: map['mimeType'] as String,
      sizeBytes: map['sizeBytes'] as int,
      base64Data: map['base64Data'] as String,
      createdAt: map['createdAt'] as String,
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
