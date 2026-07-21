import { Module } from '@nestjs/common';
import { EmployeeBscModule } from '../employee-bsc/employee-bsc.module';
import { BscReportsController } from './reports.controller';
import { BscReportsService } from './reports.service';

@Module({ imports: [EmployeeBscModule], controllers: [BscReportsController], providers: [BscReportsService] })
export class ReportsModule {}
