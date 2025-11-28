// src/admin/features/user-management/interfaces/user-filter.interface.ts
export interface UserFilter {
  status?: string;
  search?: string;
  registrationMethod?: string;
  isPhoneVerified?: boolean;
  startDate?: Date;
  endDate?: Date;
}

