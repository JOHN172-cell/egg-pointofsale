import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}
if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  console.error('Run this script in an interactive terminal so the password can be entered without echo.');
  process.exit(1);
}

const readline = createInterface({ input: process.stdin, output: process.stdout });
const ask = prompt => new Promise(resolve => readline.question(prompt, resolve));
const email = (await ask('Administrator email: ')).trim();
const displayName = (await ask('Administrator display name: ')).trim();
readline.close();

process.stdout.write('Administrator password (12+ characters, hidden): ');
process.stdin.setRawMode(true);
process.stdin.resume();
const password = await new Promise(resolve => {
  let value = '';
  const onData = chunk => {
    for (const char of chunk.toString('utf8')) {
      if (char === '\u0003') {
        process.stdin.setRawMode(false);
        process.stdin.off('data', onData);
        process.exit(130);
      }
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
      else value += char;
    }
  };
  process.stdin.on('data', onData);
});

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || password.length < 12) {
  console.error('Enter a valid email, a display name, and a password of at least 12 characters.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const { data: existing, error: lookupError } = await supabase.from('profiles')
  .select('id').eq('role', 'admin').limit(1);
if (lookupError) {
  console.error(`Could not check existing administrators: ${lookupError.message}`);
  process.exit(1);
}
if (existing.length) {
  console.error('An administrator already exists. Use the staff-management screen instead.');
  process.exit(1);
}

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email, password, email_confirm: true
});
if (createError) {
  console.error(`Could not create the administrator login: ${createError.message}`);
  process.exit(1);
}
const { error: profileError } = await supabase.from('profiles').insert({
  id: created.user.id, display_name: displayName, role: 'admin', active: true
});
if (profileError) {
  await supabase.auth.admin.deleteUser(created.user.id);
  console.error(`Could not create the administrator profile: ${profileError.message}`);
  process.exit(1);
}
console.log(`Administrator account created for ${email}.`);
