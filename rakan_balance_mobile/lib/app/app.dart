import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import '../presentation/screens/accounts_screen.dart';
import '../presentation/screens/backup_restore_screen.dart';
import '../presentation/screens/dashboard_screen.dart';
import '../presentation/screens/dues_screen.dart';
import '../presentation/screens/notes_screen.dart';
import '../presentation/screens/pin_lock_screen.dart';
import '../presentation/screens/settings_screen.dart';
import '../presentation/screens/statements_screen.dart';
import '../presentation/screens/transfer_screen.dart';
import '../presentation/state/app_state_notifier.dart';
import 'theme/app_theme.dart';

class RakanBalanceApp extends StatelessWidget {
  const RakanBalanceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppStateNotifier()..init(),
      child: Consumer<AppStateNotifier>(
        builder: (context, state, child) {
          return MaterialApp(
            title: 'راكان بلانس | RAKAN BALANCE',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            darkTheme: AppTheme.darkTheme,
            themeMode: state.themeMode,
            locale: const Locale('ar', ''),
            supportedLocales: const [Locale('ar', '')],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: state.isPinLocked ? const PinLockScreen() : const MainShellScreen(),
          );
        },
      ),
    );
  }
}

class MainShellScreen extends StatefulWidget {
  const MainShellScreen({super.key});

  @override
  State<MainShellScreen> createState() => _MainShellScreenState();
}

class _MainShellScreenState extends State<MainShellScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    DashboardScreen(),
    AccountsScreen(),
    TransferScreen(),
    DuesScreen(),
    StatementsScreen(),
    NotesScreen(),
    BackupRestoreScreen(),
    SettingsScreen(),
  ];

  final List<String> _titles = const [
    'لوحة التحكم والملخص المالي',
    'دليل الحسابات والملاحظات الخاصة',
    'حركة بينية (نقل مديونية)',
    'الاستحقاقات والسداد والتذكيرات',
    'كشف الحساب والتقارير',
    'الملاحظات العامة',
    'النسخ والاستعادة الذرية',
    'الإعدادات والمظهر',
  ];

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppStateNotifier>();

    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_currentIndex]),
        actions: [
          IconButton(
            icon: Icon(state.themeMode == ThemeMode.dark ? Icons.light_mode : Icons.dark_mode),
            onPressed: () => state.toggleThemeMode(),
          ),
        ],
      ),
      body: Directionality(
        textDirection: TextDirection.rtl,
        child: _screens[_currentIndex],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (idx) => setState(() => _currentIndex = idx),
        selectedItemColor: Colors.emerald,
        unselectedItemColor: Colors.grey,
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.people), label: 'الحسابات'),
          BottomNavigationBarItem(icon: Icon(Icons.swap_horiz), label: 'بينية'),
          BottomNavigationBarItem(icon: Icon(Icons.event_note), label: 'الاستحقاقات'),
          BottomNavigationBarItem(icon: Icon(Icons.assessment), label: 'التقارير'),
          BottomNavigationBarItem(icon: Icon(Icons.note), label: 'الملاحظات'),
          BottomNavigationBarItem(icon: Icon(Icons.backup), label: 'النسخ'),
          BottomNavigationBarItem(icon: Icon(Icons.settings), label: 'الإعدادات'),
        ],
      ),
    );
  }
}
