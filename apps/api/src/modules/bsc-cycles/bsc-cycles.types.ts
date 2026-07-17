export interface BscCycleSummary {
  totalBsc: number;
  notCreated: number;
  draft: number;
  planSubmitted: number;
  planReturned: number;
  planApproved: number;
  evaluating: number;
  evaluationSubmitted: number;
  evaluationReturned: number;
  evaluationApproved: number;
}

export interface BscCycleResponse {
  id: string;
  code: string;
  name: string;
  cycleType: string;
  year: number;
  month: number | null;
  quarter: number | null;
  status: string;
  version: number;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { id: string; employeeCode: string; fullName: string };
  summary?: BscCycleSummary;
}

export interface BscCyclePage {
  items: BscCycleResponse[];
  page: number;
  limit: number;
  total: number;
}
