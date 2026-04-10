import {
  IsEmail,
  IsString,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
  IsMongoId,
  IsNumber,
  IsObject,
  ValidateIf,
  IsIn,
  IsUrl,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsEmail()
  email: string;

  /** 3-20 chars, only letters, numbers and underscores */
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'nickname can only contain letters, numbers and underscores',
  })
  nickname: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class UpdateAvatarDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  avatarUrl: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'nickname solo puede tener letras, números y guión bajo',
  })
  nickname?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a valid hex (e.g. #FF5733)',
  })
  color?: string;

  @IsOptional()
  @IsString()
  @IsIn(['min', 'small', 'normal', 'large', 'max'])
  pinSize?: string;
}

/** Persisted navigation for a group (same shape as socket `route:update` + dest name). */
export class PutActiveRouteDto {
  @IsMongoId()
  groupId: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  destName?: string;

  @IsNumber()
  destLat: number;

  @IsNumber()
  destLng: number;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsObject()
  geojson?: object | null;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  distance?: string;

  @IsOptional()
  @IsString()
  mode?: string;
}
