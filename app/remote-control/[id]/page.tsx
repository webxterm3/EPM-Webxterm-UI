'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2, ShieldQuestion, XCircle, Clock, AlertTriangle, MonitorSmartphone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import {
  remoteControlAPI,
  describeState,
  isTerminalState,
  type RemoteControlSession,
  type RemoteControlState,
} from '@/lib/remote-control-api';

// Client-only (guacamole-common-js touches window).
const RemoteControl = dynamic(
  () => import('@/components/RemoteControl').then((m) => ({ default: m.RemoteControl })),
  { ssr: false },
);

// How often to ask the backend whether the user has answered. The prompt on
// their machine lasts a minute, so this is frequent enough to feel immediate
// without hammering the API.
const POLL_MS = 1500;

/**
 * Full-screen remote control. Opened in its own tab from the machine page.
 *
 * The page owns the whole handshake: it asks the machine to start a session,
 * shows the wait while the user decides, and only mounts the canvas once they
 * have actually said yes. It lives outside the (dashboard) group so there is
 * no sidebar — just the session filling the viewport.
 */
export default function RemoteControlPage() {
  const params = useParams();
  const search = useSearchParams();
  const agentId = (params?.id as string) || '';
  const machineName = search.get('name') || '';
  const viewOnly = search.get('view_only') === '1';
  const reason = search.get('reason') || '';


  const { token } = useAuth();


  // Flipped in an effect, so it is false on the server render AND on the

  // client's hydration render — which is what keeps those two identical.

  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const { branding } = useBranding();

  const [session, setSession] = useState<RemoteControlSession | null>(null);
  const [starting, setStarting] = useState(true);
  const [startError, setStartError] = useState('');
  const [ended, setEnded] = useState(false);

  // Guards the start request against React StrictMode's double mount, which
  // would otherwise fire two prompts at the user.
  const startedRef = useRef(false);

  // Holds a stop scheduled by an unmount, so a remount can cancel it.
  const pendingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.title = machineName ? `${machineName} — Remote control` : 'Remote control';
  }, [machineName]);

  const stop = useCallback(async () => {
    if (!token || !agentId) return;
    try {
      await remoteControlAPI.stop(token, agentId);
    } catch {
      /* the session may already be gone */
    }
  }, [token, agentId]);

  // Ending from the button shows the end screen immediately rather than
  // waiting for the socket to notice — the user's screen stops being shared
  // the moment the request lands, and the UI should say so.
  const handleEndSession = useCallback(() => {
    setEnded(true);
    void stop();
  }, [stop]);

  // Kick off the request once.
  useEffect(() => {
    if (!token || !agentId || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        await remoteControlAPI.start(token, agentId, {
          reason: reason || undefined,
          view_only: viewOnly,
          // The same organisation-wide setting the terminal uses, so both
          // features expire a forgotten session the same way.
          idle_timeout_minutes: branding.terminal_idle_timeout_minutes,
        });
        setSession({ state: 'awaiting_consent', view_only: viewOnly });
      } catch (err) {
        setStartError(err instanceof Error ? err.message : 'Could not reach the machine.');
      } finally {
        setStarting(false);
      }
    })();
  }, [token, agentId, reason, viewOnly, branding.terminal_idle_timeout_minutes]);

  // Poll until the state settles. Polling stops once the session is active —
  // from then on the WebSocket is the source of truth, and a stray poll would
  // only add noise.
  useEffect(() => {
    if (!token || !agentId || startError) return;
    if (session && (session.state === 'active' || isTerminalState(session.state))) return;

    const t = setInterval(async () => {
      try {
        const s = await remoteControlAPI.getStatus(token, agentId);
        setSession(s);
      } catch {
        /* transient; the next tick will retry */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [token, agentId, session, startError]);

  // Leaving the page must end the session — a tab closed on an active session
  // would otherwise leave the user's screen shared with nobody watching.
  //
  // The stop is DEFERRED rather than sent from the cleanup directly. React
  // runs every effect mount → cleanup → mount in development, so a direct call
  // fires a stop the user never asked for, and it can land after the start
  // request and kill the session that was just approved. Deferring it means a
  // remount cancels it, while a real unmount still stops the session a moment
  // later.
  useEffect(() => {
    const onUnload = () => {
      if (!token || !agentId) return;
      navigator.sendBeacon?.(
        `${process.env.NEXT_PUBLIC_API_URL}/machines/${agentId}/remote-control/stop?token=${token}`,
      );
    };
    window.addEventListener('pagehide', onUnload);

    return () => {
      window.removeEventListener('pagehide', onUnload);
      pendingStopRef.current = setTimeout(() => {
        pendingStopRef.current = null;
        void stop();
      }, 500);
    };
  }, [token, agentId, stop]);

  // Cancel a stop left pending by a development remount.
  useEffect(() => {
    if (pendingStopRef.current) {
      clearTimeout(pendingStopRef.current);
      pendingStopRef.current = null;
    }
  });

  // Nothing is decided from the token until after mount.
  //
  // AuthContext resolves it from localStorage, which does not exist on the
  // server — so the server renders "Loading…" and an already-signed-in client
  // renders the session view on its very first pass. React calls that a
  // hydration mismatch and throws the whole tree away to re-render it, which
  // it reports in the console as an error and the user sees as a flash.
  // The dashboard layout already guards this way; this page did not.
  if (!mounted || !token) {
    return <Centered>Loading…</Centered>;
  }
  if (startError) {
    return (
      <Centered>
        <StatusCard
          icon={<AlertTriangle className="h-10 w-10 text-warning" />}
          title="Could not start the session"
          body={startError}
          onClose={() => window.close()}
        />
      </Centered>
    );
  }
  if (starting || !session) {
    return (
      <Centered>
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        Asking the machine…
      </Centered>
    );
  }

  if (session.state === 'active' && !ended) {
    return (
      <div className="fixed inset-0 bg-black">
        <RemoteControl
          agentId={agentId}
          token={token}
          viewOnly={session.view_only}
          onStateChange={(s) => {
            if (s === 'disconnected' || s === 'error') setEnded(true);
          }}
          onEnd={handleEndSession}
          onExit={() => {
            void stop();
            window.close();
          }}
        />
      </div>
    );
  }

  return (
    <Centered>
      <StatusCard {...cardFor(session, ended)} onClose={() => window.close()} />
    </Centered>
  );
}

function cardFor(session: RemoteControlSession, ended: boolean) {
  if (ended) {
    return {
      icon: <MonitorSmartphone className="h-10 w-10 text-muted-foreground" />,
      title: 'Session ended',
      body: 'The remote-control session is over.',
    };
  }

  const state: RemoteControlState = session.state;
  switch (state) {
    case 'awaiting_consent':
      return {
        icon: <ShieldQuestion className="h-10 w-10 animate-pulse text-primary" />,
        title: 'Waiting for approval',
        body: describeState(session),
        hint: 'The user has been shown a prompt asking whether to allow this. Nothing is visible to you until they accept.',
      };
    case 'denied':
      return {
        icon: <XCircle className="h-10 w-10 text-destructive" />,
        title: 'Request declined',
        body: describeState(session),
      };
    case 'timed_out':
      return {
        icon: <Clock className="h-10 w-10 text-warning" />,
        title: 'No answer',
        body: describeState(session),
      };
    case 'error':
      return {
        icon: <AlertTriangle className="h-10 w-10 text-warning" />,
        title: 'Something went wrong',
        body: describeState(session),
      };
    default:
      return {
        icon: <MonitorSmartphone className="h-10 w-10 text-muted-foreground" />,
        title: 'No session',
        body: describeState(session),
      };
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black px-6 text-white/80">
      {children}
    </div>
  );
}

function StatusCard({
  icon,
  title,
  body,
  hint,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  hint?: string;
  onClose?: () => void;
}) {
  return (
    <div className="max-w-md text-center">
      <div className="mb-4 flex justify-center">{icon}</div>
      <p className="mb-2 text-lg font-medium text-white">{title}</p>
      <p className="mb-2 text-sm text-white/70">{body}</p>
      {hint && <p className="mb-4 text-xs text-white/40">{hint}</p>}
      {onClose && (
        <button
          onClick={onClose}
          className="mt-2 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          Close
        </button>
      )}
    </div>
  );
}
