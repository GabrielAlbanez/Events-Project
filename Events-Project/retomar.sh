#!/usr/bin/env bash
# Autorizado pelo usuário exclusivamente para esta tarefa e branch EventMap.
cd -- "$(dirname -- "$0")" || exit 1
H=".codex/HANDOFF.md"
PROMPT="Leia .codex/HANDOFF.md e siga AGENTS.md. Continue exclusivamente a tarefa autorizada de push, animações da home e testes do EventMap nesta branch. Não inicie outras tarefas. Encerre marcando CONCLUÍDO."
while true; do
  [ "$(git branch --show-current)" = "feat/home-polish-eventos" ] || exit 1
  if [ -f "$H" ]; then
    if grep -q "Status: CONCLUÍDO" "$H"; then
      echo "[$(date)] Tarefa concluída. Encerrando vigia."
      exit 0
    fi
    if grep -q "Status: PENDENTE" "$H" || [ -n "$(find "$H" -mmin +30)" ]; then
      echo "[$(date)] Tentando retomar tarefa EventMap..."
      codex exec --sandbox workspace-write resume --last "$PROMPT"
    fi
  fi
  sleep 900
done
