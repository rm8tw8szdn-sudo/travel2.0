export const ROUTE_ACCEPTED_POOL_TARGETS = Object.freeze({
  single: 200,
  cross: 200,
});

export const ROUTE_ACCEPTED_POOL_MINIMUMS = Object.freeze({
  single: 100,
  cross: 100,
});

export const ROUTE_ACCEPTED_POOL_TOTAL_TARGET = 400;
export const ROUTE_ACCEPTED_POOL_TOTAL_MINIMUM = 200;

export function acceptedPoolWatermarks(overrides = {}) {
  return {
    targets: {
      ...ROUTE_ACCEPTED_POOL_TARGETS,
      ...(overrides.targets || {}),
    },
    minimums: {
      ...ROUTE_ACCEPTED_POOL_MINIMUMS,
      ...(overrides.minimums || {}),
    },
    totalTarget: Number(overrides.totalTarget || ROUTE_ACCEPTED_POOL_TOTAL_TARGET),
    totalMinimum: Number(overrides.totalMinimum || ROUTE_ACCEPTED_POOL_TOTAL_MINIMUM),
  };
}
