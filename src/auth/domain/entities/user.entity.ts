/**
 * Persisted driving / navigation target per group (each user may have one per group).
 * Mirrors the client + socket route payload so the app can hydrate after restart.
 */
export interface ActiveRouteEntry {
  groupId: string;
  destName: string;
  destLat: number;
  destLng: number;
  geojson: object | null;
  duration: string;
  distance: string;
  mode: string;
  updatedAt: Date;
}

/**
 * User entity — Domain layer
 * Pure TypeScript: no NestJS decorators, no Mongoose, no framework dependencies.
 */
export interface UserEntity {
  id: string;
  name: string;
  email: string;
  /** Display handle — always mapped from DB in AuthRepository.toEntity (findById, etc.) */
  nickname: string;
  /** Google OAuth `sub`; null if account is email/password only */
  googleId: string | null;
  /** Profile picture URL */
  avatar: string | null;
  /** Null for Google-only accounts */
  password: string | null;
  /** Hex color assigned to this user's marker on the map (e.g. "#FF5733") */
  color: string;
  /** Marker pin size on the map UI (matches UserSchema default). */
  pinSize: string;
  /**
   * IDs of all groups the user belongs to.
   * Free plan: max 2. Empty array means not in any group.
   */
  groupIds: string[];
  isOnline: boolean;
  lastLocation: { lat: number; lng: number; timestamp: Date } | null;
  /** Battery level (0–100) at last disconnect */
  lastBattery?: number | null;
  /** One entry per group the user is navigating in (optional). */
  activeRoutes: ActiveRouteEntry[];
  createdAt: Date;
}

/** Safe projection: user without the password field */
export type PublicUser = Omit<UserEntity, 'password'>;
