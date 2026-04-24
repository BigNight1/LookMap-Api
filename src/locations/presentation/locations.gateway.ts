import { Injectable, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Namespace, Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LocationUseCase } from '../domain/location.usecase';
import { AuthRepository } from '../../auth/infrastructure/auth.repository';
import { MessageUseCase } from '../../messages/domain/message.usecase';

interface SocketData {
  userId: string;
  email: string;
  /** All group rooms this socket is currently subscribed to */
  groupIds: string[];
  nickname: string;
  color: string;
  avatar: string | null;
}

interface RouteUpdatePayload {
  groupId: string;
  geojson: object | null;
  destCoords: { latitude: number; longitude: number } | null;
  duration: string;
  distance: string;
  mode: string;
}

interface DestinationInvitePayload {
  groupId: string;
  destCoords: { latitude: number; longitude: number };
  destName: string;
  targetUserIds: string[];
}

interface DestinationResponsePayload {
  groupId: string;
  fromUserId: string;
  accepted: boolean;
  destCoords?: { latitude: number; longitude: number };
}

@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/locations' })
export class LocationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(LocationsGateway.name);
  /** Connection count per userId — supports multiple tabs/devices */
  private readonly connectedUsers = new Map<string, number>();
  private readonly avatarCache = new Map<
    string,
    { data: Map<string, string | null>; expires: number }
  >();
  private readonly AVATAR_CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly messageSendTimestamps = new Map<string, number>();
  private readonly MESSAGE_THROTTLE_MS = 500;

  constructor(
    private readonly locationUseCase: LocationUseCase,
    private readonly authRepo: AuthRepository,
    private readonly messageUseCase: MessageUseCase,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async afterInit(server: Server) {
    const redisUrl = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';

    const pubClient = new Redis(redisUrl, {
      // Stop retrying after first failed attempt — avoids infinite ECONNREFUSED spam
      retryStrategy: () => null,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    const subClient = pubClient.duplicate();

    // Attach error handlers BEFORE connecting so unhandled events don't crash the process
    pubClient.on('error', () => {});
    subClient.on('error', () => {});

    try {
      await pubClient.connect();
      await subClient.connect();
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('Redis adapter connected');
    } catch {
      // Redis not running — single-instance mode, all WS rooms work in-process
      this.logger.warn('Redis unavailable — running in single-instance mode (WebSocket rooms work locally)');
      pubClient.disconnect();
      subClient.disconnect();
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as Record<string, string>)?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.emit('error', { message: 'Missing token' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<{ sub: string; email: string }>(
        token,
        { secret: this.config.getOrThrow<string>('JWT_SECRET') },
      );

      const user = await this.authRepo.findById(payload.sub);
      if (!user) {
        client.emit('error', { message: 'User not found' });
        client.disconnect();
        return;
      }

      // Auto-join ALL group rooms the user belongs to
      const joinedGroupIds: string[] = [];
      for (const groupId of user.groupIds) {
        await client.join(`group:${groupId}`);
        joinedGroupIds.push(groupId);
      }

      (client.data as SocketData) = {
        userId: user.id,
        email: user.email,
        nickname: user.nickname,
        color: user.color,
        avatar: user.avatar ?? null,
        groupIds: joinedGroupIds,
      };

      this.connectedUsers.set(
        user.id,
        (this.connectedUsers.get(user.id) ?? 0) + 1,
      );
      await this.authRepo.setOnlineStatus(user.id, true);
      client.emit('connected', { userId: user.id, groupIds: joinedGroupIds });
      this.logger.log(`Client connected: ${user.nickname} — rooms: [${joinedGroupIds.join(', ')}]`);
    } catch {
      client.emit('error', { message: 'Invalid token' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const { userId, nickname, groupIds } = client.data as SocketData;
    if (!userId) return;

    const prev = this.connectedUsers.get(userId) ?? 0;
    const count = prev - 1;
    if (count > 0) {
      this.connectedUsers.set(userId, count);
      return;
    }
    this.connectedUsers.delete(userId);

    try {
      // Mark locations offline AND get last known position
      const lastLocation = await this.locationUseCase.handleMemberDisconnect(userId);

      // Persist last position in users collection
      if (lastLocation) {
        await this.authRepo.setLastLocation(userId, lastLocation.lat, lastLocation.lng, lastLocation.battery);
      }

      // Mark isOnline: false in users collection
      await this.authRepo.setOnlineStatus(userId, false);

      // Notify every group the user was in
      const disconnectedAt = new Date().toISOString();
      for (const groupId of groupIds ?? []) {
        this.server.to(`group:${groupId}`).emit('group:member:offline', {
          userId,
          disconnectedAt,
        });
      }

      this.logger.log(`Client disconnected: ${nickname ?? userId}`);
    } catch (err) {
      this.logger.error(`Error on disconnect for ${userId}:`, err);
    }
  }

  /**
   * join:group — called when user creates or joins a NEW group in real time.
   * On initial connection all existing rooms are joined automatically in handleConnection.
   */
  @SubscribeMessage('join:group')
  async handleJoinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { groupId: string },
  ) {
    try {
      const data = client.data as SocketData;
      if (!data?.userId) return;

      const { groupId } = payload;

      // Validate the user actually belongs to this group
      const user = await this.authRepo.findById(data.userId);
      if (!user || !user.groupIds.includes(groupId)) {
        client.emit('error', { message: 'You are not a member of this group' });
        return;
      }

      // Avoid double-joining
      if (!data.groupIds.includes(groupId)) {
        await client.join(`group:${groupId}`);
        (client.data as SocketData).groupIds = [...data.groupIds, groupId];
      }

      const groupLocations = await this.locationUseCase.getGroupState(groupId);
      const ids = [...new Set(groupLocations.map((loc) => loc.userId))];
      const memberAvatars = await this.getCachedAvatarMap(groupId, ids);
      const enriched = groupLocations.map((loc) => ({
        ...loc,
        isOnline: (this.connectedUsers.get(loc.userId) ?? 0) > 0,
        avatar: memberAvatars.get(loc.userId) ?? null,
      }));
      client.emit('group:location:update', enriched);

      this.logger.log(`${data.nickname} joined room group:${groupId}`);
    } catch (err) {
      this.logger.error('Error in join:group:', err);
      client.emit('error', { message: 'Internal error' });
    }
  }

  /**
   * location:update — broadcast position to ALL groups the user belongs to simultaneously.
   */
  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { lat: number; lng: number; accuracy: number; battery: number },
  ) {
    const data = client.data as SocketData;
    if (!data?.userId || !data.groupIds?.length || !data.nickname || !data.color) return;

    // Upsert + broadcast for each group the user is in
    for (const groupId of data.groupIds) {
      const { groupLocations } = await this.locationUseCase.handleLocationUpdate({
        userId: data.userId,
        groupId,
        nickname: data.nickname,
        color: data.color,
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy ?? 0,
        battery: payload.battery ?? 100,
      });

      const ids = [...new Set(groupLocations.map((loc) => loc.userId))];
      const memberAvatars = await this.getCachedAvatarMap(groupId, ids);
      const enriched = groupLocations.map((loc) => ({
        ...loc,
        isOnline: (this.connectedUsers.get(loc.userId) ?? 0) > 0,
        avatar: memberAvatars.get(loc.userId) ?? null,
      }));

      this.server.to(`group:${groupId}`).emit('group:location:update', enriched);
    }
  }

  /**
   * route:update — share or clear driving route with everyone in the group room (in-memory only).
   */
  @SubscribeMessage('route:update')
  async handleRouteUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RouteUpdatePayload,
  ) {
    const data = client.data as SocketData;
    if (!data?.userId) return;

    const { groupId } = payload;
    if (!groupId || typeof groupId !== 'string') {
      client.emit('error', { message: 'Invalid groupId' });
      return;
    }

    if (!data.groupIds?.includes(groupId)) {
      client.emit('error', { message: 'You are not a member of this group' });
      return;
    }

    if (payload.destCoords != null) {
      const { latitude, longitude } = payload.destCoords;
      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        client.emit('error', { message: 'Invalid destCoords' });
        return;
      }
    }

    this.server.to(`group:${groupId}`).emit('group:route:update', {
      userId: data.userId,
      groupId,
      geojson: payload.geojson,
      destCoords: payload.destCoords,
      duration: payload.duration,
      distance: payload.distance,
      mode: payload.mode,
    });

    this.logger.log(`${data.nickname} route:update → group:${groupId}`);
  }

  private async getCachedAvatarMap(
    groupId: string,
    userIds: string[],
  ): Promise<Map<string, string | null>> {
    const unique = [...new Set(userIds)];
    const cached = this.avatarCache.get(groupId);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    const users = await this.authRepo.findUsersByIds(unique);
    const data = new Map<string, string | null>();
    for (const u of users) {
      data.set(u.id, u.avatar ?? null);
    }
    this.avatarCache.set(groupId, {
      data,
      expires: Date.now() + this.AVATAR_CACHE_TTL_MS,
    });
    return data;
  }

  /** Called when a user updates their avatar so the next location broadcast refetches DB */
  invalidateAvatarCache(groupId: string): void {
    this.avatarCache.delete(groupId);
  }

  private findSocketByUserId(userId: string): Socket | undefined {
    const nsp = this.server as unknown as Namespace;
    for (const socket of nsp.sockets.values()) {
      const d = socket.data as SocketData;
      if (d?.userId === userId) return socket;
    }
    return undefined;
  }

  @SubscribeMessage('destination:invite')
  handleDestinationInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DestinationInvitePayload,
  ) {
    try {
      const data = client.data as SocketData;
      if (!data?.userId) return;

      const { groupId, destCoords, destName, targetUserIds } = payload;
      if (!groupId || typeof groupId !== 'string') {
        client.emit('error', { message: 'Invalid groupId' });
        return;
      }

      if (!data.groupIds?.includes(groupId)) {
        client.emit('error', { message: 'You are not a member of this group' });
        return;
      }

      const { latitude, longitude } = destCoords ?? {};
      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        client.emit('error', { message: 'Invalid destCoords' });
        return;
      }

      if (typeof destName !== 'string') {
        client.emit('error', { message: 'Invalid destName' });
        return;
      }

      if (!Array.isArray(targetUserIds)) {
        client.emit('error', { message: 'Invalid targetUserIds' });
        return;
      }

      const expiresAt = Date.now() + 5 * 60 * 1000;
      const inviteBody = {
        fromUserId: data.userId,
        fromNickname: data.nickname,
        groupId,
        destCoords: { latitude, longitude },
        destName,
        expiresAt,
      };

      for (const targetUserId of targetUserIds) {
        if (typeof targetUserId !== 'string') continue;
        const targetSocket = this.findSocketByUserId(targetUserId);
        targetSocket?.emit('destination:invite', inviteBody);
      }

      this.logger.log(`destination:invite ${data.nickname} group:${groupId}`);
    } catch (err) {
      this.logger.error('Error in destination:invite:', err);
      client.emit('error', { message: 'Internal error' });
    }
  }

  @SubscribeMessage('destination:response')
  handleDestinationResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DestinationResponsePayload,
  ) {
    try {
      const data = client.data as SocketData;
      if (!data?.userId) return;

      const { groupId, fromUserId, accepted } = payload;
      if (!groupId || typeof groupId !== 'string') {
        client.emit('error', { message: 'Invalid groupId' });
        return;
      }

      if (!data.groupIds?.includes(groupId)) {
        client.emit('error', { message: 'You are not a member of this group' });
        return;
      }

      if (!fromUserId || typeof fromUserId !== 'string') {
        client.emit('error', { message: 'Invalid fromUserId' });
        return;
      }

      if (accepted) {
        const dc = payload.destCoords;
        if (!dc) {
          client.emit('error', { message: 'destCoords required when accepted' });
          return;
        }
        const { latitude, longitude } = dc;
        if (
          typeof latitude !== 'number' ||
          typeof longitude !== 'number' ||
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          client.emit('error', { message: 'Invalid destCoords' });
          return;
        }

        this.server.to(`group:${groupId}`).emit('destination:accepted', {
          userId: data.userId,
          groupId,
          destCoords: { latitude, longitude },
        });
      } else {
        const fromSocket = this.findSocketByUserId(fromUserId);
        fromSocket?.emit('destination:rejected', {
          userId: data.userId,
          groupId,
        });
      }

      this.logger.log(`destination:response ${data.nickname} group:${groupId} accepted:${accepted}`);
    } catch (err) {
      this.logger.error('Error in destination:response:', err);
      client.emit('error', { message: 'Internal error' });
    }
  }

  @SubscribeMessage('message:send')
  async handleMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { groupId: string; text: string },
  ) {
    try {
      const data = client.data as SocketData;
      if (!data?.userId) return;

      const { groupId, text } = payload ?? {};
      if (!groupId || typeof groupId !== 'string') {
        client.emit('error', { message: 'Invalid groupId' });
        return;
      }

      if (!data.groupIds?.includes(groupId)) {
        client.emit('error', { message: 'You are not a member of this group' });
        return;
      }

      const lastSent = this.messageSendTimestamps.get(data.userId) ?? 0;
      if (Date.now() - lastSent < this.MESSAGE_THROTTLE_MS) {
        client.emit('error', { message: 'Too many messages' });
        return;
      }
      this.messageSendTimestamps.set(data.userId, Date.now());

      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed || trimmed.length > 500) {
        client.emit('error', { message: 'Invalid text' });
        return;
      }

      const msg = await this.messageUseCase.create({
        groupId,
        userId: data.userId,
        userName: data.nickname,
        userColor: data.color,
        text: trimmed,
      });

      this.server.to(`group:${groupId}`).emit('group:message:new', {
        id: msg.id,
        groupId: msg.groupId,
        userId: msg.userId,
        userName: msg.userName,
        userColor: msg.userColor,
        userAvatar: data.avatar ?? null,
        text: msg.text,
        createdAt: msg.createdAt,
      });

      this.logger.log(`message:send ${data.nickname} group:${groupId}`);
    } catch (err) {
      this.logger.error('Error in message:send:', err);
      client.emit('error', { message: 'Internal error' });
    }
  }

  /**
   * leave:group — leave a specific group room (stays in other group rooms).
   */
  @SubscribeMessage('leave:group')
  async handleLeaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { groupId: string },
  ) {
    const data = client.data as SocketData;
    if (!data?.groupIds) return;

    const { groupId } = payload;
    await client.leave(`group:${groupId}`);
    (client.data as SocketData).groupIds = data.groupIds.filter((id) => id !== groupId);

    this.logger.log(`${data.nickname} left room group:${groupId}`);
  }
}
