import { SITE_URL, SECURITY_CONTACT_EMAIL } from '@/lib/constants';

export const dynamic = 'force-static';

export async function GET() {
  const securityTxt = `Contact: mailto:${SECURITY_CONTACT_EMAIL}
Expires: 2027-06-07T00:00:00.000Z
Preferred-Languages: en
Canonical: ${SITE_URL}/.well-known/security.txt
`;

  return new Response(securityTxt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
