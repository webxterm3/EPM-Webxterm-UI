'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, FlaskConical, Save, X, AlertTriangle, Cloud, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SelectInput } from '@/components/FilterBar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { groupsAPI, Group } from '@/lib/user-management-api';
import { machinesAPI, Machine } from '@/lib/machines-api';
import {
  AppPolicy,
  PolicyRule,
  PolicyAction,
  PolicyScopeKind,
  MatchOp,
  MatchCriteria,
  StringMatch,
  criteriaAreEmpty,
  emptyCriteria,
} from '@/lib/policies-api';

/* What each action DOES on the endpoint, in the words of somebody who has to
 * choose between them.
 *
 * Every line here was checked against the agent rather than against the name
 * of the action, because the two had drifted: "Elevate" has never done
 * anything on any platform, and "Exempt" says nothing about the one property
 * that makes it different from Allow. Somebody picking from this list is
 * deciding what happens on a colleague's machine, and a hint that reads well
 * but is wrong is worse than no hint.
 *
 * `retired` marks an action the product does not implement. It stays
 * selectable only for rules that already use it — dropping it outright would
 * leave those rules showing whatever the dropdown's first option happens to
 * be, which silently rewrites a policy somebody wrote. */
const ACTIONS: {
  value: PolicyAction;
  label: string;
  hint: string;
  detail: string;
  retired?: boolean;
}[] = [
  {
    value: 'block',
    label: 'Block',
    hint: 'Stop it being used',
    detail:
      'The application is closed whenever it is opened. Switch on "Remove blocked ' +
      'applications" below to also move it off the machine — without that, on macOS ' +
      'it stays in the Applications folder and is only closed each time somebody ' +
      'opens it. Installing is held back only on macOS, and only for a disk image ' +
      'holding one application: a .pkg, a .zip, or any Windows installer still runs, ' +
      'and the block takes effect afterwards.',
  },
  {
    value: 'allow',
    label: 'Allow',
    hint: 'Permit it, and stop later rules blocking it',
    detail:
      'Nothing below this rule can block the application. This is also what lets ' +
      'somebody install, update and remove it without being asked for an ' +
      'administrator password.',
  },
  {
    value: 'default',
    label: 'Exempt',
    hint: "Stop here and use this policy's default action",
    detail:
      'The rules below are not consulted; the policy default decides instead. ' +
      'Software exempted this way is never moved off the machine, even when the ' +
      'default is Block — so this is how to block something without removing it. ' +
      'It is also not installable without approval, because no rule allowed it.',
  },
  {
    value: 'elevate',
    label: 'Elevate',
    hint: 'Does nothing — not implemented on any platform',
    retired: true,
    detail:
      'Kept only so existing rules still show what they were set to. macOS cannot ' +
      'intercept a launch without the Endpoint Security entitlement, and the ' +
      'Windows side is not written, so a rule set to Elevate has no effect at all ' +
      '— and a Block rule below it will not run either. Change it to Block or Allow.',
  },
];

const OPS: { value: MatchOp; label: string }[] = [
  { value: 'equals', label: 'is exactly' },
  { value: 'contains', label: 'contains' },
  { value: 'prefix', label: 'starts with' },
  { value: 'suffix', label: 'ends with' },
  { value: 'wildcard', label: 'matches pattern' },
];

interface Props {
  policy: AppPolicy;
  onCancel: () => void;
  onSave: (policy: AppPolicy) => void;
  onSimulate: (policy: AppPolicy) => void;
  simulating: boolean;
}

export default function PolicyEditor({ policy, onCancel, onSave, onSimulate, simulating }: Props) {
  const [draft, setDraft] = useState<AppPolicy>({ ...policy, rules: [...(policy.rules ?? [])] });

  const update = (patch: Partial<AppPolicy>) => setDraft(prev => ({ ...prev, ...patch }));

  const updateRule = (index: number, patch: Partial<PolicyRule>) =>
    setDraft(prev => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));

  const addRule = () =>
    setDraft(prev => ({
      ...prev,
      rules: [
        ...prev.rules,
        {
          id: '',
          name: '',
          enabled: true,
          action: 'block' as PolicyAction,
          match: emptyCriteria(),
        },
      ],
    }));

  const removeRule = (index: number) =>
    setDraft(prev => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= draft.rules.length) return;
    const rules = [...draft.rules];
    [rules[index], rules[to]] = [rules[to], rules[index]];
    setDraft(prev => ({ ...prev, rules }));
  };

  // A rule with no criteria matches nothing. The backend rejects it, but
  // saying so here means the operator is not left looking at a rule that
  // silently does nothing.
  const emptyRules = draft.rules
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => criteriaAreEmpty(r.match));
  const nameMissing = draft.name.trim() === '';
  // A scope that names no groups or machines applies to nobody. The backend
  // rejects it; saying so here saves a round trip and explains why.
  const scopeEmpty =
    (draft.scope.kind === 'group' && (draft.scope.group_ids?.length ?? 0) === 0) ||
    (draft.scope.kind === 'machine' && (draft.scope.agent_ids?.length ?? 0) === 0);
  const canSave = !nameMissing && !scopeEmpty && emptyRules.length === 0;

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{policy.id ? 'Edit policy' : 'New policy'}</CardTitle>
            <CardDescription className="mt-1">
              Rules are evaluated top to bottom and the first one that matches decides. Put
              exceptions above the broad rules they carve out of.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="policy-name">Name</Label>
            <Input
              id="policy-name"
              value={draft.name}
              onChange={e => update({ name: e.target.value })}
              placeholder="Block games on finance laptops"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="policy-default">If no rule matches</Label>
            <SelectInput
              id="policy-default"
              value={draft.default_action}
              onChange={v => update({ default_action: v as PolicyAction })}
            >
              <option value="allow">Allow (recommended)</option>
              <option value="block">Block everything else</option>
            </SelectInput>
            {draft.default_action === 'block' && (
              // Allow-listing is a legitimate posture and a very large hammer.
              <p className="text-xs text-amber-500">
                This is an allow-list: anything your rules do not permit would be blocked.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="policy-mode">What this policy does</Label>
          <SelectInput
            id="policy-mode"
            value={draft.mode === 'enforce' ? 'enforce' : 'audit'}
            onChange={v => update({ mode: v })}
          >
            <option value="audit">Audit — report matches, change nothing</option>
            <option value="enforce">Enforce — close and block matching software</option>
          </SelectInput>
          {draft.mode === 'enforce' ? (
            // Two conditions, not one, and an operator who only knows about
            // the first will think a saved policy is doing something it is
            // not. Both are stated here rather than only on the switch above.
            <p className="text-xs text-amber-500">
              This only takes effect while your organisation&apos;s Enforcement switch is also on.
              With both on, matching software is closed and prevented from launching.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Matches are recorded and projected. Nothing on any machine changes.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="policy-description">Description</Label>
          <Textarea
            id="policy-description"
            value={draft.description ?? ''}
            onChange={e => update({ description: e.target.value })}
            placeholder="Why this policy exists, so the next person knows whether they may change it."
            rows={2}
          />
        </div>

        {/* Offered on every enforcing policy, including allow-list ones.
            It used to be hidden when the default was Block, on the reasoning
            that removal would then sweep up every application the rules did
            not name. The catch-all cannot reach removal: the agent sets
            Remove only on a decision that came from a RULE, and the
            catch-all returns a decision with it left false. Hiding the
            switch took removal away from the explicit block rules in the
            same policy — and without removal a block on macOS is an
            execute-bit change inside the bundle that macOS 14 refuses
            without App Management, so the application stays installed and
            is merely closed when somebody opens it. */}
        {draft.mode === 'enforce' && (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3">
            <div className="space-y-0.5">
              <Label className="font-medium">Remove blocked applications</Label>
              <p className="max-w-xl text-xs text-muted-foreground">
                Software a rule blocks is moved off the machine, not just stopped from
                opening — so it disappears from the Applications folder and cannot be
                installed back while the rule stands.{' '}
                <span className="text-foreground">
                  It is moved, never deleted
                </span>
                : the agent puts it back if you change the rule, and when the agent is
                uninstalled.
              </p>
              {draft.default_action === 'block' && (
                <p className="max-w-xl text-xs text-muted-foreground">
                  Only applications an explicit <strong>Block</strong> rule names are
                  moved. Software that is simply not on your allow list is stopped from
                  opening but stays where it is — the catch-all never removes anything.
                </p>
              )}
            </div>
            <Switch
              checked={draft.remove_blocked ?? false}
              onCheckedChange={v => update({ remove_blocked: v })}
            />
          </div>
        )}

        <ScopePicker
          scope={draft.scope}
          onChange={scope => update({ scope })}
        />

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div className="space-y-0.5">
            <Label className="font-medium">Enabled</Label>
            <p className="text-xs text-muted-foreground">
              A disabled policy is kept but contributes nothing.
            </p>
          </div>
          <Switch checked={draft.enabled} onCheckedChange={v => update({ enabled: v })} />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Rules</Label>
            <Button variant="outline" size="sm" onClick={addRule} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add rule
            </Button>
          </div>

          {draft.rules.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              No rules yet. A policy with no rules does nothing.
            </p>
          ) : (
            draft.rules.map((rule, i) => (
              <RuleEditor
                key={i}
                index={i}
                rule={rule}
                total={draft.rules.length}
                isEmpty={criteriaAreEmpty(rule.match)}
                onChange={patch => updateRule(i, patch)}
                onRemove={() => removeRule(i)}
                onMove={delta => move(i, delta)}
              />
            ))
          )}
        </div>

        {emptyRules.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm">
              <p className="font-medium">
                {emptyRules.length === 1 ? 'One rule has' : `${emptyRules.length} rules have`} no
                criteria.
              </p>
              <p className="mt-1 text-muted-foreground">
                A rule with nothing filled in matches nothing — it is never treated as “everything”.
                Fill in at least one field, or remove{' '}
                {emptyRules.length === 1 ? 'the rule' : 'them'}.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => onSave(draft)} disabled={!canSave} className="gap-2">
            <Save className="h-4 w-4" />
            Save policy
          </Button>
          <Button
            variant="outline"
            onClick={() => onSimulate(draft)}
            disabled={simulating || draft.rules.length === 0}
            className="gap-2"
          >
            <FlaskConical className="h-4 w-4" />
            Project impact
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {nameMissing && <span className="text-xs text-muted-foreground">A name is required.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function RuleEditor({
  index,
  rule,
  total,
  isEmpty,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  rule: PolicyRule;
  total: number;
  isEmpty: boolean;
  onChange: (patch: Partial<PolicyRule>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const selectedAction = ACTIONS.find(a => a.value === rule.action);
  const field = (
    key: 'app_name' | 'publisher' | 'file_path' | 'bundle_id',
    label: string,
    placeholder: string,
  ) => {
    const m = rule.match[key] ?? {};
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <div className="flex gap-2">
          <SelectInput
            aria-label={`${label} match type`}
            value={m.op ?? 'equals'}
            onChange={v => onChange({ match: { ...rule.match, [key]: { ...m, op: v as MatchOp } } })}
            className="h-9 w-36 shrink-0 text-xs"
          >
            {OPS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
          <Input
            value={(m.values ?? []).join(', ')}
            placeholder={placeholder}
            onChange={e =>
              onChange({
                match: {
                  ...rule.match,
                  [key]: {
                    ...m,
                    // Comma-separated values are ORed, so one rule can name
                    // several products without needing several rules.
                    values: e.target.value
                      .split(',')
                      .map(v => v.trim())
                      .filter(Boolean),
                  },
                },
              })
            }
            className="h-9 text-sm"
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${
        isEmpty ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>

        <Input
          value={rule.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="What this rule is for"
          className="h-9 max-w-xs text-sm"
        />

        <SelectInput
          aria-label="Rule action"
          value={rule.action}
          onChange={v => onChange({ action: v as PolicyAction })}
          className="h-9 w-auto min-w-[14rem] text-sm"
        >
          {ACTIONS.filter(a => !a.retired || rule.action === a.value).map(a => (
            <option key={a.value} value={a.value}>
              {a.label} — {a.hint}
            </option>
          ))}
        </SelectInput>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </Button>
          <Button variant="ghost" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}>
            ↓
          </Button>
          <Switch checked={rule.enabled} onCheckedChange={v => onChange({ enabled: v })} />
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove rule">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        {/* On its own line BELOW the controls.
            Putting it before them pushed the enable toggle and the reorder
            buttons onto a second row — controls somebody uses constantly
            moved so that an explanation they read once could go first. */}
        {selectedAction && !selectedAction.retired && (
          <p className="basis-full text-xs text-muted-foreground">
            {selectedAction.detail}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {field('app_name', 'Application name', 'Steam, Epic Games Launcher')}
        {field('publisher', 'Publisher', 'Valve Corporation')}
        {field('file_path', 'Path', 'C:\\Program Files\\Steam')}
        {field('bundle_id', 'Bundle ID (macOS)', 'com.valvesoftware.steam')}
      </div>

      {rule.action === 'elevate' && <ElevateNotSupportedYet />}

      <RuleReach match={rule.match} />
    </div>
  );
}

/** What this rule will actually match, said out loud as it is being written.
 *
 *  "Fields you fill in must all match" was already on the form, in small grey
 *  text under four inputs, and it is not what somebody filling in a form
 *  believes: adding detail feels like describing the application better, not
 *  like narrowing the rule. The cost of that is a policy that saves cleanly
 *  and matches nothing, which is indistinguishable from the product being
 *  broken.
 *
 *  So the conditions are counted back, and the one combination that can NEVER
 *  match anything — a Windows path together with a macOS bundle identifier,
 *  which no single machine can satisfy — is called out as the error it is. */
/** Said here, at the moment somebody chooses it, rather than left to be
 *  discovered later in the activity feed.
 *
 *  No platform can elevate yet: the agent's platformElevator returns
 *  "unsupported" on both Windows and macOS. Everything around the action is
 *  real — it is carried in the policy, it survives a save, the simulation
 *  counts it and the endpoint reports that it cannot honour it — but nothing
 *  runs with administrator rights because of it.
 *
 *  A rule that looks configured and quietly does nothing is the failure this
 *  product has already shipped twice. The dropdown offering "Run it with
 *  admin rights" with no qualification is exactly that shape, so the
 *  qualification goes next to the choice. */
function ElevateNotSupportedYet() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
      <p className="font-medium">Nothing will run elevated because of this rule — yet.</p>
      <p className="mt-1">
        Elevation is not implemented on Windows or macOS. The rule is saved, pushed to
        endpoints and counted in simulations, and each machine reports back that it cannot
        honour it — you can see that under Enforcement activity. Use <strong>Block</strong> or{' '}
        <strong>Allow</strong> for rules you need enforced today.
      </p>
    </div>
  );
}

function RuleReach({ match }: { match: MatchCriteria }) {
  const filled = (m?: StringMatch) => (m?.values ?? []).some(v => v.trim() !== '');

  const conditions: string[] = [];
  if (filled(match.app_name)) conditions.push('name');
  if (filled(match.publisher)) conditions.push('publisher');
  if (filled(match.file_path)) conditions.push('path');
  if (filled(match.bundle_id)) conditions.push('bundle ID');
  if ((match.sha256 ?? []).some(v => v.trim() !== '')) conditions.push('hash');

  const windowsPath = (match.file_path?.values ?? []).some(v => /^[a-zA-Z]:[\\/]/.test(v.trim()));
  const impossible = windowsPath && filled(match.bundle_id);

  if (conditions.length === 0) {
    return (
      <p className="text-xs text-amber-500">
        This rule has no conditions, so it matches nothing. An empty rule never matches —
        it is never treated as &ldquo;everything&rdquo;.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Matches software where{' '}
        <span className="text-foreground">{conditions.join(' AND ')}</span>
        {conditions.length > 1 && ' all match at once'}. Values within one field are
        alternatives.
      </p>
      {impossible && (
        <p className="text-xs text-destructive">
          A Windows path and a macOS bundle ID can never both be true on one machine, so this
          rule matches nothing anywhere. Keep whichever platform you mean.
        </p>
      )}
      {!impossible && conditions.length >= 3 && (
        <p className="text-xs text-amber-500">
          Every extra field makes this rule narrower, not more accurate. If you are unsure what
          a machine reports for a field, leave it empty.
        </p>
      )}
    </div>
  );
}

/** Chooses which machines a policy applies to.
 *
 *  Group scoping is what makes a directory sync worth having: an operator
 *  writes one policy against "Finance" and membership is maintained in Entra,
 *  rather than here by hand. */
export function ScopePicker({
  scope,
  onChange,
}: {
  scope: AppPolicy['scope'];
  onChange: (scope: AppPolicy['scope']) => void;
}) {
  const { token } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [g, m] = await Promise.all([
        groupsAPI.listGroups(token, { limit: 200 }),
        machinesAPI.listMachines(token, { limit: 500 }),
      ]);
      setGroups(g.groups ?? []);
      setMachines(m.machines ?? []);
    } catch {
      // A picker that cannot load its options is still usable for tenant
      // scope, which is the default — so this is not worth an error banner.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (scope.kind !== 'tenant') load();
  }, [scope.kind, load]);

  const setKind = (kind: PolicyScopeKind) => {
    // Targets are cleared on a change of kind so a policy cannot carry a stale
    // list that becomes live again if somebody switches back.
    onChange({ kind, group_ids: [], agent_ids: [] });
  };

  const toggle = (list: string[] | undefined, id: string): string[] => {
    const current = list ?? [];
    return current.includes(id) ? current.filter(x => x !== id) : [...current, id];
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <Label className="text-base font-semibold">Applies to</Label>

      <div className="flex flex-wrap gap-2">
        {([
          ['tenant', 'All machines'],
          ['group', 'Groups'],
          ['machine', 'Specific machines'],
        ] as [PolicyScopeKind, string][]).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => setKind(kind)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              scope.kind === kind
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/50 bg-muted/30 hover:border-primary/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {scope.kind === 'group' && !loading && (
        <div className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups yet. Create them under Organisation Management, or turn on Microsoft Entra
              sync in Settings → Directory to bring your existing ones across.
            </p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {groups.map(group => (
                <label
                  key={group.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={(scope.group_ids ?? []).includes(group.id)}
                    onChange={() => onChange({ ...scope, group_ids: toggle(scope.group_ids, group.id) })}
                  />
                  <span className="flex-1">{group.name}</span>
                  {group.entra_group_id && (
                    // Worth showing: membership of a synced group is
                    // maintained in Entra, so editing it here is overwritten.
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Cloud className="h-3 w-3" />
                      Entra
                    </Badge>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {scope.kind === 'machine' && !loading && (
        <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {machines.map(machine => (
            <label
              key={machine.agent_id || machine.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-sm hover:bg-muted/40"
            >
              <input
                type="checkbox"
                checked={(scope.agent_ids ?? []).includes(machine.agent_id)}
                onChange={() => onChange({ ...scope, agent_ids: toggle(scope.agent_ids, machine.agent_id) })}
                disabled={!machine.agent_id}
              />
              <span className="flex-1">{machine.name}</span>
              <span className="text-xs text-muted-foreground">{machine.os}</span>
            </label>
          ))}
        </div>
      )}

      {scope.kind === 'group' && (scope.group_ids?.length ?? 0) === 0 && (
        <p className="text-xs text-amber-500">
          Pick at least one group, or this policy applies to nobody.
        </p>
      )}
      {scope.kind === 'machine' && (scope.agent_ids?.length ?? 0) === 0 && (
        <p className="text-xs text-amber-500">
          Pick at least one machine, or this policy applies to nobody.
        </p>
      )}
    </div>
  );
}
