import { CreateMessageData, IMessageRepository } from './IMessageRepository';
import { MessageEntity } from './entities/message.entity';

export class MessageUseCase {
  constructor(private readonly messageRepo: IMessageRepository) {}

  create(data: CreateMessageData): Promise<MessageEntity> {
    return this.messageRepo.create(data);
  }

  findByGroupId(
    groupId: string,
    limit?: number,
    before?: string,
  ): Promise<MessageEntity[]> {
    return this.messageRepo.findByGroupId(groupId, limit, before);
  }
}
