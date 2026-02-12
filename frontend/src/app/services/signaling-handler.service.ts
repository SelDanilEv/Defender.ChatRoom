import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { WebSocketService } from './websocket.service';
import { PeerConnectionService } from './peer-connection.service';
import { RoomStateService } from './room-state.service';
import { AudioService } from './audio.service';
import { CryptoService } from './crypto.service';
import type { SignalingMessage, ParticipantInfo } from '../models/signaling';

export type SignalingOutcome =
  | { action: 'none' }
  | { action: 'navigate'; path: string; state?: unknown; delayMs?: number }
  | { action: 'toast'; message: string; duration: number }
  | { action: 'cleanup' };

export interface SignalingHandlerDeps {
  onCreatePeer: (remoteId: string, remoteName: string, muted: boolean, shouldOffer: boolean) => Promise<unknown>;
  onCleanup: () => void;
}

@Injectable({ providedIn: 'root' })
export class SignalingHandlerService {
  private readonly translate = inject(TranslateService);
  private readonly ws = inject(WebSocketService);
  private readonly peerConnection = inject(PeerConnectionService);
  private readonly roomState = inject(RoomStateService);
  private readonly audio = inject(AudioService);
  private readonly crypto = inject(CryptoService);

  async handleMessage(
    message: SignalingMessage,
    deps: SignalingHandlerDeps
  ): Promise<SignalingOutcome> {
    switch (message.type) {
      case 'joined':
        return this.handleJoined(message, deps);
      case 'join-error':
        return this.handleJoinError(message, deps);
      case 'participant-joined':
        this.handleParticipantJoined(message, deps);
        return { action: 'none' };
      case 'participant-left':
        return this.handleParticipantLeft(message);
      case 'participant-mute':
        this.handleParticipantMute(message);
        return { action: 'none' };
      case 'offer':
        await this.handleOffer(message, deps);
        return { action: 'none' };
      case 'answer':
        await this.handleAnswer(message);
        return { action: 'none' };
      case 'ice':
        await this.handleIce(message);
        return { action: 'none' };
      case 'kicked':
        return this.handleKicked(message, deps);
      case 'challenge':
        this.handleChallenge(message);
        return { action: 'none' };
      default:
        return { action: 'none' };
    }
  }

  private handleJoined(
    message: SignalingMessage,
    deps: SignalingHandlerDeps
  ): SignalingOutcome {
    const selfId = String(message['selfId'] ?? '');
    this.roomState.setSelfId(selfId);

    if (this.audio.microphoneGranted$()) {
      this.ws.startHeartbeat();
      this.ws.setupActivityTracking();
    }

    const participants = (message['participants'] ?? []) as ParticipantInfo[];
    const selfIdFinal = this.roomState.getSelfId();
    for (const p of participants) {
      if (p.id === selfId) continue;
      if (!this.hasPeer(p.id)) {
        void deps.onCreatePeer(p.id, p.name, p.muted ?? false, selfIdFinal < p.id);
      }
    }

    return { action: 'none' };
  }

  private handleJoinError(message: SignalingMessage, deps: SignalingHandlerDeps): SignalingOutcome {
    const errorMsg = String(message['message'] ?? this.translate.instant('room.failedToJoin'));
    deps.onCleanup();
    return {
      action: 'navigate',
      path: '/',
      state: { message: errorMsg },
      delayMs: 2000
    };
  }

  private handleParticipantJoined(message: SignalingMessage, deps: SignalingHandlerDeps): void {
    const id = String(message['id'] ?? '');
    if (id === this.roomState.getSelfId()) return;
    if (this.hasPeer(id)) return;

    const selfId = this.roomState.getSelfId();
    const name = String(message['name'] ?? 'Guest');
    const muted = Boolean(message['muted']);
    void deps.onCreatePeer(id, name, muted, selfId < id);
  }

  private handleParticipantLeft(message: SignalingMessage): SignalingOutcome {
    const id = String(message['id'] ?? '');
    const reason = String(message['reason'] ?? '');
    const participant = this.peerConnection.getParticipants().find(p => p.id === id);
    const name = participant?.name ?? 'Guest';
    this.peerConnection.removeParticipant(id);

    const key =
      reason === 'reconnected'
        ? 'room.participantLeftReconnected'
        : reason === 'disconnect'
          ? 'room.participantLeftDisconnected'
          : 'room.participantLeft';
    return {
      action: 'toast',
      message: this.translate.instant(key, { name }),
      duration: 4000
    };
  }

  private handleParticipantMute(message: SignalingMessage): void {
    const id = String(message['id'] ?? '');
    const muted = Boolean(message['muted']);
    this.peerConnection.updateParticipantMute(id, muted);
  }

  private async handleOffer(
    message: SignalingMessage,
    deps: SignalingHandlerDeps
  ): Promise<void> {
    const fromId = String(message['fromId'] ?? '');
    if (!fromId || fromId === this.roomState.getSelfId()) return;

    if (!this.hasPeer(fromId)) {
      await deps.onCreatePeer(
        fromId,
        String(message['name'] ?? 'Guest'),
        Boolean(message['muted']),
        false
      );
    }

    const participant = this.peerConnection.getParticipants().find(p => p.id === fromId);
    if (participant?.peerConnection && participant.peerConnection.signalingState !== 'closed') {
      await this.peerConnection.handleOffer(
        fromId,
        String(message['sdp'] ?? ''),
        msg => this.ws.sendMessage(msg)
      );
    }
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    const fromId = String(message['fromId'] ?? '');
    if (!fromId || fromId === this.roomState.getSelfId()) return;

    const participant = this.peerConnection.getParticipants().find(p => p.id === fromId);
    if (!participant?.peerConnection) return;

    const pc = participant.peerConnection;
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') return;

    await this.peerConnection.handleAnswer(fromId, String(message['sdp'] ?? ''));
  }

  private async handleIce(message: SignalingMessage): Promise<void> {
    const fromId = String(message['fromId'] ?? '');
    if (!fromId || fromId === this.roomState.getSelfId()) return;

    const participant = this.peerConnection.getParticipants().find(p => p.id === fromId);
    if (!participant?.peerConnection) return;

    const pc = participant.peerConnection;
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') return;

    await this.peerConnection.handleIce(fromId, String(message['candidate'] ?? ''));
  }

  private handleKicked(
    message: SignalingMessage,
    deps: SignalingHandlerDeps
  ): SignalingOutcome {
    const reason = String(message['reason'] ?? '');
    const key = reason === 'room_reset' ? 'room.disconnectedReset' : 'room.disconnectedInactivity';
    const kickMessage = this.translate.instant(key);
    deps.onCleanup();
    return {
      action: 'navigate',
      path: '/',
      state: { message: kickMessage },
      delayMs: 1000
    };
  }

  private handleChallenge(message: SignalingMessage): void {
    const challenge = String(message['challenge'] ?? '');
    this.roomState.setPendingChallenge(challenge);
    this.roomState.setAwaitingChallenge(true);
  }

  private hasPeer(id: string): boolean {
    return this.peerConnection.getParticipants().some(p => p.id === id);
  }

  sendJoin(displayName: string, muted: boolean): void {
    this.ws.sendMessage({ type: 'join', name: displayName, muted });
  }

  async sendJoinResponse(
    displayName: string,
    muted: boolean,
    passphrase: string,
    challenge: string
  ): Promise<void> {
    const passphraseHash = await this.crypto.sha256(passphrase);
    const response = await this.crypto.sha256(passphraseHash + challenge);
    this.ws.sendMessage({
      type: 'join-response',
      name: displayName,
      muted,
      response
    });
  }
}
