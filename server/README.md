# WJ Quant API — scaffold

**Somente demonstração.** Nenhuma operação real.

## Requisitos
Node.js 20+, PostgreSQL.

1. Copie `.env.example` para `.env` e configure DATABASE_URL e SESSION_SECRET.
2. Execute `npm install` dentro de `server`.
3. Execute `npx prisma migrate dev --name init`.
4. Execute `npm run dev`.

A API é isolada do frontend atual. Não habilite exposição pública antes de autenticação e testes de integração. O modelo foi preparado, mas **a integração do dashboard com a API ainda não foi feita**.
