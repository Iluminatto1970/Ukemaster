/**
 * Configura a VPS do Tailscale (100.72.114.76) via paramiko:
 *  1) conecta como root com senha (informada via env VPS_PASSWORD);
 *  2) instala a chave pública local (~/.ssh/id_ed25519.pub) no authorized_keys
 *     (acesso futuro por chave, sem senha);
 *  3) inspeciona o ambiente (SO, node, recursos).
 *
 * Uso: VPS_PASSWORD='...' node scripts/vps-setup.mjs
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const HOST = '100.72.114.76';
const USER = 'root';
const PASSWORD = process.env.VPS_PASSWORD;
if (!PASSWORD) {
  console.error('❌ Defina VPS_PASSWORD.');
  process.exit(1);
}

const { Client } = await import('paramiko');

const client = new Client();
await client.connect({
  hostname: HOST,
  username: USER,
  password: PASSWORD,
  look_for_keys: false,
  allow_agent: false,
  timeout: 15,
});

async function run(cmd) {
  const { stdout, stderr } = await client.exec_command(cmd);
  const out = await new Promise((res) => {
    let acc = '';
    stdout.on('data', (d) => (acc += d.toString()));
    stdout.on('close', () => res(acc));
  });
  return out.trim();
}

// 1) Instala a chave pública local
const pubKey = readFileSync(path.join(homedir(), '.ssh', 'id_ed25519.pub'), 'utf-8').trim();
await run('mkdir -p ~/.ssh && chmod 700 ~/.ssh');
const hasKey = (await run(`grep -F '${pubKey}' ~/.ssh/authorized_keys 2>/dev/null || echo NONE`)) !== 'NONE';
if (!hasKey) {
  await run(`echo '${pubKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`);
  console.log('✅ chave pública instalada no authorized_keys');
} else {
  console.log('ℹ️ chave já estava instalada');
}

// 2) Inspeção do ambiente
console.log('\n=== VPS ===');
console.log('host :', await run('hostname; uname -srm; whoami'));
console.log('node :', (await run('node -v 2>/dev/null')) || 'sem node');
console.log('npm  :', (await run('npm -v 2>/dev/null')) || 'sem npm');
console.log('cpu  :', await run('nproc'));
console.log('ram  :\n' + (await run('free -m | head -2')));
console.log('disk :\n' + (await run('df -h / | head -2')));
console.log('crontab:', (await run('crontab -l 2>/dev/null')) || '(vazio)');
console.log('dirs :', await run("ls -d ~/ukemaster-cron ~/UkeMaster 2>/dev/null || echo '(sem projeto ainda)'"));

await client.close();
console.log('\n✅ VPS configurada — agora use ssh -i ~/.ssh/id_ed25519 root@100.72.114.76');
