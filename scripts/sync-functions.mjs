// Copies the engine and server sources into supabase/functions/_shared so the Edge
// Function runs exactly the same rules code as the web app. Tests are left out.
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = join(root, 'supabase/functions/_shared');
const isSource = (path) => !path.endsWith('.test.ts') && !/test-helpers|memory-store/.test(path);

rmSync(shared, { recursive: true, force: true });
for (const name of ['engine', 'server']) {
  cpSync(join(root, 'packages', name, 'src'), join(shared, name), { recursive: true, filter: isSource });
}
console.log('Synced engine and server into supabase/functions/_shared');
