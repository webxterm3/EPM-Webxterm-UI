'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  User,
  Eye,
  EyeOff,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Key,
  Copy,
  Lock,
  Camera,
  Plus,
  Trash2,
  SlidersHorizontal,
  Archive,
  RefreshCw,
  Play,
  RotateCcw,
  Clock,
  HardDrive,
  Wifi,
  Shield,
  Image as ImageIcon,
  Palette,
  Type,
  Mail,
  Building2,
  Users,
  ScrollText,
  Globe,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { brandingAPI } from '@/lib/branding-api';
import { settingsAPI, S3Config, LogShippingConfig } from '@/lib/settings-api';
import EntraSyncSettings from '@/components/EntraSyncSettings';
import { profileAPI, ProfileData } from '@/lib/profile-api';
import { apiKeysAPI, APIKeyInfo, MAX_API_KEYS } from '@/lib/api-keys-api';
import { mfaSettingsAPI, MFASettings } from '@/lib/mfa-settings-api';
import { oidcSettingsAPI, OIDCSettings } from '@/lib/oidc-settings-api';
import { communityAPI } from '@/lib/community-api';
import {
  logManagementAPI,
  LogManagementConfig,
  ArchiveRun,
  StorageType,
  StorageCreds,
  S3Creds,
  GCSCreds,
  AzureCreds,
  SFTPCreds,
  NFSCreds,
  ElasticsearchCreds,
  SIEMCreds,
  SaveLogConfigPayload,
  STORAGE_LABELS,
  defaultCredsForType,
  formatBytes,
} from '@/lib/log-management-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { useToast } from '@/hooks/use-toast';

/** The http/https choice, as the portal's own Select.
 *
 *  A bare <select> renders with the operating system's chrome — a different
 *  height, a different font, and a grey that belongs to nothing else on the
 *  page. Beside the Inputs it sits next to, it reads as a control somebody
 *  forgot to finish.
 *
 *  One component for both places that ask, so the two cannot drift into
 *  looking different from each other as well as from everything else.
 */
function ProtocolSelect({
  value,
  onChange,
}: {
  value: 'http' | 'https';
  onChange: (v: 'http' | 'https') => void;
}) {
  return (
    <Select value={value || 'https'} onValueChange={v => onChange(v as 'http' | 'https')}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="https">https</SelectItem>
        <SelectItem value="http">http</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Archive status badge ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-green-500/15 text-green-400 border-green-500/30',
    partial: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    failed:  'bg-red-500/15 text-red-400 border-red-500/30',
    running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', map[status] ?? 'bg-muted/40 text-muted-foreground border-border/40')}>
      {status}
    </span>
  );
}

// ── Storage credentials form ──────────────────────────────────────────────────
function StorageCredsForm({
  type, creds, onChange,
}: {
  type: StorageType;
  creds: StorageCreds | undefined;
  onChange: (c: StorageCreds) => void;
}) {
  if (!type || !creds) return null;

  const field = (label: string, key: string, placeholder = '', inputType = 'text', hint?: string) => {
    const val = (creds as unknown as Record<string, unknown>)[key];
    return (
      <div className="space-y-1.5" key={key}>
        <Label>
          {label}
          {hint && <span className="ml-1 text-xs text-muted-foreground font-normal">({hint})</span>}
        </Label>
        <Input
          type={inputType}
          placeholder={placeholder}
          value={val as string ?? ''}
          onChange={e => onChange({ ...creds, [key]: inputType === 'number' ? Number(e.target.value) : e.target.value } as StorageCreds)}
          autoComplete="off"
        />
      </div>
    );
  };


  if (type === 's3') {
    const c = creds as S3Creds;
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Protocol</Label>
          <ProtocolSelect value={c.protocol} onChange={v => onChange({ ...c, protocol: v })} />
        </div>
        {field('Endpoint URL', 'endpoint', 's3.amazonaws.com')}
        {field('Access Key', 'access_key', 'AKIAIOSFODNN7EXAMPLE')}
        {field('Secret Key', 'secret_key', '••••••••', 'password')}
        {field('Bucket', 'bucket', 'vsay-archive-bucket')}
        {field('Region', 'region', 'us-east-1', 'text', 'optional')}
        {field('Path Prefix', 'path_prefix', 'vsay-logs', 'text', 'optional')}
      </div>
    );
  }

  if (type === 'gcs') {
    const c = creds as GCSCreds;
    return (
      <div className="grid grid-cols-2 gap-4">
        {field('Bucket', 'bucket', 'my-vsay-archive')}
        <div className="col-span-2 space-y-1.5">
          <Label>Service Account JSON</Label>
          <textarea className="w-full h-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" placeholder='{"type":"service_account",...}' value={c.credentials_json} onChange={e => onChange({ ...c, credentials_json: e.target.value })} />
        </div>
        {field('Path Prefix', 'path_prefix', 'vsay-logs', 'text', 'optional')}
      </div>
    );
  }

  if (type === 'azure') {
    return (
      <div className="grid grid-cols-2 gap-4">
        {field('Account Name', 'account_name', 'mystorageaccount')}
        {field('Account Key', 'account_key', '••••••••', 'password')}
        {field('Container', 'container', 'vsay-archive')}
        {field('Path Prefix', 'path_prefix', 'vsay-logs', 'text', 'optional')}
      </div>
    );
  }

  if (type === 'sftp') {
    const c = creds as SFTPCreds;
    return (
      <div className="grid grid-cols-2 gap-4">
        {field('Host', 'host', 'sftp.example.com')}
        <div className="space-y-1.5">
          <Label>Port</Label>
          <Input type="number" value={c.port} onChange={e => onChange({ ...c, port: Number(e.target.value) })} />
        </div>
        {field('Username', 'username', 'vsay')}
        {field('Password', 'password', '••••••••', 'password', 'or use private key')}
        <div className="col-span-2 space-y-1.5">
          <Label>Private Key <span className="ml-1 text-xs text-muted-foreground font-normal">(PEM, optional)</span></Label>
          <textarea className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" value={(creds as SFTPCreds).private_key} onChange={e => onChange({ ...creds as SFTPCreds, private_key: e.target.value })} />
        </div>
        {field('Remote Path', 'remote_path', '/vsay-logs')}
      </div>
    );
  }

  if (type === 'nfs') {
    return (
      <div className="grid grid-cols-2 gap-4">
        {field('Mount Path', 'mount_path', '/mnt/vsay-logs')}
        {field('Sub-directory', 'path_prefix', '', 'text', 'optional')}
      </div>
    );
  }

  if (type === 'elasticsearch') {
    return (
      <div className="grid grid-cols-2 gap-4">
        {field('URL', 'url', 'https://es.example.com:9200')}
        {field('Username', 'username', 'elastic', 'text', 'or use API key')}
        {field('Password', 'password', '••••••••', 'password')}
        {field('API Key', 'api_key', '', 'password', 'optional')}
        {field('Index Prefix', 'index_prefix', 'vsay-logs')}
      </div>
    );
  }

  if (type === 'siem') {
    const c = creds as SIEMCreds;
    return (
      <div className="grid grid-cols-2 gap-4">
        {field('Webhook URL', 'url', 'https://siem.example.com/api/ingest')}
        {field('Token / API Key', 'token', '', 'password')}
        <div className="space-y-1.5">
          <Label>Format</Label>
          {/* The last native select on this page. Left behind it would be
              the one control that still looks like the browser's. */}
          <Select
            value={c.format || 'json'}
            onValueChange={v => onChange({ ...c, format: v as 'json' | 'cef' })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="cef">CEF (ArcSight)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return null;
}

// The shared image-upload endpoint is built for standard web images and rejects
// raw .ico files server-side. Browsers can still decode .ico into an <img>, so we
// rasterize it to a PNG on the client first and upload that instead — same proven
// path as the logo, works no matter what the backend's image-format allowlist is.
async function icoFileToPngFile(file: File): Promise<File> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This browser could not decode the .ico file'));
    image.src = dataUrl;
  });

  const size = Math.max(img.naturalWidth || 32, img.naturalHeight || 32, 32);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser');
  ctx.drawImage(img, 0, 0, size, size);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to convert the .ico file'))), 'image/png');
  });

  return new File([blob], file.name.replace(/\.ico$/i, '.png'), { type: 'image/png' });
}

// Matches the light-mode hues in ThemeContext — used to preview Part 2's colour
// (which always follows the selected Default Theme Colour) without depending on
// whatever theme the editing admin currently happens to have active.
const THEME_COLOR_HSL: Record<string, string> = {
  cyan: 'hsl(173,80%,40%)',
  green: 'hsl(142,76%,36%)',
  purple: 'hsl(262,83%,58%)',
  orange: 'hsl(25,95%,53%)',
  blue: 'hsl(217,91%,60%)',
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const isAdmin      = user?.role === 'super_admin' || user?.role === 'company_admin';
  const isSuperAdmin = user?.role === 'super_admin';

  // ── Profile state ────────────────────────────────────────────
  const [profileData, setProfileData]         = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading]   = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── API Keys — personal access tokens, up to MAX_API_KEYS, backed by the
  // real /api-keys endpoints. Usable as a Bearer token on any API call.
  const [apiKeys, setApiKeys] = useState<APIKeyInfo[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [showGenerateKeyForm, setShowGenerateKeyForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyNameError, setNewKeyNameError] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('never');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [justGeneratedKey, setJustGeneratedKey] = useState<{ name: string; fullValue: string } | null>(null);
  const [copiedGeneratedKey, setCopiedGeneratedKey] = useState(false);

  // ── Log Management state (admin + super_admin) ───────────────
  const [s3Testing, setS3Testing] = useState(false);
  const [s3TestResult, setS3TestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [s3, setS3]                           = useState<S3Config>({ enabled: false, endpoint: '', protocol: 'https', access_key: '', secret_key: '', bucket: '', region: '' });
  const [secretKeySet, setSecretKeySet]       = useState(false);
  const [showSecret, setShowSecret]           = useState(false);
  const [s3Saving, setS3Saving]               = useState(false);
  const [s3Status, setS3Status]               = useState<'idle' | 'success' | 'error'>('idle');
  const [s3Message, setS3Message]             = useState('');
  const [archiveEnabled, setArchiveEnabled]   = useState(false);
  const [archiveEveryDays, setArchiveEveryDays] = useState(30);
  const [customFrequency, setCustomFrequency]   = useState('');
  const [storageType, setStorageType]         = useState<StorageType>('');
  const [storageCreds, setStorageCreds]       = useState<StorageCreds | undefined>(undefined);
  const [archiveRuns, setArchiveRuns]         = useState<ArchiveRun[]>([]);
  const [runsLoading, setRunsLoading]         = useState(false);
  const [logConfig, setLogConfig]             = useState<LogManagementConfig | null>(null);
  const [lmSaving, setLmSaving]               = useState(false);
  const [lmTesting, setLmTesting]             = useState(false);
  const [lmArchiving, setLmArchiving]         = useState(false);
  const [testResult, setTestResult]           = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Configuration state (super_admin only) ───────────────────
  const [cfgRetentionDays, setCfgRetentionDays]     = useState(30);
  const [cfgCustomRetention, setCfgCustomRetention] = useState('');
  const [cfgSaving, setCfgSaving]                   = useState(false);

  // ── Theme Configuration state (super_admin only) ─────────────
  const { branding, loading: brandingLoading, setBranding: setGlobalBranding } = useBranding();
  const [logoUrl, setLogoUrl]                 = useState('');
  const [faviconUrl, setFaviconUrl]           = useState('');
  const [namePart1, setNamePart1]             = useState('');
  const [namePart2, setNamePart2]             = useState('');
  const [defaultThemeColor, setDefaultThemeColor] = useState('cyan');
  const [logoUploading, setLogoUploading]     = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [brandingSaving, setBrandingSaving]   = useState(false);

  // ── Terminal Settings state (super_admin only) ────────────────
  // ── Endpoint Logs: collecting each MACHINE's own system logs ──
  const [lsLoading, setLsLoading] = useState(true);
  const [lsSaving, setLsSaving] = useState(false);
  const [lsArchiveConfigured, setLsArchiveConfigured] = useState(false);
  const [ls, setLs] = useState<LogShippingConfig>({
    enabled: false,
    system_logs: true,
    websites: true,
    interval_seconds: 30,
    daily_budget_mb: 256,
    backfill_hours: 24,
    include_info_debug: false,
    keep_raw: false,
  });

  const [terminalIdleTimeoutMinutes, setTerminalIdleTimeoutMinutes] = useState(2);
  const [terminalSettingsSaving, setTerminalSettingsSaving] = useState(false);

  // ── MFA/OTP + SMTP settings state (super_admin only) ──────────
  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaSaving, setMfaSaving] = useState(false);
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [otpExpiryMinutes, setOtpExpiryMinutes] = useState(10);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState(''); // never prefilled with the real value
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  // ── Microsoft / GitHub OIDC (social login) settings state (super_admin only) ──
  const [oidcLoading, setOidcLoading] = useState(true);
  const [oidcSaving, setOidcSaving] = useState(false);
  const [msEnabled, setMsEnabled] = useState(false);
  const [msClientId, setMsClientId] = useState('');
  const [msClientSecret, setMsClientSecret] = useState(''); // never prefilled with the real value
  const [msClientSecretSet, setMsClientSecretSet] = useState(false);
  const [msTenantId, setMsTenantId] = useState('');
  const [showMsSecret, setShowMsSecret] = useState(false);
  const [ghEnabled, setGhEnabled] = useState(false);
  const [ghClientId, setGhClientId] = useState('');
  const [ghClientSecret, setGhClientSecret] = useState('');
  const [ghClientSecretSet, setGhClientSecretSet] = useState(false);
  const [showGhSecret, setShowGhSecret] = useState(false);

  // ── Confirm dialog state ─────────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  const openConfirm = (opts: Omit<typeof confirmDialog, 'open'>) =>
    setConfirmDialog({ ...opts, open: true });
  const closeConfirm = () =>
    setConfirmDialog(prev => ({ ...prev, open: false }));

  // ── Load profile ─────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    profileAPI.getProfile(token).then(setProfileData).catch(console.error);
  }, [token]);

  // ── Load API keys ────────────────────────────────────────────
  const loadAPIKeys = useCallback(async () => {
    if (!token) return;
    setApiKeysLoading(true);
    try {
      const res = await apiKeysAPI.list(token);
      setApiKeys(res.keys ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setApiKeysLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAPIKeys();
  }, [loadAPIKeys]);

  // ── Load MFA/OTP + SMTP settings (super_admin only) ────────────
  const loadMFASettings = useCallback(async () => {
    if (!token || !isSuperAdmin) return;
    setMfaLoading(true);
    try {
      const settings = await mfaSettingsAPI.get(token);
      hydrateMFAForm(settings);
    } catch (err) {
      toast({ title: 'Failed to load MFA settings', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setMfaLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperAdmin]);

  const hydrateMFAForm = (settings: MFASettings) => {
    setOtpEnabled(settings.otp_enabled);
    setOtpExpiryMinutes(settings.otp_expiry_minutes);
    setSmtpHost(settings.smtp_host);
    setSmtpPort(settings.smtp_port);
    setSmtpUsername(settings.smtp_username);
    setSmtpPasswordSet(settings.smtp_password_set);
    setSmtpPassword('');
    setSmtpFrom(settings.smtp_from);
  };

  useEffect(() => {
    loadMFASettings();
  }, [loadMFASettings]);

  // ── Load Microsoft/GitHub OIDC settings (super_admin only) ─────
  const loadOIDCSettings = useCallback(async () => {
    if (!token || !isSuperAdmin) return;
    setOidcLoading(true);
    try {
      const settings = await oidcSettingsAPI.get(token);
      hydrateOIDCForm(settings);
    } catch (err) {
      toast({ title: 'Failed to load social login settings', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setOidcLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isSuperAdmin]);

  const hydrateOIDCForm = (settings: OIDCSettings) => {
    setMsEnabled(settings.microsoft_enabled);
    setMsClientId(settings.microsoft_client_id);
    setMsClientSecretSet(settings.microsoft_client_secret_set);
    setMsClientSecret('');
    setMsTenantId(settings.microsoft_tenant_id);
    setGhEnabled(settings.github_enabled);
    setGhClientId(settings.github_client_id);
    setGhClientSecretSet(settings.github_client_secret_set);
    setGhClientSecret('');
  };

  useEffect(() => {
    loadOIDCSettings();
  }, [loadOIDCSettings]);

  // ── Hydrate the Theme Configuration form once the org's branding loads ─
  useEffect(() => {
    if (brandingLoading) return;
    setLogoUrl(branding.logo_url);
    setFaviconUrl(branding.favicon_url);
    setNamePart1(branding.name_part1);
    setNamePart2(branding.name_part2);
    setDefaultThemeColor(branding.default_theme_color);
    setTerminalIdleTimeoutMinutes(branding.terminal_idle_timeout_minutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandingLoading]);

  // ── Load Log Management tab ───────────────────────────────────
  const loadLogManagement = useCallback(async () => {
    if (!token || !isAdmin) return;
    setRunsLoading(true);
    try {
      const [cfg, runs, s3cfg] = await Promise.all([
        logManagementAPI.getConfig(token),
        logManagementAPI.getRuns(token),
        settingsAPI.getS3Config(token),
      ]);
      setLogConfig(cfg);
      const preset = [10, 20, 30].includes(cfg.retention_days) ? cfg.retention_days : 0;
      if (preset) {
        setCfgRetentionDays(cfg.retention_days);
      } else if (cfg.retention_days > 0) {
        setCfgRetentionDays(0);
        setCfgCustomRetention(String(cfg.retention_days));
      }
      setArchiveRuns(runs ?? []);
      setArchiveEnabled(cfg.archive_enabled);
      const freq = cfg.archive_every_days || 30;
      if ([10, 20, 30].includes(freq)) {
        setArchiveEveryDays(freq);
      } else {
        setArchiveEveryDays(0);
        setCustomFrequency(String(freq));
      }
      setStorageType(cfg.storage_type);
      setStorageCreds(cfg.storage_type ? defaultCredsForType(cfg.storage_type) : undefined);
      setSecretKeySet(!!s3cfg.secret_key_set);
      setS3({ enabled: s3cfg.enabled, endpoint: s3cfg.endpoint ?? '', protocol: s3cfg.protocol ?? 'https', access_key: s3cfg.access_key ?? '', secret_key: '', bucket: s3cfg.bucket ?? '', region: s3cfg.region ?? '' });
    } catch (e) {
      console.error(e);
    } finally {
      setRunsLoading(false);
    }
  }, [token, isAdmin]);

  // ── Profile handlers ─────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: 'File too large', description: 'Max 10 MB', variant: 'destructive' }); return; }
    setProfileLoading('avatar');
    try {
      const up = await communityAPI.uploadImage(token, file);
      await profileAPI.uploadAvatar(token, { avatar_url: up.url });
      setProfileData(await profileAPI.getProfile(token));
      toast({ title: 'Avatar updated!' });
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally { setProfileLoading(null); }
  };

  const EXPIRY_OPTIONS: Record<string, number | undefined> = {
    never: undefined,
    '30': 30,
    '90': 90,
    '180': 180,
    '365': 365,
  };

  const handleGenerateKey = async () => {
    if (!token) return;
    if (apiKeys.length >= MAX_API_KEYS) {
      setNewKeyNameError(`Maximum of ${MAX_API_KEYS} API keys reached — revoke one to generate a new key.`);
      return;
    }
    const name = newKeyName.trim();
    if (!name) { setNewKeyNameError('Name is required'); return; }
    if (name.length < 3) { setNewKeyNameError('Name must be at least 3 characters'); return; }
    if (name.length > 40) { setNewKeyNameError('Name must be under 40 characters'); return; }
    if (apiKeys.some(k => k.name.toLowerCase() === name.toLowerCase())) {
      setNewKeyNameError('A key with this name already exists');
      return;
    }

    setGeneratingKey(true);
    try {
      const created = await apiKeysAPI.create(token, name, EXPIRY_OPTIONS[newKeyExpiry]);
      setApiKeys(prev => [created, ...prev]);
      setJustGeneratedKey({ name, fullValue: created.key });
      setNewKeyName('');
      setNewKeyNameError('');
      setNewKeyExpiry('never');
      setShowGenerateKeyForm(false);
    } catch (err) {
      setNewKeyNameError(err instanceof Error ? err.message : 'Failed to generate key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleCopyGeneratedKey = async () => {
    if (!justGeneratedKey) return;
    if (!(await copyToClipboard(justGeneratedKey.fullValue))) {
      toast({
        title: 'Could not copy',
        description: 'Your browser blocked clipboard access — select the text and copy it manually.',
        variant: 'destructive',
      });
      return;
    }
    setCopiedGeneratedKey(true);
    toast({ title: 'Copied!' });
  };

  const handleRevokeKey = (id: string, name: string) => {
    openConfirm({
      title: `Revoke "${name}"?`,
      description: 'Anything using this key will stop working immediately. This cannot be undone.',
      confirmLabel: 'Revoke',
      destructive: true,
      onConfirm: async () => {
        if (!token) return;
        setRevokingKeyId(id);
        try {
          await apiKeysAPI.revoke(token, id);
          setApiKeys(prev => prev.filter(k => k.id !== id));
          toast({ title: 'Key revoked' });
        } catch (err) {
          toast({ title: 'Failed to revoke key', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
        } finally {
          setRevokingKeyId(null);
        }
      },
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) return void toast({ title: 'Enter current password', variant: 'destructive' });
    if (newPassword.length < 6) return void toast({ title: 'Min 6 characters', variant: 'destructive' });
    if (newPassword !== confirmPassword) return void toast({ title: 'Passwords do not match', variant: 'destructive' });
    if (!token) return;
    setProfileLoading('password');
    try {
      await profileAPI.resetPassword(token, { current_password: currentPassword, new_password: newPassword });
      toast({ title: 'Password changed!' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally { setProfileLoading(null); }
  };

  // ── Endpoint Logs: load and save the fleet-wide collection policy ──
  const loadLogShipping = useCallback(async () => {
    if (!token) return;
    setLsLoading(true);
    try {
      const res = await settingsAPI.getLogShippingConfig(token);
      setLs(res.settings);
      setLsArchiveConfigured(res.archive_configured);
    } catch (err) {
      toast({
        title: 'Could not load log collection settings',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLsLoading(false);
    }
  }, [token, toast]);

  const handleSaveLogShipping = async () => {
    if (!token) return;
    setLsSaving(true);
    try {
      const res = await settingsAPI.saveLogShippingConfig(token, ls);
      // The counts are reported rather than a bare "Saved": offline machines
      // keep their old policy until they reconnect, and a silent success would
      // suggest the whole fleet had changed.
      toast({
        title: 'Log collection settings saved',
        description:
          res.agents_total === 0
            ? 'No machines are enrolled yet.'
            : `${res.agents_updated} of ${res.agents_total} machines updated now; the rest apply this when they reconnect.`,
      });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setLsSaving(false);
    }
  };

  // ── Log Management: save archive config + S3 recording ───────
  const handleSaveS3 = async () => {
    if (!token) return;
    setS3Saving(true); setS3Status('idle');
    try {
      await settingsAPI.saveS3Config(token, s3);
      setS3Status('success'); setS3Message('Saved.');
      if (s3.secret_key) setSecretKeySet(true);
      setS3(prev => ({ ...prev, secret_key: '' }));
    } catch (err) {
      setS3Status('error'); setS3Message(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setS3Saving(false);
      setTimeout(() => setS3Status('idle'), 4000);
    }
  };

  const handleSaveArchiveConfig = async () => {
    if (!token || !logConfig) return;
    setLmSaving(true);
    try {
      const payload: SaveLogConfigPayload = {
        retention_days: logConfig.retention_days,
        archive_enabled: archiveEnabled,
        archive_every_days: archiveEveryDays === 0 ? (Number(customFrequency) || 30) : archiveEveryDays,
        storage_type: archiveEnabled ? storageType : '',
        storage_creds: archiveEnabled && storageType ? storageCreds : undefined,
      };
      await logManagementAPI.saveConfig(token, payload);
      toast({ title: 'Archive configuration saved' });
      loadLogManagement();
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally { setLmSaving(false); }
  };

  const handleTestConnection = async () => {
    if (!token || !storageType || !storageCreds) return;
    setLmTesting(true); setTestResult(null);
    try {
      await logManagementAPI.testConnection(token, storageType, storageCreds);
      setTestResult({ ok: true, msg: 'Connection successful!' });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'Connection failed' });
    } finally { setLmTesting(false); }
  };

  // The recording bucket's own test.
  //
  // Separate state from the archive destination's: the two are different
  // buckets with different credentials, and one result shown under both
  // would say a destination works when the other one was tested.
  const handleTestS3Recording = async () => {
    if (!token) return;
    setS3Testing(true); setS3TestResult(null);
    try {
      await settingsAPI.testS3Config(token, s3);
      setS3TestResult({ ok: true, msg: 'Connection successful!' });
    } catch (err) {
      setS3TestResult({ ok: false, msg: err instanceof Error ? err.message : 'Connection failed' });
    } finally { setS3Testing(false); }
  };

  const handleArchiveNow = () => {
    const retDays = logConfig?.retention_days;
    openConfirm({
      title: 'Start Archival Now?',
      description: retDays
        ? `Logs older than ${retDays} days will be ${archiveEnabled ? 'archived to ' + (storageType || 'storage') + ' and ' : ''}deleted from the database. This runs in the background.`
        : 'Expired logs will be archived and removed from the database. This runs in the background.',
      confirmLabel: 'Archive Now',
      destructive: true,
      onConfirm: async () => {
        if (!token) return;
        setLmArchiving(true);
        try {
          await logManagementAPI.archiveNow(token);
          toast({ title: 'Archival started', description: 'Running in background — refresh history in a moment.' });
        } catch (err) {
          toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
        } finally { setLmArchiving(false); }
      },
    });
  };

  const handleRestore = (run: ArchiveRun) => {
    openConfirm({
      title: 'Restore Archive?',
      description: `This will re-insert ${run.logs_archived.toLocaleString()} logs and ${run.sessions_archived.toLocaleString()} sessions from the ${new Date(run.started_at).toLocaleDateString()} archive back into the database.`,
      confirmLabel: 'Restore',
      onConfirm: async () => {
        if (!token) return;
        try {
          const r = await logManagementAPI.restoreRun(token, run.id);
          toast({ title: 'Restore complete', description: `${r.logs_restored} logs · ${r.sessions_restored} sessions` });
          loadLogManagement();
        } catch (err) {
          toast({ title: 'Restore failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
        }
      },
    });
  };

  // ── Configuration: save retention only ───────────────────────
  const handleSaveRetention = async () => {
    if (!token) return;
    const days = cfgRetentionDays === 0 ? Number(cfgCustomRetention) : cfgRetentionDays;
    if (!days || days <= 0) { toast({ title: 'Enter a valid retention period', variant: 'destructive' }); return; }
    setCfgSaving(true);
    try {
      const current = await logManagementAPI.getConfig(token);
      await logManagementAPI.saveConfig(token, {
        retention_days: days,
        archive_enabled: current.archive_enabled,
        archive_every_days: current.archive_every_days,
        storage_type: current.storage_type,
      });
      toast({ title: `Retention set to ${days} days` });
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally { setCfgSaving(false); }
  };

  // ── Theme Configuration: logo / favicon upload + save ────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    if (file.type !== 'image/png') {
      toast({ title: 'PNG only', description: 'Please upload a .png file.', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 2 MB.', variant: 'destructive' });
      return;
    }
    setLogoUploading(true);
    try {
      const { url } = await communityAPI.uploadImage(token, file);
      setLogoUrl(url);
      toast({ title: 'Logo uploaded', description: 'Click Save changes to apply it for everyone.' });
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    if (!file.name.toLowerCase().endsWith('.ico')) {
      toast({ title: '.ico only', description: 'Please upload a .ico file.', variant: 'destructive' });
      return;
    }
    if (file.size > 512 * 1024) {
      toast({ title: 'File too large', description: 'Max 512 KB.', variant: 'destructive' });
      return;
    }
    setFaviconUploading(true);
    try {
      const pngFile = await icoFileToPngFile(file);
      const { url } = await communityAPI.uploadImage(token, pngFile);
      setFaviconUrl(url);
      toast({ title: 'Favicon uploaded', description: 'Click Save changes to apply it for everyone.' });
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setFaviconUploading(false);
    }
  };

  const handleSaveBranding = async () => {
    if (!token) return;
    setBrandingSaving(true);
    try {
      const updated = await brandingAPI.updateBranding(token, {
        logo_url: logoUrl,
        favicon_url: faviconUrl,
        name_part1: namePart1,
        name_part1_color: '', // Part 1 always uses the default text colour, never a custom hex
        name_part2: namePart2,
        name_part2_color: '', // Part 2 always follows the Default Theme Colour, never a custom hex
        default_theme_color: defaultThemeColor,
      });
      setGlobalBranding(updated); // re-brand the whole app instantly for everyone — no reload needed
      toast({ title: 'Branding updated', description: 'Every user now sees the new look.' });
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleResetBranding = () => {
    openConfirm({
      title: 'Reset to default branding?',
      description: 'This clears the logo, favicon, custom name, and colour — everyone will see the original EPM look again.',
      confirmLabel: 'Reset',
      destructive: true,
      onConfirm: async () => {
        if (!token) return;
        setBrandingSaving(true);
        try {
          const updated = await brandingAPI.updateBranding(token, {
            logo_url: '',
            favicon_url: '',
            name_part1: 'Web',
            name_part1_color: '',
            name_part2: 'Xterm',
            name_part2_color: '',
            default_theme_color: 'cyan',
          });
          setLogoUrl(updated.logo_url);
          setFaviconUrl(updated.favicon_url);
          setNamePart1(updated.name_part1);
          setNamePart2(updated.name_part2);
          setDefaultThemeColor(updated.default_theme_color);
          setGlobalBranding(updated);
          toast({ title: 'Branding reset', description: 'Everyone now sees the default EPM look.' });
        } catch (err) {
          toast({ title: 'Reset failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
        } finally {
          setBrandingSaving(false);
        }
      },
    });
  };

  const handleSaveTerminalSettings = async () => {
    if (!token) return;
    if (!Number.isInteger(terminalIdleTimeoutMinutes) || terminalIdleTimeoutMinutes < 1 || terminalIdleTimeoutMinutes > 240) {
      toast({ title: 'Invalid value', description: 'Enter a whole number of minutes between 1 and 240.', variant: 'destructive' });
      return;
    }
    setTerminalSettingsSaving(true);
    try {
      const updated = await brandingAPI.updateBranding(token, {
        terminal_idle_timeout_minutes: terminalIdleTimeoutMinutes,
      });
      setTerminalIdleTimeoutMinutes(updated.terminal_idle_timeout_minutes);
      setGlobalBranding(updated);
      toast({
        title: 'Terminal settings updated',
        description: `Idle terminal sessions now time out after ${updated.terminal_idle_timeout_minutes} minute(s).`,
      });
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setTerminalSettingsSaving(false);
    }
  };

  const handleSaveMFASettings = async () => {
    if (!token) return;
    if (!Number.isInteger(otpExpiryMinutes) || otpExpiryMinutes < 1 || otpExpiryMinutes > 60) {
      toast({ title: 'Invalid value', description: 'OTP expiry must be a whole number of minutes between 1 and 60.', variant: 'destructive' });
      return;
    }
    if (otpEnabled && (!smtpHost || !smtpUsername || !smtpFrom || (!smtpPasswordSet && !smtpPassword))) {
      toast({
        title: 'SMTP configuration required',
        description: 'Host, username, from-address and a password are required to enable email OTP.',
        variant: 'destructive',
      });
      return;
    }
    setMfaSaving(true);
    try {
      const updated = await mfaSettingsAPI.update(token, {
        otp_enabled: otpEnabled,
        otp_expiry_minutes: otpExpiryMinutes,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_username: smtpUsername,
        smtp_from: smtpFrom,
        ...(smtpPassword ? { smtp_password: smtpPassword } : {}),
      });
      hydrateMFAForm(updated);
      toast({
        title: 'MFA settings updated',
        description: updated.otp_enabled
          ? `Email OTP is enabled — codes expire after ${updated.otp_expiry_minutes} minute(s).`
          : 'Email OTP is disabled — users log in without a code.',
      });
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setMfaSaving(false);
    }
  };

  const handleSaveOIDCSettings = async () => {
    if (!token) return;
    if (msEnabled && (!msClientId || (!msClientSecretSet && !msClientSecret))) {
      toast({ title: 'Microsoft configuration required', description: 'Client ID and client secret are required to enable Microsoft login.', variant: 'destructive' });
      return;
    }
    if (ghEnabled && (!ghClientId || (!ghClientSecretSet && !ghClientSecret))) {
      toast({ title: 'GitHub configuration required', description: 'Client ID and client secret are required to enable GitHub login.', variant: 'destructive' });
      return;
    }
    setOidcSaving(true);
    try {
      const updated = await oidcSettingsAPI.update(token, {
        microsoft_enabled: msEnabled,
        microsoft_client_id: msClientId,
        microsoft_tenant_id: msTenantId,
        github_enabled: ghEnabled,
        github_client_id: ghClientId,
        ...(msClientSecret ? { microsoft_client_secret: msClientSecret } : {}),
        ...(ghClientSecret ? { github_client_secret: ghClientSecret } : {}),
      });
      hydrateOIDCForm(updated);
      toast({ title: 'Social login settings updated' });
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setOidcSaving(false);
    }
  };

  const handleResetTerminalSettings = () => {
    openConfirm({
      title: 'Reset idle timeout to default?',
      description: 'Idle terminal sessions will time out after 2 minutes again for everyone.',
      confirmLabel: 'Reset',
      onConfirm: async () => {
        if (!token) return;
        setTerminalSettingsSaving(true);
        try {
          const updated = await brandingAPI.updateBranding(token, { terminal_idle_timeout_minutes: 2 });
          setTerminalIdleTimeoutMinutes(updated.terminal_idle_timeout_minutes);
          setGlobalBranding(updated);
          toast({ title: 'Terminal settings reset', description: 'Idle timeout is back to 2 minutes.' });
        } catch (err) {
          toast({ title: 'Reset failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
        } finally {
          setTerminalSettingsSaving(false);
        }
      },
    });
  };

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: 'Settings' }]} className="mb-6" />

      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <SlidersHorizontal className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your account and organisation configuration</p>
        </div>
      </div>

      <Tabs
        defaultValue="profile"
        onValueChange={v => {
          if (v === 'log-management') { loadLogManagement(); loadLogShipping(); }
        }}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" />General
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="log-management" className="gap-2">
              <Archive className="w-4 h-4" />Log Management
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="directory" className="gap-2">
              <Users className="w-4 h-4" />Directory
            </TabsTrigger>
          )}
          {isSuperAdmin && (
            <TabsTrigger value="theme-config" className="gap-2">
              <Palette className="w-4 h-4" />Theme
            </TabsTrigger>
          )}
          {isSuperAdmin && (
            <TabsTrigger value="terminal-settings" className="gap-2">
              <Clock className="w-4 h-4" />Terminal
            </TabsTrigger>
          )}
          {isSuperAdmin && (
            <TabsTrigger value="mfa-settings" className="gap-2">
              <Shield className="w-4 h-4" />MFA
            </TabsTrigger>
          )}
        </TabsList>

        {/* ══════════════════════════════════════════════════════════
            General Tab
        ══════════════════════════════════════════════════════════ */}
        <TabsContent value="profile" className="space-y-6">
          {/* Profile */}
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Your avatar and account details</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Header banner: avatar + name + role badge */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-5 rounded-xl bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent border border-primary/10">
                <div className="relative shrink-0">
                  <Avatar className="w-20 h-20 ring-4 ring-background shadow-sm">
                    <AvatarImage src={profileData?.avatar_url || user?.avatar} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                      {user?.username?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <label htmlFor="avatar-upload" className="absolute bottom-0 right-0 w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors ring-2 ring-background">
                    {profileLoading === 'avatar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  </label>
                  <input type="file" id="avatar-upload" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={profileLoading === 'avatar'} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <p className="font-semibold text-xl truncate">
                      {(user?.first_name || user?.last_name)
                        ? `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim()
                        : (profileData?.username || user?.username)}
                    </p>
                    {user?.role && (
                      <Badge variant="outline" className="capitalize bg-primary/10 text-primary border-primary/20">
                        {user.role.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">@{profileData?.username || user?.username}</p>
                  <p className="text-xs text-muted-foreground mt-2">Max 10 MB · JPEG, PNG, WebP</p>
                </div>
              </div>

              {/* Info tiles */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/60 text-muted-foreground shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium truncate">{profileData?.email || user?.email || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/60 text-muted-foreground shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Tenant</p>
                    <p className="text-sm font-medium truncate">{user?.tenant_name || '—'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>
                    Use a key as a Bearer token to call any API directly — no login or OTP needed.
                    <span className="ml-1 text-xs">({apiKeys.length}/{MAX_API_KEYS} used)</span>
                  </CardDescription>
                </div>
              </div>
              {!showGenerateKeyForm && (
                apiKeys.length >= MAX_API_KEYS ? (
                  <p className="text-xs text-muted-foreground shrink-0 max-w-[220px] text-right">
                    Maximum of {MAX_API_KEYS} keys reached
                  </p>
                ) : (
                  <Button size="sm" onClick={() => setShowGenerateKeyForm(true)} className="gap-2 shrink-0">
                    <Plus className="w-4 h-4" />
                    Generate New Key
                  </Button>
                )
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Generate new key — name + expiration */}
              {showGenerateKeyForm && (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-key-name">Key Name</Label>
                      <Input
                        id="new-key-name"
                        placeholder="e.g. CI/CD pipeline"
                        value={newKeyName}
                        onChange={e => { setNewKeyName(e.target.value); setNewKeyNameError(''); }}
                        maxLength={40}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-key-expiry">Expiration</Label>
                      <Select value={newKeyExpiry} onValueChange={setNewKeyExpiry}>
                        <SelectTrigger id="new-key-expiry"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="never">No expiration</SelectItem>
                          <SelectItem value="30">30 days</SelectItem>
                          <SelectItem value="90">90 days</SelectItem>
                          <SelectItem value="180">180 days</SelectItem>
                          <SelectItem value="365">1 year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {newKeyNameError && <p className="text-xs text-destructive">{newKeyNameError}</p>}
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleGenerateKey} disabled={generatingKey} className="gap-2">
                      {generatingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                      {generatingKey ? 'Generating…' : 'Generate'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={generatingKey}
                      onClick={() => { setShowGenerateKeyForm(false); setNewKeyName(''); setNewKeyNameError(''); setNewKeyExpiry('never'); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* One-time reveal of a freshly generated key */}
              {justGeneratedKey && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-warning">
                      Copy your new key now — for security, you won&apos;t be able to see it again.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-md bg-background border border-border font-mono text-sm break-all">
                      {justGeneratedKey.fullValue}
                    </code>
                    <Button type="button" variant="outline" size="icon" onClick={handleCopyGeneratedKey} title="Copy">
                      {copiedGeneratedKey ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setJustGeneratedKey(null); setCopiedGeneratedKey(false); }}
                  >
                    I&apos;ve saved it — Done
                  </Button>
                </div>
              )}

              {/* Existing keys */}
              {apiKeysLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading keys…
                </div>
              ) : apiKeys.length === 0 ? (
                !showGenerateKeyForm && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No API keys yet. Generate one to call the API directly.
                  </p>
                )
              ) : (
                <div className="space-y-2 pt-1">
                  {apiKeys.map(k => {
                    const expired = !!k.expires_at && new Date(k.expires_at).getTime() < Date.now();
                    return (
                      <div key={k.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{k.name}</p>
                            {expired && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
                                Expired
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{k.key_prefix}••••••••</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {k.expires_at ? `${expired ? 'Expired' : 'Expires'} ${new Date(k.expires_at).toLocaleDateString()}` : 'Never expires'}
                            {' · '}
                            {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                            Created {new Date(k.created_at).toLocaleDateString()}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleRevokeKey(k.id, k.name)}
                            disabled={revokingKeyId === k.id}
                            title="Revoke"
                          >
                            {revokingKeyId === k.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cur-pass">Current Password</Label>
                  <Input id="cur-pass" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-pass">New Password</Label>
                    <Input id="new-pass" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="conf-pass">Confirm New Password</Label>
                    <Input id="conf-pass" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
                    {confirmPassword && newPassword !== confirmPassword && <p className="text-xs text-destructive">Passwords do not match</p>}
                  </div>
                </div>
                <Button type="submit" disabled={profileLoading === 'password'} className="gap-2">
                  {profileLoading === 'password' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {profileLoading === 'password' ? 'Changing…' : 'Change Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════
            Log Management Tab  (company_admin + super_admin)
        ══════════════════════════════════════════════════════════ */}
        {isAdmin && (
          <TabsContent value="log-management" className="space-y-6">

            {/* ── S3 Session Recording ──────────────────────────────── */}
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-primary" />
                      S3 Session Recording
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Remote-control and terminal sessions are automatically recorded to S3 when enabled, and
                      appear in the Session Recordings tab. With this off, nothing is recorded and nothing is
                      uploaded.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('text-sm font-medium', s3.enabled ? 'text-green-400' : 'text-muted-foreground')}>
                      {s3.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <Switch checked={s3.enabled} onCheckedChange={v => setS3(prev => ({ ...prev, enabled: v }))} />
                  </div>
                </div>
              </CardHeader>
              {s3.enabled && (
                <CardContent className="space-y-6">
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Protocol</Label>
                      <ProtocolSelect value={s3.protocol} onChange={v => setS3(p => ({ ...p, protocol: v }))} />
                    </div>
                    <div className="space-y-1.5"><Label>Endpoint URL</Label><Input placeholder="s3.amazonaws.com" value={s3.endpoint} onChange={e => setS3(p => ({ ...p, endpoint: e.target.value }))} /></div>
                    <div className="space-y-1.5"><Label>Access Key</Label><Input placeholder="AKIAIOSFODNN7EXAMPLE" value={s3.access_key} onChange={e => setS3(p => ({ ...p, access_key: e.target.value }))} autoComplete="off" /></div>
                    <div className="space-y-1.5">
                      <Label>Secret Key {secretKeySet && !s3.secret_key && <span className="ml-1 text-xs text-muted-foreground font-normal">(set — leave blank to keep)</span>}</Label>
                      <div className="relative">
                        <Input type={showSecret ? 'text' : 'password'} placeholder={secretKeySet ? '••••••••' : 'wJalrXUtnFEMI…'} value={s3.secret_key ?? ''} onChange={e => setS3(p => ({ ...p, secret_key: e.target.value }))} className="pr-10" autoComplete="new-password" />
                        <button type="button" onClick={() => setShowSecret(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5"><Label>Bucket Name</Label><Input placeholder="my-recordings-bucket" value={s3.bucket} onChange={e => setS3(p => ({ ...p, bucket: e.target.value }))} /></div>
                    <div className="space-y-1.5"><Label>Region <span className="ml-1 text-xs text-muted-foreground font-normal">(optional)</span></Label><Input placeholder="us-east-1" value={s3.region} onChange={e => setS3(p => ({ ...p, region: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-1.5 rounded-md bg-muted/40 border border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                    <p className="font-mono">
                      Recording path: <span className="text-foreground">&#123;organisation&#125;/&#123;group&#125;/&#123;machine&#125;/&#123;user&#125;/&#123;session&#125;/desktop.guac</span>
                    </p>
                    <p>
                      Objects are stored gzipped with <span className="font-mono">Content-Encoding: gzip</span>, so
                      browsers decompress them transparently during playback.
                    </p>
                  </div>
                  {s3Status !== 'idle' && (
                    <div className={cn('flex items-center gap-2 rounded-md px-4 py-2.5 text-sm', s3Status === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-destructive/10 text-destructive border border-destructive/30')}>
                      {s3Status === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                      {s3Message}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {/* Testing before saving, deliberately in that order.
                        Until this existed the only way to find out that
                        recordings were going nowhere was to run a session,
                        end it, and wait for a recording that never came. */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={s3Testing || !s3.bucket}
                      onClick={handleTestS3Recording}
                    >
                      {s3Testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      Test Connection
                    </Button>
                    {s3TestResult && (
                      <span className={cn('flex items-center gap-1.5 text-sm', s3TestResult.ok ? 'text-green-400' : 'text-destructive')}>
                        {s3TestResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                        {/* The whole message. S3's own reason names which of
                            a dozen settings is wrong; truncating it to
                            "Connection failed" throws that away. */}
                        <span className="break-all">{s3TestResult.msg}</span>
                      </span>
                    )}
                    <div className="ml-auto">
                      <Button onClick={handleSaveS3} disabled={s3Saving} className="gap-2">
                        {s3Saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {s3Saving ? 'Saving…' : 'Save S3 Config'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* ── Log Retention Period (super_admin only) ───────────── */}
            {isSuperAdmin && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Log Retention Period
                  </CardTitle>
                  <CardDescription>
                    How long logs are kept in the database before being archived or permanently deleted.
                    Applies globally to machine logs, session data, and audit logs across all tenants.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[5, 10, 20, 30].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => { setCfgRetentionDays(d); setCfgCustomRetention(''); }}
                          className={cn(
                            'px-5 py-2.5 rounded-lg border text-sm font-medium transition-all',
                            cfgRetentionDays === d
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted/30 border-border/50 hover:border-primary/50'
                          )}
                        >
                          {d} days
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCfgRetentionDays(0)}
                        className={cn(
                          'px-5 py-2.5 rounded-lg border text-sm font-medium transition-all',
                          cfgRetentionDays === 0
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/30 border-border/50 hover:border-primary/50'
                        )}
                      >
                        Custom
                      </button>
                    </div>

                    {cfgRetentionDays === 0 && (
                      <div className="flex items-center gap-3 max-w-xs">
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          placeholder="e.g. 45"
                          value={cfgCustomRetention}
                          onChange={e => setCfgCustomRetention(e.target.value)}
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">days</span>
                      </div>
                    )}
                  </div>

                  <div className="rounded-md bg-muted/30 border border-border/40 px-4 py-3 text-sm text-muted-foreground">
                    After this period, logs are <strong className="text-foreground">archived</strong> (if a destination is configured below) or <strong className="text-foreground">permanently deleted</strong>.
                  </div>

                  <Button onClick={handleSaveRetention} disabled={cfgSaving} className="gap-2">
                    {cfgSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {cfgSaving ? 'Saving…' : 'Save Retention Period'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── Archive Destination ───────────────────────────────── */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-primary" />
                  Log Archive Destination
                </CardTitle>
                <CardDescription>
                  Choose where to send machine logs, session data, and audit logs for long-term storage.
                  Credentials are encrypted (AES-256-GCM) before saving to DB.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {runsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
                ) : (
                  <>
                    {/* Archive toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base font-semibold">Enable Archival</Label>
                        <p className="text-sm text-muted-foreground">
                          Archive logs to external storage before deleting from database.
                          {!archiveEnabled && (
                            <> When disabled, logs are permanently deleted after{' '}
                              <strong className="text-foreground">
                                {logConfig?.retention_days ? `${logConfig.retention_days} days` : 'the retention period'}
                              </strong>.
                            </>
                          )}
                        </p>
                      </div>
                      <Switch checked={archiveEnabled} onCheckedChange={v => { setArchiveEnabled(v); if (!v) { setStorageType(''); setStorageCreds(undefined); setTestResult(null); } }} />
                    </div>

                    {archiveEnabled && (
                      <>
                        <Separator />

                        {/* Archive frequency */}
                        <div className="space-y-3">
                          <Label className="text-base font-semibold">Archive Frequency</Label>
                          <div className="flex flex-wrap gap-2">
                            {[5, 10, 20, 30].map(d => (
                              <button key={d} type="button" onClick={() => { setArchiveEveryDays(d); setCustomFrequency(''); }} className={cn('px-4 py-2 rounded-lg border text-sm font-medium transition-all', archiveEveryDays === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 border-border/50 hover:border-primary/50')}>
                                Every {d} days
                              </button>
                            ))}
                            <button type="button" onClick={() => setArchiveEveryDays(0)} className={cn('px-4 py-2 rounded-lg border text-sm font-medium transition-all', archiveEveryDays === 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 border-border/50 hover:border-primary/50')}>
                              Custom
                            </button>
                          </div>
                          {archiveEveryDays === 0 && (
                            <div className="flex items-center gap-3 max-w-xs">
                              <Input
                                type="number"
                                min="1"
                                max="365"
                                placeholder="e.g. 45"
                                value={customFrequency}
                                onChange={e => setCustomFrequency(e.target.value)}
                              />
                              <span className="text-sm text-muted-foreground whitespace-nowrap">days</span>
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* Storage destination */}
                        <div className="space-y-3">
                          <Label className="text-base font-semibold">Storage Destination</Label>
                          {/* A dropdown, not seven buttons in a grid.
                              It is a one-of-seven choice that is made once and
                              then never looked at again, and as a grid it took
                              more room than the credentials it introduces. */}
                          <Select
                            value={storageType || undefined}
                            onValueChange={v => {
                              const key = v as StorageType;
                              setStorageType(key);
                              setStorageCreds(defaultCredsForType(key));
                              // The old result belonged to the old
                              // destination. Left on screen it would report
                              // one bucket as reachable under another's name.
                              setTestResult(null);
                            }}
                          >
                            <SelectTrigger className="w-full sm:w-72">
                              <SelectValue placeholder="Choose where archives are written" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.entries(STORAGE_LABELS) as [StorageType, string][])
                                .filter(([k]) => k !== '')
                                .map(([key, label]) => (
                                  <SelectItem key={key} value={key}>
                                    {label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Credentials form */}
                        {storageType && (
                          <div className="space-y-4 rounded-lg border border-border/40 bg-muted/20 p-4">
                            <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                              <Lock className="w-4 h-4" />
                              {STORAGE_LABELS[storageType]} Credentials
                              <span className="ml-auto text-xs">AES-256-GCM encrypted</span>
                            </p>
                            <StorageCredsForm type={storageType} creds={storageCreds} onChange={setStorageCreds} />
                            <div className="flex items-center gap-3 pt-1">
                              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={lmTesting || !storageCreds} onClick={handleTestConnection}>
                                {lmTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                                Test Connection
                              </Button>
                              {testResult && (
                                <span className={cn('flex items-center gap-1.5 text-sm', testResult.ok ? 'text-green-400' : 'text-destructive')}>
                                  {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                  {testResult.msg}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {!archiveEnabled && (
                      <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-2.5 text-sm text-yellow-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        Archiving disabled — logs will be permanently deleted after{' '}
                        <strong>
                          {logConfig?.retention_days ? `${logConfig.retention_days} days` : 'the retention period'}
                        </strong>.
                      </div>
                    )}

                    <Separator />

                    <div className="flex items-center gap-3 flex-wrap">
                      <Button onClick={handleSaveArchiveConfig} disabled={lmSaving} className="gap-2">
                        {lmSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {lmSaving ? 'Saving…' : 'Save Archive Config'}
                      </Button>
                      <Button type="button" variant="outline" onClick={handleArchiveNow} disabled={lmArchiving} className="gap-2">
                        {lmArchiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        Archive Now
                      </Button>
                      <p className="text-xs text-muted-foreground">Archives and removes logs older than the retention period immediately.</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Archive History ───────────────────────────────────── */}
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Archive className="w-5 h-5 text-primary" />Archive History</CardTitle>
                    <CardDescription className="mt-1">Last 10 archival runs — machine logs, sessions, audit_logs</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadLogManagement} disabled={runsLoading} className="gap-2">
                    <RefreshCw className={cn('w-4 h-4', runsLoading && 'animate-spin')} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {runsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
                ) : archiveRuns.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm space-y-2">
                    <Archive className="w-8 h-8 mx-auto opacity-30" />
                    <p>No archive runs yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b border-border/40">
                          <th className="pb-2 pr-4 font-medium">Started</th>
                          <th className="pb-2 pr-4 font-medium">Status</th>
                          <th className="pb-2 pr-4 font-medium">Trigger</th>
                          <th className="pb-2 pr-4 font-medium">Storage</th>
                          <th className="pb-2 pr-4 font-medium">Archived</th>
                          <th className="pb-2 pr-4 font-medium">Deleted</th>
                          <th className="pb-2 pr-4 font-medium">Size</th>
                          {isSuperAdmin && <th className="pb-2 font-medium">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {archiveRuns.map(run => (
                          <tr key={run.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{new Date(run.started_at).toLocaleString()}</td>
                            <td className="py-3 pr-4"><StatusBadge status={run.status} /></td>
                            <td className="py-3 pr-4"><span className="text-xs px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">{run.trigger}</span></td>
                            <td className="py-3 pr-4 text-muted-foreground">{run.storage_type || '—'}</td>
                            <td className="py-3 pr-4">{run.logs_archived.toLocaleString()}</td>
                            <td className="py-3 pr-4">{run.logs_deleted.toLocaleString()}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{formatBytes(run.bytes_archived)}</td>
                            {isSuperAdmin && (
                              <td className="py-3">
                                {run.status === 'success' && run.archive_key && (
                                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => handleRestore(run)}>
                                    <RotateCcw className="w-3 h-3" />Restore
                                  </Button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Endpoint Log Collection ──────────────────────────────
                Each MACHINE's own system logs and website activity. The
                cards above govern the PORTAL's logs: what it keeps, and
                where it archives them. These are a different source with a
                different destination, which is why the heading says so.
            ──────────────────────────────────────────────────────────── */}
            {lsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />Loading…
              </div>
            ) : (
              <>
                {/* Collection has no effect without somewhere to put the logs,
                    so that is said here rather than left to be discovered when
                    the bucket turns out to be empty. */}
                {ls.enabled && !lsArchiveConfigured && (
                  <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                    <div className="text-sm">
                      <p className="font-medium">No archive destination is configured.</p>
                      <p className="mt-1 text-muted-foreground">
                        Agents will collect and upload, and the backend will discard every batch.
                        Configure S3 Session Recording storage at the top of this page first — the
                        endpoint logs go to the same bucket.
                      </p>
                    </div>
                  </div>
                )}

                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ScrollText className="w-5 h-5 text-primary" />Endpoint Log Collection
                    </CardTitle>
                    <CardDescription>
                      Ships each machine&apos;s own system logs to your storage, so you can answer what
                      happened on a laptop after the fact. Applies to every enrolled machine in the
                      organisation. Windows and macOS only.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base font-semibold">Collect endpoint logs</Label>
                        <p className="text-xs text-muted-foreground">
                          Off by default. Machines that are offline apply a change when they reconnect.
                        </p>
                      </div>
                      <Switch
                        checked={ls.enabled}
                        onCheckedChange={v => setLs(prev => ({ ...prev, enabled: v }))}
                      />
                    </div>

                    {ls.enabled && (
                      <>
                        <div className="space-y-4 border-t pt-5">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="flex items-center gap-2 font-medium">
                                <HardDrive className="w-4 h-4 text-muted-foreground" />System logs
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Windows Event Log (Security, System, Application, PowerShell, RDP and more)
                                and the macOS unified log.
                              </p>
                            </div>
                            <Switch
                              checked={ls.system_logs}
                              onCheckedChange={v => setLs(prev => ({ ...prev, system_logs: v }))}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="flex items-center gap-2 font-medium">
                                <Globe className="w-4 h-4 text-muted-foreground" />Website activity
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Domains the machine looked up, taken from DNS — so it covers every
                                application, not only browsers. Domains, not full URLs, and a cached lookup
                                leaves no record.
                              </p>
                            </div>
                            <Switch
                              checked={ls.websites}
                              onCheckedChange={v => setLs(prev => ({ ...prev, websites: v }))}
                            />
                          </div>
                        </div>

                        <div className="grid gap-5 border-t pt-5 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="ls-budget">Daily limit per machine (MB)</Label>
                            <Input
                              id="ls-budget"
                              type="number"
                              min={-1}
                              value={ls.daily_budget_mb}
                              onChange={e => setLs(prev => ({ ...prev, daily_budget_mb: Number(e.target.value) }))}
                            />
                            <p className="text-xs text-muted-foreground">
                              Compressed. Default 256. A machine that hits the cap pauses until the next day
                              and says so in its log. Use -1 for no limit.
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="ls-interval">Upload every (seconds)</Label>
                            <Input
                              id="ls-interval"
                              type="number"
                              min={10}
                              max={3600}
                              value={ls.interval_seconds}
                              onChange={e => setLs(prev => ({ ...prev, interval_seconds: Number(e.target.value) }))}
                            />
                            <p className="text-xs text-muted-foreground">Default 30.</p>
                          </div>

                          <div className="space-y-1.5">
                            <Label htmlFor="ls-backfill">Collect history on first run (hours)</Label>
                            <Input
                              id="ls-backfill"
                              type="number"
                              min={0}
                              max={720}
                              value={ls.backfill_hours}
                              onChange={e => setLs(prev => ({ ...prev, backfill_hours: Number(e.target.value) }))}
                            />
                            <p className="text-xs text-muted-foreground">
                              Default 24. Bounds the first upload so an old machine does not ship its whole
                              retained history at once.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4 border-t pt-5">
                          <p className="text-sm font-medium">Verbosity</p>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="font-medium">Include info and debug records</Label>
                              {/* Worth stating plainly: this is the single
                                  setting most likely to produce a surprising
                                  bill. */}
                              <p className="text-xs text-muted-foreground">
                                Can increase a machine&apos;s volume by roughly ten times — on macOS these are
                                most of what the OS writes. Leave off unless you are chasing something
                                specific.
                              </p>
                            </div>
                            <Switch
                              checked={ls.include_info_debug}
                              onCheckedChange={v => setLs(prev => ({ ...prev, include_info_debug: v }))}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="font-medium">Keep the original record</Label>
                              <p className="text-xs text-muted-foreground">
                                Roughly doubles volume. Errors and crashes keep their full detail either way,
                                so this only adds it to routine records.
                              </p>
                            </div>
                            <Switch
                              checked={ls.keep_raw}
                              onCheckedChange={v => setLs(prev => ({ ...prev, keep_raw: v }))}
                            />
                          </div>
                        </div>

                        <div className="rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">Where the logs land</p>
                          <p className="mt-1 font-mono">
                            organisation / group / machine / user / system-logs / YYYY / MM / DD
                          </p>
                          <p className="mt-2">
                            Same layout as session recordings, stored as gzipped NDJSON. On macOS, hostnames
                            in website activity are withheld by the OS unless private-data logging is enabled
                            on the machine; the agent reports this in its own log when it sees it.
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <div className="flex items-center gap-3">
                  <Button onClick={handleSaveLogShipping} disabled={lsSaving} className="gap-2">
                    {lsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {lsSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </>
            )}

          </TabsContent>
        )}

        {/* ══════════════════════════════════════════════════════════
            Directory Tab  (admin)

            Microsoft Entra synchronisation. Lives beside the other
            organisation-wide settings because it governs who exists here at
            all, which everything else depends on.
        ══════════════════════════════════════════════════════════ */}
        {isAdmin && (
          <TabsContent value="directory" className="space-y-6">
            <EntraSyncSettings token={token} />
          </TabsContent>
        )}

        {/* ══════════════════════════════════════════════════════════
            Theme Configuration Tab  (super_admin only)
        ══════════════════════════════════════════════════════════ */}
        {isSuperAdmin && (
          <TabsContent value="theme-config" className="space-y-6">
            {/* Logo */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ImageIcon className="w-5 h-5 text-primary" />Company Logo</CardTitle>
                <CardDescription>
                  PNG only, transparent background recommended. Square, at least 256×256px, max 2 MB.
                  Replaces the terminal icon in the sidebar and on the login screen for every user.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="flex items-center justify-center w-20 h-20 rounded-xl border border-dashed border-border bg-muted/30 overflow-hidden shrink-0">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="logo-upload"
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input text-sm font-medium cursor-pointer hover:bg-accent transition-colors",
                        logoUploading && "opacity-50 pointer-events-none"
                      )}
                    >
                      {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      {logoUploading ? 'Uploading…' : 'Upload PNG'}
                    </label>
                    <input id="logo-upload" type="file" accept="image/png" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
                    {logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          setLogoUrl('');
                          toast({ title: 'Logo removed', description: 'Click Save changes to apply it for everyone.' });
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Favicon */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ImageIcon className="w-5 h-5 text-primary" />Company Favicon</CardTitle>
                <CardDescription>.ICO only, 32×32px recommended, max 512 KB. Shown as the browser tab icon.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg border border-dashed border-border bg-muted/30 overflow-hidden shrink-0">
                    {faviconUrl ? (
                      <img src={faviconUrl} alt="Favicon" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="favicon-upload"
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input text-sm font-medium cursor-pointer hover:bg-accent transition-colors",
                        faviconUploading && "opacity-50 pointer-events-none"
                      )}
                    >
                      {faviconUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      {faviconUploading ? 'Uploading…' : 'Upload .ico'}
                    </label>
                    <input id="favicon-upload" type="file" accept=".ico,image/x-icon,image/vnd.microsoft.icon" onChange={handleFaviconUpload} className="hidden" disabled={faviconUploading} />
                    {faviconUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          setFaviconUrl('');
                          toast({ title: 'Favicon removed', description: 'Click Save changes to apply it for everyone.' });
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Product name */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Type className="w-5 h-5 text-primary" />Product Name</CardTitle>
                <CardDescription>
                  Split into two parts — shown everywhere &quot;EPM&quot; appears today. Leave either part
                  blank to put the whole name in the other one. Part 1 uses the normal text colour, Part 2
                  always follows the Default Theme Colour below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Name — Part 1</Label>
                    <Input value={namePart1} onChange={e => setNamePart1(e.target.value)} placeholder="Web" maxLength={20} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Name — Part 2</Label>
                    <Input value={namePart2} onChange={e => setNamePart2(e.target.value)} placeholder="Xterm" maxLength={20} />
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground mb-2">Preview</p>
                  <span className="text-2xl font-bold tracking-tight">
                    <span>{namePart1}</span>
                    <span style={{ color: THEME_COLOR_HSL[defaultThemeColor] }}>{namePart2}</span>
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Default theme colour */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5 text-primary" />Default Theme Colour</CardTitle>
                <CardDescription>
                  The accent colour every user sees until they pick their own from their profile menu — a
                  personal choice always overrides this default.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {[
                    { name: 'Cyan', value: 'cyan', color: 'bg-[hsl(173,80%,40%)]' },
                    { name: 'Green', value: 'green', color: 'bg-[hsl(142,76%,36%)]' },
                    { name: 'Purple', value: 'purple', color: 'bg-[hsl(262,83%,58%)]' },
                    { name: 'Orange', value: 'orange', color: 'bg-[hsl(25,95%,53%)]' },
                    { name: 'Blue', value: 'blue', color: 'bg-[hsl(217,91%,60%)]' },
                  ].map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setDefaultThemeColor(c.value)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all',
                        defaultThemeColor === c.value ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/50'
                      )}
                    >
                      <div className={cn('w-4 h-4 rounded-full', c.color)} />
                      {c.name}
                      {defaultThemeColor === c.value && <CheckCircle2 className="w-3.5 h-3.5 text-primary ml-1" />}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button onClick={handleSaveBranding} disabled={brandingSaving} className="gap-2">
                {brandingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {brandingSaving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button type="button" variant="outline" onClick={handleResetBranding} disabled={brandingSaving} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Reset to default
              </Button>
            </div>
          </TabsContent>
        )}

        {/* ══════════════════════════════════════════════════════════
            Terminal Settings Tab  (super_admin only)
        ══════════════════════════════════════════════════════════ */}
        {isSuperAdmin && (
          <TabsContent value="terminal-settings" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-primary" />Idle Session Timeout</CardTitle>
                <CardDescription>
                  How long a session may sit idle before it&apos;s automatically closed — no commands typed in a
                  terminal, no mouse or keyboard activity in a remote-control session. The user has to start a
                  new session afterwards; nothing is silently resumed. Applies to every user in the organisation.
                  <span className="mt-2 block text-xs">
                    Remote-control sessions are closed by the machine itself, so a crashed or hung browser tab
                    cannot leave someone&apos;s screen shared.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-w-[220px]">
                  <Label htmlFor="terminal-idle-timeout">Timeout (minutes)</Label>
                  <Input
                    id="terminal-idle-timeout"
                    type="number"
                    min={1}
                    max={240}
                    value={terminalIdleTimeoutMinutes}
                    onChange={e => setTerminalIdleTimeoutMinutes(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Between 1 and 240 minutes. Default: 2.</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button onClick={handleSaveTerminalSettings} disabled={terminalSettingsSaving} className="gap-2">
                {terminalSettingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {terminalSettingsSaving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button type="button" variant="outline" onClick={handleResetTerminalSettings} disabled={terminalSettingsSaving} className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Reset to default
              </Button>
            </div>
          </TabsContent>
        )}

        {/* ══════════════════════════════════════════════════════════
            MFA Settings Tab  (super_admin only)
        ══════════════════════════════════════════════════════════ */}
        {isSuperAdmin && (
          <TabsContent value="mfa-settings" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" />Email OTP (Two-Factor Login)</CardTitle>
                <CardDescription>
                  When enabled, everyone signing in through the web UI is emailed a one-time code before they
                  get a session. API keys and CLI logins are never affected by this toggle.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                  <div>
                    <p className="text-sm font-medium">Require email OTP on login</p>
                    <p className="text-xs text-muted-foreground">Disabling this lets users log in with just their password.</p>
                  </div>
                  <Switch checked={otpEnabled} onCheckedChange={setOtpEnabled} disabled={mfaLoading} />
                </div>

                <div className="space-y-1.5 max-w-[220px]">
                  <Label htmlFor="otp-expiry">OTP expiry (minutes)</Label>
                  <Input
                    id="otp-expiry"
                    type="number"
                    min={1}
                    max={60}
                    value={otpExpiryMinutes}
                    disabled={mfaLoading}
                    onChange={e => setOtpExpiryMinutes(Number(e.target.value))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" />SMTP Configuration</CardTitle>
                <CardDescription>
                  The mail server used to send OTP codes. Required to enable email OTP above.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input
                      id="smtp-host"
                      placeholder="smtp.gmail.com"
                      value={smtpHost}
                      disabled={mfaLoading}
                      onChange={e => setSmtpHost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port">SMTP Port</Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={smtpPort}
                      disabled={mfaLoading}
                      onChange={e => setSmtpPort(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-username">SMTP Username</Label>
                    <Input
                      id="smtp-username"
                      placeholder="you@example.com"
                      value={smtpUsername}
                      disabled={mfaLoading}
                      onChange={e => setSmtpUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-password">SMTP Password</Label>
                    <div className="relative">
                      <Input
                        id="smtp-password"
                        type={showSmtpPassword ? 'text' : 'password'}
                        placeholder={smtpPasswordSet ? 'Leave blank to keep existing password' : 'Enter SMTP password'}
                        value={smtpPassword}
                        disabled={mfaLoading}
                        onChange={e => setSmtpPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {smtpPasswordSet && !smtpPassword && (
                      <p className="text-xs text-muted-foreground">A password is already configured.</p>
                    )}
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="smtp-from">From Address</Label>
                    <Input
                      id="smtp-from"
                      placeholder="noreply@vsay.com"
                      value={smtpFrom}
                      disabled={mfaLoading}
                      onChange={e => setSmtpFrom(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button onClick={handleSaveMFASettings} disabled={mfaLoading || mfaSaving} className="gap-2">
                {mfaSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {mfaSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>

            <Separator />

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  Microsoft Login
                </CardTitle>
                <CardDescription>
                  Lets users sign in with a Microsoft account. When disabled, the button is hidden from the login screen entirely.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                  <div>
                    <p className="text-sm font-medium">Show &quot;Continue with Microsoft&quot; on login</p>
                    <p className="text-xs text-muted-foreground">Requires the client ID and secret below.</p>
                  </div>
                  <Switch checked={msEnabled} onCheckedChange={setMsEnabled} disabled={oidcLoading} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ms-client-id">Client ID</Label>
                    <Input
                      id="ms-client-id"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={msClientId}
                      disabled={oidcLoading}
                      onChange={e => setMsClientId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ms-tenant-id">Tenant ID</Label>
                    <Input
                      id="ms-tenant-id"
                      placeholder="common"
                      value={msTenantId}
                      disabled={oidcLoading}
                      onChange={e => setMsTenantId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Leave as &quot;common&quot; for multi-tenant / personal accounts.</p>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="ms-client-secret">Client Secret</Label>
                    <div className="relative">
                      <Input
                        id="ms-client-secret"
                        type={showMsSecret ? 'text' : 'password'}
                        placeholder={msClientSecretSet ? 'Leave blank to keep existing secret' : 'Enter client secret'}
                        value={msClientSecret}
                        disabled={oidcLoading}
                        onChange={e => setMsClientSecret(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMsSecret(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showMsSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {msClientSecretSet && !msClientSecret && (
                      <p className="text-xs text-muted-foreground">A client secret is already configured.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  GitHub Login
                </CardTitle>
                <CardDescription>
                  Lets users sign in with a GitHub account. When disabled, the button is hidden from the login screen entirely.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                  <div>
                    <p className="text-sm font-medium">Show &quot;Continue with GitHub&quot; on login</p>
                    <p className="text-xs text-muted-foreground">Requires the client ID and secret below.</p>
                  </div>
                  <Switch checked={ghEnabled} onCheckedChange={setGhEnabled} disabled={oidcLoading} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="gh-client-id">Client ID</Label>
                    <Input
                      id="gh-client-id"
                      placeholder="Iv1.xxxxxxxxxxxxxxxx"
                      value={ghClientId}
                      disabled={oidcLoading}
                      onChange={e => setGhClientId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gh-client-secret">Client Secret</Label>
                    <div className="relative">
                      <Input
                        id="gh-client-secret"
                        type={showGhSecret ? 'text' : 'password'}
                        placeholder={ghClientSecretSet ? 'Leave blank to keep existing secret' : 'Enter client secret'}
                        value={ghClientSecret}
                        disabled={oidcLoading}
                        onChange={e => setGhClientSecret(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGhSecret(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showGhSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {ghClientSecretSet && !ghClientSecret && (
                      <p className="text-xs text-muted-foreground">A client secret is already configured.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button onClick={handleSaveOIDCSettings} disabled={oidcLoading || oidcSaving} className="gap-2">
                {oidcSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {oidcSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </TabsContent>
        )}

      </Tabs>

      {/* ── Shared confirm dialog ──────────────────────────────── */}
      <AlertDialog open={confirmDialog.open} onOpenChange={open => !open && closeConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              onClick={() => { confirmDialog.onConfirm(); closeConfirm(); }}
            >
              {confirmDialog.confirmLabel ?? 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
