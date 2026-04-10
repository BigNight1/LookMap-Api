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
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUseCase } from '../domain/auth.usecase';
import {
  RegisterDto,
  LoginDto,
  GoogleAuthDto,
  UpdateProfileDto,
  UpdateAvatarDto,
  PutActiveRouteDto,
} from './auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authUseCase: AuthUseCase,
    private readonly jwtService: JwtService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    try {
      const { user, userId } = await this.authUseCase.register(dto);
      const token = this.jwtService.sign({ sub: userId, email: user.email });
      return { user, token };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'EMAIL_ALREADY_EXISTS')
        throw new ConflictException('Email already in use');
      if (message === 'NICKNAME_ALREADY_EXISTS')
        throw new ConflictException('Nickname already taken');
      throw err;
    }
  }

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
