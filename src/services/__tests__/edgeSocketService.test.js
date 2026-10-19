/**
 * Tests for edgeSocketService.js — shared socket + dead-connection detection.
 * Run: npx vitest run src/services/__tests__/edgeSocketService.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let edgeUrl = 'http://192.168.5.41:3101';
vi.mock('../edgeHealth', () => ({
  getEdgeUrl: () => edgeUrl,
  isEdgeAvailableFast: async () => true,
}));

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    if (this.autoPong && msg.type === 'ping') this.receive({ type: 'pong' });
  }
  close() { this.readyState = 3; this.closed = true; }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

async function load() {
  vi.resetModules();
  return import('../edgeSocketService.js');
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket;
  edgeUrl = 'http://192.168.5.41:3101';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('edgeSocketService', () => {
  it('keeps the socket open until the last holder disconnects', async () => {
    const svc = await load();
    svc.connectEdgeSocket(); // restaurant tables
    svc.connectEdgeSocket(); // bar tables
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    ws.open();

    svc.disconnectEdgeSocket(); // bar view unmounts
    expect(ws.closed).toBeUndefined();
    expect(svc.isEdgeSocketConnected()).toBe(true);

    svc.disconnectEdgeSocket();
    expect(ws.closed).toBe(true);
  });

  it('reconnects when pings go unanswered (phone left WiFi, socket half-open)', async () => {
    const svc = await load();
    svc.connectEdgeSocket();
    FakeWebSocket.instances[0].open();

    await vi.advanceTimersByTimeAsync(20_000); // ping sent
    expect(FakeWebSocket.instances[0].sent.some(m => m.type === 'ping')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000); // no pong
    expect(FakeWebSocket.instances[0].closed).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000); // reconnect attempt
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('stays connected while pongs arrive', async () => {
    const svc = await load();
    svc.connectEdgeSocket();
    const ws = FakeWebSocket.instances[0];
    ws.autoPong = true; // server answers every ping
    ws.open();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ws.sent.filter(m => m.type === 'ping').length).toBeGreaterThanOrEqual(5);
    expect(ws.closed).toBeUndefined();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('moves to the new PC when the edge URL changes and signals a catch-up refresh', async () => {
    const svc = await load();
    const onReconnect = vi.fn();
    window.addEventListener('edge:reconnect', onReconnect);
    svc.connectEdgeSocket();
    FakeWebSocket.instances[0].open();

    edgeUrl = 'http://192.168.5.40:3101'; // captain switched outlets
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeWebSocket.instances[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeWebSocket.instances[1].url).toBe('ws://192.168.5.40:3101/ws');
    FakeWebSocket.instances[1].open();
    expect(onReconnect).toHaveBeenCalledTimes(1);
    window.removeEventListener('edge:reconnect', onReconnect);
  });
});
