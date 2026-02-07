import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserService } from '../core/user.service';
import * as logger from '../shared/logger';

export const adminGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);

  if (userService.isAdmin()) {
    return true;
  }

  logger.warn('Access denied: Admin privileges required');
  void router.navigate(['/']);
  return false;
};
