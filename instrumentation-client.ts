// Runs once in the browser before hydration (Next.js instrumentation-client).
// PostHog is proxied through /ingest (next.config.mjs rewrites) so the CSP
// stays same-origin and ad blockers do not see a third-party host.
//
// Credit discipline: production only, admin routes dropped before send,
// surveys off, network timing off, replay inputs masked. Sampling and the
// minimum replay duration live in the PostHog project settings.
import posthog from 'posthog-js';
import { isTrackedPath, pathnameOf } from '@/lib/analytics';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key && process.env.NODE_ENV === 'production') {
  posthog.init(key, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
    capture_pageleave: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true, network_timing: false },
    disable_surveys: true,
    autocapture: { dom_event_allowlist: ['click', 'submit'] },
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
      recordCrossOriginIframes: false,
    },
    before_send: (event) => {
      if (!event) return null;
      const pathname =
        pathnameOf(event.properties?.$current_url) ?? window.location.pathname;
      return isTrackedPath(pathname) ? event : null;
    },
    loaded: (client) => {
      if (!isTrackedPath(window.location.pathname)) client.stopSessionRecording();
    },
  });
}
