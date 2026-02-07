import { TestBed } from '@angular/core/testing';
import { ClientIdService } from './client-id.service';

describe('ClientIdService', () => {
  let service: ClientIdService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClientIdService);
    const key = 'chatroom_client_id';
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  });

  afterEach(() => {
    const key = 'chatroom_client_id';
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getClientId returns a UUID-like string', () => {
    const id = service.getClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('getClientId returns same id when called twice', () => {
    const id1 = service.getClientId();
    const id2 = service.getClientId();
    expect(id1).toBe(id2);
  });
});
