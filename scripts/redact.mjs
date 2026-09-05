// Encrypts one line for components/redacted.tsx. Prints the payload to paste
// into the page. The password never touches the repo; pass it via env only.
//
//   REDACT_PASSWORD='...' node scripts/redact.mjs "text to hide"
import { encryptRedacted } from '../lib/redact.ts';

const text = process.argv.slice(2).join(' ').trim();
const password = process.env.REDACT_PASSWORD;
if (!text || !password) {
  console.error('usage: REDACT_PASSWORD=<password> node scripts/redact.mjs "<text>"');
  process.exit(1);
}
console.log(JSON.stringify(await encryptRedacted(text, password)));
