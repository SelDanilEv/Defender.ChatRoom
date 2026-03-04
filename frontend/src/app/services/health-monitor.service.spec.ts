import { HealthMonitorService } from './health-monitor.service';
import { WebSocketService } from './websocket.service';
import { PeerConnectionService, Participant } from './peer-connection.service';
import { AudioService } from './audio.service';

describe('HealthMonitorService', () => {
  let webSocketMock: jasmine.SpyObj<WebSocketService>;
  let peerConnectionMock: jasmine.SpyObj<PeerConnectionService>;
  let audioMock: AudioService & {
    getLocalAudioTrack: jasmine.Spy;
    microphoneGranted$: () => boolean;
  };
  let service: HealthMonitorService;

  beforeEach(() => {
    webSocketMock = jasmine.createSpyObj<WebSocketService>('WebSocketService', ['getStatus']);
    webSocketMock.getStatus.and.returnValue('connected');

    peerConnectionMock = jasmine.createSpyObj<PeerConnectionService>('PeerConnectionService', [
      'getParticipants',
      'removeParticipant',
    ]);
    peerConnectionMock.getParticipants.and.returnValue([]);

    audioMock = {
      getLocalAudioTrack: jasmine.createSpy('getLocalAudioTrack'),
      microphoneGranted$: () => true,
    } as unknown as AudioService & {
      getLocalAudioTrack: jasmine.Spy;
      microphoneGranted$: () => boolean;
    };
    audioMock.getLocalAudioTrack.and.returnValue({ readyState: 'live' } as MediaStreamTrack);

    service = new HealthMonitorService(webSocketMock, peerConnectionMock, audioMock);
  });

  afterEach(() => {
    service.stopMonitoring();
  });

  it('startMonitoring and stopMonitoring toggle active state', () => {
    service.startMonitoring();
    expect(service.isActive()).toBeTrue();

    service.stopMonitoring();
    expect(service.isActive()).toBeFalse();
  });

  it('sets local issue when websocket disconnects', () => {
    webSocketMock.getStatus.and.returnValue('disconnected');

    service.startMonitoring();

    expect(service.localIssue()).toBe('room.disconnected');
  });

  it('sets local issue when microphone track is missing', () => {
    audioMock.getLocalAudioTrack.and.returnValue(undefined);

    service.startMonitoring();

    expect(service.localIssue()).toBe('room.micTrackEnded');
  });

  it('drops unhealthy peers from the participants list', () => {
    const participant: Participant = {
      id: 'remote-1',
      name: 'Alice',
      muted: false,
      peerConnection: {
        connectionState: 'failed',
        iceConnectionState: 'failed',
      } as unknown as RTCPeerConnection,
    };
    peerConnectionMock.getParticipants.and.returnValue([participant]);
    const audioForPeerChecks = {
      getLocalAudioTrack: jasmine.createSpy('getLocalAudioTrack'),
      microphoneGranted$: () => false,
    } as AudioService & {
      getLocalAudioTrack: jasmine.Spy;
      microphoneGranted$: () => boolean;
    };
    audioForPeerChecks.getLocalAudioTrack.and.returnValue(undefined);
    service = new HealthMonitorService(webSocketMock, peerConnectionMock, audioForPeerChecks);

    service.startMonitoring();

    expect(peerConnectionMock.removeParticipant).toHaveBeenCalledWith('remote-1');
  });
});
