import type { MembershipType } from '../api/types.js';

export const MEMBERSHIP_OPTIONS: { value: MembershipType; label: string; colorClassName: string }[] = [
  { value: 'FULL', label: 'Full member', colorClassName: 'roster-select-full' },
  { value: 'INTERNAL_ONLY', label: 'Internal only', colorClassName: 'roster-select-internal_only' },
  { value: 'GUEST', label: 'Guest', colorClassName: 'roster-select-guest' },
];
