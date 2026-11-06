import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'tables_schema.dart';

class DatabaseHelper {
  static const String _dbName = 'rakan_balance_v3.db';
  static const int _dbVersion = 3;

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
  }

  /// Helper method for testing: reset database in memory or file
  static Future<Database> initInMemoryDatabase() async {
    final db = await openDatabase(
      inMemoryDatabasePath,
      version: _dbVersion,
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
