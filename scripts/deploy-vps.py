#!/usr/bin/env python3
"""Deploy do runner do cron na VPS via paramiko (senha do env VPS_PASSWORD).

Faz tudo em 1 passo (nao depende de chave SSH, que outro agente pode remover):
  1) cria /root/ukemaster-cron;
  2) envia o bundle ukemaster-cron.mjs e um .env com CRON_WORKER_NAME=vps;
  3) adiciona ao crontab (SEM apagar as tarefas existentes):
       - poll de comandos a cada 1 min
       - rotacao INTENSIFICADA a cada 15 min com orcamento de 10 min;
  4) roda um teste curto e mostra o resultado.

Uso: VPS_PASSWORD='...' python scripts/deploy-vps.py
"""
import os
import pathlib

import paramiko

HOST = "100.72.114.76"
USER = "root"
PASSWORD = os.environ.get("VPS_PASSWORD")
if not PASSWORD:
    print("[ERRO] Defina VPS_PASSWORD.")
    raise SystemExit(1)

ROOT = pathlib.Path(__file__).resolve().parent.parent  # raiz do projeto
DEST = "/root/ukemaster-cron"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=HOST, username=USER, password=PASSWORD, timeout=15)


def run(cmd: str) -> str:
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode("utf-8", "replace").strip()
    err = stderr.read().decode("utf-8", "replace").strip()
    return out + ("\n" + err if err else "")


# 1) Instala a chave publica local no authorized_keys (acesso futuro por chave)
print("[1/6] instalando chave SSH no authorized_keys")
pub_key = pathlib.Path.home().joinpath(".ssh", "id_ed25519.pub").read_text(encoding="utf-8").strip()
print(run("mkdir -p ~/.ssh && chmod 700 ~/.ssh"))
if pub_key in run("cat ~/.ssh/authorized_keys 2>/dev/null"):
    print("   chave ja estava instalada")
else:
    print(run("echo '%s' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" % pub_key))
    print("   chave instalada (verificando acesso por chave...)")

# 2) Diretorio
print("[2/6] criando", DEST)
print(run(f"mkdir -p {DEST}"))

# 2) Envia bundle + .env (com CRON_WORKER_NAME=vps)
print("[3/6] enviando bundle e .env")
env_local = (ROOT / "dist-cron" / ".env").read_text(encoding="utf-8", errors="replace")
lines = []
for line in env_local.splitlines():
    if line.startswith("CRON_WORKER_NAME="):
        lines.append("CRON_WORKER_NAME=vps")
    else:
        lines.append(line)
env_vps = "\n".join(lines) + "\n"

with client.open_sftp() as sftp:
    sftp.put(str(ROOT / "dist-cron" / "ukemaster-cron.mjs"), f"{DEST}/ukemaster-cron.mjs")
    with sftp.open(f"{DEST}/.env", "w") as f:
        f.write(env_vps)
print("   enviado:", run(f"ls -la {DEST} | grep -E 'mjs|env'"))

# 3) Crontab (append — preserva as tarefas existentes)
print("[4/6] atualizando crontab (sem apagar o existente)")
cron_lines = [
    "* * * * * cd {DEST} && node ukemaster-cron.mjs --commands-only >> cron.log 2>&1".format(DEST=DEST),
    "*/15 * * * * cd {DEST} && node ukemaster-cron.mjs --budget 600000 >> cron.log 2>&1".format(DEST=DEST),
]
# Escreve as linhas em um arquivo via SFTP e monta o novo crontab com cat
# (evita problemas de quoting de printf/aspas no shell remoto).
with client.open_sftp() as sftp:
    with sftp.open("/tmp/ukemaster-cron-add.txt", "w") as f:
        f.write("\n".join(cron_lines) + "\n")
print(run(
    "(crontab -l 2>/dev/null | grep -v ukemaster-cron; cat /tmp/ukemaster-cron-add.txt) | crontab - && rm -f /tmp/ukemaster-cron-add.txt"
))
print("   crontab agora:\n" + run("crontab -l | grep ukemaster-cron"))

# 4) Teste rapido: poll de comandos (barato) + rotacao curta
print("[5/6] teste: poll de comandos")
print(run(f"cd {DEST} && timeout 60 node ukemaster-cron.mjs --commands-only 2>&1 | tail -8"))
print("[6/6] teste: rotacao curta (30s)")
print(run(f"cd {DEST} && timeout 90 node ukemaster-cron.mjs --budget 30000 2>&1 | tail -25"))

client.close()
print("\n[OK] VPS configurada com rotacao intensificada (a cada 15 min, orcamento 10 min).")
