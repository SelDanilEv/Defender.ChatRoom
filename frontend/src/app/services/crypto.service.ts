import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CryptoService {
  async sha256(message: string): Promise<string> {
    const buffer = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
