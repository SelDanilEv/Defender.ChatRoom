import { Injectable, signal } from '@angular/core';

export interface Participant {
  id: string;
  name: string;
  muted: boolean;
  audioElement?: HTMLAudioElement;
  peerConnection?: RTCPeerConnection;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

function getIceServers(): RTCIceServer[] {
  const custom = (window as unknown as { __TURN_CONFIG__?: RTCIceServer[] }).__TURN_CONFIG__;
  if (custom?.length) {
    return [...DEFAULT_ICE_SERVERS, ...custom];
  }
  return DEFAULT_ICE_SERVERS;
}

const MAX_RETRIES = 2;

@Injectable({
  providedIn: 'root'
})
export class PeerConnectionService {
  private readonly participants = signal<Participant[]>([]);
  private readonly pendingCreates = new Set<string>();
  private readonly pendingOffers = new Map<string, string>();
  private readonly pendingAnswers = new Map<string, string>();
  private readonly processingOffers = new Set<string>();
  private readonly processingAnswers = new Set<string>();
  private readonly iceQueues = new Map<string, string[]>();
  private readonly lastRetryAt = new Map<string, number>();

  readonly participants$ = this.participants.asReadonly();

  async createPeerConnection(
    remoteId: string,
    remoteName: string,
    muted: boolean,
    shouldOffer: boolean,
    localStream: MediaStream,
    volume: number,
    sendMessage: (msg: any) => void,
    retryCount = 0
  ): Promise<void> {
    if (this.pendingCreates.has(remoteId)) return;

    const existing = this.participants().find(p => p.id === remoteId);
    if (existing?.peerConnection) {
      const state = existing.peerConnection.connectionState;
      if (state === 'connected' || state === 'connecting') return;
      this.removeParticipant(remoteId);
    }

    this.pendingCreates.add(remoteId);
    try {
      const tracks = localStream.getAudioTracks().filter(t => t.readyState === 'live');
      if (tracks.length === 0) {
        return;
      }

      const pc = new RTCPeerConnection({ iceServers: getIceServers(), bundlePolicy: 'max-bundle' });

      pc.addTransceiver('audio', { direction: 'recvonly' });

      tracks.forEach(track => {
        try {
          pc.addTrack(track, localStream);
        } catch {
        }
      });

      const participant: Participant = { id: remoteId, name: remoteName, muted };
      participant.peerConnection = pc;

      pc.ontrack = (ev) => {
        if (!ev.streams?.[0]) return;
        const p = this.participants().find(x => x.id === remoteId);
        if (!p || p.peerConnection !== pc) return;

        const stream = ev.streams[0];
        const activeTrack = stream.getAudioTracks().find(t => t.readyState === 'live');
        if (!activeTrack) return;

        if (p.audioElement) {
          p.audioElement.pause();
          p.audioElement.srcObject = null;
          p.audioElement.remove();
        }

        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', '');
        audio.srcObject = stream;
        audio.volume = Math.min(volume / 100, 1);
        p.audioElement = audio;
        document.body.appendChild(audio);
        audio.play().catch(() => {});
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendMessage({ type: 'ice', toId: remoteId, candidate: JSON.stringify(ev.candidate) });
        }
      };

      pc.onconnectionstatechange = () => {
        const p = this.participants().find(x => x.id === remoteId);
        if (!p || p.peerConnection !== pc) return;

        if (pc.connectionState === 'failed' && retryCount < MAX_RETRIES) {
          const now = Date.now();
          if (now - (this.lastRetryAt.get(remoteId) ?? 0) > 2000) {
            this.lastRetryAt.set(remoteId, now);
            this.removeParticipant(remoteId);
            setTimeout(() => {
              this.createPeerConnection(remoteId, remoteName, muted, shouldOffer, localStream, volume, sendMessage, retryCount + 1);
            }, 1000);
          }
        } else if (pc.connectionState === 'closed') {
          this.removeParticipant(remoteId);
        }
      };

      this.participants.update(list => [...list, participant]);
      this.iceQueues.set(remoteId, []);

      if (shouldOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessage({ type: 'offer', toId: remoteId, sdp: JSON.stringify(offer) });
        await this.drainIceQueue(remoteId);
      }
    } finally {
      this.pendingCreates.delete(remoteId);
    }
  }

  async handleOffer(fromId: string, sdp: string, sendMessage: (msg: any) => void): Promise<void> {
    if (this.processingOffers.has(fromId)) {
      this.pendingOffers.set(fromId, sdp);
      return;
    }

    let participant = this.participants().find(p => p.id === fromId);
    if (!participant?.peerConnection) {
      this.pendingOffers.set(fromId, sdp);
      return;
    }

    const pc = participant.peerConnection;
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
      this.pendingOffers.set(fromId, sdp);
      setTimeout(() => {
        const pending = this.pendingOffers.get(fromId);
        if (pending) {
          this.pendingOffers.delete(fromId);
          this.handleOffer(fromId, pending, sendMessage);
        }
      }, 100);
      return;
    }

    this.processingOffers.add(fromId);
    try {
      const offer = JSON.parse(sdp) as RTCSessionDescriptionInit;
      if (offer.type !== 'offer') return;

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendMessage({ type: 'answer', toId: fromId, sdp: JSON.stringify(answer) });
      await this.drainIceQueue(fromId);
    } catch (err) {
      this.pendingOffers.set(fromId, sdp);
      setTimeout(() => {
        const pending = this.pendingOffers.get(fromId);
        if (pending) {
          this.pendingOffers.delete(fromId);
          this.handleOffer(fromId, pending, sendMessage);
        }
      }, 200);
    } finally {
      this.processingOffers.delete(fromId);
      const next = this.pendingOffers.get(fromId);
      if (next) {
        this.pendingOffers.delete(fromId);
        setTimeout(() => this.handleOffer(fromId, next, sendMessage), 50);
      }
    }
  }

  async handleAnswer(fromId: string, sdp: string): Promise<void> {
    if (this.processingAnswers.has(fromId)) {
      this.pendingAnswers.set(fromId, sdp);
      return;
    }

    const participant = this.participants().find(p => p.id === fromId);
    if (!participant?.peerConnection) {
      this.pendingAnswers.set(fromId, sdp);
      return;
    }

    const pc = participant.peerConnection;
    if (pc.signalingState !== 'have-local-offer') {
      this.pendingAnswers.set(fromId, sdp);
      setTimeout(() => {
        const pending = this.pendingAnswers.get(fromId);
        if (pending) {
          this.pendingAnswers.delete(fromId);
          this.handleAnswer(fromId, pending);
        }
      }, 50);
      return;
    }

    this.processingAnswers.add(fromId);
    try {
      const answer = JSON.parse(sdp) as RTCSessionDescriptionInit;
      if (answer.type !== 'answer') return;
      await pc.setRemoteDescription(answer);
      this.drainIceQueue(fromId);
    } finally {
      this.processingAnswers.delete(fromId);
      const next = this.pendingAnswers.get(fromId);
      if (next) {
        this.pendingAnswers.delete(fromId);
        setTimeout(() => this.handleAnswer(fromId, next), 50);
      }
    }
  }

  async handleIce(fromId: string, candidate: string): Promise<void> {
    const participant = this.participants().find(p => p.id === fromId);
    if (!participant?.peerConnection) {
      const queue = this.iceQueues.get(fromId) ?? [];
      queue.push(candidate);
      this.iceQueues.set(fromId, queue);
      return;
    }

    const pc = participant.peerConnection;
    if (pc.signalingState === 'closed' || pc.connectionState === 'closed') return;

    let parsed: RTCIceCandidateInit;
    try {
      parsed = JSON.parse(candidate) as RTCIceCandidateInit;
    } catch {
      return;
    }

    try {
      await pc.addIceCandidate(parsed);
    } catch {
      const queue = this.iceQueues.get(fromId) ?? [];
      queue.push(candidate);
      this.iceQueues.set(fromId, queue);
    }
  }

  private async drainIceQueue(remoteId: string): Promise<void> {
    const participant = this.participants().find(p => p.id === remoteId);
    if (!participant?.peerConnection) return;

    const queue = this.iceQueues.get(remoteId);
    if (!queue?.length) return;
    this.iceQueues.delete(remoteId);

    const pc = participant.peerConnection!;
    for (const c of queue) {
      try {
        const parsed = JSON.parse(c) as RTCIceCandidateInit;
        await pc.addIceCandidate(parsed);
      } catch {
      }
    }
  }

  updateParticipantMute(id: string, muted: boolean): void {
    this.participants.update(list =>
      list.map(p => (p.id === id ? { ...p, muted } : p))
    );
  }

  updateVolume(volume: number): void {
    const level = Math.min(volume / 100, 1);
    this.participants().forEach(p => {
      if (p.audioElement) p.audioElement.volume = level;
    });
  }

  getParticipants(): Participant[] {
    return [...this.participants()];
  }

  removeParticipant(id: string): void {
    const p = this.participants().find(x => x.id === id);
    if (!p) return;
    p.peerConnection?.close();
    p.audioElement?.remove();
    this.participants.update(list => list.filter(x => x.id !== id));
    this.iceQueues.delete(id);
    this.lastRetryAt.delete(id);
  }

  cleanup(): void {
    this.participants().forEach(p => {
      p.peerConnection?.close();
      p.audioElement?.remove();
    });
    this.participants.set([]);
    this.pendingCreates.clear();
    this.pendingOffers.clear();
    this.pendingAnswers.clear();
    this.processingOffers.clear();
    this.processingAnswers.clear();
    this.iceQueues.clear();
    this.lastRetryAt.clear();
  }

  async resumeRemoteAudio(): Promise<void> {
    await Promise.all(
      this.participants().map(p =>
        p.audioElement?.paused ? p.audioElement.play().catch(() => {}) : Promise.resolve()
      )
    );
  }
}
