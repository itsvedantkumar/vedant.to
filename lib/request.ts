export function getIP(req: { headers: { get(name: string): string | null } }): string {
  return req.headers.get('x-vercel-forwarded-for') ?? 'unknown';
}
