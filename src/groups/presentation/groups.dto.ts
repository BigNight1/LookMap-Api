import { IsString, MinLength, MaxLength, Length, IsOptional, IsNumber } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsNumber()
  battery?: number;
}

export class JoinGroupDto {
  @IsString()
  @Length(6, 6, { message: 'code must be exactly 6 characters' })
  code: string;

  @IsOptional()
  @IsNumber()
  battery?: number;
}

export class RenameGroupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  name: string;
}

export class TransferOwnerDto {
  @IsString()
  @MinLength(1)
  newOwnerId: string;
}
