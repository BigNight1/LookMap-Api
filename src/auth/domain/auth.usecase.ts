import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { v2 as cloudinary } from 'cloudinary';
import { EmailService } from '../infrastructure/email.service';
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
  const {
    password,
    verificationCode,
    verificationCodeExpires,
    ...rest
  } = user;
  void password;
  void verificationCode;
  void verificationCodeExpires;
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
    private readonly emailService: EmailService,
    private readonly locationsGateway?: LocationsGateway,
  ) {}

  async register(input: RegisterInput): Promise<{ message: string }> {
    const emailTaken = await this.authRepo.findByEmail(input.email);
    if (emailTaken) throw new Error('EMAIL_ALREADY_EXISTS');

    const nicknameTaken = await this.authRepo.findByNickname(input.nickname);
    if (nicknameTaken) throw new Error('NICKNAME_ALREADY_EXISTS');

    const hashed = await bcrypt.hash(input.password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await this.authRepo.create({
      name: input.name,
      email: input.email.toLowerCase(),
      nickname: input.nickname,
      password: hashed,
      color: randomColor(),
      isVerified: false,
      verificationCode: code,
      verificationCodeExpires: expires,
    });

    await this.emailService.sendVerificationCode(
      input.email.toLowerCase(),
      input.name,
      code,
    );
    return { message: 'VERIFICATION_REQUIRED' };
  }

  async verifyEmail(email: string, code: string): Promise<AuthResult> {
    const user = await this.authRepo.findByEmailWithVerification(
      email.toLowerCase(),
    );
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.isVerified) throw new Error('ALREADY_VERIFIED');
    if (!user.verificationCode || user.verificationCode !== code) {
      throw new Error('INVALID_CODE');
    }
    if (
      !user.verificationCodeExpires ||
      user.verificationCodeExpires < new Date()
    ) {
      throw new Error('CODE_EXPIRED');
    }

    const updated = await this.authRepo.markAsVerified(user.id);
    return { user: toPublicUser(updated), userId: updated.id };
  }

  async resendVerificationCode(email: string): Promise<void> {
    const user = await this.authRepo.findByEmailWithVerification(
      email.toLowerCase(),
    );
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.isVerified) throw new Error('ALREADY_VERIFIED');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    await this.authRepo.updateVerificationCode(user.id, code, expires);
    await this.emailService.sendVerificationCode(email.toLowerCase(), user.name, code);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.authRepo.findByEmail(input.email);
    if (!user) throw new Error('INVALID_CREDENTIALS');

    if (user.password == null || user.password === '') {
      throw new Error('INVALID_CREDENTIALS');
    }

    const passwordMatch = await bcrypt.compare(input.password, user.password);
    if (!passwordMatch) throw new Error('INVALID_CREDENTIALS');

    if (!user.isVerified) throw new Error('EMAIL_NOT_VERIFIED');

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
      mapPinsImageOnly?: boolean;
    },
  ): Promise<PublicUser> {
    const updated = await this.authRepo.updateUser(userId, data);
    if (this.locationsGateway) {
      for (const groupId of updated.groupIds) {
        this.locationsGateway.server
          .to(`group:${groupId}`)
          .emit('user:profile:updated', { 
            userId, 
            color: updated.color,
            name: updated.name,
            nickname: updated.nickname
          });
      }
    }
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
        this.locationsGateway.invalidateAvatarCache(groupId);
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
