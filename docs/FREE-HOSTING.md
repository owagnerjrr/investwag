# Implantação gratuita — WJ Quant

Alvo: Vercel Hobby, Render Free e Neon Free, para uma pessoa usando dados fictícios. Nenhum cartão, upgrade automático, recurso pago, corretora ou motor de investimentos.

## Render

render.yaml declara somente um serviço web Free, sem banco Render, disco, worker ou cron. Não usar Blueprint se solicitar cartão. O painel/API pode ser usado para criar o mesmo serviço manualmente.

Pasta server. Instalação/build: npm ci --no-audit --no-fund && npm run build. Start: npm run start:render, que aplica migrations versionadas sem reset antes de iniciar o Node. Free não oferece shell ou job de pre-deploy; por isso as migrations estão no startup. Na criação pela integração que não suporta rootDir, os comandos começam com cd server.

PORT é fornecida pelo host. GET /health consulta o PostgreSQL e retorna mode simulation. DATABASE_URL privada aponta somente ao Neon com sslmode=require, connect_timeout=30, connection_limit=3 e pool_timeout=30. CORS_ORIGIN autoriza exclusivamente https://investwag.vercel.app. NODE_ENV=production, NODE_VERSION=22.23.3. TRUST_PROXY=0 mantém o comportamento conservador original: não confiar em cabeçalhos de IP sem comprovar a cadeia de proxies. Os limites podem ser compartilhados entre clientes pelo IP do proxy; isso é aceitável para a demonstração pessoal e deve ser revisado antes de escalar. A biblioteca pode registrar aviso sobre X-Forwarded-For; isso não desativa o limite.

A inicialização repete apenas falhas transitórias de conexão do banco, até seis tentativas. O frontend consulta GET /health antes de enviar ações, aguarda o despertar por até aproximadamente dois minutos e informa o usuário. POSTs não são repetidos automaticamente. Movimentações conservam a mesma chave idempotente após uma resposta incerta ou falha na atualização do saldo.

## Vercel

Reutilizar o projeto investwag existente em Wagner's projects, plano Hobby. Vite, raiz do repositório, npm ci, npm run build, saída dist. VITE_API_URL=https://wj-quant-api.onrender.com, somente configuração pública. Nenhuma DATABASE_URL ou senha no frontend. A aplicação tem uma única rota de painel/login; recarregar a URL exige novo login e preserva os dados.

## Neon

Projeto wj-quant na organização Wagner, plano Free, PostgreSQL 16, região AWS us-east-1, banco wjquant. Dados e sessões persistem no PostgreSQL, nunca no filesystem efêmero Render. Aplicar prisma migrate deploy, nunca migrate reset ou db push em dados existentes.

Condições consultadas em 13/10/2026: o site Neon anuncia Free sem cartão; a conta acessível é Free e o projeto concreto informou limite de 512 MiB e janela de histórico de 6 horas. Não presumir que os limites anunciados sejam iguais aos concedidos na conta. Usar os valores mostrados no projeto e monitorar quotas sem upgrade.

## Backup e recuperação sem custo

Antes de atualizações, usar pg_dump com formato custom (-Fc), conexão TLS e credencial no ambiente/arquivo privado; nunca colocar a senha na linha de comando ou nos logs. Salvar o dump localmente em diretório protegido, fora do Git. Conferir com pg_restore --list.

Para ensaiar recuperação, criar um banco vazio separado no plano Free e executar pg_restore --no-owner --no-acl contra ele; nunca sobrescrever o banco demonstrativo sem autorização. Validar tabelas, contagens e login após restaurar. O histórico Instant Restore disponível na conta é curto e não substitui backup independente. Não ativar snapshots agendados ou recursos pagos sem conferir elegibilidade.

## Manutenção

Logs: Render > serviço wj-quant-api > Logs; Vercel > investwag > Deployments/build logs; Neon > projeto > Monitoring. Não publicar dumps, credenciais, tokens, senhas ou arquivos de ambiente.

Atualizações: branch de trabalho, testes/build, PR e CI aprovada, integração revisada na main. O Render tem auto-deploy desligado e deve receber deploy manual após CI. A Vercel conectada à main publica ao receber novos commits; confirmar variáveis antes de integrar.

Sem keep-alive, pings artificiais ou tentativa de impedir a suspensão do Free. Render suspende após 15 minutos ocioso e pode levar cerca de um minuto para voltar. Sem cartão, esgotar quotas de tráfego/build suspende serviço/build, em vez de cobrar. Os serviços gratuitos não oferecem garantia de disponibilidade.

Fontes oficiais:
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://neon.com/pricing
- https://neon.com/docs/guides/prisma
- https://neon.com/docs/manage/backup-pg-dump
- https://vercel.com/docs/plans/hobby

Resultados e URLs efetivamente verificados devem constar no relatório de implantação; este documento não é prova de que o sistema já está publicado e funcionando.
