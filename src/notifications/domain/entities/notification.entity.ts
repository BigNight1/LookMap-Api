export type NotificationType =
  | 'destination_invite'
  | 'member_offline'
  | 'plan_transfer'
  | 'plan_expiring'
  | 'group_message';

export interface NotificationEntity {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
