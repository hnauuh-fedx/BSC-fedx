import { Module } from '@nestjs/common';
import { BscReportsController } from './reports.controller';
import { BscReportsService } from './reports.service';

@Module({ controllers: [BscReportsController], providers: [BscReportsService] })
export class ReportsModule {}
