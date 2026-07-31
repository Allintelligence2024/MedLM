// CardFormatter — Phase 18.3 (voice-to-card).
//
// Formate une transcription de dictée vocale en (front, back) de carte,
// par règles pures (pas de LLM — coût zéro, déterminisme total).
//
// Règles, par ordre :
//   1. La dictée contient un '?' → front = jusqu'au dernier '?',
//      back = le reste (ou placeholder si vide — la carte part de toute
//      façon en révision auteur).
//   2. Motif définitionnel « X c'est/est/sont/is Y » → question
//      « Qu'est-ce que X ? » localisée.
//   3. Fallback → front « À propos de : « <5 mots>… » », back = dictée.
import { LlmLang } from '../llm/llm.types';
import { extractKeywords } from '../llm/llm-mock.provider';

export interface FormattedCard {
  front: string;
  back: string;
  explanation: string;
  tags: string[];
  /// Quelle règle a produit la carte (audit + debug).
  rule: 'question_split' | 'definition' | 'fallback';
}

const PLACEHOLDER_BACK: Record<LlmLang, string> = {
  fr: 'À compléter par l’auteur (dictée vocale).',
  ar: 'يُستكمَل من طرف المؤلف (إملاء صوتي).',
  en: 'To be completed by the author (voice dictation).',
};

const ABOUT_PREFIX: Record<LlmLang, (excerpt: string) => string> = {
  fr: (s) => `À propos de : « ${s}… »`,
  ar: (s) => `حول: «${s}…»`,
  en: (s) => `About: "${s}…"`,
};

const DEFINITION_QUESTION: Record<LlmLang, (subject: string) => string> = {
  fr: (s) => `Qu'est-ce que ${s} ?`,
  ar: (s) => `ما هو ${s}؟`,
  en: (s) => `What is ${s}?`,
};

export function formatTranscriptToCard(
  transcript: string,
  lang: LlmLang,
): FormattedCard {
  const text = transcript.replace(/\s+/g, ' ').trim();
  const tags = ['voix', lang, ...extractKeywords(text, 3)];
  let front: string;
  let back: string;
  let rule: FormattedCard['rule'];

  const qIdx = text.lastIndexOf('?');
  if (qIdx > 0) {
    // Règle 1 — l'étudiant dicte « question ? réponse ».
    front = text.slice(0, qIdx + 1).trim();
    back = text.slice(qIdx + 1).trim() || PLACEHOLDER_BACK[lang];
    rule = 'question_split';
  } else {
    const def = text.match(/^(.+?)\s+(?:c'est|est|sont|is|means)\s+(.+)$/i);
    if (def && def[1]!.length >= 3) {
      // Règle 2 — définition parlée.
      const subject = def[1]!.split(/\s+/).slice(0, 8).join(' ');
      front = DEFINITION_QUESTION[lang](subject);
      back = text;
      rule = 'definition';
    } else {
      // Règle 3 — prise de note brute.
      const excerpt = text.split(/\s+/).slice(0, 5).join(' ');
      front = ABOUT_PREFIX[lang](excerpt);
      back = text;
      rule = 'fallback';
    }
  }

  return {
    front,
    back,
    explanation: text.slice(0, 1000),
    tags,
    rule,
  };
}
