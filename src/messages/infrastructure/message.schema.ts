import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MessageDocument = HydratedDocument<MessageSchema>;

@Schema({ timestamps: true, collection: 'messages' })
export class MessageSchema {
  @Prop({ required: true })
  groupId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  userColor: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  text: string;
}

export const MessageSchemaDefinition = SchemaFactory.createForClass(MessageSchema);

MessageSchemaDefinition.index({ groupId: 1, createdAt: -1 });
