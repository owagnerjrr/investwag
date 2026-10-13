# WJ Quant

WJ Quant é um projeto de plataforma automatizada de investimentos com foco em simplicidade para o usuário, automação operacional, gestão de risco e transparência de ganhos e perdas.

> Estado atual: **Bloco 1 — Fundação do projeto**
>
> **Nenhuma operação financeira real está habilitada.** O projeto começa em modo demonstrativo/simulado.

## Visão do produto

A filosofia central do WJ Quant é:

**O usuário administra o capital. O WJ Quant administra as operações.**

No produto final, o usuário deverá basicamente:

- adicionar capital;
- retirar capital;
- acompanhar patrimônio, ganhos e perdas;
- pausar ou reativar o sistema quando necessário.

O sistema será preparado para, futuramente, analisar oportunidades de mercado, selecionar estratégias, dimensionar posições, executar operações automaticamente, controlar risco, registrar decisões e funcionar em nuvem sem depender do computador do usuário.

## Regras centrais

- capital lógico mínimo previsto: **R$ 10,00**;
- nenhum valor mínimo garante que haverá operação;
- o sistema deverá permanecer sem operar quando não houver oportunidade adequada;
- ganhos e perdas devem ser exibidos com transparência;
- dinheiro real continuará custodiado pela instituição/corretora integrada, não pelo WJ Quant;
- integração com corretora e ordens reais só serão consideradas após simulação, backtesting, paper trading e validação de risco;
- saques nunca serão automatizados pelo robô sem ação explícita do usuário.

## Arquitetura prevista

- **WJ Quant Dashboard** — interface simples para desktop e celular;
- **WJ Quant Scanner** — descoberta e comparação de oportunidades;
- **WJ Quant Engine** — estratégias e decisões quantitativas;
- **WJ Quant Guard** — camada independente de risco;
- **WJ Quant Broker** — abstração de execução, começando por PaperBroker;
- **WJ Quant Market Data** — abstração para dados de mercado;
- **WJ Quant Backtest** — testes históricos;
- **WJ Quant Audit** — trilha de auditoria de eventos e decisões.

Fluxo obrigatório futuro:

```text
Scanner -> Engine -> Guard -> Broker
```

Nenhum módulo deverá ignorar o Guard para enviar ordens.

## Roadmap inicial

1. Fundação, documentação e estrutura do projeto
2. Dashboard responsivo
3. Carteira virtual e movimentações simuladas
4. Dados de mercado
5. Opportunity Scanner
6. PaperBroker
7. Quant Engine
8. WJ Quant Guard
9. Backtesting
10. Relatórios e explicações das operações
11. Execução em nuvem 24h
12. PWA e notificações
13. Testes de resiliência e segurança
14. Paper trading prolongado
15. Integração real com corretora, somente após validação

## Segurança financeira

O WJ Quant não promete rentabilidade e não deve operar apenas para permanecer ativo. Uma decisão válida pode ser **não operar**.

Consulte também:

- `docs/ARCHITECTURE.md`
- `docs/FINANCIAL-SAFETY.md`
- `docs/ROADMAP.md`
- `docs/SECURITY.md`
