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

import type { CacheProfile } from '../cdn/cdn-headers';

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
const DEFAULT_CATALOG: Messages = {
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
    // Pluralisation ICU-lite.
    const pluralMatch = template.match(/\{(\w+),\s*plural,[^}]+\}/);
    if (pluralMatch) {
      const varName = pluralMatch[1]!;
      const count = Number(params[varName] ?? 0);
      const block = pluralMatch[0]!;
      // Parse "one {# carte} other {# cartes}"
      const branches: Record<string, string> = {};
      const re = /(one|other|many|few|two)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(block)) !== null) {
        branches[m[1]!] = m[2]!;
      }
      const branch = count === 0 ? 'other' : count === 1 ? 'one' : 'other';
      const chosen = branches[branch] ?? branches.other ?? '';
      // Remplace # par count.
      let result = chosen.replace(/#/g, String(count));
      // Substitue le bloc entier.
      return template.replace(pluralMatch[0], result);
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
