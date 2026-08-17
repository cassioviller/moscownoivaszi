/**
 * A loja de DEMONSTRAÇÃO dos manuais — o cenário que aparece nos prints.
 *
 *   pnpm --filter @workspace/api-server exec tsx ../../scripts/loja-de-demonstracao.ts
 *
 * Por que ela existe, medido: as capturas de manual saíam da loja do E2E, e a
 * primeira amostra provou que ela não serve — **1.289 leads**, e os visíveis na
 * primeira tela eram *"Noiva Combobox mspc8…"*, *"E2E Reabrir 178…"*, *"E2E
 * Esquecida 1…"*, todos com *"Casamento a definir"*. Um manual cujo print
 * mostra isso não ensina nada: quem lê não distingue o que é a tela do que é
 * lixo de fixture.
 *
 * O que ela cria, e a régua de cada escolha:
 *
 * - **Nomes plausíveis e inventados.** É uma loja de demonstração, não um
 *   recorte da loja real: nenhum PDF que circula leva nome de noiva de verdade,
 *   telefone de verdade ou CPF de verdade. Os telefones são todos `(11) 9xxxx`
 *   de faixa reservada, e não há CPF nenhum.
 * - **Datas RELATIVAS a hoje.** Um casamento gravado em data fixa envelhece e o
 *   print passa a mostrar contagem negativa. Tudo aqui é `hoje + N`.
 * - **Idempotente por ID fixo** (`demo-*`), como o `global-setup.ts` do E2E:
 *   rodar de novo não duplica, e o print refeito em três meses é o mesmo print.
 * - **Um estado de cada coisa que o manual descreve** — a noiva que acabou de
 *   entrar, a que tem prova marcada, a que recebeu a proposta, a que ACEITOU e
 *   não tem contrato (o selo do funil), a que fechou, a que se perdeu. Sem isso
 *   o print da faixa "próximo passo" mostra sempre a mesma frase.
 *
 * A loja nasce com `id` próprio e nome próprio: ela CONVIVE com a loja do E2E e
 * com a de dev no mesmo banco, e nenhuma das três se atrapalha.
 */
import { deflateSync } from "node:zlib";
import { eq } from "drizzle-orm";
// A régua do hash é a do servidor (custo 12), e ela mora lá. Importar o módulo
// dele resolve `bcryptjs` a partir de `artifacts/api-server`, onde a dependência
// está declarada — `scripts/` não a declara e não deve declarar.
import { hashSenha } from "../artifacts/api-server/src/lib/auth";
import {
  db,
  pool,
  lojasTable,
  usuariosTable,
  usuariosLojasTable,
  perfisTable,
  vestidosTable,
  leadsTable,
  cabinesTable,
  regraDisponibilidadeTable,
  atributosTable,
  atributoOpcoesTable,
  vestidoAtributosTable,
  vestidoFotosTable,
  leadInteressesTable,
  leadInteresseAtributosTable,
  lookbooksTable,
  lookbookItensTable,
  portalTokensTable,
  registrosCobrancaTable,
  orcamentosTable,
  orcamentoItensTable,
  contratosTable,
  contratoItensTable,
  parcelasTable,
  bloqueioVestidosTable,
  atendimentosTable,
  ajustesTable,
  ajusteChecklistItensTable,
  indicesMonetariosTable,
} from "../lib/db/src/index";

export const LOJA_DEMO_ID = "demo-manuais-loja";
export const VENDEDORA_EMAIL = "camila@moscownoivas.com";
// E236 — os manuais dos outros dois perfis também saem da sessão de quem os protagoniza.
export const RECEPCAO_EMAIL = "renata@moscownoivas.com";
export const COSTUREIRA_EMAIL = "dona.lourdes@moscownoivas.com";
export const DONA_EMAIL = "helena@moscownoivas.com";
/** Senha só desta loja de demonstração, e ela nunca sai daqui. */
export const SENHA_DEMO = "demo-dos-manuais";
const ADMIN_EMAIL = "admin@moscownoivas.com";

const DIA = 24 * 60 * 60 * 1000;
const agora = new Date();
/** Hoje + N dias, às HH:MM no fuso da loja (aproximado pelo offset -03). */
const emDias = (n: number, hora = 10, minuto = 0): Date => {
  const d = new Date(agora.getTime() + n * DIA);
  d.setUTCHours(hora + 3, minuto, 0, 0);
  return d;
};
const diaLocal = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/**
 * Um PNG de verdade, gerado aqui — sem dependência e sem foto de acervo real.
 *
 * A tela do acervo, o lookbook e o portal da noiva mostram FOTO; sem ela os
 * três printam "Sem foto", e o manual passaria a ensinar um sistema que parece
 * quebrado. Estas são placas de tecido: um degradê vertical no tom da peça,
 * com o veio da renda em faixas claras. Ninguém as confunde com um vestido — e
 * é isso que se quer, porque **foto de vestido é acervo real e não entra num
 * PDF que circula**.
 */
function pngDeTecido(largura: number, altura: number, tom: [number, number, number]): Buffer {
  const crcTabela = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTabela[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const pedaco = (tipo: string, dados: Buffer): Buffer => {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
    const soma = Buffer.alloc(4);
    soma.writeUInt32BE(crc(corpo));
    return Buffer.concat([tamanho, corpo, soma]);
  };

  const linhas: Buffer[] = [];
  for (let y = 0; y < altura; y++) {
    // Degradê de cima (claro) para baixo (o tom da peça) + veio a cada 26px.
    const t = y / altura;
    const veio = y % 26 < 2 ? 10 : 0;
    const linha = Buffer.alloc(1 + largura * 3);
    linha[0] = 0; // filtro "none"
    for (let x = 0; x < largura; x++) {
      const borda = x < 2 || x > largura - 3 ? -12 : 0;
      for (let c = 0; c < 3; c++) {
        const claro = 250;
        const valor = Math.round(claro + (tom[c] - claro) * (0.25 + 0.75 * t)) + veio + borda;
        linha[1 + x * 3 + c] = Math.max(0, Math.min(255, valor));
      }
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(Buffer.concat(linhas), { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

/** O vocabulário do catálogo — é ele que a busca por atributo filtra. */
const ATRIBUTOS = [
  { id: "demo-atr-modelo", nome: "Modelo", opcoes: ["Sereia", "Princesa", "Reto", "Evasê", "Império"] },
  { id: "demo-atr-decote", nome: "Decote", opcoes: ["Coração", "Ombro a ombro", "V", "Tomara que caia"] },
  { id: "demo-atr-tecido", nome: "Tecido", opcoes: ["Renda", "Cetim", "Tule", "Crepe"] },
];

/** As peças do acervo da demonstração — código, nome e preço plausíveis. */
const VESTIDOS = [
  { id: "demo-vestido-1", codigo: "MS-014", nome: "Sereia Veneza", precoBase: 4800, tom: [214, 200, 186] as [number, number, number], atributos: { Modelo: "Sereia", Decote: "Coração", Tecido: "Renda" } },
  { id: "demo-vestido-2", codigo: "MS-021", nome: "Princesa Aurora", precoBase: 5600, tom: [232, 226, 214] as [number, number, number], atributos: { Modelo: "Princesa", Decote: "Tomara que caia", Tecido: "Tule" } },
  { id: "demo-vestido-3", codigo: "MS-033", nome: "Reto Chantilly", precoBase: 3900, tom: [222, 214, 205] as [number, number, number], atributos: { Modelo: "Reto", Decote: "V", Tecido: "Crepe" } },
  { id: "demo-vestido-4", codigo: "MS-040", nome: "Evasê Bruges", precoBase: 4200, tom: [228, 214, 198] as [number, number, number], atributos: { Modelo: "Evasê", Decote: "Ombro a ombro", Tecido: "Renda" } },
  { id: "demo-vestido-5", codigo: "MS-052", nome: "Império Alençon", precoBase: 3400, tom: [236, 230, 220] as [number, number, number], atributos: { Modelo: "Império", Decote: "V", Tecido: "Cetim" } },
  { id: "demo-vestido-6", codigo: "MS-061", nome: "Sereia Provence", precoBase: 5200, tom: [210, 196, 184] as [number, number, number], atributos: { Modelo: "Sereia", Decote: "Ombro a ombro", Tecido: "Cetim" } },
  { id: "demo-vestido-7", codigo: "MS-072", nome: "Princesa Verona", precoBase: 6100, tom: [240, 234, 226] as [number, number, number], atributos: { Modelo: "Princesa", Decote: "Coração", Tecido: "Renda" } },
  { id: "demo-vestido-8", codigo: "MS-078", nome: "Evasê Lisboa", precoBase: 3700, tom: [226, 219, 208] as [number, number, number], atributos: { Modelo: "Evasê", Decote: "V", Tecido: "Cetim" } },
  { id: "demo-vestido-9", codigo: "MS-085", nome: "Reto Toscana", precoBase: 3200, tom: [218, 210, 200] as [number, number, number], atributos: { Modelo: "Reto", Decote: "Ombro a ombro", Tecido: "Crepe" } },
];

/**
 * As noivas, uma por ESTADO que os manuais descrevem. A ordem importa só para a
 * leitura desta lista; a tela ordena pelo que ela ordena.
 */
const NOIVAS = [
  {
    id: "demo-lead-ana",
    noivaNome: "Ana Paula Ribeiro",
    noivoNome: "Thiago Menezes",
    whatsapp: "(11) 96324-1180",
    etapa: "ORCAMENTO_ABERTO" as const,
    origem: "INSTAGRAM" as const,
    casamentoEmDias: 168,
    casamentoLocal: "Espaço Villa Bianca",
    // Ela é a do caminho completo: proposta enviada, aceita, sem contrato.
  },
  {
    id: "demo-lead-beatriz",
    noivaNome: "Beatriz Camargo",
    noivoNome: "Rafael Duarte",
    whatsapp: "(11) 95580-2244",
    etapa: "CONTRATO_FECHADO" as const,
    origem: "LOJA" as const,
    casamentoEmDias: 96,
    casamentoLocal: "Fazenda Santa Bárbara",
  },
  {
    id: "demo-lead-carolina",
    noivaNome: "Carolina Nunes",
    noivoNome: "Eduardo Blanco",
    whatsapp: "(11) 94417-8890",
    etapa: "ATENDIMENTO_AGENDADO" as const,
    origem: "WHATSAPP" as const,
    casamentoEmDias: 240,
    casamentoLocal: "Igreja Nossa Senhora do Brasil",
  },
  {
    id: "demo-lead-daniela",
    noivaNome: "Daniela Prado",
    whatsapp: "(11) 93302-5517",
    etapa: "NOVO" as const,
    origem: "SITE" as const,
    casamentoEmDias: 310,
  },
  {
    id: "demo-lead-fernanda",
    noivaNome: "Fernanda Lopes",
    noivoNome: "Caio Bastos",
    whatsapp: "(11) 98871-6003",
    etapa: "INTERESSES_PREENCHIDOS" as const,
    origem: "INSTAGRAM" as const,
    casamentoEmDias: 205,
    casamentoLocal: "Casa Petra",
  },
  {
    id: "demo-lead-juliana",
    noivaNome: "Juliana Moreira",
    noivoNome: "Pedro Sarmento",
    whatsapp: "(11) 97740-3312",
    etapa: "EM_PROVAS" as const,
    origem: "LOJA" as const,
    casamentoEmDias: 34,
    casamentoLocal: "Buffet Colonial",
  },
  {
    id: "demo-lead-marina",
    noivaNome: "Marina Tavares",
    whatsapp: "(11) 96650-9928",
    etapa: "PERDIDO" as const,
    origem: "SITE" as const,
    casamentoEmDias: 150,
  },
];

async function main(): Promise<void> {
  const [admin] = await db.select().from(usuariosTable).where(eq(usuariosTable.email, ADMIN_EMAIL));
  if (!admin) {
    throw new Error(
      "loja-de-demonstracao: não há admin no banco. Rode o seed oficial primeiro:\n" +
        "  pnpm --filter @workspace/api-server exec tsx src/scripts/seed.ts",
    );
  }

  // ── A loja ────────────────────────────────────────────────────────────────
  /**
   * E236 — a loja de demonstração NASCE DE NOVO a cada rodada.
   *
   * "Idempotente por ID fixo" era verdade para a existência das linhas e
   * mentira para as DATAS: tudo aqui é `hoje + N`, mas o `onConflictDoNothing`
   * só grava na primeira semeadura. Medido em 15/08: os dois atendimentos "de
   * hoje" estavam em **12/08** (o dia da primeira rodada) e a fila os mostrava
   * como "Atrasados" — o print de hoje ensinaria a tela errada. Apagar a loja
   * cascateia as 34 FKs (E106) e leva junto tudo o que é dela; as PESSOAS
   * (`usuarios`) ficam, porque não são da loja — o vínculo é refeito abaixo.
   */
  await db.delete(lojasTable).where(eq(lojasTable.id, LOJA_DEMO_ID));
  await db
    .insert(lojasTable)
    .values({
      id: LOJA_DEMO_ID,
      nome: "Moscow Noivas",
      // E233/E234 — o cadastro inteiro que o instrumento imprime, com valores
      // de exemplo que fecham os dígitos (é a P3 feita na loja de demonstração).
      cnpj: "11.222.333/0001-81",
      endereco: "Rua das Palmeiras, 412 — Higienópolis, São Paulo",
      telefone: "(11) 3062-4400",
      cidade: "São Paulo",
      uf: "SP",
      representanteNome: "Helena Moscow",
      representanteRg: "12.345.678-9",
      representanteCpf: "390.533.447-05",
      pixChave: "11222333000181",
      pixTitular: "Moscow Noivas Ltda.",
    });

  // O admin do banco entra na loja com o perfil de proprietária, que é o
  // perfil dos prints do manual do proprietário.
  const [perfilDono] = await db
    .select()
    .from(perfisTable)
    .where(eq(perfisTable.nome, "Proprietário"));
  if (!perfilDono) throw new Error("loja-de-demonstracao: perfil 'Proprietário' não existe no banco");
  await db
    .insert(usuariosLojasTable)
    .values({ usuarioId: admin.id, lojaId: LOJA_DEMO_ID, perfilId: perfilDono.id })
    .onConflictDoUpdate({
      target: [usuariosLojasTable.usuarioId, usuariosLojasTable.lojaId],
      set: { perfilId: perfilDono.id },
    });

  /**
   * A VENDEDORA da demonstração — e ela não é enfeite.
   *
   * O admin do banco é superadmin, e superadmin vê tudo: um print do menu feito
   * com a sessão dele mostraria Financeiro e Permissões no manual da vendedora,
   * que é exatamente a mentira que a varredura dos manuais existe para impedir.
   * Os prints de cada manual saem da sessão do PERFIL daquele manual.
   */
  const [perfilVendedora] = await db
    .select()
    .from(perfisTable)
    .where(eq(perfisTable.nome, "Vendedora"));
  const senhaHash = await hashSenha(SENHA_DEMO);
  await db
    .insert(usuariosTable)
    .values({
      id: "demo-usuario-vendedora",
      nome: "Camila Duarte",
      email: VENDEDORA_EMAIL,
      senhaHash,
      ativo: true,
    })
    .onConflictDoUpdate({
      target: usuariosTable.id,
      set: { nome: "Camila Duarte", senhaHash, ativo: true },
    });
  if (!perfilVendedora) throw new Error("loja-de-demonstracao: perfil 'Vendedora' não existe no banco");
  await db
    .insert(usuariosLojasTable)
    .values({ usuarioId: "demo-usuario-vendedora", lojaId: LOJA_DEMO_ID, perfilId: perfilVendedora.id })
    .onConflictDoUpdate({
      target: [usuariosLojasTable.usuarioId, usuariosLojasTable.lojaId],
      set: { perfilId: perfilVendedora.id },
    });

  /**
   * E236 — a DONA, a RECEPÇÃO e a COSTUREIRA da demonstração, pela mesma razão da
   * vendedora: os prints do manual de cada perfil saem da sessão daquele
   * perfil, e o menu que aparece é o que a pessoa vê de verdade. Antes só a
   * vendedora tinha prints; os outros quatro manuais eram só prosa.
   */
  for (const p of [
    { id: "demo-usuario-dona", nome: "Helena Moscow", email: DONA_EMAIL, perfil: "Proprietário" },
    { id: "demo-usuario-recepcao", nome: "Renata Prado", email: RECEPCAO_EMAIL, perfil: "Recepção" },
    { id: "demo-usuario-costureira", nome: "Lourdes Bastos", email: COSTUREIRA_EMAIL, perfil: "Costureira" },
  ]) {
    const [perfil] = await db.select().from(perfisTable).where(eq(perfisTable.nome, p.perfil));
    if (!perfil) throw new Error(`loja-de-demonstracao: perfil '${p.perfil}' não existe no banco`);
    await db
      .insert(usuariosTable)
      .values({ id: p.id, nome: p.nome, email: p.email, senhaHash, ativo: true })
      .onConflictDoUpdate({ target: usuariosTable.id, set: { nome: p.nome, senhaHash, ativo: true } });
    await db
      .insert(usuariosLojasTable)
      .values({ usuarioId: p.id, lojaId: LOJA_DEMO_ID, perfilId: perfil.id })
      .onConflictDoUpdate({
        target: [usuariosLojasTable.usuarioId, usuariosLojasTable.lojaId],
        set: { perfilId: perfil.id },
      });
  }

  // ── Cabines e expediente ──────────────────────────────────────────────────
  for (const [i, nome] of ["Cabine 1", "Cabine 2", "Cabine 3"].entries()) {
    await db
      .insert(cabinesTable)
      .values({ id: `demo-cabine-${i + 1}`, lojaId: LOJA_DEMO_ID, nome, ativo: true })
      .onConflictDoUpdate({ target: cabinesTable.id, set: { nome, ativo: true } });
  }
  await db
    .insert(regraDisponibilidadeTable)
    .values({
      id: "demo-regra-disponibilidade",
      lojaId: LOJA_DEMO_ID,
      atendimentoAberturaHora: 9,
      atendimentoFechamentoHora: 19,
      diasFuncionamento: [1, 2, 3, 4, 5, 6],
      provaDuracao: 2,
    })
    .onConflictDoUpdate({
      target: regraDisponibilidadeTable.id,
      set: { atendimentoAberturaHora: 9, atendimentoFechamentoHora: 19, provaDuracao: 2 },
    });

  // ── O vocabulário do catálogo ─────────────────────────────────────────────
  const opcaoPorValor = new Map<string, { atributoId: string; opcaoId: string }>();
  for (const [i, atr] of ATRIBUTOS.entries()) {
    await db
      .insert(atributosTable)
      .values({ id: atr.id, lojaId: LOJA_DEMO_ID, nome: atr.nome, ordem: i, ativo: true })
      .onConflictDoUpdate({ target: atributosTable.id, set: { nome: atr.nome, ordem: i } });
    for (const [j, valor] of atr.opcoes.entries()) {
      const opcaoId = `${atr.id}-op-${j + 1}`;
      await db
        .insert(atributoOpcoesTable)
        .values({ id: opcaoId, atributoId: atr.id, valor, ordem: j, ativo: true })
        .onConflictDoUpdate({ target: atributoOpcoesTable.id, set: { valor, ordem: j } });
      opcaoPorValor.set(`${atr.nome}:${valor}`, { atributoId: atr.id, opcaoId });
    }
  }

  // ── O acervo, com foto e classificação ────────────────────────────────────
  for (const v of VESTIDOS) {
    const { tom, atributos, ...peca } = v;
    await db
      .insert(vestidosTable)
      .values({ ...peca, lojaId: LOJA_DEMO_ID })
      .onConflictDoUpdate({
        target: vestidosTable.id,
        set: { codigo: peca.codigo, nome: peca.nome, precoBase: peca.precoBase },
      });
    for (const [nomeAtr, valor] of Object.entries(atributos)) {
      const achado = opcaoPorValor.get(`${nomeAtr}:${valor}`);
      if (!achado) continue;
      await db
        .insert(vestidoAtributosTable)
        .values({ vestidoId: peca.id, atributoId: achado.atributoId, opcaoId: achado.opcaoId })
        .onConflictDoUpdate({
          target: [vestidoAtributosTable.vestidoId, vestidoAtributosTable.atributoId],
          set: { opcaoId: achado.opcaoId },
        });
    }
    // A foto: 3:4, como a tela desenha, e uma thumb menor pela mesma régua.
    const cheia = pngDeTecido(600, 800, tom);
    const thumb = pngDeTecido(240, 320, tom);
    await db
      .insert(vestidoFotosTable)
      .values({
        id: `${peca.id}-foto-0`,
        vestidoId: peca.id,
        ordem: 0,
        bytes: cheia,
        mime: "image/png",
        largura: 600,
        altura: 800,
        thumbBytes: thumb,
        thumbMime: "image/png",
      })
      .onConflictDoUpdate({
        target: vestidoFotosTable.id,
        set: { bytes: cheia, thumbBytes: thumb, mime: "image/png", thumbMime: "image/png" },
      });
  }

  // ── As noivas ─────────────────────────────────────────────────────────────
  for (const n of NOIVAS) {
    const { casamentoEmDias, ...resto } = n;
    const valores = {
      ...resto,
      lojaId: LOJA_DEMO_ID,
      casamentoData: emDias(casamentoEmDias, 16, 0),
      casamentoHorario: "16:00",
      ...(n.etapa === "PERDIDO"
        ? { perdidaEm: emDias(-22), perdidaMotivo: "PRECO" as const }
        : {}),
      ...(n.etapa === "ORCAMENTO_ABERTO" ? { orcamentoAbertoEm: emDias(-9) } : {}),
      ...(n.etapa === "CONTRATO_FECHADO" || n.etapa === "EM_PROVAS"
        ? { orcamentoAbertoEm: emDias(-40), contratoFechadoEm: emDias(-31) }
        : {}),
    };
    await db.insert(leadsTable).values(valores).onConflictDoUpdate({
      target: leadsTable.id,
      set: valores,
    });
  }
  // O SELO do funil: a Ana Paula aceitou e ainda não tem contrato (S-O10).
  await db
    .update(leadsTable)
    .set({ aceiteEm: emDias(-2, 21, 14) })
    .where(eq(leadsTable.id, "demo-lead-ana"));

  // ── A proposta da Ana Paula: enviada, aberta pela noiva e ACEITA ──────────
  const validade = emDias(21, 23, 59);
  await db
    .insert(orcamentosTable)
    .values({
      id: "demo-orcamento-ana",
      lojaId: LOJA_DEMO_ID,
      leadId: "demo-lead-ana",
      vendedoraId: admin.id,
      status: "ENVIADO",
      descontoTipo: "PERCENTUAL",
      descontoValor: 10,
      validade,
      observacoes:
        "O valor inclui a prova de ajuste e a lavagem. A retirada é combinada três dias antes do casamento.",
      publicoToken: "demo-proposta-ana-paula",
      publicoExpiraEm: emDias(7, 23, 59),
      publicoAbertoEm: emDias(-2, 20, 51),
      aceitoEm: emDias(-2, 21, 14),
      aceiteVersao: 1,
    })
    .onConflictDoUpdate({
      target: orcamentosTable.id,
      set: {
        status: "ENVIADO",
        validade,
        publicoExpiraEm: emDias(7, 23, 59),
        publicoAbertoEm: emDias(-2, 20, 51),
        aceitoEm: emDias(-2, 21, 14),
      },
    });
  const ITENS_ANA = [
    { id: "demo-orcitem-1", tipo: "VESTIDO" as const, descricao: "MS-014 · Sereia Veneza", valorUnitario: 4800, quantidade: 1, vestidoId: "demo-vestido-1" },
    { id: "demo-orcitem-2", tipo: "ACESSORIO" as const, descricao: "Véu longo bordado", valorUnitario: 620, quantidade: 1 },
    { id: "demo-orcitem-3", tipo: "SERVICO" as const, descricao: "Prova de ajuste com a costureira", valorUnitario: 180, quantidade: 2 },
  ];
  for (const it of ITENS_ANA) {
    await db
      .insert(orcamentoItensTable)
      .values({ ...it, lojaId: LOJA_DEMO_ID, orcamentoId: "demo-orcamento-ana" })
      .onConflictDoUpdate({ target: orcamentoItensTable.id, set: { descricao: it.descricao, valorUnitario: it.valorUnitario } });
  }

  // ── O contrato da Beatriz, com carnê ──────────────────────────────────────
  const casamentoBeatriz = emDias(96, 16, 0);
  await db
    .insert(bloqueioVestidosTable)
    .values({
      id: "demo-bloqueio-beatriz",
      lojaId: LOJA_DEMO_ID,
      vestidoId: "demo-vestido-2",
      leadId: "demo-lead-beatriz",
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamentoBeatriz,
      ocupacaoInicio: diaLocal(new Date(casamentoBeatriz.getTime() - 3 * DIA)),
      ocupacaoFim: diaLocal(new Date(casamentoBeatriz.getTime() + 2 * DIA)),
    })
    .onConflictDoNothing();

  const TOTAL_BEATRIZ = 6180;
  await db
    .insert(contratosTable)
    .values({
      id: "demo-contrato-beatriz",
      lojaId: LOJA_DEMO_ID,
      leadId: "demo-lead-beatriz",
      vendedoraId: admin.id,
      status: "ATIVO",
      valorTotal: TOTAL_BEATRIZ,
      formaPagamento: "PIX",
      dataCasamento: casamentoBeatriz,
      dataRetirada: new Date(casamentoBeatriz.getTime() - 3 * DIA),
      vestidoDescricao: "MS-021 · Princesa Aurora",
      fechadoEm: emDias(-31, 15, 20),
    })
    .onConflictDoNothing();
  for (const it of [
    { id: "demo-contitem-1", tipo: "VESTIDO" as const, descricao: "MS-021 · Princesa Aurora", valorUnitario: 5600, quantidade: 1, vestidoId: "demo-vestido-2" },
    { id: "demo-contitem-2", tipo: "ACESSORIO" as const, descricao: "Tiara de cristais", valorUnitario: 580, quantidade: 1 },
  ]) {
    await db
      .insert(contratoItensTable)
      .values({ ...it, lojaId: LOJA_DEMO_ID, contratoId: "demo-contrato-beatriz" })
      .onConflictDoNothing();
  }
  // Carnê: entrada paga + 5 parcelas, as duas primeiras já recebidas.
  const PARCELAS = [
    { numero: 0, descricao: "Entrada", valor: 1180, venceEmDias: -31, pago: true },
    { numero: 1, valor: 1000, venceEmDias: -14, pago: true },
    { numero: 2, valor: 1000, venceEmDias: 16, pago: false },
    { numero: 3, valor: 1000, venceEmDias: 46, pago: false },
    { numero: 4, valor: 1000, venceEmDias: 76, pago: false },
    { numero: 5, valor: 1000, venceEmDias: 106, pago: false },
  ];
  for (const p of PARCELAS) {
    await db
      .insert(parcelasTable)
      .values({
        id: `demo-parcela-${p.numero}`,
        lojaId: LOJA_DEMO_ID,
        contratoId: "demo-contrato-beatriz",
        numero: p.numero,
        origem: "PLANO",
        descricao: p.descricao ?? null,
        valorPrevisto: p.valor,
        vencimento: emDias(p.venceEmDias, 12, 0),
        status: p.pago ? "PAGA" : "PREVISTA",
        valorRecebido: p.pago ? p.valor : null,
        recebidoEm: p.pago ? emDias(p.venceEmDias, 14, 30) : null,
        formaRecebimento: p.pago ? "PIX" : null,
      })
      .onConflictDoNothing();
  }

  // ── A agenda de hoje e a prova da Juliana ─────────────────────────────────
  const casamentoJuliana = emDias(34, 16, 0);
  await db
    .insert(bloqueioVestidosTable)
    .values({
      id: "demo-bloqueio-juliana",
      lojaId: LOJA_DEMO_ID,
      vestidoId: "demo-vestido-6",
      leadId: "demo-lead-juliana",
      tipo: "RESERVA_CASAMENTO",
      casamentoData: casamentoJuliana,
      ocupacaoInicio: diaLocal(new Date(casamentoJuliana.getTime() - 3 * DIA)),
      ocupacaoFim: diaLocal(new Date(casamentoJuliana.getTime() + 2 * DIA)),
    })
    .onConflictDoNothing();

  const AGENDA = [
    { id: "demo-atend-1", leadId: "demo-lead-carolina", cabineId: "demo-cabine-1", tipo: "ATENDIMENTO" as const, emDias: 0, hora: 10, situacao: "AGENDADO" as const },
    { id: "demo-atend-2", leadId: "demo-lead-fernanda", cabineId: "demo-cabine-2", tipo: "ATENDIMENTO" as const, emDias: 0, hora: 14, situacao: "AGENDADO" as const },
    { id: "demo-atend-3", leadId: "demo-lead-juliana", cabineId: "demo-cabine-1", tipo: "PROVA" as const, emDias: 4, hora: 15, situacao: "AGENDADO" as const, bloqueioId: "demo-bloqueio-juliana" },
    { id: "demo-atend-4", leadId: "demo-lead-ana", cabineId: "demo-cabine-3", tipo: "ATENDIMENTO" as const, emDias: -9, hora: 11, situacao: "CONCLUIDO" as const, desfecho: "RESERVOU" as const },
  ];
  for (const a of AGENDA) {
    const { emDias: dias, hora, desfecho, ...resto } = a;
    await db
      .insert(atendimentosTable)
      .values({
        ...resto,
        lojaId: LOJA_DEMO_ID,
        vendedoraId: "demo-usuario-vendedora",
        inicio: emDias(dias, hora, 0),
        ...(desfecho ? { desfecho, atendidoEm: emDias(dias, hora, 6) } : {}),
      })
      .onConflictDoNothing();
  }

  // ── P4/E237: o IPCA dos últimos 12 meses, valores de exemplo, para o print
  //    de Configurações → Índices e para a mora da demonstração corrigir. ────
  //
  //    E250/S-R5 — **isto NÃO é o defeito que o E242 gateou, e a diferença é
  //    o `loja_id`.** O que o E242 tirou do caminho da instalação real foi o
  //    seed escrever índice inventado na loja DE VERDADE; aqui as 12 linhas
  //    nascem em `LOJA_DEMO_ID`, cujos contratos também são inventados — uma
  //    correção de exemplo sobre uma parcela de exemplo é exatamente o que o
  //    print de Configurações → Índices existe para mostrar.
  //
  //    A marca é PRÓPRIA ('demonstração (valor de exemplo)') e não a
  //    `MARCA_DO_IPCA_DE_EXEMPLO` do seed, de propósito: a faxina do E250
  //    (`docs/migracoes/2026-08-17-e250-ipca-de-exemplo-sai.sql`) procura a
  //    marca do seed e não pode levar estas junto. Quem quiser estas linhas
  //    fora do banco apaga a loja de demonstração, e elas saem em cascata.
  {
    const [ano, mes] = diaLocal(agora).split("-").map(Number) as [number, number];
    const exemplos = [0.42, 0.38, 0.31, 0.46, 0.5, 0.29, 0.35, 0.44, 0.52, 0.16, 0.24, 0.39];
    for (let i = 1; i <= 12; i++) {
      let m = mes - i, a = ano;
      while (m <= 0) { m += 12; a -= 1; }
      const competencia = `${a}-${String(m).padStart(2, "0")}`;
      await db.insert(indicesMonetariosTable).values({
        id: `demo-ipca-${competencia}`, lojaId: LOJA_DEMO_ID, indice: "IPCA", competencia,
        variacaoPct: exemplos[i - 1]!, atualizadoPor: "demonstração (valor de exemplo)",
      }).onConflictDoNothing();
    }
  }

  // ── A fila da costureira ──────────────────────────────────────────────────
  await db
    .insert(ajustesTable)
    .values({
      id: "demo-ajuste-1",
      lojaId: LOJA_DEMO_ID,
      atendimentoId: "demo-atend-3",
      tipo: "AJUSTE",
      descricao: "Barra e alças — Juliana Moreira",
      status: "PENDENTE",
    })
    .onConflictDoNothing();
  for (const [i, item] of ["Marcar a barra", "Ajustar as alças", "Fechar o busto"].entries()) {
    await db
      .insert(ajusteChecklistItensTable)
      .values({
        id: `demo-checklist-${i + 1}`,
        ajusteId: "demo-ajuste-1",
        descricao: item,
        ordem: i + 1,
        feito: i === 0,
      })
      .onConflictDoNothing();
  }

  // ── Os interesses da noiva ────────────────────────────────────────────────
  for (const i of [
    {
      id: "demo-interesse-ana",
      leadId: "demo-lead-ana",
      algoAMais: "Quer manga longa de renda; gosta de cauda média.",
      naoQuerUsar: "Brilho, pedraria e tomara que caia.",
      tetoOrcamento: 6000,
      escolhas: ["Modelo:Sereia", "Decote:Coração", "Tecido:Renda"],
    },
    {
      id: "demo-interesse-fernanda",
      leadId: "demo-lead-fernanda",
      algoAMais: "Casamento na praia, quer um tecido leve.",
      naoQuerUsar: "Cauda longa.",
      tetoOrcamento: 4500,
      escolhas: ["Modelo:Reto", "Tecido:Crepe"],
    },
  ]) {
    const { escolhas, ...interesse } = i;
    await db
      .insert(leadInteressesTable)
      .values(interesse)
      .onConflictDoUpdate({ target: leadInteressesTable.id, set: interesse });
    for (const chave of escolhas) {
      const achado = opcaoPorValor.get(chave);
      if (!achado) continue;
      await db
        .insert(leadInteresseAtributosTable)
        .values({
          leadInteresseId: interesse.id,
          atributoId: achado.atributoId,
          opcaoId: achado.opcaoId,
        })
        .onConflictDoNothing();
    }
  }

  // ── O lookbook da Ana Paula — os vestidos que ela provou ──────────────────
  await db
    .insert(lookbooksTable)
    .values({
      id: "demo-lookbook-ana",
      lojaId: LOJA_DEMO_ID,
      leadId: "demo-lead-ana",
      token: "demo-lookbook-ana-paula",
      criadoPorId: "demo-usuario-vendedora",
      expiraEm: emDias(30, 23, 59),
    })
    .onConflictDoUpdate({ target: lookbooksTable.id, set: { expiraEm: emDias(30, 23, 59) } });
  for (const [i, vestidoId] of ["demo-vestido-1", "demo-vestido-4", "demo-vestido-7"].entries()) {
    await db
      .insert(lookbookItensTable)
      .values({ id: `demo-lookitem-${i + 1}`, lookbookId: "demo-lookbook-ana", vestidoId, ordem: i })
      .onConflictDoNothing();
  }

  // ── Os portais: um vivo por noiva, com o token nas rotas dos prints ──────
  for (const [leadId, token, abertoHaDias] of [
    ["demo-lead-ana", "demo-portal-ana-paula", 2],
    ["demo-lead-beatriz", "demo-portal-beatriz", 5],
  ] as const) {
    await db
      .insert(portalTokensTable)
      .values({
        id: `demo-portal-${leadId}`,
        lojaId: LOJA_DEMO_ID,
        leadId,
        token,
        expiraEm: emDias(30, 23, 59),
        ultimoAcessoEm: emDias(-abertoHaDias, 20, 40),
      })
      .onConflictDoUpdate({
        target: portalTokensTable.id,
        set: { token, expiraEm: emDias(30, 23, 59), revogadoEm: null },
      });
  }

  // ── O histórico de contato: a ficha vazia não ensina o bloco ─────────────
  for (const [i, r] of [
    { leadId: "demo-lead-ana", canal: "WHATSAPP", observacao: "Mandei a proposta pelo link. Ela vai ver com o noivo.", diasAtras: 9 },
    { leadId: "demo-lead-ana", canal: "WHATSAPP", observacao: "Aceitou pelo link. Combinar o contrato esta semana.", diasAtras: 2 },
    { leadId: "demo-lead-carolina", canal: "TELEFONE", observacao: "Remarcou o primeiro atendimento para quinta.", diasAtras: 4 },
  ].entries()) {
    const { diasAtras, ...registro } = r;
    await db
      .insert(registrosCobrancaTable)
      .values({
        id: `demo-contato-${i + 1}`,
        lojaId: LOJA_DEMO_ID,
        ...registro,
        contatoData: emDias(-diasAtras, 15, 0),
        vendedorId: "demo-usuario-vendedora",
      })
      .onConflictDoNothing();
  }

  /**
   * Os DOIS outros estados de proposta que o manual mostra passo a passo: o
   * RASCUNHO que ainda se edita (a tela de montar o orçamento) e o APROVADO
   * que oferece "Gerar contrato". Sem eles, o manual printaria a mesma tela
   * três vezes e o passo a passo não teria o que mostrar.
   */
  await db
    .insert(orcamentosTable)
    .values({
      id: "demo-orcamento-carolina",
      lojaId: LOJA_DEMO_ID,
      leadId: "demo-lead-carolina",
      vendedoraId: "demo-usuario-vendedora",
      status: "RASCUNHO",
      validade: emDias(30, 23, 59),
    })
    .onConflictDoUpdate({ target: orcamentosTable.id, set: { status: "RASCUNHO", validade: emDias(30, 23, 59) } });
  for (const it of [
    { id: "demo-orcitem-c1", tipo: "VESTIDO" as const, descricao: "MS-040 · Evasê Bruges", valorUnitario: 4200, quantidade: 1, vestidoId: "demo-vestido-4" },
    { id: "demo-orcitem-c2", tipo: "ACESSORIO" as const, descricao: "Tiara de pérolas", valorUnitario: 340, quantidade: 1 },
  ]) {
    await db
      .insert(orcamentoItensTable)
      .values({ ...it, lojaId: LOJA_DEMO_ID, orcamentoId: "demo-orcamento-carolina" })
      .onConflictDoUpdate({ target: orcamentoItensTable.id, set: { valorUnitario: it.valorUnitario } });
  }

  await db
    .insert(orcamentosTable)
    .values({
      id: "demo-orcamento-juliana",
      lojaId: LOJA_DEMO_ID,
      leadId: "demo-lead-juliana",
      vendedoraId: "demo-usuario-vendedora",
      status: "APROVADO",
      validade: emDias(12, 23, 59),
      aprovadoEm: emDias(-30, 11, 20),
      publicoToken: "demo-proposta-juliana",
      publicoExpiraEm: emDias(4, 23, 59),
      publicoAbertoEm: emDias(-31, 19, 30),
      aceitoEm: emDias(-31, 19, 44),
      aceiteVersao: 1,
    })
    .onConflictDoUpdate({
      target: orcamentosTable.id,
      set: { status: "APROVADO", aprovadoEm: emDias(-30, 11, 20), aceitoEm: emDias(-31, 19, 44) },
    });
  for (const it of [
    { id: "demo-orcitem-j1", tipo: "VESTIDO" as const, descricao: "MS-061 · Sereia Provence", valorUnitario: 5200, quantidade: 1, vestidoId: "demo-vestido-6" },
    { id: "demo-orcitem-j2", tipo: "AJUSTE" as const, descricao: "Ajuste de barra e alças", valorUnitario: 260, quantidade: 1 },
  ]) {
    await db
      .insert(orcamentoItensTable)
      .values({ ...it, lojaId: LOJA_DEMO_ID, orcamentoId: "demo-orcamento-juliana" })
      .onConflictDoUpdate({ target: orcamentoItensTable.id, set: { valorUnitario: it.valorUnitario } });
  }

  console.log(
    [
      "loja-de-demonstracao: pronta.",
      `  loja      ${LOJA_DEMO_ID}`,
      `  noivas    ${NOIVAS.length}`,
      `  vestidos  ${VESTIDOS.length} (com foto e classificação)`,
      "  propostas rascunho (carolina) · enviada+aceita (ana) · aprovada (juliana)",
      "  contrato  demo-contrato-beatriz (6 parcelas, 2 pagas)",
      "  públicos  /orcamento/demo-proposta-ana-paula · /noiva/demo-portal-beatriz",
    ].join("\n"),
  );
  await pool.end();
}

await main();
