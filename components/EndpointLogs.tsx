'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Search,
  FileText,
  AlertTriangle,
  Info,
  DownloadCloud,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  EndpointLogRecord,
  LogLevel,
  LogManagerUnavailable,
  getEndpointLogs,
  requestLogShip,
  applicationOf,
  channelOf,
  eventIdOf,
  sourceOf,
  userOf,
  severityOf,
  summarise,
} from '@/lib/endpoint-logs-api';

/** The machine's own system logs, read live out of the archive.
 *
 *  Not the Logs tab's command history. That is this product's record of what
 *  people did through it; this is what the operating system recorded about
 *  itself, shipped by the agent and stored as objects. Somebody
 *  investigating an incident needs the second and has had no way to see it.
 */

/** Errors and warnings by default.
 *
 *  A macOS unified log is mostly XPC bookkeeping — "activating connection:
 *  mach=false listener=false peer=true" — at thousands an hour. Opening on
 *  all of it buries the records somebody came to find under chatter they
 *  cannot act on, and the view reads as broken rather than as noisy.
 *
 *  Everything is still one dropdown away, because an investigation
 *  sometimes needs the chatter and the archive kept it on purpose.
 */
const DEFAULT_LEVEL: LogLevel = 'warning';

const LEVELS: { value: LogLevel | 'all'; label: string }[] = [
  { value: 'error', label: 'Errors only' },
  { value: 'warning', label: 'Warnings & errors' },
  { value: 'info', label: 'Normal activity' },
  { value: 'all', label: 'Everything, including chatter' },
];

const PAGE_SIZES = [50, 100, 250, 500] as const;

const RANGES = [
  { label: 'Last hour', hours: 1 },
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days', hours: 24 * 7 },
  { label: 'Last 30 days', hours: 24 * 30 },
] as const;

export default function EndpointLogs({ agentId }: { agentId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [records, setRecords] = useState<EndpointLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [hours, setHours] = useState<number>(24);
  const [level, setLevel] = useState<LogLevel | 'all'>(DEFAULT_LEVEL);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1]);
  const [utc, setUtc] = useState(false);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [shipping, setShipping] = useState(false);

  const load = useCallback(async () => {
    if (!token || !agentId) return;
    setLoading(true);
    setError(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - hours * 3600_000);
      const res = await getEndpointLogs(token, agentId, {
        from, to, q: applied,
        level: level === 'all' ? '' : level,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setRecords(res.records ?? []);
      setTotal(res.total ?? 0);
      setTruncated(res.truncated);
      setUnavailable(false);
      setFetchedAt(new Date());
    } catch (err) {
      // Not deployed is a configuration state, not a fault, and saying so
      // differently is the difference between a bug report and a line in a
      // config file.
      if (err instanceof LogManagerUnavailable) {
        setUnavailable(true);
        setRecords([]);
      } else {
        setError(err instanceof Error ? err.message : 'Could not read the log archive');
        setRecords([]);
      }
    } finally {
      setLoading(false);
    }
  }, [token, agentId, hours, applied, level, page, pageSize]);

  // Back to the first page whenever the QUESTION changes.
  //
  // Without this, narrowing the range while on page 7 asks for records 601
  // onwards of a result that now has forty — an empty page, under a filter
  // that just matched something.
  useEffect(() => {
    setPage(1);
  }, [hours, applied, level, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  // Ask the machine to collect and upload now.
  //
  // Deliberately does NOT refresh the list afterwards. The agent reads its
  // sources, uploads a batch and the archive catches up seconds later — a
  // refresh fired straight after would show the same records and read as
  // "the button did nothing".
  const shipNow = useCallback(async () => {
    if (!token || !agentId) return;
    setShipping(true);
    try {
      const res = await requestLogShip(token, agentId);
      toast({
        title: 'Collection requested',
        description: res.message || 'New records appear here once the machine has uploaded them.',
      });
    } catch (err) {
      toast({
        title: 'Could not ask this machine to collect',
        // The backend answers 409 with a sentence for an offline machine,
        // which is more use than anything written here.
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setShipping(false);
    }
  }, [token, agentId, toast]);

  if (unavailable) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 p-6 text-sm">
        <p className="font-medium">Endpoint log viewing is not switched on.</p>
        <p className="mt-2 text-muted-foreground">
          The agents may well be shipping logs already — this is the service that reads
          them back. Set <code className="font-mono text-xs">WXT_LOG_MANAGER_URL</code> in
          vsay-auth to point at wxt-log-manager, and this view will fill in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') setApplied(search);
            }}
            placeholder="Search this machine's system log…"
            className="pl-9"
          />
        </div>

        <Button size="sm" onClick={() => setApplied(search)} disabled={loading}>
          <Search className="mr-2 size-4" />
          Search
        </Button>

        {/* The portal's own Select, not a bare <select>.
            A native one renders with the operating system's chrome — a
            different height, a different font and a grey that belongs to
            nothing else on the page — so it reads as a control somebody
            forgot to finish. */}
        <Select value={String(hours)} onValueChange={v => setHours(Number(v))}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map(r => (
              <SelectItem key={r.hours} value={String(r.hours)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={level} onValueChange={v => setLevel(v as LogLevel | 'all')}>
          <SelectTrigger className="h-9 w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map(l => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('mr-2 size-4', loading && 'animate-spin')} />
          Refresh
        </Button>

        {/* Collect now, rather than waiting for the machine's next interval.
            Named for what it does to the MACHINE, not to this page: pressing
            it changes nothing here until the agent has uploaded, which is
            why the toast says so. */}
        <Button variant="outline" size="sm" onClick={shipNow} disabled={shipping}>
          <DownloadCloud className={cn('mr-2 size-4', shipping && 'animate-pulse')} />
          {shipping ? 'Asking…' : 'Collect now'}
        </Button>
      </div>

      {truncated && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {/* Said plainly. A partial log presented as a complete one is how
              somebody concludes an event did not happen. */}
          <span>
            This machine has shipped more records in this range than can be paged
            through. Narrow the range, raise the severity, or search for something
            specific to reach further back.
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && records.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Reading the archive…
        </div>
      ) : records.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <FileText className="size-8 opacity-40" />
          <p>No system logs stored for this machine in this range.</p>
          {/* The three reasons, because "no logs" on its own sends people
              looking at the agent when the cause is usually one of the
              other two. */}
          {level !== 'all' ? (
            // Said first, because it is the likely one and it is the one
            // the reader can fix in a click. Telling somebody their machine
            // has shipped nothing, when really a filter is hiding it, sends
            // them to look at the agent.
            <p className="max-w-md text-xs">
              Nothing at this severity in this range. Try{' '}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setLevel('all')}
              >
                everything, including chatter
              </button>
              , or widen the time range.
            </p>
          ) : (
            <p className="max-w-md text-xs">
              Either the machine has not shipped any yet, log shipping is switched off
              for this tenant, or the range is before it was enrolled.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {/* The zone is in the HEADER, not guessed at per row.
                    A log where the reader has to work out whose clock they
                    are looking at is a log nobody can correlate against
                    anything else — and this one is read during incidents. */}
                <th className="w-44 px-4 py-2.5 font-medium">
                  When ({utc ? 'UTC' : localZone()})
                </th>
                <th className="w-24 px-4 py-2.5 font-medium">Level</th>
                <th className="w-44 px-4 py-2.5 font-medium">Application</th>
                <th className="w-52 px-4 py-2.5 font-medium">Subsystem</th>
                <th className="px-4 py-2.5 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <Row key={`${r.source}-${i}`} record={r} utc={utc} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {/* The range, not just a count. "51-100 of 340" says where you
                  are; "100 records" says nothing about whether there is more. */}
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>

            <span className="flex items-center gap-1.5">
              Rows
              <Select
                value={String(pageSize)}
                onValueChange={v => setPageSize(Number(v))}
              >
                <SelectTrigger className="h-7 w-[72px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>

            {/* The zone is a CHOICE, not a guess.
                Records are stored in UTC and rendered in the reader's own
                zone. Somebody comparing this against a machine in another
                country, or against another system's logs, needs to be able
                to put both on the same clock. */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2"
              onClick={() => setUtc(v => !v)}
              title="Switch between your time zone and UTC"
            >
              <Clock className="size-3.5" />
              {utc ? 'UTC' : localZone()}
            </Button>

            {fetchedAt && <span>read at {when(fetchedAt.toISOString(), utc)}</span>}
          </div>

          <Pagination
            page={page}
            pages={Math.max(1, Math.ceil(total / pageSize))}
            disabled={loading}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

function Row({ record, utc }: { record: EndpointLogRecord; utc: boolean }) {
  const [open, setOpen] = useState(false);
  const severity = severityOf(record);
  const app = applicationOf(record);
  const channel = channelOf(record);
  const eventId = eventIdOf(record);

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer border-t border-border/40 align-top transition-colors hover:bg-muted/40"
      >
        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">
          {when(record.timestamp, utc)}
        </td>
        <td className="px-4 py-2">
          <LevelBadge level={severity} />
        </td>
        <td className="px-4 py-2">
          <span className="truncate text-xs font-medium">{app || '—'}</span>
        </td>
        <td className="px-4 py-2">
          <span className="block truncate text-xs text-muted-foreground" title={channel}>
            {channel || '—'}
          </span>
          {eventId && (
            <span className="font-mono text-[10px] text-muted-foreground/70">
              event {eventId}
            </span>
          )}
        </td>
        <td className={cn('px-4 py-2', !open && 'max-w-0 truncate', severity === 'error' && 'text-destructive')}>
          {summarise(record)}
        </td>
      </tr>
      {open && (
        // The whole record, because the columns above are a guess at which
        // fields matter and the one that matters is often another.
        <tr className="border-t border-border/40 bg-muted/20">
          <td colSpan={5} className="px-4 py-3">
            <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
              <Detail label="Collector" value={sourceOf(record)} />
              <Detail label="User" value={userOf(record)} />
              <Detail label="Event ID" value={eventId} />
              <Detail
                label={utc ? 'Local time' : 'UTC'}
                value={when(record.timestamp, !utc)}
              />
            </dl>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(record.fields, null, 2)}
            </pre>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground/60">{record.source}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium" title={value}>{value}</dd>
    </div>
  );
}

/** Severity as a word, not only as an icon.
 *
 *  The icons alone needed a legend nobody is given — an amber triangle and
 *  a red triangle are the same shape, and somebody scanning a page cannot
 *  tell a warning from an error at a glance. */
function LevelBadge({ level }: { level: 'error' | 'warn' | 'info' }) {
  const style = {
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
    warn: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    info: 'border-border/50 bg-muted/40 text-muted-foreground',
  }[level];
  const label = { error: 'Error', warn: 'Warning', info: 'Info' }[level];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', style)}>
      {level === 'error' && <AlertTriangle className="size-3" />}
      {level === 'warn' && <AlertTriangle className="size-3" />}
      {level === 'info' && <Info className="size-3" />}
      {label}
    </span>
  );
}

/** A record with no parseable timestamp is still shown — the archive keeps
 *  them rather than dropping a whole platform's logs over a field name. */
function when(iso: string, utc: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1980) return 'unknown time';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit',
    minute: '2-digit', second: '2-digit',
    timeZone: utc ? 'UTC' : undefined,
  });
}

/** The browser's zone, named the way a person would recognise it.
 *
 *  Shown in the column header rather than left implicit. Records are stored
 *  in UTC and rendered in whatever zone the reader's machine is set to, and
 *  an audit view that does not say which is which cannot be correlated
 *  against anything — least of all against the machine the logs came from,
 *  which may well be in another country.
 */
function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  } catch {
    return 'local time';
  }
}

/** Page numbers, not only Next and Previous.
 *
 *  Somebody who knows the thing they want is forty pages back should not
 *  have to press Older forty times — and with only arrows there is no way
 *  to tell how far back forty pages even is.
 *
 *  The window is bounded. A machine's log can run to a hundred pages, and
 *  a hundred numbered buttons is not navigation, it is a wall.
 */
function Pagination({
  page,
  pages,
  disabled,
  onChange,
}: {
  page: number;
  pages: number;
  disabled: boolean;
  onChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2"
        disabled={page <= 1 || disabled}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="size-3.5" />
        Newer
      </Button>

      {pageWindow(page, pages).map((p, i) =>
        p === null ? (
          // A gap, not a button. It stands for the pages between, and
          // making it clickable would mean inventing which one it meant.
          <span key={`gap-${i}`} className="px-1 text-muted-foreground/50">
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            className="h-7 min-w-7 px-2 tabular-nums"
            disabled={disabled}
            onClick={() => onChange(p)}
          >
            {p}
          </Button>
        ),
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2"
        disabled={page >= pages || disabled}
        onClick={() => onChange(page + 1)}
      >
        Older
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}

/** The page numbers to show: always the first and last, and a few either
 *  side of where you are. null is a gap.
 *
 *  First and last always, because they are the two somebody reaches for
 *  without counting — "back to the newest" and "how far does this go".
 */
function pageWindow(page: number, pages: number): (number | null)[] {
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, i) => i + 1);
  }

  const near = new Set<number>([1, pages, page]);
  for (const p of [page - 1, page + 1]) {
    if (p >= 1 && p <= pages) near.add(p);
  }

  const sorted = [...near].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let previous = 0;
  for (const p of sorted) {
    // A gap of exactly one page is spelt out rather than elided: "1 … 3"
    // hides page 2 behind an ellipsis that is wider than the number.
    if (p - previous === 2) out.push(p - 1);
    else if (p - previous > 2) out.push(null);
    out.push(p);
    previous = p;
  }
  return out;
}
