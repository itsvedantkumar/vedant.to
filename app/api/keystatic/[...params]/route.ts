import { makeRouteHandler } from '@keystatic/next/route-handler';
import config from '../../../../keystatic.config';

export const { GET, POST } = makeRouteHandler({ config, slugEnvVarName: 'NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG' });
