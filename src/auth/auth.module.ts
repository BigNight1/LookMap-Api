import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { UserSchema, UserSchemaDefinition } from './infrastructure/user.schema';
import { AuthRepository } from './infrastructure/auth.repository';
import { EmailService } from './infrastructure/email.service';
import { JwtStrategy } from './infrastructure/jwt.strategy';
import { LocationsGateway } from '../locations/presentation/locations.gateway';
import { LocationsModule } from '../locations/locations.module';
import { AuthUseCase } from './domain/auth.usecase';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([
      { name: UserSchema.name, schema: UserSchemaDefinition },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<string>(
            'JWT_EXPIRES_IN',
          ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
    forwardRef(() => LocationsModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    EmailService,
    JwtStrategy,
    {
      provide: AuthUseCase,
      useFactory: (
        repo: AuthRepository,
        config: ConfigService,
        emailService: EmailService,
        locationsGateway: LocationsGateway,
      ) => new AuthUseCase(repo, config, emailService, locationsGateway),
      inject: [AuthRepository, ConfigService, EmailService, LocationsGateway],
    },
  ],
  exports: [JwtModule, AuthRepository],
})
export class AuthModule {}
