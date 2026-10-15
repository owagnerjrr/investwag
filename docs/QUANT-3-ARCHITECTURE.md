# WJ Quant 3.0 — arquitetura e execução

Base: main a0cc11b, 15/10/2026. Desenvolvimento em codex/wj-quant-3; sem deploy, merge, alteração de planos, banco publicado ou segredos de produção.

## Plano em blocos

1. Auditoria/contratos; 2. fontes e cache compartilhado; 3. seleção walk-forward limitada; 4. Guard e livro piloto; 5. persistência/transações/execução; 6. scheduler externo limitado; 7. painel simples e alertas; 8. testes/upgrade/CI/documentação/PR. Commits separados, preservando rotas anteriores.

## Compatibilidade e capital

Carteira v1 exige cash = contributed - withdrawn no banco. V2 usa capital independente por sessão. Não mudar esses contratos ou importar/duplicar saldos. V3 usa PilotAccount e PilotEvent próprios, inicialmente zerados. A ativação única autoriza apenas paper fictício. O painel identifica esse capital separado e mantém acesso completo às versões anteriores. Patrimônio piloto = aportes - retiradas + realizado + não realizado; caixa = aportes - retiradas + realizado - custo das posições. Retirar somente caixa disponível, sem venda compulsória. Resultado não é aporte.

## Fluxo

Catálogo limitado e revisado por proprietário → conectores read-only → cache diário PostgreSQL (compartilhado entre usuários) → seleção cronológica de no máximo duas SMAs → Guard consolidado da conta → fill hipotético na observação seguinte → transação do estado/checkpoints/eventos. Nenhum adaptador financeiro de execução, URL externa fornecida pelo usuário ou credencial bancária.

Fontes: Frankfurter referência (somente pesquisa, nunca execução); CoinGecko Demo opcional para BTC/ETH em BRL, incluindo volume reportado; brapi para universo brasileiro restrito se histórico gratuito válido estiver disponível. ETFs/FIIs/internacionais sem contrato adequado permanecem indisponíveis, explicitamente. Nada de scraping sem termos ou dados inventados. Dados revisados não substituem observações já persistidas silenciosamente.

## Automação sem navegador

Job diário externo faz trabalho útil, sem keep-alive. GitHub Actions com runner padrão público, schedule diário fora da hora cheia, workflow_dispatch e flag de repositório desligada por padrão. Endpoint interno assinado HMAC, janela temporal, chave de ciclo persistida, bloqueio transacional e limite de contas por tick. Nunca executa por abrir o painel. Checkpoints/lastRun/nextRun no banco; heartbeat atrasado gera alerta visível. Não promete 24/7. Nenhum secret é criado/configurado externamente nesta fase.

Quotas: catálogo pequeno, cache global persistente e cooldown diário, timeout/limite de payload, lote máximo 50 datas e 5 contas por tick, máximo 500 eventos por conta (sem apagar histórico; proteção ao atingir limite), curva limitada, circuit breaker de três falhas. Agendamento suspenso/exaurido não é recuperado por pings artificiais.

## Segurança e recuperação

Flags PILOT_ENABLED e VITE_PILOT_ENABLED fechadas. Auth e userId da sessão, row lock da conta, resultados idempotentes por usuário/chave e cycle/dia, saída sem tokens/dados pessoais. Política de risco ajustável apenas em variável de ambiente do proprietário, validada e limitada conservadoramente. Pausa/emergência serializadas com lote atômico; emergência não admite resume. Pausa global v1 também bloqueia ordens do piloto. Ledger e fills inteiros; inconsistência impede commit. Falha de dados/estratégia protege caixa e mantém consultas.

Migrations aditivas em banco local _test. Baseline v1/v2, schema diff e registros originais verificados. Rollback de código/flags mantém novas tabelas, sem down migration nem reset.
