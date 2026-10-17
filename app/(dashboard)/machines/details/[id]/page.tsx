'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';

// Dynamically import XTerminal to avoid SSR issues
const XTerminal = dynamic(() => import('@/components/XTerminal').then(mod => ({ default: mod.XTerminal })), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-muted-foreground">Loading terminal...</div>,
});

// Dynamically import RemoteDesktop (guacamole-common-js touches window → client-only)
const RemoteDesktop = dynamic(() => import('@/components/RemoteDesktop').then(mod => ({ default: mod.RemoteDesktop })), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-muted-foreground">Loading desktop…</div>,
});

// Dynamically import AsciinemaPlayer to avoid SSR issues (it uses browser APIs)
const AsciinemaPlayer = dynamic(() => import('@/components/AsciinemaPlayer'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading player…</div>,
});
// Guacamole session-recording player (.guac desktop recordings)
const GuacRecordingPlayer = dynamic(() => import('@/components/GuacRecordingPlayer'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading player…</div>,
});
import {
  Monitor,
  Activity,
  Terminal,
  FileText,
  MoreHorizontal,
  MonitorSmartphone,
  Pencil,
  Trash2,
  UserPlus,
  Cpu,
  HardDrive,
  Wifi,
  Users,
  Plus,
  X,
  Search,
  RefreshCw,
  AlertTriangle,
  Copy,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Tag,
  Video,
  Download,
  Play,
  Maximize2,
  ShieldAlert,
  Package,
  Clock,
  HardDrive as HardDriveIcon,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import MachineApplications from '@/components/MachineApplications';
import EnforcementActivity from '@/components/EnforcementActivity';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { machinesAPI, Machine, LogEntry, Session, SessionRecording, AccessEvent } from '@/lib/machines-api';
import { settingsAPI } from '@/lib/settings-api';
import { formatBytes } from '@/lib/log-management-api';
import { TerminalWebSocket } from '@/lib/terminal-websocket';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Shared between the Overview tab and the Logs & Sessions tab so both stay in sync
// off the same polled state without duplicating the render logic.
// isDesktopOS reports whether a machine has a graphical desktop to take over.
//
// Remote control is a Windows and macOS feature: it works by capturing the
// session a user is logged into, and Linux machines in this fleet are managed
// through the terminal instead. Offering the button where the agent would only
// fail is worse than not offering it.
function isDesktopOS(os: string | undefined): boolean {
  const o = (os || '').toLowerCase();
  return o.includes('windows') || o.includes('darwin') || o.includes('mac');
}

function ActiveSessionsPanel({ machine, desktopSessions, activeSessions, machineId }: {
  machine: Machine;
  desktopSessions: Array<{ session_id: string; username: string; protocol: string; started_at: string }>;
  activeSessions: Session[];
  machineId: string;
}) {
  if (machine.os?.toLowerCase().includes('windows')) {
    // Windows machines: live remote-desktop (RDP/VNC) sessions.
    if (desktopSessions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No active desktop sessions</h3>
          <p className="text-muted-foreground">No one is connected to this machine&apos;s desktop right now.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {desktopSessions.map((s) => (
          <div key={s.session_id} className="p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <div>
                  <p className="font-medium">{s.username || 'user'}</p>
                  <p className="text-sm text-muted-foreground">{(s.protocol || 'rdp').toUpperCase()} desktop session</p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                  {(s.protocol || 'rdp').toUpperCase()}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Started: {new Date(s.started_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activeSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">No active sessions</h3>
        <p className="text-muted-foreground">Currently there are no active terminal sessions on this machine</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeSessions.map((session) => (
        <Link
          key={session.session_id}
          href={`/machines/details/${machineId}/session/${session.session_id}`}
          className="block"
        >
          <div className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-3 h-3 rounded-full",
                  session.status === 'active' ? "bg-green-500 animate-pulse" : "bg-gray-400"
                )} />
                <div>
                  <p className="font-medium">{session.username}</p>
                  <p className="text-sm text-muted-foreground">
                    Session: {session.session_id.slice(0, 20)}...
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className={cn(
                  session.source === 'vscode' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                  session.source === 'cli' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                  "bg-purple-500/10 text-purple-500 border-purple-500/20"
                )}>
                  {session.source?.toUpperCase() || 'UI'}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  {session.os_info} • {session.command_count} commands
                </p>
                <p className="text-xs text-muted-foreground">
                  Started: {new Date(session.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function MachineDetails() {
  const params = useParams();
  const machineId = params.id as string;
  const { token, user } = useAuth();
  const { branding } = useBranding();
  const { toast } = useToast();
  const { theme } = useTheme();

  const [machine, setMachine] = useState<(Machine & { registration_token?: string }) | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Logs sub-tab state
  const [logsSubTab, setLogsSubTab] = useState<'active' | 'entire' | 'sessions' | 'recordings' | 'users'>('entire');

  // Session recordings state
  const [recordings, setRecordings] = useState<SessionRecording[]>([]);
  const [recordingsTotal, setRecordingsTotal] = useState(0);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingURLLoading, setRecordingURLLoading] = useState<string | null>(null);
  const [s3Enabled, setS3Enabled] = useState<boolean | null>(null); // null = not checked yet
  const [playerURL, setPlayerURL] = useState<string | null>(null);
  const [playerKind, setPlayerKind] = useState<'cast' | 'video' | 'guac'>('cast');
  const [playerTitle, setPlayerTitle] = useState('');
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LogEntry[] | null>(null);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsTotalPages, setSessionsTotalPages] = useState(0);
  const [sessionsTotal, setSessionsTotal] = useState(0);

  // Access management state
  const [allUsers, setAllUsers] = useState<Array<{ id: string; username: string; email: string; role: string }>>([]);
  const [accessUsers, setAccessUsers] = useState<Array<{ username: string; email: string; granted_at: string }>>([]);
  const [accessUsersSearch, setAccessUsersSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Pagination state
  const [accessUsersPage, setAccessUsersPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(0);
  const [logsTotal, setLogsTotal] = useState(0);
  const [searchTotalPages, setSearchTotalPages] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const itemsPerPage = 5;

  // Terminal state
  const [terminalSessions, setTerminalSessions] = useState<{
    id: string;
    name: string;
    connected: boolean;
    websocket: TerminalWebSocket | null;
  }[]>([]);
  const terminalSessionsRef = useRef(terminalSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [searchUser, setSearchUser] = useState('');

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Remote desktop (RDP) state — Windows machines
  const [rdpConnected, setRdpConnected] = useState(false);
  const [rdpUsername, setRdpUsername] = useState('');
  const [rdpPassword, setRdpPassword] = useState('');
  const [rdpDomain, setRdpDomain] = useState('');
  const [rdpHost, setRdpHost] = useState('');
  const [desktopSessions, setDesktopSessions] = useState<Array<{ session_id: string; username: string; protocol: string; started_at: string }>>([]);
  const [accessEvents, setAccessEvents] = useState<AccessEvent[]>([]);
  const [activeAccess, setActiveAccess] = useState<AccessEvent[]>([]);
  const [rdpStatus, setRdpStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  // Agent self-update dialog state
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ current_version: string; latest_version: string; update_available: boolean; is_connected: boolean } | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);

  const loadMachineDetails = async () => {
    if (!token) return;

    try {
      const data = await machinesAPI.getMachineById(token, machineId);
      setMachine(data);
      // Pre-fill the RDP username with the account the agent auto-detected on the
      // Windows machine, so the operator only needs to enter their password.
      const detectedUser = data?.metadata?.remote_desktop_user;
      if (detectedUser) {
        setRdpUsername((prev) => prev || detectedUser);
      }
      // Pre-fill the machine IP for the "Open in Windows App" (.rdp) option.
      if (data?.ip_address) {
        setRdpHost((prev) => prev || data.ip_address);
      }
    } catch (error) {
      console.error('Failed to load machine:', error);
      toast({
        title: "Error",
        description: "Failed to load machine details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (page = logsPage) => {
    if (!token || !machine?.agent_id) return;

    try {
      const data = await machinesAPI.getMachineLogs(token, machine.agent_id, { page, limit: itemsPerPage });
      setLogs(data.logs || []);
      setLogsTotal(data.total ?? 0);
      setLogsTotalPages(data.total_pages ?? 0);
    } catch (error) {
      console.error('Failed to load logs:', error);
      setLogs([]);
    }
  };

  const loadActiveSessions = async () => {
    if (!token || !machine?.agent_id) return;

    try {
      const data = await machinesAPI.getActiveSessions(token, machine.agent_id);
      setActiveSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to load active sessions:', error);
      setActiveSessions([]);
    }
  };

  const loadAllSessions = async (page = sessionsPage) => {
    if (!token || !machine?.agent_id) return;

    try {
      const data = await machinesAPI.getMachineSessions(token, machine.agent_id, { page, limit: itemsPerPage });
      setAllSessions(data.sessions || []);
      setSessionsTotal(data.total ?? 0);
      setSessionsTotalPages(data.total_pages ?? 0);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setAllSessions([]);
    }
  };

  const loadRecordings = async () => {
    if (!token || !machine?.agent_id) return;
    setRecordingsLoading(true);
    try {
      // Check S3 config first so we can show a contextual message
      const cfg = await settingsAPI.getS3Config(token).catch(() => null);
      setS3Enabled(cfg?.enabled ?? false);

      if (cfg?.enabled) {
        const data = await machinesAPI.getRecordings(token, machine.agent_id);
        setRecordings(data.recordings ?? []);
        setRecordingsTotal(data.total ?? 0);
      }
    } catch (error) {
      console.error('Failed to load recordings:', error);
    } finally {
      setRecordingsLoading(false);
    }
  };

  const handleDownloadRecording = async (rec: SessionRecording) => {
    if (!token) return;
    setConvertingId(rec.id);
    try {
      // 1. Fetch the pre-signed .cast URL
      const { url } = await machinesAPI.getRecordingURL(token, rec.id);

      // 2. Download the .cast file content
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch recording');
      const castText = await response.text();

      // 3. Parse asciicast v2 events (skip header line, keep only output events)
      const lines = castText.trim().split('\n').filter(Boolean);
      const events: [number, string, string][] = lines
        .slice(1)
        .map(l => JSON.parse(l))
        .filter(([, type]) => type === 'o');
      if (events.length === 0) throw new Error('Recording has no output events');

      // 4. Container must be on-screen (opacity:0) so the browser fully lays it
      //    out — off-screen (-9999px) causes browsers to skip layout/rendering.
      const container = document.createElement('div');
      container.style.cssText =
        'position:fixed;top:0;left:0;width:1320px;height:740px;overflow:hidden;' +
        'opacity:0;pointer-events:none;z-index:-9999;background:#1e1e2e;';
      document.body.appendChild(container);

      try {
        // 5. Mount xterm with the Canvas2D addon.
        //    Default xterm renderer is WebGL — WebGL canvases clear their buffer
        //    after each paint (preserveDrawingBuffer=false), so captureStream()
        //    captures blank frames.  Canvas2D preserves its buffer → works.
        const { Terminal } = await import('@xterm/xterm');
        const { CanvasAddon } = await import('@xterm/addon-canvas');

        const term = new Terminal({
          cols: 200,
          rows: 50,
          fontSize: 14,
          fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",monospace',
          theme: { background: '#1e1e2e', foreground: '#cdd6f4' },
          cursorBlink: false,
          allowProposedApi: true,
        });

        term.open(container);
        term.loadAddon(new CanvasAddon()); // force Canvas2D renderer

        // Trigger an initial draw so xterm creates its canvas immediately
        term.write('\x1b[2J\x1b[H');

        // 6. Poll for the canvas (Canvas2D renderer creates it synchronously
        //    but font loading can add a small delay).
        let canvas: HTMLCanvasElement | null = null;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 100));
          const all = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[];
          canvas = all.reduce<HTMLCanvasElement | null>(
            (best, c) => (!best || c.width * c.height > best.width * best.height ? c : best),
            null,
          );
          if (canvas && canvas.width > 0) break;
        }
        if (!canvas || canvas.width === 0) throw new Error('Terminal canvas not found — please try again');
        if (!('captureStream' in canvas)) throw new Error('Your browser does not support canvas recording (try Chrome)');

        // 7. Pick the best supported container format
        const mimeType =
          MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
          MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' :
          MediaRecorder.isTypeSupported('video/webm')            ? 'video/webm' : '';
        if (!mimeType) throw new Error('No supported video format found in this browser');

        // 8. Start recording
        const stream = (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }).captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

        const done = new Promise<void>(resolve => {
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `session-${rec.session_id.slice(0, 8)}.mp4`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              URL.revokeObjectURL(a.href);
              document.body.removeChild(a);
            }, 1000);
            resolve();
          };
        });

        recorder.start(100);

        // 9. Replay events with real timing; cap idle gaps at 300 ms
        const t0 = performance.now();
        for (const [time, , data] of events) {
          const delay = time * 1000 - (performance.now() - t0);
          if (delay > 5) await new Promise(r => setTimeout(r, Math.min(delay, 300)));
          term.write(data);
        }

        await new Promise(r => setTimeout(r, 600)); // let last frame render
        recorder.stop();
        await done;
        // Dispose in isolation — xterm throws benign internal errors on dispose
        // (e.g. onShowLinkUnderline) that must not bubble up as a failure toast.
        try { term.dispose(); } catch { /* intentionally ignored */ }
      } finally {
        container.remove();
      }
    } catch (err) {
      console.error('Video conversion failed:', err);
      toast({
        title: 'Video download failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setConvertingId(null);
    }
  };

  const handlePlayRecording = async (rec: SessionRecording) => {
    if (!token) return;
    setRecordingURLLoading(rec.id);
    try {
      const data = await machinesAPI.getRecordingURL(token, rec.id);
      setPlayerTitle(`${rec.username} — ${new Date(rec.created_at).toLocaleString()}`);
      // Pick the right player: .guac = Guacamole desktop recording, .m4v/.mp4 = video,
      // otherwise asciicast (terminal).
      setPlayerKind(/\.guac$/i.test(rec.s3_key) ? 'guac' : /\.(m4v|mp4)$/i.test(rec.s3_key) ? 'video' : 'cast');
      setPlayerURL(data.url);
    } catch (error) {
      console.error('Failed to get recording URL:', error);
    } finally {
      setRecordingURLLoading(null);
    }
  };

  const handleSearch = async (page = 1) => {
    if (!token || !machine?.agent_id || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      const data = await machinesAPI.searchLogs(token, machine.agent_id, searchQuery, { page, limit: itemsPerPage });
      setSearchResults(data.logs || []);
      setSearchTotal(data.total ?? 0);
      setSearchTotalPages(data.total_pages ?? 0);
      setLogsPage(page);
    } catch (error) {
      console.error('Failed to search logs:', error);
      setSearchResults([]);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const loadAccessUsers = async () => {
    if (!token || !machine?.agent_id) return;

    try {
      const data = await machinesAPI.getMachineAccessUsers(token, machine.agent_id);
      setAccessUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load access users:', error);
      setAccessUsers([]);
    }
  };

  const loadAllUsers = async () => {
    if (!token) return;

    setLoadingUsers(true);
    try {
      const data = await machinesAPI.listAllUsers(token);
      setAllUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Poll the machine's live remote-desktop sessions (who is connected right now).
  const loadDesktopSessions = async () => {
    if (!token || !machine?.agent_id) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082/api';
      const res = await fetch(`${apiUrl}/machines/${machine.agent_id}/desktop/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setDesktopSessions(Array.isArray(d?.sessions) ? d.sessions : []);
      }
    } catch { /* ignore */ }
  };

  // Open the live desktop in its own full-screen browser tab. Connection details are
  // handed over via localStorage (same-origin) so the password never rides in the URL.
  const handleOpenFullscreen = () => {
    if (!machine) return;
    try {
      localStorage.setItem(`vsay-rdp-${machineId}`, JSON.stringify({
        agentId: machine.agent_id,
        username: rdpUsername,
        password: rdpPassword,
        domain: rdpDomain,
        protocol: machine.metadata?.remote_desktop === 'vnc' ? 'vnc' : 'rdp',
        name: machine.name,
      }));
    } catch { /* ignore */ }
    window.open(`/desktop/${machineId}`, '_blank', 'noopener');
  };

  // Open a remote-control session in its own tab.
  //
  // Unlike the desktop button above, this joins the session the user is ALREADY
  // sitting in front of, so there are no credentials to collect — the user
  // approves it on their own machine instead. Nothing is passed but the intent;
  // the page drives the whole handshake.
  const handleRemoteControl = (viewOnly: boolean) => {
    if (!machine) return;
    const params = new URLSearchParams({ name: machine.name });
    if (viewOnly) params.set('view_only', '1');
    window.open(`/remote-control/${machine.agent_id}?${params.toString()}`, '_blank', 'noopener');
  };

  // Download a .rdp file and hand it to the native RDP client ("Windows App" /
  // Microsoft Remote Desktop). Native clients render Windows 11 correctly (no black
  // screen), so this is the reliable desktop path. Phase 1 connects directly to the
  // machine IP — works when the client and machine share a network (e.g. a VMware VM).
  const handleOpenInWindowsApp = async () => {
    if (!token || !machine) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082/api';
    const params = new URLSearchParams();
    if (rdpUsername) params.set('username', rdpUsername);
    const host = (rdpHost || machine.ip_address || '').trim();
    if (host) params.set('host', host);
    try {
      const res = await fetch(`${apiUrl}/machines/${machine.agent_id}/rdp/file?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${machine.name || 'windows'}.rdp`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: 'Windows App connection ready',
        description: 'Opening the downloaded .rdp file launches Microsoft Remote Desktop. Enter the machine password when prompted.',
      });
    } catch (e: any) {
      toast({ title: 'Could not create the .rdp file', description: e?.message || 'Failed', variant: 'destructive' });
    }
  };

  const handleGrantAccess = async (username: string) => {
    if (!token || !machine?.agent_id) return;

    try {
      await machinesAPI.grantAccess(token, machine.agent_id, username);
      toast({
        title: "Success",
        description: `Access granted to ${username}`,
      });
      loadAccessUsers();
      setSearchUser('');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to grant access",
        variant: "destructive",
      });
    }
  };

  const handleRevokeAccess = async (username: string) => {
    if (!token || !machine?.agent_id) return;

    try {
      await machinesAPI.revokeAccess(token, machine.agent_id, username);
      toast({
        title: "Success",
        description: `Access revoked from ${username}`,
      });
      loadAccessUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke access",
        variant: "destructive",
      });
    }
  };

  const handleDeleteMachine = () => {
    setDeleteConfirmName('');
    setDeleteDialogOpen(true);
  };

  const confirmDeleteMachine = async () => {
    if (!token || !machine?.agent_id) return;
    setDeleteLoading(true);
    try {
      await machinesAPI.deleteMachine(token, machine.agent_id);
      toast({
        title: "Success",
        description: "Machine deleted successfully",
      });
      window.location.href = '/machines';
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete machine",
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleOpenUpdate = async () => {
    if (!token || !machine?.agent_id) return;
    setUpdateInfo(null);
    setUpdateDialogOpen(true);
    setUpdateChecking(true);
    try {
      const info = await machinesAPI.checkAgentUpdate(token, machine.agent_id);
      setUpdateInfo(info);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to check for updates",
        variant: "destructive",
      });
      setUpdateDialogOpen(false);
    } finally {
      setUpdateChecking(false);
    }
  };

  const confirmUpdateAgent = async () => {
    if (!token || !machine?.agent_id) return;
    setUpdateLoading(true);
    try {
      await machinesAPI.updateAgent(token, machine.agent_id);
      toast({
        title: "Update started",
        description: "The agent will download, update, and restart. It will reconnect shortly with the new version.",
      });
      setUpdateDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to trigger update",
        variant: "destructive",
      });
    } finally {
      setUpdateLoading(false);
    }
  };

  useEffect(() => {
    loadMachineDetails();

    // Refresh details every 5 seconds — but NOT while a remote-desktop session is
    // open. The 5s setMachine re-render was churning the RDP session (repeated
    // connects → guacd "User is not responding"/"Disconnected by other connection"),
    // so the desktop never finished painting. Pause polling while connected.
    if (rdpConnected) return;
    const interval = setInterval(loadMachineDetails, 5000);
    return () => clearInterval(interval);
  }, [machineId, token, rdpConnected]);

  // Windows (desktop) machines only expose Active Sessions + Recordings — if the
  // hidden terminal-log subtabs were selected, fall back to Active Sessions.
  useEffect(() => {
    if (machine?.os?.toLowerCase().includes('windows') && (logsSubTab === 'entire' || logsSubTab === 'sessions')) {
      setLogsSubTab('active');
    }
  }, [machine?.os, logsSubTab]);

  // Poll live desktop sessions every 5s (lightweight) so the UI shows who is connected.
  useEffect(() => {
    if (!machine?.agent_id || !token) return;
    loadDesktopSessions();
    const iv = setInterval(loadDesktopSessions, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine?.agent_id, token]);

  // Poll external SSH/RDP access events (for the overview warning + Access History tab).
  const loadAccessEvents = async () => {
    if (!token || !machine?.agent_id) return;
    try {
      const data = await machinesAPI.getAccessEvents(token, machine.agent_id);
      setAccessEvents(Array.isArray(data?.events) ? data.events : []);
      setActiveAccess(Array.isArray(data?.active) ? data.active : []);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!machine?.agent_id || !token) return;
    loadAccessEvents();
    const iv = setInterval(loadAccessEvents, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine?.agent_id, token]);

  // Load logs, sessions and access users when machine is loaded
  useEffect(() => {
    if (machine?.agent_id) {
      loadLogs(1);
      loadAccessUsers();
      loadActiveSessions();
      loadAllSessions(1);
    }
  }, [machine?.agent_id, token]);

  // Fetch the installed agent version for the Overview tab (silent — the "Check for
  // Updates" dialog re-fetches this itself when opened, so failures here are harmless).
  useEffect(() => {
    if (!machine?.agent_id || !token) return;
    machinesAPI.checkAgentUpdate(token, machine.agent_id)
      .then(setUpdateInfo)
      .catch(() => {});
  }, [machine?.agent_id, token]);

  // Load recordings when the recordings OR users sub-tab is selected (the Users tab
  // derives past usage from recordings — each recording is one past session).
  useEffect(() => {
    if ((logsSubTab === 'recordings' || logsSubTab === 'users') && machine?.agent_id) {
      loadRecordings();
    }
  }, [logsSubTab, machine?.agent_id]);

  // Keep ref in sync so unmount cleanup always sees latest sessions
  useEffect(() => {
    terminalSessionsRef.current = terminalSessions;
  }, [terminalSessions]);

  // Initialize first terminal session when tab is opened
  useEffect(() => {
    if (activeTab === 'terminal' && token && terminalSessionsRef.current.length === 0) {
      createNewSession();
    }

    // Resize terminals when tab changes
    if (activeTab === 'terminal') {
      setTimeout(() => {
        terminalSessionsRef.current.forEach(session => {
          const xtermInstance = (window as any)[`xterm_${session.id}`];
          if (xtermInstance?.fit) {
            xtermInstance.fit();
          }
        });
      }, 100);
    }
  }, [activeTab, token]);

  // Disconnect all sessions only when the component unmounts
  useEffect(() => {
    return () => {
      terminalSessionsRef.current.forEach(session => {
        if (session.websocket) {
          session.websocket.disconnect();
        }
      });
    };
  }, []);

  // Load all users when dialog opens
  useEffect(() => {
    if (accessDialogOpen && allUsers.length === 0) {
      loadAllUsers();
    }
  }, [accessDialogOpen]);

  const createNewSession = () => {
    if (!token || !machine?.agent_id) return;

    const sessionId = `session-${Date.now()}`;
    const sessionName = `Terminal ${terminalSessions.length + 1}`;
    const terminal = new TerminalWebSocket(machine.agent_id, token, undefined, branding.terminal_idle_timeout_minutes);

    const newSession = {
      id: sessionId,
      name: sessionName,
      connected: false,
      websocket: terminal,
    };

    terminal.onConnect = () => {
      updateSessionConnection(sessionId, true);
      writeToTerminal(sessionId, `Connected to ${machine?.name || 'terminal'}\r\n`);
    };

    terminal.onDisconnect = () => {
      updateSessionConnection(sessionId, false);
      writeToTerminal(sessionId, '\r\nDisconnected from terminal\r\n');
    };

    terminal.onIdleTimeout = () => {
      const minutes = terminal.getIdleTimeoutMinutes();
      writeToTerminal(
        sessionId,
        `\r\n[Session timed out after ${minutes} minute${minutes === 1 ? '' : 's'} of inactivity — click '+' to start a new session]\r\n`,
      );
    };

    terminal.onSessionRenewed = () => {
      writeToTerminal(sessionId, '\r\n[Previous session expired — starting a new session]\r\n');
    };

    terminal.onMessage = (message) => {
      if (message.type === 'output' && message.output) {
        writeToTerminal(sessionId, message.output);
      } else if (message.type === 'error' && message.error) {
        writeToTerminal(sessionId, `\r\n[ERROR] ${message.error}\r\n`);
      }
    };

    terminal.onError = (error) => {
      writeToTerminal(sessionId, `\r\n[ERROR] ${error}\r\n`);
    };

    terminal.connect();

    setTerminalSessions(prev => [...prev, newSession]);
    setActiveSessionId(sessionId);

    // Resize terminal after creation
    setTimeout(() => {
      const xtermInstance = (window as any)[`xterm_${sessionId}`];
      if (xtermInstance?.fit) {
        xtermInstance.fit();
      }
    }, 100);
  };

  const closeSession = (sessionId: string) => {
    const session = terminalSessions.find(s => s.id === sessionId);
    if (session?.websocket) {
      session.websocket.disconnect();
    }

    const updatedSessions = terminalSessions.filter(s => s.id !== sessionId);
    setTerminalSessions(updatedSessions);

    if (activeSessionId === sessionId) {
      setActiveSessionId(updatedSessions.length > 0 ? updatedSessions[0].id : null);
    }
  };

  const updateSessionConnection = (sessionId: string, connected: boolean) => {
    setTerminalSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, connected } : s)
    );
  };

  // Write to xterm terminal
  const writeToTerminal = (sessionId: string, data: string) => {
    const xtermInstance = (window as any)[`xterm_${sessionId}`];
    if (xtermInstance) {
      xtermInstance.write(data);
    }
  };

  // Handle data from xterm (user input)
  const handleTerminalData = (sessionId: string, data: string) => {
    const session = terminalSessions.find(s => s.id === sessionId);
    if (!session?.websocket) return;

    // Send input to agent
    session.websocket.sendInput(data);
  };

  const activeSession = terminalSessions.find(s => s.id === activeSessionId);

  const formatLastActive = (lastActive: string) => {
    if (!lastActive) return 'Never';
    const date = new Date(lastActive);
    // Zero time from Go (year 0001) means never set
    if (date.getFullYear() < 2000) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 0) return 'Just now';
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  const getOSLogo = (os?: string): string | null => {
    const o = os?.toLowerCase() || '';
    if (!o) return null;
    if (o.includes('debian') || o.includes('ubuntu') || o.includes('kali')) return 'https://www.debian.org/logos/openlogo-nd.svg';
    if (o.includes('rocky') || o.includes('centos') || o.includes('rhel') || o.includes('red hat') || o.includes('fedora')) return 'https://www.svgrepo.com/show/354273/redhat-icon.svg';
    if (o.includes('darwin') || o.includes('macos') || o.includes('mac os')) return 'https://www.svgrepo.com/show/503173/apple-logo.svg';
    if (o.includes('windows')) return 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Windows_logo_-_2021.svg/960px-Windows_logo_-_2021.svg.png';
    return null;
  };

  const getUsageStatus = (percent: number) => {
    if (percent >= 85) return { label: 'Critical', text: 'text-destructive', bar: 'bg-destructive' };
    if (percent >= 60) return { label: 'High', text: 'text-warning', bar: 'bg-warning' };
    return { label: 'Normal', text: 'text-success', bar: 'bg-success' };
  };

  // Only the machine owner can remove a user's access — matches the backend's
  // RevokeAccess authorization, which is owner-only.
  const isMachineOwner = !!machine && user?.id === machine.owner_id;

  const accessUsersQuery = accessUsersSearch.trim().toLowerCase();
  const filteredAccessUsers = accessUsersQuery
    ? accessUsers.filter(u =>
        u.username.toLowerCase().includes(accessUsersQuery) ||
        u.email.toLowerCase().includes(accessUsersQuery)
      )
    : accessUsers;

  if (loading) {
    return (
      <div className="animate-fade-in">
        <Breadcrumb items={[{ label: 'Machines', href: '/machines' }]} className="mb-6" />
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="animate-fade-in">
        <Breadcrumb items={[{ label: 'Machines', href: '/machines' }]} className="mb-6" />
        <div className="flex flex-col items-center justify-center h-64">
          <Monitor className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Machine not found</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: 'Machines', href: '/machines' },
          { label: machine.name }
        ]}
        className="mb-6"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Monitor className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{machine.name}</h1>
              <div className="flex items-center gap-2">
                {machine.is_connected && machine.status === 'online' && (
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                )}
                <Badge variant="outline" className={cn(
                  "capitalize",
                  machine.status === 'online' && 'bg-success/10 text-success border-success/20',
                  machine.status === 'offline' && 'bg-destructive/10 text-destructive border-destructive/20',
                  machine.status === 'pending' && 'bg-warning/10 text-warning border-warning/20'
                )}>
                  {machine.is_connected && machine.status === 'online' ? 'Connected' : machine.status}
                </Badge>
              </div>
            </div>
            <p className="text-muted-foreground">{machine.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Remote control is offered only where the agent can actually do it:
              it needs a graphical desktop, so Linux machines are terminal-only. */}
          {machine.is_connected && isDesktopOS(machine.os) && (
            <Button onClick={() => handleRemoteControl(false)}>
              <MonitorSmartphone className="w-4 h-4 mr-2" />
              Remote Control
            </Button>
          )}
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Actions
              <MoreHorizontal className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {machine.is_connected && isDesktopOS(machine.os) && (
              <DropdownMenuItem onClick={() => handleRemoteControl(true)}>
                <MonitorSmartphone className="w-4 h-4 mr-2" />
                Remote Control (view only)
              </DropdownMenuItem>
            )}
            {(user?.id === machine.owner_id || user?.role === 'company_admin' || user?.role === 'super_admin') && (
              <DropdownMenuItem onClick={handleOpenUpdate}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Update Agent
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={handleDeleteMachine}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Pending Machine Banner */}
      {machine.status === 'pending' && (
        <Card className="mb-6 border-warning/50 bg-warning/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-warning mb-1">Machine Not Connected</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  This machine is pending connection. Run the following command on your target machine to connect it:
                </p>
                <div className="relative">
                  <pre className="bg-muted/50 rounded-lg p-3 text-xs overflow-x-auto font-mono">
{`sudo wxt-agent configure \\
  --token "${machine.registration_token}" \\
  --host "YOUR_SERVER_URL" --allow-sudo`}
                  </pre>
                  <button
                    onClick={async () => {
                      const command = `sudo wxt-agent configure --token "${machine.registration_token}" --host "YOUR_SERVER_URL" --allow-sudo`;
                      if (!(await copyToClipboard(command))) {
                        toast({
                          title: "Could not copy",
                          description: "Your browser blocked clipboard access — select the command and copy it manually.",
                          variant: "destructive",
                        });
                        return;
                      }
                      toast({
                        title: "Copied",
                        description: "Command copied to clipboard",
                      });
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded hover:bg-muted transition-colors"
                  >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="gap-2">
            <Monitor className="w-4 h-4" />
            Overview
          </TabsTrigger>
          {/* Windows and macOS get the same thing: the user's live desktop.
              Terminal is for machines with no desktop to take over. */}
          {isDesktopOS(machine.os) ? (
            <TabsTrigger value="remote-control" className="gap-2">
              <MonitorSmartphone className="w-4 h-4" />
              Remote Control
            </TabsTrigger>
          ) : (
            <TabsTrigger value="terminal" className="gap-2">
              <Terminal className="w-4 h-4" />
              Terminal
            </TabsTrigger>
          )}
          {/* EPM: RDP/Desktop disabled — remote control joins the user's live session instead; re-enable later
          {machine.os?.toLowerCase().includes('windows') ? (
            <TabsTrigger value="desktop" className="gap-2">
              <Monitor className="w-4 h-4" />
              Desktop
            </TabsTrigger>
          ) : null}
          */}
          <TabsTrigger value="access-users" className="gap-2">
            <Users className="w-4 h-4" />
            Access Users
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-2">
            <Activity className="w-4 h-4" />
            Monitoring
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <FileText className="w-4 h-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-2">
            <Package className="w-4 h-4" />
            Applications
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <ShieldAlert className="w-4 h-4" />
            Security
            {activeAccess.length > 0 && (
              <span className="ml-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {activeAccess.length > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
              <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Direct access detected — someone is connected outside the portal</p>
                <p className="text-sm mt-1 opacity-90">
                  {activeAccess.length} active {activeAccess.length > 1 ? 'sessions' : 'session'}:{' '}
                  {activeAccess.map((s) => `${s.os_user}@${s.source_ip || 'unknown'} (${(s.protocol || 'ssh').toUpperCase()})`).join(', ')}
                </p>
                <button
                  onClick={() => setActiveTab('security')}
                  className="text-sm font-medium underline underline-offset-2 mt-2"
                >
                  View access history →
                </button>
              </div>
            </div>
          )}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Machine Info column */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Operating System — actual OS logo */}
                <div className="stat-card flex items-center gap-3">
                  {getOSLogo(machine.os) ? (
                    <img src={getOSLogo(machine.os)!} alt={machine.os} className="w-10 h-10 object-contain shrink-0" />
                  ) : (
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                      <Monitor className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">Operating System</p>
                    <p className="font-semibold text-sm mt-0.5 truncate" title={machine.os}>{machine.os}</p>
                  </div>
                </div>

                {/* Agent Version */}
                <div className="stat-card flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">Agent Version</p>
                    <p className="font-semibold text-sm mt-0.5 font-mono">{updateInfo?.current_version || '—'}</p>
                  </div>
                </div>
              </div>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">Machine Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {[
                    { label: 'IP Address', value: machine.ip_address, mono: true },
                    { label: 'Last Active', value: formatLastActive(machine.last_active), mono: false },
                    { label: 'Uptime', value: formatUptime(machine.uptime || machine.resource_stats?.uptime_seconds || 0), mono: false },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-center py-2.5 border-b border-border/40 last:border-0">
                      <span className="text-sm text-muted-foreground">{row.label}</span>
                      <span className={cn("text-sm font-medium", row.mono && "font-mono")}>{row.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Active Sessions summary — full interactive view also lives in Logs & Sessions */}
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Active Sessions ({machine.os?.toLowerCase().includes('windows') ? desktopSessions.length : activeSessions.length})
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setActiveTab('logs'); setLogsSubTab('active'); }}
                >
                  View all
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                <ActiveSessionsPanel
                  machine={machine}
                  desktopSessions={desktopSessions}
                  activeSessions={activeSessions}
                  machineId={machineId}
                />
              </CardContent>
            </Card>
          </div>

          {/* Resource stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { key: 'cpu', label: 'CPU Usage', icon: Cpu, percent: machine.resource_stats.cpu_percent },
              { key: 'memory', label: 'Memory', icon: HardDriveIcon, percent: machine.resource_stats.memory_percent },
              { key: 'disk', label: 'Disk', icon: HardDrive, percent: machine.resource_stats.disk_percent },
            ] as const).map(({ key, label, icon: Icon, percent }) => {
              const status = getUsageStatus(percent);
              return (
                <div key={key} className="stat-card">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground font-medium">{label}</p>
                      <p className="text-3xl font-bold mt-2 tracking-tight">{percent.toFixed(1)}%</p>
                      <p className={cn("text-xs mt-1 font-medium", status.text)}>{status.label}</p>
                    </div>
                    <div className={cn("flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 shrink-0", status.text)}>
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <Progress value={percent} className="h-1.5 mt-4" indicatorClassName={status.bar} />
                </div>
              );
            })}

            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Network I/O</p>
                  <div className="mt-2 space-y-0.5">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <ArrowDown className="w-3.5 h-3.5 text-success" />
                      {((machine.resource_stats.network_inbound || 0) * 1024).toFixed(1)} KB/s
                    </p>
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <ArrowUp className="w-3.5 h-3.5 text-primary" />
                      {((machine.resource_stats.network_outbound || 0) * 1024).toFixed(1)} KB/s
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0">
                  <Wifi className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Access Users Tab */}
        <TabsContent value="access-users">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                Access Users ({filteredAccessUsers.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={accessUsersSearch}
                    onChange={(e) => { setAccessUsersSearch(e.target.value); setAccessUsersPage(1); }}
                    className="pl-9 w-56"
                  />
                </div>
                {isMachineOwner && (
                  <Button size="sm" onClick={() => setAccessDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {accessUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No users with access</h3>
                  <p className="text-muted-foreground mb-4">
                    {isMachineOwner
                      ? 'Grant access to users to allow them to manage this machine'
                      : 'No one else has been granted access to this machine yet'}
                  </p>
                  {isMachineOwner && (
                    <Button size="sm" onClick={() => setAccessDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add User
                    </Button>
                  )}
                </div>
              ) : filteredAccessUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No matching users</h3>
                  <p className="text-muted-foreground">No access users match &quot;{accessUsersSearch}&quot;</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Granted</TableHead>
                        {isMachineOwner && <TableHead className="w-12"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAccessUsers
                        .slice((accessUsersPage - 1) * itemsPerPage, accessUsersPage * itemsPerPage)
                        .map((user, index) => (
                        <TableRow key={`${user.username}-${index}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{user.username}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(user.granted_at).toLocaleDateString()}
                          </TableCell>
                          {isMachineOwner && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleRevokeAccess(user.username)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination for Access Users */}
                  {filteredAccessUsers.length > itemsPerPage && (() => {
                    const totalAccessPages = Math.ceil(filteredAccessUsers.length / itemsPerPage);
                    return (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          Showing {((accessUsersPage - 1) * itemsPerPage) + 1} to {Math.min(accessUsersPage * itemsPerPage, filteredAccessUsers.length)} of {filteredAccessUsers.length} users
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={accessUsersPage === 1}
                            onClick={() => setAccessUsersPage(p => p - 1)}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          {Array.from({ length: totalAccessPages }, (_, i) => i + 1).map(page => (
                            <Button
                              key={page}
                              variant={accessUsersPage === page ? 'default' : 'outline'}
                              size="icon"
                              onClick={() => setAccessUsersPage(page)}
                            >
                              {page}
                            </Button>
                          ))}
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={accessUsersPage === totalAccessPages}
                            onClick={() => setAccessUsersPage(p => p + 1)}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Terminal Tab */}
        <TabsContent value="terminal">
          <Card className="glass-card overflow-hidden">
            <div className="terminal-bg flex flex-col min-h-[600px]">
              {/* Terminal Header with Tabs */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/20">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-destructive" />
                  <div className="w-3 h-3 rounded-full bg-warning" />
                  <div className="w-3 h-3 rounded-full bg-success" />
                  <span className="ml-2 text-muted-foreground text-xs">
                    {machine.name} — {machine.ip_address}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/terminal/${machineId}`, '_blank')}
                  className="text-xs text-white hover:text-white"
                >
                  <Monitor className="w-4 h-4 mr-1" />
                  Fullscreen
                </Button>
              </div>

              {/* Session Tabs */}
              <div className="flex items-center gap-1 px-2 py-2 border-b border-border/20 overflow-x-auto scrollbar-thin">
                {terminalSessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-all group min-w-fit",
                      activeSessionId === session.id
                        ? "bg-background/80 text-foreground"
                        : "hover:bg-background/40 text-muted-foreground"
                    )}
                    onClick={() => {
                      setActiveSessionId(session.id);
                      // Resize terminal after switching tabs
                      setTimeout(() => {
                        const xtermInstance = (window as any)[`xterm_${session.id}`];
                        if (xtermInstance?.fit) {
                          xtermInstance.fit();
                        }
                      }, 50);
                    }}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      session.connected ? "bg-success" : "bg-destructive"
                    )} />
                    <span className="text-sm font-medium">{session.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                    >
                      <X className="w-3.5 h-3.5 hover:text-destructive" />
                    </button>
                  </div>
                ))}

                {/* Add New Session Button */}
                <button
                  onClick={createNewSession}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-background/40 transition-colors text-muted-foreground hover:text-foreground min-w-fit"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">New</span>
                </button>
              </div>

              {/* Active Session Content - Render all terminals but show only active one */}
              <div className="flex-1 overflow-hidden relative">
                {terminalSessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "absolute inset-0",
                      session.id === activeSessionId ? 'block' : 'hidden'
                    )}
                  >
                    <XTerminal
                      sessionId={session.id}
                      onData={(data) => handleTerminalData(session.id, data)}
                      onConnect={() => {
                        console.log('XTerm connected for session:', session.id);
                      }}
                      theme={theme === 'dark' || theme === 'system' ? 'dark' : 'light'}
                    />
                  </div>
                ))}

                {terminalSessions.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No active terminal session</p>
                      <Button
                        onClick={createNewSession}
                        variant="outline"
                        size="sm"
                        className="mt-4"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Session
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Desktop Tab (Windows RDP) */}
        {/* Remote Control Tab — the live session the user is already in. */}
        <TabsContent value="remote-control">
          <Card className="glass-card">
            <CardContent className="py-12">
              <div className="mx-auto max-w-lg text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <MonitorSmartphone className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">Remote Control</h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  Join the session this user is already working in. They keep their screen,
                  see everything you do, and have to approve the request before anything is
                  shown to you. The whole session is recorded.
                </p>

                {!machine.is_connected ? (
                  <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                    This machine is offline. Remote control needs the agent connected.
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <Button onClick={() => handleRemoteControl(false)}>
                      <MonitorSmartphone className="mr-2 h-4 w-4" />
                      Start Session
                    </Button>
                    <Button variant="outline" onClick={() => handleRemoteControl(true)}>
                      View Only
                    </Button>
                  </div>
                )}

                <p className="mt-6 text-xs text-muted-foreground">
                  Opens in a new tab. The user is prompted on their machine and can decline.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* EPM: RDP/Desktop disabled — remote control joins the user's live session instead; re-enable later
        <TabsContent value="desktop">
          <Card className="glass-card overflow-hidden">
            {!rdpConnected ? (
              <div className="p-8 max-w-md mx-auto space-y-5">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Monitor className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">Connect to Windows Desktop</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {machine.metadata?.remote_desktop === 'vnc'
                      ? <>This machine uses <strong>VNC</strong> (Windows Home). Enter the VNC password.</>
                      : <>Enter the Windows account credentials for <strong>{machine.name}</strong>.</>}
                  </p>
                </div>

                {!machine.is_connected && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    Agent is offline. It must be online to open a desktop session.
                  </div>
                )}

                {desktopSessions.length > 0 && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm space-y-1.5">
                    <div className="flex items-center gap-2 font-medium text-primary">
                      <Users className="w-4 h-4" />
                      {desktopSessions.length} active desktop session{desktopSessions.length > 1 ? 's' : ''}
                    </div>
                    {desktopSessions.map((s) => (
                      <div key={s.session_id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{s.username || 'user'} · {(s.protocol || 'rdp').toUpperCase()}</span>
                        <span>since {new Date(s.started_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    <p className="text-xs text-warning pt-1">
                      This machine allows one desktop session — connecting will take over any active one.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {machine.metadata?.remote_desktop !== 'vnc' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="rdp-user">Username</Label>
                      <Input id="rdp-user" placeholder="Administrator" value={rdpUsername} onChange={(e) => setRdpUsername(e.target.value)} autoComplete="off" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="rdp-pass">Password</Label>
                    <Input id="rdp-pass" type="password" placeholder="••••••••" value={rdpPassword} onChange={(e) => setRdpPassword(e.target.value)} autoComplete="off"
                      onKeyDown={(e) => { const vnc = machine.metadata?.remote_desktop === 'vnc'; if (e.key === 'Enter' && rdpPassword && (vnc || rdpUsername) && machine.is_connected) setRdpConnected(true); }} />
                  </div>
                  {machine.metadata?.remote_desktop !== 'vnc' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="rdp-domain">Domain <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input id="rdp-domain" placeholder="WORKGROUP" value={rdpDomain} onChange={(e) => setRdpDomain(e.target.value)} autoComplete="off" />
                    </div>
                  )}
                </div>

                <Button className="w-full" disabled={!rdpPassword || (machine.metadata?.remote_desktop !== 'vnc' && !rdpUsername) || !machine.is_connected}
                  onClick={() => { setRdpStatus('connecting'); setRdpConnected(true); }}>
                  <Monitor className="w-4 h-4 mr-2" />
                  Connect in browser
                </Button>

        */}
                {/* Native RDP client option — reliable rendering (no black screen). */}
        {/* EPM: RDP/Desktop disabled — remote control joins the user's live session instead; re-enable later
                {machine.metadata?.remote_desktop !== 'vnc' && (
                  <div className="pt-2 space-y-2 border-t border-border/30">
                    <div className="flex items-center gap-2 pt-2">
                      <div className="flex-1 h-px bg-border/40" />
                      <span className="text-xs text-muted-foreground">or open in a native app</span>
                      <div className="flex-1 h-px bg-border/40" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rdp-host">Machine IP <span className="text-muted-foreground font-normal">(for Windows App)</span></Label>
                      <Input id="rdp-host" placeholder="e.g. 192.168.x.x" value={rdpHost} onChange={(e) => setRdpHost(e.target.value)} autoComplete="off" />
                    </div>
                    <Button variant="outline" className="w-full" onClick={handleOpenInWindowsApp}>
                      <Monitor className="w-4 h-4 mr-2" />
                      Open in Windows App
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Downloads a .rdp file — open it with Microsoft Remote Desktop (&ldquo;Windows App&rdquo;) and enter the machine password.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Credentials are used only to open this session and are not stored.
                </p>
              </div>
            ) : (
              <div className="flex flex-col min-h-[600px]">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/20 bg-muted/30">
                  <span className="text-sm text-muted-foreground">
                    {machine.name} — {machine.metadata?.remote_desktop === 'vnc' ? 'VNC Desktop' : 'Windows Desktop'} {rdpStatus === 'connected' ? '(connected)' : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={handleOpenFullscreen} title="Open in a new full-screen tab">
                      <Maximize2 className="w-4 h-4 mr-1" />
                      Full screen
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setRdpConnected(false); setRdpStatus('idle'); }}>
                      <X className="w-4 h-4 mr-1" />
                      Disconnect
                    </Button>
                  </div>
                </div>
                <div className="flex-1">
                  <RemoteDesktop
                    agentId={machine.agent_id}
                    token={token || ''}
                    protocol={machine.metadata?.remote_desktop === 'vnc' ? 'vnc' : 'rdp'}
                    username={rdpUsername}
                    password={rdpPassword}
                    domain={rdpDomain}
                    onStateChange={(s) => setRdpStatus(s === 'connected' ? 'connected' : s === 'error' ? 'error' : 'connecting')}
                    onExit={() => { setRdpConnected(false); setRdpStatus('idle'); }}
                  />
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
        */}

        {/* Monitoring Tab */}
        <TabsContent value="monitoring" className="space-y-8">
          {(() => {
            const rs = machine.resource_stats;
            const cores = Number(machine.metadata?.cpu_cores) || 0;
            const memTotalGB = (Number(machine.metadata?.mem_total_mb) || 0) / 1024;
            const diskTotalGB = Number(machine.metadata?.disk_total_gb) || 0;
            const coresUsed = (rs.cpu_percent / 100) * cores;
            const memUsedGB = (rs.memory_percent / 100) * memTotalGB;
            const diskUsedGB = (rs.disk_percent / 100) * diskTotalGB;
            return (
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary" /> Machine Monitoring
                </h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cpu className="w-5 h-5 text-primary" /> CPU</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{coresUsed.toFixed(2)} <span className="text-lg text-muted-foreground font-normal">/ {cores || '?'} cores</span></div>
                      <Progress value={rs.cpu_percent} className="h-3 my-3" />
                      <p className="text-sm text-muted-foreground">{rs.cpu_percent.toFixed(1)}% used</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><HardDrive className="w-5 h-5 text-warning" /> Memory</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{memUsedGB.toFixed(2)} <span className="text-lg text-muted-foreground font-normal">/ {memTotalGB.toFixed(1)} GB</span></div>
                      <Progress value={rs.memory_percent} className="h-3 my-3" />
                      <p className="text-sm text-muted-foreground">{rs.memory_percent.toFixed(1)}% used</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><HardDrive className="w-5 h-5 text-success" /> Storage</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{diskUsedGB.toFixed(1)} <span className="text-lg text-muted-foreground font-normal">/ {diskTotalGB || '?'} GB</span></div>
                      <Progress value={rs.disk_percent} className="h-3 my-3" />
                      <p className="text-sm text-muted-foreground">{rs.disk_percent.toFixed(1)}% used</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card md:col-span-3">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wifi className="w-5 h-5" /> Network</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <div>
                          <p className="text-muted-foreground mb-1">Inbound</p>
                          <p className="text-2xl font-bold">{(rs.network_inbound || 0).toFixed(2)} MB/s</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Outbound</p>
                          <p className="text-2xl font-bold">{(rs.network_outbound || 0).toFixed(2)} MB/s</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })()}

          {/* Agent Monitoring */}
          {(() => {
            const as = machine.agent_stats;
            const fmtUptime = (s?: number) => {
              if (!s || s <= 0) return '—';
              const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
              return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
            };
            return (
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" /> Agent Monitoring
                </h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base">gRPC Tunnel</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <span className={cn("w-3 h-3 rounded-full", machine.is_connected ? "bg-green-500 animate-pulse" : "bg-gray-400")} />
                        <span className="text-2xl font-bold">{machine.is_connected ? 'Active' : 'Down'}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">Agent v{as?.version || machine.metadata?.version || '?'}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cpu className="w-5 h-5 text-primary" /> Agent CPU</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{as ? (as.cpu_percent / 100).toFixed(2) : '—'} <span className="text-lg text-muted-foreground font-normal">cores</span></div>
                      <p className="text-sm text-muted-foreground mt-2">{as ? `${as.cpu_percent.toFixed(1)}% of one core` : 'Process usage'}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><HardDrive className="w-5 h-5 text-warning" /> Agent RAM</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{as ? as.memory_mb.toFixed(0) : '—'} <span className="text-lg text-muted-foreground font-normal">MB</span></div>
                      <p className="text-sm text-muted-foreground mt-2">Resident memory</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Monitor className="w-5 h-5 text-primary" /> Open Tunnels</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{as ? as.open_tunnels : '—'}</div>
                      <p className="text-sm text-muted-foreground mt-2">Active RDP/VNC relays</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Terminal className="w-5 h-5 text-success" /> Terminal Sessions</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{as ? as.open_sessions : '—'}</div>
                      <p className="text-sm text-muted-foreground mt-2">Active PTY sessions</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card">
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-5 h-5" /> Agent Uptime</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{fmtUptime(as?.uptime_sec)}</div>
                      <p className="text-sm text-muted-foreground mt-2">{as ? `${as.goroutines} goroutines` : 'no data yet'}</p>
                    </CardContent>
                  </Card>
                </div>
                {!as && (
                  <p className="text-sm text-muted-foreground mt-3">Agent stats appear within ~30s of the agent connecting (needs the updated agent).</p>
                )}
              </div>
            );
          })()}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Logs & Sessions
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search commands..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9 w-64"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      onClick={clearSearch}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => handleSearch(1)}>
                  Search
                </Button>
                <Button size="sm" variant="outline" onClick={() => { loadLogs(1); loadActiveSessions(); loadAllSessions(1); }}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Sub-tabs for logs */}
              <Tabs value={logsSubTab} onValueChange={(v) => setLogsSubTab(v as 'active' | 'entire' | 'sessions' | 'recordings' | 'users')}>
                <TabsList className="mb-4">
                  <TabsTrigger value="active" className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Active Sessions ({machine.os?.toLowerCase().includes('windows') ? desktopSessions.length : activeSessions.length})
                  </TabsTrigger>
                  <TabsTrigger value="users" className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Users
                  </TabsTrigger>
                  {/* Terminal command logs are irrelevant for Windows (desktop) machines. */}
                  {!machine.os?.toLowerCase().includes('windows') && (
                    <>
                      <TabsTrigger value="entire" className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Entire Logs ({searchResults ? searchTotal : logsTotal})
                      </TabsTrigger>
                      <TabsTrigger value="sessions" className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Session Logs ({sessionsTotal})
                      </TabsTrigger>
                    </>
                  )}
                  <TabsTrigger value="recordings" className="flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Session Recordings ({recordingsTotal})
                  </TabsTrigger>
                </TabsList>

                {/* Active Sessions Tab */}
                <TabsContent value="active">
                  <ActiveSessionsPanel
                    machine={machine}
                    desktopSessions={desktopSessions}
                    activeSessions={activeSessions}
                    machineId={machineId}
                  />
                </TabsContent>

                {/* Users Tab — who is active now + who has used this machine */}
                <TabsContent value="users">
                  {(() => {
                    const isWin = machine.os?.toLowerCase().includes('windows');
                    // Active users right now.
                    const activeUsers = isWin
                      ? desktopSessions.map((s) => ({ username: s.username || 'user', detail: `${(s.protocol || 'rdp').toUpperCase()} desktop`, since: s.started_at }))
                      : activeSessions.map((s) => ({ username: s.username, detail: (s.source?.toUpperCase() || 'UI'), since: s.created_at }));

                    // Usage history aggregated from recordings (each recording = one past session).
                    const byUser: Record<string, { username: string; count: number; last: string; totalSecs: number }> = {};
                    for (const r of recordings) {
                      const u = r.username || 'user';
                      if (!byUser[u]) byUser[u] = { username: u, count: 0, last: r.created_at, totalSecs: 0 };
                      byUser[u].count += 1;
                      byUser[u].totalSecs += r.duration_seconds || 0;
                      if (new Date(r.created_at) > new Date(byUser[u].last)) byUser[u].last = r.created_at;
                    }
                    const history = Object.values(byUser).sort((a, b) => new Date(b.last).getTime() - new Date(a.last).getTime());

                    return (
                      <div className="space-y-6">
                        <div>
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Active now ({activeUsers.length})
                          </h4>
                          {activeUsers.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No one is connected right now.</p>
                          ) : (
                            <div className="space-y-2">
                              {activeUsers.map((u, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                                      {(u.username || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="font-medium">{u.username}</p>
                                      <p className="text-xs text-muted-foreground">{u.detail}</p>
                                    </div>
                                  </div>
                                  <span className="text-xs text-muted-foreground">since {new Date(u.since).toLocaleTimeString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" /> Used this machine ({history.length})
                          </h4>
                          {history.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No recorded usage yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {history.map((u) => {
                                const isActive = activeUsers.some((a) => a.username === u.username);
                                return (
                                  <div key={u.username} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                        {u.username.charAt(0).toUpperCase()}
                                      </div>
                                      <div>
                                        <p className="font-medium flex items-center gap-2">
                                          {u.username}
                                          {isActive && <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">online</Badge>}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{u.count} session{u.count > 1 ? 's' : ''}</p>
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">last: {new Date(u.last).toLocaleString()}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>

                {/* Entire Logs Tab */}
                <TabsContent value="entire">
                  {(() => {
                    const displayLogs = searchResults !== null ? searchResults : logs;
                    const displayTotal = searchResults !== null ? searchTotal : logsTotal;
                    const displayTotalPages = searchResults !== null ? searchTotalPages : logsTotalPages;
                    const onPageChange = (p: number) => {
                      setLogsPage(p);
                      if (searchResults !== null) {
                        handleSearch(p);
                      } else {
                        loadLogs(p);
                      }
                    };
                    return displayLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          {searchResults !== null ? 'No matching logs' : 'No command logs'}
                        </h3>
                        <p className="text-muted-foreground">
                          {searchResults !== null ? 'Try a different search query' : 'Commands executed on this machine will appear here'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Command</TableHead>
                              <TableHead>User</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Time</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displayLogs.map((log) => (
                              <TableRow key={log.id}>
                                <TableCell className="font-mono text-sm max-w-md">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="truncate block cursor-help">{log.command}</span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-lg">
                                        <p className="font-mono text-xs break-all whitespace-pre-wrap">{log.command}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">{log.username}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn(
                                    log.source === 'vscode' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                    log.source === 'cli' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                    "bg-purple-500/10 text-purple-500 border-purple-500/20"
                                  )}>
                                    {log.source?.toUpperCase() || 'UI'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {new Date(log.timestamp).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn(
                                    log.success
                                      ? "bg-success/10 text-success border-success/20"
                                      : "bg-destructive/10 text-destructive border-destructive/20"
                                  )}>
                                    {log.success ? 'Success' : 'Failed'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        {/* Pagination for Logs */}
                        {displayTotalPages > 1 && (
                          <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <p className="text-sm text-muted-foreground">
                              Showing {((logsPage - 1) * itemsPerPage) + 1} to {Math.min(logsPage * itemsPerPage, displayTotal)} of {displayTotal} logs
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={logsPage === 1}
                                onClick={() => onPageChange(logsPage - 1)}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                              {Array.from({ length: Math.min(displayTotalPages, 5) }, (_, i) => i + 1).map(p => (
                                <Button
                                  key={p}
                                  variant={logsPage === p ? 'default' : 'outline'}
                                  size="icon"
                                  onClick={() => onPageChange(p)}
                                >
                                  {p}
                                </Button>
                              ))}
                              {displayTotalPages > 5 && <span className="text-muted-foreground">...</span>}
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={logsPage === displayTotalPages}
                                onClick={() => onPageChange(logsPage + 1)}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </TabsContent>

                {/* Session Logs Tab */}
                <TabsContent value="sessions">
                  {allSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No session history</h3>
                      <p className="text-muted-foreground">Terminal session history will appear here</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {allSessions.map((session) => (
                          <Link
                            key={session.session_id}
                            href={`/machines/details/${machineId}/session/${session.session_id}`}
                            className="block"
                          >
                            <div className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-3 h-3 rounded-full",
                                    session.status === 'active' ? "bg-green-500" : "bg-gray-400"
                                  )} />
                                  <div>
                                    <p className="font-medium">{session.username}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {session.session_id.slice(0, 25)}...
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-center">
                                    <Badge variant="outline" className={cn(
                                      session.source === 'vscode' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                      session.source === 'cli' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                      "bg-purple-500/10 text-purple-500 border-purple-500/20"
                                    )}>
                                      {session.source?.toUpperCase() || 'UI'}
                                    </Badge>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-medium">{session.command_count}</p>
                                    <p className="text-xs text-muted-foreground">Commands</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm">{session.os_info || 'Unknown'}</p>
                                    <p className="text-xs text-muted-foreground">OS</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm">{new Date(session.created_at).toLocaleDateString()}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(session.created_at).toLocaleTimeString()}
                                    </p>
                                  </div>
                                  <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                                    {session.status}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>

                      {/* Pagination for Sessions */}
                      {sessionsTotalPages > 1 && (() => {
                        return (
                          <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <p className="text-sm text-muted-foreground">
                              Showing {((sessionsPage - 1) * itemsPerPage) + 1} to {Math.min(sessionsPage * itemsPerPage, sessionsTotal)} of {sessionsTotal} sessions
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={sessionsPage === 1}
                                onClick={() => { setSessionsPage(p => p - 1); loadAllSessions(sessionsPage - 1); }}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                              {Array.from({ length: Math.min(sessionsTotalPages, 5) }, (_, i) => i + 1).map(p => (
                                <Button
                                  key={p}
                                  variant={sessionsPage === p ? 'default' : 'outline'}
                                  size="icon"
                                  onClick={() => { setSessionsPage(p); loadAllSessions(p); }}
                                >
                                  {p}
                                </Button>
                              ))}
                              <Button
                                variant="outline"
                                size="icon"
                                disabled={sessionsPage === sessionsTotalPages}
                                onClick={() => { setSessionsPage(p => p + 1); loadAllSessions(sessionsPage + 1); }}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </TabsContent>

                {/* Session Recordings Tab */}
                <TabsContent value="recordings">
                  {recordingsLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Loading recordings…
                    </div>
                  ) : s3Enabled === false ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Video className="w-12 h-12 text-muted-foreground/30 mb-4" />
                      <h3 className="text-lg font-medium mb-2">S3 recording is disabled</h3>
                      <p className="text-muted-foreground text-sm max-w-sm">
                        Session recordings are only saved when S3 is enabled.
                        Go to <strong>Settings → Configuration</strong> and enable S3 to start recording terminal sessions.
                      </p>
                    </div>
                  ) : recordings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Video className="w-12 h-12 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No recordings yet</h3>
                      <p className="text-muted-foreground text-sm max-w-sm">
                        Recordings are uploaded automatically when a terminal session ends.
                        Start a session on this machine to create the first recording.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Session</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead><span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Duration</span></TableHead>
                          <TableHead><span className="flex items-center gap-1"><HardDriveIcon className="w-3.5 h-3.5" />Size</span></TableHead>
                          <TableHead>Recorded At</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recordings.map((rec) => (
                          <TableRow key={rec.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {rec.session_id.slice(0, 24)}…
                            </TableCell>
                            <TableCell>{rec.username}</TableCell>
                            <TableCell>
                              {rec.duration_seconds < 60
                                ? `${rec.duration_seconds}s`
                                : `${Math.floor(rec.duration_seconds / 60)}m ${rec.duration_seconds % 60}s`}
                            </TableCell>
                            <TableCell>
                              {rec.size_bytes < 1024
                                ? `${rec.size_bytes} B`
                                : rec.size_bytes < 1024 * 1024
                                ? `${(rec.size_bytes / 1024).toFixed(1)} KB`
                                : `${(rec.size_bytes / (1024 * 1024)).toFixed(1)} MB`}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(rec.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="default"
                                  size="sm"
                                  disabled={recordingURLLoading === rec.id}
                                  onClick={() => handlePlayRecording(rec)}
                                  className="gap-1.5"
                                >
                                  {recordingURLLoading === rec.id
                                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    : <Play className="w-3.5 h-3.5" />}
                                  Play
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!!convertingId || recordingURLLoading === rec.id}
                                  onClick={() => handleDownloadRecording(rec)}
                                  className="gap-1.5"
                                >
                                  {convertingId === rec.id
                                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    : <Download className="w-3.5 h-3.5" />}
                                  {convertingId === rec.id ? 'Converting…' : 'Download MP4'}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab — external SSH/RDP access history */}
        {/* Applications Tab — what software this machine reports.
            Mounted only when selected: the component fetches on mount, and
            there is no reason to pull an inventory for a tab nobody opened. */}
        <TabsContent value="applications" className="space-y-6">
          {activeTab === 'applications' && (
            <>
              <MachineApplications token={token} agentId={machine?.agent_id} />

              {/* What was actually done to this machine's software, under the
                  list of what is on it. Together they answer the two
                  questions anybody opening this tab has: what is installed,
                  and what did we stop. */}
              {machine?.agent_id && (
                <div className="space-y-4 pt-2">
                  <div>
                    <h3 className="text-base font-semibold">Enforcement activity</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Software closed or prevented from launching on this machine. These decisions
                      are made by the agent on the endpoint, so this is the only record of them.
                    </p>
                  </div>
                  <EnforcementActivity agentId={machine.agent_id} />
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" />
                External Access (SSH / RDP)
              </CardTitle>
              <CardDescription>
                Direct logins to this machine, outside the portal. Everyone who uses this
                machine is emailed when a new external session appears.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Active now */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", activeAccess.length > 0 ? "bg-red-500 animate-pulse" : "bg-gray-400")} />
                  Active now ({activeAccess.length})
                </h4>
                {activeAccess.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No external sessions currently active.</p>
                ) : (
                  <div className="space-y-2">
                    {activeAccess.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                        <div className="flex items-center gap-3">
                          <ShieldAlert className="w-4 h-4 text-red-500" />
                          <div>
                            <p className="font-medium">{s.os_user} <span className="text-muted-foreground font-normal">from {s.source_ip || 'unknown'}</span></p>
                            <p className="text-xs text-muted-foreground">{(s.protocol || 'ssh').toUpperCase()} · {s.line}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">since {new Date(s.login_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* History */}
              <div>
                <h4 className="text-sm font-semibold mb-3">History ({accessEvents.length})</h4>
                {accessEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <ShieldAlert className="w-10 h-10 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No external SSH/RDP logins recorded yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border/40">
                          <th className="py-2 pr-4 font-medium">User</th>
                          <th className="py-2 pr-4 font-medium">Protocol</th>
                          <th className="py-2 pr-4 font-medium">From</th>
                          <th className="py-2 pr-4 font-medium">Login</th>
                          <th className="py-2 pr-4 font-medium">Logout</th>
                          <th className="py-2 pr-4 font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accessEvents.map((e) => {
                          const login = new Date(e.login_at);
                          const logout = e.logout_at ? new Date(e.logout_at) : null;
                          const durMs = (logout ? logout.getTime() : Date.now()) - login.getTime();
                          const mins = Math.max(0, Math.floor(durMs / 60000));
                          const dur = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                          return (
                            <tr key={e.id} className="border-b border-border/20">
                              <td className="py-2 pr-4 font-medium">{e.os_user}</td>
                              <td className="py-2 pr-4">
                                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">{(e.protocol || 'ssh').toUpperCase()}</Badge>
                              </td>
                              <td className="py-2 pr-4 text-muted-foreground">{e.source_ip || '—'}</td>
                              <td className="py-2 pr-4 text-muted-foreground">{login.toLocaleString()}</td>
                              <td className="py-2 pr-4">
                                {e.active
                                  ? <span className="text-red-500 font-medium">active</span>
                                  : <span className="text-muted-foreground">{logout ? logout.toLocaleString() : '—'}</span>}
                              </td>
                              <td className="py-2 pr-4 text-muted-foreground">{dur}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Session Recording Player Dialog */}
      <Dialog open={!!playerURL} onOpenChange={(open) => { if (!open) setPlayerURL(null); }}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" />
              Session Recording
            </DialogTitle>
            <DialogDescription>{playerTitle}</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            {playerURL && (playerKind === 'guac'
              ? <GuacRecordingPlayer src={playerURL} />
              : playerKind === 'video'
              ? <video src={playerURL} controls autoPlay className="w-full rounded-md bg-black max-h-[70vh]" />
              : <AsciinemaPlayer src={playerURL} />)}
          </div>
        </DialogContent>
      </Dialog>

      {/* Give Access Dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Access</DialogTitle>
            <DialogDescription>Search for a user to grant access to this machine</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                allUsers
                  .filter(u =>
                    u.username.toLowerCase().includes(searchUser.toLowerCase()) ||
                    u.email.toLowerCase().includes(searchUser.toLowerCase())
                  )
                  .filter(u => !accessUsers.some(au => au.username === u.username))
                  .map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">{user.username[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-medium">{user.username}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => handleGrantAccess(user.username)}>
                        Add
                      </Button>
                    </div>
                  ))
              )}
              {!loadingUsers && allUsers.filter(u =>
                u.username.toLowerCase().includes(searchUser.toLowerCase()) ||
                u.email.toLowerCase().includes(searchUser.toLowerCase())
              ).filter(u => !accessUsers.some(au => au.username === u.username)).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No users found</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeleteConfirmName(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Machine
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              <span className="block">
                This action <strong>cannot be undone</strong>. This will permanently delete the machine{' '}
                <strong>{machine?.name}</strong>.
              </span>
              <span className="block">
                Please type <strong className="text-foreground">{machine?.name}</strong> to confirm.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              placeholder={machine?.name}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && deleteConfirmName === machine?.name) confirmDeleteMachine(); }}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmName(''); }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteConfirmName !== machine?.name || deleteLoading}
                onClick={confirmDeleteMachine}
              >
                {deleteLoading ? 'Deleting...' : 'Delete Machine'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agent Update Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Update Agent
            </DialogTitle>
            <DialogDescription className="pt-2">
              Push the latest agent build to <strong>{machine?.name}</strong>. The agent
              downloads the new package, replaces its binary, and restarts automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {updateChecking ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Checking versions…
              </div>
            ) : updateInfo ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-border bg-muted/40">
                    <p className="text-xs text-muted-foreground mb-1">Current</p>
                    <p className="font-mono font-medium break-all">{updateInfo.current_version}</p>
                  </div>
                  <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                    <p className="text-xs text-muted-foreground mb-1">Latest</p>
                    <p className="font-mono font-medium break-all">{updateInfo.latest_version}</p>
                  </div>
                </div>

                {!updateInfo.is_connected ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    Agent is offline. It must be online to receive an update.
                  </div>
                ) : updateInfo.update_available ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary">
                    <Download className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    A new version is available. Click Update to roll it out.
                  </div>
                ) : (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {updateInfo.latest_version === 'unknown'
                      ? 'Latest version is not configured on the server (set LATEST_AGENT_VERSION).'
                      : 'This agent is already up to date.'}
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!updateInfo.is_connected || updateLoading}
                    onClick={confirmUpdateAgent}
                  >
                    {updateLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Update
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
