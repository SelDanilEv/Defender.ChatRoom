import { TestBed } from '@angular/core/testing';

import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CryptoService);
  });

  it('returns 64-char hex hash', async () => {
    const hash = await service.sha256('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for same input', async () => {
    const first = await service.sha256('same-input');
    const second = await service.sha256('same-input');
    expect(first).toBe(second);
  });
});
