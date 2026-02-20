import { Injectable, inject } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { WebSocketService } from "./websocket.service";
import { PeerConnectionService } from "./peer-connection.service";
import { RoomStateService } from "./room-state.service";
import { AudioService } from "./audio.service";
import { CryptoService } from "./crypto.service";
import type { SignalingMessage, ParticipantInfo } from "../models/signaling";

export type SignalingOutcome =
  | { action: "none" }
  | { action: "navigate"; path: string; state?: unknown; delayMs?: number }
  | { action: "toast"; message: string; duration: number }
  | { action: "cleanup" };

export interface SignalingHandlerDeps {
  onCreatePeer: (
    remoteId: string,
    remoteName: string,
    muted: boolean,
    shouldOffer: boolean,
  ) => Promise<unknown>;
  onCleanup: () => void;
}

@Injectable({ providedIn: "root" })
export class SignalingHandlerService {
  private readonly translate = inject(TranslateService);
  private readonly ws = inject(WebSocketService);
  private readonly peerConnection = inject(PeerConnectionService);
  private readonly roomState = inject(RoomStateService);
  private readonly audio = inject(AudioService);
  private readonly crypto = inject(CryptoService);
  private messageSequence = 0;

  async handleMessage(
    message: SignalingMessage,
    deps: SignalingHandlerDeps,
  ): Promise<SignalingOutcome> {
    const sequence = ++this.messageSequence;
    this.debug("incoming-message", { sequence, type: message.type });

    switch (message.type) {
      case "joined":
        return this.handleJoined(message, deps);
      case "join-error":
        return this.handleJoinError(message, deps);
      case "participant-joined":
        this.handleParticipantJoined(message, deps);
        return { action: "none" };
      case "participant-left":
        return this.handleParticipantLeft(message);
      case "participant-mute":
        this.handleParticipantMute(message);
        return { action: "none" };
      case "offer":
        await this.handleOffer(message, deps);
        return { action: "none" };
      case "answer":
        await this.handleAnswer(message);
        return { action: "none" };
      case "ice":
        await this.handleIce(message);
        return { action: "none" };
      case "kicked":
        return this.handleKicked(message, deps);
      case "challenge":
        this.handleChallenge(message);
        return { action: "none" };
      default:
        this.debug("unknown-message-type", { sequence, type: message.type });
        return { action: "none" };
    }
  }

  private handleJoined(
    message: SignalingMessage,
    deps: SignalingHandlerDeps,
  ): SignalingOutcome {
    const selfId = this.getString(message, "selfId");
    this.roomState.setSelfId(selfId);
    this.debug("joined-received", { selfId });

    if (this.audio.microphoneGranted$()) {
      this.ws.startHeartbeat();
      this.ws.setupActivityTracking();
    }

    const participants = this.getParticipants(message);
    const selfIdFinal = this.roomState.getSelfId();
    let createdPeers = 0;
    for (const p of participants) {
      if (p.id === selfId) continue;
      if (!this.hasPeer(p.id)) {
        void deps.onCreatePeer(
          p.id,
          p.name,
          p.muted ?? false,
          selfIdFinal < p.id,
        );
        createdPeers++;
      }
    }
    this.debug("joined-processed", {
      selfId: selfIdFinal,
      participants: participants.length,
      createdPeers,
    });

    return { action: "none" };
  }

  private handleJoinError(
    message: SignalingMessage,
    deps: SignalingHandlerDeps,
  ): SignalingOutcome {
    const errorMsg = this.getString(
      message,
      "message",
      this.translate.instant("room.failedToJoin"),
    );
    this.debug("join-error", { errorMsg });
    deps.onCleanup();
    return {
      action: "navigate",
      path: "/",
      state: { message: errorMsg },
      delayMs: 2000,
    };
  }

  private handleParticipantJoined(
    message: SignalingMessage,
    deps: SignalingHandlerDeps,
  ): void {
    const id = this.getString(message, "id");
    if (id === this.roomState.getSelfId()) {
      this.debug("participant-joined-ignored-self", { id });
      return;
    }
    if (this.hasPeer(id)) {
      this.debug("participant-joined-ignored-existing-peer", { id });
      return;
    }

    const selfId = this.roomState.getSelfId();
    const name = this.getString(message, "name", "Guest");
    const muted = this.getBoolean(message, "muted");
    void deps.onCreatePeer(id, name, muted, selfId < id);
    this.debug("participant-joined-create-peer", {
      id,
      name,
      muted,
      shouldOffer: selfId < id,
    });
  }

  private handleParticipantLeft(message: SignalingMessage): SignalingOutcome {
    const id = this.getString(message, "id");
    const reason = this.getString(message, "reason");
    const participant = this.peerConnection
      .getParticipants()
      .find((p) => p.id === id);
    const name = participant?.name ?? "Guest";
    this.peerConnection.removeParticipant(id);

    const key =
      reason === "reconnected"
        ? "room.participantLeftReconnected"
        : reason === "disconnect"
          ? "room.participantLeftDisconnected"
          : "room.participantLeft";
    this.debug("participant-left", {
      id,
      reason,
      resolvedName: name,
      translationKey: key,
    });
    return {
      action: "toast",
      message: this.translate.instant(key, { name }),
      duration: 4000,
    };
  }

  private handleParticipantMute(message: SignalingMessage): void {
    const id = this.getString(message, "id");
    const muted = this.getBoolean(message, "muted");
    this.peerConnection.updateParticipantMute(id, muted);
    this.debug("participant-mute", { id, muted });
  }

  private async handleOffer(
    message: SignalingMessage,
    deps: SignalingHandlerDeps,
  ): Promise<void> {
    const fromId = this.getString(message, "fromId");
    if (this.shouldIgnoreFromId(fromId, "offer")) return;

    if (!this.hasPeer(fromId)) {
      await deps.onCreatePeer(
        fromId,
        this.getString(message, "name", "Guest"),
        this.getBoolean(message, "muted"),
        false,
      );
      this.debug("offer-create-peer-attempted", { fromId });
    }

    const participant = this.peerConnection
      .getParticipants()
      .find((p) => p.id === fromId);
    if (
      participant?.peerConnection &&
      participant.peerConnection.signalingState !== "closed"
    ) {
      await this.peerConnection.handleOffer(
        fromId,
        this.getString(message, "sdp"),
        (msg) => this.ws.sendMessage(msg),
      );
      this.debug("offer-forwarded", { fromId });
    } else {
      this.debug("offer-skipped-no-open-peer", { fromId });
    }
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    const fromId = this.getString(message, "fromId");
    if (this.shouldIgnoreFromId(fromId, "answer")) return;

    await this.peerConnection.handleAnswer(
      fromId,
      this.getString(message, "sdp"),
    );
    this.debug("answer-forwarded", { fromId });
  }

  private async handleIce(message: SignalingMessage): Promise<void> {
    const fromId = this.getString(message, "fromId");
    if (this.shouldIgnoreFromId(fromId, "ice")) return;

    await this.peerConnection.handleIce(
      fromId,
      this.getString(message, "candidate"),
    );
    this.debug("ice-forwarded", { fromId });
  }

  private handleKicked(
    message: SignalingMessage,
    deps: SignalingHandlerDeps,
  ): SignalingOutcome {
    const reason = this.getString(message, "reason");
    const key =
      reason === "room_reset"
        ? "room.disconnectedReset"
        : "room.disconnectedInactivity";
    const kickMessage = this.translate.instant(key);
    this.debug("kicked", { reason, translationKey: key });
    deps.onCleanup();
    return {
      action: "navigate",
      path: "/",
      state: { message: kickMessage },
      delayMs: 1000,
    };
  }

  private handleChallenge(message: SignalingMessage): void {
    const challenge = this.getString(message, "challenge");
    this.roomState.setPendingChallenge(challenge);
    this.roomState.setAwaitingChallenge(true);
    this.debug("challenge-received", { hasChallenge: Boolean(challenge) });
  }

  private hasPeer(id: string): boolean {
    return this.peerConnection.getParticipants().some((p) => p.id === id);
  }

  sendJoin(displayName: string, muted: boolean): void {
    this.ws.sendMessage({ type: "join", name: displayName, muted });
  }

  async sendJoinResponse(
    displayName: string,
    muted: boolean,
    passphrase: string,
    challenge: string,
  ): Promise<void> {
    const passphraseHash = await this.crypto.sha256(passphrase);
    const response = await this.crypto.sha256(passphraseHash + challenge);
    this.ws.sendMessage({
      type: "join-response",
      name: displayName,
      muted,
      response,
    });
  }

  private getString(
    message: SignalingMessage,
    key: string,
    fallback = "",
  ): string {
    return String(message[key] ?? fallback);
  }

  private getBoolean(message: SignalingMessage, key: string): boolean {
    return Boolean(message[key]);
  }

  private getParticipants(message: SignalingMessage): ParticipantInfo[] {
    const participants = message["participants"];
    return Array.isArray(participants)
      ? (participants as ParticipantInfo[])
      : [];
  }

  private shouldIgnoreFromId(fromId: string, messageType: string): boolean {
    const selfId = this.roomState.getSelfId();
    if (!fromId) {
      this.debug("message-ignored-empty-fromId", { messageType });
      return true;
    }

    if (fromId === selfId) {
      this.debug("message-ignored-self", { messageType, fromId });
      return true;
    }

    return false;
  }

  private debug(event: string, details: Record<string, unknown>): void {
    if (!this.isDebugEnabled()) return;
    console.debug("[SignalingHandlerService]", event, details);
  }

  private isDebugEnabled(): boolean {
    const debugFlag = (window as unknown as { __CHATROOM_DEBUG__?: boolean })
      .__CHATROOM_DEBUG__;
    if (debugFlag) return true;

    try {
      return window.localStorage.getItem("chatroom.debug") === "1";
    } catch {
      return false;
    }
  }
}
