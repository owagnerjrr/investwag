# Segurança — WJ Quant

## Princípios

- nenhum segredo versionado;
- nenhuma credencial real de corretora nesta fase;
- variáveis de ambiente para configurações sensíveis;
- autenticação e autorização antes de qualquer ambiente exposto;
- validação de entrada;
- logs sem senhas, tokens ou segredos;
- trilha de auditoria para eventos importantes;
- princípio do menor privilégio;
- kill switch disponível;
- proteção contra ordens duplicadas e chamadas repetidas;
- falha segura: em caso de dúvida, não operar.

## Eventos auditáveis previstos

- LOGIN
- BOT_STARTED
- BOT_PAUSED
- DEPOSIT_SIMULATED
- WITHDRAWAL_SIMULATED
- ORDER_CREATED
- ORDER_REJECTED
- POSITION_OPENED
- POSITION_CLOSED
- RISK_BLOCK
- SYSTEM_ERROR

## Ambientes

Separar claramente:

- desenvolvimento;
- testes;
- demonstração;
- paper trading;
- produção real futura.

Nunca reutilizar segredos entre ambientes.

## Operação real futura

Uma integração futura deverá usar somente APIs oficiais e permissões mínimas necessárias. O sistema deverá ser capaz de revogar/rotacionar credenciais e desativar execução sem perder os registros de auditoria.
