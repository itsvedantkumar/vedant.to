import { S3Client } from '@aws-sdk/client-s3';

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

// Log, never throw: app code imports this and would 500 on missing config.
// Callers all handle `null` (they degrade gracefully).
const setCount = [r2AccountId, r2AccessKeyId, r2SecretAccessKey].filter(Boolean).length;
if (setCount > 0 && setCount < 3) {
  console.error(
    'R2 misconfigured: set all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY or none — R2 disabled'
  );
}

export const r2 =
  r2AccountId && r2AccessKeyId && r2SecretAccessKey
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
        },
        forcePathStyle: true,
      })
    : null;
