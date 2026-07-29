export const SUBSCRIPTION_PLANS = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'] as const;
export type SubscriptionPlanKey = (typeof SUBSCRIPTION_PLANS)[number];

export const PLAN_FEATURES = [
  'ATLASY',
  'SCHEDULING',
  'KNOWLEDGE',
  'REPORTING',
  'ADVANCED_PERMISSIONS',
  'ANALYTICS',
  'API_ACCESS',
  'MULTI_COMPANY',
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export interface PlanEntitlements {
  employeeLimit: number | null;
  features: readonly PlanFeature[];
  servicePerks: readonly string[];
}

/**
 * The executable source of truth for the public pricing table.
 *
 * Plans inherit everything below them. `null` means a negotiated Enterprise
 * capacity rather than an artificial application ceiling.
 */
export const PLAN_ENTITLEMENTS: Record<SubscriptionPlanKey, PlanEntitlements> = {
  STARTER: {
    employeeLimit: 10,
    features: [],
    servicePerks: [],
  },
  GROWTH: {
    employeeLimit: 50,
    features: ['ATLASY', 'SCHEDULING', 'KNOWLEDGE', 'REPORTING'],
    servicePerks: [],
  },
  BUSINESS: {
    employeeLimit: 150,
    features: [
      'ATLASY',
      'SCHEDULING',
      'KNOWLEDGE',
      'REPORTING',
      'ADVANCED_PERMISSIONS',
      'ANALYTICS',
      'API_ACCESS',
    ],
    servicePerks: ['PRIORITY_SUPPORT'],
  },
  ENTERPRISE: {
    employeeLimit: null,
    features: [
      'ATLASY',
      'SCHEDULING',
      'KNOWLEDGE',
      'REPORTING',
      'ADVANCED_PERMISSIONS',
      'ANALYTICS',
      'API_ACCESS',
      'MULTI_COMPANY',
    ],
    servicePerks: ['PRIORITY_SUPPORT', 'TAILORED_ONBOARDING', 'CUSTOM_PRICING'],
  },
};

export function planHasFeature(plan: SubscriptionPlanKey, feature: PlanFeature): boolean {
  return PLAN_ENTITLEMENTS[plan].features.includes(feature);
}
