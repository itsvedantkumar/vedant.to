import { NextRequest, NextResponse } from 'next/server';
import {
  checkOrigin,
  checkOriginOrAbsent,
  jsonError,
  requireAdmin,
} from '@/lib/auth/guard';
import { lastCredentialDeleteBlockedReason } from '@/lib/auth/enrollment';
import { notifySecurityEvent, requestContext } from '@/lib/auth/notify';
import {
  countCredentials,
  deleteCredentialRecord,
  getCredential,
  isRedisUnavailable,
  listCredentials,
  relinkCredentialId,
  unlinkCredentialId,
} from '@/lib/webauthn/store';
import { credentialIdSchema, parseSearchParams } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Enrolled devices. Never returns publicKey. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!checkOriginOrAbsent(req)) return jsonError(403, 'bad origin');

  const auth = await requireAdmin(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  try {
    const credentials = (await listCredentials()).map((c) => ({
      id: c.id,
      shortId: c.id.slice(0, 12),
      label: c.label,
      deviceType: c.deviceType,
      backedUp: c.backedUp,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
      suspended: c.suspended ?? false,
    }));
    return NextResponse.json({ credentials }, { headers: NO_STORE });
  } catch (err) {
    if (isRedisUnavailable(err)) return jsonError(503, 'passkeys unavailable');
    return jsonError(503, 'unavailable');
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!checkOrigin(req)) return jsonError(403, 'bad origin');

  const auth = await requireAdmin(req);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  // base64url alphabet only: this value is interpolated into Redis keys and
  // into the alert email below.
  const parsed = parseSearchParams(req.nextUrl.searchParams, credentialIdSchema);
  if (!parsed.ok) return parsed.response;
  const { id } = parsed.data;

  const removed = async () => {
    await notifySecurityEvent(
      'a passkey was removed',
      `A passkey was removed from /keystatic.\n\nid: ${id.slice(0, 12)}\n${requestContext(req)}`
    );
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  };

  try {
    if (!(await getCredential(id))) return jsonError(404, 'no such credential');

    // Unlink first, then count — a read-then-delete check races with a
    // concurrent delete of a *different* credential.
    if (!(await unlinkCredentialId(id))) return jsonError(404, 'no such credential');
    if ((await countCredentials()) === 0) {
      const blocked = lastCredentialDeleteBlockedReason(auth);
      if (blocked) {
        await relinkCredentialId(id);
        return jsonError(409, blocked);
      }
    }

    await deleteCredentialRecord(id);
    return removed();
  } catch (err) {
    if (isRedisUnavailable(err)) return jsonError(503, 'passkeys unavailable');
    return jsonError(503, 'unavailable');
  }
}
