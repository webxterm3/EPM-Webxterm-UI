'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
  Clock,
  Monitor,
  User as UserIcon,
  XCircle,
  Check,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import {
  ACCESS_LEVELS,
  accessRequestsAPI,
  AccessRequest,
  formatDuration,
  requestMinutes,
} from '@/lib/access-requests-api';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Active' },
  { value: 'expired', label: 'Approved & Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'revoked', label: 'Revoked' },
] as const;

type StatusTab = (typeof STATUS_TABS)[number]['value'];

/** Everything the request is asking for, in one line.
 *
 *  An approver sees a duration and a machine; without this they cannot tell a
 *  request to watch a screen from one for administrator rights and permission
 *  to install software, and all three arrive looking like "access".
 *
 *  Each ask is named, and remote support says which KIND — handing out full
 *  control believing it was view-only is the mistake this line exists to
 *  prevent. */
function describeAsk(r: AccessRequest): string {
  const parts: string[] = [];

  if (r.asks?.remote_support) {
    const level = ACCESS_LEVELS.find(l => l.value === r.asks?.remote_support?.control);
    parts.push(`Remote support (${level?.label ?? 'view only'})`);
  }
  if (r.asks?.admin_access) parts.push('Admin access');
  if (r.asks?.app_install) {
    const apps = r.asks.app_install.applications ?? [];
    parts.push(apps.length > 0 ? `Install: ${apps.join(', ')}` : 'Application installation');
  }

  if (parts.length > 0) return parts.join(' · ');

  // Requests made before asks existed carry the old single type. Said plainly
  // rather than drawn as an empty line, which reads as a rendering fault.
  if (r.access_type) {
    const level = ACCESS_LEVELS.find(l => l.value === r.access_level);
    return level ? `${r.access_type} (${level.label})` : r.access_type;
  }
  return 'access (not recorded)';
}

function formatTime(ts?: string) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ApproveRequests() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<StatusTab>('pending');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [revokeTarget, setRevokeTarget] = useState<AccessRequest | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<AccessRequest | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const fetchRequests = useCallback(
    async (status: StatusTab, p: number, ps: number, q: string) => {
      if (!token) return;
      setLoading(true);
      setError('');
      try {
        const res = await accessRequestsAPI.list(token, { status, page: p, limit: ps, search: q || undefined });
        setRequests(res.requests ?? []);
        setTotal(res.total ?? 0);
        setTotalPages(res.total_pages ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load access requests');
        setRequests([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    fetchRequests(activeTab, page, pageSize, search);
  }, [fetchRequests, activeTab, page, pageSize, search]);

  // Debounce search input before it triggers a server fetch
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as StatusTab);
    setPage(1);
    setSearchInput('');
    setSearch('');
  };

  const handlePageSizeChange = (ps: number) => {
    setPageSize(ps);
    setPage(1);
  };

  const handleRevoke = async () => {
    if (!token || !revokeTarget) return;
    setRevoking(true);
    try {
      await accessRequestsAPI.revoke(token, revokeTarget.id);
      toast({
        title: 'Access revoked',
        description: `${revokeTarget.requester_username}'s access to ${revokeTarget.machine_name} has been revoked.`,
      });
      setRevokeTarget(null);
      fetchRequests(activeTab, page, pageSize, search);
    } catch (err) {
      toast({
        title: 'Failed to revoke access',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setRevoking(false);
    }
  };

  const handleApprove = async (req: AccessRequest) => {
    if (!token) return;
    setApprovingId(req.id);
    try {
      await accessRequestsAPI.approve(token, req.id);
      toast({
        title: 'Request approved',
        description: `${req.requester_username} now has access to ${req.machine_name}.`,
      });
      fetchRequests(activeTab, page, pageSize, search);
    } catch (err) {
      toast({
        title: 'Failed to approve request',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleOpenReject = (req: AccessRequest) => {
    setRejectTarget(req);
    setRejectComment('');
  };

  const handleConfirmReject = async () => {
    if (!token || !rejectTarget) return;
    if (!rejectComment.trim()) {
      toast({ title: 'Comment required', description: 'Please enter a reason for rejection', variant: 'destructive' });
      return;
    }
    setRejecting(true);
    try {
      await accessRequestsAPI.reject(token, rejectTarget.id, rejectComment.trim());
      toast({
        title: 'Request rejected',
        description: `${rejectTarget.requester_username}'s request has been rejected.`,
      });
      setRejectTarget(null);
      fetchRequests(activeTab, page, pageSize, search);
    } catch (err) {
      toast({
        title: 'Failed to reject request',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setRejecting(false);
    }
  };

  const startEntry = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, total);

  const pageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, -1, totalPages];
    if (page >= totalPages - 3) {
      return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, -1, page - 1, page, page + 1, -2, totalPages];
  };

  const activeLabel = STATUS_TABS.find((t) => t.value === activeTab)?.label ?? '';

  return (
    <div className="space-y-6">
      {/* The page owns the title; this owns the work. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Requests from people who need to reach a machine they do not already have access to.
        </p>
        <button
          onClick={() => fetchRequests(activeTab, page, pageSize, search)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors text-sm"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto">
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by requester, email, or machine..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <span>Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="h-10 px-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {error && (
          <div className="flex items-center gap-2 p-4 text-sm text-destructive bg-destructive/10 border-b border-border">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ShieldCheck className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No {activeLabel.toLowerCase()} requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Requester</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Machine</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Duration</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Requested At</th>
                  {activeTab === 'pending' && (
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Note</th>
                  )}
                  {(activeTab === 'pending' || activeTab === 'approved') && (
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actions</th>
                  )}
                  {activeTab === 'approved' && (
                    <>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        Approved By
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        Expires At
                      </th>
                    </>
                  )}
                  {activeTab === 'expired' && (
                    <>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        Approved By
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        Completed At
                      </th>
                    </>
                  )}
                  {activeTab === 'rejected' && (
                    <>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        Rejected By
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Reason</th>
                    </>
                  )}
                  {activeTab === 'revoked' && (
                    <>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        Revoked By
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                        Revoked At
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium">{r.requester_username}</p>
                          <p className="text-xs text-muted-foreground">{r.requester_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Monitor className="w-3 h-3 text-muted-foreground shrink-0" />
                        {r.machine_name}
                      </div>
                      {r.title && (
                        <div className="mt-0.5 text-xs text-foreground">{r.title}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      <div className="text-muted-foreground">{formatDuration(requestMinutes(r))}</div>
                      {/* WHAT is being asked for, next to how long. Approving
                          "2h access" without knowing whether that is watching
                          a screen or administrator rights is not a decision,
                          it is a guess. */}
                      <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                        {describeAsk(r)}
                      </div>
                      {r.not_before && (
                        <div className="mt-0.5 text-[11px] text-amber-500">
                          from {formatTime(r.not_before)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        {formatTime(r.requested_at)}
                      </div>
                    </td>
                    {activeTab === 'pending' && (
                      <td className="px-4 py-3 max-w-[240px]">
                        <span className="text-xs text-muted-foreground truncate block" title={r.request_note}>
                          {r.request_note || '—'}
                        </span>
                      </td>
                    )}
                    {activeTab === 'pending' && (
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(r)}
                            disabled={approvingId === r.id}
                          >
                            <Check className="w-3.5 h-3.5 mr-1.5" />
                            {approvingId === r.id ? 'Approving...' : 'Approve'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleOpenReject(r)}
                            disabled={approvingId === r.id}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1.5" />
                            Reject
                          </Button>
                        </div>
                      </td>
                    )}
                    {activeTab === 'approved' && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{r.approved_by || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {r.expires_at ? formatTime(r.expires_at) : 'No Expiration'}
                        </td>
                      </>
                    )}
                    {activeTab === 'expired' && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{r.approved_by || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {formatTime(r.expires_at)}
                        </td>
                      </>
                    )}
                    {activeTab === 'rejected' && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{r.rejected_by || '—'}</td>
                        <td className="px-4 py-3 max-w-[240px]">
                          <span className="text-xs text-muted-foreground truncate block" title={r.reject_comment}>
                            {r.reject_comment || '—'}
                          </span>
                        </td>
                      </>
                    )}
                    {activeTab === 'revoked' && (
                      <>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{r.revoked_by || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {formatTime(r.revoked_at)}
                        </td>
                      </>
                    )}
                    {activeTab === 'approved' && (
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRevokeTarget(r)}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Revoke
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {!loading && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm text-muted-foreground">
            <span className="text-xs">
              {startEntry}–{endEntry} of {total} entries
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="First page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {pageNumbers().map((n, i) =>
                n < 0 ? (
                  <span key={`ellipsis-${i}`} className="px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      'min-w-[32px] h-8 px-2 rounded text-xs font-medium transition-colors',
                      page === n ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    {n}
                  </button>
                ),
              )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Last page"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Revoke confirmation */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke access?</DialogTitle>
            <DialogDescription>
              This immediately ends {revokeTarget?.requester_username}&apos;s access to {revokeTarget?.machine_name}.
              This cannot be undone — they would need to request access again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking ? 'Revoking...' : 'Revoke Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject reason */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request?</DialogTitle>
            <DialogDescription>
              Rejecting request from <strong>{rejectTarget?.requester_username}</strong> for{' '}
              {rejectTarget ? formatDuration(requestMinutes(rejectTarget)) : ''} access to {rejectTarget?.machine_name}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection (required)"
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={rejecting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmReject} disabled={rejecting || !rejectComment.trim()}>
              {rejecting ? 'Rejecting...' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
