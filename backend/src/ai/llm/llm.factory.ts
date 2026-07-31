// Fabrique du LLM provider — Phase 18.2.
//
// AI_LLM_PROVIDER :
//   * absent / 'mock' → MockLlmProvider (défaut, zéro coût)
//   * 'http'          → HttpLlmProvider (OpenAI-compatible)
import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER, LlmProvider } from './llm.types';
import { MockLlmProvider } from './llm-mock.provider';
import { HttpLlmProvider } from './llm-http.provider';

export const LlmProviderFactory: FactoryProvider<LlmProvider> = {
  provide: LLM_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): LlmProvider => {
    const kind = config.get<string>('AI_LLM_PROVIDER') ?? 'mock';
    if (kind === 'http') return new HttpLlmProvider(config);
    // Toute valeur inconnue retombe sur le mock : le système doit rester
    // utilisable même mal configuré (fail-safe côté coût).
    return new MockLlmProvider();
  },
};
