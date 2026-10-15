# Automação 3.0 — alternativas, custos e limites

Pesquisa em documentação oficial, 15/10/2026. A missão informa Vercel Pro já existente; não foi feita mudança de plano nem uma nova conferência de cobrança. Custos abaixo são incrementais estimados, não autorização de contratação ou promessa de total R$ 0: uma assinatura Pro anterior continua tendo seu próprio custo.

| Alternativa | Custo incremental esperado | Vantagens | Limites / decisão |
|---|---|---|---|
| GitHub Actions público padrão + Render Free + Neon Free | R$ 0 dentro dos limites/termos | Job diário independente do navegador, sem novo host | Melhor esforço; pode atrasar/ser descartado, depende da API despertar. Preparado e desligado |
| Vercel Cron no Pro existente | Pode usar créditos incluídos, mas Functions têm consumo/cobrança | Scheduler gerenciado | Não mantém Render ligado; chamadas/duração podem cobrar. Não configurado |
| CLI em máquina/VM já disponível + timer do SO | Sem assinatura nova; energia/administração/uptime próprios | Não depende do navegador nem da API web, usa PostgreSQL | Máquina precisa estar ligada e credencial privada de banco protegida. CLI one-shot pronta; nenhum timer externo instalado |
| Render web/worker sempre ativo | Referência de entrada no pricing: US$ 7/mês por instância de 512MB, além de eventuais outros custos | Remove suspensão Free do serviço contratado | Requer aprovação; ainda precisa de scheduler e validação operacional. Não contratado; não garante 24/7 por si só |

Escolha entregue: um job diário, às 17:23 UTC, para tarefa real; cache por dia UTC e até cinco contas/tick. Nenhum keep-alive artificial. Sem workflow habilitado/secret novo/configuração de cobrança nesta missão. GitHub é scheduler, não motor de negociação; o backend confirma cada operação fictícia em transação.

Fontes oficiais:

- [Actions: runners padrão grátis em repositórios públicos; larger runners cobram](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- [Schedule: só branch padrão, atrasos e inatividade de 60 dias em repositórios públicos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- [Render Free: suspensão após 15 minutos, 750 horas compartilhadas e filesystem efêmero](https://render.com/docs/free).
- [Render pricing: verificar preço final/região antes de contratar](https://render.com/pricing).
- [Vercel Cron uso/preço](https://vercel.com/docs/cron-jobs/usage-and-pricing) e [Functions/consumo](https://vercel.com/docs/pricing).

Workflow usa ubuntu-latest padrão, não usa larger runner, upload de artifacts, cache novo ou e-mail externo. A configuração do agendamento só deve ser habilitada depois de autorização de merge/deploy e de smoke test com conta descartável. Repositório privado fica bloqueado pelo workflow para evitar assumir gratuidade de minutos. Notificações de falha do Actions dependem das preferências já existentes do proprietário.

Para uso 24h, proposta: contratar apenas após aprovação um backend/worker sempre ativo, manter o PostgreSQL dentro do plano adequado ao consumo, adicionar timer durável e monitor externo, testar desligamento/reinício, falha de fonte, duplicação e recuperação durante um período de observação. Definir orçamento mensal e alertas antes de habilitar recursos medidos. Uma assinatura Vercel Pro isolada não resolve a suspensão do Render.

O agendamento 3.0 real em nuvem e sua duração/quota não foram testados porque não há deploy autorizado. Foram testados dispatcher assinado, execução útil, repetição, lease/fencing e novo processo local sem navegador. Não declarar automação 24/7 a partir desses testes.
