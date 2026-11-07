import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/domain/attachments/attachment_preview_service.dart';
import 'package:rakan_balance_mobile/domain/models/attachment_model.dart';

AttachmentModel attachment({
  required String mime,
  required String name,
  required List<int> bytes,
  bool dataUrl = true,
  int? declaredSize,
}) {
  final encoded = base64Encode(bytes);
  return AttachmentModel(
    id: 'att',
    filename: name,
    mimeType: mime,
    sizeBytes: declaredSize ?? bytes.length,
    base64Data: dataUrl ? 'data:$mime;base64,$encoded' : encoded,
    transactionId: 'tx',
    originalName: name,
    size: declaredSize ?? bytes.length,
    dataUrl: dataUrl ? 'data:$mime;base64,$encoded' : null,
    createdAt: '',
  );
}

void main() {
  test('decodes current data URLs and legacy raw Base64', () {
    final current = attachment(
      mime: 'text/plain',
      name: 'a.txt',
      bytes: utf8.encode('مرحبا'),
    );
    final legacy = attachment(
      mime: 'text/plain',
      name: 'a.txt',
      bytes: utf8.encode('legacy'),
      dataUrl: false,
    );

    expect(utf8.decode(AttachmentPreviewService.decodeBytes(current)), 'مرحبا');
    expect(utf8.decode(AttachmentPreviewService.decodeBytes(legacy)), 'legacy');
  });

  test('rejects mismatched MIME and declared size', () {
    final wrongMime = const AttachmentModel(
      id: 'att',
      filename: 'file.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 3,
      base64Data: 'data:text/plain;base64,QUJD',
      transactionId: 'tx',
      originalName: 'file.pdf',
      size: 3,
      dataUrl: 'data:text/plain;base64,QUJD',
      createdAt: '',
    );
    final wrongSize = attachment(
      mime: 'text/plain',
      name: 'a.txt',
      bytes: utf8.encode('ABC'),
      declaredSize: 99,
    );

    expect(
      () => AttachmentPreviewService.decodeBytes(wrongMime),
      throwsFormatException,
    );
    expect(
      () => AttachmentPreviewService.decodeBytes(wrongSize),
      throwsFormatException,
    );
  });

  test('classifies supported preview kinds', () {
    expect(
      AttachmentPreviewService.kindOf(
        attachment(mime: 'image/png', name: 'a.png', bytes: [1]),
      ),
      AttachmentPreviewKind.image,
    );
    expect(
      AttachmentPreviewService.kindOf(
        attachment(mime: 'application/pdf', name: 'a.pdf', bytes: [1]),
      ),
      AttachmentPreviewKind.pdf,
    );
    expect(
      AttachmentPreviewService.kindOf(
        attachment(mime: 'text/csv', name: 'a.csv', bytes: [65]),
      ),
      AttachmentPreviewKind.text,
    );
    expect(
      AttachmentPreviewService.kindOf(
        attachment(
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          name: 'a.docx',
          bytes: [1],
        ),
      ),
      AttachmentPreviewKind.unsupported,
    );
  });

  test('text preview is UTF-8 and bounded', () {
    final longText = List.filled(13000, 'أ').join();
    final preview = AttachmentPreviewService.build(
      attachment(
        mime: 'text/plain',
        name: 'long.txt',
        bytes: utf8.encode(longText),
      ),
    );

    expect(preview.kind, AttachmentPreviewKind.text);
    expect(preview.text, isNotNull);
    expect(preview.text!.length, lessThan(longText.length));
    expect(preview.text, contains('تم اختصار المعاينة'));
  });

  test('human file sizes use readable units', () {
    expect(AttachmentPreviewService.humanSize(12), '12 B');
    expect(AttachmentPreviewService.humanSize(1536), '1.5 KB');
    expect(
      AttachmentPreviewService.humanSize(2 * 1024 * 1024),
      '2.00 MB',
    );
  });
}
