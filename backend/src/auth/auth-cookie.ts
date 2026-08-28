import type { CookieOptions } from 'express';

// Shared between JwtStrategy (reads it) and AuthController (sets/clears
// it) so the name can't drift between the two.
export const AUTH_COOKIE_NAME = 'sb_token';

/** Same options must be passed to both res.cookie() and res.clearCookie()
 *  — Express matches a clear against path/domain/sameSite/secure, so a
 *  mismatch here would silently fail to clear the cookie on logout. */
export function authCookieOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: true,
    // Strict, not Lax: every legitimate use of this app is same-origin
    // (Vite's dev proxy, Caddy in production — see ops/Caddyfile), so
    // there's no real top-level-navigation case that needs Lax's
    // exception, and Strict is the stronger CSRF defense of the two.
    sameSite: 'strict',
    // Caddy terminates TLS in production (ops/Caddyfile); dev runs over
    // plain HTTP on 127.0.0.1, where a Secure cookie would simply never
    // be sent.
    secure: isProd,
    path: '/',
  };
}
