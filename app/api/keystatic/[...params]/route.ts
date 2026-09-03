import { makeRouteHandler } from '@keystatic/next/route-handler';
import { NextRequest } from 'next/server';
import { cmsAccessBlockedReason } from '@/lib/auth/enrollment';
import { jsonError, requireAdmin } from '@/lib/auth/guard';
import config from '../../../../keystatic.config';

export const dynamic = 'force-dynamic';

const inner = makeRouteHandler({ config });

const AUTH_MODE = process.env.KEYSTATIC_AUTH_MODE === 'passkey' ? 'passkey' : 'basic';

async function gated(
  req: NextRequest,
  handle: (request: Request) => Promise<Response>
): Promise<Response> {
  const auth = await requireAdmin(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const blocked = cmsAccessBlockedReason(AUTH_MODE, auth);
  if (blocked) return jsonError(401, blocked);
  return handle(req);
}

export function GET(req: NextRequest): Promise<Response> {
  return gated(req, inner.GET);
}

export function POST(req: NextRequest): Promise<Response> {
  return gated(req, inner.POST);
}
