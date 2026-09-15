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
