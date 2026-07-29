import type { NextFunction, Request, Response } from 'express';
import type { SubscriptionPlan } from '@prisma/client';
import { ApiError } from '../http/errors';
import { currentAuth, type AuthContext } from '../middleware/authenticate';
import { prisma } from '../prisma';
import {
  PLAN_ENTITLEMENTS,
  planHasFeature,
  type PlanFeature,
  type SubscriptionPlanKey,
} from '../../shared/plans';

export function effectivePlan(company: {
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: 'ACTIVE' | 'SUSPENDED';
  subscriptionExpiresAt: Date | null;
}): SubscriptionPlanKey {
  if (company.subscriptionStatus === 'SUSPENDED') return company.subscriptionPlan;
  if (company.subscriptionExpiresAt && company.subscriptionExpiresAt.getTime() <= Date.now()) {
    return 'STARTER';
  }
  return company.subscriptionPlan;
}

function assertSubscriptionActive(auth: AuthContext) {
  if (auth.subscriptionStatus === 'SUSPENDED') {
    throw new ApiError(
      402,
      'SUBSCRIPTION_SUSPENDED',
      'This company’s subscription is suspended. An owner can contact Atlas support to restore access.',
    );
  }
}

export function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
  try {
    assertSubscriptionActive(currentAuth(req));
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePlanFeature(feature: PlanFeature) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = currentAuth(req);
      assertSubscriptionActive(auth);
      if (!planHasFeature(auth.subscriptionPlan, feature)) {
        throw new ApiError(
          402,
          'PLAN_UPGRADE_REQUIRED',
          `This feature is not included in the ${auth.subscriptionPlan.toLowerCase()} plan.`,
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function assertEmployeeCapacity(
  companyId: string,
  additionalEmployees = 1,
): Promise<void> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
    },
  });
  const plan = effectivePlan(company);
  const limit = PLAN_ENTITLEMENTS[plan].employeeLimit;
  if (limit === null) return;

  const activeEmployees = await prisma.membership.count({
    where: { companyId, status: 'ACTIVE', deactivatedAt: null },
  });
  if (activeEmployees + additionalEmployees > limit) {
    throw new ApiError(
      409,
      'EMPLOYEE_LIMIT_REACHED',
      `The ${plan.toLowerCase()} plan allows up to ${limit} employees. Upgrade the company before adding another person.`,
    );
  }
}
