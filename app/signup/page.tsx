'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Mail, Lock, User, Building, UserCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BrandMark, BrandName } from '@/components/BrandMark';
import { authAPI, getOIDCLoginURL } from '@/lib/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { signupDisabled } from '@/lib/features';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    organizationName: '',
    companyName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
    setFormData({ ...formData, username: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!formData.username.trim() || formData.username.length < 3) {
      toast({
        title: "Validation Error",
        description: "Username must be at least 3 characters (lowercase and numbers only).",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter your first and last name.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.organizationName.trim() || !formData.companyName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter your organization details.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Validation Error",
        description: "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.signup({
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        organization_name: formData.organizationName.trim(),
        company_name: formData.companyName.trim(),
      });

      // Signup successful - user created with company_admin role
      login(response.token, response.user);

      toast({
        title: "Account created!",
        description: "Your organization and account have been created successfully.",
      });

      router.push('/dashboard');
    } catch (error) {
      toast({
        title: "Signup failed",
        description: error instanceof Error ? error.message : "Failed to create account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  // Middleware is what actually closes this route; this is the second lock
  // on the same door. A page that CAN render when the feature is off is a
  // page that will — through a client-side navigation, a stale build, or a
  // matcher somebody narrows later — and the form it renders creates a
  // tenant.
  if (signupDisabled) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">Accounts are created by your administrator</h1>
          <p className="text-sm text-muted-foreground">
            Self-service signup is switched off on this installation. Ask whoever
            runs it to create your organisation and account.
          </p>
          <Link href="/login" className="inline-block text-sm text-primary hover:text-primary/80">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="flex items-center gap-3 mb-8">
            <BrandMark
              iconBoxClassName="w-12 h-12 rounded-xl bg-primary text-primary-foreground"
              iconClassName="w-7 h-7"
              logoSizeClassName="w-12 h-12"
              textClassName="text-5xl font-extrabold tracking-tight"
            />
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">
            Least Privilege<br />
            <span className="gradient-text">Across Every Endpoint</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Create your account to inventory what your fleet runs, decide what may
            elevate, and keep a record of every decision.
          </p>

          {/* Benefits List */}
          <div className="mt-12 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Application Inventory</h3>
                <p className="text-sm text-muted-foreground">See exactly what is installed, on every machine</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Elevation Policies</h3>
                <p className="text-sm text-muted-foreground">Allow, block or elevate by app, publisher or group</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Full Audit Trail</h3>
                <p className="text-sm text-muted-foreground">Every request, decision and session, exportable</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Signup Form */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <BrandMark
              iconBoxClassName="w-10 h-10 rounded-xl bg-primary text-primary-foreground"
              iconClassName="w-6 h-6"
              logoSizeClassName="w-10 h-10"
              textClassName="text-5xl font-extrabold tracking-tight"
            />
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold">Create your account</h2>
            <p className="text-muted-foreground mt-2">
              Set up your organization and get started with <BrandName />
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Personal Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <div className="relative">
                  <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="pl-10 h-11"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="h-11"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder="john123"
                  value={formData.username}
                  onChange={handleUsernameChange}
                  className="pl-10 h-11"
                  required
                  pattern="[a-z0-9]{3,}"
                  title="Username must be lowercase letters and numbers only"
                />
              </div>
              <p className="text-xs text-muted-foreground">Lowercase letters and numbers only, min 3 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-10 h-11"
                  required
                />
              </div>
            </div>

            {/* Organization Information */}
            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Organization Details</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="organizationName">Organization Name</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="organizationName"
                      type="text"
                      placeholder="my-company"
                      value={formData.organizationName}
                      onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                      className="pl-10 h-11"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">This will be your tenant/realm ID</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Display Name</Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="My Company Inc."
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="h-11"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-10 pr-10 h-11"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="pl-10 h-11"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-muted-foreground text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Sign in
            </Link>
          </p>

          {/* Social login for existing accounts */}
          {/* <div className="mt-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or sign in with</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <a
                href={getOIDCLoginURL('microsoft')}
                className="flex items-center justify-center gap-2 h-10 rounded-lg border border-border hover:bg-accent hover:border-primary/30 transition-all text-sm font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                Microsoft
              </a>
              <a
                href={getOIDCLoginURL('github')}
                className="flex items-center justify-center gap-2 h-10 rounded-lg border border-border hover:bg-accent hover:border-primary/30 transition-all text-sm font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </a>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Social login works for existing accounts only
            </p>
          </div> */}

          <div className="mt-4 mb-8 p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground text-center">
              By creating an account, you'll be set up as a <strong>Company Admin</strong> for your organization
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
