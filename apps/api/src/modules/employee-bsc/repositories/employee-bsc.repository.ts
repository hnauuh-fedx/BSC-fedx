import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class EmployeeBscRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return [];
  }
}
