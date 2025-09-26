// src/admin/config/admin-permissions.config.ts
import { AdminRole, AdminPermission } from '../enums/admin-role.enum';

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  [AdminRole.SUPER_ADMIN]: [
    AdminPermission.MANAGE_USERS,
    AdminPermission.VIEW_USERS,
    AdminPermission.SUSPEND_USERS,
    AdminPermission.MANAGE_ASTROLOGERS,
    AdminPermission.APPROVE_ASTROLOGERS,
    AdminPermission.VIEW_ASTROLOGERS,
    AdminPermission.MANAGE_PAYMENTS,
    AdminPermission.VIEW_TRANSACTIONS,
    AdminPermission.PROCESS_REFUNDS,
    AdminPermission.MODERATE_CONTENT,
    AdminPermission.MANAGE_REPORTS,
    AdminPermission.VIEW_ANALYTICS,
    AdminPermission.SYSTEM_SETTINGS,
    AdminPermission.MANAGE_ADMINS,
    AdminPermission.HANDLE_SUPPORT,
    AdminPermission.VIEW_SUPPORT,
  ],
  
  [AdminRole.ADMIN]: [
    AdminPermission.MANAGE_USERS,
    AdminPermission.VIEW_USERS,
    AdminPermission.SUSPEND_USERS,
    AdminPermission.MANAGE_ASTROLOGERS,
    AdminPermission.APPROVE_ASTROLOGERS,
    AdminPermission.VIEW_ASTROLOGERS,
    AdminPermission.VIEW_TRANSACTIONS,
    AdminPermission.MODERATE_CONTENT,
    AdminPermission.MANAGE_REPORTS,
    AdminPermission.VIEW_ANALYTICS,
    AdminPermission.HANDLE_SUPPORT,
    AdminPermission.VIEW_SUPPORT,
  ],
  
  [AdminRole.MODERATOR]: [
    AdminPermission.VIEW_USERS,
    AdminPermission.SUSPEND_USERS,
    AdminPermission.VIEW_ASTROLOGERS,
    AdminPermission.MODERATE_CONTENT,
    AdminPermission.MANAGE_REPORTS,
    AdminPermission.HANDLE_SUPPORT,
    AdminPermission.VIEW_SUPPORT,
  ],
  
  [AdminRole.SUPPORT]: [
    AdminPermission.VIEW_USERS,
    AdminPermission.VIEW_ASTROLOGERS,
    AdminPermission.HANDLE_SUPPORT,
    AdminPermission.VIEW_SUPPORT,
    AdminPermission.VIEW_TRANSACTIONS,
  ],
  
  [AdminRole.ANALYST]: [
    AdminPermission.VIEW_USERS,
    AdminPermission.VIEW_ASTROLOGERS,
    AdminPermission.VIEW_ANALYTICS,
    AdminPermission.VIEW_TRANSACTIONS,
    AdminPermission.VIEW_SUPPORT,
  ],
};

export function getRolePermissions(role: AdminRole): AdminPermission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(
  userRole: AdminRole, 
  userPermissions: AdminPermission[], 
  requiredPermission: AdminPermission
): boolean {
  // Super admin has all permissions
  if (userRole === AdminRole.SUPER_ADMIN) {
    return true;
  }
  
  // Check role-based permissions
  const rolePermissions = getRolePermissions(userRole);
  if (rolePermissions.includes(requiredPermission)) {
    return true;
  }
  
  // Check individual permissions
  return userPermissions.includes(requiredPermission);
}
