import { Injectable, inject } from '@angular/core';
import { PeerConnectionService } from './peer-connection.service';
import { AudioService } from './audio.service';
import { WebSocketService } from './websocket.service';

export interface PendingPeer {
  id: string;
  name: string;
  muted: boolean;
  shouldOffer: boolean;
}

@Injectable({ providedIn: 'root' })
export class PeerOrchestratorService {
  private readonly peerConnection = inject(PeerConnectionService);
  private readonly audio = inject(AudioService);
  private readonly ws = inject(WebSocketService);

  private readonly pendingPeers = new Map<string, PendingPeer>();
  private readonly processingPeers = new Set<string>();

  async createPeer(
    remoteId: string,
    remoteName: string,
    muted: boolean,
    shouldOffer: boolean
  ): Promise<boolean> {
    if (this.processingPeers.has(remoteId)) {
      this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
      return false;
    }

    const stream = this.audio.getLocalStream();
    const track = this.audio.getLocalAudioTrack();
    if (!stream || !track || track.readyState !== 'live') {
      this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
      return false;
    }

    this.processingPeers.add(remoteId);
    try {
      await this.peerConnection.createPeerConnection(
        remoteId,
        remoteName,
        muted,
        shouldOffer,
        stream,
        this.audio.volume$(),
        msg => this.ws.sendMessage(msg)
      );

      const created = this.peerConnection.getParticipants().some(p => p.id === remoteId);
      if (created) {
        this.pendingPeers.delete(remoteId);
      } else {
        this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
      }
      return created;
    } catch (error) {
      console.error(`Error creating peer connection for ${remoteId}:`, error);
      this.pendingPeers.set(remoteId, { id: remoteId, name: remoteName, muted, shouldOffer });
      return false;
    } finally {
      this.processingPeers.delete(remoteId);
    }
  }

  processPendingPeers(): void {
    if (this.pendingPeers.size === 0) return;
    if (!this.audio.microphoneGranted$() || !this.ws.isConnected()) return;

    const pending = Array.from(this.pendingPeers.values());
    for (const peer of pending) {
      if (!this.processingPeers.has(peer.id)) {
        void this.createPeer(peer.id, peer.name, peer.muted, peer.shouldOffer);
      }
    }
  }

  isProcessing(id: string): boolean {
    return this.processingPeers.has(id);
  }

  hasPeer(id: string): boolean {
    return this.peerConnection.getParticipants().some(p => p.id === id);
  }

  reset(): void {
    this.pendingPeers.clear();
    this.processingPeers.clear();
  }
}
