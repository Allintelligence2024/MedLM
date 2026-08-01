// i18n — Phase 17.5.
//
// Internationalisation FR/AR/EN. v2 §3.2 — FR principal, EN
// secondaire, AR pour l'Algérie.
//
// Architecture :
//   * Catalogue de messages par langue, structuré en arbre
//     (catégories / clés).
//   * Helper `t(lang, key, params?)` qui résout la clé + formate
//     les paramètres (style ICU lite : {name}, {count}).
//   * Pluralisation simplifiée : {count, plural, one {# carte}
//     other {# cartes}}.
//   * Fallback : si la clé manque dans une langue, on tombe sur
//     le FR (langue par défaut).
//   * RTL (right-to-left) : pour l'arabe, on expose `isRtl(lang)`.
//
// Note : on n'utilise PAS une lib externe (pas de i18next en
// backend). Le backend ne fait que répondre aux requêtes dans
// la bonne langue — la traduction des contenus CMS reste l'affaire
// des auteurs.

export type Lang = 'fr' | 'ar' | 'en';

export const SUPPORTED_LANGS: Lang[] = ['fr', 'ar', 'en'];
export const DEFAULT_LANG: Lang = 'fr';

export function isSupported(lang: string): lang is Lang {
  return SUPPORTED_LANGS.includes(lang as Lang);
}

export function isRtl(lang: Lang): boolean {
  return lang === 'ar';
}

export type Catalog = Record<string, string>;

export interface Messages {
  fr: Catalog;
  ar: Catalog;
  en: Catalog;
}

/// Catalogue par défaut (extrait — les autres clés sont dans
/// `messages.ts` qui est généré au build).
/// Exportée depuis la Phase 19.3 pour les tests de parité FR/AR/EN.
export const DEFAULT_CATALOG: Messages = {
  fr: {
    'auth.login.success': 'Connexion réussie',
    'auth.login.invalid_credentials': 'Email ou mot de passe incorrect',
    'auth.signup.email_taken': 'Cet email est déjà utilisé',
    'billing.checkout.created': 'Checkout créé avec succès',
    'billing.checkout.amount_invalid': 'Le montant est invalide',
    'error.not_found': 'Ressource introuvable',
    'error.unauthorized': 'Authentification requise',
    'error.forbidden': 'Accès refusé',
    'error.rate_limited': 'Trop de requêtes, réessayez plus tard',
    'error.internal': 'Erreur interne du serveur',
    'exam.start.success': 'Examen démarré — durée : {duration} minutes',
    'exam.submit.success': 'Examen soumis : {score}%',
    'gamification.streak.danger': 'Votre streak est en danger !',
    'gamification.level.up': 'Vous êtes passé au niveau {level} !',
    'share.created': 'Carte de partage créée',
    'stats.fetched': 'Statistiques récupérées',
    // Phase 19.3 — i18n complète des features IA (Phase 18).
    'ai.hint.fetched': 'Indice personnalisé généré',
    'ai.generate.drafts_created':
      '{count, plural, one {# brouillon créé} other {# brouillons créés}} — relecture humaine obligatoire avant publication',
    'ai.generate.quota_exceeded': 'Quota journalier de génération IA atteint',
    'ai.voice.draft_created': 'Brouillon vocal enregistré, en attente de relecture',
    'ai.adaptive.profile_fetched': 'Profil d\u2019apprentissage calculé',
    'ai.adaptive.scan_done': 'Balayage terminé : {count} nouveaux signaux',
    'ai.tutor.disclaimer':
      "⚠️ Ceci n'est pas un avis médical. Pour toute décision de santé, consultez un professionnel de santé.",
    'ai.tutor.out_of_scope':
      'Je suis un assistant dédié aux révisions médicales — reposez votre question sur un cours.',
    'ai.tutor.quota_exceeded': 'Quota journalier du tuteur atteint',
    'retention.gentle.title': 'Petit rappel 💡',
    'retention.gentle.body':
      'Vous n\u2019avez pas révisé depuis {days} jours — 5 cartes suffisent pour relancer la mémoire.',
    'retention.streak_broken.title': 'Streak en danger 🔥',
    'retention.streak_broken.body':
      '{days} jours sans révision. 3 cartes maintenant pour repartir sur de bonnes bases.',
    'retention.reengagement.title': 'On vous attend 👋',
    'retention.reengagement.body':
      'Cela fait {days} jours. Reprenez en douceur : une session de 5 cartes aujourd\u2019hui.',
  },
  ar: {
    'auth.login.success': 'تم تسجيل الدخول بنجاح',
    'auth.login.invalid_credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'auth.signup.email_taken': 'هذا البريد الإلكتروني مستخدم بالفعل',
    'billing.checkout.created': 'تم إنشاء الدفع بنجاح',
    'billing.checkout.amount_invalid': 'المبلغ غير صالح',
    'error.not_found': 'المورد غير موجود',
    'error.unauthorized': 'المصادقة مطلوبة',
    'error.forbidden': 'الوصول مرفوض',
    'error.rate_limited': 'طلبات كثيرة جدًا، حاول لاحقًا',
    'error.internal': 'خطأ داخلي في الخادم',
    'exam.start.success': 'بدأ الاختبار — المدة: {duration} دقيقة',
    'exam.submit.success': 'تم تقديم الاختبار: {score}٪',
    'gamification.streak.danger': 'سلسلتك في خطر!',
    'gamification.level.up': 'لقد انتقلت إلى المستوى {level}!',
    'share.created': 'تم إنشاء بطاقة المشاركة',
    'stats.fetched': 'تم استرداد الإحصائيات',
    // Phase 19.3 — i18n complète des features IA (Phase 18).
    'ai.hint.fetched': 'تم إنشاء تلميح مخصص',
    'ai.generate.drafts_created':
      '{count, plural, one {# مسودة} other {# مسودات}} — المراجعة البشرية إلزامية قبل النشر',
    'ai.generate.quota_exceeded': 'تم بلوغ الحصة اليومية للتوليد بالذكاء الاصطناعي',
    'ai.voice.draft_created': 'تم تسجيل المسودة الصوتية، بانتظار المراجعة',
    'ai.adaptive.profile_fetched': 'تم حساب ملف التعلم',
    'ai.adaptive.scan_done': 'اكتمل المسح: {count} إشارة جديدة',
    'ai.tutor.disclaimer':
      '⚠️ هذه ليست استشارة طبية. لأي قرار يخص صحتك، استشر طبيبًا أو مختصًّا في الرعاية الصحية.',
    'ai.tutor.out_of_scope':
      'أنا مساعد مخصص للمراجعة الطبية — أعد صياغة سؤالك حول درس طبي.',
    'ai.tutor.quota_exceeded': 'تم بلوغ الحصة اليومية للمدرس',
    'retention.gentle.title': 'تذكير لطيف 💡',
    'retention.gentle.body': 'لم تراجع منذ {days} أيام — 5 بطاقات تكفي لإعادة تنشيط ذاكرتك.',
    'retention.streak_broken.title': 'تتابعك في خطر 🔥',
    'retention.streak_broken.body': '{days} أيام دون مراجعة. 3 بطاقات الآن لتستأنف المسار.',
    'retention.reengagement.title': 'ننتظرك 👋',
    'retention.reengagement.body': 'مرّت {days} أيام. عُد بهدوء: جلسة من 5 بطاقات اليوم ويكفي.',
  },
  en: {
    'auth.login.success': 'Login successful',
    'auth.login.invalid_credentials': 'Invalid email or password',
    'auth.signup.email_taken': 'This email is already in use',
    'billing.checkout.created': 'Checkout created successfully',
    'billing.checkout.amount_invalid': 'Amount is invalid',
    'error.not_found': 'Resource not found',
    'error.unauthorized': 'Authentication required',
    'error.forbidden': 'Access denied',
    'error.rate_limited': 'Too many requests, try again later',
    'error.internal': 'Internal server error',
    'exam.start.success': 'Exam started — duration: {duration} minutes',
    'exam.submit.success': 'Exam submitted: {score}%',
    'gamification.streak.danger': 'Your streak is in danger!',
    'gamification.level.up': 'You leveled up to {level}!',
    'share.created': 'Share card created',
    'stats.fetched': 'Stats fetched',
    // Phase 19.3 — i18n complète des features IA (Phase 18).
    'ai.hint.fetched': 'Personalized hint generated',
    'ai.generate.drafts_created':
      '{count, plural, one {# draft created} other {# drafts created}} — human review is mandatory before publishing',
    'ai.generate.quota_exceeded': 'Daily AI generation quota reached',
    'ai.voice.draft_created': 'Voice draft saved, pending review',
    'ai.adaptive.profile_fetched': 'Learning profile computed',
    'ai.adaptive.scan_done': 'Scan complete: {count} new signals',
    'ai.tutor.disclaimer':
      '⚠️ This is not medical advice. For any health decision, consult a healthcare professional.',
    'ai.tutor.out_of_scope':
      "I'm an assistant dedicated to medical revision — rephrase your question around a course topic.",
    'ai.tutor.quota_exceeded': 'Daily tutor quota reached',
    'retention.gentle.title': 'Gentle reminder 💡',
    'retention.gentle.body':
      'You haven\u2019t reviewed in {days} days — 5 cards is enough to restart your memory.',
    'retention.streak_broken.title': 'Streak at risk 🔥',
    'retention.streak_broken.body':
      '{days} days without reviewing. 3 cards now to get back on track.',
    'retention.reengagement.title': "We're waiting for you 👋",
    'retention.reengagement.body':
      "It's been {days} days. Ease back in: a quick 5-card session today.",
  },
};

export class I18n {
  private catalog: Messages;

  constructor(catalog: Messages = DEFAULT_CATALOG) {
    this.catalog = catalog;
  }

  /// Résout une clé dans la langue demandée, avec fallback FR.
  /// `params` substitue les `{name}`, `{count}`, etc.
  t(lang: Lang, key: string, params?: Record<string, string | number>): string {
    const cat = this.catalog[lang] ?? this.catalog[DEFAULT_LANG];
    let msg = cat[key];
    if (msg === undefined) {
      // Fallback FR.
      msg = this.catalog[DEFAULT_LANG][key];
    }
    if (msg === undefined) {
      // Clé inconnue : on retourne la clé (debug-friendly).
      return key;
    }
    return this._format(msg, params);
  }

  /// Formate les paramètres. Supporte :
  ///   * `{name}` → params.name
  ///   * `{count, plural, one {# carte} other {# cartes}}` → pluralisation
  _format(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    // Pluralisation ICU-lite : on repère `{nom, plural,` puis on scanne
    // le bloc COMPLET avec un compteur d'accolades (un regex ne peut
    // pas matcher des accolades imbriquées — l'ancien `[^}]+`
    // s'arrêtait à la première fermante et cassait le rendu).
    const head = template.match(/\{(\w+),\s*plural,/);
    if (head && head.index !== undefined) {
      const varName = head[1]!;
      const start = head.index;
      const bodyStart = start + head[0].length;
      let depth = 0;
      let end = -1;
      for (let i = start; i < template.length; i++) {
        const c = template[i];
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end !== -1) {
        const body = template.slice(bodyStart, end);
        // Parse "one {# carte} other {# cartes}" — un niveau
        // d'imbrication d'accolades supporté dans une branche.
        const branches: Record<string, string> = {};
        const re = /(zero|one|two|few|many|other)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(body)) !== null) {
          branches[m[1]!] = m[2]!;
        }
        const count = Number(params[varName] ?? 0);
        const explicitZero = count === 0 && branches.zero !== undefined;
        const branch = explicitZero ? 'zero' : count === 1 ? 'one' : 'other';
        const chosen = branches[branch] ?? branches.other ?? '';
        const result = chosen.replace(/#/g, String(count));
        const replaced =
          template.slice(0, start) + result + template.slice(end + 1);
        return this._format(replaced, params); // substitue les {name} restants
      }
    }
    // Simple substitution {name}.
    return template.replace(/\{(\w+)\}/g, (_, name) => {
      const v = params[name];
      return v === undefined ? `{${name}}` : String(v);
    });
  }

  /// Ajoute/met à jour une entrée du catalogue (pour tests ou
  /// chargement dynamique).
  set(lang: Lang, key: string, value: string): void {
    this.catalog[lang][key] = value;
  }
}
