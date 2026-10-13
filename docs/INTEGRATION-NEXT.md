# Integração do painel com a API

O backend existente em `server/server.js` oferece cadastro, login, carteira e movimentações simuladas, mas o painel em `src.jsx` permanece isolado e funciona somente no navegador.

Foi criado `api-client.js` para centralizar chamadas HTTP sem expor segredos no repositório. **Ele ainda não está conectado ao dashboard.**

## Antes de ativar
- Rodar `npm install` e `npm run build` na raiz.
- Rodar `npm install`, `npx prisma migrate dev` e `npm start` em `server/` com PostgreSQL e variáveis de ambiente válidas.
- Verificar os testes de integração e proteção de autenticação.
- Substituir sessões em memória por sessões duráveis com revogação, política de expiração e limites específicos para login.
- Implementar login no painel e tratamento de expiração, carregamento e erros.
- Manter o token de sessão apenas em memória (não em localStorage).
- Nunca conectar uma corretora ou movimentar dinheiro real nesta fase.

## Nota
O backend ainda é experimental. Não disponibilizar publicamente sem auditoria de segurança.
