// Encrypts one line for the REDACTED_LINES env var (read by /api/redact).
// Prints the full JSON map to set; merges into an existing map when
// REDACTED_LINES is also passed. The password never touches the repo.
//
//   REDACT_PASSWORD='…' [REDACTED_LINES='{…}'] node scripts/redact.mjs <id> "<text>"
//   printf '%s' "$(…)" | npx vercel env add REDACTED_LINES production --sensitive
import { encryptLine, parseRedactedLines } from '../lib/redact.ts';

const [id, ...rest] = process.argv.slice(2);
const text = rest.join(' ').trim();
const password = process.env.REDACT_PASSWORD;
if (!id || !/^[a-z0-9-]{1,64}$/.test(id) || !text || !password) {
  console.error(
    'usage: REDACT_PASSWORD=<password> node scripts/redact.mjs <id> "<text>"'
  );
  process.exit(1);
}
const lines = parseRedactedLines(process.env.REDACTED_LINES);
lines[id] = await encryptLine(text, password);
console.log(JSON.stringify(lines));
