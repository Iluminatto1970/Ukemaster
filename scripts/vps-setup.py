#!/usr/bin/env python3
"""Configura a VPS do Tailscale (100.72.114.76) via paramiko:
  1) conecta como root com senha (env VPS_PASSWORD);
  2) instala a chave publica local (~/.ssh/id_ed25519.pub) no authorized_keys;
  3) inspeciona o ambiente (SO, node, recursos).

Uso: VPS_PASSWORD='...' python scripts/vps-setup.py
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

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=HOST, username=USER, password=PASSWORD, timeout=15)


def run(cmd: str) -> str:
    _, stdout, _ = client.exec_command(cmd)
    return stdout.read().decode("utf-8", "replace").strip()


# 1) Instala a chave publica local
pub_key = pathlib.Path.home().joinpath(".ssh", "id_ed25519.pub").read_text(encoding="utf-8").strip()
run("mkdir -p ~/.ssh && chmod 700 ~/.ssh")
if pub_key not in run("cat ~/.ssh/authorized_keys 2>/dev/null"):
    run("echo '%s' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" % pub_key)
    print("[OK] chave publica instalada no authorized_keys")
else:
    print("[info] chave ja estava instalada")

# 2) Inspecao
print("\n=== VPS ===")
print("host :", run("hostname; uname -srm; whoami"))
print("node :", run("node -v 2>/dev/null") or "sem node")
print("npm  :", run("npm -v 2>/dev/null") or "sem npm")
print("cpu  :", run("nproc"))
print("ram  :\n" + run("free -m | head -2"))
print("disk :\n" + run("df -h / | head -2"))
print("crontab:", run("crontab -l 2>/dev/null") or "(vazio)")
print("dirs :", run("ls -d ~/ukemaster-cron ~/UkeMaster 2>/dev/null || echo '(sem projeto ainda)'"))

client.close()
print("\n[OK] VPS configurada - use ssh -i ~/.ssh/id_ed25519 root@100.72.114.76")
