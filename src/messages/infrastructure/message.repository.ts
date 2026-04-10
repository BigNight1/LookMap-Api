import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CreateMessageData,
  IMessageRepository,
} from '../domain/IMessageRepository';
import { MessageEntity } from '../domain/entities/message.entity';
import { MessageDocument, MessageSchema } from './message.schema';

interface RawMessage {
  _id: Types.ObjectId;
  groupId: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MessageRepository implements IMessageRepository {
  constructor(
    @InjectModel(MessageSchema.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  async create(data: CreateMessageData): Promise<MessageEntity> {
    const doc = await this.messageModel.create(data);
    return this.toEntity(doc.toObject() as unknown as RawMessage);
  }

  async findByGroupId(
    groupId: string,
    limit = 50,
    before?: string,
  ): Promise<MessageEntity[]> {
    const filter: {
      groupId: string;
      createdAt?: { $lt: Date };
    } = { groupId };

    if (before) {
      const d = new Date(before);
      if (!Number.isNaN(d.getTime())) {
        filter.createdAt = { $lt: d };
      }
    }

    const docs = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<RawMessage[]>();

    return docs.map((doc) => this.toEntity(doc));
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    await this.messageModel.deleteMany({ groupId });
  }

  private toEntity(doc: RawMessage): MessageEntity {
    return {
      id: String(doc._id),
      groupId: doc.groupId,
      userId: doc.userId,
      userName: doc.userName,
      userColor: doc.userColor,
      text: doc.text,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
