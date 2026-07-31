// Fabrique du Transcriber — Phase 18.3.
//
// AI_TRANSCRIBER_PROVIDER : 'mock' (défaut) | 'http' (Whisper-compatible).
import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TRANSCRIBER_PROVIDER, TranscriberProvider } from './transcriber.types';
import { MockTranscriber } from './transcriber-mock.provider';
import { HttpTranscriber } from './transcriber-http.provider';

export const TranscriberFactory: FactoryProvider<TranscriberProvider> = {
  provide: TRANSCRIBER_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): TranscriberProvider => {
    const kind = config.get<string>('AI_TRANSCRIBER_PROVIDER') ?? 'mock';
    if (kind === 'http') return new HttpTranscriber(config);
    return new MockTranscriber();
  },
};
