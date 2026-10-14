# Validação WJ Quant 2.0 — 14/10/2026

Base main baa3ebe, branch codex/wj-quant-2. Banco local PostgreSQL 16.15, Node 24.21.0, Prisma 6.19.3, Vite 6.4.4, Playwright 1.64.0. CI configura Node 22/PostgreSQL 16. Nenhuma migration/deploy ou conta financeira foi alterada em produção.

| Verificação local | Resultado |
|---|---|
| npm ci frontend/backend | Sucesso pelos lockfiles; versões principais preservadas |
| npm audit --audit-level=moderate em ambos | 0 vulnerabilidades |
| Carteira/ledger anterior | 6/6 passaram |
| Backend unitário: indicadores, estratégia, Guard, custos/backtest e anteriores | 11/11 passaram |
| Integração PostgreSQL: contratos antigos, upgrade e novos módulos | 20/20 entradas do runner passaram, incluindo grupos |
| E2E Chromium desktop e Pixel 7 emulado | 12/12 passaram, 31,3s na execução completa com servidores reutilizados |
| Build frontend habilitado | Sucesso, JS ~249,4 kB, gzip ~77,5 kB |
| Prisma validate/generate/migrate deploy/status | Sucesso; cinco migrations no total, três novas aditivas; nenhuma pendente |
| Upgrade em schema isolado e migrate diff | Preserva conta/hash/saldo/movimento/pausa/sessão existente; sem divergência |
| Fonte pública real | Frankfurter USD/BRL 02–10/01/2025: 9 taxas válidas, 40 contribuintes na primeira taxa; datas/origem verificadas |

## Cobertura

Indicadores com valores conhecidos e warmup; SMA cruzamento/espera e motivo; taxas/slippage/quantidade em inteiros; Guard com limites, stale, liquidez desconhecida, perda, operações e pausa; replay reproduzível e prejuízo conhecido; prefixo histórico igual após anexar futuro; ausência de look-ahead. Backtest não é promessa de desempenho futuro.

HTTP/PostgreSQL: ativo e cooldown concorrente, usuário alheio recebe 404, estratégias e sessões próprias, chave de criação reaproveitada/conflitante, mesmo lote simultâneo sem duplicar, chaves distintas avançam checkpoints sem duplicar datas; reconciliação P/L realizado + não realizado e caixa não negativo. Checkpoint retomado por novo processo Node/Prisma. Paper não modifica aportes/retiradas. Pausa global, pausa local, retomada, emergência irreversível para resume, encerramento e consultas. Flags fechadas preservam a demonstração antiga.

E2E usa somente **fixtures sintéticas explicitamente identificadas**, sem inventar preços de mercado: scanner/formulários, estratégia, backtest em lotes, auditoria/ordens fictícias, curva, paper, Guard e aporte da carteira antiga. Intercepta uma resposta HTML depois de o lote confirmar no banco; repetir conserva a chave. Suíte anterior mantém cobertura de cadastro, expiração/recarga, isolamento, movimento perdido, refresh perdido, HTML temporário e despertar da API. Verificação de largura sem overflow em desktop/mobile; testes antigos incluem 320px. Sem erros JavaScript no fluxo.

## Falhas encontradas e corrigidas durante desenvolvimento

- Sequência esperada de SELL no primeiro teste não cruzava as médias; fixture corrigida e resultado reproduzível confirmado.
- Inicialização de PostgreSQL por processo temporário não permaneceu ativa; servidor local passou a rodar em sessão própria, sem mexer no banco publicado.
- Atualizar Prisma enquanto testes Windows usavam a DLL causou bloqueio/cliente incompatível; instalação/generate/migrations feitos antes da suíte dependente.
- Frankfurter usa objetos de proveniência e agrega referências em dias não úteis; parser e modelo foram corrigidos para conservar fontes/datas reais e staleness.
- Suite E2E conjunta atingiu 300 chamadas/minuto; somente servidor _test recebe limite maior, proteção de produção intacta.
- Cleanup automático dos subprocessos Playwright ficou pendente no Windows após todos os casos; execução com servidores locais próprios/reutilizados encerrou com código 0 e `.last-run.json` passed. A CI usa seu lifecycle normal no Linux.
- Git CLI não conseguiu acessar o helper de credenciais na sandbox; envio via conexão autenticada GitHub, com conferência de SHA das árvores e commits separados.

## Limitações e publicação

Resultado do GitHub Actions deve ser consultado no PR/commit, e constará no relatório final após conclusão; este registro não presume aprovação remota. Sem implantação 2.0 pública, Docker build, Safari ou aparelho físico testados. Taxas de referência diárias, sem bolsa/intraday ou volume/liquidez; Guard bloqueia desconhecidos por padrão. Execução manual, um ativo e uma posição por sessão, riscos por sessão independente. Sem cron/24h, recursos pagos ou corretoras. Limites/rollback/variáveis em [QUANT-2.md](QUANT-2.md).
