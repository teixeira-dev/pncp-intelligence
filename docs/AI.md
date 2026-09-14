# Inteligência artificial

`AIProvider` desacopla o fornecedor. Implementação inicial OpenAI, com chave e modelo no servidor. Entrada: objeto público, informações complementares limitadas a 20.000 caracteres e URL oficial. Não envia nome/e-mail do usuário nem dados privados da empresa.

O prompt trata texto oficial como entrada não confiável e proíbe seguir instruções nele contidas. Exige fatos fornecidos, indica dados ausentes e proíbe afirmar habilitação jurídica ou leitura de editais não fornecidos.

Resultado: resumo e objeto (strings), requisitos, datas, valores, documentos, riscos e próximos passos (listas). Zod limita estrutura, tamanho e quantidade. Validação estrutural não prova correção factual.

Timeout 45s, até 2.000 tokens de saída e dez solicitações por usuário/hora. Cache por usuário, oportunidade, hash, provider, modelo e versão. Alterações no conteúdo permitem nova análise. Não há análise em massa automática. Custos dependem do modelo escolhido na conta do usuário.

Sem chave/modelo, o recurso fica explicitamente indisponível. Erros não geram resultado simulado. Documentos não fornecidos ao modelo não são considerados lidos. Análise automatizada serve à triagem: requisitos e decisões devem ser conferidos no edital original.
