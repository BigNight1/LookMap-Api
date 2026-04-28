import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<UserSchema>;

/** Palette of colors assigned round-robin when users join the map */
const MARKER_COLORS = [
  '#FF5733',
  '#33FF57',
  '#3357FF',
  '#FF33A8',
  '#FFD700',
  '#00CED1',
  '#FF8C00',
  '#9400D3',
];

@Schema({ timestamps: true, collection: 'users' })
export class UserSchema {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, unique: true, trim: true })
  nickname: string;

  /**
   * Google OAuth subject. Uniqueness is enforced via a partial index below so multiple
   * email/password users (googleId null) do not collide on E11000.
   */
  @Prop({ type: String, default: null })
  googleId: string | null;

  /** Profile image URL from Google (or null) */
  @Prop({ type: String, default: null })
  avatar: string | null;

  /** select: false → never returned by default; null for Google-only users */
  @Prop({ required: false, select: false, default: null, type: String })
  password: string | null;

  /** true once email is verified (Google users are verified on create) */
  @Prop({ type: Boolean, default: false })
  isVerified: boolean;

  /** 6-digit email verification code — null after verify or for Google-only */
  @Prop({ type: String, default: null, select: false })
  verificationCode: string | null;

  /** Code expiry (15 min window when set) */
  @Prop({ type: Date, default: null, select: false })
  verificationCodeExpires: Date | null;

  /**
   * Color for this user's marker on the map.
   * Assigned randomly on register.
   */
  @Prop({
    required: true,
    default: () =>
      MARKER_COLORS[Math.floor(Math.random() * MARKER_COLORS.length)],
  })
  color: string;

  /** Marker pin size on the map UI */
  @Prop({ default: 'normal' })
  pinSize: string;

  /** Default true — mismo comportamiento actual (nombre visible en el pin). */
  @Prop({ type: Boolean, default: true })
  mapPinsImageOnly: boolean;

  /**
   * IDs of all groups the user belongs to.
   * Free plan: max 2. Empty array means not in any group.
   */
  @Prop({ type: [Types.ObjectId], ref: 'Group', default: [], index: true })
  groupIds: Types.ObjectId[];

  @Prop({ type: Number, default: 2 })
  maxGroups: number;

  @Prop({ type: Number, default: 0 })
  extraGroupsPurchased: number;

  @Prop({ default: false })
  isOnline: boolean;

  /** Last known GPS position — updated on disconnect */
  @Prop({
    type: {
      lat: { type: Number },
      lng: { type: Number },
      timestamp: { type: Date },
    },
    default: null,
  })
  lastLocation: { lat: number; lng: number; timestamp: Date } | null;

  /** Battery level (0–100) at last disconnect — shown in offline chip */
  @Prop({ type: Number, default: null })
  lastBattery: number | null;

  /**
   * Per-group navigation the user confirmed (dest + polyline). Removed when they leave the group.
   */
  @Prop({
    type: [
      {
        groupId: { type: Types.ObjectId, ref: 'Group', required: true },
        destName: { type: String, default: '' },
        destLat: { type: Number, required: true },
        destLng: { type: Number, required: true },
        geojson: { type: Object, default: null },
        duration: { type: String, default: '' },
        distance: { type: String, default: '' },
        mode: { type: String, default: 'driving' },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  activeRoutes: Array<{
    groupId: Types.ObjectId;
    destName: string;
    destLat: number;
    destLng: number;
    geojson: object | null;
    duration: string;
    distance: string;
    mode: string;
    updatedAt: Date;
  }>;
}

export const UserSchemaDefinition = SchemaFactory.createForClass(UserSchema);

// Unique only for real Google IDs — omit null/missing from the index (avoids duplicate null)
UserSchemaDefinition.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      googleId: { $type: 'string', $ne: null },
    },
  },
);
