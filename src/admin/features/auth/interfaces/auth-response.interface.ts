// src/admin/features/auth/interfaces/auth-response.interface.ts
export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    admin: {
      adminId: string;
      name: string;
      email: string;
      roleType: string;
      isSuperAdmin: boolean;
      requirePasswordChange: boolean;
      permissions: string[];
      customPermissions?: string[];
      deniedPermissions?: string[];
      department?: string;
      status: string;
      lastLoginAt?: Date;
    };
  };
}
