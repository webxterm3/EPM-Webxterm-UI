'use client';

import { BrandIcon } from '@/components/BrandIcon';
import { useBranding } from '@/contexts/BrandingContext';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  iconBoxClassName?: string;
  iconClassName?: string;
  logoSizeClassName?: string;
  textClassName?: string;
  textWrapperClassName?: string;
}

// Renders the product mark (logo + name) from the org's branding config, set by a
// super admin in Settings → Theme Configuration. Falls back to the product's
// own mark — see BrandIcon — when nothing has been customized yet.
export function BrandMark({
  iconBoxClassName = 'w-10 h-10 rounded-xl bg-primary text-primary-foreground',
  iconClassName = 'w-6 h-6',
  // A custom logo has no surrounding box, so it needs its own size — matching
  // iconBoxClassName's footprint, not iconClassName's (much smaller) glyph
  // size. Without this, an uploaded logo rendered at iconClassName's size
  // looked tiny wherever the fallback icon otherwise sits inside a bigger box
  // (e.g. the sidebar's 16px glyph vs. its 32px box).
  logoSizeClassName = 'w-10 h-10',
  textClassName = 'text-2xl font-bold tracking-tight',
  textWrapperClassName,
}: BrandMarkProps) {
  const { branding, resolved } = useBranding();

  const icon = branding.logo_url ? (
    <img
      src={branding.logo_url}
      alt={`${branding.name_part1}${branding.name_part2}`}
      className={cn(logoSizeClassName, 'object-contain shrink-0')}
    />
  ) : (
    <div className={cn('flex items-center justify-center shrink-0', iconBoxClassName)}>
      {/* The mark sits in a box already filled with the accent colour, so it
          renders in the box's foreground colour and knocks the caret out. */}
      <BrandIcon className={iconClassName} />
    </div>
  );

  // Neither part takes a custom colour: Part 1 inherits the surrounding text
  // colour, Part 2 always tracks the active theme accent colour.
  //
  // Until the real config has resolved, the name renders transparent rather
  // than not at all. The stock name is the WRONG name on any deployment that
  // renamed the product, and showing it for one frame before correcting it is
  // what produced the visible flicker on the login page; collapsing the
  // element instead would just trade that flicker for a layout jump.
  const name = (
    <span className={cn(textClassName, 'truncate', !resolved && 'invisible')} aria-hidden={!resolved}>
      <span>{branding.name_part1}</span>
      <span className="text-primary">{branding.name_part2}</span>
    </span>
  );

  return (
    <>
      {icon}
      {textWrapperClassName ? <div className={textWrapperClassName}>{name}</div> : name}
    </>
  );
}

/** The product name as inline text, for prose like "Sign in to your X account".
 *
 *  Same rule as BrandMark: nothing is shown until the real config has
 *  resolved, so a renamed deployment never flashes the stock name first. The
 *  placeholder keeps the line's height so the sentence does not jump. */
export function BrandName({ className }: { className?: string }) {
  const { branding, resolved } = useBranding();
  if (!resolved) return <span className={cn('inline-block', className)}>&nbsp;</span>;
  return (
    <span className={className}>
      {branding.name_part1}
      {branding.name_part2}
    </span>
  );
}
