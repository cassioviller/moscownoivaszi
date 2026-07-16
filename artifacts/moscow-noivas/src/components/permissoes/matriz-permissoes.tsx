import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AcessosModulos, AcoesModulo } from "@workspace/api-client-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * A grade de permissões: um módulo por linha, uma AÇÃO por coluna.
 *
 * O modelo era plano — uma checkbox de "acesso" por módulo — e não sabia dizer
 * "vê o financeiro mas não mexe", que é o pedido mais comum do atelier.
 *
 * A coerência `criar || editar ⇒ ver` é aplicada aqui, na interação, e não só
 * validada no fim: marcar "criar" acende "ver" na hora, e desmarcar "ver"
 * apaga as outras duas. O servidor normaliza de novo (ele é a autoridade), mas
 * a grade nunca chega a mostrar um estado que ele vai recusar.
 */

export const ACOES = ["ver", "criar", "editar"] as const;
export type Acao = (typeof ACOES)[number];

const ACOES_ROTULOS: Record<Acao, string> = {
  ver: "Ver",
  criar: "Criar",
  editar: "Editar",
};

const NADA: AcoesModulo = { ver: false, criar: false, editar: false };

/** Um módulo aparece liberado se pode ao menos uma ação. Mesmo gate do sidebar. */
export function moduloLiberado(acesso: unknown): boolean {
  if (acesso === true) return true;
  if (acesso && typeof acesso === "object") {
    return Object.values(acesso as Record<string, unknown>).some(Boolean);
  }
  return false;
}

/** Rótulos e ordem dos módulos conhecidos (espelha o gate do backend/sidebar). */
export const MODULOS_ROTULOS: Record<string, string> = {
  leads: "Leads",
  agenda: "Agenda",
  vestidos: "Vestidos",
  financeiro: "Financeiro",
  comissao: "Comissões",
  admin: "Administração da loja",
};
const ORDEM_MODULOS = Object.keys(MODULOS_ROTULOS);

/** Módulos conhecidos primeiro (na ordem canônica), extras do perfil ao final. */
function modulosOrdenados(valores: AcessosModulos): string[] {
  const extras = Object.keys(valores)
    .filter((m) => !ORDEM_MODULOS.includes(m))
    .sort();
  return [...ORDEM_MODULOS, ...extras];
}

/**
 * Lê as ações de um módulo tolerando o formato plano antigo (`true`), que ainda
 * pode chegar de um perfil não migrado. Mesma tradução do servidor: `true`
 * valia o módulo inteiro.
 */
function acoesDe(valor: unknown): AcoesModulo {
  if (valor === true) return { ver: true, criar: true, editar: true };
  if (!valor || typeof valor !== "object") return NADA;
  const v = valor as Record<string, unknown>;
  const criar = v.criar === true;
  const editar = v.editar === true;
  return { ver: v.ver === true || criar || editar, criar, editar };
}

/** Aplica a coerência ao clique: criar/editar acendem ver; ver apagado apaga tudo. */
function comCoerencia(atual: AcoesModulo, acao: Acao, marcado: boolean): AcoesModulo {
  const proximo = { ...atual, [acao]: marcado };
  if (acao === "ver" && !marcado) return NADA;
  if ((acao === "criar" || acao === "editar") && marcado) proximo.ver = true;
  return proximo;
}

/**
 * O schema Perfil não expõe flag de admin; o perfil de acesso total é
 * identificado pelo nome (seed do backend cria "Admin").
 */
export function ehPerfilAdmin(perfil: { nome: string }): boolean {
  const n = perfil.nome.trim().toLowerCase();
  return n === "admin" || n === "administrador" || n === "administradora";
}

/**
 * O componente inicializa o estado local a partir de `valores`; o pai deve
 * passar uma `key` que inclua a assinatura dos valores para remontar quando o
 * servidor devolver novos dados (após salvar).
 */
export function MatrizPermissoes({
  perfilNome,
  valores,
  modo,
  estado,
  salvando,
  onSalvar,
}: {
  perfilNome: string;
  valores: AcessosModulos;
  modo: "editavel" | "readonly";
  /** padrao = segue o modelo global; personalizado = override da loja. Omitir nos templates globais. */
  estado?: "padrao" | "personalizado";
  salvando?: boolean;
  onSalvar?: (acessos: AcessosModulos) => void;
}) {
  const modulos = modulosOrdenados(valores);
  const [acessos, setAcessos] = useState<AcessosModulos>(() =>
    Object.fromEntries(modulos.map((m) => [m, acoesDe(valores[m])])),
  );
  const readonly = modo === "readonly";

  const alternar = (modulo: string, acao: Acao, marcado: boolean) =>
    setAcessos((prev) => ({
      ...prev,
      [modulo]: comCoerencia(prev[modulo] ?? NADA, acao, marcado),
    }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">{perfilNome}</CardTitle>
        {readonly ? (
          <span className="text-xs text-muted-foreground">
            Acesso total — perfil do sistema
          </span>
        ) : estado ? (
          <Badge variant={estado === "personalizado" ? "default" : "secondary"}>
            {estado === "personalizado" ? "Personalizado" : "Padrão"}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              {ACOES.map((a) => (
                <TableHead key={a} className="w-20 text-center">
                  {ACOES_ROTULOS[a]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.map((m) => {
              const atuais = readonly ? acoesDe(valores[m]) : (acessos[m] ?? NADA);
              return (
                <TableRow key={m}>
                  <TableCell className="text-muted-foreground">
                    {MODULOS_ROTULOS[m] ?? m}
                  </TableCell>
                  {ACOES.map((a) => (
                    <TableCell key={a} className="text-center">
                      <Checkbox
                        checked={atuais[a]}
                        disabled={readonly}
                        onCheckedChange={(v) => alternar(m, a, v === true)}
                        aria-label={`${perfilNome} — ${MODULOS_ROTULOS[m] ?? m} — ${ACOES_ROTULOS[a]}`}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!readonly && onSalvar && (
          <Button size="sm" onClick={() => onSalvar(acessos)} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
