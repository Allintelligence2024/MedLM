// Policy du tuteur — Phase 18.6 (voice tutoring).
//
// CONFORMITÉ NON NÉGOCIABLE :
//   1. Disclaimer médical APPENDÉ À CHAQUE RÉPONSE par le serveur —
//      impossible à désactiver côté client ou par le LLM (le texte parlé
//      à voix haute le contient, pas juste l'UI).
//   2. Détection d'urgence : mots-clés « danger de mort / détresse »
//      → prépend des numéros d'urgence algériens.
//   3. Périmètre : assistant de RÉVISION médicale. Les questions
//      manifestement hors sujet n'appellent jamais le LLM (coût = 0).
//   4. Audit append-only de chaque échange (migration 0015 + triggers).
import { LlmLang } from '../llm/llm.types';

export const MEDICAL_DISCLAIMER: Record<LlmLang, string> = {
  fr: "⚠️ Ceci n'est pas un avis médical. Pour toute décision de santé, consultez un professionnel de santé.",
  ar: '⚠️ هذه ليست استشارة طبية. لأي قرار يخص صحتك، استشر طبيبًا أو مختصًّا في الرعاية الصحية.',
  en: '⚠️ This is not medical advice. For any health decision, consult a healthcare professional.',
};

/// Mots-clés « urgence » (fr / ar / en) — la liste grandira avec les
/// retours terrain, chaque ajout est une entrée de changelog.
export const EMERGENCY_KEYWORDS: readonly string[] = [
  // fr
  'urgence', 'douleur thoracique', 'douleur à la poitrine', 'malaise',
  'perte de conscience', 'suicide', 'surdose', 'étouffe',
  "difficulté à respirer", 'hémorragie',
  // en
  'chest pain', "can't breathe", 'cant breathe', 'unconscious', 'overdose',
  // ar
  'طوارئ', 'ألم في الصدر', 'ألم صدري', 'فقدان الوعي', 'انتحار', 'نزيف',
];

export const EMERGENCY_ADVICE: Record<LlmLang, string> = {
  fr: "🚨 Si vous ou quelqu'un autour de vous êtes en danger immédiat, appelez les urgences (Algérie : SAMU 115, Protection civile 14).",
  ar: '🚨 إذا كنت أنت أو أي شخص من حولك في خطر مباشر، اتصل فورًا بخدمات الطوارئ (الجزائر: الحماية المدنية 14، مصلحة الاستعجالات الطبية 115).',
  en: '🚨 If you or someone around you is in immediate danger, call emergency services (Algeria: SAMU 115, Civil Protection 14).',
};

/// Manifestement hors sujet — heuristique douce, fail-OPEN ailleurs :
/// mieux vaut répondre (avec disclaimer) à une vraie question médicale
/// que bloquer un étudiant. Seuls les sujets clairement étrangers à la
/// médecine court-circuitent le LLM (économie directe).
export const OFFTOPIC_KEYWORDS: readonly string[] = [
  'football', 'foot ', 'politique', 'élection', 'météo', 'weather',
  'recette', 'cuisine', 'film', 'série', 'blague', 'chanson', 'lyrics',
  'crypto', 'bitcoin', 'bourse', 'paris sportif',
];

export function detectEmergency(question: string): boolean {
  const q = question.toLowerCase();
  return EMERGENCY_KEYWORDS.some((k) => q.includes(k));
}

export function isWithinMedicalScope(question: string): boolean {
  const q = question.toLowerCase();
  return !OFFTOPIC_KEYWORDS.some((k) => q.includes(k));
}

/// Réponse de redirection (hors sujet) — localisée, pas d'appel LLM.
export const OUT_OF_SCOPE_REPLY: Record<LlmLang, string> = {
  fr: "Je suis un assistant dédié aux révisions médicales — reposez votre question sur un cours (anatomie, physiologie, biochimie…) et je vous aide à l'ancrer.",
  ar: 'أنا مساعد مخصص للمراجعة الطبية — أعد صياغة سؤالك حول درس طبي (التشريح، وظائف الأعضاء، الكيمياء الحيوية…) وسأساعدك على ترسيخه.',
  en: "I'm an assistant dedicated to medical revision — rephrase your question around a course topic (anatomy, physiology, biochemistry…) and I'll help you anchor it.",
};

/// System prompt du tuteur — cadre pédagogique strict transmis au LLM.
/// La conformité finale (disclaimer dans le texte servi) est garantie
/// ici, côté serveur, indépendamment du respect du prompt par le modèle.
export function buildSystemPrompt(lang: LlmLang): string {
  const langName = { fr: 'français', ar: 'arabe', en: 'anglais' }[lang];
  return [
    'Tu es "MedAnki Tuteur", assistant pédagogique pour étudiants en médecine algériens.',
    `Tu réponds UNIQUEMENT en ${langName}, dans un style clair et concis (5 phrases max).`,
    'Ton rôle : aider à RÉVISER (expliquer une notion de cours, proposer un moyen mnémotechnique, reformuler).',
    'Interdictions absolues : poser un diagnostic, recommander un traitement, interpréter des symptômes, évaluer une urgence.',
    'Si la question relève de la santé réelle d\'une personne, tu refuses poliment et renvoies vers un professionnel de santé.',
    'Tu restes factuel, académique et encourageant — jamais de conseil médical.',
  ].join(' ');
}
