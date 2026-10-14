# Integração do painel com a API

Contrato v1 preservado. Novas rotas autenticadas `/quant` estão documentadas em [QUANT-2.md](QUANT-2.md) e exigem habilitação explícita; não transferem saldo desta carteira.

A integração está ativa em src.jsx através de api-client.js. O frontend usa VITE_API_URL; não armazena senhas ou tokens no localStorage. O token vive somente em memória, expira no servidor em uma hora e é revogado por /auth/logout.

Rotas:

- GET /health — saúde da API e PostgreSQL, modo simulation.
- POST /auth/register — e-mail e senha; cria carteira zero/pausada.
- POST /auth/login — retorna token Bearer e expiresIn.
- POST /auth/logout — revoga o token atual.
- GET /portfolio — saldo e últimas 100 movimentações do usuário autenticado.
- POST /portfolio/movements — type DEPOSIT/WITHDRAW e amount string decimal, máximo duas casas. Aporte mínimo R$ 10. Limite por operação e total aportado: R$ 1 bilhão fictício.
- POST /portfolio/pause — paused boolean, somente carteira do usuário autenticado.

Idempotency-Key em movimentações aceita 8 a 100 caracteres alfanuméricos, hífen ou underscore. Mesma chave e conteúdo: retorna operação existente (200); conteúdo diferente: 409. Sem chave, mantém compatibilidade com clientes antigos e gera chave no servidor; esses clientes devem fornecer chave para repetir com segurança.

O banco é a fonte de verdade. O painel atualiza o saldo após cada ação e oferece atualização manual para alterações feitas em outro dispositivo. Não há atualização automática entre abas. Movimentos, saldo e preferência de pausa persistem após reinício. Sessões também persistem no backend, mas a página recarregada solicita login porque o token não fica em armazenamento durável no navegador.

Todas as movimentações são simuladas. Reativar não inicia o próximo bloco de investimentos. Consulte DEPLOYMENT.md para variáveis e configuração.
