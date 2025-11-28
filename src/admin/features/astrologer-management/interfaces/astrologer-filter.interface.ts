// src/admin/features/astrologer-management/interfaces/astrologer-filter.interface.ts
export interface AstrologerFilter {
  status?: string;
  search?: string;
  specialization?: string;
  isProfileComplete?: boolean;
  startDate?: Date;
  endDate?: Date;
}
