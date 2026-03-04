import { Injectable, signal } from '@angular/core';
import { WebSocketService } from './websocket.service';
import { PeerConnectionService, Participant } from './peer-connection.service';
import { AudioService } from './audio.service';

@Injectable({
  providedIn: 'root'
})
export class HealthMonitorService {
  private healthCheckInterval?: number;
  private readonly isMonitoring = signal(false);
  private readonly localIssueKey = signal<string | null>(null);

  readonly isActive = this.isMonitoring.asReadonly();
  readonly localIssue = this.localIssueKey.asReadonly();

  constructor(
    private webSocketService: WebSocketService,
    private peerConnectionService: PeerConnectionService,
    private audioService: AudioService
  ) {}

  startMonitoring(): void {
    if (this.isMonitoring()) {
      return;
    }

    this.isMonitoring.set(true);
    this.localIssueKey.set(null);
    this.performHealthCheck();

    this.healthCheckInterval = window.setInterval(() => {
      this.performHealthCheck();
    }, 3000);
  }

  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    this.localIssueKey.set(null);
    this.isMonitoring.set(false);
  }

  private performHealthCheck(): void {
    if (!this.isMonitoring() || this.localIssueKey()) {
      return;
    }

    if (this.webSocketService.getStatus() !== 'connected') {
      this.localIssueKey.set('room.disconnected');
      return;
    }

    if (this.audioService.microphoneGranted$()) {
      const track = this.audioService.getLocalAudioTrack();
      if (!track || track.readyState !== 'live') {
        this.localIssueKey.set('room.micTrackEnded');
        return;
      }
    }

    const participants = this.peerConnectionService.getParticipants();
    const participantsToDrop = participants
      .filter((participant) => this.isPeerUnhealthy(participant))
      .map((participant) => participant.id);

    participantsToDrop.forEach((participantId) => {
      this.peerConnectionService.removeParticipant(participantId);
    });
  }

  private isPeerUnhealthy(participant: Participant): boolean {
    const pc = participant.peerConnection;
    if (!pc) {
      return true;
    }

    const connectionState = pc.connectionState;
    const iceConnectionState = pc.iceConnectionState;

    if (
      connectionState === 'failed' ||
      connectionState === 'disconnected' ||
      connectionState === 'closed' ||
      iceConnectionState === 'failed' ||
      iceConnectionState === 'disconnected' ||
      iceConnectionState === 'closed'
    ) {
      return true;
    }

    if (participant.audioElement?.ended) {
      return true;
    }

    return false;
  }
}
