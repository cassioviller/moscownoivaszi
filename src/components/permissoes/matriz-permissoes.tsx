// src/components/permissoes/matriz-permissoes.tsx
"use client";

import { useActionState, useState } from "react";
import type { AcessosModulos, Modulo, Acao } from "@/lib/permissoes/modulos";

export type MatrizFormState = { erro: string | null; ok: boolean };
const INICIAL: MatrizFormState = { erro: null, ok: false };

const ROTULO_MODULO: Record<Modulo, string> = {
  leads: "Leads",
  interesses: "Interesses",
  vestidos: "Vestidos",
  ajustes: "Ajustes", // tela da costureira (provas/ajustes)
  config: "Catálogo", // módulo "config" gateia a gestão do catálogo (telas /catalogo)
  financeiro: "Financeiro", // receber, pagar e comissões (dado sensível)
};
const ROTULO_ACAO: Record<Acao, string> = { ver: "Ver", criar: "Criar", editar: "Editar" };
const ACOES_UI: Acao[] = ["ver", "criar", "editar"];

export function MatrizPermissoes({
  perfilId,
  perfilNome,
  valores,
  modulosVisiveis,
  modo,
  estado,
  salvarAction,
  restaurarAction,
}: {
  perfilId: string;
  perfilNome: string;
  valores: AcessosModulos;
  modulosVisiveis: Modulo[];
  modo: "editavel" | "readonly";
  estado?: "padrao" | "personalizado";
  salvarAction?: (prev: MatrizFormState, fd: FormData) => Promise<MatrizFormState>;
  restaurarAction?: (fd: FormData) => void | Promise<void>;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-borda bg-papel-elevado px-5 py-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-medium tracking-tight text-tinta">{perfilNome}</h2>
        {modo === "readonly" ? (
          <span className="text-[12px] text-cinza-fumo">Acesso total — perfil do sistema</span>
        ) : (
          <span className="text-[12px] text-grafite">
            {estado === "personalizado" ? "Personalizado" : "Padrão"}
          </span>
        )}
      </header>

      {modo === "readonly" ? (
        <Grade perfilId={perfilId} valores={valores} modulos={modulosVisiveis} disabled />
      ) : (
        <FormEditavel
          perfilId={perfilId}
          perfilNome={perfilNome}
          valores={valores}
          modulos={modulosVisiveis}
          estado={estado}
          salvarAction={salvarAction!}
          restaurarAction={restaurarAction}
        />
      )}
    </section>
  );
}

function FormEditavel({
  perfilId,
  perfilNome,
  valores,
  modulos,
  estado,
  salvarAction,
  restaurarAction,
}: {
  perfilId: string;
  perfilNome: string;
  valores: AcessosModulos;
  modulos: Modulo[];
  estado?: "padrao" | "personalizado";
  salvarAction: (prev: MatrizFormState, fd: FormData) => Promise<MatrizFormState>;
  restaurarAction?: (fd: FormData) => void | Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(salvarAction, INICIAL);
  // Módulos fora da grade (ex.: config) entram como hidden p/ o snapshot não zerá-los.
  const ocultos = (Object.keys(valores) as Modulo[]).filter((m) => !modulos.includes(m));
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="perfilId" value={perfilId} />
      {ocultos.flatMap((m) =>
        ACOES_UI.filter((a) => valores[m][a]).map((a) => (
          <input key={`${m}.${a}`} type="hidden" name={`${m}.${a}`} value="on" />
        )),
      )}
      <Grade perfilId={perfilId} valores={valores} modulos={modulos} disabled={false} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center w-fit rounded-md bg-bordo px-4 py-2.5
            text-[14px] font-medium tracking-[0.01em] text-papel transition-colors duration-150 ease-out
            hover:bg-bordo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bordo
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {estado === "personalizado" && restaurarAction && (
          <button
            type="submit"
            formAction={restaurarAction}
            formNoValidate
            onClick={(e) => {
              if (
                !confirm(
                  "Restaurar padrão? As permissões personalizadas desta loja serão removidas e este perfil voltará a seguir o modelo global.",
                )
              ) {
                e.preventDefault();
              }
            }}
            className="text-[13px] text-grafite hover:text-bordo transition-colors duration-150"
          >
            Restaurar padrão
          </button>
        )}
      </div>
      {state.ok && <p className="text-[13px] text-grafite">{perfilNome} atualizado.</p>}
      {state.erro && (
        <p role="alert" className="text-[13px] text-bordo">
          {state.erro}
        </p>
      )}
    </form>
  );
}

function Grade({
  perfilId,
  valores,
  modulos,
  disabled,
}: {
  perfilId: string;
  valores: AcessosModulos;
  modulos: Modulo[];
  disabled: boolean;
}) {
  return (
    <table className="w-full text-[14px]">
      <thead>
        <tr className="text-[12px] text-cinza-fumo">
          <th className="text-left font-medium py-1">Módulo</th>
          {ACOES_UI.map((a) => (
            <th key={a} className="font-medium py-1 px-2 w-16 text-center">
              {ROTULO_ACAO[a]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {modulos.map((m) => {
          const v = valores[m];
          // key inclui a assinatura → remonta (reseta useState) quando o servidor
          // reenvia novos valores (após Salvar/Restaurar padrão).
          const sig = `${v.ver ? 1 : 0}${v.criar ? 1 : 0}${v.editar ? 1 : 0}`;
          return (
            <LinhaModulo key={`${perfilId}-${m}-${sig}`} modulo={m} valores={v} disabled={disabled} />
          );
        })}
      </tbody>
    </table>
  );
}

function LinhaModulo({
  modulo,
  valores,
  disabled,
}: {
  modulo: Modulo;
  valores: { ver: boolean; criar: boolean; editar: boolean };
  disabled: boolean;
}) {
  const [ver, setVer] = useState(valores.ver);
  const [criar, setCriar] = useState(valores.criar);
  const [editar, setEditar] = useState(valores.editar);

  // Coerência (UX): criar/editar ⇒ ver; desmarcar ver cascateia.
  function onCriar(v: boolean) {
    setCriar(v);
    if (v) setVer(true);
  }
  function onEditar(v: boolean) {
    setEditar(v);
    if (v) setVer(true);
  }
  function onVer(v: boolean) {
    setVer(v);
    if (!v) {
      setCriar(false);
      setEditar(false);
    }
  }
  const verTravado = criar || editar;

  return (
    <tr className="border-t border-borda-suave text-tinta">
      <td className="py-2 text-grafite">{ROTULO_MODULO[modulo]}</td>
      <td className="text-center">
        <Caixa name={`${modulo}.ver`} checked={ver} disabled={disabled || verTravado} onChange={onVer} />
      </td>
      <td className="text-center">
        <Caixa name={`${modulo}.criar`} checked={criar} disabled={disabled} onChange={onCriar} />
      </td>
      <td className="text-center">
        <Caixa name={`${modulo}.editar`} checked={editar} disabled={disabled} onChange={onEditar} />
      </td>
    </tr>
  );
}

function Caixa({
  name,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      name={name}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 accent-bordo align-middle disabled:opacity-40 disabled:cursor-not-allowed"
    />
  );
}
