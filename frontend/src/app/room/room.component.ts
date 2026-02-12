import {
  Component,
  OnInit,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { LanguageSelectorComponent } from '../components/language-selector/language-selector.component';
import { ParticipantComponent } from '../components/participant/participant.component';
import { ConnectionStatusComponent } from '../components/connection-status/connection-status.component';
import { RoomControlsComponent } from '../components/room-controls/room-controls.component';

import { ClientIdService } from '../services/client-id.service';
import { WebSocketService } from '../services/websocket.service';
import { AudioService } from '../services/audio.service';
import { PeerConnectionService } from '../services/peer-connection.service';
import { RoomStateService } from '../services/room-state.service';
import { HealthMonitorService } from '../services/health-monitor.service';
import { SignalingHandlerService } from '../services/signaling-handler.service';
import { PeerOrchestratorService } from '../services/peer-orchestrator.service';
import type { SignalingMessage } from '../models/signaling';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    LanguageSelectorComponent,
    ParticipantComponent,
    ConnectionStatusComponent,
    RoomControlsComponent,
  ],
  templateUrl: './room.component.html',
})
export class RoomComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly clientIdService = inject(ClientIdService);
  private readonly peerOrchestrator = inject(PeerOrchestratorService);
  private readonly signalingHandler = inject(SignalingHandlerService);

  protected readonly ws = inject(WebSocketService);
  protected readonly audio = inject(AudioService);
  protected readonly healthMonitor = inject(HealthMonitorService);
  protected readonly peerConnection = inject(PeerConnectionService);
  protected readonly roomState = inject(RoomStateService);

  private clientId = '';
  private joinHandled = false;
  private joinSent = false;
  private isProcessingJoin = false;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  protected readonly participantLeftToast = signal<string | null>(null);
  protected readonly participants = this.peerConnection.participants$;
  protected readonly displayName = computed(() => this.roomState.getDisplayName());
  protected readonly errorMessage = computed(() => {
    const key = this.audio.errorMessage$() || this.roomState.getErrorMessage();
    return key ? this.translate.instant(key) : '';
  });
  protected readonly participantCount = computed(() => this.participants().length + 1);

  private readonly messageSubscription = toSignal(
    this.ws.messages$.pipe(filter((m): m is SignalingMessage => !!m)),
    { initialValue: null }
  );

  private readonly messageEffect = effect(() => {
    const msg = this.messageSubscription();
    if (msg) void this.onSignalingMessage(msg);
  });

  private readonly connectionEffect = effect(() => {
    if (!this.ws.isConnected()) {
      this.joinHandled = false;
      this.joinSent = false;
      this.isProcessingJoin = false;
    }
  });

  private readonly microphoneEffect = effect(() => {
    const granted = this.audio.microphoneGranted$();
    if (!granted || this.isProcessingJoin) return;

    const stream = this.audio.getLocalStream();
    if (!stream || !this.ws.isConnected()) return;

    if (this.joinSent) {
      this.peerOrchestrator.processPendingPeers();
      this.healthMonitor.startMonitoring();
      return;
    }

    this.isProcessingJoin = true;
    const passphrase = this.roomState.getPassphrase();
    const awaitingChallenge = this.roomState.getAwaitingChallenge();

    if (passphrase && awaitingChallenge) {
      this.signalingHandler
        .sendJoinResponse(
          this.displayName(),
          this.audio.isMuted$(),
          passphrase,
          this.roomState.getPendingChallenge()!
        )
        .then(() => {})
        .catch(() => {
          this.isProcessingJoin = false;
        });
    } else {
      this.signalingHandler.sendJoin(
        this.displayName(),
        this.audio.isMuted$()
      );
    }

    this.joinSent = true;
    this.ws.startHeartbeat();
    this.ws.setupActivityTracking();
    this.healthMonitor.startMonitoring();
  });

  constructor() {
    this.clientId = this.clientIdService.getClientId();
  }

  ngOnInit(): void {
    const state = history.state as { displayName?: string; passphrase?: string };
    this.roomState.initialize(state?.displayName ?? '', state?.passphrase ?? '');

    this.peerConnection.cleanup();
    this.peerOrchestrator.reset();
    this.ws.connect(this.clientId);

    void this.autoRequestMicIfGranted();
    document.addEventListener('click', this.userGestureHandler, { passive: true });
    this.setupLocalTrackMonitoring();
  }

  ngOnDestroy(): void {
    this.cleanup();
    document.removeEventListener('click', this.userGestureHandler);
  }

  protected requestMicrophoneAccess(): void {
    void this.audio.requestMicrophoneAccess();
  }

  protected onToggleMute(): void {
    this.audio.toggleMute();
    if (this.ws.isConnected() && this.roomState.getSelfId()) {
      this.ws.sendMessage({ type: 'mute', muted: this.audio.isMuted$() });
    }
  }

  protected onVolumeChange(volume: number): void {
    this.audio.setVolume(volume);
    this.peerConnection.updateVolume(volume);
  }

  protected onMicLevelChange(level: number): void {
    this.audio.setMicLevel(level);
  }

  protected async leaveRoom(): Promise<void> {
    this.roomState.setIsLeaving(true);
    const track = this.audio.getLocalAudioTrack();
    if (track?.readyState !== 'ended') {
      try {
        track?.stop();
      } catch {
      }
    }
    await this.sendLeaveAndWait();
    this.cleanup();
    this.router.navigate(['/']);
  }

  private async onSignalingMessage(message: SignalingMessage): Promise<void> {
    const deps = {
      onCreatePeer: (id: string, name: string, muted: boolean, shouldOffer: boolean) =>
        this.peerOrchestrator.createPeer(id, name, muted, shouldOffer),
      onCleanup: () => this.cleanup(),
    };

    if (message.type === 'joined' && this.joinHandled && this.roomState.getSelfId() === message['selfId']) {
      return;
    }
    if (message.type === 'joined') {
      this.joinHandled = true;
      this.joinSent = true;
      this.isProcessingJoin = false;
    }

    const outcome = await this.signalingHandler.handleMessage(message, deps);

    if (message.type === 'joined') {
      this.peerOrchestrator.processPendingPeers();
    }

    switch (outcome.action) {
      case 'navigate':
        setTimeout(
          () => this.router.navigate([outcome.path], { state: outcome.state as Record<string, unknown> }),
          outcome.delayMs ?? 1000
        );
        break;
      case 'toast':
        this.participantLeftToast.set(outcome.message);
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
          this.participantLeftToast.set(null);
          this.toastTimeout = null;
        }, outcome.duration);
        break;
      default:
        break;
    }
  }

  private readonly userGestureHandler = (): void => {
    void this.audio.resumeAudioContext();
    void this.peerConnection.resumeRemoteAudio();
  };

  private setupLocalTrackMonitoring(): void {
    const track = this.audio.getLocalAudioTrack();
    if (!track) return;
    track.onended = () => {
      this.audio.cleanup();
      this.roomState.setErrorMessage('room.micTrackEnded');
    };
  }

  private async sendLeaveAndWait(): Promise<void> {
    if (this.ws.isConnected() && this.roomState.getSelfId()) {
      try {
        this.ws.sendMessage({ type: 'leave' });
        await new Promise(r => setTimeout(r, 100));
      } catch {
      }
    }
  }

  private cleanup(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.participantLeftToast.set(null);
    this.healthMonitor.stopMonitoring();
    this.isProcessingJoin = false;
    this.joinHandled = false;
    this.joinSent = false;
    this.peerOrchestrator.reset();
    this.ws.disconnect();
    this.peerConnection.cleanup();
    this.audio.cleanup();
  }

  private async autoRequestMicIfGranted(): Promise<void> {
    if (!('permissions' in navigator)) return;
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') {
        await this.audio.requestMicrophoneAccess();
      }
    } catch {
    }
  }
}
