import { TestBed } from '@angular/core/testing';
import { RoomStateService } from './room-state.service';

describe('RoomStateService', () => {
  let service: RoomStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RoomStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('initialize sets displayName and passphrase', () => {
    service.initialize('Alice', 'secret');
    expect(service.getDisplayName()).toBe('Alice');
    expect(service.getPassphrase()).toBe('secret');
  });

  it('initialize uses guest name when displayName empty', () => {
    service.initialize('', '');
    const name = service.getDisplayName();
    expect(name).toMatch(/^Guest-\d{4}$/);
  });

  it('setSelfId and getSelfId roundtrip', () => {
    service.setSelfId('conn-123');
    expect(service.getSelfId()).toBe('conn-123');
  });

  it('setPendingChallenge and getPendingChallenge roundtrip', () => {
    service.setPendingChallenge('abc');
    expect(service.getPendingChallenge()).toBe('abc');
  });

  it('setAwaitingChallenge and getAwaitingChallenge roundtrip', () => {
    service.setAwaitingChallenge(true);
    expect(service.getAwaitingChallenge()).toBe(true);
  });

  it('setErrorMessage and getErrorMessage roundtrip', () => {
    service.setErrorMessage('error.key');
    expect(service.getErrorMessage()).toBe('error.key');
  });

  it('sha256 returns hex string', async () => {
    const hash = await service.sha256('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sha256 is deterministic', async () => {
    const a = await service.sha256('same');
    const b = await service.sha256('same');
    expect(a).toBe(b);
  });
});
