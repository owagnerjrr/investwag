# WJ Quant 2.0 — módulos e operação

Esta branch implementa laboratório quantitativo exclusivamente simulado. A carteira demonstrativa publicada e seu livro-caixa BRL continuam independentes. Não existem APIs de corretoras, contas financeiras, execução real, alavancagem, IA de decisão ou promessa de lucro.

## Habilitar localmente

Node 22 e PostgreSQL 16+. `npm ci` na raiz e em server. Banco local exclusivo, preferencialmente nome terminado em `_test`. Configure `DATABASE_URL`, `CORS_ORIGIN=http://localhost:5173`, `QUANT_ENABLED=1` no backend e `VITE_API_URL=http://localhost:4000`, `VITE_QUANT_ENABLED=1` no frontend. Variáveis VITE são públicas; jamais incluir credenciais. Execute build, `prisma migrate deploy` no banco local, backend e Vite. Os dois flags são **0 por padrão**: a carteira antiga permanece utilizável, mesmo com módulos 2.0 desabilitados.

1. Cadastre uma conta ou faça login; abra Laboratório quantitativo.
2. Monitore um par permitido, selecione período de até 366 dias e busque dados.
3. Cadastre uma estratégia SMA (rápida 2–50; lenta 3–200, rápida < lenta).
4. Defina capital virtual independente, alocação, custos e Guard. 100 bps = 1%.
5. Crie backtest ou sessão paper. Nenhuma ordem é gerada ao criar.
6. Processe próximo lote; decisão e execução fictícias são automáticas dentro do lote manual. Repita até concluir o backtest ou acompanhar novos dados no paper.
7. Consulte posições, patrimônio, P/L, drawdown, acerto, benchmark e auditoria. Pausa, emergência e encerramento preservam histórico.

## Fonte e scanner

Fonte documentada: [Frankfurter v2](https://frankfurter.dev/), endpoint HTTPS fixo `/v2/rates?base=USD&quotes=BRL&from=...&to=...&expand=providers`. Feed **blended**, cálculo próprio gratuito, sem chave e com cache permitido. Fontes contribuintes (ex.: BCB, ECB), taxas/datas originais, data agregada, data mais recente da fonte e momento da ingestão são registrados. Nenhum endpoint financeiro privado é chamado. A API retorna observações agregadas inclusive fora de dias úteis; preservamos somente as linhas recebidas, sem interpolar ou fabricar feriados. Taxas podem ser revisadas: preços existentes são imutáveis e uma revisão conflitante é recusada.

Universo inicial: USD/BRL, EUR/BRL, GBP/BRL, JPY/BRL, CHF/BRL, CAD/BRL. São **taxas de referência**, não cotações executáveis, ações ou ETFs. Não presumir preço bid/ask, volume ou liquidez: estes campos são null e o Guard bloqueia compras por padrão. Uma opção explícita permite aceitar liquidez desconhecida apenas na simulação de referência. Fonte indisponível gera erro e registro da análise; nenhuma substituição sintética fora de testes.

SMA 5/20, EMA20 (semente SMA), RSI14 de Wilder (50 para série constante), volatilidade amostral anualizada de retornos logarítmicos, fator 252 apenas convenção analítica; score = diferença relativa SMA5/SMA20. Warmup e dados com fonte mais antiga que cinco dias são sinalizados; ranking descritivo sem recomendação. Consulta inicial real do adaptador em 14/10/2026: USD/BRL, 02–10/01/2025, 9 linhas válidas e 40 fontes na primeira linha; nenhum resultado dessa consulta foi apresentado como lucro.

## Engine, Guard e integridade

Estratégia `sma-cross-v1`, long-only, uma posição por sessão. O sinal considera somente dados anteriores; o fill ocorre na próxima taxa disponível. O backtest usa warmup dentro do período selecionado. Paper começa no último dado conhecido, sem replay imediato do histórico. Interrupções podem deixar vários dias pendentes; os lotes retomam em ordem, em ambiente fictício, sem executar no mercado.

Preços em milionésimos BRL; quantidades em microunidades; caixa/custo/P&L em centavos BigInt. Slippage eleva compra e reduz venda. Débito e taxa arredondados para cima; crédito para baixo. Resultados incluem custos das ordens executadas. Posições abertas permanecem marcadas à última taxa processada, sem taxa de liquidação presumida. Benchmark compara primeira/última referência sem custos; não é benchmark investível.

Guard independente antes de cada ordem: exposição por ativo/total/concentração, caixa, liquidez, máximo de operações/dia e perda diária em relação ao patrimônio do fechamento anterior. Vendas que reduzem exposição podem ultrapassar limites de novas compras, mas respeitam pausa/emergência e qualidade de dados. A pausa global da carteira bloqueia paper, mas não aportes/retiradas nem backtest histórico. Pausa da sessão bloqueia o lote. Emergência é irreversível para retomada nessa sessão; pode-se encerrá-la. Encerrar não liquida posições automaticamente.

Transação PostgreSQL bloqueia carteira e sessão; checkpoints, decisões, ordens e estado são confirmados juntos ou revertidos juntos. Uma pausa concorrente aguarda o lote atômico atual (no máximo 50 observações) e bloqueia lotes posteriores. Não interrompe transação já em execução no meio. Chaves idempotentes obrigatórias em criação de estratégia/sessão, lote e controle; mesma chave/parâmetros recupera resultado, outro payload recebe 409. A interface mantém chave após resposta incerta. Ativos são únicos por usuário/símbolo.

## Armazenamento e consumo

Máximo por usuário: 10 ativos, 10 estratégias, 10 sessões paper e 20 backtests. Por ativo: 1000 observações, 50 análises, uma busca a cada 15 minutos. Por sessão: até 1000 eventos operacionais, mais encerramento terminal; lote até 50. Resposta externa limitada a 2 MB, timeout 10s, sem redirects. Snapshot de dados no backtest, hash SHA256 e versão/configuração preservados. Paper referencia observações imutáveis e atualiza hash ao processar. Tela exibe últimas 100 decisões; histórico persistente permanece até o limite.

Sem cron, workers pagos, Redis, keep-alive ou loops permanentes. Retomada manual após Render suspender; mecanismos de despertar existentes preservados. Logs de erro da API mostram somente categoria/código, sem credenciais. Métricas básicas: contagens de observações, lotes/ordens/posições, checkpoints, estado, tempos de auditoria e falhas de fonte. Não é um sistema de observabilidade externo nem monitor 24h. O fator de volatilidade e o limite de dados stale são convenções explícitas; podem bloquear feriados prolongados.

## API autenticada

Todas as rotas `/quant` exigem sessão válida e flag backend. Nenhum payload aceita userId.

| Rotas | Ação |
|---|---|
| GET/POST /quant/assets | Lista/adiciona ativo próprio; supported lista símbolos |
| GET /quant/assets/:id/bars | Histórico próprio com origem e proveniência |
| POST /quant/assets/:id/refresh | `{from,to}`; busca, valida e registra análise |
| GET/POST /quant/strategies | Lista/cria `{name,fast,slow}` |
| GET/POST /quant/runs | Lista/cria simulação com capital, risco e custos |
| POST /quant/runs/:id/step | `{limit:1..50}`; lote recuperável |
| POST /quant/runs/:id/control | `{action:PAUSE/RESUME/EMERGENCY/CLOSE}` |
| GET /quant/runs/:id/events | Últimas 100 decisões e controles |

POST /runs: kind PAPER/BACKTEST, assetId, strategyId, capital string decimal BRL, allocationBps, feeBps, slippageBps, risk `{assetBps,totalBps,concentrationBps,dailyLossBps,maxOperations,minLiquidity,allowUnknownLiquidity}`. BACKTEST também exige from/to. Erros 400 validação; 404 recurso alheio/desabilitado; 409 estado/chave/limites; 429 cooldown; 503 fonte/API indisponível. Não repetir POST com nova chave depois de resposta incerta.

## Deploy e rollback — somente após autorização

Não integrar main automaticamente: a Vercel conectada publica main. Primeiro revisar PR/CI, ensaiar as três migrations novas em banco isolado e fazer backup de produção. Migrations são aditivas; não alteram tabelas, saldos ou sessões antigas. Usar conexão PostgreSQL direta para migrations/backup e pooled em runtime.

Após autorização: integrar commit revisado; publicar backend Render Free com QUANT_ENABLED=0; aplicar `prisma migrate deploy` sem reset e verificar carteira/auth. Habilitar QUANT_ENABLED=1 e publicar frontend Vercel Hobby com VITE_QUANT_ENABLED=1 após validar compatibilidade. Backend antes do frontend. Atualizar CORS somente com origens exatas. Nenhum plano/serviço novo é necessário. Não criar preview backend apontando para produção durante a validação.

Rollback: primeiro desabilitar flags e reconstruir frontend; retornar ao commit anterior do frontend/backend se necessário. Manter as tabelas 2.0 e seus dados, sem down migration, DROP, reset ou restauração sobre o banco. Código antigo ignora as novas tabelas. Backup e restore devem ser ensaiados em banco separado; nunca expor dumps/credenciais. Main e deployment atuais permanecem inalterados nesta missão.

## Limitações

Demonstrador de câmbio diário, não scanner de bolsa/intraday. Sem fonte de volume/liquidez, múltiplos ativos numa mesma sessão, short, alavancagem, otimizador de parâmetros, rentabilidade ajustada a dividendos ou agenda contínua. Um usuário pode criar sessões independentes; limites de exposição são por sessão, não uma carteira consolidada entre sessões. O painel não soma contas virtuais independentes com o livro-caixa para evitar patrimônio artificialmente duplicado. Sem novas integrações de autenticação, recuperação de senha ou MFA. Aparelho físico/Safari e implantação 2.0 pública dependem de validação posterior autorizada.
