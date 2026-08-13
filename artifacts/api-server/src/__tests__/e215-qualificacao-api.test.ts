import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, leadsTable, contratosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  criarFixture,
  fecharPool,
  limparFixture,
  loginComLoja,
  criarLead,
  type Fixture,
} from "./helpers";

/**
 * **E215 — a ficha guarda quem assina.**
 *
 * O instrumento de locação abre qualificando as duas partes. A LOCADORA está no
 * cadastro da loja; a LOCATÁRIA não estava em lugar nenhum — a ficha da noiva
 * tinha nome, WhatsApp e a data do casamento, e **nenhum dado civil**. O
 * contrato saía com os campos em branco e a vendedora preenchia à mão.
 *
 * ## A medição que dimensionou o épico, e ela é sobre o campo que JÁ existia
 *
 * `contratos.cpf` estava lá desde antes, a tela de fechar contrato já o
 * oferecia (`orcamentos/[id].tsx`), e ele era **opcional**. Medido em
 * 13/08/2026 no `heliumdb` (o banco de `DATABASE_URL` — `select
 * current_database()` conferido antes de escrever o nome, pela régua do
 * `1d9ccff`):
 *
 *     leads .......................... 1413
 *     contratos ....................... 735
 *     contratos com cpf ................. 0
 *
 * **0 de 735.** Não era falta de campo, era falta de obrigação — e é por isso
 * que o épico é a REGRA, não a coluna: acrescentar onze campos opcionais teria
 * produzido onze colunas vazias. É o formato do E222 (o campo existia e nenhuma
 * tela o oferecia, 1 de 723) visto pelo outro lado.
 *
 * ## As três decisões
 *
 * 1. **A régua é da PORTA, não da coluna.** As colunas são anuláveis. Os 1413
 *    leads que já existem seguem válidos como FICHA — a noiva vira ficha quando
 *    liga perguntando preço, e exigir CPF ali travaria o balcão.
 * 2. **O contrato CONGELA a cópia.** A ficha é viva (ela muda de endereço,
 *    casa, troca de profissão) e o papel tem de poder ser reimpresso anos
 *    depois dizendo o que dizia. Mesma razão de `vestidoDescricao` e do par
 *    `descontoTipo`/`descontoValor`.
 * 3. **Uma fonte só.** O `cpf` do corpo do `POST /contratos` deixou de ser
 *    lido: era a segunda grafia do mesmo dado, e das duas só a ficha é
 *    editável depois. É a lição do E187, onde cinco grafias da mesma conta
 *    davam dois resultados.
 */

const FICHA_COMPLETA = {
  cpf: "390.533.447-05",
  rg: "12.345.678-9",
  estadoCivil: "SOLTEIRA" as const,
  profissao: "Professora",
  nascimento: new Date("1996-03-12T12:00:00-03:00"),
  email: "ana@exemplo.com.br",
  enderecoLogradouro: "Rua Luis Jacinto",
  enderecoNumero: "297",
  enderecoBairro: "Centro",
  enderecoCep: "12243-260",
  enderecoCidade: "São José dos Campos",
  enderecoEstado: "SP",
};

/**
 * Uma fixture para o arquivo inteiro, e um `fecharPool` só — no fim.
 * Fechá-lo no `afterAll` do primeiro `describe` derruba o pool para os
 * seguintes (`Cannot use a pool after calling end on the pool`), que foi o
 * vermelho que a primeira escrita deste arquivo produziu.
 */
let f: Fixture;
let agent: Awaited<ReturnType<typeof loginComLoja>>;
let agentAdmin: Awaited<ReturnType<typeof loginComLoja>>;

beforeAll(async () => {
  f = await criarFixture();
  agent = await loginComLoja(f.vendedoraEmail, f.lojaId);
  agentAdmin = await loginComLoja(f.superAdminEmail, f.lojaId);
});

afterAll(async () => {
  await limparFixture(f);
  await fecharPool();
});

describe("E215 — o contrato não fecha sem saber quem assina", () => {
  async function fechar(leadId: string) {
    return agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId,
      vendedoraId: f.vendedoraId,
      valorTotal: 3000,
    });
  }

  it("a ficha completa fecha contrato — 201", async () => {
    const lead = await criarLead(f);
    const res = await fechar(lead.id);
    expect(res.status).toBe(201);
  });

  it("sem CPF, a porta recusa e NOMEIA o campo", async () => {
    const lead = await criarLead(f, { cpf: null });
    const res = await fechar(lead.id);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("QUALIFICACAO_INCOMPLETA");
    expect(res.body.campos).toEqual([
      { campo: "cpf", motivo: "CPF não está na ficha da noiva" },
    ]);
  });

  it("a recusa lista TODOS os campos que faltam, não o primeiro", async () => {
    // Quem está fechando com a noiva na frente precisa saber tudo de uma vez —
    // senão a correção vira doze idas à ficha. É a lição do E214 sobre a régua
    // que não vira parede.
    const lead = await criarLead(f, {
      cpf: null,
      rg: null,
      profissao: null,
      enderecoCep: null,
    });
    const res = await fechar(lead.id);

    expect(res.status).toBe(422);
    expect(res.body.campos.map((c: { campo: string }) => c.campo)).toEqual([
      "cpf",
      "rg",
      "profissao",
      "enderecoCep",
    ]);
    expect(res.body.detalhe).toContain("4 dados");
  });

  it("string em branco não é preenchimento — espaço não qualifica ninguém", async () => {
    const lead = await criarLead(f, { rg: "   " });
    const res = await fechar(lead.id);

    expect(res.status).toBe(422);
    expect(res.body.campos).toEqual([
      { campo: "rg", motivo: "RG não está na ficha da noiva" },
    ]);
  });

  it("o complemento é o único opcional — casa térrea não tem apto 42", async () => {
    const lead = await criarLead(f, { enderecoComplemento: null });
    const res = await fechar(lead.id);
    expect(res.status).toBe(201);
  });

  it("o contrato CONGELA a cópia — mexer na ficha depois não mexe no papel", async () => {
    const lead = await criarLead(f, FICHA_COMPLETA);
    const res = await fechar(lead.id);
    expect(res.status).toBe(201);

    const contratoId = res.body.id as string;

    // A noiva casa e muda de endereço, meses depois.
    await db
      .update(leadsTable)
      .set({
        estadoCivil: "CASADA",
        enderecoLogradouro: "Rua Nova",
        enderecoNumero: "1000",
        profissao: "Diretora",
      })
      .where(eq(leadsTable.id, lead.id));

    const [contrato] = await db
      .select()
      .from(contratosTable)
      .where(eq(contratosTable.id, contratoId));

    // O papel continua dizendo o que ela assinou.
    expect(contrato.estadoCivil).toBe("SOLTEIRA");
    expect(contrato.enderecoLogradouro).toBe("Rua Luis Jacinto");
    expect(contrato.enderecoNumero).toBe("297");
    expect(contrato.profissao).toBe("Professora");
    expect(contrato.cpf).toBe("390.533.447-05");

    // E a ficha seguiu viva.
    const [fichaHoje] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, lead.id));
    expect(fichaHoje.estadoCivil).toBe("CASADA");
  });

  it("o `cpf` do CORPO não é mais lido — a ficha é a fonte", async () => {
    const lead = await criarLead(f, { cpf: "111.444.777-35" });
    const res = await agent.post(`/api/lojas/${f.lojaId}/contratos`).send({
      leadId: lead.id,
      vendedoraId: f.vendedoraId,
      valorTotal: 3000,
      cpf: "999.999.999-99",
    });

    expect(res.status).toBe(201);
    expect(res.body.cpf).toBe("111.444.777-35");
  });
});

describe("E215 — a ficha aceita e devolve a qualificação", () => {
  it("o POST da ficha grava os treze campos", async () => {
    const res = await agent.post(`/api/lojas/${f.lojaId}/leads`).send({
      noivaNome: "Ana Qualificada",
      cpf: "390.533.447-05",
      rg: "12.345.678-9",
      estadoCivil: "SOLTEIRA",
      profissao: "Professora",
      email: "ana@exemplo.com.br",
      enderecoLogradouro: "Rua Luis Jacinto",
      enderecoNumero: "297",
      enderecoBairro: "Centro",
      enderecoCep: "12243-260",
      enderecoCidade: "São José dos Campos",
      enderecoEstado: "SP",
    });

    expect(res.status).toBe(201);
    expect(res.body.cpf).toBe("390.533.447-05");
    expect(res.body.estadoCivil).toBe("SOLTEIRA");
    expect(res.body.enderecoCidade).toBe("São José dos Campos");
  });

  it("o PATCH corrige, e aceita null para APAGAR o dado pessoal errado", async () => {
    const lead = await criarLead(f);
    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ profissao: "Arquiteta", rg: null });

    expect(res.status).toBe(200);
    expect(res.body.profissao).toBe("Arquiteta");
    expect(res.body.rg).toBeNull();
  });

  it("apagar o `nascimento` com null APAGA — não grava 1970 (V12)", async () => {
    /**
     * A dívida que a `varredura-restricoes-do-spec` conta em `coerce.date()`
     * existe por isto: o gerador escreve `zod.coerce.date().nullish()`, e
     * `coerce` sobre um valor errado inventa uma data em vez de recusar — o
     * caso clássico é `null` virando **01/01/1970**.
     *
     * Nos campos de RESPOSTA isso é inofensivo (não há corpo em que um `null`
     * entre), e é por isso que as subidas anteriores daquele número foram
     * declaradas inofensivas. **Aqui não é campo de resposta**: o `PATCH` da
     * ficha aceita `null` de propósito, para apagar dado pessoal errado sem
     * esperar o expurgo de 24 meses. Se o `coerce` transformasse esse `null`
     * numa data, a noiva passaria a ter nascido em 1970 — e o contrato
     * congelaria isso no papel que ela assina.
     */
    const lead = await criarLead(f);
    expect(lead.nascimento).not.toBeNull();

    const res = await agent
      .patch(`/api/lojas/${f.lojaId}/leads/${lead.id}`)
      .send({ nascimento: null });

    expect(res.status).toBe(200);
    expect(res.body.nascimento).toBeNull();

    const [depois] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, lead.id));
    expect(depois.nascimento).toBeNull();
  });

  it("`nascimento` é dia de NEGÓCIO, e não anda um dia (S-O117)", async () => {
    /**
     * A noiva nasceu num DIA, e o RG dela imprime esse dia. Um cliente de API
     * que mande `new Date("1996-03-12")` manda **meia-noite UTC**; gravada
     * crua, ela vira **11/03** lida em fuso de São Paulo — e a ficha e o
     * contrato passariam a dizer o dia anterior ao que está no documento.
     *
     * É a S-O117 num terceiro campo. A única razão de ela não ter mordido aqui
     * antes é que a coluna não existia.
     */
    const res = await agent.post(`/api/lojas/${f.lojaId}/leads`).send({
      noivaNome: "Ana Nascida",
      nascimento: "1996-03-12T00:00:00.000Z",
    });
    expect(res.status).toBe(201);

    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, res.body.id));

    const diaEmSP = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(lead.nascimento!);

    expect(diaEmSP).toBe("12/03/1996");
  });
});

describe("E215 — o expurgo da LGPD alcança os treze campos novos", () => {
  it("a noiva anonimizada não guarda CPF, RG nem endereço", async () => {
    /**
     * **Dado pessoal novo entra nas duas pontas ou nasce fora da lei.** O
     * expurgo é `set({…})` de lista curada à mão — a classe da S-C33, na
     * direção que custa PROCESSO: campo que não entra na lista SOBREVIVE à
     * anonimização, e o sistema fica dizendo "(anonimizada)" no nome ao lado de
     * um CPF, um RG e um endereço completo.
     */
    const antigo = new Date();
    antigo.setFullYear(antigo.getFullYear() - 4);

    const lead = await criarLead(f, {
      etapa: "PERDIDO",
      perdidaEm: antigo,
      updatedAt: antigo,
      createdAt: antigo,
    });

    const res = await agentAdmin
      .post(`/api/lojas/${f.lojaId}/leads/expurgo`)
      .send({ mesesInatividade: 24 });

    expect(res.status).toBe(200);

    const [depois] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, lead.id));

    expect(depois.noivaNome).toBe("(anonimizada)");
    expect(depois.cpf).toBeNull();
    expect(depois.rg).toBeNull();
    expect(depois.estadoCivil).toBeNull();
    expect(depois.profissao).toBeNull();
    expect(depois.nascimento).toBeNull();
    expect(depois.email).toBeNull();
    expect(depois.enderecoLogradouro).toBeNull();
    expect(depois.enderecoNumero).toBeNull();
    expect(depois.enderecoBairro).toBeNull();
    expect(depois.enderecoCep).toBeNull();
    expect(depois.enderecoCidade).toBeNull();
    expect(depois.enderecoEstado).toBeNull();
  });
});
