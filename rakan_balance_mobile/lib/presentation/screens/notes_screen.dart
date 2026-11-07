import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/models/transfer_model.dart';
import '../state/app_state_notifier.dart';

class NotesScreen extends StatelessWidget {
  const NotesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();
    return Column(children: [
      Padding(padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('الملاحظات العامة المستقلة',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const Text('الملاحظات العامة منفصلة تمامًا عن ملاحظات الحسابات الخاصة.',
            style: TextStyle(fontSize: 12, color: Colors.grey)),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => _editNote(context),
            icon: const Icon(Icons.note_add_outlined),
            label: const Text('إضافة ملاحظة'),
          ),
        ]),
      ),
      Expanded(child: state.notes.isEmpty
          ? const Center(child: Text('لا توجد ملاحظات عامة مسجلة'))
          : ListView.builder(
            itemCount: state.notes.length,
            itemBuilder: (_, index) {
              final note = state.notes[index];
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: ListTile(
                  title: Text(note.content),
                  subtitle: Text(note.updatedAt.split('T').first),
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) {
                      if (action == 'edit') _editNote(context, note: note);
                      if (action == 'delete') _deleteNote(context, note.id);
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'edit', child: Text('تعديل')),
                      PopupMenuItem(value: 'delete', child: Text('حذف')),
                    ],
                  ),
                ),
              );
            },
          ),
      ),
    ]);
  }

  Future<void> _editNote(BuildContext context, {NoteModel? note}) async {
    final state = context.read<AppStateNotifier>();
    final controller = TextEditingController(text: note?.content ?? '');
    String? error;
    var saving = false;
    await showDialog<void>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, refresh) => AlertDialog(
          title: Text(note == null ? 'ملاحظة جديدة' : 'تعديل الملاحظة'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: controller, maxLines: 5,
              decoration: const InputDecoration(labelText: 'الملاحظة')),
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
          ]),
          actions: [
            TextButton(onPressed: saving ? null : () => Navigator.pop(ctx),
              child: const Text('إلغاء')),
            FilledButton(onPressed: saving ? null : () async {
              refresh(() => saving = true);
              try {
                if (note == null) {
                  await state.createGeneralNote(controller.text);
                } else {
                  await state.updateGeneralNote(note.id, controller.text);
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
    controller.dispose();
  }

  Future<void> _deleteNote(BuildContext context, String noteId) async {
    final state = context.read<AppStateNotifier>();
    final approved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف الملاحظة'),
        content: const Text('هل تريد حذف هذه الملاحظة العامة؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف')),
        ],
      ),
    );
    if (approved != true) return;
    try {
      await state.deleteGeneralNote(noteId);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('تعذر الحذف: $e')));
    }
  }
}
