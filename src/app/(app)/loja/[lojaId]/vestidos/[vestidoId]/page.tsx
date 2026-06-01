// src/app/(app)/loja/[lojaId]/vestidos/[vestidoId]/page.tsx
// Detalhe do vestido — peça de acervo, não item de estoque. Leitura concierge:
// foto de apoio (modesta, não domina — §9), nome editorial, características em
// linguagem legível. Edição vive em /editar. Auth + tenant espelham as páginas
// irmãs; sem regra de negócio nova nesta fatia.
//
// Disponibilidade fica fora desta fatia: o motor (src/lib/disponibilidade) é puro
// e ainda não há camada que o ligue ao banco (bloqueios/regras). É feature própria.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessaoComLoja } from "@/lib/auth";
import { podeNoModulo } from "@/lib/permissoes/modulos";
import { obterVestido } from "@/lib/vestidos/vestidos";
import { listarFotosMeta } from "@/lib/vestidos/fotos";
import { listarCatalogo, rotularSelecoes } from "@/lib/catalogo/catalogo";

export const dynamic = "force-dynamic";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function VestidoPage({
  params,
}: {
  params: Promise<{ lojaId: string; vestidoId: string }>;
}) {
  const sc = await getSessaoComLoja();
  if (!sc) redirect("/login");
  if (!(await podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "ver"))) {
    redirect(`/loja/${sc.loja.id}`);
  }

  const { lojaId, vestidoId } = await params;

  // obterVestido já é escopado por loja (tenantPrisma) → null se for de outra loja.
  const v = await obterVestido(sc.loja.id, vestidoId);
  if (!v) redirect(`/loja/${lojaId}/vestidos`);

  const [fotos, catalogo, podeEditar] = await Promise.all([
    listarFotosMeta(sc.loja.id, vestidoId),
    listarCatalogo(sc.loja.id),
    podeNoModulo(sc.usuario.id, sc.loja.id, "vestidos", "editar"),
  ]);

  const caracteristicas = rotularSelecoes(catalogo, v.atributos);
  const editarHref = `/loja/${lojaId}/vestidos/${vestidoId}/editar`;
  const ativo = v.status === "ativo";
  const meta = [v.tamanho, v.cor, v.categoria].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <Link
          href={`/loja/${lojaId}/vestidos`}
          className="w-fit text-[13px] text-grafite transition-colors duration-150 hover:text-tinta"
        >
          ← Vestidos
        </Link>
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] font-medium tracking-[0.02em] text-cinza-fumo tabular-nums">
            {v.codigo}
          </span>
          {!ativo && <span className="text-[12px] text-cinza-fumo">fora do acervo</span>}
        </div>
        {/* Nome em destaque editorial: peça de acervo, não linha de estoque */}
        <h1 className="font-display text-[30px] font-light leading-tight tracking-tight text-tinta">
          {v.nome}
        </h1>
        {meta && <p className="text-[14px] text-cinza-fumo">{meta}</p>}
      </header>

      {/* A peça é a âncora visual: capa maior, 2ª menor ao lado (§8). Foto de apoio,
          não hero gigante (§9). Capa carrega eager (é o LCP); as demais, lazy. */}
      {fotos.length > 0 ? (
        <div className="flex flex-wrap items-end gap-4">
          {fotos.map((f) => (
            <div
              key={f.ordem}
              className={`${f.ordem === 0 ? "w-56" : "w-36"} aspect-[3/4] shrink-0 overflow-hidden rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-suave`}
            >
              {/* foto já otimizada (WebP), servida pelo route escopado; v= cache-busting */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/loja/${lojaId}/vestidos/${vestidoId}/foto/${f.ordem}?v=${f.versao}`}
                alt={`Vestido ${v.nome}: foto ${f.ordem + 1}`}
                loading={f.ordem === 0 ? "eager" : "lazy"}
                fetchPriority={f.ordem === 0 ? "high" : undefined}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : podeEditar ? (
        // Sem foto e pode editar: o tile inteiro é o alvo (≥44px), convite gentil.
        <Link
          href={editarHref}
          className="flex aspect-[3/4] w-56 flex-col items-center justify-center gap-1.5 rounded-[var(--mn-radius-md)]
            border border-borda-suave bg-papel-suave text-center transition-colors duration-150
            hover:border-champagne focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
        >
          <span className="text-[13px] text-grafite">Adicionar foto</span>
          <span className="text-[11px] text-cinza-fumo">ainda sem retrato</span>
        </Link>
      ) : (
        <div className="flex aspect-[3/4] w-56 items-center justify-center rounded-[var(--mn-radius-md)] border border-borda-suave bg-papel-suave text-center">
          <span className="text-[12px] text-cinza-fumo">Ainda sem retrato</span>
        </div>
      )}

      {/* Preço — dado útil, discreto (a peça é o herói, não a etiqueta) */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cinza-fumo">Preço</span>
        <span className="text-[16px] text-tinta tabular-nums">{brl.format(Number(v.precoBase))}</span>
      </div>

      {/* Características do acervo — atributos do catálogo em linguagem legível.
          Vazio não some em silêncio: convida a preencher (alimenta a indicação). */}
      {caracteristicas.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Características</h2>
          <ul className="flex flex-wrap gap-x-2 gap-y-1.5">
            {caracteristicas.map((c) => (
              <li
                key={c.nome}
                className="rounded-full border border-borda-suave bg-papel px-2.5 py-0.5 text-[12px] text-grafite"
              >
                {c.nome}: <span className="text-tinta">{c.valor}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        podeEditar && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Características</h2>
            <p className="max-w-[60ch] text-[14px] leading-[1.65] text-grafite">
              Ainda não preenchidas.{" "}
              <Link
                href={editarHref}
                className="rounded-sm text-grafite underline decoration-borda underline-offset-4
                  transition-colors duration-150 hover:text-tinta hover:decoration-champagne
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo"
              >
                Complete
              </Link>{" "}
              para melhorar as indicações de vestido.
            </p>
          </section>
        )
      )}

      {/* Observações — anotações do atelier sobre a peça */}
      {v.observacoes && (
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-cinza-fumo">Observações</h2>
          <p className="max-w-[60ch] text-[14px] leading-[1.65] text-grafite">{v.observacoes}</p>
        </section>
      )}

      {/* Ação — editar a peça (alvo de toque ≥44px) */}
      {podeEditar && (
        <footer className="border-t border-borda-suave pt-5">
          <Link
            href={editarHref}
            className="inline-flex min-h-11 items-center rounded-sm text-[13px] text-grafite underline
              decoration-borda underline-offset-4 transition-colors duration-150 hover:text-tinta
              hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-bordo"
          >
            Editar vestido
          </Link>
        </footer>
      )}
    </main>
  );
}
