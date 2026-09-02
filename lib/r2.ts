import { S3Client } from '@aws-sdk/client-s3';
import { r2Env } from '@/lib/env';

const { credentials, partiallyConfigured } = r2Env();

// Log, never throw: app code imports this and would 500 on missing config.
// Callers all handle `null` (they degrade gracefully).
if (partiallyConfigured) {
  console.error(
    'R2 misconfigured: set all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY or none — R2 disabled'
  );
}

export const r2 = credentials
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${credentials.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
      forcePathStyle: true,
    })
  : null;
