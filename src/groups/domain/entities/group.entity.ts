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
  createdAt: Date;
  isActive: boolean;
}
