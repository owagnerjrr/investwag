# Segurança — WJ Quant

## Implementado na demonstração

- Senhas bcrypt com custo 12 e limite de 72 bytes, sem truncamento silencioso.
- Sessões opacas aleatórias, somente hash SHA-256 no PostgreSQL, expiração de uma hora e revogação no logout.
- Token apenas em memória no navegador; respostas sem cache e HTTPS obrigatório na hospedagem.
- Carteiras autorizadas pelo usuário da sessão; não aceita escolher outro usuário em payloads.
- CORS com origens exatas, Helmet, limite de corpo de 16 KB, validação Zod e erros JSON sem segredos.
- Limites de requisição: 300/minuto global e 20 tentativas/15 minutos no cadastro/login, por IP/instância. Logout não consome limite de login.
- Saldo e histórico em transação com bloqueio de carteira; idempotência por usuário/carteira; constraints de reconciliação e valores positivos.
- Totais em centavos BigInt no banco e strings decimais na API. O histórico não é truncado no banco.

Limitações: não há recuperação de senha, verificação de e-mail, MFA ou rate limit compartilhado. O alvo atual é uma instância demonstrativa; configure proxy confiável, TLS, backups e monitoramento antes da exposição. Ao atualizar do scaffold, sessões antigas em memória exigem novo login.

O override deepmerge-ts 8.0.0 corrige a dependência transitiva da ferramenta Prisma descrita em https://github.com/advisories/GHSA-ggr8-5vv4-36mx. Prisma validate/generate/migrations foram executados após a correção. A auditoria npm não substitui uma auditoria independente.

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
