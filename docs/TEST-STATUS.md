# Relatório de validação — 13/10/2026

Referência: main, commit c0264277f2faf8ffc285dbfd390f3efb574213e0 de owagnerjrr/investwag. Somente estabilização da demonstração; nenhum próximo bloco de investimentos foi iniciado.

## Resultado local

Ambiente efetivamente usado: Windows, Node.js 24.21.0, npm 11.19.0, PostgreSQL 16.15, Prisma 6.19.3, Vite 6.4.4 e Playwright 1.64.0/Chromium. CI e Dockerfile preparados para Node.js 22 LTS. Não presumir resultados de Docker ou dispositivos físicos.

| Verificação executada | Resultado |
|---|---|
| npm install no frontend/backend; depois npm ci em ambos | Sucesso, instalação reproduzível pelos lockfiles |
| node --test ledger.test.js (npm test do frontend) | 6/6 passaram, incluindo os 5 testes originais |
| vite build (npm run build do frontend) | Sucesso; build final ~232,7 kB de JS, ~72,6 kB gzip |
| prisma validate e prisma generate | Sucesso após correção do schema e dependência transitiva |
| node --check app.js e server.js | Sucesso |
| migrate deploy em PostgreSQL novo | 2 migrations aplicadas |
| migrate deploy repetido | Nenhuma migration pendente; repetição segura |
| migrate status | Banco atualizado |
| migrate diff entre banco e schema, --exit-code | Sem divergência |
| Testes backend combinados: unitários + integração + upgrade | 16/16 passaram; inclui 2 testes simples, 12 cenários HTTP/PostgreSQL, 1 contêiner de integração e 1 teste de upgrade |
| Playwright desktop e Pixel 7 emulado, sobre build final | 6/6 passaram; fluxo completo e dois cenários de perda de resposta em cada dispositivo |
| Largura 320 px, ausência de overflow, revisão de capturas | Passou no E2E; capturas desktop/celular revisadas |
| npm audit frontend/backend | 0 vulnerabilidades reportadas na consulta executada |
| git diff --check | Sem erros de whitespace |

A CI agora instala por npm ci, valida/testa frontend e backend, aplica migrations em PostgreSQL 16 e executa integração, auditoria e E2E. Ela não contém deploy. O estado remoto atualizado deve ser consultado nos checks/logs do commit/PR; execução local não é prova de resultado remoto.

## Cenários de integração verificados

1. Health com consulta real ao banco e autenticação obrigatória em todas as rotas protegidas.
2. Cadastro válido/inválido, senha curta ou UTF-8 acima de 72 bytes, e-mail normalizado, duplicidade, hash de senha, login correto/incorreto e token não armazenado em texto puro.
3. Carteira inicial zero/pausada, aporte mínimo, centavos exatos, valor zero/negativo/exponencial/precisão inválida, valor acima do limite, saldo insuficiente e histórico sem alterações após rejeição.
4. Isolamento de duas contas; tentativa de indicar outro usuário rejeitada ou ignorada em consulta sem expor carteira alheia.
5. Pausar/reativar preservando patrimônio; payload inválido rejeitado e pausa específica por usuário.
6. Dez retiradas simultâneas de R$ 30 sobre R$ 100: três aceitas, sete rejeitadas, saldo final R$ 10.
7. Oito aportes simultâneos com a mesma chave: um criado e sete retornando a mesma operação; valor diferente com mesma chave rejeitado; mesma chave em outra carteira permitida.
8. Aportes/retiradas simultâneos e reconciliação do saldo com todo o livro-caixa no banco.
9. Encerramento da API e conexão original, novo processo/conexão, preservando saldo, histórico, pausa e sessão não expirada.
10. Expiração da sessão e revogação no logout.
11. CORS, JSON inválido, corpo acima de 16 KB e rota inexistente.
12. Limite de tentativas de autenticação (429).

Upgrade legado: schema original com usuário, senha hash, saldo e movimento preexistentes; baseline da migration inicial seguido da nova migration; dados preservados e chave de movimento preenchida. Schema final sem divergência.

E2E: cadastro/login, aporte/retirada fictícios, aporte abaixo do mínimo, saldo insuficiente, histórico, pausa/reativação, recarga/login com persistência, expiração no painel, logout e isolamento. Dois testes adicionais por dispositivo simulam perda da resposta da movimentação e perda da atualização de saldo; repetir mantém um único aporte.

## Correções

- Backend original não iniciava por erro de sintaxe no aporte; foi organizado em app testável e entrypoint com shutdown.
- Prisma original em uma linha não era um schema válido; formatado e acompanhado de migrations versionadas.
- Sessões em memória substituídas por hashes de tokens duráveis, expiração e revogação.
- Erros assíncronos tratados com resposta JSON e status apropriado; validação estrita, limite de bytes de senha e proteção de autenticação.
- Transação com lock por carteira e idempotência; constraints no banco impedem valores negativos e saldo não reconciliado.
- Livro-caixa local legado mantido; conversão exata e verificação de overflow acumulado.
- Interface desktop/celular, foco visível, labels, estados de carregamento, expiração e recuperação de resposta incerta.
- Documentação antiga corrigida: o painel já se comunicava com a API, embora os documentos dissessem o contrário.
- Lockfiles, configuração Vercel, Dockerfile e CI apenas de validação.
- Override deepmerge-ts 8.0.0 para corrigir vulnerabilidade transitiva na ferramenta Prisma. Referência: https://github.com/advisories/GHSA-ggr8-5vv4-36mx. CLI/client/migrations novamente validados.

## Falhas iniciais e recuperação

A inspeção confirmou o erro de sintaxe do backend. As primeiras tentativas de integração falharam porque o PostgreSQL ainda não estava disponível; a instância local foi iniciada em sessão persistente e os testes foram repetidos com sucesso. O primeiro E2E não abriu navegador porque o cache de browsers mudava entre sandboxes; um diretório estável foi configurado e os E2E foram repetidos com sucesso. A auditoria inicialmente reportou 3 ocorrências da mesma cadeia transitiva vulnerável no backend; após o override, reportou zero. Nenhuma dessas tentativas foi registrada como sucesso.

## Pendências e limites

- Não houve deploy, contratação de serviço, configuração de cobrança ou operação real.
- Docker/container não compilado neste ambiente sem Docker.
- Não houve teste em telefone físico, Safari/iOS ou URLs públicas. Celular foi emulado em Chromium.
- Publicação exige autorização, escolha de host, HTTPS, variáveis privadas, PostgreSQL persistente, backups e smoke test nos endereços finais.
- Tokens apenas em memória do navegador: recarregar exige login; os dados ficam no banco. História visível limitada às últimas 100 linhas, com todos os movimentos persistidos.
- Limites de requisição são por instância; alvo atual é um backend demonstrativo único. Escala exige limite compartilhado/proxy adequado.
- Sem recuperação de senha, verificação de e-mail, MFA, engine/scanner/PaperBroker ou integrações reais.

## Publicação e variáveis

Veja [DEPLOYMENT.md](DEPLOYMENT.md) para instruções completas, inclusive baseline de banco legado e cuidados com publicação automática por Git.

Frontend: VITE_API_URL (URL HTTPS pública da API). Backend: DATABASE_URL (privada), CORS_ORIGIN (origem exata do frontend), PORT, NODE_ENV e TRUST_PROXY (0 por padrão). SESSION_SECRET não é usada. Não colocar segredos em VITE_* ou no Git.

Vercel: raiz do repositório, Vite, npm ci, npm run build, output dist. Backend: root server, npm ci + npm run build, release npm run db:migrate, start npm start, health /health. PostgreSQL exclusivo para demonstração; banco _test separado para testes. Não executar reset em banco com dados.
