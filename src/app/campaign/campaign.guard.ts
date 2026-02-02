import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { from } from 'rxjs';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService } from '../auth/auth.service';
import { CampaignService } from './campaign.service';
import { CampaignContextService } from './campaign-context.service';

export const campaignGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const campaignService = inject(CampaignService);
  const campaignContext = inject(CampaignContextService);

  return toObservable(authService.isLoading).pipe(
    filter(loading => !loading),
    take(1),
    switchMap(() => {
      const user = authService.currentUser();
      if (!user) {
        return from([router.createUrlTree(['/sign-in'])]);
      }
      const campaignId = route.paramMap.get('campaignId');
      if (!campaignId) {
        return from([true]);
      }
      return from(campaignService.getCampaign(campaignId)).pipe(
        map(campaign => {
          if (!campaign || !campaign.members?.[user.uid]) {
            return router.createUrlTree(['/']);
          }
          void campaignContext.selectCampaign(campaignId);
          return true;
        })
      );
    })
  );
};
