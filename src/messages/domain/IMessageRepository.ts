import { MessageEntity } from './entities/message.entity';

export interface CreateMessageData {
  groupId: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
}

export interface IMessageRepository {
  create(data: CreateMessageData): Promise<MessageEntity>;
  findByGroupId(
    groupId: string,
    limit?: number,
    before?: string,
  ): Promise<MessageEntity[]>;
  deleteByGroupId(groupId: string): Promise<void>;
}
