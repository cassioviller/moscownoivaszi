# Roteiro de jornada — Vestidos (acervo) · Catálogo

## Propósito (1-2 linhas)
Gerir o acervo como peças de coleção (cadastro, fotos otimizadas, características, disponibilidade) e manter o **vocabulário de características** (Catálogo) que é compartilhado entre vestido e interesse — a base que casa noiva × vestido na indicação (`app/src/lib/indicacao/indicacao.ts`).

## Personas e permissões (gates)
- **Vestidos** (módulo `vestidos`): `vestidos:ver` (grade + detalhe), `vestidos:criar` (novo), `vestidos:editar` (editar, fotos, reservar/cancelar/manutenção). Reservar exige **também** `leads:ver` (para listar noivas) — `vestidos/[vestidoId]/page.tsx:78-89`.
- **Catálogo** (módulo `config`): a página entra por `exigirAcesso("config")` (`catalogo/page.tsx:17`); `config:criar` (novo atributo) e `config:editar` (editar/ativar/desativar) controlam os botões e as actions. Módulos válidos em `app/src/lib/permissoes/modulos.ts:6`.
- **Concierge/vendedora**: tipicamente vê e cadastra vestidos, reserva. **Admin/config**: única persona que edita o Catálogo — característica deliberada (vocabulário é decisão de gestão, não de operação diária).
- Personas sem o gate são **redirecionadas** (não veem 403): `vestidos:ver` ausente → volta para `/loja/[lojaId]` (`vestidos/page.tsx:21`); `config` ausente → idem via `exigirAcesso`.

## Rotas/telas envolvidas (rota → arquivo)
- `/loja/[lojaId]/vestidos` → `app/src/app/(app)/loja/[lojaId]/vestidos/page.tsx` (grade do acervo)
- `/loja/[lojaId]/vestidos/novo` → `.../vestidos/novo/page.tsx` (cadastro)
- `/loja/[lojaId]/vestidos/[vestidoId]` → `.../vestidos/[vestidoId]/page.tsx` (detalhe/lookbook)
- `/loja/[lojaId]/vestidos/[vestidoId]/editar` → `.../vestidos/[vestidoId]/editar/page.tsx` (form + fotos)
- `/loja/[lojaId]/vestidos/[vestidoId]/foto/[ordem]` → `.../foto/[ordem]/route.ts` (GET dos bytes WebP, autenticado)
- Server Actions: `.../vestidos/actions.ts` (criar/editar), `.../vestidos/fotos-actions.ts` (subir/remover foto), `.../vestidos/[vestidoId]/reserva-actions.ts` (reservar/cancelar/manutenção)
- Libs: `app/src/lib/vestidos/vestidos.ts`, `app/src/lib/vestidos/fotos.ts`
- `/loja/[lojaId]/catalogo` → `app/src/app/(app)/loja/[lojaId]/catalogo/page.tsx` (lista todos os atributos, inclui inativos)
- `/loja/[lojaId]/catalogo/novo` → `.../catalogo/novo/page.tsx`
- `/loja/[lojaId]/catalogo/[atributoId]/editar` → `.../catalogo/[atributoId]/editar/page.tsx`
- Form compartilhado de catálogo: `.../catalogo/atributo-form.tsx`; action: `.../catalogo/actions.ts`; lib: `app/src/lib/catalogo/catalogo.ts`
- Componente de características (vestido e interesse): `app/src/components/catalogo/catalogo-campos.tsx`

## Jornada(s) principal(is)

### J1 — Cadastrar vestido · concierge/admin (`vestidos:criar`) · objetivo: registrar uma peça nova no acervo
1. **[/vestidos]** Usuário clica em **"Novo vestido"** → o sistema confere `vestidos:criar` e renderiza o botão só se permitido (`vestidos/page.tsx:40-49`).
2. **[/vestidos/novo]** A página carrega o catálogo ativo da loja para montar os campos de característica (`novo/page.tsx:16` → `listarCatalogo`); renderiza `VestidoForm`.
3. **[/vestidos/novo]** Usuário preenche **Código** (obrigatório), **Nome** (obrigatório), **Preço (R$)** e, opcionalmente, escolhe uma opção por característica do catálogo (selects `attr-<id>`), além de Tamanho/Cor/Categoria/Observações (`vestido-form.tsx:41-69`).
4. **[/vestidos/novo]** Usuário envia → `criarVestidoAction` confere o gate de novo, lê o catálogo e **valida as seleções** contra ele (`actions.ts:12-23` → `escolhasDoForm`/`validarSelecoes`), depois chama `criarVestido` (`actions.ts:40`).
5. **[lib]** `criarVestido` valida e **normaliza o preço pt-BR** (`vestidos.ts:30-37` `parsePreco`: `"2.400,00"→2400`, `"150,50"→150.5`; recusa ≤0 ou não-numérico) e grava o vestido + as características como `VestidoAtributo` por escrita aninhada `create` (`vestidos.ts:122-141` `nestedAtributos`).
6. **[/vestidos?ok=1]** Sucesso → redireciona para a grade com aviso "Vestido salvo." (`actions.ts:44`, `page.tsx:52`).
   - **ATRITO:** o cadastro **não tem upload de foto** — fotos só existem na tela de edição. Toda peça nova nasce sem retrato e exige uma segunda viagem a `/editar` (ver J3). O próprio detalhe convida "Adicionar foto", mas leva a `/editar`.
   - **ATRITO:** o campo Preço é um `<input type="text">` sem máscara nem dica de formato (`vestido-form.tsx:43`); o usuário só descobre o formato aceito se errar (mensagem "Informe um preço válido").

### J2 — Editar vestido (substitui características) · admin/concierge (`vestidos:editar`) · objetivo: corrigir dados e características
1. **[/vestidos/[id]]** No detalhe, usuário clica em **"Editar vestido"** (`[vestidoId]/page.tsx:346-358`, só com `vestidos:editar`).
2. **[/vestidos/[id]/editar]** A página carrega o vestido com suas seleções, o catálogo e os metadados de fotos (`editar/page.tsx:27-33`) e **prefilla** os selects com as seleções atuais (`editar/page.tsx:33` → `selecoes`).
3. **[/vestidos/[id]/editar]** Usuário altera campos/características e salva → `editarVestidoAction` (`actions.ts:47`).
4. **[lib]** `editarVestido` revalida, e para as características usa modo **`replace`**: `deleteMany {}` + `create` **substitui o conjunto inteiro** de `VestidoAtributo` (`vestidos.ts:122-128,143-153`). Não há merge — o que estiver no form vira a verdade.
   - **ATRITO:** o "replace" total é silencioso. Se o usuário abrir editar e o catálogo tiver **um atributo novo não preenchido**, salvar não apaga nada errado; mas se uma característica antes preenchida some do catálogo ativo (desativada), ela some do prefill e, ao salvar, **deixa de ser regravada** — a peça perde aquela característica sem aviso.

### J3 — Subir/trocar fotos (2 slots, pipeline sharp/webp, sem JS) · `vestidos:editar` · objetivo: dar retrato à peça
1. **[/vestidos/[id]/editar]** Abaixo do form, `FotosVestido` renderiza **exatamente 2 slots** (ordens 0 e 1) como server component — cada slot é um `<form>` com Server Action, **sem JavaScript de cliente** (`fotos-vestido.tsx:36-39,78-98`).
2. **[/vestidos/[id]/editar]** Usuário escolhe um arquivo (`accept="image/*"`) e clica **"Adicionar foto"/"Trocar foto"** → `subirFotoAction` (`fotos-actions.ts:23`).
3. **[action]** A action confere `vestidos:editar`, lê `ordem` (coage para 0 ou 1, `fotos-actions.ts:10-12`), valida que veio um `File` não vazio e chama `salvarFoto` (`fotos-actions.ts:29-36`).
4. **[lib]** `salvarFoto` confirma que o **vestido pai é da loja** antes de tocar a filha sem `lojaId` (`fotos.ts:25-31,73` `exigirVestidoDaLoja`, falha fechada), rejeita vazio e **>12MB** (`fotos.ts:76-77`), e roda o **pipeline sharp**: `.rotate()` (EXIF) → `.resize(1400, inside, withoutEnlargement)` → `.webp(q80)` (`fotos.ts:82-86`). Persiste os bytes WebP no Postgres via `upsert` por `vestidoId_ordem` (`fotos.ts:101-105`) — sem object storage.
5. **[/editar?fotoOk=1]** Sucesso → `revalidatePath` + redirect com aviso "Foto atualizada." (`fotos-actions.ts:41-42`). `versao = updatedAt` muda → `?v=` na URL busta o cache.
6. **Remover:** `removerFotoAction` → `removerFoto` (`deleteMany`, idempotente, `fotos.ts:109-113`).
   - **ATRITO:** limite **rígido de 2 fotos** sem caminho para mais; uma boutique normalmente quer frente/costas/detalhe/cauda. Os slots são fixos por índice (0/1), sem reordenar nem definir capa que não seja a ordem 0.
   - **ATRITO:** imagem inválida ou corrompida só falha **após** o upload, via redirect com `?fotoErro=` ("Envie um JPG, PNG ou WebP." — `fotos.ts:90`); sem validação no cliente nem preview antes de enviar.

### J4 — Servir a foto por rota autenticada · qualquer persona com sessão · objetivo: exibir a imagem sem vazar entre lojas
1. **[<img src=.../foto/0?v=...>]** Grade e detalhe apontam um `<img>` simples para o route handler (`page.tsx:83`, `[vestidoId]/page.tsx:143-149`, `fotos-vestido.tsx:63-70`).
2. **[route GET]** O handler exige sessão (401 se não houver), **confere `lojaId` da URL == loja da sessão** (404 se divergir), coage a ordem para 0/1 e busca os bytes via `obterFotoBytes` (que reconfirma o vestido na loja) (`foto/[ordem]/route.ts:13-23`).
3. **[route GET]** Responde os bytes WebP com `Cache-Control: private, max-age=1 ano, immutable` + `ETag` derivado de versão (`route.ts:25-31`). `next/image` é **evitado de propósito** — não cabe num route dinâmico autenticado (`fotos-vestido.tsx:60-61`).
   - **ATRITO:** cada foto da grade é uma requisição autenticada ao servidor que lê bytes do Postgres; com acervo grande, a grade dispara muitas leituras de blob (sem CDN/storage).

### J5 — Detalhe / lookbook: disponibilidade, reservar/cancelar, manutenção, características · `vestidos:ver` (+`editar`/`leads:ver` para mutar) · objetivo: ver e movimentar a peça
1. **[/vestidos/[id]]** A página carrega vestido, fotos, catálogo, flags e **reservas + manutenções** em paralelo (`[vestidoId]/page.tsx:75-82`). Layout lookbook: foto âncora à esquerda (sticky), fatos à direita.
2. **[/vestidos/[id]]** **Disponibilidade**: selo "Livre" (sem reservas) vs "Reservada" (`page.tsx:185-193`); lista cada reserva com noiva + data do casamento (`page.tsx:200-225`).
3. **[/vestidos/[id]]** **Reservar**: com `vestidos:editar` **e** `leads:ver`, mostra select de **noivas que já têm data de casamento** (`page.tsx:86-89,231-249`). Enviar → `reservarPeloVestidoAction`: a data **vem da noiva** (não se digita), valida noiva/data e chama `reservarVestido`; conflito de janela volta `?erro=indisponivel&em=<data>` com mensagem que ensina (`reserva-actions.ts:13-34`, `page.tsx:96-100`).
4. **[/vestidos/[id]]** **Cancelar reserva**: `BotaoConfirmar` → `cancelarReservaPeloVestidoAction` → `removerBloqueio` (`reserva-actions.ts:36-48`).
5. **[/vestidos/[id]]** **Manutenção**: bloco com lista + `RegistrarManutencao` → `enviarManutencaoAction` (período + motivo) / `removerManutencaoAction` (`page.tsx:256-298`, `reserva-actions.ts:50-78`).
6. **[/vestidos/[id]]** **Características**: `rotularSelecoes` traduz os atributos em pares legíveis "Nome: valor" (`page.tsx:91,303-315`); vazio **não some em silêncio** — convida a "Complete para melhorar as indicações" (`page.tsx:317-335`).
   - **ATRITO:** se a vendedora tem `vestidos:editar` mas **não** `leads:ver`, o bloco de reservar simplesmente **não aparece** (`page.tsx:229-230`) — some sem explicar por quê.
   - **ATRITO:** a data de reserva é sempre a do casamento da noiva; não há reserva avulsa por período arbitrário pela peça (ok para o domínio, mas surpreende quem espera escolher datas).

### J6 — Navegar a grade (sem filtro/busca) · `vestidos:ver` · objetivo: encontrar uma peça
1. **[/vestidos]** `listarAcervo` traz todas as peças **ordenadas só por nome**, com capa (foto ordem 0) e selo "fora do acervo" se `status != ativo` (`vestidos.ts:84-107`, `page.tsx:72-107`).
   - **ATRITO:** **não há busca, filtro por característica, por status, por categoria nem paginação** — confirmado: a única ordenação é `orderBy: { nome: "asc" }`. Num acervo real isso vira rolagem infinita; e a própria indicação que o Catálogo alimenta **não tem contraparte de filtro manual** na grade.

### J7 — Catálogo: criar atributo · admin (`config:criar`) · objetivo: ampliar o vocabulário de características
1. **[/catalogo]** Lista **todos** os atributos (inclusive inativos), com tipo ("opção única"/"escala") e resumo das opções ativas (`catalogo/page.tsx:66-101`). "Novo atributo" só com `config:criar`.
2. **[/catalogo/novo]** Usuário informa **Nome**, **Tipo** (`OPCAO_UNICA` ou `ESCALA`) e **opções, uma por linha** (`atributo-form.tsx:40-116`).
3. **[action/lib]** `criarAtributoAction` → `criarAtributo`: exige nome, valida tipo contra `{OPCAO_UNICA, ESCALA}` (`catalogo.ts:114,130-133`), `parseLinhas` deduplica opções case-insensitive pt-BR (`catalogo.ts:116-128`), exige ≥1 opção, e `exigirNomeLivre` garante **nome único por loja case-insensitive** (`catalogo.ts:166-172,174-194`). `ordem` = próximo após o máximo. Cria atributo + opções por escrita aninhada.
4. **[/catalogo?ok=1]** Sucesso → "Catálogo atualizado." A partir daí o atributo **aparece automaticamente** no cadastro de vestidos e de interesses (`listarCatalogo` filtra `ativo:true`).
   - **ATRITO:** o tipo **ESCALA não tem UI nem comportamento próprios** — o `CatalogoCampos` renderiza um `<select>` idêntico ao de OPCAO_UNICA (`catalogo-campos.tsx:23-37`) e a indicação faz **match exato de opção** sem noção de "grau/proximidade" (`indicacao.ts:101-107`). ESCALA hoje é só um rótulo; não entrega ordenação por intensidade.

### J8 — Catálogo: editar/ativar/desativar opções (nunca DELETE) · admin (`config:editar`) · objetivo: ajustar sem quebrar dados
1. **[/catalogo/[id]/editar]** Carrega o atributo com **todas** as opções (`obterAtributo`, `catalogo.ts:149-159`); o form mostra o toggle "Atributo ativo", cada opção com campo de texto + checkbox "ativa", e um campo para **adicionar** novas opções (`atributo-form.tsx:65-116`).
2. **[action/lib]** `editarAtributoAction` → `editarAtributo`: revalida nome (livre, exceto o próprio), tipo e que nenhuma opção existente fique em branco (`catalogo.ts:209-215`). Aplica `update` nas existentes (renomeia / `ativo`) e `create` nas novas — **nunca `delete`** (`catalogo.ts:226-241`).
3. **[efeito]** Desativar uma opção a remove de `listarCatalogo` (só ativos) e dos formulários; dados já gravados em `VestidoAtributo`/`LeadInteresseAtributo` permanecem (FK), e a leitura defensiva `rotularSelecoes` **ignora em silêncio** a opção que sumiu do ativo (`catalogo.ts:83-97`).
   - **ATRITO:** não há como apagar um atributo/opção criado por engano — só desativar; a lista acumula "lixo inativo" visível só nesta tela de gestão.

### Como o Catálogo alimenta a indicação noiva × vestido
- Vestido e interesse escolhem do **mesmo** `Atributo`/`AtributoOpcao` (`catalogo.ts:1-10`). A noiva grava `LeadInteresseAtributo`; o vestido grava `VestidoAtributo`.
- `indicarVestidos` (`indicacao.ts:56-132`): lê o interesse, monta o desejado `atributoId→opcaoId`, itera o **catálogo ativo** (ordem determinística; descarta atributo desativado), e para cada vestido ativo conta os pares que **coincidem exatamente** (`pontos`), monta `combinam`/`faltam`, e ordena: dentro-do-teto de orçamento → mais pontos → mais barato (`indicacao.ts:122-131`). Sem nenhum atributo em comum, o vestido não aparece.
- Logo, **a qualidade da indicação depende de (a) o Catálogo ter atributos úteis e (b) cada vestido ter características preenchidas** — daí o convite "Complete" no detalhe (J5.6) ser estratégico, não cosmético.

## Ramificações e estados de borda
- **Código duplicado (P2002):** `criarVestido`/`editarVestido` capturam o erro Prisma `P2002` (unique `[lojaId, codigo]`) e traduzem para "Já existe um vestido com esse código" (`vestidos.ts:47-52`). É a única validação de unicidade do vestido — depende do banco, não de checagem prévia.
- **Nome de atributo duplicado:** ao contrário do vestido, o Catálogo **não** usa P2002 — faz checagem manual `exigirNomeLivre` por `findMany` + comparação case-insensitive pt-BR (`catalogo.ts:166-172`). Há janela teórica de corrida, mas o domínio é de baixa concorrência.
- **Limite de 2 fotos:** `exigirOrdem` rejeita qualquer ordem ≠ 0/1 (`fotos.ts:20-22`), e a UI só renderiza 2 slots. Hard limit por design.
- **ESCALA sem UI própria:** tipo aceito e persistido, mas sem componente nem lógica de pontuação diferenciada (ver J7 ATRITO).
- **Tenant / filhas sem `lojaId`:** `VestidoFoto`, `VestidoAtributo`, `AtributoOpcao` não têm `lojaId`; só são tocadas via o pai escopado (`exigirVestidoDaLoja`, escrita aninhada) — falha fechada se o pai não for da loja.
- **Vestido/atributo de outra loja:** `obterVestido`/`obterAtributo` retornam null (tenantPrisma) → páginas redirecionam para a lista (`[vestidoId]/page.tsx:73`, `editar/page.tsx:28`, catálogo idem).
- **Foto inválida / >12MB / vazia:** erros tratados em `salvarFoto` e devolvidos via `?fotoErro=` (`fotos.ts:76-77,89-91`).
- **Reserva sem data / sem noiva / conflito / datas invertidas:** mapeadas para mensagens humanas em `AVISOS` (`[vestidoId]/page.tsx:44-53`).

## Pontos de fricção observados no código real
1. **Grade cega (J6):** `listarAcervo` só ordena por nome — zero busca/filtro/paginação. O acervo cresce e a navegação degrada; e o vocabulário rico do Catálogo não vira filtro manual.
2. **Foto desacoplada do cadastro (J1/J3):** não dá para subir foto ao criar; toda peça nova nasce sem retrato e exige ir a `/editar`. Limite rígido de 2 fotos, sem preview nem validação no cliente.
3. **ESCALA é só rótulo (J7):** tipo distinto na UI de criação, mas sem UI nem scoring próprios — a indicação trata tudo como match exato; promete graduação que não entrega.
4. **Replace total silencioso de características (J2):** editar substitui o conjunto inteiro; característica desativada no catálogo some do prefill e é perdida ao salvar, sem aviso.
5. **Gates que escondem sem explicar (J5):** faltando `leads:ver`, o bloco de reservar simplesmente desaparece; a equipe não entende por que "não consegue reservar".
6. **Preço sem máscara (J1):** input de texto livre; o formato pt-BR só é ensinado pelo erro, não pela UI.
7. **Fotos como blobs no Postgres servidos por route autenticado (J4):** simples e seguro, mas cada miniatura da grade é uma leitura de blob no servidor — escala mal sem CDN.

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)
- **Busca + filtros na grade** por característica do catálogo (reusar os mesmos selects), status, categoria e faixa de preço; chips de "fora do acervo". Reaproveita o vocabulário que já alimenta a indicação.
- **Foto no cadastro**: permitir 1ª foto já em `/novo`; aumentar para 3-4 slots nomeados (frente/costas/detalhe/cauda) com reordenar e definir capa; preview e validação client-side antes do upload.
- **Dar corpo à ESCALA**: UI de grau (slider/escala 1-5) e scoring por proximidade na indicação (peças "perto" do grau desejado pontuam parcialmente), diferenciando de OPCAO_UNICA.
- **Edição de características como diff explícito**: ao salvar, mostrar o que será adicionado/removido; preservar (ou avisar sobre) características cujo atributo foi desativado.
- **Estados vazios/permission-aware mais claros**: quando um bloco some por falta de gate (reservar), exibir um aviso discreto ("Sem permissão para reservar") em vez de sumir.
- **Atributo "destaque/coleção/ano"** de primeira classe no acervo, para o card de "Destaque do atelier" e leitura editorial (hoje só Tamanho/Cor/Categoria livres).
- **Higiene do catálogo**: arquivar atributos inativos numa seção recolhida; permitir excluir os que nunca foram usados (sem FK) para reduzir lixo visual.
</content>
</invoke>
