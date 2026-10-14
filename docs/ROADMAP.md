# Roadmap — WJ Quant

Proposta histórica. A missão 2.0 autorizou scanner, motor fictício, Guard, backtesting e paper trading manual recuperável, descritos em [QUANT-2.md](QUANT-2.md). Nuvem contínua, infraestrutura paga e integração financeira real não foram autorizadas nem implementadas.

O desenvolvimento será feito em blocos independentes, sempre preservando o que já funciona.

## Bloco 1 — Fundação

- documentação-base;
- arquitetura;
- segurança financeira;
- estrutura inicial do projeto;
- convenções para desenvolvimento.

## Bloco 2 — Dashboard

- interface responsiva;
- modo simples como padrão;
- estados do robô;
- cards de patrimônio;
- ganhos e perdas;
- gráfico simples;
- ações de adicionar, retirar e pausar.

## Bloco 3 — Carteira simulada

- aportes simulados;
- retiradas simuladas;
- capital mínimo lógico de R$ 10,00;
- saldo disponível/investido;
- histórico de movimentações.

## Bloco 4 — Market Data

- contrato de provedor;
- ingestão de dados;
- normalização;
- persistência;
- tratamento de falhas e dados inconsistentes.

## Bloco 5 — Opportunity Scanner

- universo de ativos configurável;
- filtros de liquidez;
- filtros de custo/spread;
- ranking de oportunidades;
- ausência de obrigação de operar.

## Bloco 6 — PaperBroker

- ordens simuladas;
- posições;
- abertura/fechamento;
- custos simulados;
- reconciliação;
- proteção contra duplicidade.

## Bloco 7 — Quant Engine

- framework de estratégias;
- sinais;
- dimensionamento de posição;
- justificativa auditável.

## Bloco 8 — WJ Quant Guard

- exposição máxima;
- limite de perda;
- kill switch;
- bloqueios por erro de dados;
- regras de risco configuráveis.

## Bloco 9 — Backtesting

- execução histórica;
- custos;
- métricas;
- drawdown;
- comparação entre estratégias.

## Bloco 10 — Relatórios e explicações

- explicação simples de cada operação;
- modo avançado;
- logs e auditoria;
- relatórios de ganhos e perdas.

## Bloco 11 — Nuvem 24h

- backend persistente;
- workers;
- banco gerenciado;
- health checks;
- monitoramento;
- execução independente do PC do usuário.

## Bloco 12 — PWA e notificações

- instalação no celular;
- layout mobile;
- notificações importantes;
- status do robô.

## Bloco 13 — Resiliência e segurança

- testes de falha;
- rate limiting;
- autenticação forte;
- 2FA para ações sensíveis;
- backup;
- recuperação;
- idempotência.

## Bloco 14 — Paper trading prolongado

- operação simulada com dados reais;
- acompanhamento contínuo;
- revisão de métricas;
- correções.

## Bloco 15 — Integração real

Somente após validação explícita das fases anteriores.

- escolha de instituição/corretora com API oficial;
- adaptador isolado;
- permissões mínimas;
- reconciliação;
- operação com capital pequeno;
- limites conservadores;
- retirada sempre iniciada pelo usuário.

## Regra

Nenhum bloco posterior deve ser iniciado automaticamente sem revisão do bloco atual.
