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
    debugPrint('SMOKE_PHASE: app launch');
    app.main();
    await _settle(tester);
    debugPrint('SMOKE_PHASE: dashboard rendered');

    expect(find.text('لوحة التحكم والملخص المالي'), findsOneWidget);
    expect(find.text('الرئيسية'), findsOneWidget);

    debugPrint('SMOKE_PHASE: open accounts');
    await tester.tap(find.text('الحسابات'));
    await _settle(tester);
    expect(find.text('دليل الحسابات والملاحظات الخاصة'), findsOneWidget);
    expect(find.text('إضافة حساب جديد'), findsOneWidget);

    final menu = find.byIcon(Icons.menu);
    expect(menu, findsOneWidget);
    debugPrint('SMOKE_PHASE: open navigation drawer');
    await tester.tap(menu);
    await _settle(tester);

    expect(find.text('راكان بلانس — الأقسام'), findsOneWidget);
    debugPrint('SMOKE_PHASE: open backup screen');
    await tester.tap(find.text('النسخ والاستعادة'));
    await _settle(tester);

    expect(find.text('النسخ والاستعادة'), findsWidgets);
    expect(find.text('تصدير نسخة احتياطية JSON'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.menu));
    await _settle(tester);
    debugPrint('SMOKE_PHASE: open import screen');
    await tester.tap(find.text('استيراد CSV / Excel'));
    await _settle(tester);
    expect(find.text('استيراد الحسابات والحركات'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.menu));
    await _settle(tester);
    debugPrint('SMOKE_PHASE: open analytics screen');
    await tester.tap(find.text('التقارير والتحليلات').last);
    await _settle(tester);
    expect(find.text('المركز المالي حسب الشهر'), findsOneWidget);
    debugPrint('SMOKE_PHASE: all navigation checks passed');
  });
}
