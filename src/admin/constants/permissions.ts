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
};

export const RolePermissions = {
  super_admin: Object.values(Permissions), // All permissions

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
  ],

  content_manager: [
    Permissions.CONTENT_VIEW,
    Permissions.CONTENT_CREATE,
    Permissions.CONTENT_EDIT,
    Permissions.CONTENT_DELETE,
    Permissions.CONTENT_PUBLISH,
  ],
};
