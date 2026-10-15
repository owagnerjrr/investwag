# Validação WJ Quant 3.0 — 15/10/2026

Desenvolvimento em codex/wj-quant-3, base main a0cc11b. Produção e configurações externas não foram alteradas. Node 24.21.0 e PostgreSQL 16.15 locais; CI usa Node 22/PostgreSQL 16. Nenhuma credencial ou fixture de teste é usada para operar o sistema publicado.

## Resultado local

| Verificação | Resultado |
|---|---|
| npm ci raiz e server | Sucesso pelos lockfiles; nenhuma nova dependência de runtime |
| Carteira/ledger original | 6/6 |
| Backend final: anteriores + piloto | 20/20 |
| Integração, concorrência, recuperação e upgrade | 28/28 entradas do runner, incluindo grupos |
| E2E anteriores desktop/celular | 12/12; última execução completa 25,6s |
| E2E piloto desktop/celular | 4/4; última execução completa 10,5s |
| Build frontend com piloto desligado e habilitado | Sucesso; habilitado ~259,7kB JS / ~80,1kB gzip |
| Prisma validate/generate/deploy/status/diff local | 6 migrations, nova migration aditiva, sem divergência |
| Upgrade com dados anteriores | Hash/sessão/carteira/movimentos/ativos/barras/análises/estratégias/sessões Quant/eventos preservados |
| npm audit | 0 vulnerabilidades reportadas na raiz e no backend |

A execução local completa passou com 19 unitários antes do teste adicional de estratégia congelada. A suíte unitária final foi repetida com o novo caso e passou 20/20. A CI deve repetir todo o conjunto no commit final; esta documentação não presume seu resultado remoto. Consultar o PR e o relatório de entrega para SHA/run/job finais.

## Fluxo verificado

Autorização pelo painel → POST autenticado e idempotente → conta/livro PostgreSQL → job assinado externo → pesquisa/seleção/Guard → transação de ordens fictícias/checkpoints/auditoria → consulta/painel. GET e abrir o navegador não executam o motor.

- Indicadores/estratégias conhecidos e reproduzíveis; candidatos limitados, treino e validação cronológicos, prefixo histórico invariável ao anexar futuro, posição conserva estratégia após 30 dias, dados tardios não operam com patrimônio futuro.
- Reconciliação inteira, lucros/perdas distintos de aportes e retiradas, retirada de lucro realizado, saldo insuficiente, operações inválidas, custos arredondados e reinvestimento dimensionado sobre o novo patrimônio.
- Guard: ativo/mercado/total/concentração, perda diária, drawdown, volatilidade, custos, liquidez ausente, dado stale/referência, falhas, operações, pausa, anomalia e corrupção financeira.
- HTTP/DB: duas contas isoladas, payload com userId recusado, consentimento único, flag fechada, mesma chave/mesmo conteúdo, conflito de payload, oito aportes simultâneos com um único crédito, dez retiradas concorrentes com três aceitas.
- Duas chamadas agendadas concorrentes: uma execução útil, cache de fonte chamado uma vez e um único ciclo persistido. Dados sintéticos explicitamente marcados geraram BUY/SELL e caixa reconciliado. Nenhum dado sintético foi inserido no banco publicado.
- Novo processo Node/Prisma, sem navegador, retomou checkpoint; a API reiniciada aceitou a sessão anterior. Lease de worker interrompido foi recuperada; token de fencing antigo não pode confirmar alterações.
- Pausa/retomada, pausa global e emergência; proteção não pode ser removida por alternar pausa/retomada; três falhas consecutivas de todas as fontes protegem a conta sem inventar preços.
- Assinatura ausente/expirada e corpos inválidos não autorizam job. Dispatcher com cold-start simulado é limitado, assina a chamada útil e repete resposta incerta com a mesma chave de ciclo no servidor.
- E2E: cadastro/login, consentimento sem escolher mercado/estratégia, aporte com resposta HTML após commit e retry sem duplicação, página fechada durante job HTTP independente, nova página recuperando dados, retirada insuficiente, pausa, retomada, emergência e consultas do laboratório anterior. Caso específico interrompe durante aporte de resposta incerta e depois confirma um único crédito, mantendo EMERGENCY.
- Desktop/Pixel 7 emulado, largura sem overflow e sem pageerror; testes anteriores incluem 320px. Capturas locais na entrega. Não testados Safari/aparelho físico.

## Falhas encontradas e corrigidas

- Primeiro PostgreSQL local não era alcançável entre jobs isolados do Windows. Supervisor de teste passou a manter PostgreSQL/API/Vite/testes no mesmo job, loopback exclusivo; não alterou firewall, Neon ou produção.
- E2E inicialmente falhou no primeiro boundary de rede: servidor reutilizado não recebeu CORS da origem 127.0.0.1. Corrigido somente o ambiente local; origem exata testada. Depois os 12 anteriores passaram.
- Ensaio de upgrade novo dividia SQL em ponto e vírgula presente dentro de comentário. Harness remove comentários de linha antes da divisão; os dados e schema finais foram comparados novamente.
- Fixture unitária inicial colocou a compra fora da janela de dados frescos e foi corretamente bloqueada. Datas sintéticas corrigidas; não foi afrouxado o Guard.
- Revisão acrescentou calendário consolidado para fontes atrasadas, custo efetivo após arredondamento, prevenção de saída da proteção via pause/resume, emergência independente da ação financeira pendente, forecast diário distinto de elegibilidade, estratégia de posição congelada e seleção reavaliada quando custos mudam.

## Dados reais e limites

Consulta brapi PETR4 retornou 62 referências até 14/10/2026: pesquisa, sem execução por ajustes/liquidez não verificados. Frankfurter na primeira tentativa local expirou em 10s. CoinGecko Demo sem chave foi corretamente marcado indisponível e não consultado por keyless. Não declarar teste real de paper cripto sem chave. Fixtures são fontes sintéticas de teste, nunca apresentadas como cotações de mercado.

Comportamento de schedule em nuvem, suspensão real Render 3.0, carga prolongada, cobrança real, notificação de e-mail, Docker e disponibilidade 24/7 não foram testados. Não houve deploy autorizado. A prova local mostra independência do navegador e recuperação de processo, não continuidade 24h. Limites/custos/ativação em QUANT-3.md e QUANT-3-INFRASTRUCTURE.md.
