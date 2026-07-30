/// Phase 18.1 — Templates de hints adaptatifs (sans LLM).
///
/// Contrainte produit : pas d'appel à un LLM externe (trop cher pour le
/// marché algérien). Les hints sont construits par règles à partir :
///   * du profil utilisateur (niveau d'expérience dérivé du SRS),
///   * de l'état SRS de la carte (lapses, reps, difficulté, retard),
///   * des métadonnées de la carte (tags, difficulty_hint, lien examen).
///
/// Chaque catégorie possède trois traductions (fr / ar / en) écrites
/// comme des fonctions : l'interpolation du contexte est donc typée et
/// testée, jamais concaténée depuis l'extérieur.

export type HintLang = 'fr' | 'ar' | 'en';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type HintCategory =
  | 'leech_help' // l'utilisateur rate toujours la même carte
  | 'first_encounter' // carte jamais vue + utilisateur débutant
  | 'consolidation' // 1 à 3 passages : en train d'ancrer
  | 'exam_link' // carte liée à une question d'examen
  | 'difficulty_high' // difficulté FSRS ou hint éditorial élevé
  | 'due_pressure' // carte en retard de révision
  | 'memory_anchor'; // fallback générique

/// Contexte interpolé dans les templates.
export interface HintContext {
  /// Point d'ancrage mémoriel : tag le plus parlant (ou nom du module).
  anchor: string;
  /// Nombre de lapses sur cette carte.
  lapses: number;
  /// Nombre de passages (reps) sur cette carte.
  reps: number;
  /// Jours de retard de révision (0 si à jour).
  overdueDays: number;
  /// Difficulté FSRS (1..10).
  difficulty: number;
  /// Niveau d'expérience dérivé du profil.
  experience: ExperienceLevel;
}

export type HintTemplate = (ctx: HintContext) => string;

export const HINT_TEMPLATES: Record<HintCategory, Record<HintLang, HintTemplate>> = {
  leech_help: {
    fr: (c) =>
      `Vous avez raté cette carte ${c.lapses} fois. Ancrez-la : associez « ${c.anchor} » à une image mentale, puis reformulez la réponse à voix haute.`,
    ar: (c) =>
      `أخطأت في هذه البطاقة ${c.lapses} مرّات. ثبّتها في ذاكرتك: اربط «${c.anchor}» بصورة ذهنية ثم أعد صياغة الجواب بصوت عالٍ.`,
    en: (c) =>
      `You have failed this card ${c.lapses} times. Anchor it: link "${c.anchor}" to a mental image, then rephrase the answer out loud.`,
  },
  first_encounter: {
    fr: (c) =>
      `Première rencontre : lisez la question à voix haute, devinez avant de retourner la carte, et repérez le mot-clé « ${c.anchor} ».`,
    ar: (c) =>
      `أول لقاء مع هذه البطاقة: اقرأ السؤال بصوت عالٍ، وخمّن الجواب قبل قلب البطاقة، وسجّل الكلمة المفتاحية «${c.anchor}».`,
    en: (c) =>
      `First encounter: read the question aloud, guess before flipping the card, and note the keyword "${c.anchor}".`,
  },
  consolidation: {
    fr: (c) =>
      `Carte en cours de consolidation (${c.reps} passages). Ne cliquez pas trop vite : donnez la réponse complète — elle porte sur « ${c.anchor} ».`,
    ar: (c) =>
      `البطاقة قيد الترسيخ (${c.reps} مرورات). لا تنقر بسرعة: أعطِ الجواب كاملًا — الموضوع هو «${c.anchor}».`,
    en: (c) =>
      `Card being consolidated (${c.reps} passes). Don't tap too fast: give the full answer — it's about "${c.anchor}".`,
  },
  exam_link: {
    fr: () =>
      `Cette carte est liée à une question d'examen. Traitez-la comme au concours : chronométrez-vous et structurez la réponse en 3 points.`,
    ar: () =>
      `هذه البطاقة مرتبطة بسؤال امتحان. تعامل معها كما في الامتحان الرسمي: راقب الوقت وهيكل الجواب في 3 نقاط.`,
    en: () =>
      `This card is linked to an exam question. Treat it like the real exam: time yourself and structure the answer in 3 points.`,
  },
  difficulty_high: {
    fr: (c) =>
      `Carte difficile (D ≈ ${c.difficulty.toFixed(0)}/10). Découpez la réponse en étapes et comparez-les à « ${c.anchor} » avant de vous noter.`,
    ar: (c) =>
      `بطاقة صعبة (الصعوبة ≈ ${c.difficulty.toFixed(0)}/10). قسّم الجواب إلى خطوات وقارِنها بـ «${c.anchor}» قبل تقييم نفسك.`,
    en: (c) =>
      `Hard card (D ≈ ${c.difficulty.toFixed(0)}/10). Break the answer into steps and compare them with "${c.anchor}" before rating yourself.`,
  },
  due_pressure: {
    fr: (c) =>
      `En retard de ${c.overdueDays} jours : la mémoire s'érode. Revoyez « ${c.anchor} » maintenant, puis reprenez le rythme de répétition espacée.`,
    ar: (c) =>
      `متأخرة بـ ${c.overdueDays} أيام: الذاكرة تتلاشى. راجِع «${c.anchor}» الآن ثم استأنف إيقاع التكرار المتباعد.`,
    en: (c) =>
      `${c.overdueDays} days overdue: memory fades. Review "${c.anchor}" now, then resume your spaced-repetition rhythm.`,
  },
  memory_anchor: {
    fr: (c) =>
      `Pensez à relier « ${c.anchor} » à un cas clinique vu en cours : un souvenir concret accélère le rappel.`,
    ar: (c) =>
      `حاول ربط «${c.anchor}» بحالة سريرية من الدروس: الذكرى الملموسة تُسرّع الاستدعاء.`,
    en: (c) =>
      `Try linking "${c.anchor}" to a clinical case from class: a concrete memory speeds recall.`,
  },
};

/// Rendu d'un hint : sélection du template + template rendered.
export function renderHint(
  category: HintCategory,
  ctx: HintContext,
  lang: HintLang,
): string {
  const byLang = HINT_TEMPLATES[category];
  return (byLang[lang] ?? byLang.fr)(ctx);
}

/// Justification auditée : quels signaux ont produit ce hint.
/// On l'expose au client et on le journalise : la personnalisation doit
/// être explicable (doc v2 §13 — transparence du moteur).
export function buildRationale(
  category: HintCategory,
  ctx: HintContext,
): string[] {
  const out: string[] = [`category:${category}`, `experience:${ctx.experience}`];
  if (category === 'leech_help') out.push(`lapses:${ctx.lapses}`);
  if (category === 'consolidation') out.push(`reps:${ctx.reps}`);
  if (category === 'due_pressure') out.push(`overdue_days:${ctx.overdueDays}`);
  if (category === 'difficulty_high') out.push(`difficulty:${ctx.difficulty.toFixed(1)}`);
  if (category === 'exam_link') out.push('exam_question_link:true');
  out.push(`anchor:${ctx.anchor}`);
  return out;
}
