import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { signupDisabled } from '@/lib/features';

/** Routes the portal refuses to serve when a feature is switched off.
 *
 *  Next calls this file the "proxy" now; it was "middleware" until this
 *  version, and the rename is theirs. The build warns about the old name
 *  rather than failing, so a file left behind keeps working right up until
 *  the release that drops it — at which point a feature switched off here
 *  quietly switches itself back on.
 *
 *  Done here rather than inside the page, because a page can only decide
 *  once it has loaded — and a signup form that appears and then withdraws
 *  itself has already shown somebody a thing they cannot have. Middleware
 *  runs before any of it is sent.
 *
 *  This closes the PORTAL's door only. The API behind it is reachable
 *  without this application, which is the point here: an operator who wants
 *  tenants created by script keeps that, and loses the form.
 */
export default function proxy(request: NextRequest) {
  if (signupDisabled && request.nextUrl.pathname.startsWith('/signup')) {
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    // Says why, so somebody who followed a bookmark is not silently
    // bounced to a login page and left wondering what happened.
    to.searchParams.set('signup', 'disabled');
    return NextResponse.redirect(to);
  }
  return NextResponse.next();
}

export const config = {
  // Only the paths this actually decides about. Matching everything would
  // put this function in front of every image and script the portal
  // serves, for a check that concerns one route.
  matcher: ['/signup/:path*'],
};
