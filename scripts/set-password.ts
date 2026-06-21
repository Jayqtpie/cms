/**
 * set-password — set or reset the site's editor password without hand-running
 * bcrypt over SSH.
 *
 *   npm run set-password                 # prompts (hidden input)
 *   npm run set-password -- "my secret"  # non-interactive
 *
 * Writes the bcrypt hash to CMS_PASSWORD in ./.env, preserving other keys, and
 * generates a JWT_SECRET if one isn't set yet. Restart the server afterwards.
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const ENV_PATH = path.resolve(process.cwd(), '.env');
const MIN_LENGTH = 8;

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Suppress echo of the typed characters (show the prompt once, hide input).
    const asMutable = rl as unknown as { _writeToOutput: (s: string) => void };
    const original = asMutable._writeToOutput.bind(rl);
    let shown = false;
    asMutable._writeToOutput = (s: string) => {
      if (!shown && s.includes(question)) {
        original(s);
        shown = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function findIndex(lines: string[], key: string): number {
  return lines.findIndex((l) => l.replace(/^\s*/, '').startsWith(`${key}=`));
}

function upsert(lines: string[], key: string, value: string): string[] {
  const idx = findIndex(lines, key);
  if (idx === -1) return [...lines, `${key}=${value}`];
  const copy = [...lines];
  copy[idx] = `${key}=${value}`;
  return copy;
}

function valueOf(lines: string[], key: string): string {
  const idx = findIndex(lines, key);
  if (idx === -1) return '';
  return lines[idx].slice(lines[idx].indexOf('=') + 1).trim();
}

async function main(): Promise<void> {
  const password = process.argv[2] ?? (await promptHidden('New CMS password: '));
  if (!password || password.length < MIN_LENGTH) {
    console.error(`Password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }
  const hash = bcrypt.hashSync(password, 10);

  let raw = '';
  try {
    raw = await fs.readFile(ENV_PATH, 'utf8');
  } catch {
    /* no .env yet — we'll create one */
  }
  let lines = raw ? raw.replace(/\n+$/, '').split('\n') : [];

  lines = upsert(lines, 'CMS_PASSWORD', hash);

  let generatedSecret = false;
  if (!valueOf(lines, 'JWT_SECRET')) {
    lines = upsert(lines, 'JWT_SECRET', randomBytes(32).toString('hex'));
    generatedSecret = true;
  }

  await fs.writeFile(ENV_PATH, `${lines.join('\n')}\n`, 'utf8');

  console.log(`✓ Password updated in ${ENV_PATH}`);
  if (generatedSecret) {
    console.log('✓ Generated a JWT_SECRET (any existing sessions are now invalid).');
  }
  console.log('Restart the server for the change to take effect.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
