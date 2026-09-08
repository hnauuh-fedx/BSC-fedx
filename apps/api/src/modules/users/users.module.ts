import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BscReviewersModule } from '../bsc-reviewers/bsc-reviewers.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ imports: [AuthModule, BscReviewersModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
