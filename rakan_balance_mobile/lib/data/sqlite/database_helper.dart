import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'tables_schema.dart';

class DatabaseHelper {
  static const String _dbName = 'rakan_balance_v3.db';
  static const int _dbVersion = 4;

  static DatabaseHelper? _instance;
  static Database? _database;

  DatabaseHelper._internal();

  factory DatabaseHelper() {
    _instance ??= DatabaseHelper._internal();
    return _instance!;
  }

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, _dbName);

    return await openDatabase(
      path,
      version: _dbVersion,
      onConfigure: (db) async => db.execute('PRAGMA foreign_keys = ON'),
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute(TablesSchema.createAccounts);
    await db.execute(TablesSchema.createDemoAccounts);
    await db.execute(TablesSchema.createCategories);
    await db.execute(TablesSchema.createDemoCategories);
    await db.execute(TablesSchema.createTransactions);
    await db.execute(TablesSchema.createDemoTransactions);
    await db.execute(TablesSchema.createAttachments);
    await db.execute(TablesSchema.createNotes);
    await db.execute(TablesSchema.createDemoNotes);
    await db.execute(TablesSchema.createDues);
    await db.execute(TablesSchema.createDemoDues);
    await db.execute(TablesSchema.createPaymentAllocations);
    await db.execute(TablesSchema.createDemoPaymentAllocations);
    await db.execute(TablesSchema.createReminders);
    await db.execute(TablesSchema.createDemoReminders);
    await db.execute(TablesSchema.createSettings);
  }

  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute(TablesSchema.createNotes);
      await db.execute(TablesSchema.createDemoNotes);
    }
    if (oldVersion < 3) {
      await db.execute(TablesSchema.createDues);
      await db.execute(TablesSchema.createDemoDues);
      await db.execute(TablesSchema.createPaymentAllocations);
      await db.execute(TablesSchema.createDemoPaymentAllocations);
      await db.execute(TablesSchema.createReminders);
      await db.execute(TablesSchema.createDemoReminders);
    }
    if (oldVersion < 4) {
      // Additive upgrades preserve every existing v3 financial row.
      await db.execute('ALTER TABLE accounts ADD COLUMN phone TEXT');
      await db.execute('ALTER TABLE demo_accounts ADD COLUMN phone TEXT');
      await db.execute('ALTER TABLE transactions ADD COLUMN notes TEXT');
      await db.execute('ALTER TABLE demo_transactions ADD COLUMN notes TEXT');
      await db.execute('ALTER TABLE attachments ADD COLUMN transactionId TEXT');
      await db.execute('ALTER TABLE attachments ADD COLUMN originalName TEXT');
      await db.execute('ALTER TABLE attachments ADD COLUMN size INTEGER');
      await db.execute('ALTER TABLE attachments ADD COLUMN dataUrl TEXT');
      for (final table in [TablesSchema.notes, TablesSchema.demoNotes]) {
        await db.execute("ALTER TABLE $table ADD COLUMN title TEXT NOT NULL DEFAULT ''");
        await db.execute("ALTER TABLE $table ADD COLUMN color TEXT NOT NULL DEFAULT 'slate'");
        await db.execute('ALTER TABLE $table ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
      }
      await db.execute('ALTER TABLE dues ADD COLUMN sourceTransactionId TEXT');
      await db.execute('ALTER TABLE demo_dues ADD COLUMN sourceTransactionId TEXT');
    }
  }

  /// Helper method for testing: reset database in memory or file
  static Future<Database> initInMemoryDatabase() async {
    final db = await openDatabase(
      inMemoryDatabasePath,
      version: _dbVersion,
      onConfigure: (db) async => db.execute('PRAGMA foreign_keys = ON'),
      onCreate: (db, version) async {
        await db.execute(TablesSchema.createAccounts);
        await db.execute(TablesSchema.createDemoAccounts);
        await db.execute(TablesSchema.createCategories);
        await db.execute(TablesSchema.createDemoCategories);
        await db.execute(TablesSchema.createTransactions);
        await db.execute(TablesSchema.createDemoTransactions);
        await db.execute(TablesSchema.createAttachments);
        await db.execute(TablesSchema.createNotes);
        await db.execute(TablesSchema.createDemoNotes);
        await db.execute(TablesSchema.createDues);
        await db.execute(TablesSchema.createDemoDues);
        await db.execute(TablesSchema.createPaymentAllocations);
        await db.execute(TablesSchema.createDemoPaymentAllocations);
        await db.execute(TablesSchema.createReminders);
        await db.execute(TablesSchema.createDemoReminders);
        await db.execute(TablesSchema.createSettings);
      },
    );
    return db;
  }
}
