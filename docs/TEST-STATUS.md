# Validação — 13/10/2026

## Limitações atuais
- Não foi possível instalar pacotes neste ambiente: acesso a registry.npmjs.org indisponível (EAI_AGAIN).
- Portanto, **não há comprovação de build ou integração end-to-end bem-sucedida**.
- Workflow GitHub Actions criado para executar npm test, build, prisma validate, prisma generate, inicialização de schema em PostgreSQL e checagem de sintaxe.
- Os testes automatizados existentes são unitários de ledger; não cobrem fluxo completo de cadastro, login, movimentação e concorrência.

## Pendências para liberar teste hospedado
1. Confirmar que CI passa.
2. Executar testes reais de cadastro, login, autorização, isolamento entre usuários, saques concorrentes e persistência após reinício.
3. Implantar banco e backend de demonstração, configurar CORS e VITE_API_URL.
4. Proteger cadastro e login contra abuso e substituir sessões em memória por mecanismo durável.
5. Testar navegador e celular.

**Não utilizar para operações reais.**
