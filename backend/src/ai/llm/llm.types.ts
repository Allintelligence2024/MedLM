// Types LLM provider-agnostic — Phase 18.2 / 18.6.
//
// Décision produit : PAS de dépendance figée à un fournisseur. Le marché
// algérien impose de pouvoir basculer entre :
//   * 'mock'  — générateur déterministe local (zéro coût, tests, dev),
//   * 'http'  — toute API OpenAI-compatible (Mistral, OpenAI, vLLM/Ollama
//               auto-hébergé avec Llama 3) derrière une URL + clé.
//
// Le contrat est volontairement minimal : 2 méthodes. Toute extension
// (streaming, tools) passera par des options ajoutées ici.

export type LlmLang = 'fr' | 'ar' | 'en';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GeneratedCardDraft {
  front: string;
  back: string;
  explanation: string;
  tags: string[];
}

export interface LlmUsage {
  tokensIn: number;
  tokensOut: number;
}

export interface LlmGenerateCardsResult {
  cards: GeneratedCardDraft[];
  model: string;
  usage: LlmUsage;
}

export interface LlmChatResult {
  text: string;
  model: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  /// Identifiant lisible (audit) : 'mock', 'http', …
  readonly name: string;
  /// Identifiant du modèle (audit) : 'mock-fsm-1', 'mistral-small-latest', …
  readonly model: string;

  /// Propose `count` cartes à partir d'un texte source (PDF/syllabus
  /// pré-extrait). La validation humaine reste obligatoire avant
  /// publication (workflow draft → review → approved → published).
  generateCards(args: {
    sourceText: string;
    count: number;
    lang: LlmLang;
    title?: string;
  }): Promise<LlmGenerateCardsResult>;

  /// Chat générique — utilisé par le tutorat vocal (Phase 18.6).
  chat(args: { messages: ChatMessage[] }): Promise<LlmChatResult>;
}

/// Token d'injection NestJS.
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
