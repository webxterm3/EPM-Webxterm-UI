/** How a policy's reach and its time windows are put into words.
 *
 *  Shared because two screens say it: application control and remote access,
 *  both under Policies. Two copies of this would drift,
 *  and the drift would be two pages describing the same policy differently. */

import { DAY_NAMES, minutesToClock } from '@/lib/remote-access-policies-api';

export function describeScope(policy: { scope?: { kind?: string; group_ids?: string[]; agent_ids?: string[] } }): string {
  switch (policy.scope?.kind) {
    case 'group':
      return `${policy.scope.group_ids?.length ?? 0} group(s)`;
    case 'machine':
      return `${policy.scope.agent_ids?.length ?? 0} machine(s)`;
    default:
      return 'All machines';
  }
}

export function describeWindow(w: { days?: number[]; start_minute: number; end_minute: number; timezone?: string }): string {
  const days = (w.days?.length ?? 0) === 0 ? 'Every day' : w.days!.map(d => DAY_NAMES[d]).join(', ');
  return `${days} ${minutesToClock(w.start_minute)}–${minutesToClock(w.end_minute)} ${w.timezone || 'UTC'}`;
}
