// MockLlmProvider — Phase 18.2.
//
// Générateur déterministe *sans LLM*. Sert à :
//   * développer et tester sans coût (marché algérien) ;
//   * faire la démonstration du workflow complet (génération → draft →
//     review → approved → published) avant de brancher un vrai modèle.
//
// Heuristique documentée :
//   1. Découper la source en "phrases" (ponctuation de fin ou saut de
//      ligne), en gardant les segments de ≥ 30 caractères.
//   2. Si la phrase contient « est » / « sont » / « is » → la question
//      devient « Qu'est-ce que <sujet> ? » (localisé fr/ar/en).
//   3. Sinon → question de reformulation sur le début de phrase.
//   4. back = phrase entière ; explanation = phrase + mention source.
//   5. tags = ['ia', lang] + jusqu'à 2 mots-clés longs extraits.
//
// Déterminisme : même entrée ⇒ même sortie, bit à bit (tests).
import {
  GeneratedCardDraft,
  LlmChatResult,
  LlmGenerateCardsResult,
  LlmLang,
  LlmProvider,
  ChatMessage,
} from './llm.types';

/// Longueur minimale d'une phrase candidate (bruit éliminé).
export const MOCK_MIN_SENTENCE_LEN = 30;
/// Taille max du sujet extrait (en mots) pour la question « Qu'est-ce que X ? ».
export const MOCK_MAX_SUBJECT_WORDS = 8;

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MOCK_MIN_SENTENCE_LEN);
}

/// Mots-clés : les plus longs mots "significatifs" d'une phrase.
export function extractKeywords(sentence: string, max = 2): string[] {
  const words = sentence
    .replace(/[«»"'’()[\],;.:!?]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 8)
    .map((w) => w.toLowerCase());
  const unique: string[] = [];
  for (const w of words) {
    if (!unique.includes(w)) unique.push(w);
    if (unique.length >= max) break;
  }
  return unique;
}

const QUESTION_PREFIX: Record<LlmLang, (subject: string) => string> = {
  fr: (s) => `Qu'est-ce que ${s} ?`,
  en: (s) => `What is ${s}?`,
  ar: (s) => `ما هو ${s}؟`,
};

const REFORMULATE_PREFIX: Record<LlmLang, (excerpt: string) => string> = {
  fr: (s) => `Reformulez avec vos mots : « ${s}… »`,
  en: (s) => `Rephrase in your own words: "${s}…"`,
  ar: (s) => `أعِد الصياغة بكلماتك: «${s}…»`,
};

/// Transforme une phrase en (front, back) — règles pures, testables.
export function sentenceToCard(
  sentence: string,
  lang: LlmLang,
): { front: string; back: string } {
  const defMatch = sentence.match(/^(.+?)\s+(?:est|sont|is|means)\s+(.+)$/i);
  if (defMatch) {
    const subject = defMatch[1]!.split(/\s+/).slice(0, MOCK_MAX_SUBJECT_WORDS).join(' ');
    if (subject.length >= 3) {
      return { front: QUESTION_PREFIX[lang](subject), back: sentence };
    }
  }
  const excerpt = sentence.split(/\s+/).slice(0, 8).join(' ');
  return { front: REFORMULATE_PREFIX[lang](excerpt), back: sentence };
}

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'mock-fsm-1';

  async generateCards(args: {
    sourceText: string;
    count: number;
    lang: LlmLang;
    title?: string;
  }): Promise<LlmGenerateCardsResult> {
    const sentences = splitSentences(args.sourceText);
    const cards: GeneratedCardDraft[] = [];

    for (const sentence of sentences.slice(0, args.count)) {
      const { front, back } = sentenceToCard(sentence, args.lang);
      cards.push({
        front,
        back,
        explanation: `${sentence} — (extrait de la source fournie${
          args.title ? ` « ${args.title} »` : ''
        })`,
        tags: ['ia', args.lang, ...extractKeywords(sentence)],
      });
    }

    // Source trop courte pour découper : une carte de synthèse brute,
    // explicitement marquée pour révision humaine renforcée.
    if (cards.length === 0 && args.sourceText.trim().length > 0) {
      const excerpt = args.sourceText.trim().slice(0, 200);
      cards.push({
        front: REFORMULATE_PREFIX[args.lang](excerpt.slice(0, 60)),
        back: excerpt,
        explanation:
          'Source trop courte pour un découpage automatique — à retravailler manuellement.',
        tags: ['ia', args.lang, 'a-revoir'],
      });
    }

    return {
      cards,
      model: this.model,
      usage: {
        tokensIn: Math.ceil(args.sourceText.length / 4),
        tokensOut: Math.ceil(
          cards.reduce((acc, c) => acc + c.front.length + c.back.length, 0) / 4,
        ),
      },
    };
  }

  /// Chat déterministe — Phase 18.6. Réponse pédagogique simulée qui
  /// cite le début de la question pour rendre les tests stables.
  async chat(args: { messages: ChatMessage[] }): Promise<LlmChatResult> {
    const lastUser = [...args.messages].reverse().find((m) => m.role === 'user');
    const excerpt = (lastUser?.content ?? '').split(/\s+/).slice(0, 8).join(' ');
    const text =
      `Réponse pédagogique simulée (mock) à propos de « ${excerpt} » : ` +
      `révisez la fiche de cours correspondante, puis testez-vous avec ` +
      `3 cartes d'ancrage sur cette notion.`;
    return {
      text,
      model: this.model,
      usage: {
        tokensIn: Math.ceil(
          args.messages.reduce((acc, m) => acc + m.content.length, 0) / 4,
        ),
        tokensOut: Math.ceil(text.length / 4),
      },
    };
  }
}
