// Types Transcriber — Phase 18.3 (voice-to-card).
//
// Deux implémentations :
//   * 'mock' — déterministe, gratuit, pour dev/tests/démo ;
//   * 'http' — API Whisper-compatible (OpenAI /v1/audio/transcriptions,
//              ou Whisper.cpp / faster-whisper auto-hébergé).
//
// Note architecture : le mobile peut aussi transcrire *localement* et
// n'envoyer que le texte (`audio_transcript`) — c'est le chemin préféré
// (zéro upload audio, vie privée préservée, offline-friendly).
import { LlmLang } from '../llm/llm.types';

export interface TranscriptionResult {
  text: string;
  /// Score de confiance rapporté par le moteur (1.0 pour le STT client
  /// qui n'expose pas de score — convention, pas une mesure).
  confidence: number;
  model: string;
}

export interface TranscriberProvider {
  readonly name: string;
  transcribe(args: {
    audioBase64: string;
    lang: LlmLang;
  }): Promise<TranscriptionResult>;
}

export const TRANSCRIBER_PROVIDER = Symbol('TRANSCRIBER_PROVIDER');
