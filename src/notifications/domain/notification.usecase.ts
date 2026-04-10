import {
  CreateNotificationData,
  INotificationRepository,
} from './INotificationRepository';
import { NotificationEntity } from './entities/notification.entity';

export class NotificationUseCase {
  constructor(private readonly notificationRepo: INotificationRepository) {}

  create(data: CreateNotificationData): Promise<NotificationEntity> {
    return this.notificationRepo.create(data);
  }

  findByUserId(userId: string, limit?: number): Promise<NotificationEntity[]> {
    return this.notificationRepo.findByUserId(userId, limit);
  }

  markAllAsRead(userId: string): Promise<void> {
    return this.notificationRepo.markAllAsRead(userId);
  }

  deleteById(id: string, userId: string): Promise<void> {
    return this.notificationRepo.deleteById(id, userId);
  }

  deleteAllByUserId(userId: string): Promise<void> {
    return this.notificationRepo.deleteAllByUserId(userId);
  }
}
