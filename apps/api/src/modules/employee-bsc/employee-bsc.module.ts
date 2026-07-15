import { Module } from '@nestjs/common';
import { EmployeeBscController } from './controllers/employee-bsc.controller';
import { EmployeeBscService } from './services/employee-bsc.service';
import { EmployeeBscRepository } from './repositories/employee-bsc.repository';
import { AuthModule } from '../auth/auth.module';
import { BscAccessPolicy } from './policies/bsc-access.policy';
import { BscClassificationService } from './services/bsc-classification.service';
import { BscScoringService } from './services/bsc-scoring.service';
import { BscWorkflowService } from './services/bsc-workflow.service';

@Module({
  imports: [AuthModule],
  controllers: [EmployeeBscController],
  providers: [EmployeeBscService, EmployeeBscRepository, BscAccessPolicy, BscClassificationService, BscScoringService, BscWorkflowService],
})
export class EmployeeBscModule {}
