# WJ Quant 2.0 — arquitetura e auditoria

Referência auditada: main baa3ebe108d69c60566c07f31b28ce77312fd60c, 14/10/2026. React/Vite na raiz, Express/Prisma em server; autenticação opaca e carteira por usuário preservadas. PostgreSQL local _test para validação; nenhuma alteração no banco publicado.

## Compatibilidade

As rotas /auth e /portfolio, saldos BRL, sessões e CashMovement continuam com seus contratos. O namespace /quant reutiliza o middleware de autenticação e aplica userId da sessão em todas as consultas. Novas tabelas são aditivas. Paper trading usa capital virtual independente em BRL, sem transferir aportes da carteira. A pausa global da carteira também bloqueia o motor; controles da sessão e emergência são adicionais.

## Domínio e dados

server/quant: indicadores puros, estratégia versionada de cruzamento SMA, Guard independente, execução fictícia em inteiros, backtest e checkpoint. Rotas persistem ativos monitorados, observações com origem/data/hash, análises, estratégias, sessões, decisões e resultados. Sem SDK de corretora, chaves financeiras, ordens reais ou AI.

Fonte inicial: Frankfurter v2, taxas diárias de câmbio BRL por USD/EUR/GBP/JPY/CHF/CAD, fontes identificadas na resposta. https://frankfurter.dev/ documenta uso gratuito, histórico e cache. Feed blended, licença gratuita para uso; não consultar endpoints privados nem endpoints de execução. Não representa preço negociável nem investimento disponível. Volume, bid/ask e liquidez desconhecidos: null, nunca inventados. Guard pode exigir liquidez e bloquear esses dados; simulação de taxas de referência requer opção explícita de aceitar liquidez desconhecida.

## Execução e viés

Sem loops/cron/keep-alive. Cada chamada manual processa no máximo 50 observações; checkpoints e eventos ficam na mesma transação com bloqueio da sessão. Sinal calculado somente até a observação anterior, executado na próxima taxa diária disponível. Não fabricar OHLC ou preencher feriados. Hash do dataset e versão/configuração da estratégia registrados. Paper inicia no último dado conhecido e só processa observações posteriores; replay histórico pertence ao backtest.

Custos/slippage em basis points, quantidades em microunidades, preço em milionésimos BRL e livro de simulação em centavos BigInt. Arredondar custo para cima e crédito para baixo. Long-only, um ativo por sessão, sem alavancagem. Exposure/concentração, perda diária, liquidez, operações/dia e pausa avaliados antes de toda intenção. Vendas que reduzem risco não dependem dos limites de exposição, mas obedecem pausa/emergência e qualidade do dado.

## Limites

Até 10 ativos e 10 estratégias por usuário, 10 sessões, 20 backtests, 1000 observações por ativo, 1000 decisões por sessão, 50 análises por ativo. Recusar criação adicional sem apagar histórico automaticamente. Ingestão de até 366 dias por chamada com timeout/limite de resposta e cache de 15 minutos. Registros imutáveis para dados já usados: correções do fornecedor exigem novo dataset explicitamente, nunca reescrever resultados existentes.

## Entrega

Commits separados: arquitetura; scanner/schema; estratégia; Guard; backtest; paper/checkpoints; dashboard; integração/segurança; documentação. CI com PostgreSQL separado, unitários, integração/concurrency, migrations e E2E desktop/celular. PR para main; sem merge/deploy nesta missão. Vercel publica main automaticamente: manter branch até autorização explícita. Rollback de código preserva tabelas aditivas, sem down migration/reset.
