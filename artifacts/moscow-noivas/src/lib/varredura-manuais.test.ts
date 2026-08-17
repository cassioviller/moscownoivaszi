import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lerDoRepo, manuaisVersionados } from "./manuais-do-repositorio";

/**
 * A régua (a) do plano dos manuais — **um manual que mente é pior que nenhum**.
 *
 * Os manuais de uso (`docs/manuais/*.html`) abrem declarando o que a pessoa vê
 * no menu, e é a primeira coisa que ela confere: se a lista não bate com a tela,
 * o manual perde a autoridade na primeira linha e nada do que ele diz depois é
 * lido. E é a parte que apodrece sozinha — um item novo na sidebar, um módulo
 * trocado no perfil semeado, e três arquivos de documentação passam a mentir
 * sem que ninguém encoste neles.
 *
 * Esta sonda calcula o menu **do zero**, das duas fontes que mandam:
 *
 * - `sidebar.tsx` — os rótulos e o módulo que cada um exige;
 * - `configuracao-inicial.ts` — os acessos de cada perfil SEMEADO.
 *
 * e confere contra o que cada manual reivindica. O manual diz de quem é a lista
 * pelo `data-perfil` do bloco; os dois lados da lista são `data-menu="ve"` e
 * `data-menu="naove"`.
 *
 * A régua exige a lista INTEIRA dos dois lados — a soma tem de dar o menu
 * completo. É de propósito: um item novo que ninguém mencionou reprova aqui, e
 * é justamente o item novo que o manual esqueceria.
 *
 * **Enumera com `git ls-files`** (regra da casa): 65% do que o disco devolve em
 * sessão com agentes é cópia de worktree órfão.
 */

const RAIZ = path.resolve(__dirname, "../../../..");
const SIDEBAR = "artifacts/moscow-noivas/src/components/layout/sidebar.tsx";
const PERFIS = "artifacts/api-server/src/lib/configuracao-inicial.ts";

// S-C271 — o enumerador dos manuais vem de um lugar só, com o piso dentro.
const manuais = manuaisVersionados;

// S-C271 — a leitura vem do módulo dos manuais.
const ler = lerDoRepo;

/**
 * Os itens do menu, na ordem em que a sidebar os declara: rótulo e os módulos
 * que o liberam. `modulos` (plural) é o item que basta UM dos módulos —
 * "Mensagens de hoje" é o único hoje, e existe porque o menu era mais
 * restritivo que a própria tela (E103).
 */
function itensDoMenu(): { rotulo: string; modulos: string[] }[] {
  const fonte = ler(SIDEBAR);
  const itens: { rotulo: string; modulos: string[] }[] = [];
  for (const m of fonte.matchAll(/\{\s*icon:[^}]*?label:\s*"([^"]+)"[^}]*?\}/g)) {
    const bloco = m[0]!;
    const rotulo = m[1]!;
    const plural = /modulos:\s*\[([^\]]+)\]/.exec(bloco);
    if (plural) {
      itens.push({
        rotulo,
        modulos: [...plural[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!),
      });
      continue;
    }
    const singular = /modulo:\s*"([^"]+)"/.exec(bloco);
    // Item sem módulo é sempre visível — "Seu dia", "Minha comissão" (o extrato
    // da PRÓPRIA pessoa) e "Configurações".
    itens.push({ rotulo, modulos: singular ? [singular[1]!] : [] });
  }
  return itens;
}

/**
 * Os perfis semeados, com os módulos que cada um LIBERA. Liberado = a permissão
 * tem qualquer uma das três em `true`, que é o `moduloLiberado` da tela — então
 * `NADA` é o único que fecha a porta, e `SO_VER` abre o item (só leitura).
 */
function perfisSemeados(): Map<string, Set<string>> {
  const fonte = ler(PERFIS);
  const constantes: Record<string, boolean> = {
    TUDO: true,
    SO_VER: true,
    VER_E_CRIAR: true,
    NADA: false,
  };
  const perfis = new Map<string, Set<string>>();
  for (const m of fonte.matchAll(/nome:\s*"([^"]+)"[\s\S]{0,200}?acessos:\s*\{([^}]+)\}/g)) {
    const liberados = new Set<string>();
    for (const par of m[2]!.matchAll(/(\w+):\s*(\w+)/g)) {
      const valor = constantes[par[2]!];
      // Constante nova sem tradução aqui vira erro alto, não permissão calada.
      if (valor === undefined) throw new Error(`acesso desconhecido: ${par[2]}`);
      if (valor) liberados.add(par[1]!);
    }
    perfis.set(m[1]!, liberados);
  }
  return perfis;
}

/** O que o menu mostra a quem tem estes módulos — a régua do `podeVer`. */
function menuDoPerfil(liberados: Set<string>): { ve: string[]; naove: string[] } {
  const ve: string[] = [];
  const naove: string[] = [];
  for (const item of itensDoMenu()) {
    const aparece = item.modulos.length === 0 || item.modulos.some((m) => liberados.has(m));
    (aparece ? ve : naove).push(item.rotulo);
  }
  return { ve, naove };
}

/** O que o manual reivindica: `data-perfil` no bloco, `data-menu` nos lados. */
function reivindicacoes(html: string): { perfil: string; ve: string[]; naove: string[] }[] {
  const blocos: { perfil: string; ve: string[]; naove: string[] }[] = [];
  for (const m of html.matchAll(/<div class="colunas" data-perfil="([^"]+)">([\s\S]*?)\n      <\/div>/g)) {
    const lado = (qual: string) => {
      const caixa = new RegExp(`data-menu="${qual}"[\\s\\S]*?<ul>([\\s\\S]*?)</ul>`).exec(m[2]!);
      if (!caixa) return [];
      return [...caixa[1]!.matchAll(/<li>([^<]+)<\/li>/g)].map((x) => x[1]!.trim());
    };
    blocos.push({ perfil: m[1]!, ve: lado("ve"), naove: lado("naove") });
  }
  return blocos;
}

describe("varredura — o menu que o manual promete é o menu que o perfil abre", () => {
  const arquivos = manuais();
  const itens = itensDoMenu();
  const perfis = perfisSemeados();

  /**
   * O piso. Conjunto vazio aprova tudo em silêncio, que é a falha mais cara de
   * uma sonda: verde por não ter olhado. Medido em 2026-08-12: **5 manuais**,
   * **19 itens de menu** e **5 perfis semeados** — o quinto é a Costureira, que
   * o E172 fez nascer (S-O36).
   */
  it("olha para manuais, itens e perfis — não para conjuntos vazios", () => {
    expect(arquivos.length).toBe(5);
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(itens.length).toBeGreaterThanOrEqual(15);
    expect(perfis.size).toBe(5);
  });

  it("todo perfil citado por um manual é um perfil que o sistema semeia", () => {
    const citados = arquivos.flatMap((a) => reivindicacoes(ler(a)).map((r) => r.perfil));
    // piso anti-vacuidade (S-RM33): a população cresce por fora, e este número é o PISO — não a medida.
    expect(citados.length).toBeGreaterThanOrEqual(2);
    expect(citados.filter((p) => !perfis.has(p))).toEqual([]);
  });

  it("a lista do manual é a lista da tela — dos dois lados, inteira", () => {
    const divergencias: string[] = [];
    for (const arquivo of arquivos) {
      for (const r of reivindicacoes(ler(arquivo))) {
        const esperado = menuDoPerfil(perfis.get(r.perfil) ?? new Set());
        // Ordenados: o manual agrupa por assunto, a sidebar por contexto — o que
        // se cobra é o CONJUNTO, não a ordem de leitura.
        const par = (a: string[]) => [...a].sort().join(" · ");
        if (par(r.ve) !== par(esperado.ve)) {
          divergencias.push(`${arquivo} (${r.perfil}) vê: ${par(r.ve)} — a tela dá: ${par(esperado.ve)}`);
        }
        if (par(r.naove) !== par(esperado.naove)) {
          divergencias.push(
            `${arquivo} (${r.perfil}) não vê: ${par(r.naove)} — a tela esconde: ${par(esperado.naove)}`,
          );
        }
      }
    }
    expect(divergencias).toEqual([]);
  });

  it("os links entre manuais apontam arquivo que existe", () => {
    const versionados = new Set(arquivos.map((a) => path.basename(a)));
    const mortos: string[] = [];
    for (const arquivo of arquivos) {
      for (const m of ler(arquivo).matchAll(/href="([^"#][^"]*\.html)"/g)) {
        if (!versionados.has(m[1]!)) mortos.push(`${arquivo} → ${m[1]}`);
      }
    }
    expect(mortos).toEqual([]);
  });

  it("todo item do índice leva a uma seção que existe na página", () => {
    const mortas: string[] = [];
    for (const arquivo of arquivos) {
      const html = ler(arquivo);
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
      for (const m of html.matchAll(/href="#([^"]+)"/g)) {
        if (!ids.has(m[1]!)) mortas.push(`${arquivo} → #${m[1]}`);
      }
    }
    expect(mortas).toEqual([]);
  });
});

/**
 * O que esta varredura NÃO enxerga, e é honesto dizer:
 *
 * 1. **O corpo do manual.** Ela confere a lista do menu, os links entre os
 *    arquivos e as âncoras do índice. Um passo a passo que descreve um diálogo
 *    que mudou continua passando verde — para isso serve o E2E, e a régua (c) do
 *    plano é declarar o caminho que nenhum spec cruza.
 * 2. **Perfil criado NA LOJA.** Ela compara com os quatro perfis semeados; um
 *    perfil montado à mão em `/permissoes` não está aqui e nem deveria — o
 *    manual descreve a instalação padrão.
 * 3. **Rótulo certo, tela errada.** Se um item do menu mantiver o nome e passar
 *    a apontar outra rota, ela aprova; quem pega isso é a
 *    `varredura-links-internos`.
 * 4. **O que o item FAZ com cada ação.** "Aparece no menu" não é "pode editar":
 *    a Recepção vê Vestidos e só olha. O manual diz isso em prosa, e prosa não
 *    tem régua.
 * 5. **Manual ainda não versionado.** Ela enumera com `git ls-files`, então um
 *    arquivo novo em `docs/manuais/` que ainda não foi `git add`ado passa
 *    invisível — e a suíte fica VERDE por não ter olhado. Custou uma rodada em
 *    2026-08-12, com o manual da recepção pronto no disco: `git add` primeiro,
 *    e é o piso de população que avisa quando a conta não cresceu.
 */
