// src/admin/core/config/constants.ts
export const ADMIN_CONFIG = {
  // Authentication
  JWT_EXPIRY: '7d',
  PASSWORD_MIN_LENGTH: 8,
  MAX_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCK_DURATION: 30 * 60 * 1000, // 30 minutes

  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,

  // Activity Logs
  LOG_RETENTION_DAYS: 90,

  // Session
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours

  // File Upload
  MAX_PROFILE_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],

  // Notifications
  NOTIFICATION_BATCH_SIZE: 100,
  MAX_BROADCAST_RECIPIENTS: 10000,

  // Refunds
  DEFAULT_REFUND_PERCENTAGE: 100,
  MAX_REFUND_PERCENTAGE: 100,
  MIN_REFUND_PERCENTAGE: 1,

  // Payouts
  MIN_PAYOUT_AMOUNT: 100,
  MAX_PAYOUT_AMOUNT: 100000,
};

export const ADMIN_ROUTES = {
  AUTH: {
    LOGIN: '/admin/auth/login',
    LOGOUT: '/admin/auth/logout',
    PROFILE: '/admin/auth/profile',
    CHANGE_PASSWORD: '/admin/auth/change-password',
  },
  USERS: {
    LIST: '/admin/users',
    DETAILS: '/admin/users/:id',
    STATS: '/admin/users/stats',
  },
  ASTROLOGERS: {
    LIST: '/admin/astrologers',
    PENDING: '/admin/astrologers/pending',
    DETAILS: '/admin/astrologers/:id',
  },
  ORDERS: {
    LIST: '/admin/orders',
    DETAILS: '/admin/orders/:id',
    REFUNDS: '/admin/orders/refunds',
  },
  // ... add more as needed
};

export const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_LOCKED: 'Account is locked due to multiple failed login attempts',
  ACCOUNT_INACTIVE: 'Account is not active',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action',
  INVALID_TOKEN: 'Invalid or expired token',
  NOT_FOUND: 'Resource not found',
  ALREADY_EXISTS: 'Resource already exists',
};

export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logged out successfully',
  PASSWORD_CHANGED: 'Password changed successfully',
  ADMIN_CREATED: 'Admin created successfully',
  USER_UPDATED: 'User updated successfully',
  ASTROLOGER_APPROVED: 'Astrologer approved successfully',
  REFUND_PROCESSED: 'Refund processed successfully',
  PAYOUT_APPROVED: 'Payout approved successfully',
};
