import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NotificationDocument = HydratedDocument<NotificationSchema>;

const NOTIFICATION_TYPES = [
  'destination_invite',
  'member_offline',
  'plan_transfer',
  'plan_expiring',
  'group_message',
] as const;

@Schema({ timestamps: true, collection: 'notifications' })
export class NotificationSchema {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, enum: NOTIFICATION_TYPES })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: Object, default: {} })
  data: Record<string, unknown>;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export const NotificationSchemaDefinition =
  SchemaFactory.createForClass(NotificationSchema);

NotificationSchemaDefinition.index({ userId: 1 });
NotificationSchemaDefinition.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
