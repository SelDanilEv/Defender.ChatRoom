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
  private reconnectTimeout?: number;
  private heartbeatInterval?: number;
  private connectionCheckInterval?: number;
  private lastHeartbeatTime = 0;
  private messageQueue: WebSocketMessage[] = [];
  private activityEvents = ['mousemove', 'keydown', 'click', 'touchstart'];
  private activityHandler = () => this.sendHeartbeat();

  private readonly connectionStatus = signal<ConnectionStatus>('disconnected');
  private readonly connectionQuality = signal<ConnectionQuality>('good');
  private readonly reconnectAttempts = signal(0);
  private readonly maxReconnectAttempts = 10;

  private readonly messageSubject = new Subject<WebSocketMessage>();

  readonly status = this.connectionStatus.asReadonly();
  readonly quality = this.connectionQuality.asReadonly();
  readonly reconnectAttemptsCount = this.reconnectAttempts.asReadonly();
  readonly isConnected = computed(() => this.connectionStatus() === 'connected');
  readonly messages$ = this.messageSubject.asObservable();

  constructor() {}

  connect(clientId: string): void {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      return;
    }

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
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connectionStatus.set('connected');
      this.reconnectAttempts.set(0);
      this.lastHeartbeatTime = Date.now();
      this.startConnectionMonitoring();
      this.flushMessageQueue();
    };

    this.ws.onmessage = (event) => {
      this.lastHeartbeatTime = Date.now();

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
      this.connectionQuality.set('poor');
    };

    this.ws.onclose = (event) => {
      if (event.code === 1000 || event.code === 1001) {
        return;
      }

      this.connectionStatus.set('disconnected');
      this.attemptReconnect(clientId);
    };
  }

  sendMessage(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
      }
    } else {
      this.messageQueue.push(message);
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
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = undefined;
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
  }

  private attemptReconnect(clientId: string): void {
    if (this.reconnectAttempts() >= this.maxReconnectAttempts) {
      this.connectionStatus.set('disconnected');
      return;
    }

    this.reconnectAttempts.update(attempts => attempts + 1);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts() - 1), 30000);

    this.reconnectTimeout = window.setTimeout(() => {
      this.connect(clientId);
    }, delay);
  }

  private startConnectionMonitoring(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = window.setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatTime;

      if (timeSinceLastHeartbeat > 90000) {
        this.connectionQuality.set('unstable');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        }
      } else if (timeSinceLastHeartbeat > 60000) {
        this.connectionQuality.set('poor');
      } else {
        this.connectionQuality.set('good');
      }
    }, 10000);
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
