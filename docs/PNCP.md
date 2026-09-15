# Integração oficial PNCP

## Contratos consultados
Em 14/09/2026 os seguintes contratos OpenAPI foram obtidos e inspecionados diretamente:
- https://pncp.gov.br/api/consulta/v3/api-docs
- https://pncp.gov.br/api/pncp/v3/api-docs

## Endpoints utilizados
| Endpoint | Finalidade |
|---|---|
| `/api/consulta/v1/contratacoes/atualizacao` | Sincronização incremental por atualização, inclusive de publicações antigas |
| `/api/consulta/v1/contratacoes/publicacao` | Consulta por publicação, disponível no client |
| `/api/pncp/v1/modalidades` | Códigos oficiais; evita lista numérica inventada |
| `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens` | Itens paginados |
| `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos` | Metadados de documentos paginados |
| `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos/{sequencialDocumento}` | Link ao documento original |

Host fixo `https://pncp.gov.br`. Consulta usa `dataInicial`, `dataFinal` (AAAAMMDD), `codigoModalidadeContratacao`, `pagina` e `tamanhoPagina=50`. Itens e arquivos usam paginação de 50. As respostas têm validação Zod.

## Normalização
ID único: numeroControlePNCP. Órgão: orgaoEntidade.cnpj e razaoSocial. Objeto: objetoCompra. Complemento: informacaoComplementar. Valores: Decimal(20,2); datas opcionais: null quando ausentes. Datas sem timezone são interpretadas como UTC-03:00. Resposta original fica em JSONB. Score e tracking não alteram dados oficiais.

## Idempotência e retomada
Upsert transacional por ID oficial, hash do conteúdo e constraints únicas. Registros iguais não são regravados. Cursor por janelas de até sete dias, com sobreposição de dois dias. A consulta de atualização também contempla mudanças em publicações antigas. A primeira execução limita a janela inicial; não importa todo o histórico nacional.

## Resiliência
Timeout de 45 segundos, três tentativas para rede/429/5xx, backoff e intervalo entre páginas. Falha deixa dados existentes disponíveis e aparece em SyncJob/SyncLog. O cursor só avança depois da janela completa. Lock PostgreSQL impede sobreposição de coletores.

## Enriquecimento
Solicitação na oportunidade gera job. O cron busca itens/documentos e só substitui os registros depois de validar todas as páginas. Limite de 200 páginas por recurso; exceder falha explicitamente preservando os dados anteriores. Valores de itens sigilosos não são expostos como estimativas. Downloads de documentos não são automaticamente interpretados pela IA.

## Homologação externa
Os contratos e modalidades foram consultados com sucesso. As tentativas de consultar contratações durante o desenvolvimento tiveram timeout e HTTP 503. Isso não comprova uma coleta completa funcionando. Verificar uma sincronização bem-sucedida em produção antes de declarar dados atualizados.

## Retomada por modalidade e página
A tabela `SyncPartition` mantém janela fixa, próxima página, último período concluído e próxima tentativa por modalidade. Cada página e seu checkpoint são gravados juntos, em transação. Uma falha conserva a página pendente; registros já confirmados não são reinseridos. Janelas de até sete datas mantêm sobreposição de dois dias ao iniciar um novo período, pois a paginação da fonte pode mudar durante a coleta. O cursor legado permanece intacto, mas o novo coletor usa partições independentes.

Limites usados pelo cron: 25 páginas, 5 por modalidade e 4 minutos para iniciar novas consultas. Chamadas são sequenciais e separadas por pelo menos dois segundos. Há até três tentativas, timeout de 45 segundos por chamada, espera de 5/10 segundos em falhas transitórias e 30/60 segundos para HTTP 429 sem Retry-After. Retry-After aceita segundos ou data HTTP; se exceder 60 segundos, a chamada é adiada para outra execução sem esperar menos que o servidor pediu. O cooldown é persistido e bloqueia novas chamadas no próximo job.

Falha individual mantém sua partição pendente e permite trabalhar nas demais, exceto durante cooldown global. HTTP 422 não é interpretado como resposta vazia nem ignorado: modalidade, página e janela ficam nos logs para diagnosticar a requisição. O catálogo de modalidades é reaproveitado por até sete dias; em falha transitória, o catálogo já persistido permanece utilizável. A execução termina como `PARTIAL` quando há pendências ou limites atingidos. Matching e alertas processam os dados disponíveis mesmo após uma coleta parcial. `SUCCESS` exige que todas as partições da rodada sejam concluídas; indisponibilidade externa continua podendo impedir a carga completa.

Antes de atualizar o coletor em produção, executar `npm run db:migrate` para criar `SyncPartition`. A migration é aditiva e não remove licitações ou cursores anteriores.

## Itens e documentos automáticos
O mesmo job busca itens e metadados/links dos documentos oficiais, sem exigir ação manual. `detailsHash` é comparado ao conteúdo oficial para identificar oportunidades novas/alteradas e também completar o acervo antigo. São processadas até 150 oportunidades por execução, com orçamento de 8 minutos para iniciar novas oportunidades e respeito ao cooldown do PNCP. O preenchimento é gradual; a interface indica pendência, última importação e falhas temporárias.

Nenhum PDF é baixado automaticamente: são importados os links e títulos oficiais para acesso e análise sob demanda. Itens e documentos são validados antes de qualquer substituição; falhas preservam o conjunto anterior. Identificadores internos de documentos são estáveis entre atualizações. Valores sigilosos permanecem ocultos. Nova tentativa fica persistida por oportunidade. O texto exibido é o objeto/informação complementar oficial com formatação de espaços e quebras de linha, sem inferir requisitos ou inventar resumos.

## Frequência e prioridade (atualização)
O coletor passa a executar a cada 15 minutos. A consulta de novas oportunidades é feita no máximo uma vez por hora, com até 25 páginas/4 minutos de início de novas chamadas por rodada. Nas demais rodadas o foco são os detalhes pendentes. O lote de detalhes passa de um teto de 50 por hora para até 150 por execução, limitado a 8 minutos de início de novas oportunidades. Chamadas em andamento e retries podem prolongar a rodada; o Railway não inicia outra execução do mesmo cron enquanto a anterior estiver ativa.

Em três de cada quatro rodadas, oportunidades visualizadas e favoritadas vêm primeiro; a quarta prioriza as mais antigas para completar o acervo. Abrir o detalhe registra uma prioridade idempotente, sem executar chamadas externas na requisição do usuário. O cooldown e o intervalo entre chamadas continuam preservados. Esses limites são tetos, não promessa de velocidade: o tempo de resposta do PNCP determina a quantidade efetivamente concluída.
