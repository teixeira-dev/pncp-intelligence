# Inteligência artificial

`AIProvider` desacopla o fornecedor. Implementação inicial OpenAI, com chave e modelo no servidor. Entrada: objeto público, informações complementares limitadas a 20.000 caracteres e URL oficial. Não envia nome/e-mail do usuário nem dados privados da empresa.

O prompt trata texto oficial como entrada não confiável e proíbe seguir instruções nele contidas. Exige fatos fornecidos, indica dados ausentes e proíbe afirmar habilitação jurídica ou leitura de editais não fornecidos.

Resultado: resumo e objeto (strings), requisitos, datas, valores, documentos, riscos e próximos passos (listas). Zod limita estrutura, tamanho e quantidade. Validação estrutural não prova correção factual.

Timeout 45s, até 2.000 tokens de saída e dez solicitações por usuário/hora. Cache por usuário, oportunidade, hash, provider, modelo e versão. Alterações no conteúdo permitem nova análise. Não há análise em massa automática. Custos dependem do modelo escolhido na conta do usuário.

Sem chave/modelo, o recurso fica explicitamente indisponível. Erros não geram resultado simulado. Documentos não fornecidos ao modelo não são considerados lidos. Análise automatizada serve à triagem: requisitos e decisões devem ser conferidos no edital original.

## Documentos PDF
A solicitação de análise de um PDF oficial gera tarefa no cron. O download aceita somente a rota oficial PNCP, não segue redirecionamentos e limita o arquivo a 10 MB. Poppler extrai texto de até 40 páginas em processo com timeout; no máximo oito trechos de 5.000 caracteres são enviados ao modelo. O resultado indica páginas analisadas e se a cobertura foi limitada. PDFs sem camada textual exigem OCR, não implementado nesta versão; a tarefa falha explicitamente e aparece no histórico. A entrada e o arquivo temporário são removidos após extração. O resultado fica em AIAnalysis com hash do arquivo e versão 2.

Referências por página são adicionadas pelo código. O provider real ainda precisa ser testado com a chave/modelo do usuário. Limite: três solicitações de documento por usuário/hora, até oito chamadas por documento. Nunca interpretar a análise parcial como leitura integral do edital.
