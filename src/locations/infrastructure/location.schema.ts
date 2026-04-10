import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LocationDocument = HydratedDocument<LocationSchema>;

@Schema({ collection: 'locations' })
export class LocationSchema {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  groupId: string;

  /** Denormalized from user for fast broadcasts */
  @Prop({ required: true })
  nickname: string;

  @Prop({ required: true })
  color: string;

  @Prop({ required: true })
  lat: number;

  @Prop({ required: true })
  lng: number;

  @Prop({ default: 0 })
  accuracy: number;

  @Prop({ default: 100 })
  battery: number;

  @Prop({ default: true })
  isOnline: boolean;

  @Prop({ default: () => new Date() })
  timestamp: Date;
}

export const LocationSchemaDefinition = SchemaFactory.createForClass(LocationSchema);

// Unique upsert key: one location doc per user per group
LocationSchemaDefinition.index({ userId: 1, groupId: 1 }, { unique: true });
// Fast group-level queries
LocationSchemaDefinition.index({ groupId: 1 });
