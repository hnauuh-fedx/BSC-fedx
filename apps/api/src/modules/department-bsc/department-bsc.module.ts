import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeeBscModule } from '../employee-bsc/employee-bsc.module';
import { DepartmentBscController } from './department-bsc.controller';
import { DepartmentBscService } from './department-bsc.service';

@Module({
  imports: [AuthModule, EmployeeBscModule],
  controllers: [DepartmentBscController],
  providers: [DepartmentBscService],
})
export class DepartmentBscModule {}

