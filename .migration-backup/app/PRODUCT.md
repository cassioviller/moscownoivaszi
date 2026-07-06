# Product

## Register

product

## Users

Funcionárias da loja Moscow Noivas: vendedoras (operação principal — leads, vestidos, agenda), recepção (cadastro inicial), administração (configuração, perfis, usuários). Usam o sistema em desktop dentro da loja na maior parte do tempo; tablet e celular como apoio (consulta rápida no salão, atendimento em pé com a noiva). São profissionais de varejo de moda, não engenheiras — esperam que a ferramenta resolva, não ensine.

Contexto operacional: ambiente físico de loja, possivelmente com música de fundo e clientes presentes; a funcionária precisa cumprir tarefas pontuais entre conversas com noivas. Atenção é recurso escasso.

## Product Purpose

Sistema interno de gestão pra loja de vestidos de noiva. Cobre, na Base (sub-projeto 1): leads (ficha viva da noiva), interesses (catálogo de atributos + escalas), vestidos (cadastro + características via catálogo), motor de disponibilidade (projeção de janelas prova/uso/lavagem + manutenção), configuração (lojas, perfis, usuários, regras, catálogo). Multi-loja, com escopo de acesso por loja.

Sucesso = a funcionária faz a tarefa sem precisar pensar na ferramenta. Cada operação é a evidência de que o sistema vale a pena; nenhuma é "demo da ferramenta".

## Brand Personality

**Discreta, profissional, ágil.** A ferramenta sai do caminho do trabalho.

Voz: direta, em pt-BR, sem floreios, sem jargão técnico, sem infantilismo. Microcopy ajuda; nunca explica o óbvio. Errar é informação, não punição.

Peso visual está na tipografia, não em cores ou decoração. Confiança vem da consistência: mesma régua de espaçamento, mesma escala tipográfica, mesma decisão repetida em todos os contextos. A interface envelhece bem porque não depende de tendência.

Referências positivas (e o que pegar de cada uma):
- **Stripe Dashboard** — confiança tipográfica; tabelas elegantes; densidade média confortável; cor usada com parcimônia.
- **Things 3, Cron, Arc** — calma; intencionalidade; detalhes minuciosos (motion, espaçamento, microcopy) que mostram cuidado sem ostentar.
- **Notion, Linear Insights** — sensação de documento; espaço gracioso; baixo stress visual; cinza neutro que serve como tela em vez de ruído.

## Anti-references

- **ERPs jurássicos (SAP, TOTVS, sistemas de varejo antigos).** Tabelas sem respiro, dropdowns aninhados, cinza-cadáver, formulários de 40 campos numa tela só, modais que abrem modais. Densidade hostil. **Não.**
- **Sistemas "femininos" clichê.** Rosa-bebê, scripts cursivos, flores, rendas, ilustrações fofas, paletas pastel. Vestido de noiva não é scrapbook digital. Loja é varejo profissional, não convite de chá-de-bebê. **Não.**
- **SaaS genérico ("lavanda + cards iguais + gradientes pastel").** Look-ahead de startup sem domínio: carrosséis de feature cards idênticos, gradientes decorativos, ilustrações isométricas, lavanda/teal em tudo. **Não.**
- **Glassmorphism, efeitos chamativos, dark "hacker".** Blur decorativo, glow, neon, terminal-mode, dashboard de ficção científica. Pede atenção que a ferramenta não devolve. **Não.**

## Design Principles

1. **A ferramenta sai do caminho.** Cada elemento na tela justifica a atenção que pede; em dúvida, remova. "Discreto" é elogio, não falha de criatividade. Nada decorativo.
2. **Tipografia carrega o peso.** Hierarquia vem de escala + peso + cor neutra — não de fundos coloridos, ícones decorativos, caixas, gradientes. Texto bem composto resolve a maior parte do design de produto.
3. **Densidade média, ritmo consistente.** Entre Linear (denso) e Notion (espaçado). Espaço respira, sem desperdiçar tela de quem trabalha 8h por dia. Uma régua única de spacing/scale em toda a interface; nunca dois ritmos.
4. **Cor é informação, nunca decoração.** Neutros levemente tintados (chroma ≤0.01); um único acento usado pra estado/ação que importa (CTA primário, foco, status crítico). Sem gradientes decorativos, sem áreas grandes de cor "porque fica bonito".
5. **Detalhe minucioso onde o uso encosta.** Focus rings, estados de erro, transições de submit, microcopy de placeholder, motion sutil — é onde o produto sente "cuidado". Não em hero sections (que nem existem).

## Accessibility & Inclusion

- **WCAG AA** como base. Contraste de texto ≥4.5:1 (texto grande ≥3:1).
- **Foco sempre visível** e estilizado (não o anel default do browser); nunca `outline: none` sem substituto.
- **Teclado-friendly:** toda ação primária acionável sem mouse. Tab order natural. `autoFocus` no primeiro campo útil de cada formulário.
- **Form labels semânticos** (nunca placeholder-as-label). `role="alert"` em mensagens de erro críticas. `autoComplete` correto (`email`, `current-password`, `name`, etc.).
- **Touch targets ≥44px** em superfícies tocáveis (tablet/mobile da loja).
- **`prefers-reduced-motion`** respeitado: motion não-essencial desliga.
- **`prefers-color-scheme`**: por enquanto o produto é light-only (alinha com o registro discreto/calmo). Se aparecer pedido real, vira input pro design.
- Sem requisitos específicos de leitor de tela conhecidos hoje. A estrutura HTML semântica + ARIA mínimo cobre o caso geral; se aparecer um caso real, vira input.
