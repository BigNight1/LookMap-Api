/**
 * Group domain entities — pure TypeScript, no framework dependencies.
 */

export interface GroupMember {
  userId: string;
  nickname: string;
  color: string;
  joinedAt: Date;
  /** Present when loaded via user lookup (e.g. findManyById); not stored on group documents */
  avatar?: string | null;
  /** Real-time presence snapshot for `/groups/mine` hydration. */
  isOnline?: boolean;
  /** Current battery level when online; null when offline or unknown. */
  battery?: number | null;
  /** Current location when online; null when offline or unknown. */
  location?: { latitude: number; longitude: number; timestamp: string } | null;
  /** Last persisted known location (used to render offline members). */
  lastKnownLocation?: { latitude: number; longitude: number; timestamp: string } | null;
  /** Last seen timestamp for offline members. */
  lastSeenAt?: string | null;
}

export interface GroupEntity {
  id: string;
  name: string;
  /** 6-char alphanumeric invite code (A-Z 0-9) */
  code: string;
  ownerId: string;
  members: GroupMember[];
  /** Max members allowed. Default 3 (free plan). Pro plan will raise this later. */
  maxMembers: number;
  plan: 'free' | 'basic' | 'pro' | 'vip';
  subscriptionStatus: 'active' | 'cancelled' | 'expired' | null;
  subscriptionExpiresAt: Date | null;
  subscribedBy: string | null;
  createdAt: Date;
  isActive: boolean;
}
