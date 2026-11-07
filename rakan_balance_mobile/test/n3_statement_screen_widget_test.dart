import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';
import 'package:rakan_balance_mobile/presentation/screens/statements_screen.dart';
import 'package:rakan_balance_mobile/presentation/state/app_state_notifier.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  testWidgets('statement screen selects an account and renders financial period metrics',
      (tester) async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    final state = AppStateNotifier.forTesting(db);
    try {
      await state.reloadWorkspace();
      await state.createAccount(
        name: 'طرف اختبار',
        categoryName: 'عام',
        openingBalanceMinor: 20000,
      );
      final accountId = state.accounts.single.id;
      await state.createTransaction(
        accountId: accountId,
        entryType: EntryType.owedByAccount,
        amountMinor: 15000,
        date: '2026-11-01',
        description: 'فاتورة',
      );
      await state.createTransaction(
        accountId: accountId,
        entryType: EntryType.owedToAccount,
        amountMinor: 8000,
        date: '2026-11-02',
        description: 'سداد',
      );

      await tester.pumpWidget(
        ChangeNotifierProvider<AppStateNotifier>.value(
          value: state,
          child: const MaterialApp(
            home: Scaffold(body: StatementsScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('كشف الحساب والتقارير التفصيلية'), findsOneWidget);
      expect(find.text('اختر حساباً لعرض كشفه المالي.'), findsOneWidget);

      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('طرف اختبار').last);
      await tester.pumpAndSettle();

      expect(find.text('رصيد أول المدة'), findsOneWidget);
      expect(find.text('عليه خلال الفترة'), findsOneWidget);
      expect(find.text('له خلال الفترة'), findsOneWidget);
      expect(find.text('رصيد آخر المدة'), findsOneWidget);
      expect(find.text('فاتورة'), findsOneWidget);
      expect(find.text('سداد'), findsOneWidget);
      expect(find.textContaining('270.00 ر.س'), findsWidgets);
    } finally {
      state.dispose();
      await db.close();
    }
  });
}
