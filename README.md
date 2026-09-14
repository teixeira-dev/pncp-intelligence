# PNCP Intelligence

Plataforma modular de inteligência para contratações públicas, em homologação.

## Objetivo
Coletar dados oficiais, organizar oportunidades e comparar perfis comerciais com regras explicáveis. A análise automatizada não substitui a leitura do edital.

## Stack e arquitetura
Next.js 16, React 19, TypeScript, Tailwind 4, Lucide, Prisma 6 e PostgreSQL. Monólito modular com processos web e cron compartilhando o código. Não depende de Redis, filas externas ou computador pessoal ligado.

## Funcionalidades
Autenticação e sessões revogáveis; empresas por organização; oportunidades e filtros paginados; matching determinístico; favoritos e status internos por usuário; alertas e notificações; análise de IA sob demanda; administração e logs de sincronização. A lista de verificações e limites está em [STATUS.md](docs/STATUS.md).

## Estrutura
- `src/app`: rotas, layouts, API e health check.
- `src/components`: interface e formulários.
- `src/lib`: regras, segurança e integrações.
- `prisma`: schema e migrations SQL.
- `scripts`: jobs, primeiro administrador e seed.
- `tests`: testes unitários e PostgreSQL.
- `.github/workflows`: CI.

## Requisitos e instalação
Node.js 22 e PostgreSQL 16. Enquanto a PR estiver em revisão, selecione a branch `build/pncp-platform`.

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

Configure `DATABASE_URL` e `APP_URL` em `.env`. Em desenvolvimento a origem é `http://localhost:3000`; em produção use exclusivamente a URL HTTPS real.

## Primeiro administrador
Defina temporariamente `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12–72 caracteres) e opcionalmente `ADMIN_NAME` no ambiente e execute `npm run admin:create`. Não há credencial padrão. Remova a senha do ambiente depois. O comando não altera contas existentes. Para scripts locais que precisam de `.env`, use `node --env-file=.env --import tsx scripts/admin.ts`.

## Variáveis
`DATABASE_URL`, `APP_URL`, `PNCP_BASE_URL`, `PNCP_INITIAL_DAYS`. IA opcional: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`. E-mail: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Veja `.env.example`; nunca versione valores reais.

## PostgreSQL, migrations e seed
`npm run db:migrate` aplica somente migrations versionadas. Valores monetários usam Decimal. IDs oficiais têm constraint única. O índice GIN atende à busca textual em português. Não use `db push` ou `migrate reset` em produção.

Seed: somente `NODE_ENV=development`, `ALLOW_DEV_SEED=yes` e `ADMIN_PASSWORD` definido, com `npm run db:seed`. Cria conta de demonstração; não fabrica registros oficiais.

## Desenvolvimento e testes
```bash
npm run lint
npm run typecheck
npm test
RUN_INTEGRATION=1 npm test
npm run build
npm start
```
Use banco descartável para integração. CI aplica migrations, executa lint, typecheck, testes, build e health check. Nunca trate testes simulados como homologação de API oficial.

## Deploy Railway e cron
[DEPLOY.md](docs/DEPLOY.md) descreve GitHub, PostgreSQL, web, cron, migrations, health e domínio. Web usa `npm start`; cron usa `npm run job:sync` e encerra após concluir. O endpoint `/health` verifica o banco sem expor informações sensíveis.

## PNCP e IA
[PNCP.md](docs/PNCP.md) documenta contratos, normalização e sincronização. [AI.md](docs/AI.md) descreve dados enviados, limites e cache. Sem provedor configurado, IA informa indisponibilidade; não há análise fictícia.

## Segurança
Validação Zod no servidor, autorização por organização/usuário, sessões opacas armazenadas como hash, bcrypt, rate limiting PostgreSQL, cookies HttpOnly/SameSite e Secure em produção, validação de Origin, consultas parametrizadas e texto externo escapado pelo React.

## Troubleshooting
- Health falha: verificar banco e migrations.
- Login rejeita origem: `APP_URL` precisa coincidir com a origem do navegador.
- Base vazia: verificar cron e logs PNCP.
- Sem recomendações: configurar termos e aguardar processamento do perfil.
- IA/e-mail indisponíveis: configurar provedores e conferir logs sem secrets.
