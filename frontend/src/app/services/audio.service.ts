import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private localStream?: MediaStream;
  private localAudioTrack?: MediaStreamTrack;
  private audioContext?: AudioContext;
  private gainNode?: GainNode;
  private mediaStreamSource?: MediaStreamAudioSourceNode;
  private originalTrack?: MediaStreamTrack;
  private usingProcessedTrack = false;

  private readonly microphoneGranted = signal(false);
  private readonly requestingAccess = signal(false);
  private readonly errorMessage = signal<string>('');
  private readonly volume = signal(100);
  private readonly micLevel = signal(100);
  private readonly isMuted = signal(false);

  readonly microphoneGranted$ = this.microphoneGranted.asReadonly();
  readonly requestingAccess$ = this.requestingAccess.asReadonly();
  readonly errorMessage$ = this.errorMessage.asReadonly();
  readonly volume$ = this.volume.asReadonly();
  readonly micLevel$ = this.micLevel.asReadonly();
  readonly isMuted$ = this.isMuted.asReadonly();

  constructor() {}

  async requestMicrophoneAccess(): Promise<boolean> {
    if (this.requestingAccess() || this.microphoneGranted()) {
      return this.microphoneGranted();
    }

    this.requestingAccess.set(true);
    this.errorMessage.set('');

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.localAudioTrack = this.localStream.getAudioTracks()[0];
      this.microphoneGranted.set(true);
      this.requestingAccess.set(false);
      await this.setupMicrophoneGain();
      return true;
    } catch (error: any) {
      this.requestingAccess.set(false);

      let errorKey = 'room.micUserInteraction';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorKey = 'room.micPermissionDenied';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorKey = 'room.noMicFound';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorKey = 'room.micInUse';
      }

      this.errorMessage.set(errorKey);
      return false;
    }
  }

  getLocalStream(): MediaStream | undefined {
    return this.localStream;
  }

  getLocalAudioTrack(): MediaStreamTrack | undefined {
    return this.localAudioTrack;
  }

  toggleMute(): void {
    if (this.localAudioTrack) {
      this.isMuted.update((muted: boolean) => !muted);
      this.localAudioTrack.enabled = !this.isMuted();
    }
  }

  getIsMuted(): boolean {
    return this.isMuted();
  }

  setVolume(volume: number): void {
    this.volume.set(volume);
  }

  getVolume(): number {
    return this.volume();
  }

  setMicLevel(level: number): void {
    this.micLevel.set(level);
    this.updateMicGain();
  }

  getMicLevel(): number {
    return this.micLevel();
  }

  updateVolumeForParticipants(participants: any[]): void {
    const volumeLevel = this.volume() / 100;
    participants.forEach(p => {
      if (p.audioElement) {
        p.audioElement.volume = Math.min(volumeLevel, 1.0);
      }
    });
  }

  cleanup(): void {
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch (error) {
      }
    }

    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect();
      } catch (error) {
      }
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (error) {
      }
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          if (track.readyState !== 'ended') {
            track.stop();
          }
        } catch (error) {
        }
      });
      this.localStream = undefined;
    }

    if (this.localAudioTrack) {
      this.localAudioTrack = undefined;
    }

    this.originalTrack = undefined;
    this.usingProcessedTrack = false;
  }

  async resumeAudioContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
      }
    }
  }

  private async setupMicrophoneGain(): Promise<void> {
    if (!this.localStream || !this.localAudioTrack) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
        } catch (error) {
        }
      }

      if (this.audioContext.state !== 'running') {
        return;
      }

      this.originalTrack = this.localAudioTrack;
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.localStream);
      this.gainNode = this.audioContext.createGain();
      this.mediaStreamSource.connect(this.gainNode);

      const destination = this.audioContext.createMediaStreamDestination();
      this.gainNode.connect(destination);

      this.updateMicGain();

      const newTrack = destination.stream.getAudioTracks()[0];
      
      if (newTrack.muted) {
        return;
      }

      this.localStream.removeTrack(this.originalTrack);
      newTrack.enabled = this.originalTrack.enabled;
      this.localStream.addTrack(newTrack);
      this.localAudioTrack = newTrack;
      this.usingProcessedTrack = true;
    } catch (error) {
    }
  }

  private updateMicGain(): void {
    if (this.gainNode) {
      const gainValue = this.micLevel() / 100;
      this.gainNode.gain.value = gainValue;
    }
  }
}
