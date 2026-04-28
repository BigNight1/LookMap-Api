import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GroupDocument = HydratedDocument<GroupSchema>;

@Schema({ _id: false })
class GroupMemberSchema {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  nickname: string;

  @Prop({ required: true })
  color: string;

  @Prop({ required: true, default: () => new Date() })
  joinedAt: Date;
}

const GroupMemberSchemaDefinition = SchemaFactory.createForClass(GroupMemberSchema);

@Schema({ timestamps: true, collection: 'groups' })
export class GroupSchema {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, uppercase: true, length: 6 })
  code: string;

  @Prop({ required: true })
  ownerId: string;

  @Prop({ type: [GroupMemberSchemaDefinition], default: [] })
  members: GroupMemberSchema[];

  /** Free plan = 3. Pro plan will increase this value per group. */
  @Prop({ default: 3 })
  maxMembers: number;

  @Prop({ type: String, enum: ['free', 'basic', 'pro', 'vip'], default: 'free' })
  plan: 'free' | 'basic' | 'pro' | 'vip';

  @Prop({ type: String, enum: ['active', 'cancelled', 'expired'], default: null })
  subscriptionStatus: 'active' | 'cancelled' | 'expired' | null;

  @Prop({ type: Date, default: null })
  subscriptionExpiresAt: Date | null;

  @Prop({ type: String, default: null })
  subscribedBy: string | null;

  @Prop({ default: true })
  isActive: boolean;
}

export const GroupSchemaDefinition = SchemaFactory.createForClass(GroupSchema);

// Note: { code: 1 } unique index is already created by unique:true in @Prop above
GroupSchemaDefinition.index({ 'members.userId': 1 });
