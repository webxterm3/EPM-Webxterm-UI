'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Search,
  Package,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  ShieldPlus,
} from 'lucide-react';

import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PaginationBar } from '@/components/ui/pagination-bar';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import {
  applicationsAPI,
  CatalogEntry,
  InstalledApp,
  InventoryCoverage,
} from '@/lib/applications-api';

const PAGE_SIZE = 25;

/** The fleet-wide view of what software is installed, which is what
 *  application-control policy gets written against. */
export default function ApplicationsPage() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [coverage, setCoverage] = useState<InventoryCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [scanning, setScanning] = useState(false);
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [installs, setInstalls] = useState<InstalledApp[]>([]);
  const [installsLoading, setInstallsLoading] = useState(false);

  const load = useCallback(
    async (toPage = page) => {
      if (!token) return;
      setLoading(true);
      try {
        // Paged server-side. The old call asked for 200 rows and showed them
        // all: a fleet with more distinct applications than that simply had the
        // rest missing, with nothing on screen to say so.
        const res = await applicationsAPI.catalog(token, {
          search: search.trim(),
          limit: PAGE_SIZE,
          skip: (toPage - 1) * PAGE_SIZE,
        });
        setEntries(res.applications ?? []);
        setTotal(res.total ?? 0);
        setPage(toPage);
        setCoverage(res.coverage ?? null);
      } catch (err) {
        toast({
          title: 'Could not load applications',
          description: err instanceof Error ? err.message : 'Error',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [token, search, toast],
  );

  useEffect(() => {
    // Back to page 1 whenever the search changes — staying on page 4 of a
    // narrower result set shows an empty table for no visible reason.
    const t = setTimeout(() => load(1), search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, search]);

  /** Ask every connected machine to re-scan, then reload the catalogue.
   *
   *  The result names how many machines were offline. A refreshed catalogue
   *  that silently skipped a third of the estate is worse than no refresh:
   *  it looks authoritative and is not.
   */
  const scanFleet = useCallback(async () => {
    if (!token || scanning) return;
    setScanning(true);
    try {
      const res = await applicationsAPI.requestFleetScan(token);

      const parts = [`${res.requested} machine${res.requested === 1 ? '' : 's'} scanning`];
      if (res.offline > 0) parts.push(`${res.offline} offline`);
      if (res.failed.length > 0) parts.push(`${res.failed.length} unreachable`);

      toast({
        title: 'Fleet scan requested',
        description:
          parts.join(' · ') +
          (res.offline > 0
            ? '. Offline machines report on their own when they reconnect.'
            : '. The catalogue updates as agents report back.'),
      });

      // Agents report seconds after being asked — a macOS bundle scan took
      // about 5s on a real machine. Reloading on the response would re-render
      // the same catalogue and read as the button doing nothing.
      setTimeout(() => {
        load();
        setScanning(false);
      }, 10000);
    } catch (err) {
      toast({
        title: 'Could not start the scan',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
      setScanning(false);
    }
  }, [token, scanning, load, toast]);

  // Clicking the open row closes it again.
  //
  // The detail opens UNDER the row rather than at the foot of the page, where
  // it used to live: on a full catalogue that put the answer a screen and a
  // half below the thing somebody had just clicked, so the click appeared to
  // do nothing at all.
  const toggleEntry = useCallback(
    async (entry: CatalogEntry) => {
      if (selected && keyOf(selected) === keyOf(entry)) {
        setSelected(null);
        return;
      }
      setSelected(entry);
      setInstalls([]);
      if (!token) return;
      setInstallsLoading(true);
      try {
        const res = await applicationsAPI.machinesWith(token, entry.name, entry.publisher, {
          limit: 200,
        });
        setInstalls(res.installs ?? []);
      } catch {
        setInstalls([]);
      } finally {
        setInstallsLoading(false);
      }
    },
    [token, selected],
  );

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Applications' }]} />

      <div>
        <h1 className="text-2xl font-semibold">Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every application installed across your machines. This is what application-control policy
          is written against.
        </p>
      </div>

      {coverage && <CoverageNotice coverage={coverage} />}

      <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Fleet catalogue
              </CardTitle>
              <CardDescription className="mt-1">
                {total} distinct application{total === 1 ? '' : 's'}
              </CardDescription>
            </div>
            {/* One row: the box and its button side by side. The search box
                flexes and the button keeps its width, so the pair stays on a
                single line instead of the button dropping underneath. */}
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name or publisher…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={scanFleet}
                disabled={scanning}
                className="shrink-0 gap-2 whitespace-nowrap"
              >
                <RefreshCw className={cn('h-4 w-4', scanning && 'animate-spin')} />
                {scanning ? 'Scanning…' : 'Scan all machines'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading && entries.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : entries.length === 0 ? (
            <EmptyCatalogue search={search} coverage={coverage} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Application</th>
                    <th className="px-4 py-2.5 font-medium">Publisher</th>
                    <th className="px-4 py-2.5 font-medium">Machines</th>
                    <th className="px-4 py-2.5 font-medium">Versions</th>
                    <th className="px-4 py-2.5 text-right font-medium">Action</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => {
                    const open = !!selected && keyOf(selected) === keyOf(entry);
                    return (
                      <Fragment key={keyOf(entry)}>
                        <tr
                          onClick={() => toggleEntry(entry)}
                          className={cn(
                            'cursor-pointer border-t border-border/40 transition-colors hover:bg-muted/40',
                            open && 'bg-muted/40',
                          )}
                        >
                          <td className="px-4 py-2.5 font-medium">{entry.name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {entry.publisher || '—'}
                          </td>
                          <td className="px-4 py-2.5">{entry.machine_count}</td>
                          <td className="px-4 py-2.5">
                            {/* Several versions of one product across the fleet is
                            the thing that makes hash-based rules brittle, so it
                            is surfaced rather than hidden behind a click. */}
                            {entry.version_count > 1 ? (
                              <Badge variant="outline" className="text-[10px]">
                                {entry.version_count} versions
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">
                                {entry.versions[0] || '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {/* stopPropagation, or following the link would also
                            toggle the row open behind the navigation. */}
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              onClick={e => e.stopPropagation()}
                              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Link href={policyHref(entry)}>
                                <ShieldPlus className="h-3.5 w-3.5" />
                                Create policy
                              </Link>
                            </Button>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            <ChevronRight
                              className={cn('h-4 w-4 transition-transform', open && 'rotate-90')}
                            />
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-t border-border/40 bg-muted/20">
                            <td colSpan={6} className="px-4 py-4">
                              <AppDetail
                                entry={entry}
                                installs={installs}
                                loading={installsLoading}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && entries.length > 0 && (
            <div className="mt-4">
              <PaginationBar
                page={page}
                totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                total={total}
                onPageChange={load}
                label="applications"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Identity of a catalogue row. Name AND publisher, because two vendors ship
 *  software of the same name and they are not the same application. */
function keyOf(entry: CatalogEntry): string {
  return `${entry.name}|${entry.publisher}`;
}

/** Link to the policy editor, pre-filled with this application.
 *
 *  No agent id: the catalogue is fleet-wide, so there is no one machine this
 *  came from, and the editor scopes an agent-less draft to the tenant.
 *
 *  sample_bundle and sample_exe are ONE machine's answer for an application
 *  that may be installed on hundreds. The bundle id is stable across them and
 *  travels as a condition; the path is not and travels as reference only.
 */
function policyHref(entry: CatalogEntry): string {
  const params = new URLSearchParams({ app: entry.name });
  if (entry.publisher) params.set('publisher', entry.publisher);
  if (entry.sample_bundle) params.set('bundle_id', entry.sample_bundle);
  if (entry.sample_exe) params.set('path', entry.sample_exe);
  return `/policies?${params.toString()}`;
}

/** Says how much of the fleet these numbers actually cover.
 *
 *  Without it the catalogue reads as the whole estate, when it may be two
 *  thirds of it — and every policy decision taken from it inherits that error. */
function CoverageNotice({ coverage }: { coverage: InventoryCoverage }) {
  const missing = coverage.machines_total - coverage.machines_reported;
  if (missing <= 0 && coverage.machines_stale === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div className="text-sm">
        <p className="font-medium">This list does not cover your whole fleet.</p>
        <p className="mt-1 text-muted-foreground">
          {coverage.machines_reported} of {coverage.machines_total} machines have reported
          their software
          {missing > 0 && `; ${missing} never have`}
          {coverage.machines_stale > 0 &&
            `; ${coverage.machines_stale} last reported more than a day ago`}
          . Machines that are offline, newly enrolled, or running an older agent will be missing.
        </p>
      </div>
    </div>
  );
}

function EmptyCatalogue({
  search,
  coverage,
}: {
  search: string;
  coverage: InventoryCoverage | null;
}) {
  if (search) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Nothing matching “{search}”.
      </div>
    );
  }
  return (
    <div className="py-10 text-center">
      <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <p className="font-medium">No applications reported yet.</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {coverage && coverage.machines_total === 0
          ? 'Enrol a machine first — its agent reports installed software on connect.'
          : 'Agents report installed software when they connect and then once a day. Use “Scan all machines” for an answer sooner. Machines running an older agent will not report at all until they are updated.'}
      </p>
    </div>
  );
}

/** What one catalogue row expands into: where this application actually is.
 *
 *  Not a Card. It is rendered INSIDE the table row it belongs to, and a card
 *  there reads as a second, unrelated panel that happens to have landed in
 *  the middle of a list. There is no close button either — the row that
 *  opened it closes it.
 */
function AppDetail({
  entry,
  installs,
  loading,
}: {
  entry: CatalogEntry;
  installs: InstalledApp[];
  loading: boolean;
}) {
  return (
    <div className="space-y-3">
      {entry.versions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Versions:</span>
          {entry.versions.map(v => (
            <Badge key={v} variant="outline" className="text-[10px]">
              {v || 'unknown'}
            </Badge>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading machines…
        </div>
      ) : installs.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          No machine reports this application any more.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Machine</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Installed for</th>
              </tr>
            </thead>
            <tbody>
              {installs.map(install => (
                <tr key={install.id} className="border-t border-border/40">
                  <td className="px-4 py-2 font-medium">{install.machine_name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{install.version || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {install.scope === 'user' ? install.os_user || 'one user' : 'All users'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
