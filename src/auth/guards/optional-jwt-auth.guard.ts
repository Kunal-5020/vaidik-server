// src/auth/guards/optional-jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // ✅ Override canActivate to handle all return types
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Add return statement that handles the asynchronous nature
    const canActivate = super.canActivate(context);
    
    // Handle different return types
    if (canActivate instanceof Observable) {
      // If Observable, convert to promise and handle errors
      return new Promise((resolve) => {
        canActivate.subscribe({
          next: () => resolve(true),
          error: () => resolve(true), // Allow request even on error
        });
      });
    } else if (canActivate instanceof Promise) {
      // If Promise, catch errors and return true anyway
      return canActivate.then(() => true).catch(() => true);
    } else {
      // If boolean, return as is (but convert false to true for optional)
      return canActivate || true;
    }
  }

  // ✅ Override handleRequest to allow requests without auth
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // If no user or error, return null instead of throwing
    // This allows the request to proceed without authentication
    if (err || !user) {
      return null;
    }
    return user;
  }
}
