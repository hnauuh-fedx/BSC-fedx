import { Injectable } from '@nestjs/common';
import { EmployeeBscRepository } from '../repositories/employee-bsc.repository';

@Injectable()
export class EmployeeBscService {
  constructor(private readonly bscRepository: EmployeeBscRepository) {}
  
  findAll() {
    return this.bscRepository.findAll();
  }
}
