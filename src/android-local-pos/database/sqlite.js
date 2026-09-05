import { registerPlugin } from '@capacitor/core';
import initialSchemaSql from './migrations/001_initial.sql?raw';
import financialFieldsMigrationSql from './migrations/002_order_financial_fields.sql?raw';
import syncRecoveryMigrationSql from './migrations/003_sync_recovery.sql?raw';

const LocalPosDatabase = registerPlugin('LocalPosDatabase');
const DATABASE_NAME = 'softshape-local-pos';
const DATABASE_VERSION = 3;

function requireNativeMethod(method) {
  if (typeof LocalPosDatabase[method] !== 'function') {
    throw new Error(`LocalPosDatabase plugin does not implement ${method}()`);
  }
}

export function createAndroidSqliteAdapter({ databaseName = DATABASE_NAME } = {}) {
  let opened = false;

  return {
    async open() {
      requireNativeMethod('open');
      await LocalPosDatabase.open({ name: databaseName, version: DATABASE_VERSION });
      requireNativeMethod('execScript');
      await LocalPosDatabase.execScript({ sql: initialSchemaSql });
      await LocalPosDatabase.execScript({ sql: financialFieldsMigrationSql });
      await LocalPosDatabase.execScript({ sql: syncRecoveryMigrationSql });
      opened = true;
    },

    async close() {
      if (!opened) return;
      requireNativeMethod('close');
      await LocalPosDatabase.close({ name: databaseName });
      opened = false;
    },

    async execute(sql, values = []) {
      if (!opened) throw new Error('Android local database is not open');
      requireNativeMethod('execute');
      return LocalPosDatabase.execute({ sql, values });
    },

    async query(sql, values = []) {
      if (!opened) throw new Error('Android local database is not open');
      requireNativeMethod('query');
      const result = await LocalPosDatabase.query({ sql, values });
      return result?.rows || [];
    },

    async transaction(statements) {
      if (!opened) throw new Error('Android local database is not open');
      if (!Array.isArray(statements) || statements.length === 0) {
        throw new TypeError('Database transaction requires at least one statement');
      }
      requireNativeMethod('transaction');
      return LocalPosDatabase.transaction({ statements });
    },

    health() {
      return { opened, name: databaseName, version: DATABASE_VERSION };
    },
  };
}

export { DATABASE_NAME, DATABASE_VERSION };
