import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
export type ConnectionQuality = 'good' | 'poor' | 'unstable';

@Component({
  selector: 'app-connection-status',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    @if (connectionStatus() !== 'connected') {
      <div class="info" style="margin-bottom: 16px;">
        @if (connectionStatus() === 'connecting') {
          <span>🔄 {{ 'room.connecting' | translate }}</span>
        }
        @if (connectionStatus() === 'reconnecting') {
          <span>🔄 {{ 'room.reconnecting' | translate: {attempt: reconnectAttempts(), max: maxReconnectAttempts()} }}</span>
        }
        @if (connectionStatus() === 'disconnected') {
          <span>⚠️ {{ 'room.disconnected' | translate }}</span>
        }
      </div>
    }
    
    @if (connectionQuality() === 'poor' && connectionStatus() === 'connected') {
      <div class="info" style="margin-bottom: 16px; background: #ff9800;">
        ⚠️ {{ 'room.poorConnection' | translate }}
      </div>
    }
  `
})
export class ConnectionStatusComponent {
  connectionStatus = input.required<ConnectionStatus>();
  connectionQuality = input.required<ConnectionQuality>();
  reconnectAttempts = input.required<number>();
  maxReconnectAttempts = input.required<number>();
}
