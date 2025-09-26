// src/admin/decorators/current-admin.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminDocument } from '../schemas/admin.schema';

export const CurrentAdmin = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AdminDocument => {
    const request = ctx.switchToHttp().getRequest();
    return request.admin;
  },
);

// Usage: @CurrentAdmin() admin: AdminDocument
