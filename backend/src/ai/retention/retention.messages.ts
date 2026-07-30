// Messages de rétention — Phase 18.5 (détection de décrochage).
//
// Ton bienveillant, actionnable (« 5 cartes suffisent »), trilingue.
// Jamais de culpabilisation : un étudiant qui décroche doit avoir
// envie de revenir, pas de se désinscrire.
import { LlmLang } from '../llm/llm.types';

export type RetentionLevel = 'none' | 'gentle' | 'streak_broken' | 'reengagement';

export interface RetentionMessage {
  title: string;
  body: string;
}

export interface RetentionCtx {
  /// Jours d'inactivité constatés.
  days: number;
  /// Streak précédent si connu (sinon on ne le mentionne pas).
  streakDays?: number;
}

export function buildRetentionMessage(
  level: RetentionLevel,
  lang: LlmLang,
  ctx: RetentionCtx,
): RetentionMessage {
  const streakLost =
    ctx.streakDays != null && ctx.streakDays > 1
      ? {
          fr: ` : votre streak de ${ctx.streakDays} jours est perdu`,
          ar: ` : انقطع تتابعك البالغ ${ctx.streakDays} أيام`,
          en: ` — your ${ctx.streakDays}-day streak is lost`,
        }[lang]
      : '';

  const byLang: Record<RetentionLevel, Record<LlmLang, RetentionMessage>> = {
    none: { fr: { title: '', body: '' }, ar: { title: '', body: '' }, en: { title: '', body: '' } },
    gentle: {
      fr: {
        title: 'Petit rappel 💡',
        body: `Vous n'avez pas révisé depuis ${ctx.days} jours — 5 cartes suffisent pour relancer la mémoire.`,
      },
      ar: {
        title: 'تذكير لطيف 💡',
        body: `لم تراجع منذ ${ctx.days} أيام — 5 بطاقات تكفي لإعادة تنشيط ذاكرتك.`,
      },
      en: {
        title: 'Gentle reminder 💡',
        body: `You haven't reviewed in ${ctx.days} days — 5 cards is enough to restart your memory.`,
      },
    },
    streak_broken: {
      fr: {
        title: 'Streak en danger 🔥',
        body: `${ctx.days} jours sans révision${streakLost}. 3 cartes maintenant pour repartir sur de bonnes bases.`,
      },
      ar: {
        title: 'تتابعك في خطر 🔥',
        body: `${ctx.days} أيام دون مراجعة${streakLost}. 3 بطاقات الآن لتستأنف المسار.`,
      },
      en: {
        title: 'Streak at risk 🔥',
        body: `${ctx.days} days without reviewing${streakLost}. 3 cards now to get back on track.`,
      },
    },
    reengagement: {
      fr: {
        title: 'On vous attend 👋',
        body: `Cela fait ${ctx.days} jours. Reprenez en douceur : une session de 5 cartes aujourd'hui, et tout roule.`,
      },
      ar: {
        title: 'ننتظرك 👋',
        body: `مرّت ${ctx.days} أيام. عُد بهدوء: جلسة من 5 بطاقات اليوم ويكفي.`,
      },
      en: {
        title: "We're waiting for you 👋",
        body: `It's been ${ctx.days} days. Ease back in: a quick 5-card session today is all it takes.`,
      },
    },
  };
  return byLang[level][lang] ?? byLang[level].fr;
}
