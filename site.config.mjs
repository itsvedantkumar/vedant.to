// The one file to edit when you fork this site. Everything that names the
// owner, the domain, or an account derives from here: lib/constants.ts for
// TypeScript, next.config.mjs and scripts/*.mjs directly, and workflows via
// `node scripts/site.mjs <key>`. `npm run check` fails if any of these values
// is hardcoded anywhere else (scripts/check-identity.mjs).
//
// Plain ESM on purpose: a .mjs config, a shell script and a YAML workflow
// cannot import a TypeScript module.

export const site = {
  /** Short name shown in the title bar, nav, feeds and PWA. */
  name: 'Vedant',
  /** Full name for author fields, JSON-LD and the licence. */
  author: 'Vedant Kumar',
  /** One line under the name on the homepage and in <meta name="description">. */
  description: 'I love watching movies, listening to music, and absorbing culture.',
  /** Canonical origin, no trailing slash. Also the WebAuthn relying-party id host. */
  url: 'https://vedant.to',
  /** Public host for uploaded images (Cloudflare R2 behind a custom domain). */
  assetsUrl: 'https://assets.vedant.to',
  /** Keystatic writes to this repo in production. */
  github: { owner: 'itsvedantkumar', repo: 'vedant.to' },
  /** Handles only, no URLs. Leave a handle empty to drop the link. */
  social: {
    x: 'itsvedantkumar',
    github: 'itsvedantkumar',
    linkedin: 'itsvedantkumar',
    letterboxd: 'itsvedantkumar',
    instagram: 'its.vedant.kumar',
    youtube: 'itsvedantkumar',
  },
  /** Press and profile pages linked from the site. Full URLs. */
  links: {
    iafIndia: 'https://www.iafindia.com/mr-vedant-kumar/',
    /** The previous blog, kept online. */
    oldBlog: 'https://old.vedant.to',
  },
  email: {
    /** Public contact in the JSON-LD Person schema. */
    contact: 'vedant@simulacrum.world',
    /** Where /.well-known/security.txt and SECURITY.md send vulnerability reports. */
    securityContact: 'vk.work.official@gmail.com',
    /** From-address for security alerts (must be a verified Resend sender). */
    security: 'security@vedant.to',
    /** From-address for /whisper mail. */
    whisper: 'whisper@vedant.to',
  },
};

export const siteHost = new URL(site.url).host;
export const assetsHost = new URL(site.assetsUrl).host;
