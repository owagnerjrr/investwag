# Estado de implementação — 13/10/2026

## Entregue na versão demonstrativa

- Painel React/Vite integrado à API, responsivo, com cadastro/login/logout e tratamento de carregamento, rede e expiração.
- Carteira PostgreSQL por usuário, inicialmente zerada e pausada.
- Aportes e retiradas fictícios em centavos BigInt, validação de valores e saldo, transação atômica e bloqueio por carteira.
- Idempotência opcional na API e usada pelo painel para repetir respostas incertas sem duplicar movimentos.
- Histórico das últimas 100 movimentações; todo o histórico permanece no banco.
- Pausa/reativação persistente. Não existe execução de investimentos nesta versão; movimentações fictícias continuam permitidas durante a pausa.
- Sessões persistidas somente como hash de token, expiração de uma hora e revogação.
- Migrations versionadas, validação de upgrade legado e testes de integração e E2E.
- Livro-caixa local legado preservado, testado e protegido contra overflow; não é a fonte de dados do painel autenticado.
- Configuração de build para Vercel, Dockerfile do backend e CI sem deploy.

## Fora do escopo

Motor de investimentos, scanner, dados de mercado, PaperBroker, ordens, posições, corretoras e operações reais. O roadmap permanece futuro e não foi iniciado.

## Limites

Tokens ficam apenas em memória do navegador: recarregar a página exige login, mas preserva todos os dados. Não há recuperação de senha, verificação de e-mail ou MFA. Rate limiting é local à instância. Histórico visível limitado a 100 registros. Hospedagem/TLS/backups e telefone físico precisam ser validados nos endereços finais.
