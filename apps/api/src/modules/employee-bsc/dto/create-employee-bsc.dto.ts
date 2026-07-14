import { IsUUID } from 'class-validator';

export class CreateEmployeeBscDto {
  @IsUUID()
  cycleId!: string;
}
