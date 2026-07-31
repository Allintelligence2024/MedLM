// HttpTranscriber — Phase 18.3.
//
// Client minimaliste pour API Whisper-compatible
// (POST {base}/audio/transcriptions, multipart/form-data).
// Auto-hébergement possible (whisper.cpp, faster-whisper) pour garder
// l'audio des étudiants sur notre infrastructure.
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriberProvider, TranscriptionResult } from './transcriber.types';
import { LlmLang } from '../llm.types';

const HTTP_TIMEOUT_MS = 30_000; // l'audio monte à ~7,5 Mo

export class HttpTranscriber implements TranscriberProvider {
  readonly name = 'http';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    const baseUrl = config
      .get<string>('AI_TRANSCRIBER_BASE_URL')
      ?.replace(/\/$/, '');
    const apiKey = config.get<string>('AI_TRANSCRIBER_API_KEY');
    if (!baseUrl || !apiKey) {
      throw new Error(
        'AI_TRANSCRIBER_PROVIDER=http nécessite AI_TRANSCRIBER_BASE_URL et AI_TRANSCRIBER_API_KEY',
      );
    }
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = config.get<string>('AI_TRANSCRIBER_MODEL') ?? 'whisper-1';
  }

  async transcribe(args: {
    audioBase64: string;
    lang: LlmLang;
  }): Promise<TranscriptionResult> {
    const bytes = Buffer.from(args.audioBase64, 'base64');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)]), 'dictation.m4a');
    form.append('model', this.model);
    form.append('language', args.lang);
    form.append('response_format', 'json');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new ServiceUnavailableException(
          `Transcriber indisponible (HTTP ${res.status})`,
        );
      }
      const data = (await res.json()) as { text?: string };
      return {
        text: data.text ?? '',
        confidence: 1.0, // l'API Whisper n'expose pas de score fiable
        model: this.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
