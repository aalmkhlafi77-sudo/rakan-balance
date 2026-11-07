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
import '../presentation/screens/transactions_screen.dart';
import '../presentation/state/app_state_notifier.dart';
import 'theme/app_theme.dart';
import 'theme/app_colors.dart';

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
            home: state.isLoading
                ? const Scaffold(body: Center(child: CircularProgressIndicator()))
                : (state.isPinLocked ? const PinLockScreen() : const MainShellScreen()),
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

class _MainShellScreenState extends State<MainShellScreen> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    if (lifecycle == AppLifecycleState.hidden ||
        lifecycle == AppLifecycleState.paused) {
      context.read<AppStateNotifier>().lockIfPinEnabled();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  int _currentIndex = 0;

  final List<Widget> _screens = const [
    DashboardScreen(),
    AccountsScreen(),
    TransactionsScreen(),
    DuesScreen(),
    StatementsScreen(),
    TransferScreen(),
    NotesScreen(),
    BackupRestoreScreen(),
    SettingsScreen(),
  ];

  final List<String> _titles = const [
    'لوحة التحكم والملخص المالي',
    'دليل الحسابات والملاحظات الخاصة',
    'دفتر الحركات المالية',
    'الاستحقاقات والسداد والتذكيرات',
    'كشف الحساب والتقارير',
    'حركة بينية (نقل مديونية)',
    'الملاحظات العامة',
    'النسخ والاستعادة',
    'الإعدادات والمظهر',
  ];

  final List<IconData> _icons = const [
    Icons.dashboard_outlined,
    Icons.people_outline,
    Icons.receipt_long_outlined,
    Icons.event_note_outlined,
    Icons.assessment_outlined,
    Icons.swap_horiz,
    Icons.note_outlined,
    Icons.backup_outlined,
    Icons.settings_outlined,
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
      drawer: Drawer(child: SafeArea(child: ListView(
        children: [
          const Padding(padding: EdgeInsets.all(16),
            child: Text('راكان بلانس — الأقسام',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
          for (var index = 0; index < _titles.length; index++)
            ListTile(
              leading: Icon(_icons[index]),
              selected: index == _currentIndex,
              title: Text(_titles[index]),
              onTap: () {
                Navigator.pop(context);
                setState(() => _currentIndex = index);
              },
            ),
        ],
      ))),
      bottomNavigationBar: _currentIndex < 5
          ? BottomNavigationBar(
              currentIndex: _currentIndex,
              onTap: (idx) => setState(() => _currentIndex = idx),
              selectedItemColor: AppColors.emerald600,
              unselectedItemColor: Colors.grey,
              type: BottomNavigationBarType.fixed,
              items: const [
                BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'الرئيسية'),
                BottomNavigationBarItem(icon: Icon(Icons.people), label: 'الحسابات'),
                BottomNavigationBarItem(icon: Icon(Icons.receipt_long), label: 'الحركات'),
                BottomNavigationBarItem(icon: Icon(Icons.event_note), label: 'الاستحقاقات'),
                BottomNavigationBarItem(icon: Icon(Icons.assessment), label: 'التقارير'),
              ],
            )
          : null,
    );
  }
}
