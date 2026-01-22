import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageSelectorComponent } from '../components/language-selector/language-selector.component';
import { ClientIdService } from '../services/client-id.service';

interface Participant {
  id: string;
  name: string;
  muted: boolean;
  audioElement?: HTMLAudioElement;
  peerConnection?: RTCPeerConnection;
  audioContext?: AudioContext;
  gainNode?: GainNode;
  audioSource?: MediaStreamAudioSourceNode;
}

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, LanguageSelectorComponent],
  template: `
    <app-language-selector></app-language-selector>
    <div class="container">
      <div class="card">
        <h1>{{ 'room.title' | translate }}</h1>
        
        <div *ngIf="errorMessage" class="error">{{ errorMessage }}</div>
        
        <div *ngIf="connectionStatus !== 'connected'" class="info" style="margin-bottom: 16px;">
          <span *ngIf="connectionStatus === 'connecting'">🔄 {{ 'room.connecting' | translate }}</span>
          <span *ngIf="connectionStatus === 'reconnecting'">🔄 {{ 'room.reconnecting' | translate: {attempt: reconnectAttempts, max: maxReconnectAttempts} }}</span>
          <span *ngIf="connectionStatus === 'disconnected'">⚠️ {{ 'room.disconnected' | translate }}</span>
        </div>
        
        <div *ngIf="connectionQuality === 'poor' && connectionStatus === 'connected'" class="info" style="margin-bottom: 16px; background: #ff9800;">
          ⚠️ {{ 'room.poorConnection' | translate }}
        </div>
        
        <div *ngIf="!microphoneGranted" class="info" style="margin-bottom: 24px;">
          <p style="margin-bottom: 16px;">{{ 'room.micRequired' | translate }}</p>
          <button (click)="requestMicrophoneAccess()" [disabled]="requestingAccess">
            {{ (requestingAccess ? 'room.requestingMicAccess' : 'room.requestMicAccess') | translate }}
          </button>
        </div>
        
        <div *ngIf="microphoneGranted">
          <h2>{{ 'room.participants' | translate }} ({{ participants.length + 1 }})</h2>
          
          <div class="participants-grid">
            <div class="participant-card participant-card-self" [class.hearing-accessibility-enhanced]="hearingAccessibilityMode && !isMuted">
              <div class="participant-avatar" [class.hearing-accessibility-avatar]="hearingAccessibilityMode && !isMuted">
                <span class="participant-initial">{{ displayName.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="participant-info">
                <div class="participant-name">{{ displayName }}</div>
                <div class="participant-badge">{{ 'room.you' | translate }}</div>
                <div class="participant-status">
                  <span *ngIf="isMuted" class="status-muted">🔇 {{ 'room.muted' | translate }}</span>
                  <span *ngIf="!isMuted" class="status-speaking">🔊 {{ 'room.speaking' | translate }}</span>
                </div>
              </div>
            </div>
            
            <div *ngFor="let p of participants" class="participant-card" [class.hearing-accessibility-enhanced]="hearingAccessibilityMode && !p.muted">
              <div class="participant-avatar" [class.hearing-accessibility-avatar]="hearingAccessibilityMode && !p.muted">
                <span class="participant-initial">{{ p.name.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="participant-info">
                <div class="participant-name">{{ p.name }}</div>
                <div class="participant-status">
                  <span *ngIf="p.muted" class="status-muted">🔇 {{ 'room.muted' | translate }}</span>
                  <span *ngIf="!p.muted" class="status-speaking">🔊 {{ 'room.speaking' | translate }}</span>
                </div>
              </div>
            </div>
            
            <div *ngIf="participants.length === 0" class="participants-empty">
              {{ 'room.noParticipants' | translate }}
            </div>
          </div>
          
          <div class="controls">
            <button 
              class="control-button control-button-mute"
              (click)="toggleMute()" 
              [style.background]="isMuted ? '#d32f2f' : '#4a9eff'"
            >
              <span class="button-icon">{{ isMuted ? '🔇' : '🔊' }}</span>
              <span class="button-text">{{ (isMuted ? 'room.unmute' : 'room.mute') | translate }}</span>
            </button>
            
            <div class="volume-control">
              <label>{{ 'room.volumeLevel' | translate }}</label>
              <input 
                type="range" 
                min="0" 
                [max]="hearingAccessibilityMode ? 200 : 100" 
                [(ngModel)]="volume" 
                (input)="updateVolume()"
              />
              <div class="volume-value">
                <span>0%</span>
                <span>{{ volume }}%</span>
                <span>{{ hearingAccessibilityMode ? '200%' : '100%' }}</span>
              </div>
            </div>
            
            <div class="volume-control">
              <label>{{ 'room.micLevel' | translate }}</label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                [(ngModel)]="micLevel" 
                (input)="updateMicLevel()"
              />
              <div class="volume-value">
                <span>0%</span>
                <span>{{ micLevel }}%</span>
                <span>100%</span>
              </div>
            </div>
            
            <button 
              class="control-button"
              [class.control-button-accessibility]="hearingAccessibilityMode"
              (click)="toggleHearingAccessibility()" 
              [style.background]="hearingAccessibilityMode ? '#9c27b0' : '#6c757d'"
            >
              <span class="button-icon">{{ hearingAccessibilityMode ? '👂' : '🔇' }}</span>
              <span class="button-text">{{ (hearingAccessibilityMode ? 'room.disableHearingAccessibility' : 'room.enableHearingAccessibility') | translate }}</span>
            </button>
            
            <button class="control-button control-button-leave" (click)="leaveRoom()">
              <span class="button-icon">🚪</span>
              <span class="button-text">{{ 'room.leaveRoom' | translate }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class RoomComponent implements OnInit, OnDestroy {
  participants: Participant[] = [];
  localStream?: MediaStream;
  localAudioTrack?: MediaStreamTrack;
  ws?: WebSocket;
  selfId = '';
  displayName = '';
  passphrase = '';
  isMuted = false;
  volume = 100;
  micLevel = 100;
  errorMessage = '';
  microphoneGranted = false;
  requestingAccess = false;
  hearingAccessibilityMode = false;
  pendingChallenge?: string;
  awaitingChallenge = false;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'reconnecting' = 'connecting';
  connectionQuality: 'good' | 'poor' | 'unstable' = 'good';
  
  private heartbeatInterval?: number;
  private reconnectTimeout?: number;
  reconnectAttempts = 0;
  maxReconnectAttempts = 10;
  private isLeaving = false;
  private messageQueue: any[] = [];
  private activityEvents = ['mousemove', 'keydown', 'click', 'touchstart'];
  private activityHandler = () => this.sendHeartbeat();
  private audioContext?: AudioContext;
  private gainNode?: GainNode;
  private mediaStreamSource?: MediaStreamAudioSourceNode;
  private connectionCheckInterval?: number;
  private lastHeartbeatTime = 0;

  private clientId: string = '';

  constructor(
    private router: Router,
    private translateService: TranslateService,
    private clientIdService: ClientIdService
  ) {
    this.clientId = this.clientIdService.getClientId();
  }

  translate(key: string, params?: any): string {
    if (params) {
      return this.translateService.instant(key, params);
    }
    return this.translateService.instant(key);
  }

  ngOnInit() {
    const state = history.state;
    this.displayName = state?.displayName || `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
    this.passphrase = state?.passphrase || '';
    this.isLeaving = false;
    
    this.connectWebSocket();
  }

  ngOnDestroy() {
    this.cleanup();
  }
  
  async requestMicrophoneAccess() {
    if (this.requestingAccess || this.microphoneGranted) return;
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('Cannot request microphone access: WebSocket not connected');
      return;
    }
    
    this.requestingAccess = true;
    this.errorMessage = '';
    
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.localAudioTrack = this.localStream.getAudioTracks()[0];
      this.microphoneGranted = true;
      this.requestingAccess = false;
      
      this.setupMicrophoneGain();
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (this.passphrase && this.awaitingChallenge) {
          await this.sendJoinResponse();
        } else {
          this.sendJoinMessage();
        }
        this.startHeartbeat();
        this.setupActivityTracking();
      }
    } catch (error: any) {
      this.requestingAccess = false;
      console.error('Error accessing microphone:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        this.errorMessage = this.translate('room.micPermissionDenied');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        this.errorMessage = this.translate('room.noMicFound');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        this.errorMessage = this.translate('room.micInUse');
      } else if (error.name === 'NotSupportedError' || error.name === 'TypeError') {
        this.errorMessage = this.translate('room.micUserInteraction');
      } else {
        this.errorMessage = this.translate('room.micUserInteraction');
      }
    }
  }
  
  connectWebSocket() {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      return;
    }

    let wsUrl: string;
    const clientIdParam = encodeURIComponent(this.clientId);
    if (window.location.port === '4200') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//localhost:8080/ws?clientId=${clientIdParam}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?clientId=${clientIdParam}`;
    }
    
    this.connectionStatus = this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      this.lastHeartbeatTime = Date.now();
      this.startConnectionMonitoring();
      
      this.flushMessageQueue();
      
      if (this.passphrase) {
        this.awaitingChallenge = true;
      } else if (this.microphoneGranted) {
        this.sendJoinMessage();
      } else {
        this.requestMicrophoneAccess();
      }
    };
    
    this.ws.onmessage = (event) => {
      this.lastHeartbeatTime = Date.now();
      
      if (event.data === 'ping') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('pong');
        }
        return;
      }
      
      try {
        const message = JSON.parse(event.data);
        this.handleSignalingMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.connectionQuality = 'poor';
    };
    
    this.ws.onclose = (event) => {
      console.log('WebSocket closed', event.code, event.reason);
      
      if (this.errorMessage === 'Disconnected due to inactivity.') {
        this.router.navigate(['/'], { state: { message: this.errorMessage } });
        return;
      }
      
      if (event.code === 1000 || event.code === 1001) {
        return;
      }
      
      this.connectionStatus = 'disconnected';
      this.attemptReconnect();
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.errorMessage = this.translate('room.failedToReconnect');
      this.connectionStatus = 'disconnected';
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = window.setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  startConnectionMonitoring() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = window.setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatTime;
      
      if (timeSinceLastHeartbeat > 90000) {
        this.connectionQuality = 'unstable';
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        }
      } else if (timeSinceLastHeartbeat > 60000) {
        this.connectionQuality = 'poor';
      } else {
        this.connectionQuality = 'good';
      }
    }, 10000);
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      this.ws.send(JSON.stringify(message));
    }
  }

  handleSignalingMessage(message: any) {
    switch (message.type) {
      case 'joined':
        this.selfId = message.selfId;
        this.connectionStatus = 'connected';
        if (this.microphoneGranted) {
          this.startHeartbeat();
          this.setupActivityTracking();
        }
        for (const p of message.participants || []) {
          this.createPeerConnection(p.id, p.name, p.muted || false, true);
        }
        break;
        
      case 'join-error':
        this.errorMessage = message.message || this.translate('room.failedToJoin');
        this.cleanup();
        setTimeout(() => {
          this.router.navigate(['/'], { state: { message: this.errorMessage } });
        }, 2000);
        break;
        
      case 'participant-joined':
        console.log(`Participant joined: ${message.name} (${message.id}), muted: ${message.muted || false}`);
        this.createPeerConnection(message.id, message.name, message.muted || false, false);
        break;
        
      case 'participant-left':
        console.log(`Participant left: ${message.id}, reason: ${message.reason || 'unknown'}`);
        this.removeParticipant(message.id);
        break;
        
      case 'participant-mute':
        console.log(`Participant mute state changed: ${message.id}, muted: ${message.muted}`);
        this.updateParticipantMute(message.id, message.muted);
        break;
        
      case 'offer':
        this.handleOffer(message.fromId, message.sdp);
        break;
        
      case 'answer':
        this.handleAnswer(message.fromId, message.sdp);
        break;
        
      case 'ice':
        this.handleIce(message.fromId, message.candidate);
        break;
        
      case 'kicked':
        let kickMessage = this.translate('room.disconnectedInactivity');
        if (message.reason === 'room_reset') {
          kickMessage = this.translate('room.disconnectedReset');
        }
        this.errorMessage = kickMessage;
        this.cleanup();
        setTimeout(() => {
          this.router.navigate(['/'], { state: { message: kickMessage } });
        }, 1000);
        break;
    }
  }

  async createPeerConnection(remoteId: string, remoteName: string, muted: boolean, shouldOffer: boolean) {
    if (!this.localStream) return;
    
    const existingParticipant = this.participants.find(p => p.id === remoteId);
    if (existingParticipant) {
      if (existingParticipant.peerConnection) {
        existingParticipant.peerConnection.close();
      }
      if (existingParticipant.audioElement) {
        existingParticipant.audioElement.remove();
      }
      const index = this.participants.findIndex(p => p.id === remoteId);
      if (index !== -1) {
        this.participants.splice(index, 1);
      }
    }
    
    const stunServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    
    const iceServers: RTCIceServer[] = stunServers;
    
    const pc = new RTCPeerConnection({ iceServers });
    
    this.localStream.getTracks().forEach(track => {
      pc.addTrack(track, this.localStream!);
    });
    
    const participant: Participant = {
      id: remoteId,
      name: remoteName,
      muted: muted
    };
    
    pc.ontrack = (event) => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioSource = audioContext.createMediaStreamSource(event.streams[0]);
        const gainNode = audioContext.createGain();
        const destination = audioContext.createMediaStreamDestination();
        
        audioSource.connect(gainNode);
        gainNode.connect(destination);
        
        const volumeLevel = this.volume / 100;
        gainNode.gain.value = volumeLevel;
        
        const audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        audioElement.srcObject = destination.stream;
        
        participant.audioElement = audioElement;
        participant.audioContext = audioContext;
        participant.gainNode = gainNode;
        participant.audioSource = audioSource;
        
        document.body.appendChild(audioElement);
      } catch (error) {
        console.warn('Could not setup Web Audio API, falling back to standard audio:', error);
        const audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        audioElement.srcObject = event.streams[0];
        const volumeLevel = Math.min(this.volume / 100, 1.0);
        audioElement.volume = volumeLevel;
        participant.audioElement = audioElement;
        document.body.appendChild(audioElement);
      }
    };
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendMessage({
          type: 'ice',
          toId: remoteId,
          candidate: JSON.stringify(event.candidate)
        });
      }
    };
    
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`Peer connection ${remoteId} state: ${state}`);
      
      if (state === 'failed') {
        this.retryPeerConnection(remoteId, remoteName, muted, shouldOffer);
      } else if (state === 'disconnected') {
        setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            this.retryPeerConnection(remoteId, remoteName, muted, shouldOffer);
          }
        }, 3000);
      } else if (state === 'closed') {
        this.removeParticipant(remoteId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log(`Peer connection ${remoteId} ICE state: ${iceState}`);
      
      if (iceState === 'failed') {
        this.retryPeerConnection(remoteId, remoteName, muted, shouldOffer);
      }
    };
    
    participant.peerConnection = pc;
    this.participants.push(participant);
    
    if (shouldOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendMessage({
        type: 'offer',
        toId: remoteId,
        sdp: JSON.stringify(offer)
      });
    }
  }

  async handleOffer(fromId: string, sdp: string) {
    const participant = this.participants.find(p => p.id === fromId);
    if (!participant || !participant.peerConnection) return;
    
    const offer = JSON.parse(sdp) as RTCSessionDescriptionInit;
    await participant.peerConnection.setRemoteDescription(offer);
    
    const answer = await participant.peerConnection.createAnswer();
    await participant.peerConnection.setLocalDescription(answer);
    
    this.sendMessage({
      type: 'answer',
      toId: fromId,
      sdp: JSON.stringify(answer)
    });
  }

  async handleAnswer(fromId: string, sdp: string) {
    const participant = this.participants.find(p => p.id === fromId);
    if (!participant || !participant.peerConnection) return;
    
    const answer = JSON.parse(sdp) as RTCSessionDescriptionInit;
    await participant.peerConnection.setRemoteDescription(answer);
  }

  async handleIce(fromId: string, candidate: string) {
    const participant = this.participants.find(p => p.id === fromId);
    if (!participant || !participant.peerConnection) return;
    
    try {
      const iceCandidate = JSON.parse(candidate) as RTCIceCandidateInit;
      await participant.peerConnection.addIceCandidate(iceCandidate);
    } catch (error) {
      console.warn(`Failed to add ICE candidate for ${fromId}, will retry:`, error);
      setTimeout(() => {
        this.handleIce(fromId, candidate);
      }, 1000);
    }
  }

  async retryPeerConnection(remoteId: string, remoteName: string, muted: boolean, shouldOffer: boolean, retryCount = 0) {
    if (retryCount >= 3) {
      console.log(`Max retries reached for ${remoteId}, removing participant`);
      this.removeParticipant(remoteId);
      return;
    }

    const existingParticipant = this.participants.find(p => p.id === remoteId);
    if (existingParticipant && existingParticipant.peerConnection) {
      const state = existingParticipant.peerConnection.connectionState;
      if (state === 'connected' || state === 'connecting') {
        return;
      }
      existingParticipant.peerConnection.close();
      this.removeParticipant(remoteId);
    }

    console.log(`Retrying peer connection to ${remoteName} (attempt ${retryCount + 1}/3)`);
    
    setTimeout(() => {
      this.createPeerConnection(remoteId, remoteName, muted, shouldOffer);
    }, 2000 * (retryCount + 1));
  }

  updateParticipantMute(id: string, muted: boolean) {
    const participant = this.participants.find(p => p.id === id);
    if (participant) {
      console.log(`Updating mute state for ${participant.name} (${id}): ${muted ? 'muted' : 'unmuted'}`);
      participant.muted = muted;
    } else {
      console.warn(`Participant ${id} not found for mute update`);
    }
  }

  removeParticipant(id: string) {
    const index = this.participants.findIndex(p => p.id === id);
    if (index === -1) return;
    
    const participant = this.participants[index];
    if (participant.peerConnection) {
      participant.peerConnection.close();
    }
    if (participant.gainNode) {
      try {
        participant.gainNode.disconnect();
      } catch (error) {
        console.warn('Error disconnecting gain node:', error);
      }
    }
    if (participant.audioSource) {
      try {
        participant.audioSource.disconnect();
      } catch (error) {
        console.warn('Error disconnecting audio source:', error);
      }
    }
    if (participant.audioContext && participant.audioContext.state !== 'closed') {
      try {
        participant.audioContext.close();
      } catch (error) {
        console.warn('Error closing audio context:', error);
      }
    }
    if (participant.audioElement) {
      participant.audioElement.remove();
    }
    this.participants.splice(index, 1);
  }

  toggleMute() {
    if (this.localAudioTrack) {
      this.isMuted = !this.isMuted;
      this.localAudioTrack.enabled = !this.isMuted;
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.selfId) {
        this.sendMessage({ 
          type: 'mute', 
          muted: this.isMuted 
        });
      }
    }
  }

  toggleHearingAccessibility() {
    this.hearingAccessibilityMode = !this.hearingAccessibilityMode;
  }

  setupMicrophoneGain() {
    if (!this.localStream) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.localStream);
      this.gainNode = this.audioContext.createGain();
      
      this.mediaStreamSource.connect(this.gainNode);
      
      const destination = this.audioContext.createMediaStreamDestination();
      this.gainNode.connect(destination);
      
      this.localStream.removeTrack(this.localAudioTrack!);
      this.localStream.addTrack(destination.stream.getAudioTracks()[0]);
      this.localAudioTrack = destination.stream.getAudioTracks()[0];
      
      this.updateMicLevel();
    } catch (error) {
      console.warn('Could not setup microphone gain, using default:', error);
    }
  }

  updateVolume() {
    const volumeLevel = this.volume / 100;
    this.participants.forEach(p => {
      if (p.gainNode) {
        p.gainNode.gain.value = volumeLevel;
      } else if (p.audioElement) {
        p.audioElement.volume = Math.min(volumeLevel, 1.0);
      }
    });
  }

  updateMicLevel() {
    if (this.gainNode) {
      this.gainNode.gain.value = this.micLevel / 100;
    }
  }

  async leaveRoom() {
    console.log('Leaving room...');
    this.isLeaving = true;
    
    if (this.localAudioTrack) {
      try {
        if (this.localAudioTrack.readyState !== 'ended') {
          this.localAudioTrack.stop();
        }
      } catch (error) {
        console.error('Error stopping audio track in leaveRoom:', error);
      }
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          if (track.readyState !== 'ended') {
            track.stop();
          }
        } catch (error) {
          console.error('Error stopping track in leaveRoom:', error);
        }
      });
    }
    
    await this.sendLeaveMessageAndWait();
    this.cleanup();
    console.log('Room left, all connections closed');
    this.router.navigate(['/']);
  }


  private sendLeaveMessage() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.selfId) {
      try {
        this.ws.send(JSON.stringify({ type: 'leave' }));
      } catch (error) {
        console.error('Error sending leave message:', error);
      }
    }
  }

  private async sendLeaveMessageAndWait(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.selfId) {
      try {
        this.ws.send(JSON.stringify({ type: 'leave' }));
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Error sending leave message:', error);
      }
    }
  }

  sendMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message:', error);
      }
    } else {
      this.messageQueue.push(message);
    }
  }

  async sendJoinMessage() {
    this.sendMessage({ 
      type: 'join', 
      name: this.displayName, 
      muted: this.isMuted 
    });
  }

  async sendJoinResponse() {
    if (!this.passphrase || !this.pendingChallenge) {
      return;
    }

    const passphraseHash = await this.sha256(this.passphrase);
    const response = await this.sha256(passphraseHash + this.pendingChallenge);
    
    this.sendMessage({
      type: 'join-response',
      name: this.displayName,
      muted: this.isMuted,
      response: response
    });
  }

  async sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  sendHeartbeat() {
    this.sendMessage({ type: 'heartbeat' });
  }

  startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  setupActivityTracking() {
    this.activityEvents.forEach(event => {
      document.addEventListener(event, this.activityHandler, { passive: true });
    });
  }

  cleanup() {
    console.log('Starting cleanup...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
      console.log('Heartbeat interval cleared');
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
      console.log('Reconnect timeout cleared');
    }
    
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = undefined;
      console.log('Connection check interval cleared');
    }
    
    this.activityEvents.forEach(event => {
      document.removeEventListener(event, this.activityHandler);
    });
    console.log('Activity event listeners removed');
    
    const participantCount = this.participants.length;
    this.participants.forEach((p, index) => {
      if (p.peerConnection) {
        try {
          p.peerConnection.close();
          console.log(`Closed peer connection ${index + 1}/${participantCount} (${p.name})`);
        } catch (error) {
          console.error('Error closing peer connection:', error);
        }
      }
      if (p.audioElement) {
        try {
          p.audioElement.pause();
          p.audioElement.srcObject = null;
          p.audioElement.remove();
          console.log(`Removed audio element ${index + 1}/${participantCount} (${p.name})`);
        } catch (error) {
          console.error('Error removing audio element:', error);
        }
      }
    });
    this.participants = [];
    this.messageQueue = [];
    console.log(`Cleaned up ${participantCount} participant(s)`);
    
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
        console.log('Gain node disconnected');
      } catch (error) {
        console.error('Error disconnecting gain node:', error);
      }
    }
    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect();
        console.log('Media stream source disconnected');
      } catch (error) {
        console.error('Error disconnecting media stream source:', error);
      }
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
        console.log('Audio context closed');
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
    }
    
    if (this.localStream) {
      const trackCount = this.localStream.getTracks().length;
      this.localStream.getTracks().forEach((track, index) => {
        try {
          track.stop();
          console.log(`Stopped local track ${index + 1}/${trackCount}`);
        } catch (error) {
          console.error('Error stopping track:', error);
        }
      });
      this.localStream = undefined;
      console.log('Local stream stopped and cleared');
    }
    
    if (this.localAudioTrack) {
      this.localAudioTrack = undefined;
    }
    
    if (this.ws) {
      const wsState = this.ws.readyState;
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.onopen = null;
        
        if (wsState === WebSocket.OPEN || wsState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'User left room');
          console.log(`WebSocket closed (was ${wsState === WebSocket.OPEN ? 'OPEN' : 'CONNECTING'})`);
        } else {
          console.log(`WebSocket already closed (state: ${wsState})`);
        }
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      } finally {
        this.ws = undefined;
      }
    }
    
    this.selfId = '';
    this.connectionStatus = 'disconnected';
    console.log('Cleanup completed');
  }
}
