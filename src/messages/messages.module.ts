import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MessageSchema, MessageSchemaDefinition } from './infrastructure/message.schema';
import { MessageRepository } from './infrastructure/message.repository';
import { MessageUseCase } from './domain/message.usecase';
import { MessagesController } from './presentation/messages.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MessageSchema.name, schema: MessageSchemaDefinition },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [MessagesController],
  providers: [
    MessageRepository,
    {
      provide: MessageUseCase,
      useFactory: (repo: MessageRepository) => new MessageUseCase(repo),
      inject: [MessageRepository],
    },
  ],
  exports: [MessageRepository, MessageUseCase],
})
export class MessagesModule {}
