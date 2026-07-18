# Propostas — 5 melhorias por módulo, cada uma por uma lente diferente (2026-07-18)

> Exercício pedido após o fecho do backlog da auditoria: para cada módulo, cinco
> propostas, cada uma como se viesse de um tipo diferente de desenvolvedor ou de
> usuário. Ancoradas no estado REAL do código em `main` (fotos de vestido já
> existem em bytea; leads têm WhatsApp; agenda é só visão-dia; CSV só na folha;
> o rastro de baixa do I10 está no banco sem tela que o leia).

## Leads (inclui Noivas, Orçamentos, Contratos)

1. **Vendedora** — Funil kanban com recontato. As etapas já existem
   (`NOVO → … → PERDIDO`), mas a lista é um grid de cards. Colunas arrastáveis +
   alerta "lead parado há N dias sem contato".
2. **Noiva (cliente final)** — Link somente-leitura do orçamento, com validade
   (token, sem login), no lugar do PDF por foto no WhatsApp; avisa a loja quando
   foi aberto.
3. **Dev de integrações** — Captação externa: endpoint público com token por
   loja para formulário do Instagram/site criar o lead como `NOVO`, com campo
   `origem`. Hoje todo lead nasce digitado à mão.
4. **Dev de dados/BI** — Motivo de perda estruturado (enum + texto) e relatório
   de conversão por etapa/origem. `PERDIDO` hoje não diz por quê.
5. **Dev de performance** — Busca/paginação server-side na lista de leads
   (índice trigram em nome/WhatsApp) — hoje carrega tudo e filtra no cliente; o
   mesmo movimento que o I12 fez com parcelas.

## Agenda (inclui Atendimentos, Provas, Ajustes)

1. **Recepcionista** — Visão semanal (grade semana × cabine); a tela atual é só
   "Atendimentos do Dia".
2. **Noiva** — Confirmação por WhatsApp: botão `wa.me` com mensagem pronta
   (data/hora/endereço) na criação e na véspera; reduz no-show sem integração
   paga.
3. **Dev QA** — Prova de concorrência de agendamento: dupla marcação da mesma
   cabine/horário sob `Promise.all` (o padrão que pegou C3/C4). Se a proteção é
   só validação na rota, falta constraint.
4. **Dev mobile/UX** — Ergonomia touch: arrastar atendimento entre
   horários/cabines; a vendedora usa o celular no salão.
5. **Costureira (ateliê)** — Fila de trabalho própria: "meus ajustes da semana"
   por data de prova, com checklist por peça — hoje é um card genérico na agenda
   de quem vende.

## Vestidos (inclui Catálogo, Reservas)

1. **Noiva** — Lookbook compartilhável: a seleção favoritada no atendimento vira
   link com as fotos (que já estão no banco) para rever em casa.
2. **Dev de performance** — Fotos com cache HTTP (`ETag`/`Cache-Control`) e
   thumbnail no upload; bytea inline re-baixa os bytes a cada listagem.
3. **Dona da loja** — Utilização por vestido: provas/reservas/contratos por
   período; decide o que sai de linha e o que merece réplica.
4. **Dev de segurança** — Upload validado: mime real (magic bytes), limite de
   tamanho, strip de EXIF.
5. **Vendedora** — "Próxima janela livre" calculada na tela do vestido (a regra
   de disponibilidade já existe), em vez de tentar data por data.

## Financeiro

1. **Contadora** — Exportação completa por competência (DRE, fluxo, pagar,
   receber); hoje só a folha sai em CSV.
2. **Dona da loja** — Régua de inadimplência: "vencida há N dias" em destaque +
   cobrança WhatsApp com mensagem pronta (a janela de vencimento do I12 já
   recorta).
3. **Dev de segurança** — Trilha de auditoria generalizada: tabela `audit_log`
   única para receber/estornar/baixar (o I10 gravou autor/motivo no contrato;
   generalizar o padrão).
4. **Dev arquiteto** — Um motor só de saldo/projeção em lib pura compartilhada;
   hoje frontend e backend calculam visões separadas que podem divergir por
   centavos.
5. **Dev QA** — Testes de propriedade (fast-check) no rateio de parcelas: somam
   exatamente o total para qualquer valor/n (C6 mostrou que centavos mordem).

## Comissões

1. **Vendedora** — "Minha comissão": visão da própria vendedora (extrato mensal
   + quanto falta para o degrau); a tela atual é de gestão e mostra todo mundo.
2. **Dona da loja** — Simulador de escada: "se a faixa fosse Y%, quanto teria
   pago nos últimos 3 meses?" — reusa o motor puro `calcularComissao`.
3. **Dev de dados** — Linha do tempo de regras: redefinir vigência substitui a
   escada e o histórico some da tela; expor versões responde "por que março
   pagou diferente?".
4. **Dev de segurança** — Relatório de baixas de estorno: o rastro do I10
   (quem/quando/motivo) está no banco e nenhuma tela o lê.
5. **Dev de performance** — Cache de competência fechada no preview (imutável
   após o fechamento); só o mês aberto merece cálculo ao vivo.

## Admin (Equipe, Permissões, Configurações)

1. **Dona da loja** — Log de atividade da equipe: últimos acessos e ações
   sensíveis por membro.
2. **Dev de segurança** — Convite por link (a própria pessoa define a senha) +
   troca forçada no primeiro acesso; hoje o admin digita a senha do colega e ela
   nunca expira.
3. **Dev SRE** — Status de backup visível em Configurações ("último backup: há X
   horas"); risco invisível vira rotina.
4. **Membro novo (usuário)** — Onboarding por perfil: tour das telas que o
   perfil libera; ação negada explica "peça ao admin" (passo seguinte do D5).
5. **Dev QA** — E2E da matriz de permissões: sweep por perfil padrão conferindo
   sidebar + ações contra a matriz — a régua vive espelhada à mão em backend e
   frontend.
