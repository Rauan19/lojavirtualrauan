---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance (accessibility, focus, forms, touch targets, performance, copy). Use when asked to "review my UI", "check accessibility", "audit design", "review UX", "auditar acessibilidade", "revisar a interface", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

Origem: vercel-labs/agent-skills (commit 063bee9) e
vercel-labs/web-interface-guidelines `command.md`, baixados e revisados em
2026-10-02. As regras ficam **fixas** em `guidelines.md` nesta pasta: a skill
original buscava as regras na internet a cada uso, o que deixaria o conteúdo
mudar sem revisão. Para atualizar, baixe de novo, revise e substitua o arquivo.

## How It Works

1. Read the rules in `guidelines.md` (this folder)
2. Read the specified files (or ask the user which files/pattern)
3. Check against all rules
4. Output findings in the terse `file:line` format described in `guidelines.md`

## Project notes (Vendira)

- Interface em português do Brasil: escreva os achados em português.
- `web/` é Next.js 15 + Tailwind; tokens e classes base (`btn`, `field`,
  `label`, `admin-page`) ficam em `web/src/app/globals.css`.
- Priorize vitrine e checkout (dinheiro), depois o painel do lojista.
