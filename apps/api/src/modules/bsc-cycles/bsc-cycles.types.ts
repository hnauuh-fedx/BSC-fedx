export interface BscCycleResponse {
  id: string;
  name: string;
  year: number;
  month: number | null;
  status: string;
  startDate: Date;
  endDate: Date;
}
