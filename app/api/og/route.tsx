import { ImageResponse } from 'next/og';
import { makeRatelimit } from '@/lib/ratelimit';
import { getIP } from '@/lib/request';
import { OG_DEFAULT_TITLE, ogQuerySchema, parseSearchParams } from '@/lib/validation';

// Node.js runtime, not 'edge'. Next 16 deprecated the Edge runtime, and
// ImageResponse is satori + resvg-wasm, which run the same either way. The
// generation cost is CPU, not cold-start, so the regional Node function is not
// the slower choice here.
export const runtime = 'nodejs';

// 60 requests per minute sliding window — OG image generation is CPU-heavy
const ogRatelimit = makeRatelimit('og', 60, '1 m');

export async function GET(request: Request) {
  try {
    // Skip when IP is 'unknown', per every other limiter here: one shared bucket
    // would let a single caller 429 every social preview on the site.
    const ip = getIP(request);
    if (ogRatelimit && ip !== 'unknown') {
      try {
        const { success } = await ogRatelimit.limit(ip);
        if (!success) {
          return new Response('Too Many Requests', { status: 429 });
        }
      } catch (err) {
        // Fail open: a limiter outage must not blank every OG image.
        console.error('[og] rate limit failed:', err);
      }
    }

    const { searchParams } = new URL(request.url);

    // Total by construction: the schema truncates an over-long title and falls
    // back to the default rather than 400ing, because a link already shared
    // must keep rendering a card. The failure arm is unreachable but typed.
    const query = parseSearchParams(searchParams, ogQuerySchema);
    const title = query.ok ? query.data.title : OG_DEFAULT_TITLE;

    const imageResponse = new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          backgroundColor: '#09090b', // zinc-950
          padding: '80px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 32,
            fontWeight: 600,
            color: '#d4d4d8', // zinc-300
            marginBottom: 40,
          }}
        >
          vedant.to
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: '-0.05em',
            color: 'white',
            lineHeight: 1.1,
            maxWidth: '900px',
          }}
        >
          {title}
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
      }
    );
    imageResponse.headers.set(
      'Cache-Control',
      'public, immutable, no-transform, max-age=31536000'
    );
    return imageResponse;
  } catch {
    return new Response('Failed to generate the image', {
      status: 500,
    });
  }
}
