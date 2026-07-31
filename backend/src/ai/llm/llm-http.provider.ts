// HttpLlmProvider — Phase 18.2.
//
// Client minimaliste pour toute API OpenAI-compatible (chat completions) :
// Mistral, OpenAI, ou un modèle open-source auto-hébergé (vLLM, Ollama,
// Llama 3) derrière le même contrat HTTP.
//
// Sécurité :
//   * la clé API vient EXCLUSIVEMENT de l'environnement (AI_LLM_API_KEY) ;
//   * timeout dur 20 s + 1 retry sur 5xx ;
//   * aucune donnée personnelle n'est envoyée : seuls le texte source
//     fourni par l'instructeur et l'historique de chat explicitement
//     transmis partent vers le provider ;
//   * chaque appel est audité (table ai_generation_jobs / ai_tutor_prompts).
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatMessage,
  GeneratedCardDraft,
  LlmChatResult,
  LlmGenerateCardsResult,
  LlmLang,
  LlmProvider,
  ChatMessage as Msg,
} from './llm.types';

const HTTP_TIMEOUT_MS = 20_000;

/// Parse défensif de la sortie JSON du LLM : accepte un tableau brut ou
/// un bloc ```json … ``` ; filtre les items invalides. Exportée pure
/// pour les tests.
export function parseJsonCards(raw: string): GeneratedCardDraft[] {
  const cleaned = raw
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : ((parsed as { cards?: unknown })?.cards ?? []);
  if (!Array.isArray(arr)) return [];
  const out: GeneratedCardDraft[] = [];
  for (const item of arr) {
    const c = item as Partial<GeneratedCardDraft>;
    if (typeof c?.front !== 'string' || c.front.trim().length < 3) continue;
    if (typeof c?.back !== 'string' || c.back.trim().length < 3) continue;
    out.push({
      front: c.front.trim(),
      back: c.back.trim(),
      explanation: typeof c.explanation === 'string' ? c.explanation.trim() : '',
      tags: Array.isArray(c.tags)
        ? c.tags.filter((t): t is string => typeof t === 'string').slice(0, 8)
        : [],
    });
  }
  return out;
}

export class HttpLlmProvider implements LlmProvider {
  readonly name = 'http';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    const baseUrl = config.get<string>('AI_LLM_BASE_URL')?.replace(/\/$/, '');
    const apiKey = config.get<string>('AI_LLM_API_KEY');
    if (!baseUrl || !apiKey) {
      throw new Error(
        'AI_LLM_PROVIDER=http nécessite AI_LLM_BASE_URL et AI_LLM_API_KEY',
      );
    }
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = config.get<string>('AI_LLM_MODEL') ?? 'mistral-small-latest';
  }

  async generateCards(args: {
    sourceText: string;
    count: number;
    lang: LlmLang;
    title?: string;
  }): Promise<LlmGenerateCardsResult> {
    const system =
      `Tu es un assistant pédagogique pour étudiants en médecine. ` +
      `Produis EXACTEMENT un tableau JSON de cartes Anki (front, back, ` +
      `explanation, tags). Langue : ${args.lang}. Aucun texte hors JSON.`;
    const user =
      `Source${args.title ? ` (« ${args.title} »)` : ''} :\n\n${args.sourceText}\n\n` +
      `Génère ${args.count} cartes.`;
    const res = await this._chatCompletion([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    return {
      cards: parseJsonCards(res.text),
      model: this.model,
      usage: res.usage,
    };
  }

  async chat(args: { messages: ChatMessage[] }): Promise<LlmChatResult> {
    const res = await this._chatCompletion(args.messages);
    return { text: res.text, model: this.model, usage: res.usage };
  }

  /// Appel HTTP avec timeout dur et un retry unique sur 5xx.
  private async _chatCompletion(messages: Msg[]): Promise<{
    text: string;
    usage: { tokensIn: number; tokensOut: number };
  }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature: 0.3,
            max_tokens: 2000,
          }),
          signal: ctrl.signal,
        });
        if (res.status >= 500 && attempt === 0) {
          lastError = new Error(`LLM ${res.status}`);
          continue; // retry unique
        }
        if (!res.ok) {
          throw new ServiceUnavailableException(
            `LLM provider indisponible (HTTP ${res.status})`,
          );
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        return {
          text: data.choices?.[0]?.message?.content ?? '',
          usage: {
            tokensIn: data.usage?.prompt_tokens ?? 0,
            tokensOut: data.usage?.completion_tokens ?? 0,
          },
        };
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ServiceUnavailableException(
      `LLM provider indisponible : ${String(lastError)}`,
    );
  }
}
