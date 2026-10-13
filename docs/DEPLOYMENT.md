# Publicar a versão demonstrativa

Preparação técnica concluída no código. Nenhum serviço foi contratado, cobrado ou publicado. A publicação em produção depende de autorização explícita.

## Variáveis de ambiente

| Serviço | Variável | Uso |
|---|---|---|
| Frontend | VITE_API_URL | URL pública HTTPS da API, sem barra final. Única variável necessária no frontend. É pública e embutida no build. |
| Backend | DATABASE_URL | Credencial privada PostgreSQL e banco exclusivo de demonstração. Use TLS conforme o provedor e não desabilite validação do certificado. |
| Backend | CORS_ORIGIN | Origem HTTPS exata do frontend. Aceita várias origens separadas por vírgula, sem caminhos ou barra final. Não usar wildcard. |
| Backend | PORT | Porta oferecida pela hospedagem; padrão 4000. Escuta em 0.0.0.0. |
| Backend | NODE_ENV | production na hospedagem; development local. |
| Backend | TRUST_PROXY | 0 por padrão. Use 1 somente se houver exatamente um proxy confiável que sobrescreva X-Forwarded-For. Confirmar com o provedor. |

SESSION_SECRET foi removida do exemplo porque o scaffold não a utilizava. Sessões usam tokens aleatórios de 256 bits com hash SHA-256 persistido no banco, validade de uma hora e revogação no logout. Nenhuma senha ou token deve ser enviado como VITE_*.

## PostgreSQL e backend

1. Escolha uma hospedagem Node.js/container e um PostgreSQL persistente após autorização para eventual custo. Não use o filesystem efêmero do container como banco.
2. Configure as variáveis no painel privado da hospedagem. Use usuário de banco dedicado e backup antes de qualquer atualização.
3. Root directory do backend: server. Build: `npm ci && npm run build`. Release/pre-deploy: `npm run db:migrate`. Start: `npm start`.
4. Alternativa: `docker build -t wj-quant-api ./server`. Dockerfile incluído, mas o build Docker não foi executado neste ambiente sem Docker. Injete variáveis em runtime. Execute `npx prisma migrate deploy` como tarefa única de release antes de iniciar a nova versão.
5. O /health verifica banco, retorna modo simulation e deve responder 200. Falha de banco retorna 503. Não publicar logs contendo DATABASE_URL, tokens ou senhas.
6. Uma única instância da API é o alvo demonstrativo atual. Sessões/saldos suportam múltiplos processos via PostgreSQL, mas os limites de requisição são locais à instância; antes de escalar, use rate limiting compartilhado ou no proxy.

## Migrations

Banco novo: `npm run db:migrate` aplica as duas migrations; `npm run db:status` confirma estado atualizado. Nunca usar migrate reset ou db push em banco com dados importantes.

Banco legado criado com o scaffold/db push: faça backup e confirme que tabelas, índices e relações correspondem exatamente a 202610130001_initial/migration.sql. Se corresponderem, marque apenas a primeira migration como baseline:

```sh
npx prisma migrate resolve --applied 202610130001_initial
npm run db:migrate
npm run db:status
```

A segunda migration preserva usuários, senhas, saldos e movimentações existentes, preenche chaves legacy_ e adiciona sessões e restrições de integridade. O procedimento foi testado em schema descartável com dados legados. Se houver divergência ou saldo não reconciliado, interrompa e investigue; não force o baseline. Sessões antigas em memória expiram na atualização e exigem novo login.

## Frontend na Vercel

1. Após autorização, importe o repositório e selecione o commit/branch revisado. Framework Vite, root directory na raiz, instalação `npm ci`, build `npm run build`, output `dist`; vercel.json contém esses parâmetros.
2. Defina VITE_API_URL para o backend demonstrativo HTTPS em cada ambiente desejado. Refaça o build ao alterar essa variável.
3. Configure CORS_ORIGIN no backend com a origem exata da URL do frontend. Para previews, autorize explicitamente a origem desejada.
4. Não conecte main a deploy automático em produção sem autorização. CI não contém comandos de deploy. Push e merge em projetos já conectados podem disparar builds/publicações automaticamente; revise as configurações do projeto antes de integrar.
5. URLs públicas/localmente acessíveis no celular precisam usar uma API alcançável pelo próprio dispositivo. Nunca usar localhost em build público.

## Validação após hospedagem

Confirme /health, cadastro/login de duas contas, saldo isolado, aporte fictício, retirada, saldo insuficiente, pausa/reativação e dados após reinício do backend. Verifique logout e expiração, CORS e HTTPS. Teste um telefone físico e Safari antes de declarar compatibilidade com esses ambientes.

Pendências operacionais: escolher/autorizar hospedagem, configurar TLS e credenciais privadas, backup e restauração, observar logs/health e executar smoke test nos endereços finais. Recuperação de senha, verificação de e-mail, MFA e execução de investimentos não fazem parte desta demonstração.
