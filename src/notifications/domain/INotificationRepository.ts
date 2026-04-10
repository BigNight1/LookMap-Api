import { NotificationEntity, NotificationType } from './entities/notification.entity';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead?: boolean;
  status?: string;
  expiresAt?: Date | null;
}

export interface INotificationRepository {
  create(data: CreateNotificationData): Promise<NotificationEntity>;
  findByUserId(userId: string, limit?: number): Promise<NotificationEntity[]>;
  markAllAsRead(userId: string): Promise<void>;
  deleteById(id: string, userId: string): Promise<void>;
  deleteAllByUserId(userId: string): Promise<void>;
}
