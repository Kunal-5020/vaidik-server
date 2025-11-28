// src/admin/features/activity-logs/interfaces/activity-log-filter.interface.ts
export interface ActivityLogFilter {
  adminId?: string;
  action?: string;
  module?: string;
  status?: 'success' | 'failed' | 'warning';
  targetType?: string;
  startDate?: Date;
  endDate?: Date;
}
