class AttachmentPolicy {
  static const int maxBytes = 10 * 1024 * 1024;

  static const Map<String, String> _mimeByExtension = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  static List<String> get allowedExtensions =>
      List.unmodifiable(_mimeByExtension.keys);

  static String extensionOf(String name) {
    final clean = name.trim();
    final dot = clean.lastIndexOf('.');
    if (dot <= 0 || dot == clean.length - 1) return '';
    return clean.substring(dot + 1).toLowerCase();
  }

  static String mimeForName(String name) {
    final mime = _mimeByExtension[extensionOf(name)];
    if (mime == null) throw ArgumentError('نوع المرفق غير مدعوم.');
    return mime;
  }

  static String sanitizeOriginalName(String name) {
    final withoutPaths = name.replaceAll('\\', '/').split('/').last;
    final clean = withoutPaths
        .replaceAll(RegExp(r'[\x00-\x1F\x7F]'), '')
        .trim();
    if (clean.isEmpty) return 'attachment';
    return clean.length > 180 ? clean.substring(clean.length - 180) : clean;
  }

  static void validate({required String name, required int size}) {
    if (size <= 0) throw ArgumentError('المرفق فارغ.');
    if (size > maxBytes) {
      throw ArgumentError('حجم المرفق يتجاوز 10 ميغابايت.');
    }
    mimeForName(name);
  }

  static String safeStoredName(String id, String originalName) {
    final ext = extensionOf(originalName);
    if (!_mimeByExtension.containsKey(ext)) {
      throw ArgumentError('نوع المرفق غير مدعوم.');
    }
    final safeId = id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    return '$safeId.$ext';
  }
}
