import { TestBed } from '@angular/core/testing';

import { PeerOrchestratorService } from './peer-orchestrator.service';
import { PeerConnectionService } from './peer-connection.service';
import { AudioService } from './audio.service';
import { WebSocketService } from './websocket.service';

describe('PeerOrchestratorService', () => {
  let service: PeerOrchestratorService;
  let peerConnectionMock: jasmine.SpyObj<PeerConnectionService>;
  let audioMock: AudioService & {
    getLocalStream: jasmine.Spy;
    getLocalAudioTrack: jasmine.Spy;
  };
  let wsMock: WebSocketService & { sendMessage: jasmine.Spy };

  beforeEach(() => {
    peerConnectionMock = jasmine.createSpyObj<PeerConnectionService>('PeerConnectionService', [
      'createPeerConnection',
      'getParticipants',
    ]);
    peerConnectionMock.createPeerConnection.and.resolveTo();
    peerConnectionMock.getParticipants.and.returnValue([]);

    audioMock = {
      getLocalStream: jasmine.createSpy('getLocalStream'),
      getLocalAudioTrack: jasmine.createSpy('getLocalAudioTrack'),
      volume$: (() => 80) as AudioService['volume$'],
      microphoneGranted$: (() => true) as AudioService['microphoneGranted$'],
    } as unknown as AudioService & {
      getLocalStream: jasmine.Spy;
      getLocalAudioTrack: jasmine.Spy;
    };

    wsMock = {
      sendMessage: jasmine.createSpy('sendMessage'),
      isConnected: (() => true) as WebSocketService['isConnected'],
    } as unknown as WebSocketService & { sendMessage: jasmine.Spy };

    TestBed.configureTestingModule({
      providers: [
        PeerOrchestratorService,
        { provide: PeerConnectionService, useValue: peerConnectionMock },
        { provide: AudioService, useValue: audioMock },
        { provide: WebSocketService, useValue: wsMock },
      ],
    });

    service = TestBed.inject(PeerOrchestratorService);
  });

  it('stores peer as pending when local stream is missing', async () => {
    audioMock.getLocalStream.and.returnValue(undefined);
    audioMock.getLocalAudioTrack.and.returnValue(undefined);

    const created = await service.createPeer('remote-1', 'Alice', false, true);

    expect(created).toBeFalse();
    expect(peerConnectionMock.createPeerConnection).not.toHaveBeenCalled();
  });

  it('creates peer when local stream and track are available', async () => {
    const stream = jasmine.createSpyObj<MediaStream>('MediaStream', ['getAudioTracks']);
    const track = { readyState: 'live' } as MediaStreamTrack;
    audioMock.getLocalStream.and.returnValue(stream);
    audioMock.getLocalAudioTrack.and.returnValue(track);
    peerConnectionMock.getParticipants.and.returnValue([{ id: 'remote-1' } as any]);

    const created = await service.createPeer('remote-1', 'Alice', false, true);

    expect(created).toBeTrue();
    expect(peerConnectionMock.createPeerConnection).toHaveBeenCalled();
  });

  it('processes pending peers once microphone and websocket are ready', async () => {
    audioMock.getLocalStream.and.returnValue(undefined);
    audioMock.getLocalAudioTrack.and.returnValue(undefined);
    await service.createPeer('remote-1', 'Alice', false, true);

    const stream = jasmine.createSpyObj<MediaStream>('MediaStream', ['getAudioTracks']);
    const track = { readyState: 'live' } as MediaStreamTrack;
    audioMock.getLocalStream.and.returnValue(stream);
    audioMock.getLocalAudioTrack.and.returnValue(track);

    service.processPendingPeers();

    expect(peerConnectionMock.createPeerConnection).toHaveBeenCalled();
  });

  it('processes multiple pending peers for multi-user room', async () => {
    audioMock.getLocalStream.and.returnValue(undefined);
    audioMock.getLocalAudioTrack.and.returnValue(undefined);

    await service.createPeer('remote-1', 'Alice', false, true);
    await service.createPeer('remote-2', 'Bob', true, false);
    await service.createPeer('remote-3', 'Carol', false, false);

    const stream = jasmine.createSpyObj<MediaStream>('MediaStream', ['getAudioTracks']);
    const track = { readyState: 'live' } as MediaStreamTrack;
    audioMock.getLocalStream.and.returnValue(stream);
    audioMock.getLocalAudioTrack.and.returnValue(track);
    peerConnectionMock.getParticipants.and.returnValue([
      { id: 'remote-1' } as any,
      { id: 'remote-2' } as any,
      { id: 'remote-3' } as any,
    ]);

    service.processPendingPeers();

    expect(peerConnectionMock.createPeerConnection).toHaveBeenCalledTimes(3);
    expect(peerConnectionMock.createPeerConnection).toHaveBeenCalledWith(
      'remote-1',
      'Alice',
      false,
      true,
      stream,
      80,
      jasmine.any(Function)
    );
    expect(peerConnectionMock.createPeerConnection).toHaveBeenCalledWith(
      'remote-2',
      'Bob',
      true,
      false,
      stream,
      80,
      jasmine.any(Function)
    );
    expect(peerConnectionMock.createPeerConnection).toHaveBeenCalledWith(
      'remote-3',
      'Carol',
      false,
      false,
      stream,
      80,
      jasmine.any(Function)
    );
  });
});
