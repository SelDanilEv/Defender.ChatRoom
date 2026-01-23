import { Injectable, signal } from '@angular/core';

export interface Participant {
  id: string;
  name: string;
  muted: boolean;
  audioElement?: HTMLAudioElement;
  peerConnection?: RTCPeerConnection;
}

@Injectable({
  providedIn: 'root'
})
export class PeerConnectionService {
  private readonly participants = signal<Participant[]>([]);
  private readonly lastRetryAt = new Map<string, number>();
  private readonly pendingCreates = new Set<string>();
  private readonly blockedUntil = new Map<string, number>();
  private readonly createFailures = new Map<string, number>();
  private readonly statsIntervals = new Map<string, number>();
  private readonly pendingOffers = new Map<string, string>();
  private readonly pendingAnswers = new Map<string, string>();
  private readonly processingOffers = new Set<string>();
  private readonly processingAnswers = new Set<string>();
  private readonly pendingOfferCreates = new Map<string, RTCPeerConnection>();

  readonly participants$ = this.participants.asReadonly();

  constructor() {}

  async createPeerConnection(
    remoteId: string,
    remoteName: string,
    muted: boolean,
    shouldOffer: boolean,
    localStream: MediaStream,
    volume: number,
    sendMessage: (message: any) => void,
    retryCount = 0
  ): Promise<void> {
    const now = Date.now();
    const blockedUntil = this.blockedUntil.get(remoteId) ?? 0;
    if (blockedUntil > now) {
      return;
    }

    if (this.pendingCreates.has(remoteId)) {
      return;
    }

    this.pendingCreates.add(remoteId);
    try {
      const existingParticipant = this.participants().find(p => p.id === remoteId);
      if (existingParticipant) {
        const existingState = existingParticipant.peerConnection?.connectionState;
        if (existingState === 'connected' || existingState === 'connecting') {
          return;
        }
        if (existingParticipant.peerConnection) {
          existingParticipant.peerConnection.close();
        }
        if (existingParticipant.audioElement) {
          existingParticipant.audioElement.remove();
        }
        this.participants.update(participants => 
          participants.filter(p => p.id !== remoteId)
        );
      }

      const stunServers = [{ urls: 'stun:stun.l.google.com:19302' }];
      const iceServers: RTCIceServer[] = stunServers;
      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({ iceServers });
      } catch (error) {
        const failures = (this.createFailures.get(remoteId) ?? 0) + 1;
        this.createFailures.set(remoteId, failures);
        const backoffMs = Math.min(5000 * failures, 30000);
        this.blockedUntil.set(remoteId, Date.now() + backoffMs);
        return;
      }
      
      const audioTracks = localStream.getAudioTracks().filter(track => 
        track.readyState === 'live' && track.enabled
      );
      
      if (audioTracks.length === 0) {
        this.pendingCreates.delete(remoteId);
        return;
      }

      audioTracks.forEach(track => {
        try {
          pc.addTrack(track, localStream);
        } catch (error) {
          console.error(`Error adding track to peer connection for ${remoteId}:`, error);
        }
      });

    const participant: Participant = {
      id: remoteId,
      name: remoteName,
      muted: muted
    };

    pc.ontrack = (event) => {
      if (!event.streams || event.streams.length === 0) {
        return;
      }

      const currentParticipant = this.participants().find(p => p.id === remoteId);
      if (!currentParticipant) {
        return;
      }

      if (currentParticipant.audioElement) {
        const existingStream = currentParticipant.audioElement.srcObject as MediaStream;
        if (existingStream && existingStream.id === event.streams[0].id) {
          return;
        }
      }

      const stream = event.streams[0];
      const audioTracks = stream.getAudioTracks();
      
      if (!stream || audioTracks.length === 0) {
        return;
      }

      const activeTrack = audioTracks.find(track => track.readyState === 'live');
      if (!activeTrack) {
        return;
      }

      if (currentParticipant.audioElement) {
        try {
          currentParticipant.audioElement.pause();
          currentParticipant.audioElement.srcObject = null;
          currentParticipant.audioElement.remove();
        } catch (error) {
        }
      }

      const audioElement = document.createElement('audio');
      audioElement.autoplay = true;
      audioElement.setAttribute('playsinline', 'true');
      audioElement.srcObject = stream;
      const volumeLevel = Math.min(volume / 100, 1.0);
      audioElement.volume = volumeLevel;

      currentParticipant.audioElement = audioElement;
      document.body.appendChild(audioElement);

      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
        });
      }

      activeTrack.onended = () => {
        if (currentParticipant.audioElement) {
          try {
            currentParticipant.audioElement.pause();
            currentParticipant.audioElement.srcObject = null;
            currentParticipant.audioElement.remove();
          } catch (error) {
          }
          currentParticipant.audioElement = undefined;
        }
      };
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          type: 'ice',
          toId: remoteId,
          candidate: JSON.stringify(event.candidate)
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      const participant = this.participants().find(p => p.id === remoteId);
      
      if (!participant || participant.peerConnection !== pc) {
        return;
      }

      if (state === 'connected') {
        this.lastRetryAt.delete(remoteId);
        this.createFailures.delete(remoteId);
        this.startStatsLogging(remoteId, pc);
      } else if (state === 'failed') {
        this.retryPeerConnection(remoteId, remoteName, muted, shouldOffer, localStream, volume, sendMessage, retryCount + 1);
      } else if (state === 'disconnected') {
        setTimeout(() => {
          const currentParticipant = this.participants().find(p => p.id === remoteId);
          if (currentParticipant && currentParticipant.peerConnection === pc) {
            const currentState = pc.connectionState;
            if (currentState === 'disconnected' || currentState === 'failed') {
              this.retryPeerConnection(remoteId, remoteName, muted, shouldOffer, localStream, volume, sendMessage, retryCount + 1);
            }
          }
        }, 3000);
      } else if (state === 'closed') {
        this.stopStatsLogging(remoteId);
        if (participant && participant.peerConnection === pc) {
          this.removeParticipant(remoteId);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      const participant = this.participants().find(p => p.id === remoteId);
      
      if (!participant || participant.peerConnection !== pc) {
        return;
      }

      if (iceState === 'failed') {
        this.retryPeerConnection(remoteId, remoteName, muted, shouldOffer, localStream, volume, sendMessage, retryCount + 1);
      }
    };

    participant.peerConnection = pc;
    this.participants.update(participants => [...participants, participant]);

    if (shouldOffer) {
      this.pendingOfferCreates.set(remoteId, pc);
      try {
        const connState = pc.connectionState as string;
        if (connState === 'failed' || connState === 'closed') {
          this.pendingCreates.delete(remoteId);
          this.pendingOfferCreates.delete(remoteId);
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const connStateAfter = pc.connectionState as string;
        if (connStateAfter === 'failed' || connStateAfter === 'closed') {
          this.pendingCreates.delete(remoteId);
          this.pendingOfferCreates.delete(remoteId);
          return;
        }

        if (this.pendingOffers.has(remoteId)) {
          this.pendingOfferCreates.delete(remoteId);
          return;
        }

        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);
        sendMessage({
          type: 'offer',
          toId: remoteId,
          sdp: JSON.stringify(offer)
        });
        this.pendingOfferCreates.delete(remoteId);
      } catch (error) {
        console.error(`Error creating offer for ${remoteId}:`, error);
        this.pendingCreates.delete(remoteId);
        this.pendingOfferCreates.delete(remoteId);
        setTimeout(() => {
          const stillExists = this.participants().find(p => p.id === remoteId);
          if (stillExists && stillExists.peerConnection === pc) {
            this.removeParticipant(remoteId);
          }
        }, 1000);
      }
    }
    } finally {
      this.pendingCreates.delete(remoteId);
    }
  }

  async handleOffer(
    fromId: string,
    sdp: string,
    sendMessage: (message: any) => void
  ): Promise<void> {
    if (this.processingOffers.has(fromId)) {
      this.pendingOffers.set(fromId, sdp);
      return;
    }

    const pendingOfferCreate = this.pendingOfferCreates.get(fromId);
    if (pendingOfferCreate) {
      this.pendingOfferCreates.delete(fromId);
      try {
        if (pendingOfferCreate.signalingState !== 'closed' && pendingOfferCreate.connectionState !== 'closed') {
          pendingOfferCreate.close();
        }
      } catch (error) {
      }
    }

    const participant = this.participants().find(p => p.id === fromId);
    if (!participant || !participant.peerConnection) {
      this.pendingOffers.set(fromId, sdp);
      let retries = 0;
      const maxRetries = 10;
      const checkInterval = setInterval(() => {
        retries++;
        const retryParticipant = this.participants().find(p => p.id === fromId);
        if (retryParticipant && retryParticipant.peerConnection) {
          clearInterval(checkInterval);
          this.handleOffer(fromId, sdp, sendMessage);
        } else if (retries >= maxRetries) {
          clearInterval(checkInterval);
          this.pendingOffers.delete(fromId);
        }
      }, 100);
      return;
    }

    const pc = participant.peerConnection;
    
    const connState = pc.connectionState as string;
    if (connState === 'failed' || connState === 'closed') {
      return;
    }

    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
      this.pendingOffers.set(fromId, sdp);
      setTimeout(() => {
        const pendingSdp = this.pendingOffers.get(fromId);
        if (pendingSdp) {
          this.pendingOffers.delete(fromId);
          this.handleOffer(fromId, pendingSdp, sendMessage);
        }
      }, 150);
      return;
    }

    this.processingOffers.add(fromId);
    try {
      const offer = JSON.parse(sdp) as RTCSessionDescriptionInit;
      
      if (!offer.type || offer.type !== 'offer') {
        this.processingOffers.delete(fromId);
        return;
      }

      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(answer);

      sendMessage({
        type: 'answer',
        toId: fromId,
        sdp: JSON.stringify(answer)
      });
    } catch (error) {
      console.error(`Error handling offer from ${fromId}:`, error);
      this.pendingOffers.set(fromId, sdp);
      setTimeout(() => {
        const pendingSdp = this.pendingOffers.get(fromId);
        if (pendingSdp && participant.peerConnection && participant.peerConnection.signalingState !== 'closed') {
          this.pendingOffers.delete(fromId);
          this.processingOffers.delete(fromId);
          this.handleOffer(fromId, pendingSdp, sendMessage);
        }
      }, 500);
    } finally {
      this.processingOffers.delete(fromId);
      const nextOffer = this.pendingOffers.get(fromId);
      if (nextOffer) {
        this.pendingOffers.delete(fromId);
        setTimeout(() => this.handleOffer(fromId, nextOffer, sendMessage), 100);
      }
    }
  }

  async handleAnswer(fromId: string, sdp: string): Promise<void> {
    if (this.processingAnswers.has(fromId)) {
      this.pendingAnswers.set(fromId, sdp);
      return;
    }

    const participant = this.participants().find(p => p.id === fromId);
    if (!participant || !participant.peerConnection) {
      this.pendingAnswers.set(fromId, sdp);
      return;
    }

    const pc = participant.peerConnection;

    if (pc.signalingState === 'closed' || pc.connectionState === 'closed') {
      return;
    }

    if (pc.signalingState !== 'have-local-offer') {
      this.pendingAnswers.set(fromId, sdp);
      setTimeout(() => {
        const pendingSdp = this.pendingAnswers.get(fromId);
        if (pendingSdp) {
          this.pendingAnswers.delete(fromId);
          this.handleAnswer(fromId, pendingSdp);
        }
      }, 100);
      return;
    }

    this.processingAnswers.add(fromId);
    try {
      const answer = JSON.parse(sdp) as RTCSessionDescriptionInit;
      
      if (!answer.type || answer.type !== 'answer') {
        this.processingAnswers.delete(fromId);
        return;
      }

      await pc.setRemoteDescription(answer);
    } catch (error) {
      console.error(`Error handling answer from ${fromId}:`, error);
    } finally {
      this.processingAnswers.delete(fromId);
      const nextAnswer = this.pendingAnswers.get(fromId);
      if (nextAnswer) {
        this.pendingAnswers.delete(fromId);
        setTimeout(() => this.handleAnswer(fromId, nextAnswer), 50);
      }
    }
  }

  async handleIce(fromId: string, candidate: string): Promise<void> {
    const participant = this.participants().find(p => p.id === fromId);
    if (!participant || !participant.peerConnection) {
      return;
    }

    const pc = participant.peerConnection;

    if (pc.signalingState === 'closed' || pc.connectionState === 'closed') {
      return;
    }

    try {
      const iceCandidate = JSON.parse(candidate) as RTCIceCandidateInit;
      
      if (!iceCandidate.candidate && iceCandidate.candidate !== null) {
        return;
      }

      await pc.addIceCandidate(iceCandidate);
      this.createFailures.delete(`ice-${fromId}`);
    } catch (error: any) {
      if (error.name === 'OperationError' || error.name === 'InvalidStateError') {
        return;
      }
      
      const retryCount = (this.createFailures.get(`ice-${fromId}`) ?? 0) + 1;
      if (retryCount < 3) {
        this.createFailures.set(`ice-${fromId}`, retryCount);
        setTimeout(() => {
          this.handleIce(fromId, candidate);
        }, 500);
      } else {
        this.createFailures.delete(`ice-${fromId}`);
      }
    }
  }

  updateParticipantMute(id: string, muted: boolean): void {
    this.participants.update(participants => {
      const participant = participants.find(p => p.id === id);
      if (participant) {
        participant.muted = muted;
      }
      return [...participants];
    });
  }

  updateVolume(volume: number): void {
    const volumeLevel = Math.min(volume / 100, 1.0);
    this.participants().forEach(p => {
      if (p.audioElement) {
        p.audioElement.volume = volumeLevel;
      }
    });
  }

  getParticipants(): Participant[] {
    return [...this.participants()];
  }

  removeParticipant(id: string): void {
    const participant = this.participants().find(p => p.id === id);
    if (!participant) return;

    this.stopStatsLogging(id);
    if (participant.peerConnection) {
      participant.peerConnection.close();
    }
    if (participant.audioElement) {
      try {
        participant.audioElement.pause();
        participant.audioElement.srcObject = null;
        participant.audioElement.remove();
      } catch (error) {
      }
    }

    this.participants.update(participants => participants.filter(p => p.id !== id));
    this.lastRetryAt.delete(id);
  }

  cleanup(): void {
    this.participants().forEach((p) => {
      if (p.peerConnection) {
        try {
          p.peerConnection.close();
        } catch (error) {
        }
      }
      if (p.audioElement) {
        try {
          p.audioElement.pause();
          p.audioElement.srcObject = null;
          p.audioElement.remove();
        } catch (error) {
        }
      }
    });
    this.participants.set([]);
    this.lastRetryAt.clear();
    this.pendingCreates.clear();
    this.blockedUntil.clear();
    this.createFailures.clear();
    this.pendingOffers.clear();
    this.pendingAnswers.clear();
    this.processingOffers.clear();
    this.processingAnswers.clear();
    this.pendingOfferCreates.clear();
    this.statsIntervals.forEach(intervalId => clearInterval(intervalId));
    this.statsIntervals.clear();
  }

  async resumeRemoteAudio(): Promise<void> {
    const resumes = this.participants().map(async participant => {
      if (participant.audioElement && participant.audioElement.paused) {
        try {
          await participant.audioElement.play();
        } catch (error) {
        }
      }
    });
    await Promise.all(resumes);
  }

  private startStatsLogging(remoteId: string, pc: RTCPeerConnection): void {
    if (this.statsIntervals.has(remoteId)) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        await pc.getStats();
      } catch (error) {
      }
    }, 5000);

    this.statsIntervals.set(remoteId, intervalId);
  }

  private stopStatsLogging(remoteId: string): void {
    const intervalId = this.statsIntervals.get(remoteId);
    if (intervalId) {
      clearInterval(intervalId);
      this.statsIntervals.delete(remoteId);
    }
  }

  private async retryPeerConnection(
    remoteId: string,
    remoteName: string,
    muted: boolean,
    shouldOffer: boolean,
    localStream: MediaStream,
    volume: number,
    sendMessage: (message: any) => void,
    retryCount = 0
  ): Promise<void> {
    if (retryCount >= 3) {
      this.removeParticipant(remoteId);
      return;
    }

    const now = Date.now();
    const lastRetry = this.lastRetryAt.get(remoteId) ?? 0;
    if (now - lastRetry < 2000) {
      return;
    }
    this.lastRetryAt.set(remoteId, now);

    const existingParticipant = this.participants().find(p => p.id === remoteId);
    if (existingParticipant && existingParticipant.peerConnection) {
      const state = existingParticipant.peerConnection.connectionState;
      if (state === 'connected' || state === 'connecting') {
        return;
      }
      try {
        existingParticipant.peerConnection.close();
      } catch (error) {
      }
      this.removeParticipant(remoteId);
    }

    setTimeout(() => {
      const stillExists = this.participants().find(p => p.id === remoteId);
      if (!stillExists) {
        this.createPeerConnection(remoteId, remoteName, muted, shouldOffer, localStream, volume, sendMessage, retryCount);
      }
    }, 2000 * (retryCount + 1));
  }
}
