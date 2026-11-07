import 'dart:convert';
import 'dart:typed_data';

import '../models/attachment_model.dart';

enum AttachmentPreviewKind {
  image,
  pdf,
  text,
  unsupported,
}

class AttachmentPreviewData {
  final AttachmentPreviewKind kind;
  final Uint8List bytes;
  final String? text;

  const AttachmentPreviewData({
    required this.kind,
    required this.bytes,
    this.text,
  });
}

class AttachmentPreviewService {
  static Uint8List decodeBytes(AttachmentModel attachment) {
    final raw = attachment.effectiveDataUrl.trim();
    if (raw.isEmpty) {
      throw const FormatException('بيانات المرفق فارغة.');
    }

    String encoded;
    if (raw.startsWith('data:')) {
      final expectedPrefix = 'data:${attachment.mimeType};base64,';
      if (!raw.startsWith(expectedPrefix)) {
        throw const FormatException('نوع بيانات المرفق لا يطابق MIME المسجل.');
      }
      encoded = raw.substring(expectedPrefix.length);
    } else {
      // Legacy backups may contain raw Base64 in base64Data.
      encoded = raw;
    }

    late final Uint8List bytes;
    try {
      bytes = Uint8List.fromList(base64Decode(encoded));
    } on FormatException {
      throw const FormatException('محتوى Base64 للمرفق غير صالح.');
    }

    if (bytes.isEmpty) {
      throw const FormatException('المرفق لا يحتوي بيانات قابلة للعرض.');
    }
    if (attachment.effectiveSize > 0 &&
        attachment.effectiveSize != bytes.length) {
      throw const FormatException(
        'حجم المرفق المخزن لا يطابق حجم البيانات الفعلي.',
      );
    }
    return bytes;
  }

  static AttachmentPreviewKind kindOf(AttachmentModel attachment) {
    final mime = attachment.mimeType.toLowerCase();
    if (mime.startsWith('image/')) return AttachmentPreviewKind.image;
    if (mime == 'application/pdf') return AttachmentPreviewKind.pdf;
    if (mime.startsWith('text/') ||
        mime == 'application/csv' ||
        mime == 'application/json') {
      return AttachmentPreviewKind.text;
    }
    return AttachmentPreviewKind.unsupported;
  }

  static AttachmentPreviewData build(AttachmentModel attachment) {
    final bytes = decodeBytes(attachment);
    final kind = kindOf(attachment);
    if (kind == AttachmentPreviewKind.text) {
      String text;
      try {
        text = utf8.decode(bytes, allowMalformed: false);
      } on FormatException {
        throw const FormatException('ترميز الملف النصي ليس UTF-8 صالحًا.');
      }
      const maxPreviewChars = 12000;
      if (text.length > maxPreviewChars) {
        text = '${text.substring(0, maxPreviewChars)}\n\n… تم اختصار المعاينة';
      }
      return AttachmentPreviewData(kind: kind, bytes: bytes, text: text);
    }
    return AttachmentPreviewData(kind: kind, bytes: bytes);
  }

  static String humanSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
  }
}
