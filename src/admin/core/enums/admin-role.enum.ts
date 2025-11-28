// src/admin/core/enums/admin-role.enum.ts
export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  SUPPORT = 'support',
  ANALYST = 'analyst',
  CONTENT_MANAGER = 'content_manager',
}

export enum AdminPermission {
  // User Management
  MANAGE_USERS = 'manage_users',
  VIEW_USERS = 'view_users',
  SUSPEND_USERS = 'suspend_users',
  
  // Astrologer Management
  MANAGE_ASTROLOGERS = 'manage_astrologers',
  APPROVE_ASTROLOGERS = 'approve_astrologers',
  VIEW_ASTROLOGERS = 'view_astrologers',
  
  // Financial Management
  MANAGE_PAYMENTS = 'manage_payments',
  VIEW_TRANSACTIONS = 'view_transactions',
  PROCESS_REFUNDS = 'process_refunds',
  
  // Content Management
  MODERATE_CONTENT = 'moderate_content',
  MANAGE_REPORTS = 'manage_reports',
  
  // System Management
  VIEW_ANALYTICS = 'view_analytics',
  SYSTEM_SETTINGS = 'system_settings',
  MANAGE_ADMINS = 'manage_admins',
  
  // Support
  HANDLE_SUPPORT = 'handle_support',
  VIEW_SUPPORT = 'view_support',
}

export enum AdminStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  LOCKED = 'locked',
}

export enum ActivityLogStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  WARNING = 'warning',
}
