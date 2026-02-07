import { Injectable, signal, effect } from '@angular/core';
import { WebSocketService } from './websocket.service';
import { PeerConnectionService, Participant } from './peer-connection.service';
import { AudioService } from './audio.service';
import { RoomStateService } from './room-state.service';
import { ClientIdService } from './client-id.service';

export interface HealthStatus {
  websocket: 'healthy' | 'unhealthy' | 'recovering';
  localAudio: 'healthy' | 'unhealthy' | 'recovering';
  peerConnections: 'healthy' | 'unhealthy' | 'recovering';
  audioContext: 'healthy' | 'unhealthy' | 'recovering';
  overall: 'healthy' | 'unhealthy' | 'recovering';
}

@Injectable({
  providedIn: 'root'
})
export class HealthMonitorService {
  private healthCheckInterval?: number;
  private readonly isMonitoring = signal(false);
  private readonly healthStatus = signal<HealthStatus>({
    websocket: 'healthy',
    localAudio: 'healthy',
    peerConnections: 'healthy',
    audioContext: 'healthy',
    overall: 'healthy'
  });
  private readonly recoveryAttempts = signal(0);
  private readonly maxRecoveryAttempts = 5;
  private isRecovering = false;

  readonly status = this.healthStatus.asReadonly();
  readonly isActive = this.isMonitoring.asReadonly();

  constructor(
    private webSocketService: WebSocketService,
    private peerConnectionService: PeerConnectionService,
    private audioService: AudioService,
    private roomStateService: RoomStateService,
    private clientIdService: ClientIdService
  ) {}

  startMonitoring(): void {
    if (this.isMonitoring()) {
      return;
    }

    this.isMonitoring.set(true);
    this.recoveryAttempts.set(0);
    this.healthCheckInterval = window.setInterval(() => {
      this.performHealthCheck();
    }, 5000);
  }

  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    this.isMonitoring.set(false);
    this.isRecovering = false;
  }

  private performHealthCheck(): void {
    if (this.isRecovering) {
      return;
    }

    const status: HealthStatus = {
      websocket: this.checkWebSocket(),
      localAudio: this.checkLocalAudio(),
      peerConnections: this.checkPeerConnections(),
      audioContext: this.checkAudioContext(),
      overall: 'healthy'
    };

    const hasIssues = status.websocket !== 'healthy' ||
                      status.localAudio !== 'healthy' ||
                      status.peerConnections !== 'healthy' ||
                      status.audioContext !== 'healthy';

    if (hasIssues) {
      status.overall = 'unhealthy';
      this.healthStatus.set(status);
      this.attemptRecovery(status);
    } else {
      status.overall = 'healthy';
      this.healthStatus.set(status);
      this.recoveryAttempts.set(0);
    }
  }

  private checkWebSocket(): 'healthy' | 'unhealthy' | 'recovering' {
    const status = this.webSocketService.getStatus();
    if (status === 'connected') {
      return 'healthy';
    } else if (status === 'connecting' || status === 'reconnecting') {
      return 'recovering';
    }
    return 'unhealthy';
  }

  private checkLocalAudio(): 'healthy' | 'unhealthy' | 'recovering' {
    if (!this.audioService.microphoneGranted$()) {
      return 'unhealthy';
    }

    const track = this.audioService.getLocalAudioTrack();
    if (!track) {
      return 'unhealthy';
    }

    if (track.readyState === 'live' && track.enabled) {
      return 'healthy';
    } else if (track.readyState === 'ended') {
      return 'unhealthy';
    }

    return 'recovering';
  }

  private checkPeerConnections(): 'healthy' | 'unhealthy' | 'recovering' {
    const participants = this.peerConnectionService.getParticipants();
    
    if (participants.length === 0) {
      return 'healthy';
    }

    let hasUnhealthy = false;
    let hasRecovering = false;

    for (const participant of participants) {
      if (!participant.peerConnection) {
        hasUnhealthy = true;
        continue;
      }

      const pc = participant.peerConnection;
      const connState = pc.connectionState as string;
      const iceState = pc.iceConnectionState;

      if (connState === 'failed' || connState === 'closed' || iceState === 'failed') {
        hasUnhealthy = true;
      } else if (connState === 'connecting' || connState === 'disconnected' || 
                 iceState === 'checking' || iceState === 'disconnected') {
        hasRecovering = true;
      } else if (connState !== 'connected' || iceState !== 'connected') {
        hasRecovering = true;
      }

      if (participant.audioElement) {
        if (participant.audioElement.paused || participant.audioElement.ended) {
          hasUnhealthy = true;
        }
      } else if (connState === 'connected') {
        hasUnhealthy = true;
      }
    }

    if (hasUnhealthy) {
      return 'unhealthy';
    } else if (hasRecovering) {
      return 'recovering';
    }

    return 'healthy';
  }

  private checkAudioContext(): 'healthy' | 'unhealthy' | 'recovering' {
    const track = this.audioService.getLocalAudioTrack();
    if (!track || !this.audioService.microphoneGranted$()) {
      return 'healthy';
    }
    const state = this.audioService.getAudioContextState();
    if (state === 'suspended' || state === 'closed') {
      return 'unhealthy';
    }
    return state === 'running' ? 'healthy' : 'recovering';
  }

  private async attemptRecovery(status: HealthStatus): Promise<void> {
    if (this.isRecovering) {
      return;
    }

    const attempts = this.recoveryAttempts();
    if (attempts >= this.maxRecoveryAttempts) {
      console.warn('Max recovery attempts reached. Manual intervention may be required.');
      return;
    }

    this.isRecovering = true;
    this.recoveryAttempts.update(a => a + 1);

    try {
      const recoveryPromises: Promise<void>[] = [];

      if (status.websocket === 'unhealthy') {
        recoveryPromises.push(this.recoverWebSocket());
      }

      if (status.localAudio === 'unhealthy') {
        recoveryPromises.push(this.recoverLocalAudio());
      }

      if (status.peerConnections === 'unhealthy') {
        recoveryPromises.push(this.recoverPeerConnections());
      }

      if (status.audioContext === 'unhealthy') {
        recoveryPromises.push(this.recoverAudioContext());
      }

      await Promise.allSettled(recoveryPromises);
    } catch (error) {
      console.error('Error during recovery:', error);
    } finally {
      setTimeout(() => {
        this.isRecovering = false;
      }, 2000);
    }
  }

  private async recoverWebSocket(): Promise<void> {
    const status = this.webSocketService.getStatus();
    if (status === 'disconnected' || status === 'reconnecting') {
      const clientId = this.clientIdService.getClientId();
      if (clientId) {
        this.webSocketService.connect(clientId);
      }
    }
  }

  private async recoverLocalAudio(): Promise<void> {
    const granted = this.audioService.microphoneGranted$();
    const track = this.audioService.getLocalAudioTrack();

    if (!granted || !track || track.readyState === 'ended') {
      try {
        await this.audioService.requestMicrophoneAccess();
      } catch (error) {
        console.error('Failed to recover local audio:', error);
      }
    } else if (track.readyState === 'live' && !track.enabled) {
      track.enabled = true;
    }
  }

  private async recoverPeerConnections(): Promise<void> {
    const participants = this.peerConnectionService.getParticipants();
    const selfId = this.roomStateService.getSelfId();

    if (!selfId || !this.webSocketService.isConnected()) {
      return;
    }

    const localStream = this.audioService.getLocalStream();
    if (!localStream) {
      return;
    }

    for (const participant of participants) {
      if (!participant.peerConnection) {
        continue;
      }

      const pc = participant.peerConnection;
      const connState = pc.connectionState as string;
      const iceState = pc.iceConnectionState;

      if (connState === 'failed' || connState === 'closed' || iceState === 'failed') {
        const participantId = participant.id;
        const participantName = participant.name;
        const participantMuted = participant.muted;
        
        this.peerConnectionService.removeParticipant(participantId);
        
        setTimeout(async () => {
          const shouldOffer = selfId < participantId;
          try {
            await this.peerConnectionService.createPeerConnection(
              participantId,
              participantName,
              participantMuted,
              shouldOffer,
              localStream,
              this.audioService.volume$(),
              (msg: { type: string; [key: string]: unknown }) => this.webSocketService.sendMessage(msg)
            );
          } catch (error) {
            console.error(`Failed to recover peer connection for ${participantId}:`, error);
          }
        }, 1000);
      } else if (connState === 'disconnected') {
        setTimeout(() => {
          const currentParticipant = this.peerConnectionService.getParticipants()
            .find(p => p.id === participant.id);
          if (currentParticipant && currentParticipant.peerConnection) {
            const currentState = currentParticipant.peerConnection.connectionState as string;
            if (currentState === 'disconnected' || currentState === 'failed') {
              const participantId = participant.id;
              const participantName = participant.name;
              const participantMuted = participant.muted;
              this.peerConnectionService.removeParticipant(participantId);
              
              setTimeout(async () => {
                const shouldOffer = selfId < participantId;
                try {
                  await this.peerConnectionService.createPeerConnection(
                    participantId,
                    participantName,
                    participantMuted,
                    shouldOffer,
                    localStream,
                    this.audioService.volume$(),
                    (msg: { type: string; [key: string]: unknown }) => this.webSocketService.sendMessage(msg)
                  );
                } catch (error) {
                  console.error(`Failed to recover disconnected peer connection for ${participantId}:`, error);
                }
              }, 2000);
            }
          }
        }, 3000);
      } else if (participant.audioElement) {
        if (participant.audioElement.paused && !participant.audioElement.ended) {
          try {
            await participant.audioElement.play();
          } catch (error) {
            console.error(`Failed to resume audio for ${participant.id}:`, error);
          }
        } else if (participant.audioElement.ended && connState === 'connected') {
          const participantId = participant.id;
          const participantName = participant.name;
          const participantMuted = participant.muted;
          
          this.peerConnectionService.removeParticipant(participantId);
          
          setTimeout(async () => {
            const shouldOffer = selfId < participantId;
            try {
              await this.peerConnectionService.createPeerConnection(
                participantId,
                participantName,
                participantMuted,
                shouldOffer,
                localStream,
                this.audioService.volume$(),
                (msg: { type: string; [key: string]: unknown }) => this.webSocketService.sendMessage(msg)
              );
            } catch (error) {
              console.error(`Failed to recover peer connection with ended audio for ${participantId}:`, error);
            }
          }, 1000);
        }
      } else if (connState === 'connected' && iceState === 'connected') {
        const participantId = participant.id;
        const participantName = participant.name;
        const participantMuted = participant.muted;
        
        setTimeout(async () => {
          const stillMissing = this.peerConnectionService.getParticipants()
            .find(p => p.id === participantId && !p.audioElement);
          if (stillMissing) {
            this.peerConnectionService.removeParticipant(participantId);
            
            setTimeout(async () => {
              const shouldOffer = selfId < participantId;
              try {
                await this.peerConnectionService.createPeerConnection(
                  participantId,
                  participantName,
                  participantMuted,
                  shouldOffer,
                  localStream,
                  this.audioService.volume$(),
                  (msg: { type: string; [key: string]: unknown }) => this.webSocketService.sendMessage(msg)
                );
              } catch (error) {
                console.error(`Failed to recover peer connection missing audio element for ${participantId}:`, error);
              }
            }, 1000);
          }
        }, 2000);
      }
    }
  }

  private async recoverAudioContext(): Promise<void> {
    await this.audioService.resumeAudioContext();
    await this.peerConnectionService.resumeRemoteAudio();
  }

  forceRecovery(): void {
    this.recoveryAttempts.set(0);
    this.performHealthCheck();
  }

  getHealthReport(): string {
    const status = this.healthStatus();
    const issues: string[] = [];

    if (status.websocket !== 'healthy') {
      issues.push(`WebSocket: ${status.websocket}`);
    }
    if (status.localAudio !== 'healthy') {
      issues.push(`Local Audio: ${status.localAudio}`);
    }
    if (status.peerConnections !== 'healthy') {
      issues.push(`Peer Connections: ${status.peerConnections}`);
    }
    if (status.audioContext !== 'healthy') {
      issues.push(`Audio Context: ${status.audioContext}`);
    }

    if (issues.length === 0) {
      return 'All systems healthy';
    }

    return `Issues detected: ${issues.join(', ')}`;
  }
}
