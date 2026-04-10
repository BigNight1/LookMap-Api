/**
 * Location domain entities — pure TypeScript, no framework dependencies.
 */

export interface LocationEntity {
  id: string;
  userId: string;
  groupId: string;
  /** Denormalized from user — avoids joins on every broadcast */
  nickname: string;
  color: string;
  lat: number;
  lng: number;
  accuracy: number;
  battery: number;
  isOnline: boolean;
  timestamp: Date;
}

/** Shape emitted to all group members via WebSocket */
export interface LocationBroadcast {
  userId: string;
  nickname: string;
  color: string;
  lat: number;
  lng: number;
  battery: number;
  isOnline: boolean;
  timestamp: Date;
}
