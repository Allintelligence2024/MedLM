// Tests Phase 18.3 — Voice-to-card (logique pure, sans DB).
import { describe, it, expect } from 'vitest';
import { formatTranscriptToCard } from '../../src/ai/voice/card-formatter';
import { MockTranscriber } from '../../src/ai/voice/transcriber-mock.provider';
import { VoiceToCardService } from '../../src/ai/voice/voice-to-card.service';
import { VoiceToCardBody } from '../../src/ai/voice/voice-to-card.dto';

// ── Formatage transcription → carte ─────────────────────────────────
describe('formatTranscriptToCard', () => {
  it('règle 1 : dictée « question ? réponse » → split sur le « ? »', () => {
    const c = formatTranscriptToCard(
      'Quel nerf innerve les extenseurs du poignet ? Le nerf radial.',
      'fr',
    );
    expect(c.rule).toBe('question_split');
    expect(c.front).toBe('Quel nerf innerve les extenseurs du poignet ?');
    expect(c.back).toBe('Le nerf radial.');
  });

  it('règle 1 bis : question sans réponse → placeholder localisé', () => {
    const c = formatTranscriptToCard('Quelle est la fonction du péricarde ?', 'fr');
    expect(c.rule).toBe('question_split');
    expect(c.back).toContain('auteur');
    expect(c.back.length).toBeGreaterThan(0);
  });

  it('règle 2 : définition parlée « X est Y » → Qu\'est-ce que X (fr)', () => {
    const c = formatTranscriptToCard(
      'Le péricarde est l enveloppe fibreuse du coeur',
      'fr',
    );
    expect(c.rule).toBe('definition');
    expect(c.front).toBe("Qu'est-ce que Le péricarde ?");
    expect(c.back).toContain('péricarde');
  });

  it('règle 2 en : "is" → What is', () => {
    const c = formatTranscriptToCard('The tricuspid valve is between right atrium and ventricle', 'en');
    expect(c.rule).toBe('definition');
    expect(c.front).toBe('What is The tricuspid valve?');
  });

  it('règle 3 : note brute → À propos de (fallback localisé)', () => {
    const c = formatTranscriptToCard(
      'réviser les artères du membre inférieur avant le concours',
      'fr',
    );
    expect(c.rule).toBe('fallback');
    expect(c.front).toContain('À propos de');
    expect(c.back).toContain('artères');
    const ar = formatTranscriptToCard('مراجعة شرايين الطرف السفلي قبل الامتحان', 'ar');
    expect(ar.front).toContain('حول');
  });

  it('espaces normalisés + tags voix/lang/keywords', () => {
    const c = formatTranscriptToCard(
      '  Le   diaphragme   est   le   principal   muscle   inspirateur   du   thorax  ',
      'fr',
    );
    expect(c.back).not.toMatch(/\s{2,}/);
    expect(c.tags).toContain('voix');
    expect(c.tags).toContain('fr');
    expect(c.tags).toContain('inspirateur'); // mot-clé long extrait
    expect(c.tags.length).toBeLessThanOrEqual(5);
  });

  it('explanation = transcription (trafiquée à 1000 chars max)', () => {
    const c = formatTranscriptToCard('mot '.repeat(500), 'fr');
    expect(c.explanation.length).toBeLessThanOrEqual(1000);
  });
});

// ── Transcriber mock ────────────────────────────────────────────────
describe('MockTranscriber', () => {
  it('déterministe et explicitement marqué [MOCK]', async () => {
    const t = new MockTranscriber();
    const a = await t.transcribe({ audioBase64: 'AAAA'.repeat(1024), lang: 'fr' });
    const b = await t.transcribe({ audioBase64: 'AAAA'.repeat(1024), lang: 'fr' });
    expect(a).toEqual(b);
    expect(a.text).toContain('[MOCK]');
    expect(a.confidence).toBeGreaterThan(0);
  });
});

// ── Mapping → ligne cards ───────────────────────────────────────────
describe('VoiceToCardService.toCardRow', () => {
  it('draft + source_type voice_to_card + requires_human_review', () => {
    const formatted = formatTranscriptToCard(
      'Quel muscle ferme la mandibule ? Le masséter.',
      'fr',
    );
    const row = VoiceToCardService.toCardRow(formatted, {
      deckId: 'deck-1',
      userId: 'user-1',
      transcriber: 'client-stt',
      model: 'client',
      confidence: 1.0,
      lang: 'fr',
      transcriptHash: 'sha256',
    });
    expect(row.status).toBe('draft');
    const meta = row.sourceMeta as Record<string, unknown>;
    expect(meta['source_type']).toBe('voice_to_card');
    expect(meta['requires_human_review']).toBe(true);
    expect(meta['format_rule']).toBe('question_split');
    expect(row.content.front).toContain('mandibule');
  });
});

// ── Validation Zod ──────────────────────────────────────────────────
describe('VoiceToCardBody — validation Zod', () => {
  const deckId = '00000000-0000-0000-0000-000000000001';

  it('oki avec audio_transcript seul (chemin préféré)', () => {
    const r = VoiceToCardBody.safeParse({
      deck_id: deckId,
      audio_transcript: 'Question dictée au micro ?',
    });
    expect(r.success).toBe(true);
  });

  it('ok avec audio_base64 seul', () => {
    const r = VoiceToCardBody.safeParse({
      deck_id: deckId,
      audio_base64: 'A'.repeat(200),
    });
    expect(r.success).toBe(true);
  });

  it('rejette si aucun des deux n\'est fourni', () => {
    expect(VoiceToCardBody.safeParse({ deck_id: deckId }).success).toBe(false);
  });

  it('rejette un transcript trop court', () => {
    expect(
      VoiceToCardBody.safeParse({ deck_id: deckId, audio_transcript: 'ab' }).success,
    ).toBe(false);
  });

  it('rejette un audio_base64 trop petit (bruit)', () => {
    expect(
      VoiceToCardBody.safeParse({ deck_id: deckId, audio_base64: 'AAAA' }).success,
    ).toBe(false);
  });

  it('rejette une clé inconnue (strict)', () => {
    expect(
      VoiceToCardBody.safeParse({
        deck_id: deckId,
        audio_transcript: 'bonjour ?',
        extra: 1,
      }).success,
    ).toBe(false);
  });
});
