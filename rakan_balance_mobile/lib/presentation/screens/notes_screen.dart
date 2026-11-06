import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state_notifier.dart';

class NotesScreen extends StatelessWidget {
  const NotesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('الملاحظات والمذكرات العامة المستقلة', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const Text('هذه الملاحظات عامة ومفصولة تماماً عن ملاحظات الحسابات المكتومة.', style: TextStyle(color: Colors.grey, fontSize: 12)),
          const SizedBox(height: 16),
          Expanded(
            child: state.notes.isEmpty
                ? const Center(child: Text('لا توجد ملاحظات عامة مسجلة.'))
                : ListView.builder(
                    itemCount: state.notes.length,
                    itemBuilder: (context, index) {
                      final n = state.notes[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          title: Text(n.content),
                          subtitle: Text(n.updatedAt.split('T')[0]),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
