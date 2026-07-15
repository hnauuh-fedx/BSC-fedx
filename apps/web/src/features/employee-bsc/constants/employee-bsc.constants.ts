export const BSC_PERMISSIONS = {
  CREATE_OWN: 'bsc.create.own', VIEW_OWN: 'bsc.view.own', EDIT_OWN: 'bsc.edit.own', DELETE_OWN: 'bsc.delete.own',
  VIEW_SUBORDINATE: 'bsc.view.subordinate', VIEW_UNIT: 'bsc.view.unit', MANAGE_KPI: 'bsc.kpi.manage.subordinate', UPDATE_ACTUAL: 'bsc.actual.update.own',
  SUBMIT_PLAN_OWN: 'bsc.plan.submit.own', APPROVE_PLAN_SUBORDINATE: 'bsc.plan.approve.subordinate', RETURN_PLAN_SUBORDINATE: 'bsc.plan.return.subordinate',
  SUBMIT_EVALUATION_OWN: 'bsc.evaluation.submit.own', APPROVE_EVALUATION_SUBORDINATE: 'bsc.evaluation.approve.subordinate', RETURN_EVALUATION_SUBORDINATE: 'bsc.evaluation.return.subordinate',
  VIEW_PLAN_HISTORY: 'bsc.plan.history.view', VIEW_EVALUATION_HISTORY: 'bsc.evaluation.history.view',
  REQUEST_REOPEN: 'bsc.reopen.request', REVIEW_REOPEN: 'bsc.reopen.subordinate', VIEW_VERSION: 'bsc.version.view', DUPLICATE_OWN: 'bsc.duplicate.own',
} as const;
