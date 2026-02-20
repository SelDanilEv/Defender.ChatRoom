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

});
