import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { SignalingHandlerService } from './signaling-handler.service';
import { WebSocketService } from './websocket.service';
import { PeerConnectionService } from './peer-connection.service';
import { RoomStateService } from './room-state.service';
import { AudioService } from './audio.service';
import { CryptoService } from './crypto.service';

describe('SignalingHandlerService', () => {
  let service: SignalingHandlerService;
  let wsMock: jasmine.SpyObj<WebSocketService>;
  let peerConnectionMock: jasmine.SpyObj<PeerConnectionService>;
  let roomStateMock: jasmine.SpyObj<RoomStateService>;
  let audioMock: AudioService;

  beforeEach(() => {
    wsMock = jasmine.createSpyObj<WebSocketService>('WebSocketService', [
      'sendMessage',
      'startHeartbeat',
      'setupActivityTracking',
    ]);

    peerConnectionMock = jasmine.createSpyObj<PeerConnectionService>('PeerConnectionService', [
      'getParticipants',
      'removeParticipant',
      'updateParticipantMute',
      'handleOffer',
      'handleAnswer',
      'handleIce',
    ]);
    peerConnectionMock.getParticipants.and.returnValue([]);
    peerConnectionMock.handleOffer.and.resolveTo();
    peerConnectionMock.handleAnswer.and.resolveTo();
    peerConnectionMock.handleIce.and.resolveTo();

    roomStateMock = jasmine.createSpyObj<RoomStateService>('RoomStateService', [
      'setSelfId',
      'getSelfId',
      'setPendingChallenge',
      'setAwaitingChallenge',
    ]);
    roomStateMock.getSelfId.and.returnValue('self');

    audioMock = {
      microphoneGranted$: (() => true) as AudioService['microphoneGranted$'],
    } as AudioService;

    const cryptoMock = jasmine.createSpyObj<CryptoService>('CryptoService', ['sha256']);
    cryptoMock.sha256.and.resolveTo('hash');

    TestBed.configureTestingModule({
      providers: [
        SignalingHandlerService,
        { provide: TranslateService, useValue: { instant: (value: string) => value } },
        { provide: WebSocketService, useValue: wsMock },
        { provide: PeerConnectionService, useValue: peerConnectionMock },
        { provide: RoomStateService, useValue: roomStateMock },
        { provide: AudioService, useValue: audioMock },
        { provide: CryptoService, useValue: cryptoMock },
      ],
    });

    service = TestBed.inject(SignalingHandlerService);
  });

  it('creates peers for other participants when joined arrives', async () => {
    const onCreatePeer = jasmine.createSpy('onCreatePeer').and.resolveTo(true);

    await service.handleMessage(
      {
        type: 'joined',
        selfId: 'self',
        participants: [
          { id: 'self', name: 'Me', muted: false },
          { id: 'remote-1', name: 'Alice', muted: false },
          { id: 'remote-2', name: 'Bob', muted: true },
        ],
      },
      { onCreatePeer, onCleanup: () => {} }
    );

    expect(onCreatePeer).toHaveBeenCalledTimes(2);
    expect(onCreatePeer).toHaveBeenCalledWith('remote-1', 'Alice', false, false);
    expect(onCreatePeer).toHaveBeenCalledWith('remote-2', 'Bob', true, false);
  });

  it('forwards ice to PeerConnectionService even when peer is not created yet', async () => {
    peerConnectionMock.getParticipants.and.returnValue([]);

    await service.handleMessage(
      { type: 'ice', fromId: 'remote-1', candidate: '{"candidate":"abc"}' },
      { onCreatePeer: async () => true, onCleanup: () => {} }
    );

    expect(peerConnectionMock.handleIce).toHaveBeenCalledWith('remote-1', '{"candidate":"abc"}');
  });

  it('forwards answer to PeerConnectionService even when peer is not created yet', async () => {
    peerConnectionMock.getParticipants.and.returnValue([]);

    await service.handleMessage(
      { type: 'answer', fromId: 'remote-1', sdp: '{"type":"answer","sdp":"v=0"}' },
      { onCreatePeer: async () => true, onCleanup: () => {} }
    );

    expect(peerConnectionMock.handleAnswer).toHaveBeenCalledWith(
      'remote-1',
      '{"type":"answer","sdp":"v=0"}'
    );
  });

  it('handles multi-user joined payload and only creates missing peers', async () => {
    const knownParticipants = [{ id: 'remote-2', peerConnection: {} as RTCPeerConnection }] as any[];
    peerConnectionMock.getParticipants.and.callFake(() => knownParticipants);
    const onCreatePeer = jasmine.createSpy('onCreatePeer').and.resolveTo(true);

    await service.handleMessage(
      {
        type: 'joined',
        selfId: 'self',
        participants: [
          { id: 'self', name: 'Me', muted: false },
          { id: 'remote-1', name: 'Alice', muted: false },
          { id: 'remote-2', name: 'Bob', muted: false },
          { id: 'remote-3', name: 'Carol', muted: true },
        ],
      },
      { onCreatePeer, onCleanup: () => {} }
    );

    expect(onCreatePeer).toHaveBeenCalledTimes(2);
    expect(onCreatePeer).toHaveBeenCalledWith('remote-1', 'Alice', false, false);
    expect(onCreatePeer).toHaveBeenCalledWith('remote-3', 'Carol', true, false);
  });

  it('processes signaling from multiple users in sequence', async () => {
    const onCreatePeer = jasmine.createSpy('onCreatePeer').and.resolveTo(true);
    peerConnectionMock.getParticipants.and.callFake(() =>
      [
        { id: 'remote-1', peerConnection: { signalingState: 'stable' } as RTCPeerConnection },
        { id: 'remote-2', peerConnection: { signalingState: 'stable' } as RTCPeerConnection },
      ] as any[]
    );

    await service.handleMessage(
      { type: 'offer', fromId: 'remote-1', name: 'Alice', muted: false, sdp: '{"type":"offer","sdp":"v=0"}' },
      { onCreatePeer, onCleanup: () => {} }
    );
    await service.handleMessage(
      { type: 'offer', fromId: 'remote-2', name: 'Bob', muted: true, sdp: '{"type":"offer","sdp":"v=0"}' },
      { onCreatePeer, onCleanup: () => {} }
    );
    await service.handleMessage(
      { type: 'answer', fromId: 'remote-1', sdp: '{"type":"answer","sdp":"v=0"}' },
      { onCreatePeer, onCleanup: () => {} }
    );
    await service.handleMessage(
      { type: 'ice', fromId: 'remote-2', candidate: '{"candidate":"abc"}' },
      { onCreatePeer, onCleanup: () => {} }
    );

    expect(onCreatePeer).not.toHaveBeenCalled();
    expect(peerConnectionMock.handleOffer).toHaveBeenCalledTimes(2);
    expect(peerConnectionMock.handleAnswer).toHaveBeenCalledWith(
      'remote-1',
      '{"type":"answer","sdp":"v=0"}'
    );
    expect(peerConnectionMock.handleIce).toHaveBeenCalledWith('remote-2', '{"candidate":"abc"}');
  });
});
