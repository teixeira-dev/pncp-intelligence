# Estado e limites

Código em homologação na PR #1. Não é a conclusão de todos os requisitos do escopo original.

## Evidências locais
Instalação, lint, TypeScript, build Next.js e 13 testes unitários passaram na primeira rodada de correções. Quatro testes PostgreSQL dependem do CI. As verificações são repetidas quando o código muda; o commit final deve ser conferido no Actions.

## Entregas adicionadas
Paginação e ordenação SQL sem carregar todos os IDs, lockfile, dependências atualizadas, consulta PNCP por atualização, modalidades oficiais, importação de itens e metadados de documentos sob demanda, documentação e smoke HTTP com isolamento de contas.

## Pendências materiais
- Sincronização PNCP real completa: API apresentou timeout e 503.
- Extração e análise de PDF/OCR, referências por trecho e cache de documento.
- Relatórios completos e exportações (somente distribuição por UF inicial).
- Testes de navegador e inspeção visual mobile.
- Providers reais de IA/SMTP e domínio próprio.
- Homologação do deploy web, banco e cron.
- Tratamento de concorrência para evitar custo de chamadas simultâneas de IA.
- Paginação completa de histórico/admin/notificações (atualmente limites fixos).
- Política automática de retenção de sessões/logs.
- SMTP é entrega at-least-once: uma queda entre envio e confirmação pode repetir um e-mail. A notificação interna é única.

O banco compartilhado contém dados oficiais públicos; empresas e demais dados privados respeitam vínculos e ownership. Não existem credenciais padrão nem mocks de produção.
