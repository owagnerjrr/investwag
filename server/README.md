# WJ Quant API demonstrativa

Express + Prisma + PostgreSQL. Node.js 22 LTS e PostgreSQL 16+. Somente dados fictícios, sem corretoras.

```sh
npm ci
cp .env.example .env
# Configure DATABASE_URL e CORS_ORIGIN.
npm run build
npm run db:migrate
npm run dev
```

Na hospedagem, variáveis são injetadas pelo provedor e `npm start` inicia o serviço. Execute `npm run db:migrate` como release antes do start, sem reset. A carteira começa em zero/pausada. Cadastro exige senha de 12 a 72 bytes; senha é hash bcrypt. Tokens são aleatórios e persistidos somente como hash SHA-256. Não existe SESSION_SECRET em uso.

```sh
npm test
# DATABASE_URL de teste: banco cujo nome termina em _test
npm run test:integration
```

Teste de integração usa HTTP real e PostgreSQL, concorrência, novo processo da API e migração do schema legado. Veja ../docs/TEST-STATUS.md e ../docs/DEPLOYMENT.md para resultados e publicação.
