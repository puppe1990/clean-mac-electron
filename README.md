# Clean Mac Electron

Aplicativo Electron focado em analise segura de arquivos e limpeza de dados no macOS.

## Estrutura

- `app/main.js`: cria a janela, controla IPC e acoes seguras (scan, dialogos, lixeira).
- `app/preload.js`: bridge segura via `contextBridge`.
- `app/services/scanner.js`: varredura com regras de suspeicao e limites de profundidade.
- `app/renderer/`: interface, filtros e tabela de arquivos.

## Seguranca

- `contextIsolation: true`, `sandbox: true` e sem `nodeIntegration` no renderer.
- Exclusao usa `shell.trashItem` (lixeira do macOS), evitando remocao permanente.
- Varredura tem limites de profundidade e quantidade de arquivos.

## Executar

1. Instale dependencias: `npm install`
2. Inicie: `npm run start`

> Requer macOS recente e Electron 29+.
