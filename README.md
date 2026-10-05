# Sistema de Gestão de Contratos — SUDECO (protótipo)

Protótipo navegável do sistema de gestão de contratos e penalidades, criado a
partir da planilha `Planilha de contratos - Gestão`. Feito para **apresentação à
equipe de contratos**.

É um **site 100% estático**: não há back-end. Os dados vivem num **store em
memória no próprio navegador** (`assets/store.js`), semeado por `data/seed.json`.
O CRUD (criar/editar/excluir) funciona de verdade, só que **em memória** — as
edições valem apenas na aba atual e **voltam ao original ao recarregar a página**.

## Como rodar localmente

O site precisa ser servido por HTTP (abrir o `index.html` direto pelo arquivo
não funciona, pois o navegador bloqueia a leitura de `data/seed.json`). Precisa
de **Node.js**:

```bash
cd ~/Desktop/sudeco-contratos
npm install   # só na primeira vez (baixa o serve)
npm start     # serve . -l 8000
```

Acesse <http://localhost:8000>. Para parar: `Ctrl+C`.

## Publicar no GitHub Pages

O repositório já traz o workflow `.github/workflows/deploy-pages.yml`, que
publica os arquivos estáticos a cada push na branch `main`.

1. Crie o repositório no GitHub e faça o push desta pasta para a branch `main`.
2. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. A cada push, o site é publicado na URL do Pages (algo como
   `https://<usuario>.github.io/<repositorio>/`).

Não é preciso configurar nada no código. (O `.nojekyll` evita o processamento Jekyll.)

## O que o protótipo mostra

- **Painel** — contratos ativos, valor total, contratos vencendo em 90 dias,
  quantos podem ser prorrogados, penalidades em aberto e gráficos.
- **Contratos** — busca, filtros, prazo de vencimento calculado automaticamente,
  detalhe completo e **cadastro/edição/exclusão** (em memória). O formulário
  também gerencia **prorrogações** e **eventos** (lista de registros com data e
  texto livre — campo opcional que começa ausente em todos).
- **Penalidades** — 45 processos com filtros, detalhe e CRUD.
- **Prorrogações** — cada contrato tem suas prorrogações (data inicial e final),
  listadas no detalhe e gerenciadas por uma seção no formulário do contrato
  (adicionar/editar/remover).

## Estrutura

```
index.html              página principal
assets/
  styles.css            estilos (tema claro/escuro)
  app.js                interface (lê/grava no store em memória)
  store.js              store em memória, semeado por data/seed.json (CRUD)
package.json            script para subir um servidor estático local
.github/workflows/
  deploy-pages.yml      publica os arquivos estáticos no GitHub Pages
data/
  seed.json             dados do site (contratos, penalidades, prorrogações)
```

## Atualizar os dados

Edite `data/seed.json` e recarregue a página (ou republique no Pages). As chaves
dos dados seguem o padrão EN-US; os valores e a interface permanecem em pt-BR.

## Observações sobre os dados

Os dias até o vencimento e os alertas são **calculados** a partir das datas (data
de referência: 29/09/2026). Um registro com colunas deslocadas na planilha
original (SERPRO 13/2024) vem sinalizado no `seed.json` pelo campo `dirty`.
