// MockTranscriber — Phase 18.3.
//
// Deterministe : le texte produit ne dépend que de la taille de l'audio
// (base64 → kilo-octets) et de la langue. Marqueur [MOCK] explicite :
// impossible de confondre avec une vraie transcription en production.
import { TranscriberProvider, TranscriptionResult } from './transcriber.types';
import { LlmLang } from '../llm/llm.types';

export class MockTranscriber implements TranscriberProvider {
  readonly name = 'mock';

  transcribe(args: {
    audioBase64: string;
    lang: LlmLang;
  }): Promise<TranscriptionResult> {
    const kb = Math.round((args.audioBase64.length * 3) / 4 / 1024);
    return Promise.resolve({
      text: `[MOCK] Transcription simulée de ${kb} kB d'audio (${args.lang}).`,
      confidence: 0.99,
      model: 'mock-stt-1',
    });
  }
}
