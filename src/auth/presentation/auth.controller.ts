import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { AuthUseCase } from '../domain/auth.usecase';
import {
  RegisterDto,
  LoginDto,
  GoogleAuthDto,
  UpdateProfileDto,
  UpdateAvatarDto,
  PutActiveRouteDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from './auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authUseCase: AuthUseCase,
    private readonly jwtService: JwtService,
  ) {}

  @Throttle({
    short: { ttl: 60000, limit: 3 },
    medium: { ttl: 60000, limit: 3 },
    long: { ttl: 60000, limit: 3 },
  })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    this.logger.log(`[REGISTER] body recibido: ${JSON.stringify(dto)}`);
    try {
      return await this.authUseCase.register(dto);
    } catch (err: unknown) {
      this.logger.error(
        `[REGISTER] error: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
      );
      const message = err instanceof Error ? err.message : '';
      if (message === 'EMAIL_ALREADY_EXISTS')
        throw new ConflictException('Email already in use');
      if (message === 'NICKNAME_ALREADY_EXISTS')
        throw new ConflictException('Nickname already taken');
      if (message === 'EMAIL_SEND_FAILED')
        throw new ServiceUnavailableException('Could not send verification email');
      throw err;
    }
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    try {
      const { user, userId } = await this.authUseCase.verifyEmail(
        dto.email,
        dto.code,
      );
      const token = this.jwtService.sign({ sub: userId, email: user.email });
      return { user, token };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'USER_NOT_FOUND')
        throw new UnauthorizedException('User not found');
      if (message === 'ALREADY_VERIFIED')
        throw new ConflictException('Email already verified');
      if (message === 'INVALID_CODE')
        throw new UnauthorizedException('Invalid verification code');
      if (message === 'CODE_EXPIRED')
        throw new UnauthorizedException(
          'Code expired, request a new one',
        );
      throw err;
    }
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    try {
      await this.authUseCase.resendVerificationCode(dto.email);
      return { message: 'Code sent' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'USER_NOT_FOUND')
        throw new UnauthorizedException('User not found');
      if (message === 'ALREADY_VERIFIED')
        throw new ConflictException('Email already verified');
      if (message === 'EMAIL_SEND_FAILED')
        throw new ServiceUnavailableException('Could not send verification email');
      throw err;
    }
  }

  @Throttle({
    short: { ttl: 60000, limit: 5 },
    medium: { ttl: 60000, limit: 5 },
    long: { ttl: 60000, limit: 5 },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    try {
      const { user, userId } = await this.authUseCase.login(dto);
      const token = this.jwtService.sign({ sub: userId, email: user.email });
      return { user, token };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'INVALID_CREDENTIALS')
        throw new UnauthorizedException('Invalid email or password');
      if (message === 'EMAIL_NOT_VERIFIED')
        throw new ForbiddenException(
          'Please verify your email before logging in',
        );
      throw err;
    }
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(@Body() dto: GoogleAuthDto) {
    try {
      const { user, userId } = await this.authUseCase.loginWithGoogle(
        dto.idToken,
      );
      const token = this.jwtService.sign({ sub: userId, email: user.email });
      return { user, token };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'GOOGLE_NOT_CONFIGURED')
        throw new ServiceUnavailableException('Google login not configured');
      if (message === 'GOOGLE_TOKEN_INVALID')
        throw new UnauthorizedException('Invalid Google token');
      if (message === 'NICKNAME_GENERATION_FAILED')
        throw new ConflictException('Could not allocate a unique nickname');
      throw err;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout() {
    // JWT is stateless — the client discards the token on their side.
    return { message: 'ok' };
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateProfileDto,
  ) {
    try {
      const updated = await this.authUseCase.updateProfile(user.userId, dto);
      return { user: updated };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'USER_NOT_FOUND')
        throw new UnauthorizedException('User not found');
      if (message === 'NICKNAME_ALREADY_EXISTS')
        throw new ConflictException('Nickname already taken');
      throw err;
    }
  }

  @Put('avatar')
  @UseGuards(JwtAuthGuard)
  async updateAvatar(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateAvatarDto,
  ) {
    try {
      const updated = await this.authUseCase.updateAvatar(
        user.userId,
        dto.avatarUrl,
      );
      return { user: updated };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'USER_NOT_FOUND')
        throw new UnauthorizedException('User not found');
      throw err;
    }
  }

  @SkipThrottle({ short: true, medium: true, long: true })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { userId: string }) {
    try {
      const u = await this.authUseCase.getMe(user.userId);
      return { user: u };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'USER_NOT_FOUND')
        throw new UnauthorizedException('User not found');
      throw err;
    }
  }

  @Put('active-route')
  @UseGuards(JwtAuthGuard)
  async putActiveRoute(
    @CurrentUser() user: { userId: string },
    @Body() dto: PutActiveRouteDto,
  ) {
    try {
      const updated = await this.authUseCase.setActiveRoute(user.userId, dto);
      return { user: updated };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'USER_NOT_FOUND')
        throw new UnauthorizedException('User not found');
      if (message === 'NOT_IN_GROUP')
        throw new ForbiddenException('Not a member of this group');
      throw err;
    }
  }

  @Delete('active-route/:groupId')
  @UseGuards(JwtAuthGuard)
  async deleteActiveRoute(
    @CurrentUser() user: { userId: string },
    @Param('groupId') groupId: string,
  ) {
    try {
      const updated = await this.authUseCase.clearActiveRoute(
        user.userId,
        groupId,
      );
      return { user: updated };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'USER_NOT_FOUND')
        throw new UnauthorizedException('User not found');
      if (message === 'NOT_IN_GROUP')
        throw new ForbiddenException('Not a member of this group');
      throw err;
    }
  }
}
