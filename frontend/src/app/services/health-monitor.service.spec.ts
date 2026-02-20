import { HealthMonitorService } from './health-monitor.service';
import { WebSocketService } from './websocket.service';
import { PeerConnectionService } from './peer-connection.service';
import { AudioService } from './audio.service';
import { RoomStateService } from './room-state.service';
import { ClientIdService } from './client-id.service';

describe('HealthMonitorService', () => {
  let webSocketMock: WebSocketService & {
    getStatus: jasmine.Spy;
    connect: jasmine.Spy;
    sendMessage: jasmine.Spy;
    isConnected: () => boolean;
  };
  let peerConnectionMock: jasmine.SpyObj<PeerConnectionService>;
  let audioMock: AudioService & {
    getLocalAudioTrack: jasmine.Spy;
    getAudioContextState: jasmine.Spy;
    requestMicrophoneAccess: jasmine.Spy;
    getLocalStream: jasmine.Spy;
    resumeAudioContext: jasmine.Spy;
    microphoneGranted$: () => boolean;
    volume$: () => number;
  };
  let roomStateMock: jasmine.SpyObj<RoomStateService>;
  let clientIdMock: jasmine.SpyObj<ClientIdService>;
  let service: HealthMonitorService;

  beforeEach(() => {
    webSocketMock = {
      getStatus: jasmine.createSpy('getStatus').and.returnValue('connected'),
      connect: jasmine.createSpy('connect'),
      sendMessage: jasmine.createSpy('sendMessage'),
      isConnected: () => true,
    } as unknown as WebSocketService & {
      getStatus: jasmine.Spy;
      connect: jasmine.Spy;
      sendMessage: jasmine.Spy;
      isConnected: () => boolean;
    };

    peerConnectionMock = jasmine.createSpyObj<PeerConnectionService>('PeerConnectionService', [
      'getParticipants',
      'removeParticipant',
      'createPeerConnection',
      'resumeRemoteAudio',
    ]);
    peerConnectionMock.getParticipants.and.returnValue([]);
    peerConnectionMock.resumeRemoteAudio.and.resolveTo();
    peerConnectionMock.createPeerConnection.and.resolveTo();

    audioMock = {
      getLocalAudioTrack: jasmine.createSpy('getLocalAudioTrack'),
      getAudioContextState: jasmine.createSpy('getAudioContextState'),
      requestMicrophoneAccess: jasmine.createSpy('requestMicrophoneAccess'),
      getLocalStream: jasmine.createSpy('getLocalStream'),
      resumeAudioContext: jasmine.createSpy('resumeAudioContext'),
      microphoneGranted$: () => true,
      volume$: () => 100,
    } as unknown as AudioService & {
      getLocalAudioTrack: jasmine.Spy;
      getAudioContextState: jasmine.Spy;
      requestMicrophoneAccess: jasmine.Spy;
      getLocalStream: jasmine.Spy;
      resumeAudioContext: jasmine.Spy;
      microphoneGranted$: () => boolean;
      volume$: () => number;
    };
    audioMock.getLocalAudioTrack.and.returnValue({ readyState: 'live', enabled: true } as MediaStreamTrack);
    audioMock.getAudioContextState.and.returnValue('running');
    audioMock.resumeAudioContext.and.resolveTo();

    roomStateMock = jasmine.createSpyObj<RoomStateService>('RoomStateService', ['getSelfId']);
    roomStateMock.getSelfId.and.returnValue('self-1');

    clientIdMock = jasmine.createSpyObj<ClientIdService>('ClientIdService', ['getClientId']);
    clientIdMock.getClientId.and.returnValue('client-1');

    service = new HealthMonitorService(
      webSocketMock,
      peerConnectionMock,
      audioMock,
      roomStateMock,
      clientIdMock
    );
  });

  it('reports healthy when no issues are present', () => {
    expect(service.getHealthReport()).toBe('All systems healthy');
  });

  it('startMonitoring and stopMonitoring toggle active state', () => {
    service.startMonitoring();
    expect(service.isActive()).toBeTrue();

    service.stopMonitoring();
    expect(service.isActive()).toBeFalse();
  });

  it('forceRecovery reconnects websocket when disconnected', () => {
    webSocketMock.getStatus.and.returnValue('disconnected');

    service.forceRecovery();

    expect(webSocketMock.connect).toHaveBeenCalledWith('client-1');
  });
});
