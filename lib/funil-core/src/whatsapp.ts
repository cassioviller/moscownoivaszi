/**
 * S-O44 — **a régua dos dígitos do WhatsApp, num lugar só, para os DOIS lados.**
 *
 * A S-O43 fechou o formulário da loja: o campo ganhou máscara e o zod passou a
 * recusar o número que não vira link. A outra metade ficou aberta — a **porta
 * da API** e a **captação pública** continuavam aceitando qualquer coisa
 * (`captacao.ts` gravava `whatsapp?.trim() || null`), e o sintoma volta a ser
 * mudo: `linkWhatsApp` devolve `null` e todo botão de wa.me do sistema
 * desaparece sem uma palavra — a confirmação da prova, a fila "Falta procurar",
 * a cobrança, o rodapé do portal.
 *
 * A régua morava só no frontend (`moscow-noivas/src/lib/whatsapp.ts`), e o
 * servidor não tinha como consultá-la. Ela mudou de casa para cá — o
 * `funil-core` já é consumido pelos dois lados e é onde mora a régua da ficha
 * da noiva. **Uma cópia, dois consumidores**, que é o que a regra 26 pede: sem
 * isso, a conferência do servidor e a da tela divergiriam no primeiro ajuste.
 *
 * Puro de propósito: sem IO, sem banco.
 */

/**
 * Deep-link `wa.me`. Prefixa o DDI 55 só se o número for nacional (10–11
 * dígitos) e o mantém quando já vem com DDI (12–13 começando em 55); qualquer
 * outro tamanho é implausível e vira `null` em vez de um link quebrado.
 */
export function linkWhatsApp(whatsapp: string | null | undefined, mensagem: string): string | null {
  if (!whatsapp) return null;
  let digitos = whatsapp.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) {
    digitos = `55${digitos}`;
  } else if (!(digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith("55"))) {
    return null;
  }
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * O número é ÚTIL, ou não é.
 *
 * A conferência **deriva do link**, e é isso que impede as duas de divergirem:
 * não há uma segunda cópia da regra dos dígitos para alguém esquecer de mexer.
 * Vazio é válido — WhatsApp é opcional, e a noiva que só deixou o telefone fixo
 * continua entrando.
 */
export function whatsappUtilizavel(valor: string | null | undefined): boolean {
  if (!valor || !valor.trim()) return true;
  return linkWhatsApp(valor, "") !== null;
}

/**
 * A frase que a loja lê quando o número não abre o WhatsApp.
 *
 * Ela diz a CONSEQUÊNCIA, não a regra: quem lê não quer saber quantos dígitos
 * faltam, quer saber que os botões de WhatsApp dela não vão aparecer.
 */
export const WHATSAPP_INUTILIZAVEL =
  "Confira o número: com DDD, 10 ou 11 dígitos. Sem isso, os botões de WhatsApp dela não " +
  "aparecem em lugar nenhum do sistema.";

/**
 * O selo da ficha, para o número que entrou torto pela CAPTAÇÃO.
 *
 * Na porta da loja recusar protege — quem digita está com a noiva na frente e
 * corrige na hora. Na captação pública recusar **custa o lead**: a noiva
 * preenche o formulário do site, erra um dígito e a loja perde o contato
 * inteiro em vez de perder um botão. Ali o certo é aceitar, gravar, e marcar a
 * ficha para a vendedora corrigir no primeiro contato.
 */
export const WHATSAPP_NAO_ABRE_SELO = "Este número não abre o WhatsApp";
