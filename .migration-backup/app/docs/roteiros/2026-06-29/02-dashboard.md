# Roteiro de jornada — Dashboard (Início)

## Propósito (1-2 linhas)
A "mesa principal do atelier": uma visão única do dia que reúne saudação, agenda de hoje, atenções financeiras, indicadores, urgências, a jornada das noivas ativas, os próximos casamentos e um vestido em destaque. Prioriza operação (70%) com toque de atmosfera premium (30%), na direção Concierge Atelier.

## Personas e permissões (quem usa; gates exigidos)
A tela é a primeira de qualquer usuário com loja ativa (recepção, vendedora, admin da loja, costureira, super-admin). O conteúdo se molda por dois gates de módulo, resolvidos no servidor antes de renderizar (`page.tsx:25-31`, via `podeNoModulo`):

- **`leads:ver`** — destrava os indicadores do dia, as atenções imediatas, a jornada do atelier e os próximos casamentos. Sem ele, esses blocos somem e o foco migra para o acervo (`page.tsx:66,89,94`).
- **`financeiro:ver`** — destrava o financeiro do dia ("A receber"/"A pagar" dentro de "Hoje no atelier") e o aviso de contas vencidas. Sem ele, o dado financeiro nunca é consultado — `vencidasDaLoja` é trocado por `Promise.resolve(null)` e `detalheDoDia` recebe `{ financeiro: false }`, que retorna listas vazias sem tocar `Parcela`/`ContaPagar` (`page.tsx:29-30`, `dia.ts:88-97`).

Gates em camadas a montante: `(app)/layout` garante sessão + loja ativa; `loja/[lojaId]/layout` espelha URL × loja. A page é só leitura (não há mutação no Dashboard). As permissões são enforcement real de dados, não apenas UX — `financeiro:false` impede a query, não só esconde o bloco.

## Rotas/telas envolvidas (rota → arquivo)
- `/` (hub) → `src/app/(app)/page.tsx` — só redireciona para `/loja/${lojaId}` (`page.tsx:11`).
- `/loja/[lojaId]` (Dashboard) → `src/app/(app)/loja/[lojaId]/page.tsx` — `force-dynamic`, componente `DashboardLoja`. Largura central `max-w-[900px]` (`page.tsx:19,45`).
- Boundary de erro → `src/app/(app)/loja/[lojaId]/error.tsx` (citado no estado-por-modulo; não impacta o caminho feliz).
- Componentes em `src/components/dashboard/*`; agregadores em `src/lib/loja/painel.ts`, `src/lib/calendario/dia.ts`, `src/lib/financeiro/vencidas.ts`, `src/lib/leads/jornada.ts`.

## Jornada(s) principal(is)

### Jornada A — "A recepcionista abre o dia" · recepção/vendedora com leads:ver e financeiro:ver · objetivo: entender em 5 segundos o que o dia pede
1. **[saudação]** Ao entrar (redirecionada de `/` para `/loja/[lojaId]`), a usuária vê uma faixa editorial: data por extenso, "Bom dia/Boa tarde/Boa noite, {primeiroNome}." e o nome da loja → o sistema deriva a faixa horária por corte 12h/18h no fuso `America/Sao_Paulo` e o primeiro nome via `nome.split(" ")[0]` (`page.tsx:33-42`, render em `SaudacaoDia` `saudacao-dia.tsx:15-26`). Abaixo, uma divisória champagne (linha institucional, não decoração — `page.tsx:54`).
2. **[Hoje no atelier]** Vê a seção-coração do dia, com até cinco listas: Atendimentos, Provas, Casamentos, A receber, A pagar → `detalheDoDia(lojaId, hojeYMD(), { financeiro: true })` busca tudo o que cai na janela `[meia-noite UTC, +1 dia)` (`page.tsx:29`, `dia.ts:60-98`). Atendimentos e provas mostram hora (UTC), nome da noiva, cabine/vendedora ou vestido; casamentos destacam a noiva em bordô; recebíveis/contas mostram valor `brl` e status (`dia-do-atelier.tsx:37-94`). Provas têm link "Abrir" para a reserva (`dia-do-atelier.tsx:58-60`).
   - **ATRITO:** a hora é formatada em `timeZone: "UTC"` (`dia-do-atelier.tsx:8`), enquanto a saudação usa `America/Sao_Paulo` (`page.tsx:35`). Um atendimento gravado às 9h pode exibir um horário deslocado para quem lê em horário de Brasília — convivem dois fusos na mesma tela.
   - **ATRITO:** quando o dia está vazio, o bloco não some — exibe "Nada agendado para este dia." (`dia-do-atelier.tsx:31`). É o único bloco que ocupa espaço mesmo vazio (contraria o princípio "ausência é a calma" dos demais).
3. **[atenções de financeiro]** Logo abaixo, se houver contas vencidas, vê uma faixa com borda bordô: "{n} a receber · R$…" e/ou "{n} a pagar · R$…", cada um link para `/financeiro/receber` ou `/financeiro/pagar` → `vencidasDaLoja` soma em centavos as `Parcela`/`ContaPagar` PREVISTA com `vencimento < hoje` (`page.tsx:30`, `vencidas.ts:16-31`). O componente retorna `null` se ambas as quantidades forem zero (`aviso-vencidas.tsx:9`) — só aparece quando há atraso real.
4. **[indicadores do dia]** Vê um strip de 4 números grandes: Noivas (em acompanhamento), Acervo (vestidos), Casamentos (próximos 30 dias) e Em provas (com `atencao` — vira bordô se > 0) → derivados de `carregarPainel` (`page.tsx:67-85`, `painel.ts:96-120`). "Em provas" usa o toque de bordô-joia (`indicador-dia.tsx:16`).
   - **ATRITO:** o card "Acervo" do strip duplica conceitualmente o card "Acervo" que aparece no caminho sem leads (`page.tsx:71-73` vs `119-124`) e também o "Destaque do atelier" — o acervo é citado três vezes potenciais na mesma página.
5. **[atenções imediatas]** Se houver noivas com casamento ≤14 dias ainda em orçamento aberto ou em provas, vê um painel com monograma (iniciais), nome, etapa e "casa em X dias" + data → `painel.atencoes` filtra `ESTAGIOS_ATENCAO` (`orcamento_aberto`, `em_provas`) dentro de `JANELA_URGENCIA_DIAS` (`page.tsx:89-91`, `painel.ts:25,122-135`, render `painel-atencoes.tsx:26-56`). Tom calmo, rosé como detalhe — não alarme.
6. **[jornada + casamentos]** Vê duas colunas: à esquerda "Jornada do atelier" (linha do tempo com as etapas vivas e a contagem de noivas em cada uma, link "Ver todas as noivas"); à direita "Casamentos próximos" (até 5, monograma + data + "em X dias") → `painel.jornada` agrega estágios derivados por `estagioDaNoiva(fatosDeLead(...))` e `painel.proximosCasamentos` ordena os futuros (`page.tsx:94-114`, `painel.ts:90-116`, render `painel-jornada.tsx`/`lista-casamentos.tsx`). Cada coluna tem fallback `PainelVazio` quando não há dado.
7. **[destaque do atelier]** Por fim, se houver um vestido ativo com foto de capa, vê um card editorial com a foto (apoio, 3:4, modesta), nome, código/categoria e link "Ver no acervo" → `painel.destaque` pega `db.vestido.findFirst` ativo com foto ordem 0, mais recente por `updatedAt`; a URL da foto leva `?v={versaoFoto}` para cache-busting (`page.tsx:136`, `painel.ts:70-80,137-145`, render `destaque-atelier.tsx:15-20`).

### Jornada B — "A costureira chega para a fila do dia" · perfil SEM leads:ver e SEM financeiro:ver · objetivo: orientação calma sem expor dado que não lhe cabe
1. **[saudação]** Igual à Jornada A — saudação e data aparecem para todos (`page.tsx:46-51`).
2. **[Hoje no atelier]** Vê a agenda do dia, mas as seções "A receber" e "A pagar" **nunca aparecem** — `detalheDoDia` recebe `{ financeiro: false }` e devolve `aReceber: []`/`aPagar: []` sem consultar o banco (`dia.ts:88-97`). Atendimentos, provas e casamentos seguem visíveis.
   - **ATRITO:** a costureira normalmente cuida de provas e ajustes, mas vê também todos os atendimentos comerciais do dia, sem filtro por relevância ao seu papel. A page não distingue função dentro de `leads:ver`/sem-financeiro.
3. **[atenções de financeiro]** **Ausente.** `vencidas` é `null` (`page.tsx:30`), então `{vencidas && <AvisoVencidas/>}` nem renderiza (`page.tsx:62`). A ausência é a calma — nenhum dado financeiro vaza.
4. **[indicadores]** **Ausentes.** Todo o strip de 4 indicadores está atrás de `{podeVerNoivas && ...}` (`page.tsx:66`).
5. **[atenções imediatas]** **Ausentes.** Também atrás de `podeVerNoivas` (`page.tsx:89`).
6. **[centro de operação]** Em vez de jornada + casamentos, vê **um único card de Acervo**: se há vestidos, `CardMetrica` "Acervo · N vestidos no acervo" com link "Ver acervo"; se vazio, `PainelVazio` "Cadastrar vestido" (`page.tsx:116-133`). É a substituição deliberada — "sem expor dado de jornada".
7. **[destaque do atelier]** **Aparece** se houver vestido com foto — `painel.destaque` não depende de `leads:ver` (`page.tsx:136`).
   - **ATRITO:** para esse perfil, a página vira essencialmente "agenda do dia + acervo + um vestido". O acervo aparece duas vezes (card central + destaque), o que pode soar redundante numa tela já enxuta.

## Ramificações e estados de borda (blocos vazios, sem permissão)
- **Sem `leads:ver`:** somem indicadores, atenções imediatas, jornada e casamentos; entram o card/painel de Acervo (`page.tsx:66,89,94,116-133`).
- **Sem `financeiro:ver`:** somem "A receber"/"A pagar" do dia e o aviso de vencidas; queries financeiras não rodam (`page.tsx:30,62`, `dia.ts:88-97`).
- **Dia sem agenda:** "Hoje no atelier" mostra texto "Nada agendado para este dia." (não desaparece — `dia-do-atelier.tsx:31`).
- **Sem contas vencidas:** `AvisoVencidas` retorna `null` mesmo com permissão (`aviso-vencidas.tsx:9`).
- **Jornada vazia / sem casamentos:** cada coluna cai num `PainelVazio` com microcopy e, na jornada, CTA "Receber primeira noiva" (`page.tsx:98-113`).
- **Acervo vazio (sem leads):** `PainelVazio` "Cadastrar vestido" (`page.tsx:125-130`).
- **Sem vestido com foto:** "Destaque do atelier" não renderiza (`page.tsx:136`).
- **Noivas concluídas/perdidas/casadas:** excluídas dos indicadores e da jornada por `noivaAtiva` (fora se perdida, casada ou devolvida — `jornada.ts:99-102`, `painel.ts:96`). Mas ainda contam em "Casamentos próximos" (filtro só por data futura, `painel.ts:107-116`).
- **Sessão sem loja:** `getSessaoComLoja()` nulo → `return null` (defensivo; o layout a montante já teria barrado — `page.tsx:22-23`).
- **`force-dynamic`:** a página nunca é cacheada; cada visita reconsulta tudo (`page.tsx:19`).

## Pontos de fricção observados no código real
1. **Dois fusos na mesma tela.** Saudação em `America/Sao_Paulo` (`page.tsx:35`) e horários da agenda em `UTC` (`dia-do-atelier.tsx:8`). Para um atelier em Brasília, os horários de atendimento/prova podem exibir deslocamento — risco de operação ler a hora errada. `casamentoData` em UTC é correto (data-só), mas `Atendimento.inicio` é wall-clock UTC e fica ambíguo na leitura.
2. **"Hoje no atelier" não respeita "a ausência é a calma".** Todos os demais blocos somem quando vazios; só este ocupa espaço com "Nada agendado para este dia." (`dia-do-atelier.tsx:31`). Em um dia tranquilo, a primeira seção abaixo da saudação é um vazio textual.
3. **Acervo repetido.** O acervo aparece como indicador (com leads), como card central (sem leads) e como "Destaque do atelier" (`page.tsx:71-73,119-124,136`). Sem `leads:ver`, o usuário vê acervo duas vezes seguidas — redundância numa tela que deveria ser enxuta.
4. **Sem âncora de tempo/atualização visível.** `force-dynamic` recarrega a cada visita, mas não há indicação de "atualizado às" nem auto-refresh; numa "mesa do dia" aberta o dia todo, os números congelam até um reload manual.
5. **"Casamentos próximos" inclui noivas já encerradas.** O filtro é só `casamentoData` futura (`painel.ts:107-109`), sem passar por `noivaAtiva` — uma noiva marcada como perdida mas com data futura ainda apareceria na lista, divergindo do conceito de acompanhamento ativo usado nos indicadores.
6. **Nenhuma ação direta nas atenções.** "Atenções imediatas" e "Casamentos próximos" não têm link por linha para o perfil da noiva (`painel-atencoes.tsx`/`lista-casamentos.tsx` são puramente presentacionais) — o usuário identifica a urgência mas precisa navegar manualmente até a noiva.
7. **Granularidade de papel inexistente.** O conteúdo varia só por `leads:ver`/`financeiro:ver`; uma costureira e uma vendedora com o mesmo gate veem a mesma agenda comercial, sem priorização por função.

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)
- **Unificar o fuso de exibição.** Mostrar horários da agenda no fuso do atelier (ou rotular explicitamente), eliminando a divergência saudação×agenda.
- **Tornar "Hoje no atelier" também silencioso quando vazio**, ou trocar o texto por um microcopy acolhedor com próxima ação ("Nenhum atendimento hoje — que tal receber uma noiva?").
- **Linhas acionáveis nas atenções e casamentos.** Cada noiva linkando para `/noivas/[id]` (e talvez `wa.me` direto), transformando o painel de leitura em ponto de partida de ação.
- **Resolver a redundância do acervo** — escolher entre indicador, card e destaque conforme o perfil, evitando citar acervo três vezes.
- **"Atualizado às HH:MM" + refresh leve** para a mesa que fica aberta o dia inteiro, reforçando a sensação de operação viva sem quebrar `force-dynamic`.
- **Filtrar "Casamentos próximos" por `noivaAtiva`** (ou marcar visualmente noivas encerradas), alinhando a lista ao conceito de acompanhamento dos indicadores.
- **Camada de personalização por papel** dentro de `leads:ver` — costureira começando por provas/ajustes, vendedora por atendimentos — sem mexer nos gates de segurança.
