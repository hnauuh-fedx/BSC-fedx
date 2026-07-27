export type ReportRow = {
  id: string; bscCode: string; employeeId: string; employeeCode: string; employeeName: string;
  departmentId: string; departmentName: string; positionName: string; directManagerName: string;
  cycleId: string; cycleCode: string; cycleName: string; planStatus: string; evaluationStatus: string;
  totalWeight: string; kpiCount: number; officialScore: string | null; officialGrade: string | null;
  planApprovedAt: string | null; evaluationApprovedAt: string | null;
};
export type ReportPage = { items: ReportRow[]; page: number; limit: number; total: number };
export type ReportOptions = {
  capabilities: {
    canViewPersonal: boolean;
    canViewManagement: boolean;
    canExportPersonal: boolean;
    canExportManagement: boolean;
    defaultScope: 'PERSONAL' | 'MANAGEMENT';
  };
  cycles: Array<{ id: string; code: string; name: string; year: number; month: number | null; status: string }>;
  departments: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; employee_code: string; full_name: string; department_id: string }>;
};
export type ReportSummary = {
  totalBsc: number; planStatusCounts: Record<string, number>; evaluationStatusCounts: Record<string, number>;
  pendingPlanReviews: number; pendingEvaluationReviews: number; pendingReopenRequests: number;
  gradeDistribution: Record<string, number>; approvedAverageScore: string | null;
  departmentProgress: Array<{ departmentId: string; departmentName: string; totalBsc: number; approvedBsc: number; completionPercentage: number }>;
  scoreTrend: Array<{ cycleId: string; cycleName: string; year: number; month: number | null; approvedAverageScore: string | null; approvedCount: number }>;
};
export type EmployeeDashboard = { kind: 'EMPLOYEE'; currentCycle: ReportOptions['cycles'][number] | null; currentBsc: ReportRow | null; actions: Array<{ code: string; label: string; href: string }>; recentBsc: ReportRow[] };
export type ManagementDashboard = ReportSummary & { kind: 'MANAGEMENT'; currentCycle: ReportOptions['cycles'][number] | null; notCreated: number };
export type DashboardData = EmployeeDashboard | ManagementDashboard;
