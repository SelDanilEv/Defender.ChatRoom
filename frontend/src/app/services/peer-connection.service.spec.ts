import { TestBed } from '@angular/core/testing';

import { PeerConnectionService, Participant } from './peer-connection.service';

describe('PeerConnectionService', () => {
  let service: PeerConnectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PeerConnectionService);
  });

  afterEach(() => {
    service.cleanup();
  });

  it('updates volume for participant audio elements', () => {
    const audio = document.createElement('audio');
    const participant: Participant = { id: 'remote-1', name: 'Alice', muted: false, audioElement: audio };
    (service as any).participants.set([participant]);

    service.updateVolume(60);

    expect(audio.volume).toBeCloseTo(0.6, 3);
  });

  it('forwards parsed ice candidate to peer connection when participant exists', async () => {
    const addIceCandidate = jasmine.createSpy('addIceCandidate').and.resolveTo();
    const participant: Participant = {
      id: 'remote-1',
      name: 'Alice',
      muted: false,
      peerConnection: {
        signalingState: 'stable',
        connectionState: 'connected',
        addIceCandidate,
        close: jasmine.createSpy('close'),
      } as unknown as RTCPeerConnection,
    };
    (service as any).participants.set([participant]);

    await service.handleIce('remote-1', '{"candidate":"abc","sdpMid":"0","sdpMLineIndex":0}');

    expect(addIceCandidate).toHaveBeenCalled();
  });

  it('ignores malformed ice payloads', async () => {
    const addIceCandidate = jasmine.createSpy('addIceCandidate').and.resolveTo();
    const participant: Participant = {
      id: 'remote-1',
      name: 'Alice',
      muted: false,
      peerConnection: {
        signalingState: 'stable',
        connectionState: 'connected',
        addIceCandidate,
        close: jasmine.createSpy('close'),
      } as unknown as RTCPeerConnection,
    };
    (service as any).participants.set([participant]);

    await service.handleIce('remote-1', 'not-json');

    expect(addIceCandidate).not.toHaveBeenCalled();
  });
});
