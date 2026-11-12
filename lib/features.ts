/** Build-and-deploy switches for things the portal will not let people do.
 *
 *  These turn parts of the INTERFACE off. They are not security: the API is
 *  reachable without this portal, so anything that must truly be prevented
 *  has to be refused by the server. What they are for is an installation
 *  where tenants are provisioned by a person or a script, and the signup
 *  form would otherwise invite anybody who reaches the login page to create
 *  an organisation nobody asked for.
 */

/** Whether self-service signup — and with it tenant creation — is offered.
 *
 *  Reading NEXT_PUBLIC_DISABLE_SIGNUP rather than an ENABLE flag, so the
 *  default with no configuration at all is the behaviour every existing
 *  installation already has. A flag that has to be set to keep working is a
 *  flag that breaks somebody's deployment on upgrade.
 */
export const signupDisabled = isOn(process.env.NEXT_PUBLIC_DISABLE_SIGNUP);

/** isOn reads the spellings people actually write in a .env file.
 *
 *  "true", "1", "yes", "on" — because somebody setting a flag called
 *  DISABLE_SIGNUP to "1" has said exactly what they meant, and failing to
 *  honour it would leave signup open on an installation whose operator
 *  believes they closed it. Anything else, including empty and unset, is
 *  off.
 */
function isOn(v: string | undefined): boolean {
  switch ((v ?? '').trim().toLowerCase()) {
    case 'true':
    case '1':
    case 'yes':
    case 'on':
      return true;
    default:
      return false;
  }
}
