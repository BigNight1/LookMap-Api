import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { v2 as cloudinary } from 'cloudinary';
import { LocationsGateway } from '../../locations/presentation/locations.gateway';
import { IAuthRepository, SetActiveRouteInput } from './IAuthRepository';
import { PublicUser, UserEntity } from './entities/user.entity';

const MARKER_COLORS = [
  '#FF5733',
  '#33FF57',
  '#3357FF',
  '#FF33A8',
  '#FFD700',
  '#00CED1',
  '#FF8C00',
  '#9400D3',
];

function randomColor(): string {
  return MARKER_COLORS[Math.floor(Math.random() * MARKER_COLORS.length)];
}

function toPublicUser(user: UserEntity): PublicUser {
  const { password, ...rest } = user;
  void password;
  return rest;
}

function extractCloudinaryPublicId(url: string): string | null {
  try {
    // URL format: https://res.cloudinary.com/cloud/image/upload/v123/folder/filename.ext
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface RegisterInput {
  name: string;
  email: string;
  nickname: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: PublicUser;
  /** Raw JWT — the controller will sign it via JwtService */
  userId: string;
}

export class AuthUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly config: ConfigService,
    private readonly locationsGateway?: LocationsGateway,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const emailTaken = await this.authRepo.findByEmail(input.email);
    if (emailTaken) throw new Error('EMAIL_ALREADY_EXISTS');

    const nicknameTaken = await this.authRepo.findByNickname(input.nickname);
    if (nicknameTaken) throw new Error('NICKNAME_ALREADY_EXISTS');

    const hashed = await bcrypt.hash(input.password, 10);

    const created = await this.authRepo.create({
      name: input.name,
      email: input.email.toLowerCase(),
      nickname: input.nickname,
      password: hashed,
      color: randomColor(),
    });

    return { user: toPublicUser(created), userId: created.id };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.authRepo.findByEmail(input.email);
    if (!user) throw new Error('INVALID_CREDENTIALS');

    if (user.password == null || user.password === '') {
      throw new Error('INVALID_CREDENTIALS');
    }

    const passwordMatch = await bcrypt.compare(input.password, user.password);
    if (!passwordMatch) throw new Error('INVALID_CREDENTIALS');

    return { user: toPublicUser(user), userId: user.id };
  }

  async loginWithGoogle(idToken: string): Promise<AuthResult> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!clientId) throw new Error('GOOGLE_NOT_CONFIGURED');

    const client = new OAuth2Client(clientId);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
    } catch {
      throw new Error('GOOGLE_TOKEN_INVALID');
    }

    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      throw new Error('GOOGLE_TOKEN_INVALID');
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const name = payload.name?.trim() || email.split('@')[0] || 'User';
    const avatar = payload.picture ?? null;

    let user =
      (await this.authRepo.findByGoogleId(googleId)) ??
      (await this.authRepo.findByEmail(email));

    if (user) {
      const updated = await this.authRepo.linkGoogleProfile(user.id, {
        googleId,
        avatar,
        name,
      });
      return { user: toPublicUser(updated), userId: updated.id };
    }

    const nickname = await this.generateUniqueNickname(email);
    const created = await this.authRepo.createGoogleUser({
      name,
      email,
      nickname,
      color: randomColor(),
      googleId,
      avatar,
    });
    return { user: toPublicUser(created), userId: created.id };
  }

  private async generateUniqueNickname(email: string): Promise<string> {
    const rawLocal = email.split('@')[0] ?? 'user';
    const local =
      rawLocal.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'user';

    for (let attempt = 0; attempt < 25; attempt++) {
      const suffix = String(Math.floor(1000 + Math.random() * 9000));
      const nick = `${local}${suffix}`.slice(0, 20);
      if (nick.length < 3) continue;
      const taken = await this.authRepo.findByNickname(nick);
      if (!taken) return nick;
    }
    throw new Error('NICKNAME_GENERATION_FAILED');
  }

  async updateProfile(
    userId: string,
    data: {
      color?: string;
      pinSize?: string;
      name?: string;
      nickname?: string;
    },
  ): Promise<PublicUser> {
    const updated = await this.authRepo.updateUser(userId, data);
    return toPublicUser(updated);
  }

  async updateAvatar(
    userId: string,
    avatarUrl: string,
  ): Promise<PublicUser> {
    const user = await this.authRepo.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    // Remove old Cloudinary image if it exists and belongs to Cloudinary.
    if (user.avatar && user.avatar.includes('cloudinary.com')) {
      const publicId = extractCloudinaryPublicId(user.avatar);
      if (publicId) {
        try {
          cloudinary.config({
            cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
            api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
            api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
          });
          await cloudinary.uploader.destroy(publicId);
        } catch (e) {
          console.log('Error eliminando imagen anterior de Cloudinary:', e);
          // Continue even if deletion fails.
        }
      }
    }

    const updated = await this.authRepo.updateUser(userId, {
      avatar: avatarUrl,
    });

    const freshUser = await this.authRepo.findById(userId);
    if (freshUser && this.locationsGateway) {
      for (const groupId of freshUser.groupIds) {
        this.locationsGateway.server.to(`group:${groupId}`).emit('user:avatar:updated', {
          userId,
          avatar: avatarUrl,
        });
      }
    }

    return toPublicUser(updated);
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.authRepo.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    return toPublicUser(user);
  }

  async setActiveRoute(
    userId: string,
    input: SetActiveRouteInput,
  ): Promise<PublicUser> {
    const user = await this.authRepo.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!user.groupIds.includes(input.groupId)) throw new Error('NOT_IN_GROUP');
    const updated = await this.authRepo.setActiveRoute(userId, input);
    return toPublicUser(updated);
  }

  async clearActiveRoute(userId: string, groupId: string): Promise<PublicUser> {
    const user = await this.authRepo.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!user.groupIds.includes(groupId)) throw new Error('NOT_IN_GROUP');
    const updated = await this.authRepo.clearActiveRoute(userId, groupId);
    return toPublicUser(updated);
  }
}
