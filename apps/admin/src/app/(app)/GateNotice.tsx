import { redirect } from 'next/navigation';

export const NOT_ADMIN_TEXT =
  'Not an admin. This account can sign in but cannot view or edit the control center. Ask the project owner to grant the admin role.';

/** The notice for a failed admin gate; sends a signed-out caller to /login. */
export function gateNotice(status: 'signed-out' | 'unavailable' | 'not-admin') {
  if (status === 'signed-out') redirect('/login');
  if (status === 'unavailable') {
    return (
      <p role="alert" data-testid="service-unavailable">
        The sign-in service is unavailable right now. You are not signed out; try again shortly.
      </p>
    );
  }
  return (
    <p role="alert" data-testid="not-admin">
      {NOT_ADMIN_TEXT}
    </p>
  );
}
