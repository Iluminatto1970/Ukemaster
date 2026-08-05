/**
 * 🤝 Handoff Helper — contexto completo para QUALQUER IA/CLI retomar o trabalho.
 *
 * Uso:
 *   node scripts/handoff.ts          # imprime HANDOFF.md + estado git
 *   node scripts/handoff.ts --save   # igual acima, e ainda salva em .aiox/handoffs/handoff-<data>.md
 *
 * Ideia: se você trocar de CLI/LLM (Claude → Codex → Cursor → Freebuff → Gemini...),
 * rode `node scripts/handoff.ts` na sessão ANTIGA e cole a saída na sessão NOVA —
 * ou simplesmente diga à IA nova "leia HANDOFF.md e scripts/handoff.ts".
 * A IA nova entenderá exatamente onde paramos e a linha de raciocínio.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e: any) {
    return `(erro ao executar: ${cmd})\n${e?.stderr?.toString?.()?.slice(0, 500) || e?.message || ''}`;
  }
}

function banner(t: string) {
  console.log(`\n${'═'.repeat(70)}\n  ${t}\n${'═'.repeat(70)}`);
}

function main() {
  const save = process.argv.includes('--save');

  banner('HANDOFF.md — estado vivo do projeto');
  const handoff = fs.existsSync(path.join(ROOT, 'HANDOFF.md'))
    ? fs.readFileSync(path.join(ROOT, 'HANDOFF.md'), 'utf-8')
    : '(HANDOFF.md não existe — crie-o)';
  console.log(handoff);

  banner('GIT — branch e status');
  console.log(run('git branch --show-current'));
  console.log(run('git status --short | head -60'));

  banner('GIT — últimas mudanças relevantes (resumo de diff)');
  console.log(run('git diff --stat | tail -25'));
  console.log(run('git log --oneline -6'));

  banner('PROJETO — scripts disponíveis');
  console.log(run('node -e "const p=require(\'./package.json\'); console.log(Object.entries(p.scripts).map(([k,v])=>`  ${k}: ${v}`).join(\'\\n\'))"'));

  if (save) {
    const dir = path.join(ROOT, '.aiox', 'handoffs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `handoff-${new Date().toISOString().slice(0, 10)}.md`);
    const stamp = `# Handoff ${new Date().toISOString()}\n\n`;
    fs.writeFileSync(file, stamp + handoff);
    console.log(`\n✔ Salvo em ${file}`);
  }

  console.log(
    `\n💡 Para retomar em OUTRA IA/CLI: cole a saída acima, ou apenas diga:\n` +
    `   "Leia HANDOFF.md e rode node scripts/handoff.ts para ver onde paramos."\n`
  );
}

main();
