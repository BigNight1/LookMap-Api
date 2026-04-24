import { ActiveRouteEntry, UserEntity } from './entities/user.entity';

export interface SetActiveRouteInput {
  groupId: string;
  destName?: string;
  destLat: number;
  destLng: number;
  geojson?: object | null;
  duration?: string;
  distance?: string;
  mode?: string;
}

export interface MemberActiveRouteRow {
  userId: string;
  nickname: string;
  color: string;
  route: ActiveRouteEntry | null;
}

export interface CreateUserDto {
  name: string;
  email: string;
  nickname: string;
  password: string;
  color: string;
  isVerified: boolean;
  verificationCode: string | null;
  verificationCodeExpires: Date | null;
}

export interface CreateGoogleUserDto {
  name: string;
  email: string;
  nickname: string;
  color: string;
  googleId: string;
  avatar: string | null;
}

export interface IAuthRepository {
  findByEmailWithVerification(email: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByNickname(nickname: string): Promise<UserEntity | null>;
  findByGoogleId(googleId: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  create(data: CreateUserDto): Promise<UserEntity>;
  createGoogleUser(data: CreateGoogleUserDto): Promise<UserEntity>;
  linkGoogleProfile(
    userId: string,
    data: { googleId: string; avatar: string | null; name?: string },
  ): Promise<UserEntity>;
  /** Add a groupId to the user's groupIds array (free plan: max 2) */
  addGroupToUser(userId: string, groupId: string): Promise<void>;
  /**
   * Remove a groupId from the user's groupIds array and drop any persisted route for that group.
   */
  removeGroupFromUser(userId: string, groupId: string): Promise<void>;
  /** Upsert the active route for one group (at most one route per group per user). */
  setActiveRoute(
    userId: string,
    input: SetActiveRouteInput,
  ): Promise<UserEntity>;
  clearActiveRoute(userId: string, groupId: string): Promise<UserEntity>;
  /** All members of the group with optional persisted route for that groupId. */
  findActiveRoutesForGroup(groupId: string): Promise<MemberActiveRouteRow[]>;
  /** Track WebSocket connection state */
  setOnlineStatus(userId: string, isOnline: boolean): Promise<void>;
  /** Persist last known GPS position and battery level */
  setLastLocation(
    userId: string,
    lat: number,
    lng: number,
    battery?: number,
  ): Promise<void>;
  /** Update editable profile fields */
  updateUser(
    userId: string,
    data: {
      color?: string;
      pinSize?: string;
      name?: string;
      nickname?: string;
      avatar?: string;
      mapPinsImageOnly?: boolean;
    },
  ): Promise<UserEntity>;
  markAsVerified(userId: string): Promise<UserEntity>;
  updateVerificationCode(
    userId: string,
    code: string,
    expires: Date,
  ): Promise<void>;
}
