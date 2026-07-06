# Moscow Noivas — Sub-projeto 1 (Base) — Design

**Data:** 2026-05-27
**Status:** Aprovado para implementação
**Stack:** Next.js + PostgreSQL + Prisma (monólito full-stack TypeScript)

---

## 1. Contexto e decomposição

A Moscow Noivas precisa de um sistema para controlar a jornada completa da noiva,
da entrada na loja até a devolução do vestido. A primeira entrega foi decomposta em
4 sub-projetos independentes, cada um com seu próprio ciclo spec → plano → implementação:

1. **Base** *(este documento)* — Lead, Cadastro, Interesses, Vestidos, Regra de disponibilidade
2. **Atendimento & Comercial** — Agendamento, Tela de atendimento, Recomendação, Orçamentos
3. **Contrato & Financeiro** — Contrato PDF, Promissória, Contas a receber, Comissão
4. **Operacional** — Provas, Retirada, Devolução, Fluxo de caixa

Cada sub-projeto entra em produção e é validado antes do próximo começar.

## 2. Escopo do Sub-projeto 1

### Entra nesta entrega
- **Configuração:** Lojas, Perfis de acesso, Usuários, Catálogo de Atributos, Regras de Disponibilidade
- **Operação:** Lead (cadastro + jornada), Interesses da noiva, Vestidos, Motor de Disponibilidade

### NÃO entra (sub-projetos 2-4)
Agendamento de atendimento, recomendação ranqueada, orçamento, contrato, promissória,
financeiro, comissão, provas, retirada, devolução, fluxo de caixa.

### Fora da primeira entrega inteira
Integração real com WhatsApp, IA em produção, portal público da noiva, site público,
assinatura digital real, gateway de pagamento, e-commerce, marketing, BI avançado, app mobile.

## 3. Princípios de arquitetura

Aplicados a partir das diretrizes de engenharia agêntica (Karpathy):

1. **Regras de negócio como configuração testável** — cálculos críticos são funções
   puras cobertas por testes automatizados.
2. **O spec é o programa** — este documento é a fonte de verdade; versionado no repositório.
3. **YAGNI rigoroso** — sem WhatsApp/IA/portal no MVP.
4. **Fatias verticais verificáveis** — cada funcionalidade entrega algo completo e testado.
5. **Camada de regras isolada (sem hard code)** — nenhum número mágico no código.
6. **Humano no controle dos pontos de dinheiro** — gates de aprovação (sub-projetos 3-4).

## 4. Decisões de design (registradas no brainstorming)

| Tema | Decisão |
|---|---|
| **Disponibilidade** | 3 janelas separadas (prova/uso/lavagem). "Ajuste" faz parte da prova. Ancoradas em datas reais quando existem; projeção provisória a partir da data do casamento até existirem datas reais. |
| **Atributos** | Catálogo único compartilhado (CRUD) entre interesses e vestidos. |
| **Status do lead** | Etapas fixas da jornada; avanço automático ao concluir o formulário de cada etapa. |
| **Ambiente** | Multi-loja, multiusuário, web no navegador, com escopo de acesso por loja. |
| **Permissões** | Perfis configuráveis (CRUD); acesso por módulo (sim/não). Permissão de "aprovar" entra com os módulos de dinheiro nos sub-projetos 3-4. |

## 5. Módulos e fronteiras

```
[Configuração]                      [Operação]
 ├── Lojas                           ├── Lead (ficha viva)
 ├── Perfis de acesso                ├── Interesses (usa catálogo)
 ├── Usuários (loja + perfil)        ├── Vestidos (usa catálogo)
 ├── Catálogo de Atributos           └── Motor de Disponibilidade
 └── Regras de Disponibilidade            (funções puras, sem tela/banco)
```

- **Configuração** alimenta tudo que não pode ser hard code.
- **Motor de Disponibilidade** é camada isolada: recebe `(data do casamento, datas reais
  se houver, regras da loja, bloqueios existentes)` e devolve as janelas bloqueadas /
  o veredito de disponibilidade. Não conhece tela nem banco — 100% testável.
- **Lead** é a ficha viva; Interesses e características de Vestidos usam o mesmo catálogo.
- **Multi-loja:** toda entidade de operação carrega `loja_id`; usuário só enxerga as lojas
  a que tem acesso.

## 6. Modelo de dados

### Configuração

```
Loja
 └─ id, nome, cnpj, endereco, telefone, ativo

Perfil (global, reutilizável entre lojas)
 └─ id, nome, acessos_modulos  → {leads:bool, vestidos:bool, interesses:bool, config:bool, ...}

Usuario
 └─ id, nome, email, senha_hash, ativo

UsuarioLoja (liga usuário ↔ loja com um perfil)
 └─ usuario_id, loja_id, perfil_id

Atributo (catálogo compartilhado)
 └─ id, nome ("Decote"), tipo (opcao_unica | escala), ordem, ativo

AtributoOpcao
 └─ id, atributo_id, valor ("Tomara que caia"), ordem, ativo

RegraDisponibilidade (por loja — sem hard code)
 └─ id, loja_id,
    prova_dias_antes, prova_duracao,
    uso_dias_antes, uso_dias_depois,
    lavagem_dias_depois
```

### Operação

```
Vestido
 └─ id, loja_id, codigo, nome, preco_base, tamanho, cor, categoria, status, observacoes

VestidoAtributo (características do vestido, vindas do catálogo)
 └─ vestido_id, atributo_id, opcao_id

Lead (ficha viva)
 └─ id, loja_id, etapa,
    noiva_nome, noivo_nome, cerimonialista, whatsapp,
    casamento_data, casamento_horario, casamento_local, origem (loja | whatsapp)

LeadInteresse
 └─ id, lead_id, volume_saia, brilho, cauda, fenda,
    algo_a_mais (texto), nao_quer_usar (texto), teto_orcamento

LeadInteresseAtributo (preferências da noiva, vindas do catálogo)
 └─ lead_interesse_id, atributo_id, opcao_id

BloqueioVestido (fonte lida pelo Motor de Disponibilidade)
 └─ id, loja_id, vestido_id, lead_id (opcional),
    tipo (reserva_casamento | manutencao),
    casamento_data (se reserva),
    prova_data_real, retirada_data_real, devolucao_data_real (opcionais),
    observacao
```

### Relacionamentos

```
Loja 1──N Vestido            Vestido N──N Atributo (via VestidoAtributo)
Loja 1──N Lead               Lead   1──1 LeadInteresse
Loja 1──N RegraDisponibil.   LeadInteresse N──N Atributo (via LeadInteresseAtributo)
Loja N──N Usuario (via UsuarioLoja + Perfil)
Vestido 1──N BloqueioVestido     Lead 1──N BloqueioVestido
```

### Ponte para o futuro: `BloqueioVestido`

A entidade `BloqueioVestido` tem dois tipos de origem:
- **`reserva_casamento`** — futuramente gerado automaticamente pelo contrato (sub-projeto 3).
- **`manutencao`** — criado manualmente já no sub-projeto 1 (vestido no conserto etc.).

Assim o motor nasce funcional e testável agora (com bloqueios manuais), e o contrato apenas
"pluga" reservas nele depois — sem refazer nada.

## 7. Regras configuráveis e Motor de Disponibilidade

### 7.1 Regras (por loja)

| Campo | Exemplo | Significado |
|---|---|---|
| `prova_dias_antes` | 14 | dias antes do casamento em que começa a janela de prova |
| `prova_duracao` | 2 | duração da janela de prova (dias) |
| `uso_dias_antes` | 3 | início do uso (retirada) antes do casamento |
| `uso_dias_depois` | 2 | fim do uso após o casamento |
| `lavagem_dias_depois` | 7 | dias de lavagem após o uso |

Valores são padrões iniciais (semeados); a loja ajusta na tela de regras. Nenhum vive no código.

### 7.2 Ancoragem das janelas

```
PROVA    → prova_data_real     (se houver) | senão casamento − prova_dias_antes
USO      → retirada_data_real  (se houver) | senão casamento − uso_dias_antes
           ... até casamento + uso_dias_depois
LAVAGEM  → devolucao_data_real (se houver) | senão fim do uso
           ... + lavagem_dias_depois
```

### 7.3 Funções centrais (conceitual)

```
calcularJanelas(bloqueio, regras)
    → [ {tipo:'prova', inicio, fim}, {tipo:'uso',...}, {tipo:'lavagem',...} ]

vestidoDisponivel(vestido, dataCasamentoCandidata, regras, bloqueiosExistentes)
    → { disponivel: bool, conflitos: [...] }
```

Regra de decisão: o vestido está **livre** para uma data candidata se as janelas projetadas
dessa data não se sobrepõem a nenhuma janela dos bloqueios existentes do mesmo vestido.

## 8. Telas

### Acesso
- Login (e-mail + senha)
- Seleção de loja (quando o usuário tem acesso a mais de uma)

### Configuração (só perfis com acesso)
- Lojas — lista + form
- Perfis — lista + form com módulos marcáveis (sim/não)
- Usuários — lista + form; vincula usuário → loja(s) + perfil
- Catálogo de Atributos — lista de atributos; dentro de cada um, CRUD das opções
- Regras de Disponibilidade — form por loja

### Operação
- Lista de Leads — filtros (etapa, data de casamento, busca)
- Cadastro de Lead — ao preencher a data do casamento, lista vestidos indisponíveis
- Formulário de Interesses — catálogo + escalas + textos + teto; avança a etapa automaticamente
- Ficha do Lead — visão acumulativa (dados + interesses; cresce nos próximos sub-projetos)
- Lista de Vestidos — filtros (categoria, status, tamanho, cor); busca por código/nome
- Cadastro de Vestido — dados + características via catálogo
- Disponibilidade do Vestido — agenda mostrando janelas bloqueadas e o motivo
- Bloqueios manuais — registrar/remover bloqueio de manutenção

### Visual
Construção das telas usa os skills instalados (ui-ux-pro-max para design system,
taste/soft para acabamento, impeccable para auditoria). Detalhe de implementação.

## 9. Critérios de aceite

**Configuração & acesso**
- [ ] Admin cria loja, perfil e usuário; usuário só vê dados das lojas a que tem acesso
- [ ] Perfil sem acesso a um módulo não vê o módulo no menu nem acessa pela URL
- [ ] Atributo do catálogo aparece no form de interesses e no cadastro de vestido
- [ ] Editar/remover opção do catálogo reflete nos dois lugares

**Lead & interesses**
- [ ] Cadastro de lead por origem "loja" ou "WhatsApp" (manual)
- [ ] Ao informar a data do casamento, o sistema lista os vestidos indisponíveis
- [ ] Preencher o formulário de interesses avança a etapa do lead automaticamente
- [ ] Ficha do lead mostra dados + interesses acumulados

**Vestidos & disponibilidade**
- [ ] Cadastro de vestido com características do catálogo
- [ ] Vestido com bloqueio sobreposto à data candidata aparece indisponível
- [ ] Vestido com janelas distantes aparece disponível
- [ ] Bloqueio manual (manutenção) deixa o vestido indisponível na janela
- [ ] Agenda do vestido mostra janelas e motivo

## 10. Estratégia de testes

| Camada | O que testa | Como |
|---|---|---|
| Motor de Disponibilidade | janelas, sobreposições, viradas de mês/ano, datas reais x projeção | testes unitários de funções puras — cobertura alta obrigatória |
| Permissões | acesso por módulo respeitado | testes de integração nas rotas |
| CRUDs | criar/editar/remover + escopo de loja | testes de integração |
| Fluxo do lead | avanço automático de etapa | teste de integração do caminho feliz |

Cenários mínimos do motor: casamentos sobrepostos (bloqueia), distantes (libera),
bloqueio de manutenção (bloqueia), data real que move a janela (recalcula),
viradas de mês/ano nas contas de dias.

## 11. Riscos

1. **Escopo de loja é segurança.** Toda query filtra por `loja_id`; usar filtro centralizado,
   não repetido à mão por consulta, para não vazar dados entre lojas.
2. **Semear dados iniciais.** Catálogo de atributos/opções e regras precisam de carga inicial;
   levantar as opções reais (tipos de decote, costas etc.) com a loja.
3. **Valores reais das regras.** Os dias de prova/uso/lavagem precisam dos números reais da
   loja para os padrões iniciais; configuráveis, então não bloqueiam o início.

## 12. Perguntas resolvidas e deferidas

**Resolvidas para a Base:** status do lead, separação das janelas, comportamento no tempo,
catálogo compartilhado, permissões, ajuste dentro da prova.

**Deferidas:** status/cabines de atendimento, vendedora simultânea (sub-projeto 2);
orçamento múltiplo, aprovação de desconto (sub-projeto 2/3); promissória 5x, comissão,
contrato físico×digital, caução, aprovação de entrada menor (sub-projeto 3);
multa por atraso na devolução (sub-projeto 4).
