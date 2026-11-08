import mysql from 'mysql2/promise';

export function createDatabasePool(env = process.env) {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  for (const key of required) {
    if (!env[key]) throw new Error('Missing required database setting: ' + key);
  }
  return mysql.createPool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 20,
    timezone: 'Z',
    multipleStatements: false,
    decimalNumbers: false,
    enableKeepAlive: true,
  });
}
