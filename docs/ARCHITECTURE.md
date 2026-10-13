# Arquitetura do WJ Quant

## Objetivo

Construir uma plataforma automatizada de investimentos com separação clara entre interface, dados, decisão, risco, execução e auditoria.

## Princípios arquiteturais

- baixo acoplamento entre domínio e provedores externos;
- adaptadores substituíveis para dados de mercado e corretoras;
- trilha de auditoria desde o início;
- nenhuma ordem pode ignorar a camada de risco;
- dinheiro real só entra em uma fase posterior e explicitamente separada;
- valores financeiros devem usar tipos decimais/inteiros seguros, nunca `float` para cálculos monetários críticos;
- o sistema deve continuar funcional com o computador do usuário desligado quando hospedado em nuvem.

## Módulos previstos

### Dashboard
Interface responsiva para desktop e celular. O modo simples será o padrão.

### Scanner
Responsável por analisar o universo permitido de ativos e produzir candidatos.

### Engine
Responsável por avaliar estratégias e transformar candidatos em intenções de operação.

### Guard
Camada de risco independente. Pode rejeitar qualquer intenção produzida pelo Engine.

### Broker
Contrato abstrato para execução. Primeiro adaptador: `PaperBroker`. Integrações reais serão posteriores.

### Market Data
Contrato abstrato para cotações, candles, volume e demais dados.

### Backtest
Execução histórica de estratégias com métricas e custos simulados.

### Audit
Registro de eventos, decisões, erros e mudanças de estado.

## Fluxo obrigatório

```text
Market Data
    ↓
Scanner
    ↓
Engine
    ↓
Guard
    ↓
Broker
    ↓
Audit / Portfolio / Dashboard
```

O `Broker` nunca deve ser chamado diretamente pelo `Scanner` ou pelo `Engine`.

## Estados do sistema

- `OPERATING`
- `WAITING_OPPORTUNITY`
- `PAUSED`
- `PROTECTION_ACTIVE`
- `ERROR`

## Estrutura sugerida

```text
apps/
  web/
  api/
packages/
  domain/
  database/
  shared/
  ui/
docs/
```

A estrutura final pode ser refinada quando o código começar, preservando os princípios acima.
