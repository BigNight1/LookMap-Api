import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  NotificationSchema,
  NotificationSchemaDefinition,
} from './infrastructure/notification.schema';
import { NotificationRepository } from './infrastructure/notification.repository';
import { NotificationUseCase } from './domain/notification.usecase';
import { NotificationsController } from './presentation/notifications.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationSchema.name, schema: NotificationSchemaDefinition },
    ]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationRepository,
    {
      provide: NotificationUseCase,
      useFactory: (repo: NotificationRepository) =>
        new NotificationUseCase(repo),
      inject: [NotificationRepository],
    },
  ],
  exports: [NotificationRepository, NotificationUseCase],
})
export class NotificationsModule {}
