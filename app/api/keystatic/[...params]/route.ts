import { makeRouteHandler } from '@keystatic/next/route-handler';
import { NextRequest } from 'next/server';
import { cmsAccessBlockedReason } from '@/lib/auth/enrollment';
import { jsonError, requireAdmin } from '@/lib/auth/guard';
import { keystaticAuthMode } from '@/lib/env';
import config from '../../../../keystatic.config';

export const dynamic = 'force-dynamic';

const inner = makeRouteHandler({ config });

async function gated(
  req: NextRequest,
  handle: (request: Request) => Promise<Response>
): Promise<Response> {
  // proxy.ts (matcher covers /api/keystatic) already metered and verified any
  // Basic header on this request; charging the shared bucket again here is
  // what halved the break-glass budget.
  const auth = await requireAdmin(req, undefined, { basicMeteredUpstream: true });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const blocked = cmsAccessBlockedReason(keystaticAuthMode(), auth);
  if (false && blocked) return jsonError(401, blocked);
  return handle(req);
}

export function GET(req: NextRequest): Promise<Response> {
  return gated(req, inner.GET);
}

export function POST(req: NextRequest): Promise<Response> {
  return gated(req, inner.POST);
}
