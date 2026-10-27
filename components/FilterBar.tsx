'use client';

import React from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** One labelled control in a filter row.
 *
 *  Every field gets a label, even an obvious one, because a grid row mixes
 *  labelled and unlabelled controls at different heights — the unlabelled ones
 *  ride up by exactly the height of a label and nothing lines up. */
export function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** A native select whose arrow is the same icon the rest of the UI uses.
 *
 *  The browser draws its own arrow at its own size and inset, which next to a
 *  lucide icon reads as misaligned. Suppressing it and positioning ours keeps
 *  a row coherent, and `pr-9` leaves room so a long option never runs
 *  underneath it.
 *
/** EMPTY is not a value Radix accepts.
 *
 *  A native <option value=""> is the ordinary way to write "no filter", and
 *  callers use it — EndpointAuditEvents has `<option value="">All events`.
 *  Radix throws on an empty SelectItem value, so the empty string is carried
 *  through this component as a sentinel and converted back at the boundary.
 *  Callers never see it, and `onChange` still hands them "".
 *
 *  Chosen so it cannot collide with a real value: no option in this codebase
 *  is a unit-separator character, and anything that ever is would be a far
 *  stranger bug than this. */
const EMPTY_SENTINEL = '\u001fempty\u001f';

export function SelectInput({
  id,
  value,
  onChange,
  children,
  className,
  'aria-label': ariaLabel,
}: {
  // Carried through so a <Label htmlFor> still finds its control — clicking
  // the label focuses the control, and a screen reader announces the pair.
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** <option> elements, as a native select would take. They are translated
   *  below, so every existing caller keeps working unchanged. */
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  // Flattened, because callers build these with .map() and conditionals, and
  // React.Children.toArray resolves both into a plain list.
  const options = React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement(child) || child.type !== 'option') return [];
    const props = child.props as {
      value?: string | number;
      children?: React.ReactNode;
      disabled?: boolean;
    };
    const raw = props.value === undefined ? '' : String(props.value);
    return [{
      raw,
      value: raw === '' ? EMPTY_SENTINEL : raw,
      label: props.children,
      disabled: props.disabled,
    }];
  });

  const selected = value === '' ? EMPTY_SENTINEL : value;
  const current = options.find(o => o.value === selected);

  return (
    <Select
      value={selected}
      onValueChange={v => onChange(v === EMPTY_SENTINEL ? '' : v)}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        // h-10 matches the Input component's default, which is what the other
        // controls in these rows are. cn merges Tailwind conflicts, so a dense
        // form row can still pass h-9.
        className={cn('h-10 w-full', className)}
      >
        {/* The trigger renders the chosen option's own label, so a caller that
            formats one (an icon, a muted hint) keeps that formatting. */}
        <SelectValue>{current?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
