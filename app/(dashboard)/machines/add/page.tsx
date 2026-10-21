'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronLeft,
  Monitor,
  Download,
  Terminal,
  Copy,
  Check,
  Loader2,
  Cpu,
  Globe,
  Network,
  Plus,
  Trash2,
  CheckCircle2,
  ScrollText,
} from 'lucide-react';
import { Breadcrumb } from '@/components/ui/page-breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { machinesAPI } from '@/lib/machines-api';

const operatingSystems = [
  // EPM: Linux/RHEL disabled — EPM targets Windows and macOS only; re-enable later
//   {
//     id: 'debian',
//     name: 'Debian/Ubuntu',
//     icon: 'https://www.debian.org/logos/openlogo-nd.svg',
//     version: 'Debian/Ubuntu',
//     architectures: [
//       { id: 'amd64', name: 'AMD64', icon: <Cpu /> },
//       { id: 'arm64', name: 'ARM64', icon: <Cpu />}
//     ],
//     packageType: 'deb'
//   },
//   {
//     id: 'rocky',
//     name: 'Rocky/CentOS/RHEL',
//     icon: 'https://www.svgrepo.com/show/354273/redhat-icon.svg',
//     version: 'Enterprise Linux',
//     architectures: [
//       { id: 'x86_64', name: 'x86_64', icon: <Cpu /> },
//       { id: 'aarch64', name: 'aarch64', icon: <Cpu /> }
//     ],
//     packageType: 'tar.gz'
//   },
  {
    id: 'macos',
    name: 'macOS',
    icon: 'https://www.svgrepo.com/show/503173/apple-logo.svg',
    version: 'Ventura+',
    architectures: [
      { id: 'amd64', name: 'Intel (AMD64)', icon: <Cpu /> },
      { id: 'arm64', name: 'Apple Silicon (ARM64)', icon: <Cpu /> }
    ],
    packageType: 'dmg'
  },
  {
    id: 'windows',
    name: 'Windows',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Windows_logo_-_2021.svg/960px-Windows_logo_-_2021.svg.png',
    version: '10/11',
    architectures: [
      { id: 'amd64', name: 'AMD64', icon: <Cpu /> },
      { id: 'arm64', name: 'ARM64', icon: <Cpu /> }
    ],
    packageType: 'exe'
  },
];

const steps = [
  { id: 1, title: 'Basic Info', description: 'Machine name and description' },
  { id: 2, title: 'Download Agent', description: 'Install the vsay agent' },
  { id: 3, title: 'Configure', description: 'Run the configuration command' },
];
  
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
const GRPC_URL = process.env.NEXT_PUBLIC_GRPC_URL || 'localhost:8081';
const TUNNEL_URL = process.env.NEXT_PUBLIC_TUNNEL_URL || '';

export default function MachineAdd() {
  const [currentStep, setCurrentStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
const [selectedOS, setSelectedOS] = useState('');
  const [selectedArch, setSelectedArch] = useState('');
  const [deployApplication, setDeployApplication] = useState(false);
  const [customScriptEnabled, setCustomScriptEnabled] = useState(false);
  const [customScript, setCustomScript] = useState('');
  const [hostEntriesEnabled, setHostEntriesEnabled] = useState(false);
  const [hostEntries, setHostEntries] = useState<{ ip: string; domain: string }[]>([{ ip: '', domain: '' }]);
  const [copied, setCopied] = useState(false);
  const [downloadCmdCopied, setDownloadCmdCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Registration data from API
  const [registrationToken, setRegistrationToken] = useState('');
  const [machineCreated, setMachineCreated] = useState(false);

  const router = useRouter();
  const { toast } = useToast();
  const { token, user } = useAuth();

  // Generate the config command with actual registration token.
  //
  // These append to a single-line command, so they carry no line
  // continuations: a backslash-newline here would put the macOS command back
  // into the shape that pastes badly into the installer's one-line field.
  const tunnelFlag = deployApplication && TUNNEL_URL ? ` --tunnel-url "${TUNNEL_URL}"` : '';
  const hostEntryFlags = hostEntriesEnabled
    ? hostEntries
        .filter(e => e.ip.trim() && e.domain.trim())
        .map(e => ` --host-entry "${e.ip.trim()}:${e.domain.trim()}"`)
        .join('')
    : '';
  const isWindowsSelected = selectedOS === 'windows';

  // ONE line, like the Windows command beside it.
  //
  // It used to be split across nine lines with backslash continuations, which
  // reads nicely and pastes badly: the macOS installer asks for it in a
  // single-line field, so only the tail was visible and the continuation
  // backslashes had to be stripped back out. A command that is copied far more
  // often than it is read should be shaped for copying.
  // The enrolment arguments, written once and shared by both macOS commands
  // below, so the two can never drift apart.
  const enrolArgs = registrationToken
    ? `--token "${registrationToken}" --tenant "${user?.tenant_id || 'default'}" --org "${user?.tenant_id || 'default'}" --project "default" --user "${user?.username || 'admin'}" --host "${BACKEND_URL}" --api-host "${GRPC_URL}" --name "${name}"${tunnelFlag}${hostEntryFlags}`
    : '';

  // Enrols an agent that is ALREADY installed — the disk-image route.
  const configCommand = registrationToken
    ? `sudo wxt-agent configure ${enrolArgs}`
    : 'Loading...';

  // Downloads, installs and enrols in one step. This is what macOS leads with.
  //
  // Not a shortcut — the only route that works unaided. The agent is signed
  // with our own certificate and is NOT notarised by Apple, so Gatekeeper
  // refuses anything a BROWSER downloaded, and the wording it picks is
  // "wxt-agent is damaged and can't be opened. You should move it to the
  // Bin", offering no other button. The bundle is intact and its signature
  // verifies; macOS simply will not vouch for software it cannot trace back
  // to Apple. Finder withholds the app's icon for the same reason, which is
  // why it also shows as a blank page instead of the product logo — one
  // cause, two symptoms, and neither is a fault in the build.
  //
  // What Gatekeeper actually acts on is com.apple.quarantine, a mark only
  // browsers apply. curl does not set it, so a terminal install never meets
  // Gatekeeper at all. Nothing is disabled and no warning is suppressed: the
  // file never acquires the mark that would raise one, and Gatekeeper still
  // guards everything else on the machine.
  //
  // An Apple Developer ID plus notarisation is what makes the double-click
  // path work. Until that exists, this is the route that works on every Mac.
  const macInstallCommand = registrationToken
    ? `curl -fsSL ${BACKEND_URL}/agent/install-macos.sh | sudo bash -s -- ${enrolArgs}`
    : 'Loading...';

  // Windows uses a single-line command (works in both cmd and PowerShell, run as
  // Administrator). There are no placeholders to replace any more: remote
  // control joins the session the user is already in, so there is no RDP
  // account to create and no password to choose.
  const windowsExeName = selectedArch ? `./wxt-agent-${selectedArch}.exe` : './wxt-agent.exe';
  const windowsConfigCommand = registrationToken
    ? `${windowsExeName} configure --token "${registrationToken}" --tenant "${user?.tenant_id || 'default'}" --org "${user?.tenant_id || 'default'}" --project "default" --user "${user?.username || 'admin'}" --host "${BACKEND_URL}" --api-host "${GRPC_URL}" --name "${name}"`
    : 'Loading...';

  const activeConfigCommand = isWindowsSelected ? windowsConfigCommand : macInstallCommand;

  // Get selected OS object
  const selectedOSObj = operatingSystems.find(os => os.id === selectedOS);

  // Filename for the currently selected OS/architecture — shared by the
  // download button and the curl command below it, so they never drift apart.
  const getAgentFilename = () => {
    if (!selectedOSObj || !selectedArch) return '';
    switch (selectedOSObj.packageType) {
      // EPM: Linux/RHEL disabled — EPM targets Windows and macOS only; re-enable later
      // case 'deb': return `wxt-agent-${selectedArch}.deb`;
      // case 'tar.gz': return `wxt-agent-${selectedArch}.tar.gz`;
      case 'dmg': return `wxt-agent-${selectedArch}.dmg`;
      case 'exe': return `wxt-agent-${selectedArch}.exe`;
      default: return '';
    }
  };

  const agentFilename = getAgentFilename();

  // Windows gets Invoke-WebRequest, not curl.
  //
  // curl.exe does ship with Windows 10 1803+, but inside PowerShell `curl` is
  // an ALIAS for Invoke-WebRequest, which takes entirely different arguments.
  // `curl -L -o file url` therefore fails there with a confusing parameter
  // error — and PowerShell is exactly where the instructions send people.
  const isWindowsPackage = selectedOSObj?.packageType === 'exe';

  const downloadLine = (filename: string) =>
    isWindowsPackage
      // -UseBasicParsing / curl bypass the browser cache anyway, but a proxy
      // in front of the backend does not — and the filename is stable, so a
      // cached copy would be served for ever.
      ? `Invoke-WebRequest -Uri "${BACKEND_URL}/agent/download/${filename}" -OutFile "${filename}"`
      : `curl -fL --no-progress-meter -H "Cache-Control: no-cache" -o ${filename} ${BACKEND_URL}/agent/download/${filename}`;

  const downloadCommand = agentFilename ? downloadLine(agentFilename) : '';

  const downloadShellName = isWindowsPackage ? 'PowerShell' : 'curl';

  // Download agent function
  const handleDownloadAgent = () => {
    if (!selectedOS || !selectedArch || !selectedOSObj || !agentFilename) {
      toast({
        title: "Selection required",
        description: "Please select OS and architecture",
        variant: "destructive"
      });
      return;
    }

    // Cache-busted. The filename never changes — wxt-agent-arm64.dmg is always
    // the current build — so without this a browser that has the file already
    // serves it again, and every new release is invisible. The server now says
    // no-store as well; this is the belt to that braces, because a proxy
    // between the two answers to neither.
    const downloadURL = `${BACKEND_URL}/agent/download/${agentFilename}?t=${Date.now()}`;


    // Create download link
    const link = document.createElement('a');
    link.href = downloadURL;
    link.download = agentFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Download started",
      description: `Downloading ${agentFilename}`
    });
  };

  const handleCopyDownloadCommand = async () => {
    if (!downloadCommand) return;

    // The tick and the toast wait on the result. Showing "Copied!" before
    // knowing whether it worked is how somebody ends up pasting the previous
    // contents of their clipboard into a root shell.
    if (!(await copyToClipboard(downloadCommand))) {
      toast({
        title: "Could not copy",
        description: "Your browser blocked clipboard access — select the command and copy it manually.",
        variant: "destructive",
      });
      return;
    }

    setDownloadCmdCopied(true);
    toast({
      title: "Copied!",
      description: isWindowsPackage
        ? "PowerShell download command copied"
        : "curl command copied to clipboard",
    });
    setTimeout(() => setDownloadCmdCopied(false), 2000);
  };

  const handleCopy = async () => {
    if (!(await copyToClipboard(activeConfigCommand))) {
      toast({
        title: "Could not copy",
        description: "Your browser blocked clipboard access — select the command and copy it manually.",
        variant: "destructive",
      });
      return;
    }

    setCopied(true);
    toast({ title: "Copied!", description: "Command copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const createPendingMachine = async () => {
    if (!token) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      return false;
    }

    setLoading(true);
    try {
      const response = await machinesAPI.createPendingMachine(token, name, description, deployApplication, customScriptEnabled ? customScript : '');
      setRegistrationToken(response.registration_token);
      setMachineCreated(true);
      toast({
        title: "Machine template created!",
        description: `Registration token generated for "${name}"`
      });
      return true;
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to create machine';
      if (errorMessage.includes('already exists')) {
        toast({
          title: "Name already taken",
          description: "A machine with this name already exists. Please choose a different name.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!name) {
        toast({ title: "Required fields", description: "Please fill in all fields", variant: "destructive" });
        return;
      }

      // Create pending machine when moving from step 1 to step 2
      if (!machineCreated) {
        const success = await createPendingMachine();
        if (!success) return;
      }

      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!selectedOS) {
        toast({ title: "Select OS", description: "Please select an operating system", variant: "destructive" });
        return;
      }
      if (!selectedArch) {
        toast({ title: "Select Architecture", description: "Please select a CPU architecture", variant: "destructive" });
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      toast({
        title: "Setup complete!",
        description: "Run the command on your machine to connect it."
      });
      router.push('/machines');
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <Breadcrumb
        items={[
          { label: 'Machines', href: '/machines' },
          { label: 'Add Machine' }
        ]}
        className="mb-6"
      />

      {/* Steps Progress */}
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors",
                  currentStep >= step.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step.id}
              </div>
              <div className="mt-2 text-center hidden sm:block">
                <p className={cn(
                  "text-sm font-medium",
                  currentStep >= step.id ? "text-foreground" : "text-muted-foreground"
                )}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "h-0.5 w-16 sm:w-24 lg:w-32 mx-2 sm:mx-4",
                currentStep > step.id ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="glass-card">
        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" />
                Basic Information
              </CardTitle>
              <CardDescription>Enter the basic details for your machine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Machine Name (unique)</Label>
                <Input
                  id="name"
                  placeholder="e.g., prod-server-01"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={machineCreated}
                />
                <p className="text-xs text-muted-foreground">
                  This name must be unique and will identify your machine.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of this machine's purpose..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  disabled={machineCreated}
                />
              </div>
              {/* Linux User field removed — machine name is used as linux-user in config command */}
              {/* <div className="space-y-2">
                <Label htmlFor="linuxUser">Linux User (Optional)</Label>
                <Input
                  id="linuxUser"
                  placeholder="e.g., ubuntu, admin, root"
                  value={linuxUser}
                  onChange={(e) => setLinuxUser(e.target.value)}
                  disabled={machineCreated}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to auto-detect current user. Used with --linux-user flag.
                </p>
              </div> */}

              {/* Host Entries toggle */}
              {/* <div className={`rounded-xl border p-4 space-y-3 transition-colors ${hostEntriesEnabled ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hostEntriesEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Network className={`w-4 h-4 ${hostEntriesEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Host Entries</p>
                      <p className="text-xs text-muted-foreground">Add custom /etc/hosts entries on the machine (max 5)</p>
                    </div>
                  </div>
                  <Switch
                    checked={hostEntriesEnabled}
                    onCheckedChange={(v) => setHostEntriesEnabled(v)}
                    disabled={machineCreated}
                  />
                </div>

                {hostEntriesEnabled && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-1">
                      <p className="text-xs font-medium text-muted-foreground">IP Address</p>
                      <p className="text-xs font-medium text-muted-foreground">Domain / Hostname</p>
                      <span />
                    </div>

                    {hostEntries.map((entry, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                        <div className="relative">
                          <Input
                            placeholder="192.168.1.10"
                            value={entry.ip}
                            disabled={machineCreated}
                            onChange={e => setHostEntries(prev => prev.map((r, j) => j === i ? { ...r, ip: e.target.value } : r))}
                            className={`font-mono text-sm ${entry.ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(entry.ip.trim()) ? 'border-green-500/50' : ''}`}
                          />
                          {entry.ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(entry.ip.trim()) && (
                            <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-500 pointer-events-none" />
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            placeholder="example.internal"
                            value={entry.domain}
                            disabled={machineCreated}
                            onChange={e => setHostEntries(prev => prev.map((r, j) => j === i ? { ...r, domain: e.target.value } : r))}
                            className={`text-sm ${entry.domain && entry.domain.trim().includes('.') ? 'border-green-500/50' : ''}`}
                          />
                          {entry.domain && entry.domain.trim().includes('.') && (
                            <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-500 pointer-events-none" />
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={machineCreated || hostEntries.length === 1}
                          onClick={() => setHostEntries(prev => prev.filter((_, j) => j !== i))}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {hostEntries.length < 5 && !machineCreated && (
                      <button
                        type="button"
                        onClick={() => setHostEntries(prev => [...prev, { ip: '', domain: '' }])}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add entry
                      </button>
                    )}

                    <p className="text-xs text-muted-foreground pt-1">
                      These will be written to <code className="font-mono bg-muted px-1 rounded">/etc/hosts</code> before the agent connects.
                    </p>
                  </div>
                )}
              </div> */}

              {/* Custom Init Script toggle */}
              {/* <div className={`rounded-xl border p-4 space-y-3 transition-colors ${customScriptEnabled ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${customScriptEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
                      <ScrollText className={`w-4 h-4 ${customScriptEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Init Script</p>
                      <p className="text-xs text-muted-foreground">Run a shell script once when the machine first comes online</p>
                    </div>
                  </div>
                  <Switch
                    checked={customScriptEnabled}
                    onCheckedChange={setCustomScriptEnabled}
                    disabled={machineCreated}
                  />
                </div>

                {customScriptEnabled && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Shell Script</Label>
                      <span className="text-xs text-muted-foreground">Runs as root · output → ~/script.log</span>
                    </div>
                    <div className="relative rounded-lg overflow-hidden border border-border">

                      <div className="bg-[#1c1c1e] flex items-center gap-1.5 px-3 py-2 border-b border-[#2d2d2d]">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f] border border-[#1aab29]" />
                        <span className="ml-2 text-[#8b8b8b] text-xs">init.sh</span>
                      </div>
                      <textarea
                        value={customScript}
                        onChange={e => setCustomScript(e.target.value)}
                        disabled={machineCreated}
                        rows={10}
                        spellCheck={false}
                        placeholder={'#!/bin/bash\n# This script runs once when the machine registers for the first time.\n# Output is saved to ~/script.log\n\napt-get update -y\napt-get install -y curl git'}
                        className="w-full bg-[#0d1117] text-[#c9d1d9] font-mono text-sm px-4 py-3 resize-y focus:outline-none placeholder:text-[#6e7681] disabled:opacity-50"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Machine status will show <span className="font-medium text-yellow-500">Executing Script</span> until the script finishes, then automatically go <span className="font-medium text-green-500">Online</span>.
                    </p>
                  </div>
                )}
              </div> */}

              {/* Deploy Application toggle */}
              {/* <div className={`rounded-xl border p-4 space-y-3 transition-colors ${deployApplication ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${deployApplication ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Globe className={`w-4 h-4 ${deployApplication ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Deploy Application</p>
                      <p className="text-xs text-muted-foreground">Expose this machine as a deployed app via tunnel</p>
                    </div>
                  </div>
                  <Switch
                    checked={deployApplication}
                    onCheckedChange={setDeployApplication}
                    disabled={machineCreated}
                  />
                </div>

              </div> */}
            </CardContent>
          </>
        )}

        {/* Step 2: Download Agent */}
        {currentStep === 2 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                Download Agent
              </CardTitle>
              <CardDescription>Select your operating system, architecture, and download the vsay agent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* OS Selection */}
              <div className="space-y-3">
                <Label>Operating System</Label>
                <div className="grid grid-cols-2 gap-3">
                  {operatingSystems.map((os) => (
                    <button
                      key={os.id}
                      onClick={() => {
                        setSelectedOS(os.id);
                        setSelectedArch(''); // Reset architecture when OS changes
                      }}
                      className={cn(
                        "p-4 rounded-xl border-2 transition-all text-center",
                        selectedOS === os.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <span className="text-2xl justify-center flex"><img src={os.icon} className="w-12 h-12" alt={os.name} /></span>
                      <p className="font-medium mt-2">{os.name}</p>
                      <p className="text-xs text-muted-foreground">{os.version}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Architecture Selection */}
              {selectedOS && selectedOSObj && (
                <div className="space-y-3">
                  <Label>Architecture</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedOSObj.architectures.map((arch) => (
                      <button
                        key={arch.id}
                        onClick={() => setSelectedArch(arch.id)}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all text-center",
                          selectedArch === arch.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <span className="text-3xl justify-center flex">{arch.icon}</span>
                        <p className="font-medium mt-2 text-sm">{arch.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Download Section */}
              {selectedOS && selectedArch && selectedOSObj && (
                <div className="p-4 rounded-xl bg-muted/50 border border-border">
                  <div className="flex items-start gap-3">
                    <Download className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">Ready to Download</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        wxt-agent for {selectedOSObj.name} ({selectedOSObj.architectures.find(a => a.id === selectedArch)?.name})
                      </p>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        One file. The session helper that remote control needs is bundled inside it
                        and installed automatically.
                      </p>
                      {selectedOS === 'macos' && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Optional on macOS &mdash; the command in the next step fetches this for
                          you, and a copy downloaded here needs the extra terminal step described
                          below before macOS will open it.
                        </p>
                      )}
                      <Button className="mt-3" size="sm" onClick={handleDownloadAgent}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Agent
                      </Button>

                      {downloadCommand && (
                        <div className="mt-3 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1.5">
                            {`Or download with ${downloadShellName}:`}
                          </p>
                          <div className="relative min-w-0">
                            <pre className="p-3 pr-11 rounded-lg bg-muted text-xs font-mono overflow-x-auto max-w-full">
                              <code className="whitespace-pre">{downloadCommand}</code>
                            </pre>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="absolute top-1.5 right-1.5 h-7 w-7"
                              onClick={handleCopyDownloadCommand}
                            >
                              {downloadCmdCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Installation Instructions */}
              {selectedOS && selectedArch && selectedOSObj && (
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h4 className="font-medium mb-3">Installation Instructions</h4>
                  {/* EPM: Linux/RHEL disabled — EPM targets Windows and macOS only; re-enable later
                  {selectedOS === 'debian' && (
                    <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
                      <li>Download the agent using the button above</li>
                      <li>Open a terminal on your machine</li>
                      <li>Navigate to downloads: <code className="font-mono bg-muted px-1 rounded">cd ~/Downloads</code></li>
                      <li>Install the package: <code className="font-mono bg-muted px-1 rounded">sudo apt install ./wxt-agent-{selectedArch}.deb</code></li>
                      <li>Verify installation: <code className="font-mono bg-muted px-1 rounded">wxt-agent version</code></li>
                    </ol>
                  )}
                  {selectedOS === 'rocky' && (
                    <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
                      <li>Download the agent using the button above</li>
                      <li>Open a terminal on your machine</li>
                      <li>Navigate to downloads: <code className="font-mono bg-muted px-1 rounded">cd ~/Downloads</code></li>
                      <li>Extract archive: <code className="font-mono bg-muted px-1 rounded">tar -xvf wxt-agent-{selectedArch}.tar.gz</code></li>
                      <li>Enter directory: <code className="font-mono bg-muted px-1 rounded">cd wxt-agent-{selectedArch}</code></li>
                      <li>Run installer: <code className="font-mono bg-muted px-1 rounded">sudo ./install.sh</code></li>
                      <li>Verify installation: <code className="font-mono bg-muted px-1 rounded">wxt-agent version</code></li>
                    </ol>
                  )}
                  */}
                  {selectedOS === 'macos' && (
                    <div className="space-y-4 text-sm text-muted-foreground">
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <p className="font-medium text-primary">
                          You do not need to download anything on macOS.
                        </p>
                        <p className="mt-1">
                          The next step gives you one command that downloads, installs and enrols
                          the agent. It is the route we recommend, and the only one that works
                          without a manual step &mdash; see why below.
                        </p>
                      </div>

                      <div>
                        <p className="font-medium text-foreground mb-2">
                          If macOS calls the app &ldquo;damaged&rdquo;
                        </p>
                        <p>
                          It is not damaged. This build is signed with Coredge&apos;s own
                          certificate and is not notarised by Apple, so Gatekeeper will not vouch
                          for it &mdash; and{' '}
                          <em>&ldquo;wxt-agent is damaged and can&rsquo;t be opened. You should
                          move it to the Bin&rdquo;</em> is simply the wording macOS uses when it
                          declines. Finder leaves the app showing a blank icon instead of the
                          product logo for the same reason.
                        </p>
                        <p className="mt-2">
                          Gatekeeper only acts on files a <strong>browser</strong> downloaded. A
                          terminal install never carries that mark, which is why the one-line
                          command in the next step is unaffected.
                        </p>
                      </div>

                      <div>
                        <p className="font-medium text-foreground mb-2">
                          Or install from the disk image
                        </p>
                        <ol className="list-decimal list-inside space-y-2">
                          <li>Download the agent using the button above</li>
                          <li>Double-click the downloaded DMG to open it</li>
                          <li>Drag <strong>wxt-agent</strong> onto the Applications folder</li>
                          <li>
                            In Terminal, clear the browser&apos;s download mark &mdash;{' '}
                            <strong>this step is required, not a fallback</strong>:
                            <code className="block font-mono bg-muted px-2 py-1.5 rounded mt-1.5 text-xs">
                              xattr -dr com.apple.quarantine /Applications/wxt-agent.app
                            </code>
                          </li>
                          <li>
                            Open <strong>wxt-agent</strong> and paste the enrolment command from
                            the next step. Opening it again later shows the agent&apos;s status,
                            checks its permissions, or removes it.
                          </li>
                          <li>
                            Check it afterwards with{' '}
                            <code className="font-mono bg-muted px-1 rounded">wxt-agent version</code>
                          </li>
                        </ol>
                      </div>

                      <div>
                        <p className="font-medium text-foreground mb-2">For remote control</p>
                        <p>
                          Switch on the single <strong>wxt-agent</strong> entry under both{' '}
                          <strong>Accessibility</strong> and <strong>Screen Recording</strong> in
                          System Settings › Privacy &amp; Security. Each pane lists one entry,
                          carrying the product icon, and it covers the whole product &mdash;
                          nothing to add by hand. macOS cannot grant these silently, so remote
                          control stays unavailable until you do.
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedOS === 'windows' && (
                    <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
                      <li>Download the agent using the button above</li>
                      <li>Open PowerShell <strong>as Administrator</strong> in that folder</li>
                      <li>Run the configure command from the next step</li>
                      <li>Verify: <code className="font-mono bg-muted px-1 rounded">wxt-agent version</code> — it also reports whether the session helper is bundled</li>
                    </ol>
                  )}
                </div>
              )}
            </CardContent>
          </>
        )}

        {/* Step 3: Configure */}
        {currentStep === 3 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-primary" />
                Configure Agent
              </CardTitle>
              <CardDescription>
                {isWindowsSelected
                  ? `Run this command on your machine to connect it to "${name}"`
                  : `Run this command on your machine to install the agent and connect it to "${name}"`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Show selected configuration */}
              {selectedOSObj && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Selected:</span> {selectedOSObj.name} / {selectedOSObj.architectures.find(a => a.id === selectedArch)?.name}
                  </p>
                </div>
              )}

              {!isWindowsSelected && (
                <div className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-muted/30 text-sm font-medium">
                  With Root Access
                </div>
              )}

              {/* A wrapping, selectable text area rather than a <pre> that
                  scrolls sideways.
                  
                  The command is one long line — deliberately, so it survives
                  being pasted into the installer's single-line field — and in
                  a horizontally scrolling block that means the token is off
                  screen, the copy button sits on top of the first words, and
                  there is no way to see what is being copied. Read-only, so
                  the text is selectable and cannot be edited into something
                  that no longer works. */}
              <div className="relative">
                <textarea
                  readOnly
                  value={activeConfigCommand}
                  rows={4}
                  onFocus={e => e.currentTarget.select()}
                  spellCheck={false}
                  aria-label="Enrolment command"
                  className="w-full resize-y rounded-xl terminal-bg terminal-text p-4 pr-14 font-mono text-sm leading-relaxed break-all focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2 gap-1.5"
                  onClick={handleCopy}
                  disabled={!registrationToken}
                >
                  {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                <p className="text-sm font-medium text-primary">
                  This command contains a unique token for machine "{name}".
                  When you run it, your machine will automatically connect to this template.
                </p>
              </div>

              {isWindowsSelected ? (
                <>
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h4 className="font-medium mb-2">Session Helper</h4>
                    <p className="text-sm text-muted-foreground">
                      Remote control needs a helper running inside the user&apos;s desktop, because a
                      Windows service cannot reach it from session 0. That helper is bundled inside
                      the agent and installed by this command — there is nothing extra to download.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h4 className="font-medium mb-2">No account is created</h4>
                    <p className="text-sm text-muted-foreground">
                      Remote control joins the session the user is already signed into, so there is no separate
                      account or password to set up, and nobody gets signed out when an admin connects.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                    <p className="text-sm text-warning font-medium">
                      Run this in Command Prompt or PowerShell <strong>as Administrator</strong>.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h4 className="font-medium mb-2">Account Configuration</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      The agent will use the account &quot;{name}&quot; on this machine.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h4 className="font-medium mb-2">This command installs as well as enrols</h4>
                    <p className="text-sm text-muted-foreground">
                      There is nothing to download first and nothing to drag into Applications. It
                      fetches the agent, installs it, and connects it to this machine template.
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      It installs from a terminal on purpose. This build is signed with our own
                      certificate rather than an Apple Developer ID, so macOS refuses to open a copy
                      that a <em>browser</em> downloaded &mdash; it calls the app
                      &ldquo;damaged&rdquo; and offers only <strong>Move to Bin</strong>, and Finder
                      shows a blank icon instead of the logo. Nothing is wrong with the build;
                      a terminal install simply never acquires the download mark that triggers
                      that check, and Gatekeeper still guards everything else.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h4 className="font-medium mb-2">Already installed from the disk image?</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Then enrol the copy that is already there instead:
                    </p>
                    <input
                      readOnly
                      value={configCommand}
                      onFocus={e => e.currentTarget.select()}
                      spellCheck={false}
                      aria-label="Enrolment command for an agent that is already installed"
                      className="w-full rounded-lg bg-muted p-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-card">
                    <h4 className="font-medium mb-2">Remote Control Permissions</h4>
                    <p className="text-sm text-muted-foreground">
                      After installing, switch on the single <strong>wxt-agent</strong> entry under
                      both <strong>Screen Recording</strong> and <strong>Accessibility</strong> in
                      System Settings › Privacy &amp; Security. Each pane lists one entry, carrying
                      the product icon, and it covers the whole product &mdash; there is nothing to
                      add by hand. macOS cannot grant these silently, so remote control stays
                      unavailable until someone does.
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      These grants survive an upgrade, so do not remove and re-add an entry after
                      updating. A switch that is on while remote control still fails is a grant
                      left from a differently signed build; clear it with{' '}
                      <code className="font-mono bg-muted px-1 rounded">sudo wxt-agent repair-permissions</code>.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                    <p className="text-sm text-warning font-medium">
                      Run this in Terminal. It uses sudo, so macOS will ask for your password.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between p-6 border-t border-border">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 1 || loading}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                {currentStep === 3 ? 'Complete Setup' : 'Next'}
                {currentStep < 3 && <ChevronRight className="w-4 h-4 ml-2" />}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
