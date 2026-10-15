# WJ Quant 3.0 — piloto automático fictício

Implementação em branch, sem merge/deploy ou alteração de produção. Main de referência: a0cc11b. V1 e V2 preservadas. Toda ordem é hipotética; não existe integração de execução com corretoras/bancos.

## O que o usuário faz

1. Entre na conta e autorize uma única vez o piloto fictício. A autorização informa e reativa a pausa global dessa conta; não transfere saldos antigos.
2. Adicione capital virtual ao piloto. Não é necessário selecionar ativo, indicador, estratégia ou lote.
3. Consulte patrimônio, disponível, investido, P/L realizado/não realizado, dia/mês/acumulado, posições, última análise, último ciclo e próxima tentativa.
4. Use pausa/retomada ou emergência. Emergência é irreversível nessa conta piloto e continua disponível durante resposta financeira incerta. O histórico permanece consultável.
5. Retire somente o disponível. Não há venda forçada de posições. Retirada não apaga perdas, ordens ou histórico.

A carteira 1.0 e o laboratório 2.0 continuam em “Carteira anterior e laboratório 2.0”. O piloto começa zerado em livro independente: nenhum saldo anterior é importado/duplicado/somado automaticamente. Autorizar/retomar altera somente a pausa global, por consentimento explícito; saldos/históricos anteriores permanecem intactos.

## Fontes e pesquisa automática

Catálogo pequeno/revisado, definido no servidor, sem tickers/URLs arbitrários do cliente. Todos os preços normalizados em BRL. Cache PostgreSQL compartilhado e no máximo uma tentativa por símbolo por dia UTC, inclusive falhas. Uma mudança de horário do job não precisa aguardar 24h exatas. Snapshots têm até 180 observações; preço revisado é recusado e observações antigas não são reescritas silenciosamente.

| Mercado | Fonte / universo automático | Uso nesta versão |
|---|---|---|
| Câmbio | Frankfurter v2, USD/BRL e EUR/BRL | Pesquisa apenas. Sem executar sobre taxa de referência. Scanner V2 com seis pares continua disponível |
| Ações brasileiras | brapi, PETR4/VALE3/ITUB4/MGLU3, histórico 3mo diário | Pesquisa real gratuita. Sem execução automática enquanto ajustes e liquidez BRL não estiverem verificados |
| Cripto | CoinGecko Demo, bitcoin/ethereum, preço e volume 24h BRL | Paper hipotético se chave Demo gratuita estiver configurada e dados/seleção/Guard passarem |
| ETFs, FIIs e internacionais | Contrato de indisponibilidade por classe | Sem fonte/histórico gratuito validado neste recorte; explícito no scanner, sem impedir outras classes |

Consulta real de 15/10/2026: brapi PETR4 retornou 62 pontos até 14/10; mantidos somente para pesquisa. Uma tentativa Frankfurter expirou em 10s, registrada como falha, sem substituir preços. O scanner V2 e sua fonte foram preservados. CoinGecko Demo real não foi chamada sem chave: sua documentação keyless exclui polling agendado. Não foi criada conta/token ou contratado provedor.

Datas, fonte, histórico normalizado, falhas e momento da ingestão ficam no cache. SMA5/20, EMA20, RSI14 e volatilidade são calculados automaticamente. Dados futuros/parciais UTC, datas inválidas, valores não finitos e payloads >2MB são recusados. Volume ausente permanece null. Preço diário/volume reportado não é bid/ask nem garantia de liquidez; fills são hipóteses de pesquisa.

Fontes oficiais consultadas:
- [Frankfurter](https://frankfurter.dev/)
- [brapi gratuito, 3 meses e quatro ações de teste](https://brapi.dev/faq/api-e-gratis-mesmo)
- [brapi histórico e advertências sobre ajustes](https://brapi.dev/docs/acoes/historico)
- [CoinGecko keyless: não indicado para agendamento](https://docs.coingecko.com/docs/keyless-public-api)
- [CoinGecko Demo histórico](https://docs.coingecko.com/demo/reference/coins-id-market-chart)

## Engine e viés

Versão `pilot-v3.0.0`. Candidatas fixas SMA5/20 e SMA10/30, sem busca extensiva de parâmetros. Pelo menos 90 observações. Os primeiros 70% escolhem uma vencedora por retorno líquido menos drawdown; 30% seguintes, disjuntos e posteriores, só podem vetar essa vencedora. Exige resultado de treino positivo, validação não negativa, operações em ambos e drawdown de validação aceitável. Custo e slippage entram no replay. Não seleciona pela maior rentabilidade isolada.

Seleção fica congelada por 30 dias e versões/hashes/intervalos de treino e validação são auditados. A posição conserva sua estratégia até encerrar. Decisão para a data D usa somente observações anteriores a D; preenchimento fictício na referência seguinte, com custos explícitos. O calendário consolidado impede que um mercado atrasado opere retroativamente com patrimônio já marcado por dados futuros de outro mercado.

Primeiro ciclo prepara histórico/seleção e checkpoint no dado conhecido, sem executar retrospectivamente. Após indisponibilidade, processa até 10 datas por conta/tick; referências com fonte mais antiga que 5 dias não geram ordens. Dados recebidos atrasados para datas já ultrapassadas pelo calendário consolidado não geram operações retroativas. Scanner pode mostrar análise mais recente que a marcação da carteira; `valuationAt` identifica a última data processada.

Cache de pesquisa é limitado/rotativo. Hashes e decisões são preservados; não se promete replay futuro integral quando a série sair da retenção de 180 pontos. Backtests V2 mantêm seus snapshots próprios. Avaliação cronológica não elimina overfitting ou mudança de regime; resultados podem ser negativos e frequentemente não haverá operação.

## Guard e livro reconciliado

Guard obrigatório antes de cada intenção, sem bypass de liquidez desconhecida no piloto. Política padrão:

| Limite | Valor |
|---|---|
| Ativo / concentração | 20% / 25% do patrimônio (vale o menor) |
| Mercado / total | 30% / 40% |
| Perda diária / drawdown | 2% / 10% |
| Operações / posições | 4 por dia / 3 simultâneas |
| Volume BRL reportado mínimo | R$ 1 milhão/24h |
| Volatilidade anualizada máxima | 150%, convenção 252 observações |
| Taxa / slippage por fill | 10 / 20 bps |
| Custo total máximo | 100 bps, incluindo arredondamento efetivo |
| Circuito | 3 falhas consecutivas; bloqueio de fonte e proteção da conta quando todas as fontes falham |

A política pode ser apertada pelo proprietário em `PILOT_POLICY_JSON`, jamais no payload do usuário. Valores acima dos tetos conservadores são recusados. Exemplo: `{"totalBps":3000,"dailyLossBps":100}`. Custos podem ser ajustados em 0–100 bps cada, mas o teto total continua obrigatório. Política efetiva é persistida e auditada no ciclo.

Dados desatualizados, posição sem marcação atual, concentração/caixa, custos arredondados, anomalia de preço >25%, perda/drawdown e falhas podem impedir a ordem. A decisão correta pode ser manter caixa. Guard limita o patrimônio consolidado da conta piloto, não as contas independentes da V2.

Inteiros: preço em milionésimos BRL, quantidade em microunidades, caixa/taxas/P&L em centavos BigInt. Arredondamento conservador. `patrimônio = aportes - retiradas + realizado + não realizado`; `caixa = aportes - retiradas + realizado - custo das posições`. Lucros fechados permanecem em caixa e podem ser reinvestidos pelos mesmos critérios ou retirados; aportes nunca contam como lucro.

Row lock da conta e transação conjunta de caixa, posições, checkpoints e evento. Pausa global v1 também é bloqueada/consultada na mesma ordem de locks antes do lote. Pausa concorrente aguarda o lote atômico atual e bloqueia posteriores. Emergência não cancela transação já confirmada ou liquida automaticamente uma posição. Proteção automática não é removida por alternar pause/resume; requer investigação do proprietário. Sem endpoint administrativo público para afrouxar risco/resetar proteção.

## Automação sem navegador

Arquivos: `server/pilot/worker.js` (CLI one-shot), `scripts/pilot-schedule.mjs` (dispatcher HTTPS), `.github/workflows/pilot-schedule.yml` (diário às 17:23 UTC / 14:23 Brasília). Nenhum foi habilitado em produção.

Workflow desligado por padrão e restrito ao repositório público original, runner padrão Linux. Em produção futura, exige `vars.PILOT_SCHEDULE_ENABLED=true`, `vars.PILOT_API_URL` (origem HTTPS exata) e secret privado igual ao backend. `workflow_dispatch` permite recuperação pelo proprietário. Schedule só funciona na main; esta branch não agenda o sistema publicado.

POST interno assinado HMAC-SHA256, método/path/timestamp e janela de 5 minutos, sem dados sensíveis ou identificação de usuários na resposta. O corpo é vazio. Timestamp antigo, secret curto/ausente, assinatura inválida e flag fechada são recusados. Ciclo diário único por conta, chave persistida, lease global de 5 minutos e token de fencing evitam duplicação e commit de worker substituído. Lease expirada é recuperável. O cliente pode repetir uma resposta perdida sem duplicar caixa/ordens.

Cada tick atende até 5 contas mais atrasadas. Mais contas exigem capacidade/revisão de frequência; não aumentar polling para contornar quotas. Coleta no máximo 8 requests externos/dia do catálogo atual (2 FX, 4 brapi, 2 cripto com chave), compartilhados, sem multiplicar por usuário. Classes indisponíveis não geram request externo. Timeout da fonte 10s; job útil tem espera de despertar e retry limitados, sem loop permanente ou ping de manutenção. Em falhas, a execução seguinte retoma do checkpoint; não há promessa de horário exato ou 24/7.

Até 490 eventos antes de bloquear novos ciclos; 495 bloqueia novos aportes/retomadas, reservando espaço para pausa/emergência e uma retirada final integral do disponível. Nada é apagado automaticamente. Curva retém últimos 120 pontos, auditoria mostra últimos 30 eventos e preserva o restante. Histórico de seleção fica limitado à retenção documentada. São limites demonstrativos, sem teste de carga de longa duração.

Alertas no painel: origem indisponível, stale, sem histórico/credencial, limites de risco, erro de integridade/motor, proteção, falha do scheduler e próxima execução vencida por mais de seis horas. Uma queda total da API impede alertas no próprio painel; use notificações de falha nativas do GitHub Actions na conta do proprietário. Nenhum e-mail foi enviado ou integração paga configurada. Não há serviço de e-mail próprio nesta versão.

## Executar/testar localmente

Node 22, PostgreSQL 16+ em banco exclusivo `_test`. `npm ci` raiz/server, configurar DATABASE_URL local; `prisma migrate deploy` e build. Flags backend `QUANT_ENABLED=1`, `PILOT_ENABLED=1`; frontend `VITE_QUANT_ENABLED=1`, `VITE_PILOT_ENABLED=1`, API local com CORS exato.

`npm test` em ambos; `npm run test:integration` em server. Para E2E antigos, build com VITE_PILOT_ENABLED=0 e execute `npx playwright test e2e/demo.spec.js e2e/quant.spec.js`. Para o piloto, build com VITE_PILOT_ENABLED=1 e execute `E2E_PILOT=1 npx playwright test e2e/pilot.spec.js` (no PowerShell, definir `$env:E2E_PILOT='1'` antes). Não executar esses testes sobre produção: fixtures sintéticas, cleanup de contas próprias e schema temporário são exclusivos `_test`.

A suíte inclui worker em novo processo sem navegador, retomada/checkpoint, concorrência, assinaturas expiradas, capital/reinvestimento, isolamento, falha de fonte, emergência durante resposta incerta e upgrade com dados v1/v2 preexistentes. CI valida flags antigas e piloto em builds distintos.

## Publicação e rollback — precisa de autorização

1. Revisar PR/CI. Não fazer merge nesta missão. Vercel conectada à main pode publicar automaticamente; manter VITE_PILOT_ENABLED=0.
2. Backup privado atualizado do banco publicado, integridade e restore em banco separado. Não usar o backup antigo como se fosse atual.
3. Aplicar migration `202610150001_pilot` por conexão direta e `prisma migrate deploy`, sem reset/db push. Todas as tabelas novas são aditivas; validação local preservou contas/sessões/saldos e registros Quant anteriores.
4. Publicar backend com PILOT_ENABLED=0; testar V1/V2 e Prisma. Reutilizar DATABASE_URL/CORS corretos, runtime pooled, sem novos recursos pagos.
5. Configurar secret de agendamento aleatório privado (mínimo 32 caracteres) no backend e GitHub; eventual Demo key gratuita somente no backend. Conferir termos/quota da conta do provedor. Nenhum segredo VITE_*.
6. Habilitar backend PILOT_ENABLED=1 e frontend VITE_PILOT_ENABLED=1; reconstruir. Validar contas descartáveis, uso dos endpoints públicos e dados anteriores.
7. Somente após aprovação dessa etapa, habilitar variável do scheduler no repositório e testar `workflow_dispatch` real. Observar o primeiro schedule diário e retomada após suspensão. Ainda pendente: esta fase não prova execução agendada em nuvem ou 24/7.

Rollback: desligar `PILOT_SCHEDULE_ENABLED`; configurar PILOT_ENABLED=0 e VITE_PILOT_ENABLED=0 e republicar frontend/backend revisados. Manter QUANT_ENABLED/VITE_QUANT_ENABLED da V2 e suas variáveis. Preservar PilotAccount/Event/Market/Clock e todos os dados; nenhum down migration, DROP ou restauração sobre produção. A pausa/emergência de uma conta não deve ser confundida com desligar a flag global.

Variáveis novas: PILOT_ENABLED (0), PILOT_SCHEDULE_SECRET (privado), PILOT_POLICY_JSON (opcional), COINGECKO_DEMO_KEY (privado/opcional), VITE_PILOT_ENABLED (0/público). GitHub vars: PILOT_SCHEDULE_ENABLED (false), PILOT_API_URL; GitHub secret PILOT_SCHEDULE_SECRET. Nada configurado nos provedores nesta missão.

Limitações remanescentes: fontes/mercados acima; sem intraday, short, alavancagem, recuperação de senha/MFA/e-mail próprio, múltiplas moedas no livro, liquidação compulsória, expansão automática irrestrita do universo, reset administrativo da proteção, arquivamento automático ou garantia de replay após retenção. Aviso anterior TRUST_PROXY=0 no Render continua documentado em FREE-HOSTING; não foi afrouxada confiança em headers. Aparelho físico/Safari e comportamento prolongado em nuvem exigem validação posterior autorizada.

## Contrato HTTP do piloto

Todas as rotas do usuário exigem sessão opaca existente e flag PILOT_ENABLED. GET `/pilot` consulta somente a conta autenticada (null se não autorizada); retorna resumo, política, agenda observada e últimos 30 eventos. POST `/pilot` exige Idempotency-Key (8–100 caracteres) e payload estrito: `{action:ACTIVATE,consent:true}`, `{action:PAUSE|RESUME|EMERGENCY}` ou `{action:DEPOSIT|WITHDRAW,amountCents:"1000"}`. Valores financeiros são strings de centavos. Não aceita userId, símbolo, estratégia, estado ou risco fornecido pelo usuário. Erros: 400 validação/saldo, 401 sessão, 404 flag/recurso, 409 estado/chave/limite.

POST `/internal/pilot/tick` exige assinatura privada, não uma sessão de usuário. Resposta agrega accounts/orders/protected/pending/busy, sem IDs pessoais. `PilotAccount.nextRun` indexa elegibilidade interna; a previsão diária é persistida como expectedAt e exibida como nextRun no DTO. Conta pausada/protegida/emergência não exibe próxima execução prevista. Chegar a uma previsão não comprova que o scheduler disparou.
