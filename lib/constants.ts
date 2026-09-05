// Derived from site.config.mjs, the one file a fork edits. Keep this module
// free of literals: `npm run check` (scripts/check-identity.mjs) fails the
// build if the owner's name, domain or handles appear anywhere else.
import { site, siteHost, assetsHost, legacyHost } from '@/site.config.mjs';

export { site };
export const SITE_URL = site.url;
export const SITE_HOST = siteHost;
export const ASSETS_URL = site.assetsUrl;
export const ASSETS_HOST = assetsHost;
export const LEGACY_URL = site.legacyUrl;
export const LEGACY_HOST = legacyHost;
export const SITE_NAME = site.name;
export const AUTHOR = site.author;
export const SITE_DESCRIPTION = site.description;
export const TWITTER_HANDLE = site.social.x ? `@${site.social.x}` : '';
export const GITHUB_OWNER = site.github.owner;
export const GITHUB_REPO = site.github.repo;
export const CONTACT_EMAIL = site.email.contact;
export const SECURITY_EMAIL = site.email.security;
export const SECURITY_CONTACT_EMAIL = site.email.securityContact;
export const WHISPER_EMAIL = site.email.whisper;

export const IAF_PROFILE_URL = site.links.iafIndia;
export const OLD_BLOG_URL = site.links.oldBlog;

export const SOCIAL_LINKS = {
  x: site.social.x ? `https://x.com/${site.social.x}` : null,
  github: site.social.github ? `https://github.com/${site.social.github}` : null,
  linkedin: site.social.linkedin
    ? `https://www.linkedin.com/in/${site.social.linkedin}`
    : null,
  letterboxd: site.social.letterboxd
    ? `https://letterboxd.com/${site.social.letterboxd}/`
    : null,
  instagram: site.social.instagram
    ? `https://www.instagram.com/${site.social.instagram}`
    : null,
  youtube: site.social.youtube
    ? `https://www.youtube.com/@${site.social.youtube}/videos`
    : null,
} as const;

/** Escapes a literal for use inside a RegExp source. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches exactly the canonical origin (no subdomains, no trailing path). */
export const SITE_ORIGIN_RE = new RegExp(`^${escapeRegExp(SITE_URL)}$`);

/**
 * Matches exactly the archived Framer site's origin.
 *
 * Deliberately a separate constant rather than a widening of SITE_ORIGIN_RE:
 * that one gates CSRF on every auth and admin route (lib/auth/guard.ts), and
 * the subdomain wildcard was removed from it on purpose. Only /api/whisper
 * consults this one.
 */
export const LEGACY_ORIGIN_RE = new RegExp(`^${escapeRegExp(LEGACY_URL)}$`);
