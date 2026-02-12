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
  private isInitializing = false;

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

    if (this.isInitializing) {
      return false;
    }

    this.requestingAccess.set(true);
    this.errorMessage.set('');

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = this.localStream.getAudioTracks();
      if (tracks.length === 0) {
        throw new Error('No audio tracks available');
      }
      this.localAudioTrack = tracks[0];
      this.microphoneGranted.set(true);
      this.requestingAccess.set(false);
      await this.setupMicrophoneGain();
      return true;
    } catch (error: any) {
      this.requestingAccess.set(false);
      this.cleanup();

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

  getAudioContextState(): string | null {
    return this.audioContext?.state ?? null;
  }

  toggleMute(): void {
    if (this.localAudioTrack && this.localAudioTrack.readyState === 'live') {
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
    this.isInitializing = false;

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch (error) {
      }
      this.gainNode = undefined;
    }

    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect();
      } catch (error) {
      }
      this.mediaStreamSource = undefined;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (error) {
      }
      this.audioContext = undefined;
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
    this.microphoneGranted.set(false);
    this.requestingAccess.set(false);
  }

  async resumeAudioContext(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        console.error('Error resuming audio context:', error);
      }
    }
  }

  private async setupMicrophoneGain(): Promise<void> {
    if (!this.localStream || !this.localAudioTrack || this.isInitializing) {
      return;
    }

    if (this.localAudioTrack.readyState !== 'live') {
      return;
    }

    this.isInitializing = true;
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
        } catch (error) {
          this.isInitializing = false;
          return;
        }
      }

      if (this.audioContext.state !== 'running') {
        this.isInitializing = false;
        return;
      }

      if (!this.localAudioTrack || this.localAudioTrack.readyState !== 'live') {
        this.isInitializing = false;
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
      if (!newTrack) {
        this.isInitializing = false;
        return;
      }

      this.localStream.removeTrack(this.originalTrack);
      newTrack.enabled = this.originalTrack.enabled;
      this.localStream.addTrack(newTrack);
      this.localAudioTrack = newTrack;
      this.usingProcessedTrack = true;
    } catch (error) {
      console.error('Error setting up microphone gain:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  private updateMicGain(): void {
    if (this.gainNode && this.audioContext && this.audioContext.state === 'running') {
      try {
        const gainValue = Math.max(0, Math.min(1, this.micLevel() / 100));
        this.gainNode.gain.value = gainValue;
      } catch (error) {
        console.error('Error updating mic gain:', error);
      }
    }
  }
}
