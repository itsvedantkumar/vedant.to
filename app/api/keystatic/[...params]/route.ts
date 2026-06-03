import { makeRouteHandler } from '@keystatic/next/route-handler';
import config from '../../../../keystatic.config';

// @keystatic/next's makeRouteHandler already reads the GitHub App slug from
// NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG internally — no extra option needed.
export const { GET, POST } = makeRouteHandler({ config });
