# Ocultar Meu E-mail — iCloud+ para Firefox

> **Desenvolvido por [GeovaneYu](https://github.com/GeovaneYu)** — Inspirado no projeto [dedoussis/icloud-hide-my-email-browser-extension](https://github.com/dedoussis/icloud-hide-my-email-browser-extension) (MIT). Não afiliado à Apple.

Visual **100% Apple** — SF Pro, grouped inset, blur, dark mode, com privacidade garantida.

Gere aliases do **iCloud+ Hide My Email** direto no Firefox, com **encaminhamento, rótulo, nota, filtros, paginação e exportação**.

## Créditos

**Autor:** GeovaneYu — [github.com/GeovaneYu](https://github.com/GeovaneYu)
**Design:** Apple HIG (iCloud Hide My Email)
**Base técnica:** dedoussis (533★) — MIT

## Funcionalidades v1.1.0

- **Apple 100%:** SF Pro/SF Mono, grouped tables, blur, dark mode automático
- **Geração completa:** Encaminhar para (picker) + Rótulo + Nota antes de reservar → `Criar e usar`
- **Lista retrátil:** Filtro Todos/Ativos/Desativados, ordenação, busca, paginação 20/página (500+), badge container
- **Edição inline:** ✎ rótulo/nota via `updateMetaData`
- **Export:** CSV/JSON 1 clique
- **Containers Firefox:** badge colorido por container
- **React + Shadow DOM:** native setter + eventos + piercing
- **Som pop Apple** 880→1320Hz + animação

## Privacidade 🔒

Esta extensão **não vê sua senha, não tem servidor e não coleta dados** (`data_collection_permissions: none`). Só usa cookies do `icloud.com` após `Confiar neste navegador`. Ver seção expansível no popup.

## Instalação

```bash
about:debugging#/runtime/this-firefox → Load Temporary Add-on → manifest.json
# Produção
npx web-ext build --source-dir . --artifacts-dir dist
```

## Estrutura

```
manifest.json  1.1.0 — GeovaneYu
popup.*        Apple + dark + filtros + paginação + edição + export
background.js  ICloudClient + PremiumMailSettings
content.*      Apple button + React/Shadow DOM
screenshots/   5× 1280x800 AMO
icons/         logo premium 16-1024 + banner 1400x560
```

## Licença

MIT — Base dedoussis. Modificações © 2026 GeovaneYu.
