import { registerPlugin } from '@capacitor/core';
import { createAndroidSqliteAdapter } from './database/sqlite';
import { createAndroidPrinterAdapter } from './printing/printer';
import { createAndroidLanServerAdapter } from './lanServer';
import { AndroidLocalPosRuntime } from './runtime';
import { getAndroidLocalPosConfig } from './config';
import { createLocalApiHandler } from './localApi';
import { createLocalAuth } from './localAuth';
import { createLocalOrderService } from './pos/localOrderService';
import { createAndroidSyncAdapter } from './syncService';

export function createAndroidLocalPosRuntime() {
  const EscposPrint = registerPlugin('EscposPrint');
  const { hubPort } = getAndroidLocalPosConfig();
  const database = createAndroidSqliteAdapter();
  const auth = createLocalAuth(database);
  const printer = createAndroidPrinterAdapter(EscposPrint);
  const sync = createAndroidSyncAdapter(database);
  const orderService = createLocalOrderService({ database, printer });
  let runtime;
  const handleRequest = createLocalApiHandler({
    database,
    getStatus: () => runtime?.getStatus() || { state: 'starting' },
    authorize: (token) => auth.authorize(token),
    onPair: (payload) => auth.pair(payload),
    onOrder: (payload) => orderService.createOrder(payload),
    onOrderUpdate: (orderId, payload) => orderService.updateOrderItems(orderId, payload),
    onPrintBill: (orderId, payload) => orderService.printBill(orderId, payload),
    onReprintBill: (orderId, payload) => orderService.reprintBill(orderId, payload),
    onSettle: (orderId, payload) => orderService.settleOrder(orderId, payload),
    onCancel: (orderId, requestId) => orderService.cancelOrder(orderId, requestId),
    onCancelItem: (orderId, itemId, payload) => orderService.cancelOrderItem(orderId, itemId, payload),
    getSyncStatus: () => sync.health(),
    getDeadLetters: () => sync.getDeadLetters(),
    retryDeadLetter: (id) => sync.retryDeadLetter(id),
  });

  runtime = new AndroidLocalPosRuntime({
    database,
    printer,
    auth,
    orderService,
    sync,
    lan: createAndroidLanServerAdapter({ port: hubPort, onRequest: handleRequest }),
  });
  return runtime;
}
