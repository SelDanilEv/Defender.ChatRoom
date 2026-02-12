export type SignalingMessage = Record<string, unknown> & { type: string };

export interface ParticipantInfo {
  id: string;
  name: string;
  muted: boolean;
}
