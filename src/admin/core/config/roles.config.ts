// src/admin/core/config/roles.config.ts
import { Permissions, RolePermissions, RoleType } from './permissions.config';

export interface RoleDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  isSystem: boolean; // System roles can't be deleted
  level: number; // Hierarchy level (1 = highest)
}

export const ADMIN_ROLES: Record<RoleType, RoleDefinition> = {
  super_admin: {
    id: 'super_admin',
    name: 'super_admin',
    displayName: 'Super Admin',
    description: 'Full system access with all permissions',
    permissions: RolePermissions.super_admin,
    isSystem: true,
    level: 1,
  },

  admin: {
    id: 'admin',
    name: 'admin',
    displayName: 'Administrator',
    description: 'Manage users, astrologers, orders, and payments',
    permissions: RolePermissions.admin,
    isSystem: true,
    level: 2,
  },

  moderator: {
    id: 'moderator',
    name: 'moderator',
    displayName: 'Moderator',
    description: 'Content moderation and user management',
    permissions: RolePermissions.moderator,
    isSystem: true,
    level: 3,
  },

  support: {
    id: 'support',
    name: 'support',
    displayName: 'Support Agent',
    description: 'Handle customer support tickets and queries',
    permissions: RolePermissions.support,
    isSystem: true,
    level: 4,
  },

  analyst: {
    id: 'analyst',
    name: 'analyst',
    displayName: 'Data Analyst',
    description: 'View analytics and generate reports',
    permissions: RolePermissions.analyst,
    isSystem: true,
    level: 5,
  },

  content_manager: {
    id: 'content_manager',
    name: 'content_manager',
    displayName: 'Content Manager',
    description: 'Manage content, blogs, and media',
    permissions: RolePermissions.content_manager,
    isSystem: true,
    level: 6,
  },
};

// Helper functions
export function getRoleDefinition(roleName: RoleType): RoleDefinition | undefined {
  return ADMIN_ROLES[roleName];
}

export function getAllRoles(): RoleDefinition[] {
  return Object.values(ADMIN_ROLES);
}

export function getSystemRoles(): RoleDefinition[] {
  return getAllRoles().filter(role => role.isSystem);
}

export function getRolesByLevel(level: number): RoleDefinition[] {
  return getAllRoles().filter(role => role.level === level);
}

export function canManageRole(adminRole: RoleType, targetRole: RoleType): boolean {
  const adminDef = getRoleDefinition(adminRole);
  const targetDef = getRoleDefinition(targetRole);
  
  if (!adminDef || !targetDef) return false;
  
  // Super admin can manage everyone
  if (adminRole === 'super_admin') return true;
  
  // Can only manage roles at lower levels
  return adminDef.level < targetDef.level;
}
