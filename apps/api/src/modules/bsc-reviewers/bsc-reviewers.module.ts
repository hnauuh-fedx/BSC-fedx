import { Module } from '@nestjs/common';
import { BscReviewerResolver } from './bsc-reviewer-resolver';

@Module({
  providers: [BscReviewerResolver],
  exports: [BscReviewerResolver],
})
export class BscReviewersModule {}
