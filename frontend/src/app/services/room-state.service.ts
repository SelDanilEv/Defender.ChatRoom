import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class RoomStateService {
  private readonly displayName = signal('');
  private readonly passphrase = signal('');
  private readonly selfId = signal('');
  private readonly pendingChallenge = signal<string | undefined>(undefined);
  private readonly awaitingChallenge = signal(false);
  private readonly isLeaving = signal(false);
  private readonly errorMessage = signal('');

  readonly displayName$ = this.displayName.asReadonly();
  readonly errorMessage$ = this.errorMessage.asReadonly();

  constructor() {}

  initialize(displayName: string, passphrase: string): void {
    this.displayName.set(displayName || `Guest-${Math.floor(Math.random() * 9000) + 1000}`);
    this.passphrase.set(passphrase || '');
    this.isLeaving.set(false);
  }

  getDisplayName(): string {
    return this.displayName();
  }

  getPassphrase(): string {
    return this.passphrase();
  }

  setSelfId(id: string): void {
    this.selfId.set(id);
  }

  getSelfId(): string {
    return this.selfId();
  }

  setPendingChallenge(challenge: string): void {
    this.pendingChallenge.set(challenge);
  }

  getPendingChallenge(): string | undefined {
    return this.pendingChallenge();
  }

  setAwaitingChallenge(awaiting: boolean): void {
    this.awaitingChallenge.set(awaiting);
  }

  getAwaitingChallenge(): boolean {
    return this.awaitingChallenge();
  }

  setIsLeaving(leaving: boolean): void {
    this.isLeaving.set(leaving);
  }

  getIsLeaving(): boolean {
    return this.isLeaving();
  }

  setErrorMessage(message: string): void {
    this.errorMessage.set(message);
  }

  getErrorMessage(): string {
    return this.errorMessage();
  }

  async sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
