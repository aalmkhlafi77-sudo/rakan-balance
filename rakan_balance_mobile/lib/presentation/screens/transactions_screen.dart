import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:printing/printing.dart';

import '../../domain/financial/money_utils.dart';
import '../../domain/attachments/attachment_preview_service.dart';
import '../../domain/models/transaction_model.dart';
import '../../domain/models/attachment_model.dart';
import '../../domain/validators/attachment_policy.dart';
import '../state/app_state_notifier.dart';

/// Regular ledger movements. Transfers and allocated due payments are read-only
/// here and remain editable only through their owning atomic workflows.
class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  String? _accountFilter;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();
    final eligible = state.transactions.where(
      (tx) => _accountFilter == null || tx.accountId == _accountFilter).toList();

    return Column(children: [
      Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          DropdownButtonFormField<String>(
            initialValue: _accountFilter,
            decoration: const InputDecoration(labelText: 'تصفية حسب الحساب'),
            items: [
              const DropdownMenuItem<String>(value: null, child: Text('كل الحسابات')),
              ...state.accounts.map((account) =>
                  DropdownMenuItem<String>(value: account.id, child: Text(account.name))),
            ],
            onChanged: (value) => setState(() => _accountFilter = value),
          ),
          const SizedBox(height: 8),
          SizedBox(width: double.infinity, child: FilledButton.icon(
            icon: const Icon(Icons.add),
            label: const Text('إضافة حركة مالية'),
            onPressed: state.accounts.any((a) => a.status == 'active')
                ? () => _openEditor(context)
                : null,
          )),
        ]),
      ),
      Expanded(child: eligible.isEmpty
          ? const Center(child: Text('لا توجد حركات مالية'))
          : ListView.builder(
            itemCount: eligible.length,
            itemBuilder: (ctx, index) {
              final tx = eligible[index];
              final names = state.accounts.where((a) => a.id == tx.accountId);
              final accountName = names.isEmpty ? 'حساب غير معروف' : names.first.name;
              final linkedPayment = state.allocations.any((a) => a.paymentTransactionId == tx.id);
              final guarded = tx.transferId != null || linkedPayment;
              return Card(margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: ListTile(
                  title: Text(tx.description),
                  subtitle: Text('$accountName — ${tx.date}${guarded ? ' • حركة مرتبطة' : ''}'),
                  leading: Icon(guarded ? Icons.link : Icons.receipt_long_outlined),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text('${MoneyUtils.formatMinorAmount(tx.signedAmountMinor)} ر.س',
                      style: TextStyle(color: tx.signedAmountMinor >= 0
                          ? Colors.green : Colors.red, fontWeight: FontWeight.bold)),
                    PopupMenuButton<String>(
                      onSelected: (action) {
                        if (action == 'attachments') _openAttachments(context, tx);
                        if (action == 'edit') _openEditor(context, existing: tx);
                        if (action == 'delete') _confirmDelete(context, tx);
                      },
                      itemBuilder: (_) => [
                        PopupMenuItem(
                          value: 'attachments',
                          child: Text('المرفقات (${tx.attachmentIds.length})'),
                        ),
                        if (!guarded)
                          const PopupMenuItem(value: 'edit', child: Text('تعديل')),
                        if (!guarded)
                          const PopupMenuItem(value: 'delete', child: Text('حذف')),
                      ],
                    ),
                  ]),
                ));
            },
          )),
    ]);
  }

  Future<void> _openEditor(BuildContext context, {TransactionModel? existing}) async {
    final state = context.read<AppStateNotifier>();
    final accounts = state.accounts.where((a) => a.status == 'active').toList();
    if (accounts.isEmpty) return;
    var selectedAccount = existing?.accountId ?? accounts.first.id;
    var entryType = existing?.entryType ?? EntryType.owedByAccount;
    final amount = TextEditingController(
      text: existing == null ? '' : MoneyUtils.formatMinorAmount(existing.amountMinor));
    final date = TextEditingController(
      text: existing?.date ?? DateTime.now().toIso8601String().split('T').first);
    final description = TextEditingController(text: existing?.description ?? '');
    String? error;
    var saving = false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (ctx, refresh) => AlertDialog(
          title: Text(existing == null ? 'إضافة حركة مالية' : 'تعديل الحركة المالية'),
          content: SingleChildScrollView(child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedAccount,
                decoration: const InputDecoration(labelText: 'الحساب'),
                items: accounts.map((a) =>
                    DropdownMenuItem(value: a.id, child: Text(a.name))).toList(),
                onChanged: saving ? null : (value) =>
                    refresh(() => selectedAccount = value ?? selectedAccount),
              ),
              DropdownButtonFormField<EntryType>(
                initialValue: entryType,
                decoration: const InputDecoration(labelText: 'نوع الحركة'),
                items: const [
                  DropdownMenuItem(value: EntryType.owedByAccount,
                    child: Text('عليه — زيادة المستحق لك')),
                  DropdownMenuItem(value: EntryType.owedToAccount,
                    child: Text('له — تقليل المستحق لك')),
                ],
                onChanged: saving ? null : (value) =>
                    refresh(() => entryType = value ?? entryType),
              ),
              TextField(controller: amount, keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'المبلغ بالريال')),
              TextField(controller: date,
                decoration: const InputDecoration(labelText: 'التاريخ YYYY-MM-DD')),
              TextField(controller: description,
                decoration: const InputDecoration(labelText: 'البيان')),
              if (error != null)
                Text(error!, style: const TextStyle(color: Colors.red)),
            ],
          )),
          actions: [
            TextButton(onPressed: saving ? null : () => Navigator.pop(ctx),
              child: const Text('إلغاء')),
            FilledButton(onPressed: saving ? null : () async {
              final parsed = MoneyUtils.toMinorUnits(amount.text);
              if (!parsed.success || parsed.minor <= 0) {
                refresh(() => error = parsed.error ?? 'مبلغ الحركة يجب أن يكون موجبًا.');
                return;
              }
              refresh(() { saving = true; error = null; });
              try {
                if (existing == null) {
                  await state.createTransaction(
                    accountId: selectedAccount, entryType: entryType,
                    amountMinor: parsed.minor, date: date.text,
                    description: description.text);
                } else {
                  await state.updateRegularTransaction(TransactionModel(
                    id: existing.id, accountId: selectedAccount,
                    entryType: entryType, amountMinor: parsed.minor,
                    date: date.text, description: description.text,
                    attachmentIds: existing.attachmentIds,
                    createdAt: existing.createdAt,
                    updatedAt: DateTime.now().toUtc().toIso8601String()));
                }
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) refresh(() => error = e.toString());
              } finally {
                if (ctx.mounted) refresh(() => saving = false);
              }
            }, child: const Text('حفظ')),
          ],
        ),
      ),
    );
    amount.dispose();
    date.dispose();
    description.dispose();
  }

  Future<void> _downloadAttachment(
      BuildContext context, AttachmentModel attachment) async {
    try {
      final bytes = AttachmentPreviewService.decodeBytes(attachment);
      final output = await FilePicker.platform.saveFile(
        dialogTitle: 'حفظ المرفق',
        fileName: attachment.displayName,
        bytes: bytes,
      );
      if (context.mounted && output != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تم حفظ المرفق: $output')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر حفظ المرفق: $e')));
      }
    }
  }

  IconData _attachmentIcon(AttachmentModel attachment) {
    switch (AttachmentPreviewService.kindOf(attachment)) {
      case AttachmentPreviewKind.image:
        return Icons.image_outlined;
      case AttachmentPreviewKind.pdf:
        return Icons.picture_as_pdf_outlined;
      case AttachmentPreviewKind.text:
        return Icons.description_outlined;
      case AttachmentPreviewKind.unsupported:
        final mime = attachment.mimeType.toLowerCase();
        if (mime.contains('spreadsheet') || mime.contains('excel')) {
          return Icons.table_chart_outlined;
        }
        if (mime.contains('word') || mime.contains('document')) {
          return Icons.article_outlined;
        }
        return Icons.insert_drive_file_outlined;
    }
  }

  Future<void> _previewAttachment(
    BuildContext context,
    AttachmentModel attachment,
  ) async {
    try {
      final preview = AttachmentPreviewService.build(attachment);
      if (!context.mounted) return;

      await showDialog<void>(
        context: context,
        builder: (dialogContext) {
          Widget body;
          switch (preview.kind) {
            case AttachmentPreviewKind.image:
              body = InteractiveViewer(
                minScale: 0.5,
                maxScale: 5,
                child: Center(
                  child: Image.memory(
                    preview.bytes,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) =>
                        const Text('تعذر عرض الصورة.'),
                  ),
                ),
              );
              break;
            case AttachmentPreviewKind.pdf:
              body = PdfPreview(
                build: (_) async => preview.bytes,
                pdfFileName: attachment.displayName,
                allowPrinting: false,
                allowSharing: false,
                canChangePageFormat: false,
                canChangeOrientation: false,
                canDebug: false,
                useActions: false,
                onError: (_, error) => Center(
                  child: Text('تعذر عرض PDF: $error'),
                ),
              );
              break;
            case AttachmentPreviewKind.text:
              body = Scrollbar(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(12),
                  child: SelectableText(
                    preview.text ?? '',
                    textDirection: TextDirection.rtl,
                  ),
                ),
              );
              break;
            case AttachmentPreviewKind.unsupported:
              body = const Center(
                child: Text(
                  'لا تتوفر معاينة داخلية لهذا النوع. '
                  'يمكن تنزيل الملف وفتحه بالتطبيق المناسب.',
                  textAlign: TextAlign.center,
                ),
              );
              break;
          }

          return Dialog(
            insetPadding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.maxFinite,
              height: MediaQuery.of(dialogContext).size.height * 0.82,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                    child: Row(
                      children: [
                        Icon(_attachmentIcon(attachment)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                attachment.displayName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                '${attachment.mimeType} · '
                                '${AttachmentPreviewService.humanSize(preview.bytes.length)}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'إغلاق',
                          onPressed: () => Navigator.pop(dialogContext),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1),
                  Expanded(child: body),
                ],
              ),
            ),
          );
        },
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر معاينة المرفق: $e')),
        );
      }
    }
  }

  Future<void> _openAttachments(
      BuildContext context, TransactionModel tx) async {
    final state = context.read<AppStateNotifier>();
    var attachments = await state.getAttachmentsForTransaction(tx.id);
    if (!context.mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (modalContext) => StatefulBuilder(
        builder: (ctx, refresh) {
          Future<void> reload() async {
            final loaded = await state.getAttachmentsForTransaction(tx.id);
            if (ctx.mounted) {
              refresh(() => attachments = loaded);
            }
          }

          Future<void> addAttachment() async {
            try {
              final picked = await FilePicker.platform.pickFiles(
                type: FileType.custom,
                allowedExtensions: AttachmentPolicy.allowedExtensions,
                allowMultiple: false,
                withData: true,
              );
              if (picked == null || picked.files.isEmpty) return;
              final file = picked.files.single;
              final bytes = file.bytes;
              if (bytes == null) {
                throw StateError('تعذر قراءة محتوى الملف المحدد.');
              }
              await state.addAttachmentToTransaction(
                txId: tx.id, originalName: file.name, bytes: bytes);
              await reload();
            } catch (e) {
              if (ctx.mounted) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  SnackBar(content: Text('تعذر إضافة المرفق: $e')));
              }
            }
          }

          Future<void> removeAttachment(AttachmentModel attachment) async {
            final approved = await showDialog<bool>(
              context: ctx,
              builder: (dialogContext) => AlertDialog(
                title: const Text('حذف المرفق'),
                content: Text('حذف "${attachment.displayName}" من هذه الحركة؟'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(dialogContext, false),
                    child: const Text('إلغاء')),
                  FilledButton(
                    onPressed: () => Navigator.pop(dialogContext, true),
                    child: const Text('حذف')),
                ],
              ),
            );
            if (approved != true) return;
            try {
              await state.deleteAttachmentFromTransaction(
                txId: tx.id, attachmentId: attachment.id);
              await reload();
            } catch (e) {
              if (ctx.mounted) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  SnackBar(content: Text('تعذر حذف المرفق: $e')));
              }
            }
          }

          return SafeArea(
            child: SizedBox(
              height: MediaQuery.of(ctx).size.height * 0.72,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('مرفقات الحركة — ${tx.description}',
                      style: Theme.of(ctx).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (state.activeScope != 'real')
                      const Text(
                        'المرفقات متاحة للبيانات الحقيقية فقط.',
                        style: TextStyle(color: Colors.grey)),
                    OutlinedButton.icon(
                      onPressed: state.activeScope == 'real' ? addAttachment : null,
                      icon: const Icon(Icons.attach_file),
                      label: const Text('إضافة صورة أو مستند'),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: attachments.isEmpty
                          ? const Center(child: Text('لا توجد مرفقات لهذه الحركة.'))
                          : ListView.builder(
                              itemCount: attachments.length,
                              itemBuilder: (_, index) {
                                final attachment = attachments[index];
                                final kind =
                                    AttachmentPreviewService.kindOf(attachment);
                                Widget? preview;
                                if (kind == AttachmentPreviewKind.image) {
                                  try {
                                    final data =
                                        AttachmentPreviewService.build(attachment);
                                    preview = GestureDetector(
                                      onTap: () =>
                                          _previewAttachment(ctx, attachment),
                                      child: ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: Image.memory(
                                          data.bytes,
                                          height: 160,
                                          width: double.infinity,
                                          fit: BoxFit.contain,
                                          errorBuilder: (_, __, ___) =>
                                              const SizedBox.shrink(),
                                        ),
                                      ),
                                    );
                                  } catch (_) {
                                    preview = null;
                                  }
                                }
                                return Card(
                                  child: Padding(
                                    padding: const EdgeInsets.all(10),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.stretch,
                                      children: [
                                        if (preview != null) ...[
                                          preview,
                                          const SizedBox(height: 8),
                                        ],
                                        Row(
                                          children: [
                                            Icon(
                                              _attachmentIcon(attachment),
                                              size: 20,
                                            ),
                                            const SizedBox(width: 6),
                                            Expanded(
                                              child: Text(
                                                attachment.displayName,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        Text(
                                          '${attachment.mimeType} • '
                                          '${AttachmentPreviewService.humanSize(attachment.effectiveSize)}',
                                          style: const TextStyle(
                                            fontSize: 12, color: Colors.grey)),
                                        const SizedBox(height: 6),
                                        Wrap(
                                          spacing: 8,
                                          children: [
                                            if (kind !=
                                                AttachmentPreviewKind.unsupported)
                                              OutlinedButton.icon(
                                                onPressed: () =>
                                                    _previewAttachment(
                                                      ctx,
                                                      attachment,
                                                    ),
                                                icon: const Icon(
                                                  Icons.visibility_outlined,
                                                ),
                                                label: const Text('معاينة'),
                                              ),
                                            OutlinedButton.icon(
                                              onPressed: () =>
                                                _downloadAttachment(ctx, attachment),
                                              icon: const Icon(Icons.download_outlined),
                                              label: const Text('تنزيل'),
                                            ),
                                            TextButton.icon(
                                              onPressed: () =>
                                                removeAttachment(attachment),
                                              icon: const Icon(Icons.delete_outline),
                                              label: const Text('حذف'),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, TransactionModel tx) async {
    final state = context.read<AppStateNotifier>();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف الحركة المالية'),
        content: const Text('سيتم حذف هذه الحركة المالية فقط. هل تريد الاستمرار؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('تأكيد الحذف')),
        ],
      ),
    );
    if (accepted != true) return;
    try {
      await state.deleteRegularTransaction(tx.id);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر حذف الحركة: $e')));
      }
    }
  }
}
