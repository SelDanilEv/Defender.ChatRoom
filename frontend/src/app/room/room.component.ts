import { Component, OnInit, OnDestroy, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageSelectorComponent } from '../components/language-selector/language-selector.component';
import { ParticipantComponent } from '../components/participant/participant.component';
import { ConnectionStatusComponent } from '../components/connection-status/connection-status.component';
import { RoomControlsComponent } from '../components/room-controls/room-controls.component';
import { ClientIdService } from '../services/client-id.service';
import { WebSocketService, WebSocketMessage } from '../services/websocket.service';
import { AudioService } from '../services/audio.service';
import { PeerConnectionService, Participant } from '../services/peer-connection.service';
import { RoomStateService } from '../services/room-state.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    LanguageSelectorComponent,
    ParticipantComponent,
    ConnectionStatusComponent,
    RoomControlsComponent
  ],
  template: `
    <app-language-selector></app-language-selector>
    <div class="container">
      <div class="card">
        <h1>{{ 'room.title' | translate }}</h1>
        
        @if (errorMessage()) {
          <div class="error">{{ errorMessage() | translate }}</div>
        }
        
        <app-connection-status
          [connectionStatus]="webSocketService.status()"
          [connectionQuality]="webSocketService.quality()"
          [reconnectAttempts]="webSocketService.reconnectAttemptsCount()"
          [maxReconnectAttempts]="webSocketService.getMaxReconnectAttempts()"
        ></app-connection-status>
        
        @if (!audioService.microphoneGranted$()) {
          <div class="info" style="margin-bottom: 24px;">
            <p style="margin-bottom: 16px;">{{ 'room.micRequired' | translate }}</p>
            <button (click)="requestMicrophoneAccess()" [disabled]="audioService.requestingAccess$()">
              {{ (audioService.requestingAccess$() ? 'room.requestingMicAccess' : 'room.requestMicAccess') | translate }}
            </button>
          </div>
        }
        
        @if (audioService.microphoneGranted$()) {
          <h2>{{ 'room.participants' | translate }} ({{ participantCount() }})</h2>
          
          <div class="participants-grid">
            <app-participant
              [name]="displayName()"
              [muted]="audioService.isMuted$()"
              [isSelf]="true"
            ></app-participant>
            
            @for (p of participants(); track p.id) {
              <app-participant
                [name]="p.name"
                [muted]="p.muted"
                [isSelf]="false"
              ></app-participant>
            }
            
            @if (participants().length === 0) {
              <div class="participants-empty">
                {{ 'room.noParticipants' | translate }}
              </div>
            }
          </div>
          
          <app-room-controls
            [isMuted]="audioService.isMuted$()"
            [volume]="audioService.volume$()"
            [micLevel]="audioService.micLevel$()"
            (toggleMute)="onToggleMute()"
            (volumeChange)="onVolumeChange($event)"
            (micLevelChange)="onMicLevelChange($event)"
            (leaveRoom)="leaveRoom()"
          ></app-room-controls>
        }
      </div>
    </div>
  `
})
export class RoomComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private translateService = inject(TranslateService);
  private clientIdService = inject(ClientIdService);
  protected webSocketService = inject(WebSocketService);
  protected audioService = inject(AudioService);
  private peerConnectionService = inject(PeerConnectionService);
  private roomStateService = inject(RoomStateService);

  private clientId: string = '';
  private joinHandled = false;
  private joinSent = false;
  private isProcessingJoin = false;
  private pendingPeers = new Map<string, { id: string; name: string; muted: boolean; shouldOffer: boolean }>();
  private processingPeers = new Set<string>();
  private userGestureHandler = () => {
    void this.audioService.resumeAudioContext();
    void this.peerConnectionService.resumeRemoteAudio();
  };
  private messageSubscription = toSignal(
    this.webSocketService.messages$.pipe(
      filter((msg: WebSocketMessage) => !!msg)
    ),
    { initialValue: null }
  );

  protected participants = this.peerConnectionService.participants$;
  protected displayName = computed(() => this.roomStateService.getDisplayName());
  protected errorMessage = computed(() => {
    const audioError = this.audioService.errorMessage$();
    const roomError = this.roomStateService.getErrorMessage();
    const errorKey = audioError || roomError;
    return errorKey ? this.translateService.instant(errorKey) : '';
  });
  protected participantCount = computed(() => this.participants().length + 1);

  private messageEffect = effect(() => {
    const message = this.messageSubscription();
    if (message) {
      void this.handleSignalingMessage(message);
    }
  });

  private connectionEffect = effect(() => {
    if (!this.webSocketService.isConnected()) {
      this.joinHandled = false;
      this.joinSent = false;
      this.isProcessingJoin = false;
    }
  });

  private microphoneEffect = effect(() => {
    const granted = this.audioService.microphoneGranted$();
    if (granted && !this.isProcessingJoin) {
      const localStream = this.audioService.getLocalStream();
      if (localStream && this.webSocketService.isConnected()) {
        if (this.joinSent) {
          this.processPendingPeers();
          return;
        }
        this.isProcessingJoin = true;
        const passphrase = this.roomStateService.getPassphrase();
        if (passphrase && this.roomStateService.getAwaitingChallenge()) {
          this.sendJoinResponse().catch(() => {
            this.isProcessingJoin = false;
          });
        } else {
          this.sendJoinMessage();
        }
        this.webSocketService.startHeartbeat();
        this.webSocketService.setupActivityTracking();
      }
    }
  });

  constructor() {
    this.clientId = this.clientIdService.getClientId();
  }

  ngOnInit() {
    const state = history.state;
    this.roomStateService.initialize(
      state?.displayName,
      state?.passphrase || ''
    );

    this.peerConnectionService.cleanup();
    this.webSocketService.connect(this.clientId);
    void this.autoRequestMicrophoneAccessIfGranted();
    document.addEventListener('click', this.userGestureHandler, { passive: true });
    this.startLocalTrackMonitoring();
  }

  private startLocalTrackMonitoring(): void {
  }

  ngOnDestroy() {
    this.cleanup();
    document.removeEventListener('click', this.userGestureHandler);
  }

  async requestMicrophoneAccess() {
    await this.audioService.requestMicrophoneAccess();
  }

  onToggleMute() {
    this.audioService.toggleMute();

    if (this.webSocketService.isConnected() && this.roomStateService.getSelfId()) {
      this.webSocketService.sendMessage({
        type: 'mute',
        muted: this.audioService.isMuted$()
      });
    }
  }

  onVolumeChange(volume: number) {
    this.audioService.setVolume(volume);
    this.peerConnectionService.updateVolume(volume);
  }

  onMicLevelChange(level: number) {
    this.audioService.setMicLevel(level);
  }

  async leaveRoom() {
    this.roomStateService.setIsLeaving(true);

    const localAudioTrack = this.audioService.getLocalAudioTrack();
    if (localAudioTrack) {
      try {
        if (localAudioTrack.readyState !== 'ended') {
          localAudioTrack.stop();
        }
      } catch (error) {
      }
    }

    await this.sendLeaveMessageAndWait();
    this.cleanup();
    this.router.navigate(['/']);
  }

  private async handleSignalingMessage(message: any) {
    switch (message.type) {
      case 'joined':
        if (this.joinHandled && this.roomStateService.getSelfId() === message.selfId) {
          break;
        }
        this.joinHandled = true;
        this.joinSent = true;
        this.isProcessingJoin = false;
        this.roomStateService.setSelfId(message.selfId);
        if (this.audioService.microphoneGranted$()) {
          this.webSocketService.startHeartbeat();
          this.webSocketService.setupActivityTracking();
        }
        for (const p of message.participants || []) {
          if (p.id !== message.selfId) {
            const exists = this.peerConnectionService
              .getParticipants()
              .some((participant: Participant) => participant.id === p.id);
            if (!exists && !this.processingPeers.has(p.id)) {
              this.createPeerConnection(p.id, p.name, p.muted || false, true);
            }
          }
        }
        this.processPendingPeers();
        break;

      case 'join-error':
        const errorMsg = message.message || this.translateService.instant('room.failedToJoin');
        this.roomStateService.setErrorMessage(errorMsg);
        this.cleanup();
        setTimeout(() => {
          this.router.navigate(['/'], { state: { message: errorMsg } });
        }, 2000);
        break;

      case 'participant-joined':
        if (message.id !== this.roomStateService.getSelfId()) {
          const exists = this.peerConnectionService
            .getParticipants()
            .some((participant: Participant) => participant.id === message.id);
          if (!exists && !this.processingPeers.has(message.id)) {
            this.createPeerConnection(message.id, message.name, message.muted || false, false);
          }
        }
        break;

      case 'participant-left':
        this.peerConnectionService.removeParticipant(message.id);
        break;

      case 'participant-mute':
        this.peerConnectionService.updateParticipantMute(message.id, message.muted);
        break;

      case 'offer':
        if (message.fromId && message.fromId !== this.roomStateService.getSelfId()) {
          const existing = this.peerConnectionService
            .getParticipants()
            .some((p: Participant) => p.id === message.fromId);

          if (!existing && !this.processingPeers.has(message.fromId)) {
            await this.createPeerConnection(
              message.fromId,
              message.name || 'Guest',
              message.muted || false,
              false
            );
            
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          const participant = this.peerConnectionService
            .getParticipants()
            .find((p: Participant) => p.id === message.fromId);
          
          if (!participant || !participant.peerConnection) {
            break;
          }

          const pc = participant.peerConnection;
          if (pc.signalingState === 'closed' || pc.connectionState === 'closed') {
            break;
          }

          await this.peerConnectionService.handleOffer(
            message.fromId,
            message.sdp,
            (msg: { type: string; [key: string]: unknown }) => this.webSocketService.sendMessage(msg)
          );
        }
        break;

      case 'answer':
        if (message.fromId && message.fromId !== this.roomStateService.getSelfId()) {
          const participant = this.peerConnectionService
            .getParticipants()
            .find((p: Participant) => p.id === message.fromId);
          
          if (participant && participant.peerConnection) {
            const pc = participant.peerConnection;
            if (pc.signalingState !== 'closed' && pc.connectionState !== 'closed') {
              await this.peerConnectionService.handleAnswer(message.fromId, message.sdp);
            }
          }
        }
        break;

      case 'ice':
        if (message.fromId && message.fromId !== this.roomStateService.getSelfId()) {
          const participant = this.peerConnectionService
            .getParticipants()
            .find((p: Participant) => p.id === message.fromId);
          
          if (participant && participant.peerConnection) {
            const pc = participant.peerConnection;
            if (pc.signalingState !== 'closed' && pc.connectionState !== 'closed') {
              await this.peerConnectionService.handleIce(message.fromId, message.candidate);
            }
          }
        }
        break;

      case 'kicked':
        let kickMessage = this.translateService.instant('room.disconnectedInactivity');
        if (message.reason === 'room_reset') {
          kickMessage = this.translateService.instant('room.disconnectedReset');
        }
        this.roomStateService.setErrorMessage(kickMessage);
        this.cleanup();
        setTimeout(() => {
          this.router.navigate(['/'], { state: { message: kickMessage } });
        }, 1000);
        break;

      case 'challenge':
        this.roomStateService.setPendingChallenge(message.challenge);
        this.roomStateService.setAwaitingChallenge(true);
        break;
    }
  }

  private async createPeerConnection(
    remoteId: string,
    remoteName: string,
    muted: boolean,
    shouldOffer: boolean
  ) {
    if (this.processingPeers.has(remoteId)) {
      this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
      return;
    }

    const localStream = this.audioService.getLocalStream();
    if (!localStream) {
      this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
      return;
    }

    const audioTrack = this.audioService.getLocalAudioTrack();
    if (!audioTrack || audioTrack.readyState !== 'live') {
      this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
      return;
    }

    this.processingPeers.add(remoteId);
    try {
      await this.peerConnectionService.createPeerConnection(
        remoteId,
        remoteName,
        muted,
        shouldOffer,
        localStream,
        this.audioService.volume$(),
        (msg: { type: string; [key: string]: unknown }) => this.webSocketService.sendMessage(msg)
      );

      const created = this.peerConnectionService
        .getParticipants()
        .some((participant: Participant) => participant.id === remoteId);
      if (created) {
        this.pendingPeers.delete(remoteId);
      } else if (!this.pendingPeers.has(remoteId)) {
        this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
      }
    } catch (error) {
      console.error(`Error creating peer connection for ${remoteId}:`, error);
      this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
    } finally {
      this.processingPeers.delete(remoteId);
    }
  }

  private sendJoinMessage() {
    if (this.joinSent) {
      return;
    }
    this.joinSent = true;
    this.webSocketService.sendMessage({
      type: 'join',
      name: this.displayName(),
      muted: this.audioService.isMuted$()
    });
  }

  private async sendJoinResponse() {
    const passphrase = this.roomStateService.getPassphrase();
    const pendingChallenge = this.roomStateService.getPendingChallenge();
    if (!passphrase || !pendingChallenge) {
      this.isProcessingJoin = false;
      return;
    }

    if (this.joinSent) {
      this.isProcessingJoin = false;
      return;
    }

    try {
      this.joinSent = true;
      const passphraseHash = await this.roomStateService.sha256(passphrase);
      const response = await this.roomStateService.sha256(passphraseHash + pendingChallenge);

      this.webSocketService.sendMessage({
        type: 'join-response',
        name: this.displayName(),
        muted: this.audioService.isMuted$(),
        response: response
      });
    } catch (error) {
      this.isProcessingJoin = false;
      this.joinSent = false;
    }
  }

  private async sendLeaveMessageAndWait(): Promise<void> {
    if (this.webSocketService.isConnected() && this.roomStateService.getSelfId()) {
      try {
        this.webSocketService.sendMessage({ type: 'leave' });
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
      }
    }
  }

  private cleanup() {
    this.isProcessingJoin = false;
    this.joinHandled = false;
    this.joinSent = false;
    this.processingPeers.clear();
    this.pendingPeers.clear();
    this.webSocketService.disconnect();
    this.peerConnectionService.cleanup();
    this.audioService.cleanup();
  }

  private processPendingPeers(): void {
    if (this.pendingPeers.size === 0 || !this.audioService.microphoneGranted$() || !this.webSocketService.isConnected()) {
      return;
    }

    const pending = Array.from(this.pendingPeers.values());
    for (const peer of pending) {
      if (!this.processingPeers.has(peer.id)) {
        this.createPeerConnection(peer.id, peer.name, peer.muted, peer.shouldOffer);
      }
    }
  }

  private async autoRequestMicrophoneAccessIfGranted(): Promise<void> {
    if (!('permissions' in navigator)) {
      return;
    }

    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status.state === 'granted') {
        await this.audioService.requestMicrophoneAccess();
      }
    } catch (error) {
    }
  }
}
