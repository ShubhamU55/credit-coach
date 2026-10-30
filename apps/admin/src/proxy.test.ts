import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

describe('proxy', () => {
  it('redirects to /login when there is no session cookie', () => {
    const res = proxy(new NextRequest('http://localhost:3000/rules'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('lets a request with the cookie through (the real check runs later)', () => {
    const res = proxy(
      new NextRequest('http://localhost:3000/audit', { headers: { cookie: 'cc_admin_token=x' } }),
    );
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('guards exactly the three data sections', () => {
    expect(config.matcher).toEqual(['/rules/:path*', '/audit/:path*', '/profiles/:path*']);
  });
});
