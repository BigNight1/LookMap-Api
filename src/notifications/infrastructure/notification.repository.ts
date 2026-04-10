import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CreateNotificationData,
  INotificationRepository,
} from '../domain/INotificationRepository';
import { NotificationEntity } from '../domain/entities/notification.entity';
import {
  NotificationDocument,
  NotificationSchema,
} from './notification.schema';

interface RawNotification {
  _id: Types.ObjectId;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class NotificationRepository implements INotificationRepository {
  constructor(
    @InjectModel(NotificationSchema.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(data: CreateNotificationData): Promise<NotificationEntity> {
    const doc = await this.notificationModel.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.data ?? {},
      isRead: data.isRead ?? false,
      status: data.status ?? 'pending',
      expiresAt: data.expiresAt ?? null,
    });
    return this.toEntity(doc.toObject() as unknown as RawNotification);
  }

  async findByUserId(
    userId: string,
    limit = 50,
  ): Promise<NotificationEntity[]> {
    const docs = await this.notificationModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<RawNotification[]>();
    return docs.map((d) => this.toEntity(d));
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany({ userId }, { $set: { isRead: true } });
  }

  async deleteById(id: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      return;
    }
    await this.notificationModel.deleteOne({
      _id: new Types.ObjectId(id),
      userId,
    });
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    await this.notificationModel.deleteMany({ userId });
  }

  private toEntity(doc: RawNotification): NotificationEntity {
    return {
      id: String(doc._id),
      userId: doc.userId,
      type: doc.type as NotificationEntity['type'],
      title: doc.title,
      body: doc.body,
      data: doc.data ?? {},
      isRead: doc.isRead,
      status: doc.status,
      expiresAt: doc.expiresAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
