# GitHub → Railway → PostgreSQL → HTTPS

## Repositório e revisão
Use a branch `build/pncp-platform` para homologação até aprovação da PR. Autorize o Railway a acessar o repositório privado. Verifique o commit e a execução de CI antes de promover.

## Banco
Adicione PostgreSQL pelo template Railway, com volume persistente e backups. Não use Postgres sem volume. Vincule a variável `DATABASE_URL` do banco ao serviço web usando a referência fornecida pelo Railway. Não copie credenciais para o Git.

## Aplicação
Serviço a partir do repositório e branch corretos. O Dockerfile instala dependências e faz o build. `railway.toml` usa `npm run db:migrate` no predeploy, `npm start` no start e `/health` no health check. Railway fornece `PORT`.

Defina `NODE_ENV=production` e `APP_URL` com a origem HTTPS real. Gere inicialmente um domínio Railway. Crie o primeiro administrador executando `npm run admin:create` com `ADMIN_EMAIL` e `ADMIN_PASSWORD` temporários; remova a senha do ambiente depois.

## Cron
Outro serviço, mesmo repositório e banco, configurado com `railway.cron.toml`. Start `npm run job:sync`, agendamento `0 * * * *`, sem domínio ou health check HTTP. O cron deve terminar depois de cada execução. Pelo menos duas conexões no pool são necessárias ao lock e trabalho do job. Migrations ficam sob responsabilidade do web para evitar concorrência.

## Providers
IA: `AI_PROVIDER=openai`, `AI_API_KEY`, `AI_MODEL`. E-mail: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Remetente autorizado pelo provedor. Nenhuma credencial está embutida no projeto.

## Checklist de publicação
1. CI aprovado no commit exato.
2. Deploy Railway em SUCCESS e `/health` retornando ok.
3. Login e criação de empresa.
4. Coleta oficial concluída e dados confirmados na fonte.
5. Busca, favorito, tracking e isolamento entre usuários.
6. Alerta criado antes de novas oportunidades; notificação persistida.
7. IA e recuperação de senha testadas com providers reais.
8. Teste de navegação em desktop e celular.

## Domínio próprio
Adicione o hostname escolhido no Railway, copie exatamente os registros DNS informados para o provedor e aguarde validação/certificado. Atualize `APP_URL`. Não há domínio próprio fornecido nesta solicitação; não use `seudominio.com` como domínio real.

## Migrations e rollback
Faça backup verificável antes de atualizar. Revise SQL destrutivo separadamente. Prefira alterações compatíveis com a versão anterior. Rollback da imagem não reverte schema: use migration corretiva ou restauração testada em manutenção. Nunca execute `migrate reset` em produção. A migration inicial cria tabelas e índices; não remove dados existentes.

## Primeiro acesso por convite
Alternativa ao comando administrativo: configurar SETUP_TOKEN_HASH com o SHA-256 de um token aleatório de 32 bytes. Entregar ao proprietário o link /primeiro-acesso#TOKEN por canal privado. O token não é incluído em requisições de navegação nem no repositório. O formulário envia o token para validação e só cria a conta se o banco não tiver usuários; um lock transacional impede duas configurações simultâneas. Depois do uso, o endpoint deixa de aceitar configurações mesmo que o hash permaneça no ambiente. Remova a variável após concluir a configuração.

### Origem/CSRF atrás do proxy Railway
`APP_URL` continua sendo uma origem confiável, inclusive `http://localhost:3000` em desenvolvimento. Para o domínio público do Railway, a validação também aceita a origem HTTPS de `RAILWAY_PUBLIC_DOMAIN` quando os headers `Origin`, `x-forwarded-host` e `x-forwarded-proto` coincidem exatamente após normalização. Essa variável deve conter somente o hostname atribuído ao serviço, sem esquema ou caminho (neste ambiente: `pncp-intelligence.up.railway.app`). O Railway normalmente fornece essa variável; se ausente, use `APP_URL` com a URL pública correta. Domínios personalizados devem usar `APP_URL`.

Não são aceitos hosts arbitrários, curingas de `railway.app`, listas separadas por vírgula, credenciais em URLs, caminhos em Origin ou fallback de proxy sem domínio configurado no servidor. Não inferimos confiança apenas de `Host` ou de headers fornecidos pelo cliente. A validação preserva o acesso por APP_URL mesmo sem headers de proxy. Referência dos headers: https://docs.railway.com/networking/public-networking/specs-and-limits.
