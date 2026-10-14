# WJ Quant — demonstração

Carteira demonstrativa React/Vite com API Express, PostgreSQL e Prisma. Cadastro, login, saldo por usuário, aportes/retiradas fictícios, histórico e controle de pausa funcionam em desktop e celular.

**Somente simulação. Sem dinheiro real, corretoras ou promessa de lucro.** Esta branch adiciona scanner de taxas públicas, estratégia SMA, Guard, backtest e paper trading fictício. Os módulos 2.0 ficam desabilitados por padrão; a carteira demonstrativa e seus saldos/sessões são preservados. Reativar a carteira não executa operações automaticamente.

Veja [WJ Quant 2.0](docs/QUANT-2.md) para habilitar o laboratório local, entender as fontes/limites e revisar o procedimento de publicação e rollback. Não há deploy de produção nesta fase.

## Executar localmente

Requisitos: Node.js 22 LTS, npm e PostgreSQL 16+. Os lockfiles estão versionados.

Frontend, na raiz:

```sh
npm ci
cp .env.example .env
npm run dev
```

Backend, em outro terminal:

```sh
cd server
npm ci
cp .env.example .env
# Configure DATABASE_URL e CORS_ORIGIN no arquivo, sem versionar credenciais.
npm run build
npm run db:migrate
npm run dev
```

Crie previamente um banco exclusivo de demonstração. A API escuta na porta 4000 e o Vite na 5173. Abra o frontend, crie uma conta com senha de 12 a 72 bytes e faça um aporte fictício de pelo menos R$ 10. A carteira começa zerada e pausada.

Para acessar pelo celular na mesma rede, use o IP do computador no VITE_API_URL, autorize a origem exata do frontend em CORS_ORIGIN e permita as portas na rede local. Não use localhost como endereço da API no celular. Em hospedagem, frontend e backend devem usar HTTPS.

## Testar

```sh
npm test
npm run build
cd server
npm run build
npm test
# DATABASE_URL deve apontar para um banco dedicado cujo nome termina em _test.
npm run db:migrate
npm run test:integration
cd ..
npx playwright install chromium
npm run test:e2e
```

Use um banco _test, nunca dados de usuários, para integração/E2E. Configure DATABASE_URL no ambiente do terminal antes dos testes. Os testes criam contas com prefixos únicos e removem apenas suas próprias contas. O teste de upgrade cria e remove um schema temporário nesse banco.

A suíte E2E inicia a API e o preview do build, nas portas 4000/5173. Execute o build antes. Desktop e Pixel 7 são testados em Chromium; o teste também verifica largura de 320 px. Isso não substitui teste em aparelho físico ou Safari.

## Publicação

Veja [DEPLOYMENT.md](docs/DEPLOYMENT.md) para Vercel, backend, variáveis, migrations e validação após publicação. A CI apenas valida; não publica serviços. O deploy em produção precisa de autorização.

## Documentação

- [Resultado dos testes](docs/TEST-STATUS.md)
- [Estado implementado](docs/IMPLEMENTATION-STATUS.md)
- [Integração atual](docs/INTEGRATION-NEXT.md)
- [Segurança](docs/SECURITY.md)
- [Segurança financeira](docs/FINANCIAL-SAFETY.md)
- [Arquitetura e módulos futuros](docs/ARCHITECTURE.md)
- [Roadmap futuro — não iniciado](docs/ROADMAP.md)
