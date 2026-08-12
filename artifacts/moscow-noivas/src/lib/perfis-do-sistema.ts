/**
 * S-D9 — a notícia certa quando a lista de perfis vem vazia.
 *
 * `GET /admin/perfis` devolve a lista do SISTEMA, não a da loja
 * (`admin.ts:221-228`, sem filtro de `lojaId`). Ela nasce com cinco linhas na
 * configuração inicial (Admin, Proprietária, Vendedora, Recepção e Costureira —
 * esta última desde o E172) e o `DELETE` recusa o perfil do sistema
 * (`admin.ts:289-293`). Para uma sessão comum a lista vazia é impossível por
 * construção: `getPermissoes` faz `innerJoin` de `usuarios_lojas` com `perfis`
 * (`auth.ts:152-166`), então quem chegou à tela tem um perfil E ele está na
 * lista. Sobra o superadmin — que não tem perfil, tem bypass — contra uma base
 * onde a configuração inicial não rodou.
 *
 * Por isso o vazio **não ganha botão**: nenhuma tela do app cria perfil (zero
 * usos de `useCreatePerfil`), e um botão que não conserta é pior que nenhum —
 * o `Vazio` do E99 prevê o vazio sem saída honesta.
 */

export const SEM_PERFIS_TITULO = "Esta instalação está sem perfis de acesso";

export const SEM_PERFIS_DESCRICAO =
  "Os cinco perfis que nascem com o sistema — Admin, Proprietária, Vendedora, " +
  "Recepção e Costureira — não estão nesta base, e nenhuma tela cria perfil. Sem " +
  "eles não há o que personalizar: quem administra o sistema precisa rodar a " +
  "configuração inicial.";
