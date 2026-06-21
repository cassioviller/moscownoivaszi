// src/lib/admin/perfis-ids.ts
// IDs dos perfis que vêm do seed (papéis são DADOS — UsuarioLoja.perfilId — não enums).
// Folha PURA, sem imports: quem só precisa do ID do perfil (ex.: permissoes/modulos,
// importado por ~48 rotas) consome daqui e NÃO arrasta admin/usuarios → prisma → bcrypt.
// Isso encurta o grafo de rebuild do Fast Refresh. admin/usuarios re-exporta para
// manter a API antiga de quem já importava de lá.
export const PERFIL_ADMIN_ID = "perfil-admin";
export const PERFIL_VENDEDORA_ID = "perfil-vendedora";
export const PERFIL_RECEPCAO_ID = "perfil-recepcao";
