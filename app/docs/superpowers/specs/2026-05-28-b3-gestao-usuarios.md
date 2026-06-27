# B.3 — Gestão de usuários (RBAC hierárquico de 3 níveis)

**Data:** 2026-05-28
**Origem:** decisão de produto do dono (sessão) — "superadmin tela de cadastro de admin; admin pode ter mais de uma loja e cadastrar mais de uma vendedora por loja; vendedora só tem acesso a algumas partes do perfil da loja."
**Base:** B.2-T1b (super-admin `isSuperAdmin` + seletor que mostra todas as lojas) é o alicerce.

---

## 1. Modelo

| Papel | Marca no schema | Cria quem | Acesso |
|---|---|---|---|
| **Super-admin** (staff plataforma) | `Usuario.isSuperAdmin = true` | Admins + Lojas | Console da plataforma; vê todas as lojas |
| **Admin** (dono da loja) | `UsuarioLoja(perfil = "Admin")` em 1+ lojas | Vendedoras nas suas lojas | Tudo dentro das lojas dele |
| **Vendedora** | `UsuarioLoja(perfil = "Vendedora")` | — | Só os módulos habilitados em `Perfil.acessosModulos` |

**Decisão-chave:** o modelo já é 100% suportado pelas primitivas existentes (`Usuario`, `UsuarioLoja` M:N com `perfilId`, `Perfil.acessosModulos` JSON). **Nenhuma mudança de schema / migration neste épico.** Papéis são dados, não enums novos — YAGNI.

Tabelas de identidade/config (`Usuario`, `Loja`, `UsuarioLoja`, `Perfil`) **não** passam por `tenantPrisma` (mesma razão de `UsuarioLoja` já documentada): são cross-loja por construção. `tenantPrisma` segue intocado.

## 2. Fatias (ponta a ponta)

- **T1 — Console super-admin:** grupo de rota `(admin)` (fora do gate de loja, guard `isSuperAdmin`). Listar/criar lojas; listar/criar admins (cria `Usuario` + `UsuarioLoja` perfil Admin em 1+ lojas). Login manda super-admin pra `/admin`.
- **T2 — Admin cadastra vendedora:** dentro da loja ativa, admin (perfil Admin na loja) cria vendedoras vinculadas à(s) loja(s) dele com perfil Vendedora. Guard: só admin da loja.
- **T3 — Enforce de módulos da vendedora:** rotas/menus checam `acessosModulos` do perfil na loja ativa. Vendedora não vê/acessa módulo desabilitado.

## 3. Invariantes

- Validação server-side de papel em TODA action (defesa em profundidade — não confiar em esconder botão).
- Super-admin opera dentro de UMA loja por vez (via `lojaAtivaId`); isolamento de dados segue garantido por `tenantPrisma`. Gerência de usuários é "quem pode criar/ver quem", não escopagem de dados de tenant.
- Senha inicial definida por quem cadastra; hash via `gerarHash` (bcrypt) existente. Sem dependência nova.

## 4. Fora de escopo (follow-up)

- Edição/desativação de usuários e troca de senha pelo próprio usuário.
- Convite por e-mail / fluxo de primeiro acesso.
- Auditoria de quem criou quem.
