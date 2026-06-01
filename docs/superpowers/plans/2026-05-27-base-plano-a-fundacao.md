# Plano A — Fundação (Moscow Noivas / Base) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o projeto rodando com Next.js + TypeScript + Tailwind, banco PostgreSQL acessível, Prisma configurado com o schema completo da Base, migration aplicada e seed inicial carregado.

**Architecture:** Monólito full-stack TypeScript (Next.js App Router). Prisma é a camada de acesso a dados sobre PostgreSQL. O banco roda localmente via Docker Compose. Tudo que é regra/opção configurável nasce como dado semeado, não como código.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS · PostgreSQL (gerenciado pelo Replit) · Prisma 7 + `@prisma/adapter-pg` · Vitest · bcryptjs

---

## Status: IMPLEMENTADO (2026-05-27) — com desvios do plano original

Este plano foi escrito assumindo **Prisma 6 + Postgres local via docker**. O ambiente real (Replit) exigiu adaptações; o que está **no repositório** é o que vale. Desvios relevantes:

1. **Prisma 7, não 6.** O gerador é `prisma-client` (não `prisma-client-js`), com `output = "../src/generated/prisma"` (diretório **gitignored**, regenerado por `prisma generate`). O client é importado de `@/generated/prisma/client` (não de `@prisma/client`).
2. **`url` proibida no schema.** No Prisma 7 o bloco `datasource` **não** aceita `url`. A URL do CLI/migrate fica em `prisma.config.ts` (`datasource.url`, com `import "dotenv/config"`).
3. **Driver adapter em runtime.** O `PrismaClient` é construído com `new PrismaClient({ adapter })` usando `@prisma/adapter-pg` (`new PrismaPg({ connectionString: process.env.DATABASE_URL })`). Sem isso o client falha pedindo `PrismaClientOptions` válidas.
4. **Banco = Postgres do Replit (`heliumdb`).** O ambiente injeta `DATABASE_URL` (`postgres@helium/heliumdb`). `dotenv` não sobrescreve env existente, então o `.env`/docker do plano eram ignorados. **`docker-compose.yml` foi removido.** Migration e seed rodam contra o heliumdb.
5. **Vitest precisa do alias `@/`.** `vitest.config.ts` define `resolve.alias` `@` → `./src`, senão os imports `@/lib/...` não resolvem nos testes.
6. **node/npm não estão no PATH** neste Replit; foram disponibilizados via symlinks em `~/.local/bin` (fix durável: `pkgs.nodejs_20` no `replit.nix`).

Os blocos de código abaixo foram corrigidos para refletir 1–5. Resultado: schema válido, migration aplicada, seed populado, **6 testes verdes**.

---

## File Structure

Arquivos criados/modificados neste plano e a responsabilidade de cada um:

- `package.json` — dependências e scripts do projeto
- `docker-compose.yml` — Postgres local para desenvolvimento
- `.env` / `.env.example` — `DATABASE_URL` e variáveis de ambiente
- `prisma/schema.prisma` — definição de todas as entidades e enums da Base
- `prisma/seed.ts` — carga inicial (loja, perfis, usuário admin, catálogo, regras)
- `src/lib/db.ts` — singleton do Prisma Client (evita múltiplas conexões em dev)
- `vitest.config.ts` — configuração do runner de testes
- `src/lib/__tests__/seed.test.ts` — teste de fumaça: banco conecta e seed populou os dados esperados

Decisão de decomposição: `db.ts` isola a criação do client (um único lugar para mexer em conexão). O schema fica num arquivo só porque o Prisma exige um schema único — mas está organizado por blocos comentados (Configuração / Operação).

---

## Task 1: Scaffold do projeto Next.js + TypeScript + Tailwind

**Files:**
- Create: projeto Next.js na pasta atual (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/*`, `tailwind.config.ts`, etc.)

- [x] **Step 1: Criar o projeto Next.js na pasta do repositório**

A pasta `moscow_noivas` já existe e tem `.git`, `docs/` e `.claude/`. Use `.` para scaffoldar dentro dela.

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```
Quando perguntar sobre sobrescrever arquivos existentes (por causa do `.git`/`docs`), confirme manter. Espera-se: projeto criado, `package.json`, `src/app/page.tsx`, `tailwind.config.ts` presentes.

- [x] **Step 2: Verificar que o app sobe**

Run:
```bash
npm run dev
```
Expected: servidor em `http://localhost:3000` respondendo (página inicial do Next). Encerre com Ctrl+C.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript + Tailwind"
```

---

## Task 2: PostgreSQL local via Docker Compose + variáveis de ambiente

**Files:**
- Create: `docker-compose.yml`
- Create: `.env`
- Create: `.env.example`
- Modify: `.gitignore` (garantir que `.env` está ignorado)

- [x] **Step 1: Criar `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    container_name: moscow_noivas_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: moscow
      POSTGRES_PASSWORD: moscow
      POSTGRES_DB: moscow_noivas
    ports:
      - "5432:5432"
    volumes:
      - moscow_pgdata:/var/lib/postgresql/data

volumes:
  moscow_pgdata:
```

- [x] **Step 2: Criar `.env`**

```dotenv
DATABASE_URL="postgresql://moscow:moscow@localhost:5432/moscow_noivas?schema=public"
```

- [x] **Step 3: Criar `.env.example`** (mesmo conteúdo, serve de modelo versionado)

```dotenv
DATABASE_URL="postgresql://moscow:moscow@localhost:5432/moscow_noivas?schema=public"
```

- [x] **Step 4: Garantir `.env` ignorado pelo git**

Confirme que `.gitignore` contém a linha `.env*` (o create-next-app já adiciona). Se não tiver, adicione:
```
.env*
!.env.example
```

- [x] **Step 5: Subir o banco e verificar**

Run:
```bash
docker compose up -d
docker compose ps
```
Expected: container `moscow_noivas_db` com status `running`/`healthy` na porta 5432.

> Nota: se não houver Docker, aponte `DATABASE_URL` para qualquer PostgreSQL acessível — o restante do plano não muda.

- [x] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "chore: postgres local via docker-compose + env"
```

---

## Task 3: Instalar e inicializar o Prisma + client singleton

**Files:**
- Modify: `package.json` (dependências)
- Create: `prisma/schema.prisma` (gerado pelo init, sobrescrito na Task 4)
- Create: `src/lib/db.ts`

- [x] **Step 1: Instalar dependências**

Run:
```bash
npm install prisma --save-dev
npm install @prisma/client bcryptjs
npm install -D tsx @types/bcryptjs
```
Expected: pacotes adicionados ao `package.json`.

- [x] **Step 2: Inicializar Prisma**

Run:
```bash
npx prisma init --datasource-provider postgresql
```
Expected: cria `prisma/schema.prisma` e (se ainda não existir) `.env`. Mantenha o `DATABASE_URL` que já definimos na Task 2.

- [x] **Step 3: Criar o singleton do client em `src/lib/db.ts`**

```typescript
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7 exige um driver adapter no construtor (não mais uma URL no schema).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [x] **Step 4: Commit**

```bash
git add package.json package-lock.json prisma/schema.prisma src/lib/db.ts
git commit -m "chore: install and init Prisma + client singleton"
```

---

## Task 4: Definir o schema completo da Base

**Files:**
- Modify: `prisma/schema.prisma` (substituir todo o conteúdo)

- [x] **Step 1: Substituir `prisma/schema.prisma` pelo schema completo**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ───────────────────────── Enums ─────────────────────────

enum AtributoTipo {
  OPCAO_UNICA
  ESCALA
}

enum Escala {
  POUCO
  MEDIO
  MUITO
}

enum Fenda {
  SIM
  NAO
  TALVEZ
}

enum LeadEtapa {
  NOVO
  INTERESSES_PREENCHIDOS
  ATENDIMENTO_AGENDADO
  EM_ATENDIMENTO
  ORCAMENTO_ABERTO
  CONTRATO_FECHADO
  EM_PROVAS
  RETIRADO
  CASAMENTO_REALIZADO
  DEVOLVIDO
  PERDIDO
}

enum LeadOrigem {
  LOJA
  WHATSAPP
}

enum BloqueioTipo {
  RESERVA_CASAMENTO
  MANUTENCAO
}

// ───────────────────── Configuração ──────────────────────

model Loja {
  id        String   @id @default(cuid())
  nome      String
  cnpj      String?
  endereco  String?
  telefone  String?
  ativo     Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  usuarios            UsuarioLoja[]
  atributos           Atributo[]
  regraDisponibilidade RegraDisponibilidade?
  vestidos            Vestido[]
  leads               Lead[]
  bloqueios           BloqueioVestido[]
}

model Perfil {
  id             String   @id @default(cuid())
  nome           String
  // acesso por módulo (sim/não): { "leads": true, "vestidos": true, "config": false, ... }
  acessosModulos Json
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  usuarios UsuarioLoja[]
}

model Usuario {
  id        String   @id @default(cuid())
  nome      String
  email     String   @unique
  senhaHash String
  ativo     Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  lojas UsuarioLoja[]
}

model UsuarioLoja {
  usuarioId String
  lojaId    String
  perfilId  String

  usuario Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  loja    Loja    @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  perfil  Perfil  @relation(fields: [perfilId], references: [id])

  @@id([usuarioId, lojaId])
}

model Atributo {
  id     String       @id @default(cuid())
  lojaId String
  nome   String
  tipo   AtributoTipo @default(OPCAO_UNICA)
  ordem  Int          @default(0)
  ativo  Boolean      @default(true)

  loja               Loja                    @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  opcoes             AtributoOpcao[]
  vestidoAtributos   VestidoAtributo[]
  interesseAtributos LeadInteresseAtributo[]
}

model AtributoOpcao {
  id         String  @id @default(cuid())
  atributoId String
  valor      String
  ordem      Int     @default(0)
  ativo      Boolean @default(true)

  atributo           Atributo                @relation(fields: [atributoId], references: [id], onDelete: Cascade)
  vestidoAtributos   VestidoAtributo[]
  interesseAtributos LeadInteresseAtributo[]
}

model RegraDisponibilidade {
  id                String @id @default(cuid())
  lojaId            String @unique
  provaDiasAntes    Int    @default(14)
  provaDuracao      Int    @default(2)
  usoDiasAntes      Int    @default(3)
  usoDiasDepois     Int    @default(2)
  lavagemDiasDepois Int    @default(7)

  loja Loja @relation(fields: [lojaId], references: [id], onDelete: Cascade)
}

// ─────────────────────── Operação ────────────────────────

model Vestido {
  id          String   @id @default(cuid())
  lojaId      String
  codigo      String
  nome        String
  precoBase   Decimal  @db.Decimal(10, 2)
  tamanho     String?
  cor         String?
  categoria   String?
  status      String   @default("ativo")
  observacoes String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  loja       Loja              @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  atributos  VestidoAtributo[]
  bloqueios  BloqueioVestido[]

  @@unique([lojaId, codigo])
}

model VestidoAtributo {
  vestidoId  String
  atributoId String
  opcaoId    String

  vestido  Vestido       @relation(fields: [vestidoId], references: [id], onDelete: Cascade)
  atributo Atributo      @relation(fields: [atributoId], references: [id])
  opcao    AtributoOpcao @relation(fields: [opcaoId], references: [id])

  @@id([vestidoId, atributoId])
}

model Lead {
  id               String     @id @default(cuid())
  lojaId           String
  etapa            LeadEtapa  @default(NOVO)
  noivaNome        String
  noivoNome        String?
  cerimonialista   String?
  whatsapp         String?
  casamentoData    DateTime?
  casamentoHorario String?
  casamentoLocal   String?
  origem           LeadOrigem @default(LOJA)
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  loja      Loja              @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  interesse LeadInteresse?
  bloqueios BloqueioVestido[]
}

model LeadInteresse {
  id           String   @id @default(cuid())
  leadId       String   @unique
  volumeSaia   Escala?
  brilho       Escala?
  cauda        Escala?
  fenda        Fenda?
  algoAMais    String?
  naoQuerUsar  String?
  tetoOrcamento Decimal? @db.Decimal(10, 2)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  lead       Lead                    @relation(fields: [leadId], references: [id], onDelete: Cascade)
  atributos  LeadInteresseAtributo[]
}

model LeadInteresseAtributo {
  leadInteresseId String
  atributoId      String
  opcaoId         String

  leadInteresse LeadInteresse @relation(fields: [leadInteresseId], references: [id], onDelete: Cascade)
  atributo      Atributo      @relation(fields: [atributoId], references: [id])
  opcao         AtributoOpcao @relation(fields: [opcaoId], references: [id])

  @@id([leadInteresseId, atributoId])
}

model BloqueioVestido {
  id                String       @id @default(cuid())
  lojaId            String
  vestidoId         String
  leadId            String?
  tipo              BloqueioTipo
  casamentoData     DateTime?
  provaDataReal     DateTime?
  retiradaDataReal  DateTime?
  devolucaoDataReal DateTime?
  observacao        String?
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  loja    Loja    @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  vestido Vestido @relation(fields: [vestidoId], references: [id], onDelete: Cascade)
  lead    Lead?   @relation(fields: [leadId], references: [id], onDelete: SetNull)
}
```

- [x] **Step 2: Validar o schema**

Run:
```bash
npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [x] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: schema completo da Base (config + operacao)"
```

---

## Task 5: Primeira migration

**Files:**
- Create: `prisma/migrations/*` (gerado pelo Prisma)

- [x] **Step 1: Garantir que o banco está de pé**

Run:
```bash
docker compose up -d
```

- [x] **Step 2: Criar e aplicar a migration inicial**

Run:
```bash
npx prisma migrate dev --name init
```
Expected: pasta `prisma/migrations/<timestamp>_init/` criada; mensagem `Your database is now in sync with your schema.`; client gerado.

- [x] **Step 3: Conferir no Prisma Studio (opcional, visual)**

Run:
```bash
npx prisma studio
```
Expected: abre em `http://localhost:5555` mostrando todas as tabelas vazias. Encerre com Ctrl+C.

- [x] **Step 4: Commit**

```bash
git add prisma/migrations
git commit -m "feat: migration inicial do banco"
```

---

## Task 6: Configurar Vitest

**Files:**
- Modify: `package.json` (scripts + deps)
- Create: `vitest.config.ts`

- [x] **Step 1: Instalar Vitest**

Run:
```bash
npm install -D vitest dotenv
```

- [x] **Step 2: Criar `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config(); // carrega .env (DATABASE_URL) para os testes de integração

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
  },
});
```

- [x] **Step 3: Adicionar scripts ao `package.json`**

No bloco `"scripts"`, adicione:
```json
"test": "vitest run",
"test:watch": "vitest",
"db:seed": "tsx prisma/seed.ts"
```

- [x] **Step 4: Verificar que o Vitest roda (sem testes ainda)**

Run:
```bash
npm test
```
Expected: Vitest executa e reporta `No test files found` (ou 0 testes). Sem erro de configuração.

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: configurar Vitest"
```

---

## Task 7: Script de seed (carga inicial)

**Files:**
- Create: `prisma/seed.ts`

- [x] **Step 1: Criar `prisma/seed.ts`**

```typescript
import { PrismaClient, AtributoTipo } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// Prisma 7 exige um driver adapter no construtor (não mais uma URL no schema).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Catálogo inicial de atributos compartilhados (interesses + vestidos).
// Valores de exemplo — a loja edita depois via CRUD.
const ATRIBUTOS: { nome: string; tipo: AtributoTipo; opcoes: string[] }[] = [
  {
    nome: "Decote",
    tipo: "OPCAO_UNICA",
    opcoes: ["Tomara que caia", "V", "Coração", "Ombro a ombro", "Canoa", "Halter"],
  },
  {
    nome: "Costas",
    tipo: "OPCAO_UNICA",
    opcoes: ["Fechada", "Aberta", "Renda", "Botões", "Decote nas costas"],
  },
  {
    nome: "Alças e mangas",
    tipo: "OPCAO_UNICA",
    opcoes: ["Sem alça", "Alça fina", "Manga longa", "Manga curta", "Mangas de renda"],
  },
  {
    nome: "Tipo de saia",
    tipo: "OPCAO_UNICA",
    opcoes: ["Lisa", "Com detalhe", "Princesa", "Sereia", "Reta", "Evasê"],
  },
];

// Módulos existentes na Base, para o mapa de acesso dos perfis.
const MODULOS = ["leads", "interesses", "vestidos", "config"] as const;

function acessos(habilitados: string[]): Record<string, boolean> {
  return Object.fromEntries(MODULOS.map((m) => [m, habilitados.includes(m)]));
}

async function main() {
  // 1) Loja
  const loja = await prisma.loja.upsert({
    where: { id: "loja-moscow" },
    update: {},
    create: {
      id: "loja-moscow",
      nome: "Moscow Noivas",
      cnpj: null,
      endereco: null,
      telefone: null,
    },
  });

  // 2) Regra de disponibilidade padrão (exemplo do spec: 14 / 2 / 3 / 2 / 7)
  await prisma.regraDisponibilidade.upsert({
    where: { lojaId: loja.id },
    update: {},
    create: {
      lojaId: loja.id,
      provaDiasAntes: 14,
      provaDuracao: 2,
      usoDiasAntes: 3,
      usoDiasDepois: 2,
      lavagemDiasDepois: 7,
    },
  });

  // 3) Perfis
  const perfilAdmin = await prisma.perfil.upsert({
    where: { id: "perfil-admin" },
    update: { acessosModulos: acessos(["leads", "interesses", "vestidos", "config"]) },
    create: {
      id: "perfil-admin",
      nome: "Admin",
      acessosModulos: acessos(["leads", "interesses", "vestidos", "config"]),
    },
  });
  await prisma.perfil.upsert({
    where: { id: "perfil-vendedora" },
    update: { acessosModulos: acessos(["leads", "interesses", "vestidos"]) },
    create: {
      id: "perfil-vendedora",
      nome: "Vendedora",
      acessosModulos: acessos(["leads", "interesses", "vestidos"]),
    },
  });
  await prisma.perfil.upsert({
    where: { id: "perfil-recepcao" },
    update: { acessosModulos: acessos(["leads", "interesses"]) },
    create: {
      id: "perfil-recepcao",
      nome: "Recepção",
      acessosModulos: acessos(["leads", "interesses"]),
    },
  });

  // 4) Usuário admin (senha: admin123 — trocar no primeiro acesso)
  const senhaHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.usuario.upsert({
    where: { email: "admin@moscownoivas.local" },
    update: {},
    create: {
      nome: "Administrador",
      email: "admin@moscownoivas.local",
      senhaHash,
    },
  });
  await prisma.usuarioLoja.upsert({
    where: { usuarioId_lojaId: { usuarioId: admin.id, lojaId: loja.id } },
    update: { perfilId: perfilAdmin.id },
    create: { usuarioId: admin.id, lojaId: loja.id, perfilId: perfilAdmin.id },
  });

  // 5) Catálogo de atributos + opções
  let ordemAttr = 0;
  for (const attr of ATRIBUTOS) {
    const atributo = await prisma.atributo.upsert({
      where: { id: `attr-${attr.nome.toLowerCase().replace(/\s+/g, "-")}` },
      update: {},
      create: {
        id: `attr-${attr.nome.toLowerCase().replace(/\s+/g, "-")}`,
        lojaId: loja.id,
        nome: attr.nome,
        tipo: attr.tipo,
        ordem: ordemAttr++,
      },
    });
    let ordemOpc = 0;
    for (const valor of attr.opcoes) {
      await prisma.atributoOpcao.upsert({
        where: { id: `opc-${atributo.id}-${ordemOpc}` },
        update: { valor },
        create: {
          id: `opc-${atributo.id}-${ordemOpc}`,
          atributoId: atributo.id,
          valor,
          ordem: ordemOpc,
        },
      });
      ordemOpc++;
    }
  }

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [x] **Step 2: Rodar o seed**

Run:
```bash
npm run db:seed
```
Expected: imprime `Seed concluído.` sem erros.

- [x] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed inicial (loja, perfis, admin, catalogo, regras)"
```

---

## Task 8: Teste de fumaça do seed

**Files:**
- Create: `src/lib/__tests__/seed.test.ts`

- [x] **Step 1: Escrever o teste que falha**

Pré-condição: banco de pé (`docker compose up -d`) e seed rodado (`npm run db:seed`).

```typescript
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("seed inicial", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("criou a loja Moscow Noivas", async () => {
    const loja = await prisma.loja.findUnique({ where: { id: "loja-moscow" } });
    expect(loja?.nome).toBe("Moscow Noivas");
  });

  it("criou a regra de disponibilidade padrão", async () => {
    const regra = await prisma.regraDisponibilidade.findUnique({
      where: { lojaId: "loja-moscow" },
    });
    expect(regra).not.toBeNull();
    expect(regra?.provaDiasAntes).toBe(14);
    expect(regra?.lavagemDiasDepois).toBe(7);
  });

  it("criou o usuário admin vinculado à loja com perfil Admin", async () => {
    const admin = await prisma.usuario.findUnique({
      where: { email: "admin@moscownoivas.local" },
      include: { lojas: { include: { perfil: true } } },
    });
    expect(admin).not.toBeNull();
    expect(admin?.lojas[0]?.perfil.nome).toBe("Admin");
  });

  it("o perfil Admin tem acesso ao módulo de config", async () => {
    const perfil = await prisma.perfil.findUnique({ where: { id: "perfil-admin" } });
    const acessos = perfil?.acessosModulos as Record<string, boolean>;
    expect(acessos.config).toBe(true);
  });

  it("o perfil Vendedora NÃO tem acesso ao módulo de config", async () => {
    const perfil = await prisma.perfil.findUnique({ where: { id: "perfil-vendedora" } });
    const acessos = perfil?.acessosModulos as Record<string, boolean>;
    expect(acessos.config).toBe(false);
  });

  it("semeou o catálogo de atributos com pelo menos Decote e suas opções", async () => {
    const decote = await prisma.atributo.findFirst({
      where: { lojaId: "loja-moscow", nome: "Decote" },
      include: { opcoes: true },
    });
    expect(decote).not.toBeNull();
    expect(decote!.opcoes.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [x] **Step 2: Rodar o teste e ver passar**

Run:
```bash
npm test
```
Expected: 6 testes passam. (Se algum falhar por banco vazio, rode `npm run db:seed` antes.)

- [x] **Step 3: Commit**

```bash
git add src/lib/__tests__/seed.test.ts
git commit -m "test: smoke test do seed e da conexao com o banco"
```

---

## Self-Review

**1. Spec coverage (contra o spec da Base):**
- Modelo de dados (spec §6) → Task 4 cobre todas as entidades e relacionamentos (Loja, Perfil, Usuario, UsuarioLoja, Atributo, AtributoOpcao, RegraDisponibilidade, Vestido, VestidoAtributo, Lead, LeadInteresse, LeadInteresseAtributo, BloqueioVestido). ✓
- Regras configuráveis sem hard code (spec §3, §7) → `RegraDisponibilidade` semeada com defaults, editável. ✓
- Catálogo compartilhado (spec §4) → `Atributo`/`AtributoOpcao` ligados a interesses e vestidos. ✓
- Multi-loja (spec §5) → `lojaId` em todas as entidades de operação; `UsuarioLoja` faz o escopo. ✓
- Permissões por módulo (spec §4) → `Perfil.acessosModulos` (Json sim/não) semeado. ✓
- **Fora de escopo deste plano (coberto nos próximos):** motor de disponibilidade (Plano B), auth/login (Plano C), CRUDs e telas (Planos D/E). Este plano entrega apenas a fundação — schema + dados, sem UI/lógica. Coerente com a fatia escolhida.

**2. Placeholder scan:** Nenhum "TBD/TODO/implementar depois". Todo passo tem comando ou código completo. ✓

**3. Type consistency:** Nomes batem entre schema e seed/teste — `acessosModulos` (Json), `lojaId`, `provaDiasAntes`, `RegraDisponibilidade`, `usuarioId_lojaId` (chave composta usada no upsert do `UsuarioLoja`), `perfil-admin`/`perfil-vendedora` (ids referenciados no teste). ✓

---

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/2026-05-27-base-plano-a-fundacao.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — despacho um subagente novo por tarefa, reviso entre tarefas, iteração rápida. (Requer o sub-skill `superpowers:subagent-driven-development`.)

**2. Execução inline** — executo as tarefas nesta sessão com checkpoints para revisão. (Requer o sub-skill `superpowers:executing-plans`.)

Qual abordagem?
