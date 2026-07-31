// Tests Phase 18.2 — Génération de cartes assistée par LLM (sans DB).
import { describe, it, expect } from 'vitest';
import {
  MockLlmProvider,
  splitSentences,
  extractKeywords,
  sentenceToCard,
} from '../../src/ai/llm/llm-mock.provider';
import { parseJsonCards } from '../../src/ai/llm/llm-http.provider';
import { AiGenerateService } from '../../src/ai/generate/ai-generate.service';
import { AiGenerateBody } from '../../src/ai/generate/ai-generate.dto';

// ── Découpage de la source ──────────────────────────────────────────
describe('splitSentences', () => {
  it('découpe sur la ponctuation de fin et les sauts de ligne', () => {
    const text =
      'Le nerf radial innerve les extenseurs de l avant-bras. ' +
      'Il chemine dans la gouttière radiale! ' +
      'Trop court. ' +
      'La veine cave supérieure draine la tête et les membres supérieurs.';
    const out = splitSentences(text);
    expect(out.length).toBe(3); // "Trop court." éliminé (< 30 chars)
    expect(out[0]).toContain('nerf radial');
  });

  it('retourne [] pour une source sans phrase valide', () => {
    expect(splitSentences('court.\nok.')).toEqual([]);
  });
});

describe('extractKeywords', () => {
  it('extrait les mots longs, dédupliqués, minuscules, max 2', () => {
    expect(
      extractKeywords('La circulation coronaire vascularise le myocarde coronaire'),
    ).toEqual(['circulation', 'coronaire']);
  });
});

// ── Transformation phrase → carte ───────────────────────────────────
describe('sentenceToCard', () => {
  it('phrase définitionnelle « est » → question Qu\'est-ce que (fr)', () => {
    const { front, back } = sentenceToCard(
      'Le diaphragme est le principal muscle inspirateur',
      'fr',
    );
    expect(front).toBe("Qu'est-ce que Le diaphragme ?");
    expect(back).toContain('diaphragme');
  });

  it('localisation ar et en des questions', () => {
    expect(
      sentenceToCard('The trachea is the main airway of the lungs', 'en').front,
    ).toBe('What is The trachea?');
    expect(
      sentenceToCard('Bab al-jawf huwwa al-abwab ar-ra2is', 'ar').front,
    ).toMatch(/^What is|؛|؟|Reformulez|أعِد|Qu/); // pas de « est » → reformulation ar
  });

  it('sujet plafonné à 8 mots', () => {
    const long =
      'un deux trois quatre cinq six sept huit neuf dix est une suite de mots comptés';
    const { front } = sentenceToCard(long, 'fr');
    expect(front).toBe("Qu'est-ce que un deux trois quatre cinq six sept huit ?");
  });

  it('sans marqueur de définition → question de reformulation', () => {
    const { front } = sentenceToCard(
      'Lors de la diastole ventriculaire les valves auriculo-ventriculaires souvrent',
      'fr',
    );
    expect(front).toContain('Reformulez');
  });
});

// ── Provider mock : déterminisme + contrat ──────────────────────────
describe('MockLlmProvider.generateCards', () => {
  const provider = new MockLlmProvider();
  const source =
    'Le nerf médian innerve la plupart des fléchisseurs de l avant-bras. ' +
    'Il passe dans le canal carpien au niveau du poignet. ' +
    'La lésion du nerf médian entraîne une main de singe. ' +
    'Le test de Phalen provoque des paresthésies médianes.';

  it('produit exactement `count` cartes si la source est riche', async () => {
    const r = await provider.generateCards({
      sourceText: source,
      count: 3,
      lang: 'fr',
    });
    expect(r.cards.length).toBe(3);
  });

  it('déterministe : deux appels identiques donnent la même sortie', async () => {
    const a = await provider.generateCards({ sourceText: source, count: 2, lang: 'fr' });
    const b = await provider.generateCards({ sourceText: source, count: 2, lang: 'fr' });
    expect(a).toEqual(b);
  });

  it('source trop courte → 1 carte de synthèse marquée a-revoir', async () => {
    const r = await provider.generateCards({
      sourceText: 'Source très courte.',
      count: 5,
      lang: 'fr',
    });
    expect(r.cards.length).toBe(1);
    expect(r.cards[0]!.tags).toContain('a-revoir');
  });

  it('comptabilise les tokens (approximation len/4)', async () => {
    const r = await provider.generateCards({ sourceText: source, count: 2, lang: 'fr' });
    expect(r.usage.tokensIn).toBe(Math.ceil(source.length / 4));
    expect(r.usage.tokensOut).toBeGreaterThan(0);
  });

  it('tags contiennent ia + langue', async () => {
    const r = await provider.generateCards({ sourceText: source, count: 1, lang: 'ar' });
    expect(r.cards[0]!.tags).toContain('ia');
    expect(r.cards[0]!.tags).toContain('ar');
  });
});

// ── Parsing défensif de la sortie LLM (provider http) ───────────────
describe('parseJsonCards', () => {
  it('accepte un bloc ```json … ```', () => {
    const raw =
      '```json\n[{"front":"Q1 ?","back":"R1","explanation":"E","tags":["anat"]}]\n```';
    const cards = parseJsonCards(raw);
    expect(cards.length).toBe(1);
    expect(cards[0]!.front).toBe('Q1 ?');
  });

  it('accepte { cards: [...] } et filtre les items invalides', () => {
    const raw = JSON.stringify({
      cards: [
        { front: 'OK ?', back: 'OK', tags: ['x'] },
        { front: 'ab' }, // trop court / sans back
        'pas une carte',
      ],
    });
    expect(parseJsonCards(raw).length).toBe(1);
  });

  it('retourne [] sur du texte non JSON (fail closed)', () => {
    expect(parseJsonCards('Voici vos cartes : …')).toEqual([]);
  });
});

// ── Mapping proposition → ligne cards ───────────────────────────────
describe('AiGenerateService.toCardRow', () => {
  it('status draft + provenance IA traçable', () => {
    const row = AiGenerateService.toCardRow(
      { front: 'Q', back: 'R', explanation: 'E', tags: ['Nerf Radial', 'nerf radial'] },
      {
        deckId: 'deck-1',
        userId: 'user-1',
        provider: 'mock',
        model: 'mock-fsm-1',
        promptHash: 'abc123',
        lang: 'fr',
      },
    );
    expect(row.status).toBe('draft');
    expect(row.type).toBe('basic');
    expect(row.content.front).toBe('Q');
    const meta = row.sourceMeta as Record<string, unknown>;
    expect(meta['source_type']).toBe('ai_generated');
    expect(meta['requires_human_review']).toBe(true);
    expect(meta['prompt_hash']).toBe('abc123');
    expect(row.tags).toContain('ia');
    expect(row.tags).toEqual(['ia', 'nerf radial']); // normalisé + dédupliqué
  });
});

// ── Quotas journaliers (UTC) ────────────────────────────────────────
describe('AiGenerateService — quota', () => {
  it('remainingQuota ne descend pas sous 0', () => {
    expect(AiGenerateService.remainingQuota(20, 20)).toBe(0);
    expect(AiGenerateService.remainingQuota(25, 20)).toBe(0);
    expect(AiGenerateService.remainingQuota(5, 20)).toBe(15);
  });

  it('todayStartUtc = minuit UTC', () => {
    const d = AiGenerateService.todayStartUtc(
      new Date('2026-07-31T16:42:11.000Z'),
    );
    expect(d.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('promptHashOf est stable (sha256)', () => {
    const h1 = AiGenerateService.promptHashOf(['a', 'b', '1']);
    expect(h1).toBe(AiGenerateService.promptHashOf(['a', 'b', '1']));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(AiGenerateService.promptHashOf(['a', 'b', '2']));
  });
});

// ── Validation Zod ──────────────────────────────────────────────────
describe('AiGenerateBody — validation Zod', () => {
  const valid = {
    deck_id: '00000000-0000-0000-0000-000000000001',
    source_text: 'x'.repeat(80),
  };

  it('body minimal valide (defaults count=5, lang=fr)', () => {
    const r = AiGenerateBody.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.count).toBe(5);
      expect(r.data.lang).toBe('fr');
    }
  });

  it('rejette une source trop courte (< 50 chars)', () => {
    expect(AiGenerateBody.safeParse({ ...valid, source_text: 'court' }).success).toBe(false);
  });

  it('rejette count > 20', () => {
    expect(AiGenerateBody.safeParse({ ...valid, count: 21 }).success).toBe(false);
  });

  it('rejette une clé inconnue (strict)', () => {
    expect(AiGenerateBody.safeParse({ ...valid, hack: true }).success).toBe(false);
  });

  it('rejette un deck_id non-uuid', () => {
    expect(AiGenerateBody.safeParse({ ...valid, deck_id: 'deck-1' }).success).toBe(false);
  });
});
