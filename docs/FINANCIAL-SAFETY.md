# Segurança Financeira — WJ Quant

## Regra principal

O WJ Quant deve ser tratado como software de alto impacto financeiro.

Nenhuma etapa inicial pode enviar ordens reais, movimentar dinheiro real ou armazenar credenciais de corretora.

## Fases obrigatórias

1. demonstração local;
2. simulação com carteira virtual;
3. backtesting;
4. paper trading com dados reais;
5. validação de risco e estabilidade;
6. somente então avaliar integração com instituição/corretora real.

## Capital

O produto será projetado para patrimônios pequenos e crescentes, com piso lógico de R$ 10,00.

R$ 10,00 não significa que o sistema será obrigado a operar. Uma operação só pode ocorrer se passar pelos critérios de viabilidade e risco.

## Automação

O modo operacional final será predominantemente automático:

- buscar oportunidades;
- avaliar estratégias;
- dimensionar posição;
- abrir posição;
- acompanhar posição;
- encerrar posição;
- reinvestir saldo disponível;
- registrar decisões.

A função cotidiana do usuário será essencialmente:

- adicionar capital;
- solicitar retiradas;
- acompanhar resultados;
- usar pausa/kill switch em situações excepcionais.

## Guard obrigatório

Toda intenção de ordem deve passar pelo WJ Quant Guard.

O Guard poderá bloquear operações por motivos como:

- saldo insuficiente;
- exposição excessiva;
- perda acumulada;
- liquidez inadequada;
- spread/custos incompatíveis;
- dado de mercado inconsistente;
- preço anômalo;
- mercado indisponível;
- sistema em pausa;
- proteção ativada;
- falha de integração;
- estratégia desabilitada.

## Transparência

O Dashboard deve exibir claramente:

- capital aportado;
- retiradas;
- patrimônio atual;
- disponível;
- investido;
- ganhos realizados;
- perdas realizadas;
- resultado não realizado;
- resultado líquido;
- drawdown e demais métricas quando o modo avançado estiver disponível.

Nunca mostrar somente ganhos.

## Custódia

O WJ Quant não deve custodiar dinheiro.

Em uma integração futura, o dinheiro permanecerá na conta da instituição/corretora do usuário. O sistema apenas utilizará APIs oficiais dentro das permissões explicitamente concedidas.

## Retiradas

Retiradas nunca serão disparadas automaticamente pelo algoritmo de negociação.

Elas exigirão ação explícita do usuário e deverão respeitar saldo disponível, liquidação, autenticação forte e regras da instituição.

## Proibição de promessa

Nenhuma interface, documentação ou lógica deve prometer lucro, retorno garantido ou ausência de perdas.

Uma decisão correta do sistema pode ser não operar.
