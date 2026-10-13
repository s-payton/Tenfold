// Copies the engine and server sources into supabase/functions/_shared so the Edge
// Function runs exactly the same rules code as the web app. Tests are left out.
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = join(root, 'supabase/functions/_shared');
const isSource = (path) => !path.endsWith('.test.ts') && !/test-helpers|memory-store/.test(path);

rmSync(shared, { recursive: true, force: true });
for (const name of ['engine', 'server']) {
  cpSync(join(root, 'packages', name, 'src'), join(shared, name), { recursive: true, filter: isSource });
}

// The project's public token-signing keys, bundled so the function can check sessions
// without downloading them on every cold start. If this fetch fails, the function falls
// back to fetching them itself.
const JWKS_URL = 'https://miyplubvsjgqhbkpixqy.supabase.co/auth/v1/.well-known/jwks.json';
let jwks = { keys: [] };
try {
  const response = await fetch(JWKS_URL);
  if (response.ok) jwks = await response.json();
} catch {
  console.warn('Could not fetch signing keys; the function will fetch them at run time.');
}
writeFileSync(join(shared, 'jwks.json'), JSON.stringify(jwks));
console.log(`Synced engine and server into supabase/functions/_shared (${String(jwks.keys.length)} signing key(s))`);
