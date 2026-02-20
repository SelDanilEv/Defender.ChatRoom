import { TestBed } from '@angular/core/testing';

import { AudioService } from './audio.service';

describe('AudioService', () => {
  let service: AudioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioService);
  });

  afterEach(() => {
    service.cleanup();
  });

  it('toggles mute by flipping local track enabled flag', () => {
    const track = { enabled: true, readyState: 'live' } as MediaStreamTrack;
    (service as any).localAudioTrack = track;

    service.toggleMute();
    expect(service.getIsMuted()).toBeTrue();
    expect(track.enabled).toBeFalse();

    service.toggleMute();
    expect(service.getIsMuted()).toBeFalse();
    expect(track.enabled).toBeTrue();
  });

  it('applies participant volume updates with 0..1 clamp', () => {
    const quietAudio = { volume: 0 } as HTMLAudioElement;
    const loudAudio = { volume: 0 } as HTMLAudioElement;
    service.setVolume(150);

    service.updateVolumeForParticipants([
      { audioElement: quietAudio },
      { audioElement: loudAudio },
      {},
    ]);

    expect(quietAudio.volume).toBe(1);
    expect(loudAudio.volume).toBe(1);
  });
});
