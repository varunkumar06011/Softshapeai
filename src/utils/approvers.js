import { getRestaurantName } from './getRestaurantConfig';

const DEFAULT_APPROVERS = ['Vinod sir', 'Chandra sir', 'BVL Srinu sir'];

// Extra approvers per restaurant, matched case-insensitively against the
// restaurant name stored at login (ss_restaurant.name).
const EXTRA_APPROVERS_BY_RESTAURANT = [
  { match: 'gangaya', approvers: ['Kalyan', 'Srinivas'] },
];

export function getApproverOptions() {
  const name = (getRestaurantName() || '').toLowerCase();
  const extras = EXTRA_APPROVERS_BY_RESTAURANT
    .filter((r) => name.includes(r.match))
    .flatMap((r) => r.approvers);
  return [...DEFAULT_APPROVERS, ...extras];
}
