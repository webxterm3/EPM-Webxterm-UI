'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Mail, Lock, Building2, ChevronRight, Shield, Zap, Laptop } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { BrandName } from '@/components/BrandMark';
import { PolicyDecisionStream } from '@/components/PolicyDecisionStream';
import { BrandIcon } from '@/components/BrandIcon';
import { authAPI, TenantInfo, getOIDCLoginURL } from '@/lib/auth-api';
import { oidcProvidersAPI, OIDCProviders } from '@/lib/oidc-settings-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type LoginStep = 'credentials' | 'tenant-select';

// ─── Floating orb ────────────────────────────────────────────────────────────
function FloatingOrb({ size, x, y, delay }: { size: number; x: string; y: string; delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size, height: size, left: x, top: y,
        background: 'radial-gradient(circle, hsl(var(--primary) / 0.12) 0%, transparent 70%)',
      }}
      animate={{ y: [0, -20, 0], opacity: [0.4, 0.9, 0.4] }}
      transition={{ duration: 6 + delay * 1.5, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [sessionToken, setSessionToken] = useState('');
  const [selectingTenant, setSelectingTenant] = useState<string | null>(null);

  // Fails closed (both hidden) until the backend confirms a provider is enabled —
  // showing a button that 501s when clicked is worse than briefly hiding it.
  const [oidcProviders, setOidcProviders] = useState<OIDCProviders>({ microsoft_enabled: false, github_enabled: false });
  useEffect(() => {
    oidcProvidersAPI.getProviders().then(setOidcProviders).catch(() => {});
  }, []);

  const { login } = useAuth();
  // `resolved` gates every rendering of the NAME: until the org's config has
  // arrived, the defaults in `branding` are a guess, and painting them first
  // is what made the stock name flicker on screen before the real one.
  const { branding, resolved: brandingResolved } = useBranding();
  const router = useRouter();
  const { toast } = useToast();

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter your email.', variant: 'destructive' });
      return;
    }
    if (!password) {
      toast({ title: 'Validation Error', description: 'Please enter your password.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const result = await authAPI.login({ email: email.trim().toLowerCase(), password });
      if ('requires_otp' in result && result.requires_otp) {
        toast({ title: 'OTP Sent', description: 'Please check your email for the verification code.' });
        router.push(`/verify-otp?username=${encodeURIComponent(result.username)}&expires_in=${result.otp_expires_in_min}`);
        return;
      }
      if ('requires_tenant_selection' in result && result.requires_tenant_selection) {
        setTenants(result.tenants);
        setSessionToken(result.session_token);
        setStep('tenant-select');
        return;
      }
      if ('token' in result && 'user' in result) {
        if (result.must_reset_password) {
          sessionStorage.setItem('vsay-reset-token', result.token);
          router.push('/reset-password');
          return;
        }
        login(result.token, result.user, result.session_token, result.available_tenants);
        toast({ title: 'Welcome back!', description: 'You have successfully logged in.' });
        window.location.replace('/dashboard');
      }
    } catch (error) {
      toast({
        title: 'Login failed',
        description: error instanceof Error ? error.message : 'Invalid credentials. Please check your details.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTenantSelect = async (tenantId: string) => {
    setSelectingTenant(tenantId);
    try {
      const result = await authAPI.selectTenant({ session_token: sessionToken, tenant_id: tenantId });
      if ('requires_otp' in result && result.requires_otp) {
        toast({ title: 'OTP Sent', description: 'Please check your email for the verification code.' });
        router.push(`/verify-otp?username=${encodeURIComponent(result.username)}&expires_in=${result.otp_expires_in_min}`);
        return;
      }
      if ('token' in result && 'user' in result) {
        if (result.must_reset_password) {
          sessionStorage.setItem('vsay-reset-token', result.token);
          router.push('/reset-password');
          return;
        }
        login(result.token, result.user, result.session_token, result.available_tenants);
        toast({ title: 'Welcome back!', description: `Logged in to ${result.user.tenant_name}.` });
        window.location.replace('/dashboard');
      }
    } catch (error) {
      toast({
        title: 'Tenant selection failed',
        description: error instanceof Error ? error.message : 'Failed to select tenant.',
        variant: 'destructive',
      });
    } finally {
      setSelectingTenant(null);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left Panel — Branding ──────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-primary/5">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 pointer-events-none" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />

        {/* Radial glow centre */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, hsl(var(--primary) / 0.15), transparent)' }}
        />

        {/* Floating orbs */}
        <FloatingOrb size={320} x="60%" y="-5%" delay={0} />
        <FloatingOrb size={200} x="-8%" y="55%" delay={1.4} />
        <FloatingOrb size={160} x="70%" y="65%" delay={2.2} />

        {/* Blinking scatter dots */}
        {[
          { x: '12%', y: '18%' }, { x: '78%', y: '12%' }, { x: '88%', y: '45%' },
          { x: '8%', y: '78%' },  { x: '55%', y: '88%' }, { x: '35%', y: '5%' },
        ].map((pos, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-primary/50 pointer-events-none"
            style={{ left: pos.x, top: pos.y }}
            animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.6, 1] }}
            transition={{ duration: 2.5 + i * 0.4, repeat: Infinity, delay: i * 0.6 }}
          />
        ))}

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3 mb-10"
          >
            <div className="relative">
              {!branding.logo_url && (
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-xl bg-primary/30 blur-sm pointer-events-none"
                />
              )}
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="" className="relative w-12 h-12 object-contain" />
              ) : (
                <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground shadow-lg">
                  <BrandIcon className="w-7 h-7" />
                </div>
              )}
            </div>
            <span className={cn('text-4xl font-extrabold tracking-tight', !brandingResolved && 'invisible')}>
              <span>{branding.name_part1}</span>
              <span className="text-primary">{branding.name_part2}</span>
            </span>
          </motion.div>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary w-fit mb-6"
          >
            <motion.span
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-primary"
            />
            Endpoint Privilege Management
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-5">
              Endpoint Privilege<br />
              <span className="gradient-text">Management</span>
            </h1>
            <p className="text-base text-muted-foreground max-w-md leading-relaxed">
              Take away standing admin rights without taking away the work. Applications
              are inventoried, policies decide what may elevate, and every decision is
              recorded.
            </p>
          </motion.div>

          {/* Animated terminal */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <PolicyDecisionStream />
          </motion.div>

          {/* Trust chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="flex flex-wrap gap-2.5 mt-8"
          >
            {[
              { icon: Shield, text: 'No standing admin rights' },
              { icon: Zap,    text: 'Just-in-time elevation' },
              { icon: Laptop, text: 'Windows · macOS · Linux' },
            ].map((chip, i) => (
              <motion.div
                key={chip.text}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.9 + i * 0.1 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/60 border border-border/60 text-xs text-muted-foreground backdrop-blur-sm"
              >
                <chip.icon className="h-3 w-3 text-primary" />
                {chip.text}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* ── Right Panel — Form ────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden">
        {/* Subtle background glow */}
        <div
          className="absolute top-0 right-0 w-[400px] h-[400px] pointer-events-none opacity-40"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.08) 0%, transparent 70%)' }}
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Mobile logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="lg:hidden flex items-center justify-center gap-3 mb-8"
          >
            <div className="relative">
              {!branding.logo_url && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-xl bg-primary/30 blur-sm pointer-events-none"
                />
              )}
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="" className="relative w-10 h-10 object-contain" />
              ) : (
                <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-primary-foreground">
                  <BrandIcon className="w-6 h-6" />
                </div>
              )}
            </div>
            <span className={cn('text-3xl font-extrabold tracking-tight', !brandingResolved && 'invisible')}>
              <span>{branding.name_part1}</span>
              <span className="text-primary">{branding.name_part2}</span>
            </span>
          </motion.div>

          {/* Step content */}
          <AnimatePresence mode="wait">

            {/* ── Credentials step ── */}
            {step === 'credentials' && (
              <motion.div
                key="credentials"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    <h2 className="text-2xl font-bold">Welcome back</h2>
                    <p className="text-muted-foreground mt-2 text-sm">
                      Sign in to your <BrandName /> account
                    </p>
                  </motion.div>
                </div>

                <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="email">Email</Label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-12 transition-all duration-200 focus:border-primary/60 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.27 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <Link href="/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors">
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 h-12 transition-all duration-200 focus:border-primary/60 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
                        required
                        autoComplete="current-password"
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.34 }}
                  >
                    <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}>
                      <Button type="submit" className="w-full h-12 text-base font-medium relative overflow-hidden" disabled={loading}>
                        {loading ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Signing in...
                          </span>
                        ) : (
                          'Sign in'
                        )}
                      </Button>
                    </motion.div>
                  </motion.div>
                </form>

                {(oidcProviders.microsoft_enabled || oidcProviders.github_enabled) && (
                  <>
                    {/* Divider */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.4 }}
                      className="relative my-6"
                    >
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">or continue with</span>
                      </div>
                    </motion.div>

                    {/* SSO buttons */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.46 }}
                      className={cn('grid gap-3', oidcProviders.microsoft_enabled && oidcProviders.github_enabled ? 'grid-cols-2' : 'grid-cols-1')}
                    >
                      {[
                        oidcProviders.microsoft_enabled && {
                          href: getOIDCLoginURL('microsoft'),
                          label: 'Microsoft',
                          icon: (
                            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 21 21" fill="none">
                              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                            </svg>
                          ),
                        },
                        oidcProviders.github_enabled && {
                          href: getOIDCLoginURL('github'),
                          label: 'GitHub',
                          icon: (
                            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                            </svg>
                          ),
                        },
                      ].filter(Boolean).map((provider) => provider && (
                        <motion.a
                          key={provider.label}
                          href={provider.href}
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                          className="flex items-center justify-center gap-2 h-11 rounded-lg border border-border hover:bg-accent hover:border-primary/30 transition-all text-sm font-medium"
                        >
                          {provider.icon}
                          {provider.label}
                        </motion.a>
                      ))}
                    </motion.div>
                  </>
                )}

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.52 }}
                  className="mt-6 text-center text-sm text-muted-foreground"
                >
                  Don&apos;t have an account?{' '}
                  <Link href="/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
                    Create account
                  </Link>
                </motion.p>
              </motion.div>
            )}

            {/* ── Tenant select step ── */}
            {step === 'tenant-select' && (
              <motion.div
                key="tenant-select"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4"
                  >
                    <Building2 className="w-7 h-7 text-primary" />
                  </motion.div>
                  <h2 className="text-2xl font-bold">Select Workspace</h2>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Your account has access to multiple workspaces.
                  </p>
                </div>

                <div className="space-y-3">
                  {tenants.map((tenant, i) => (
                    <motion.button
                      key={tenant.tenant_id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: i * 0.07 }}
                      whileHover={{ scale: 1.015, x: 3 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleTenantSelect(tenant.tenant_id)}
                      disabled={selectingTenant !== null}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0 group-hover:bg-primary/20 transition-colors relative z-10">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 relative z-10">
                        <p className="font-semibold truncate">{tenant.tenant_name}</p>
                        <p className="text-sm text-muted-foreground truncate">@{tenant.username}</p>
                      </div>
                      <div className="relative z-10">
                        {selectingTenant === tenant.tenant_id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>

                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  onClick={() => setStep('credentials')}
                  className="mt-6 w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
                >
                  ← Back to login
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
