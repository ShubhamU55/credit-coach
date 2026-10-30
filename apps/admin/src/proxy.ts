import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// An optimistic check only: no cookie means no session, so go to /login early. The real check
// (Supabase Auth getUser, then the admin role) runs in the layout and in every server action.
export function proxy(request: NextRequest) {
  if (!request.cookies.has('cc_admin_token')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/rules/:path*', '/audit/:path*', '/profiles/:path*'],
};
