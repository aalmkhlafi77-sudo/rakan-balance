import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:rakan_balance_mobile/main.dart' as app;

Future<void> _settle(WidgetTester tester) =>
    tester.pumpAndSettle(
      const Duration(milliseconds: 200),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 20),
    );

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('launches and navigates core mobile screens on simulator',
      (tester) async {
    app.main();
    await _settle(tester);

    expect(find.text('لوحة التحكم والملخص المالي'), findsOneWidget);
    expect(find.text('الرئيسية'), findsOneWidget);

    await tester.tap(find.text('الحسابات'));
    await _settle(tester);
    expect(find.text('دليل الحسابات والملاحظات الخاصة'), findsOneWidget);
    expect(find.text('إضافة حساب جديد'), findsOneWidget);

    final menu = find.byIcon(Icons.menu);
    expect(menu, findsOneWidget);
    await tester.tap(menu);
    await _settle(tester);

    expect(find.text('راكان بلانس — الأقسام'), findsOneWidget);
    await tester.tap(find.text('النسخ والاستعادة'));
    await _settle(tester);

    expect(find.text('النسخ والاستعادة'), findsWidgets);
    expect(find.text('تصدير نسخة احتياطية JSON'), findsOneWidget);
  });
}
