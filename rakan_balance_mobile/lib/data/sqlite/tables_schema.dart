/// SQLite Table definitions for RAKAN BALANCE Mobile (Database Version 3)
class TablesSchema {
  // Real Workspace Tables
  static const String accounts = 'accounts';
  static const String categories = 'categories';
  static const String transactions = 'transactions';
  static const String attachments = 'attachments';
  static const String notes = 'notes';
  static const String dues = 'dues';
  static const String paymentAllocations = 'payment_allocations';
  static const String reminders = 'reminders';
  static const String settings = 'settings';

  // Demo Workspace Tables (Isolated)
  static const String demoAccounts = 'demo_accounts';
  static const String demoCategories = 'demo_categories';
  static const String demoTransactions = 'demo_transactions';
  static const String demoNotes = 'demo_notes';
  static const String demoDues = 'demo_dues';
  static const String demoPaymentAllocations = 'demo_payment_allocations';
  static const String demoReminders = 'demo_reminders';

  // DDL Statements
  static const String createAccounts = '''
    CREATE TABLE IF NOT EXISTS $accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      categoryId TEXT NOT NULL,
      openingBalanceMinor INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  ''';

  static const String createDemoAccounts = '''
    CREATE TABLE IF NOT EXISTS $demoAccounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      categoryId TEXT NOT NULL,
      openingBalanceMinor INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  ''';

  static const String createCategories = '''
    CREATE TABLE IF NOT EXISTS $categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0
    );
  ''';

  static const String createDemoCategories = '''
    CREATE TABLE IF NOT EXISTS $demoCategories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0
    );
  ''';

  static const String createTransactions = '''
    CREATE TABLE IF NOT EXISTS $transactions (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      entryType TEXT NOT NULL,
      amountMinor INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      attachmentIds TEXT,
      transferId TEXT,
      transferRole TEXT,
      counterpartyAccountId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (accountId) REFERENCES $accounts (id)
    );
  ''';

  static const String createDemoTransactions = '''
    CREATE TABLE IF NOT EXISTS $demoTransactions (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      entryType TEXT NOT NULL,
      amountMinor INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      attachmentIds TEXT,
      transferId TEXT,
      transferRole TEXT,
      counterpartyAccountId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (accountId) REFERENCES $demoAccounts (id)
    );
  ''';

  static const String createAttachments = '''
    CREATE TABLE IF NOT EXISTS $attachments (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL,
      base64Data TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  ''';

  static const String createNotes = '''
    CREATE TABLE IF NOT EXISTS $notes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  ''';

  static const String createDemoNotes = '''
    CREATE TABLE IF NOT EXISTS $demoNotes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  ''';

  static const String createDues = '''
    CREATE TABLE IF NOT EXISTS $dues (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      entryType TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      originalAmountMinor INTEGER NOT NULL,
      settledAmountMinor INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (accountId) REFERENCES $accounts (id)
    );
  ''';

  static const String createDemoDues = '''
    CREATE TABLE IF NOT EXISTS $demoDues (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      entryType TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      originalAmountMinor INTEGER NOT NULL,
      settledAmountMinor INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (accountId) REFERENCES $demoAccounts (id)
    );
  ''';

  static const String createPaymentAllocations = '''
    CREATE TABLE IF NOT EXISTS $paymentAllocations (
      id TEXT PRIMARY KEY,
      dueItemId TEXT NOT NULL,
      paymentTransactionId TEXT NOT NULL,
      amountMinor INTEGER NOT NULL,
      FOREIGN KEY (dueItemId) REFERENCES $dues (id),
      FOREIGN KEY (paymentTransactionId) REFERENCES $transactions (id)
    );
  ''';

  static const String createDemoPaymentAllocations = '''
    CREATE TABLE IF NOT EXISTS $demoPaymentAllocations (
      id TEXT PRIMARY KEY,
      dueItemId TEXT NOT NULL,
      paymentTransactionId TEXT NOT NULL,
      amountMinor INTEGER NOT NULL,
      FOREIGN KEY (dueItemId) REFERENCES $demoDues (id),
      FOREIGN KEY (paymentTransactionId) REFERENCES $demoTransactions (id)
    );
  ''';

  static const String createReminders = '''
    CREATE TABLE IF NOT EXISTS $reminders (
      id TEXT PRIMARY KEY,
      dueItemId TEXT NOT NULL,
      remindAt TEXT NOT NULL,
      templateText TEXT NOT NULL,
      isCompleted INTEGER NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'manual',
      FOREIGN KEY (dueItemId) REFERENCES $dues (id)
    );
  ''';

  static const String createDemoReminders = '''
    CREATE TABLE IF NOT EXISTS $demoReminders (
      id TEXT PRIMARY KEY,
      dueItemId TEXT NOT NULL,
      remindAt TEXT NOT NULL,
      templateText TEXT NOT NULL,
      isCompleted INTEGER NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'manual',
      FOREIGN KEY (dueItemId) REFERENCES $demoDues (id)
    );
  ''';

  static const String createSettings = '''
    CREATE TABLE IF NOT EXISTS $settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  ''';
}
