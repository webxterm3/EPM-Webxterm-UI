import { apiRequest } from './api-client';

/** The system logs an endpoint has shipped to the archive.
 *
 *  A different thing from the Logs tab's command history, which is this
 *  product's own record of terminal sessions and lives in the database.
 *  These are the machine's OWN logs — macOS unified logging, the Windows
 *  event log — collected by the agent and stored as objects.
 */

/** One record out of a stored batch.
 *
 *  `fields` is deliberately open. What an endpoint ships is whatever its
 *  platform's logging produces, and macOS and Windows do not agree on a
 *  single key — so a fixed shape here would quietly drop the fields that
 *  make a record useful on one of the two.
 */
export interface EndpointLogRecord {
  timestamp: string;
  fields: Record<string, unknown>;
  /** Which stored object this line came from, for going back to the archive. */
  source: string;
}

export interface EndpointLogPage {
  records: EndpointLogRecord[];
  /** How many records matched, before this page was cut from them. Without
   *  it a full page and the last page look identical. */
  total: number;
  /** Where this page starts, echoed back so a second request cannot be
   *  rendered under the first one's page number. */
  offset: number;
  /** True when the archive holds more than paging can reach. Shown, rather
   *  than letting a partial log read as a complete one — which is how
   *  somebody concludes an event did not happen. */
  truncated: boolean;
  from: string;
  to: string;
}

export interface EndpointLogQuery {
  from?: Date;
  to?: Date;
  /** Free text, matched against every field. */
  q?: string;
  /** Drop anything less severe than this. Empty means everything — an
   *  investigation sometimes needs the chatter, and the archive kept it. */
  level?: LogLevel | '';
  limit?: number;
  offset?: number;
}

/** The severities worth filtering on.
 *
 *  Coarse on purpose. macOS has Default/Info/Debug/Error/Fault and Windows
 *  has its own set; a finer shared scale would invent a precision neither
 *  platform gives.
 */
export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

/** LogManagerUnavailable is the service not being deployed, which is a
 *  configuration state rather than a fault, and is worth saying differently
 *  from "this machine has no logs". */
export class LogManagerUnavailable extends Error {}

export async function getEndpointLogs(
  token: string,
  agentId: string,
  opts: EndpointLogQuery = {},
): Promise<EndpointLogPage> {
  const params = new URLSearchParams({ agent_id: agentId });
  if (opts.from) params.set('from', opts.from.toISOString());
  if (opts.to) params.set('to', opts.to.toISOString());
  if (opts.q) params.set('q', opts.q);
  if (opts.level) params.set('level', opts.level);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));

  try {
    return await apiRequest<EndpointLogPage>(`/logs/endpoint?${params}`, { token });
  } catch (err) {
    // 503 is the gateway saying WXT_LOG_MANAGER_URL is not set. Passed
    // through as its own type so the view can say "not deployed" rather
    // than showing an error that reads like a broken feature.
    if (err instanceof Error && /503|not configured/i.test(err.message)) {
      throw new LogManagerUnavailable(err.message);
    }
    throw err;
  }
}

/** A short, readable line for a record whose shape we do not know.
 *
 *  "message" first, because that is what the agent's own Record writes.
 *  The rest are for records an archive may hold from something else.
 *
 *  Falls back to the whole record rather than to an empty row — a log
 *  viewer showing blank lines is worse than one showing JSON, because a
 *  blank line looks like the record itself was empty.
 */
export function summarise(r: EndpointLogRecord): string {
  for (const key of ['message', 'eventMessage', 'Message', 'msg', 'body']) {
    const v = r.fields[key];
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return JSON.stringify(r.fields);
}

/** The program that wrote the record.
 *
 *  "process" first, because that is what the agent ships: on macOS it is
 *  the executable's name with the path stripped (locationd, WindowServer),
 *  on Windows it is the event provider. Both are the answer to "which
 *  application is this".
 */
export function applicationOf(r: EndpointLogRecord): string {
  return str(r, ['process', 'processImagePath', 'ProviderName']);
}

/** The subdivision within the source — a unified-log subsystem, a Windows
 *  Event Log channel. It is what tells apart two records from the same
 *  process that are about entirely different things. */
export function channelOf(r: EndpointLogRecord): string {
  return str(r, ['channel', 'subsystem', 'category']);
}

/** The OS account the record is attributed to, where the platform says. */
export function userOf(r: EndpointLogRecord): string {
  return str(r, ['user', 'User', 'username']);
}

/** Which collector produced it: macos-unified, windows-eventlog, dns. */
export function sourceOf(r: EndpointLogRecord): string {
  return str(r, ['source']);
}

/** The platform's numeric identifier, which Windows has and macOS does not.
 *  It is the thing an administrator actually searches for — "event 4625". */
export function eventIdOf(r: EndpointLogRecord): string {
  const v = r.fields['event_id'] ?? r.fields['EventID'];
  return typeof v === 'number' && v > 0 ? String(v) : '';
}

function str(r: EndpointLogRecord, keys: string[]): string {
  for (const key of keys) {
    const v = r.fields[key];
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return '';
}

/** Severity, normalised enough to colour a row and no further.
 *
 *  Deliberately coarse. macOS has Default/Info/Debug/Error/Fault and Windows
 *  has its own set; mapping them onto a shared five-point scale would be
 *  inventing a precision neither platform gives us.
 */
export function severityOf(r: EndpointLogRecord): 'error' | 'warn' | 'info' {
  for (const key of ['level', 'messageType', 'Level', 'severity', 'LevelDisplayName']) {
    const v = r.fields[key];
    if (typeof v !== 'string') continue;
    const s = v.toLowerCase();
    if (s.includes('err') || s.includes('fault') || s.includes('crit')) return 'error';
    if (s.includes('warn')) return 'warn';
  }
  return 'info';
}

/** Ask one machine to ship its system logs now, rather than at its next
 *  interval.
 *
 *  This goes to the PLATFORM API, not the log manager: the backend is what
 *  holds the gRPC stream to the agent. Reading what was shipped is the log
 *  manager's job; telling the machine to ship is not.
 *
 *  The answer means the request reached the agent, and nothing more. What
 *  the agent then collects and uploads arrives seconds later, so a caller
 *  that refreshes immediately will usually still see the old list.
 */
export async function requestLogShip(
  token: string,
  agentId: string,
): Promise<{ requested: boolean; message: string }> {
  return apiRequest<{ requested: boolean; message: string }>(
    `/machines/${encodeURIComponent(agentId)}/logs/ship-now`,
    { token, method: 'POST' },
  );
}
