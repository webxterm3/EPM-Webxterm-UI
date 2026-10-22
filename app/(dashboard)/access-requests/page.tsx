import { redirect } from 'next/navigation';

/** Approvals moved into Remote Access, beside the policy that governs them
 *  and the form that creates them.
 *
 *  A redirect rather than a deletion: this path is in people's history, in
 *  bookmarks, and in the notification emails already sent. A 404 would tell
 *  somebody following one of those that the feature is gone. */
export default function AccessRequestsMoved() {
  redirect('/remote-access');
}
