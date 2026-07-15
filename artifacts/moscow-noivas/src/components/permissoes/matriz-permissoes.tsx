import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Acessos no modelo FLAT vigente: um boolean por módulo. */
export type AcessosFlat = Record<string, boolean>;

/**
 * Um módulo é liberado se `true` ou (formato futuro da Onda 4) objeto com
 * algum sub-acesso true. Mesmo padrão do sidebar.
 */
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
function modulosOrdenados(valores: AcessosFlat): string[] {
  const extras = Object.keys(valores)
    .filter((m) => !ORDEM_MODULOS.includes(m))
    .sort();
  return [...ORDEM_MODULOS, ...extras];
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
 * Matriz de permissões FLAT: uma checkbox de acesso por módulo.
 * TODO Onda 4: colunas por ação (Ver/Criar/Editar) quando o modelo de
 * permissões deixar de ser flat — a grade do orcamentos tinha 3 colunas.
 *
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
  valores: AcessosFlat;
  modo: "editavel" | "readonly";
  /** padrao = segue o modelo global; personalizado = override da loja. Omitir nos templates globais. */
  estado?: "padrao" | "personalizado";
  salvando?: boolean;
  onSalvar?: (acessos: AcessosFlat) => void;
}) {
  const [acessos, setAcessos] = useState<AcessosFlat>(() => ({ ...valores }));
  const readonly = modo === "readonly";
  const modulos = modulosOrdenados(valores);

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
              <TableHead className="w-24 text-center">Acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.map((m) => (
              <TableRow key={m}>
                <TableCell className="text-muted-foreground">
                  {MODULOS_ROTULOS[m] ?? m}
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={readonly ? moduloLiberado(valores[m]) : !!acessos[m]}
                    disabled={readonly}
                    onCheckedChange={(v) =>
                      setAcessos((prev) => ({ ...prev, [m]: v === true }))
                    }
                    aria-label={`${perfilNome} — ${MODULOS_ROTULOS[m] ?? m}`}
                  />
                </TableCell>
              </TableRow>
            ))}
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
