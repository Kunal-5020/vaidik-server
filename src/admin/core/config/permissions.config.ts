// src/admin/core/config/permissions.config.ts
export const Permissions = {
  // User Management
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_BLOCK: 'users.block',
  USERS_EXPORT: 'users.export',

  // Astrologer Management
  ASTROLOGERS_VIEW: 'astrologers.view',
  ASTROLOGERS_CREATE: 'astrologers.create',
  ASTROLOGERS_EDIT: 'astrologers.edit',
  ASTROLOGERS_DELETE: 'astrologers.delete',
  ASTROLOGERS_APPROVE: 'astrologers.approve',
  ASTROLOGERS_REJECT: 'astrologers.reject',
  ASTROLOGERS_BLOCK: 'astrologers.block',
  ASTROLOGERS_PRICING: 'astrologers.pricing',

  // Order Management
  ORDERS_VIEW: 'orders.view',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_REFUND: 'orders.refund',
  ORDERS_EXPORT: 'orders.export',

  // Payment Management
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_PROCESS: 'payments.process',
  PAYMENTS_REFUND: 'payments.refund',
  PAYOUTS_VIEW: 'payouts.view',
  PAYOUTS_APPROVE: 'payouts.approve',
  PAYOUTS_REJECT: 'payouts.reject',

  // Content Management
  CONTENT_VIEW: 'content.view',
  CONTENT_CREATE: 'content.create',
  CONTENT_EDIT: 'content.edit',
  CONTENT_DELETE: 'content.delete',
  CONTENT_PUBLISH: 'content.publish',

  // Analytics
  ANALYTICS_VIEW: 'analytics.view',
  ANALYTICS_EXPORT: 'analytics.export',
  ANALYTICS_FINANCIAL: 'analytics.financial',

  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',

  // Admin Management (Super Admin only)
  ADMINS_VIEW: 'admins.view',
  ADMINS_CREATE: 'admins.create',
  ADMINS_EDIT: 'admins.edit',
  ADMINS_DELETE: 'admins.delete',
  ROLES_MANAGE: 'roles.manage',

  // Notifications
  NOTIFICATIONS_SEND: 'notifications.send',
  NOTIFICATIONS_BROADCAST: 'notifications.broadcast',

  // Support
  SUPPORT_VIEW: 'support.view',
  SUPPORT_RESPOND: 'support.respond',
  SUPPORT_CLOSE: 'support.close',

  // Monitoring
  MONITORING_VIEW: 'monitoring.view',
  MONITORING_SHOPIFY: 'monitoring.shopify',
  MONITORING_REMEDIES: 'monitoring.remedies',

  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  SUPPORT_TICKETS_VIEW: 'support:tickets:view',
  SUPPORT_TICKETS_EDIT: 'support:tickets:edit',
  SUPPORT_REFUND_PROCESS: 'support:refund:process',
  SUPPORT_PAYOUT_APPROVE: 'support:payout:approve',
  SUPPORT_STATS_VIEW: 'support:stats:view',
} as const;

export const RolePermissions = {
  super_admin: Object.values(Permissions),

  admin: [
    Permissions.USERS_VIEW,
    Permissions.USERS_EDIT,
    Permissions.USERS_BLOCK,
    Permissions.ASTROLOGERS_VIEW,
    Permissions.ASTROLOGERS_EDIT,
    Permissions.ASTROLOGERS_APPROVE,
    Permissions.ASTROLOGERS_REJECT,
    Permissions.ORDERS_VIEW,
    Permissions.ORDERS_REFUND,
    Permissions.PAYMENTS_VIEW,
    Permissions.PAYOUTS_VIEW,
    Permissions.PAYOUTS_APPROVE,
    Permissions.ANALYTICS_VIEW,
    Permissions.SUPPORT_VIEW,
    Permissions.SUPPORT_RESPOND,
    Permissions.MONITORING_VIEW,
    Permissions.MONITORING_SHOPIFY,
    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_EXPORT,
  ],

  moderator: [
    Permissions.USERS_VIEW,
    Permissions.USERS_BLOCK,
    Permissions.ASTROLOGERS_VIEW,
    Permissions.CONTENT_VIEW,
    Permissions.CONTENT_EDIT,
    Permissions.SUPPORT_VIEW,
    Permissions.SUPPORT_RESPOND,
  ],

  support: [
    Permissions.USERS_VIEW,
    Permissions.ASTROLOGERS_VIEW,
    Permissions.ORDERS_VIEW,
    Permissions.SUPPORT_VIEW,
    Permissions.SUPPORT_RESPOND,
    Permissions.SUPPORT_CLOSE,
  ],

  analyst: [
    Permissions.USERS_VIEW,
    Permissions.ASTROLOGERS_VIEW,
    Permissions.ORDERS_VIEW,
    Permissions.PAYMENTS_VIEW,
    Permissions.ANALYTICS_VIEW,
    Permissions.ANALYTICS_EXPORT,
    Permissions.ANALYTICS_FINANCIAL,
    Permissions.MONITORING_VIEW,
    Permissions.MONITORING_SHOPIFY,
    Permissions.MONITORING_REMEDIES,
    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_EXPORT,
  ],

  content_manager: [
    Permissions.CONTENT_VIEW,
    Permissions.CONTENT_CREATE,
    Permissions.CONTENT_EDIT,
    Permissions.CONTENT_DELETE,
    Permissions.CONTENT_PUBLISH,
  ],
};

export type PermissionKey = typeof Permissions[keyof typeof Permissions];
export type RoleType = keyof typeof RolePermissions;

// Helper function
export function getRolePermissions(role: RoleType): PermissionKey[] {
  return RolePermissions[role] || [];
}

export function hasPermission(
  userRole: RoleType,
  userPermissions: string[],
  requiredPermission: PermissionKey
): boolean {
  if (userRole === 'super_admin') return true;
  
  const rolePermissions = getRolePermissions(userRole);
  if (rolePermissions.includes(requiredPermission)) return true;
  
  return userPermissions.includes(requiredPermission);
}
