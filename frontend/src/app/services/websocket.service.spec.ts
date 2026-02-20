import { TestBed } from '@angular/core/testing';

import { WebSocketService } from './websocket.service';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];
  closeArgs: Array<number | string | undefined> = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(payload: string): void {
    this.sentMessages.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.closeArgs = [code, reason];
    this.onclose?.({ code: code ?? 1000 } as CloseEvent);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('WebSocketService', () => {
  let service: WebSocketService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = window.WebSocket;
    (window as unknown as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
    MockWebSocket.instances = [];

    TestBed.configureTestingModule({});
    service = TestBed.inject(WebSocketService);
  });

  afterEach(() => {
    service.disconnect();
    (window as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  });

  it('updates status to connected after socket opens', () => {
    service.connect('client-1');
    expect(service.getStatus()).toBe('connecting');

    const socket = MockWebSocket.instances[0];
    socket.open();

    expect(service.getStatus()).toBe('connected');
    expect(service.isConnected()).toBeTrue();
  });

  it('responds with pong when ping is received', () => {
    service.connect('client-1');
    const socket = MockWebSocket.instances[0];
    socket.open();

    socket.receive('ping');

    expect(socket.sentMessages).toContain('pong');
  });

  it('queues messages before connect and flushes after open', () => {
    service.sendMessage({ type: 'join', name: 'Alice' });
    expect((service as any).messageQueue.length).toBe(1);

    service.connect('client-1');
    const socket = MockWebSocket.instances[0];
    socket.open();

    expect(socket.sentMessages).toContain(JSON.stringify({ type: 'join', name: 'Alice' }));
    expect((service as any).messageQueue.length).toBe(0);
  });
});
