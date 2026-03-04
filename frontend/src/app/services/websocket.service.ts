import { Injectable, signal, computed } from '@angular/core';
import { Subject } from 'rxjs';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
export type ConnectionQuality = 'good' | 'poor' | 'unstable';

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private ws?: WebSocket;
  private heartbeatInterval?: number;
  private messageQueue: WebSocketMessage[] = [];
  private readonly maxQueueSize = 100;
  private isConnecting = false;
  private activityEvents = ['mousemove', 'keydown', 'click', 'touchstart'];
  private activityHandler = () => this.sendHeartbeat();

  private readonly connectionStatus = signal<ConnectionStatus>('disconnected');
  private readonly connectionQuality = signal<ConnectionQuality>('good');
  private readonly reconnectAttempts = signal(0);
  private readonly maxReconnectAttempts = 0;

  private readonly messageSubject = new Subject<WebSocketMessage>();

  readonly status = this.connectionStatus.asReadonly();
  readonly quality = this.connectionQuality.asReadonly();
  readonly reconnectAttemptsCount = this.reconnectAttempts.asReadonly();
  readonly isConnected = computed(() => this.connectionStatus() === 'connected');
  readonly messages$ = this.messageSubject.asObservable();

  constructor() {}

  connect(clientId: string): void {
    if (this.isConnecting) {
      return;
    }

    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      return;
    }

    this.isConnecting = true;
    let wsUrl: string;
    const clientIdParam = encodeURIComponent(clientId);
    if (window.location.port === '4200') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//localhost:8080/ws?clientId=${clientIdParam}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?clientId=${clientIdParam}`;
    }

    this.connectionStatus.set(this.reconnectAttempts() > 0 ? 'reconnecting' : 'connecting');
    
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      this.isConnecting = false;
      this.connectionStatus.set('disconnected');
      return;
    }

    this.ws.onopen = () => {
      this.isConnecting = false;
      this.connectionStatus.set('connected');
      this.connectionQuality.set('good');
      this.reconnectAttempts.set(0);
      this.flushMessageQueue();
    };

    this.ws.onmessage = (event) => {
      if (event.data === 'ping') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('pong');
        }
        return;
      }

      try {
        const message = JSON.parse(event.data);
        this.messageSubject.next(message);
      } catch (error) {
      }
    };

    this.ws.onerror = () => {
      this.isConnecting = false;
      this.connectionQuality.set('poor');
    };

    this.ws.onclose = () => {
      this.isConnecting = false;
      this.connectionStatus.set('disconnected');
    };
  }

  sendMessage(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        if (this.messageQueue.length < this.maxQueueSize) {
          this.messageQueue.push(message);
        }
      }
    } else {
      if (this.messageQueue.length < this.maxQueueSize) {
        this.messageQueue.push(message);
      }
    }
  }

  getStatus(): ConnectionStatus {
    return this.connectionStatus();
  }

  getQuality(): ConnectionQuality {
    return this.connectionQuality();
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts();
  }

  getMaxReconnectAttempts(): number {
    return this.maxReconnectAttempts;
  }

  startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  setupActivityTracking(): void {
    this.activityEvents.forEach(event => {
      document.addEventListener(event, this.activityHandler, { passive: true });
    });
  }

  disconnect(): void {
    this.isConnecting = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    this.activityEvents.forEach(event => {
      document.removeEventListener(event, this.activityHandler);
    });

    if (this.ws) {
      const wsState = this.ws.readyState;
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;

        if (wsState === WebSocket.OPEN || wsState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'User left room');
        }
      } catch (error) {
      } finally {
        this.ws = undefined;
      }
    }

    this.messageQueue = [];
    this.connectionStatus.set('disconnected');
    this.connectionQuality.set('good');
    this.reconnectAttempts.set(0);
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  private sendHeartbeat(): void {
    this.sendMessage({ type: 'heartbeat' });
  }
}
