// GENERATED — ne pas éditer à la main.
//
// Produit par `tools/scripts/gen_l10n.py` à partir de `lib/l10n/*.arb`.
// Régénérer après toute modification des .arb :
//     python3 tools/scripts/gen_l10n.py
//
// Ce fichier est COMMITÉ (décision d'audit P0-2b, comme le code Drift) :
// le dépôt reste compilable sans étape de génération, et la CI vérifie
// sa fraîcheur via `python3 tools/scripts/gen_l10n.py --check`.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

/// Accès aux chaînes traduites de l'application.
abstract class AppLocalizations {
  const AppLocalizations(this.localeName);

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    final instance =
        Localizations.of<AppLocalizations>(context, AppLocalizations);
    assert(instance != null,
        'AppLocalizations absent : vérifier localizationsDelegates.');
    return instance!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  static const List<Locale> supportedLocales = <Locale>[
    Locale('fr'),
    Locale('ar'),
    Locale('en'),
  ];

  String get appTitle;
  String get actionRetry;
  String get actionCancel;
  String get actionContinue;
  String get actionSave;
  String get actionClose;
  String get actionRefresh;
  String get actionSkip;
  String get actionNext;
  String get actionBack;
  String get errorGeneric;
  String get errorOffline;
  String get loading;
  String get navHome;
  String get navStudy;
  String get navDecks;
  String get navExams;
  String get navProfile;
  String get authWelcomeTitle;
  String get authWelcomeSubtitle;
  String get authLogin;
  String get authSignup;
  String get authEmail;
  String get authEmailInvalid;
  String get authMagicLink;
  String get authMagicLinkSent;
  String get authGoogle;
  String get authDisplayName;
  String get authFaculty;
  String get authStudyYear;
  String get authFacultyRequired;
  String get authHaveAccount;
  String get authNoAccount;
  String get onboardingLanguage;
  String get onboardingLanguageHelp;
  String get onboardingGoal;
  String onboardingGoalCards(int count);
  String get onboardingGoalHelp;
  String get onboardingNotifications;
  String get onboardingNotificationsHelp;
  String get onboardingNotificationsEnable;
  String get onboardingNotificationsLater;
  String get onboardingDone;
  String homeGreeting(String name);
  String get homeDueToday;
  String homeDueCount(int count);
  String get homeStartStudy;
  String homeStreak(int count);
  String homeXp(int count);
  String homeLevel(int level);
  String get homeAccuracy;
  String get homeNothingDue;
  String get homeQuickActions;
  String get studyTitle;
  String get studyShowAnswer;
  String get studyRatingAgain;
  String get studyRatingHard;
  String get studyRatingGood;
  String get studyRatingEasy;
  String get studyEmpty;
  String get studyDone;
  String studyReviewed(int count);
  String get studyDictate;
  String get studyHint;
  String get decksTitle;
  String get decksDownloaded;
  String get decksDownload;
  String get decksDownloading;
  String get decksPremium;
  String decksCardCount(int count);
  String get decksEmpty;
  String get decksOfflineReady;
  String get examsTitle;
  String get examsStart;
  String examsQuestionOf(int current, int total);
  String examsTimeLeft(String time);
  String get examsSubmit;
  String get examsSubmitConfirm;
  String examsScore(String score);
  String get examsPassed;
  String get examsFailed;
  String get examsExpired;
  String get examsEmpty;
  String get examsPrediction;
  String get paywallTitle;
  String get paywallBenefitDecks;
  String get paywallBenefitExams;
  String get paywallBenefitAi;
  String get paywallCta;
  String get paywallRestore;
  String paywallActiveUntil(String date);
  String get paywallGrace;
  String get paywallGroupPack;
  String get paywallJoinGroup;
  String get profileTitle;
  String get profileLanguage;
  String get profileNotifications;
  String get profileDailyGoal;
  String get profileLeaderboardOptIn;
  String get profileSync;
  String get profileSynced;
  String get profileLogout;
  String get profileLogoutConfirm;
  String profileVersion(String version);
  String get profileLegal;
  String get leaderboardTitle;
  String get leaderboardOptIn;
  String get leaderboardOptOut;
  String leaderboardMyRank(int rank);
  String get leaderboardEmpty;
  String get leaderboardError;
  String get badgesTitle;
  String get badgesLocked;
  String get badgesEmpty;
  String get shareTitle;
  String get shareCard;
  String get shareProgress;
  String get notifPermissionTitle;
  String get notifPermissionBody;
  String get notifPermissionAllow;
  String get notifPermissionDeny;
  String get notifDenied;
  String get aiHintLabel;
  String get aiHintDismiss;
  String get tutorQuotaReached;
  String get tutorOffline;
  String get tutorUnavailable;
  String get tutorPlaceholder;
  String get tutorStopDictation;
  String get tutorEmergency;
  String get tutorListen;
  String get voiceMicUnavailable;
  String get voiceTooShort;
  String get voiceQuotaReached;
  String get voiceOffline;
  String get voiceDraftFailed;
  String get voiceHelp;
  String get voiceListening;
  String get voiceTranscriptLabel;
  String get voiceCreating;
  String get voiceCreateDraft;
  String get voiceDraftCreated;
  String voiceRuleApplied(String rule);
  String get leaderboardPseudonym;
  String get leaderboardPseudonymLength;
  String get leaderboardPseudonymAlnum;
  String get leaderboardFacultyOptional;
  String get leaderboardYearRange;
  String get leaderboardOptInFailed;
  String get leaderboardOptOutGdpr;
  String get mlPredictionTitle;
  String mlModelWindow(String version, int days);
  String get mlNotEnoughData;
  String mlBasedOn(int reviews, int accuracy, int streak);
  String get mlAtRisk;
  String mlTagFocusTitle(int days);
  String get mlTagRework;
  String get mlTagMastered;
  String mlTagLapses(int lapses, int reviews);
  String get studyPrepareFailed;
  String get studyReviewNotSaved;
  String studyDraftCreated(String id);
  String get studyNothingLeft;
  String studyAgainCount(int count);
  String studyProgress(int done, int remaining);
  String get studyFinish;
  String get tutorIntro;
  String get tutorMicUnavailable;
  String get tutorDictate;
  String get tutorTitle;
  String get voiceTitle;
  String get voiceHelpFull;
  String get voiceDictate;
  String get voiceFront;
  String get voiceBack;
  String voiceRuleAndQuota(String rule, int quota);
  String get actionConfirm;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      <String>['fr', 'ar', 'en'].contains(locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) =>
      SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
  }
  // Le français est la langue de rédaction du produit : c'est le repli.
  return AppLocalizationsFr();
}

class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'MedAnki DZ';

  @override
  String get actionRetry => 'Réessayer';

  @override
  String get actionCancel => 'Annuler';

  @override
  String get actionContinue => 'Continuer';

  @override
  String get actionSave => 'Enregistrer';

  @override
  String get actionClose => 'Fermer';

  @override
  String get actionRefresh => 'Rafraîchir';

  @override
  String get actionSkip => 'Passer';

  @override
  String get actionNext => 'Suivant';

  @override
  String get actionBack => 'Retour';

  @override
  String get errorGeneric => 'Une erreur est survenue.';

  @override
  String get errorOffline => 'Pas de connexion. Le mode hors ligne reste disponible.';

  @override
  String get loading => 'Chargement…';

  @override
  String get navHome => 'Accueil';

  @override
  String get navStudy => 'Étudier';

  @override
  String get navDecks => 'Cours';

  @override
  String get navExams => 'Examens';

  @override
  String get navProfile => 'Profil';

  @override
  String get authWelcomeTitle => 'Révise mieux, retiens plus';

  @override
  String get authWelcomeSubtitle => 'La révision par répétition espacée pour les étudiants en médecine en Algérie.';

  @override
  String get authLogin => 'Se connecter';

  @override
  String get authSignup => 'Créer un compte';

  @override
  String get authEmail => 'Adresse e-mail';

  @override
  String get authEmailInvalid => 'Adresse e-mail invalide.';

  @override
  String get authMagicLink => 'Recevoir un lien de connexion';

  @override
  String get authMagicLinkSent => 'Lien envoyé. Vérifie ta boîte mail.';

  @override
  String get authGoogle => 'Continuer avec Google';

  @override
  String get authDisplayName => 'Nom affiché';

  @override
  String get authFaculty => 'Faculté';

  @override
  String get authStudyYear => 'Année d\'étude';

  @override
  String get authFacultyRequired => 'Choisis ta faculté.';

  @override
  String get authHaveAccount => 'J\'ai déjà un compte';

  @override
  String get authNoAccount => 'Je n\'ai pas encore de compte';

  @override
  String get onboardingLanguage => 'Langue de l\'application';

  @override
  String get onboardingLanguageHelp => 'Tu pourras la changer à tout moment dans le profil.';

  @override
  String get onboardingGoal => 'Objectif quotidien';

  @override
  String onboardingGoalCards(int count) => '${count} cartes par jour';

  @override
  String get onboardingGoalHelp => 'Un objectif tenable vaut mieux qu\'un objectif ambitieux abandonné.';

  @override
  String get onboardingNotifications => 'Rappels de révision';

  @override
  String get onboardingNotificationsHelp => 'Un rappel par jour, jamais entre 22 h et 8 h.';

  @override
  String get onboardingNotificationsEnable => 'Activer les rappels';

  @override
  String get onboardingNotificationsLater => 'Plus tard';

  @override
  String get onboardingDone => 'C\'est parti !';

  @override
  String homeGreeting(String name) => 'Bonjour ${name}';

  @override
  String get homeDueToday => 'À réviser aujourd\'hui';

  @override
  String homeDueCount(int count) {
    if (count == 0) return 'Rien à réviser';
    if (count == 1) return '1 carte';
    return '${count} cartes';
  }

  @override
  String get homeStartStudy => 'Commencer la session';

  @override
  String homeStreak(int count) {
    if (count == 0) return 'Aucune série';
    if (count == 1) return '1 jour de série';
    return '${count} jours de série';
  }

  @override
  String homeXp(int count) => '${count} XP';

  @override
  String homeLevel(int level) => 'Niveau ${level}';

  @override
  String get homeAccuracy => 'Précision';

  @override
  String get homeNothingDue => 'Tout est à jour. Reviens demain !';

  @override
  String get homeQuickActions => 'Raccourcis';

  @override
  String get studyTitle => 'Session d\'étude';

  @override
  String get studyShowAnswer => 'Afficher la réponse';

  @override
  String get studyRatingAgain => 'À revoir';

  @override
  String get studyRatingHard => 'Difficile';

  @override
  String get studyRatingGood => 'Correct';

  @override
  String get studyRatingEasy => 'Facile';

  @override
  String get studyEmpty => 'Rien à réviser pour le moment.';

  @override
  String get studyDone => 'Session terminée';

  @override
  String studyReviewed(int count) => '${count} cartes revues';

  @override
  String get studyDictate => 'Dicter une carte';

  @override
  String get studyHint => 'Indice';

  @override
  String get decksTitle => 'Catalogue de cours';

  @override
  String get decksDownloaded => 'Téléchargé';

  @override
  String get decksDownload => 'Télécharger';

  @override
  String get decksDownloading => 'Téléchargement…';

  @override
  String get decksPremium => 'Premium';

  @override
  String decksCardCount(int count) => '${count} cartes';

  @override
  String get decksEmpty => 'Aucun cours disponible pour l\'instant.';

  @override
  String get decksOfflineReady => 'Disponible hors ligne';

  @override
  String get examsTitle => 'Examens blancs';

  @override
  String get examsStart => 'Commencer l\'examen';

  @override
  String examsQuestionOf(int current, int total) => 'Question ${current} / ${total}';

  @override
  String examsTimeLeft(String time) => 'Temps restant : ${time}';

  @override
  String get examsSubmit => 'Terminer l\'examen';

  @override
  String get examsSubmitConfirm => 'Terminer maintenant ? Les questions sans réponse seront comptées fausses.';

  @override
  String examsScore(String score) => 'Score : ${score} %';

  @override
  String get examsPassed => 'Réussi';

  @override
  String get examsFailed => 'Non atteint';

  @override
  String get examsExpired => 'Le temps est écoulé. L\'examen a été soumis automatiquement.';

  @override
  String get examsEmpty => 'Aucun examen disponible.';

  @override
  String get examsPrediction => 'Score prédit';

  @override
  String get paywallTitle => 'Passe à MedAnki Premium';

  @override
  String get paywallBenefitDecks => 'Tous les cours, hors ligne';

  @override
  String get paywallBenefitExams => 'Examens blancs illimités';

  @override
  String get paywallBenefitAi => 'Tuteur IA et indices adaptatifs';

  @override
  String get paywallCta => 'Payer avec Chargily';

  @override
  String get paywallRestore => 'J\'ai déjà payé';

  @override
  String paywallActiveUntil(String date) => 'Actif jusqu\'au ${date}';

  @override
  String get paywallGrace => 'Ton accès expire bientôt. Renouvelle pour ne rien perdre.';

  @override
  String get paywallGroupPack => 'Pack de groupe';

  @override
  String get paywallJoinGroup => 'Rejoindre avec un code';

  @override
  String get profileTitle => 'Profil';

  @override
  String get profileLanguage => 'Langue';

  @override
  String get profileNotifications => 'Notifications';

  @override
  String get profileDailyGoal => 'Objectif quotidien';

  @override
  String get profileLeaderboardOptIn => 'Apparaître dans le classement';

  @override
  String get profileSync => 'Synchroniser maintenant';

  @override
  String get profileSynced => 'Synchronisé';

  @override
  String get profileLogout => 'Se déconnecter';

  @override
  String get profileLogoutConfirm => 'Se déconnecter ? Les révisions non synchronisées seront envoyées d\'abord.';

  @override
  String profileVersion(String version) => 'Version ${version}';

  @override
  String get profileLegal => 'Mentions légales et confidentialité';

  @override
  String get leaderboardTitle => 'Classement de la semaine';

  @override
  String get leaderboardOptIn => 'Participer au classement';

  @override
  String get leaderboardOptOut => 'Quitter le classement';

  @override
  String leaderboardMyRank(int rank) => 'Mon rang : ${rank}';

  @override
  String get leaderboardEmpty => 'Personne dans le classement pour l\'instant.';

  @override
  String get leaderboardError => 'Impossible de charger le classement.';

  @override
  String get badgesTitle => 'Badges';

  @override
  String get badgesLocked => 'Verrouillé';

  @override
  String get badgesEmpty => 'Aucun badge pour l\'instant. Révise pour en débloquer !';

  @override
  String get shareTitle => 'Partager';

  @override
  String get shareCard => 'Partager cette carte';

  @override
  String get shareProgress => 'Partager ma progression';

  @override
  String get notifPermissionTitle => 'Autoriser les rappels ?';

  @override
  String get notifPermissionBody => 'On t\'envoie un rappel quand des cartes sont dues. Un par jour, pas plus.';

  @override
  String get notifPermissionAllow => 'Autoriser';

  @override
  String get notifPermissionDeny => 'Non merci';

  @override
  String get notifDenied => 'Les notifications sont désactivées. Tu peux les réactiver dans les réglages du téléphone.';

  @override
  String get aiHintLabel => 'Indice personnalisé';

  @override
  String get aiHintDismiss => 'Masquer l\'indice';

  @override
  String get tutorQuotaReached => 'Quota tuteur du jour atteint — réessayez demain.';

  @override
  String get tutorOffline => 'Pas de réseau — le tuteur nécessite une connexion.';

  @override
  String get tutorUnavailable => 'Le tuteur est momentanément indisponible.';

  @override
  String get tutorPlaceholder => 'Assistant de révision : posez une question de cours';

  @override
  String get tutorStopDictation => 'Arrêter la dictée';

  @override
  String get tutorEmergency => 'Urgence détectée';

  @override
  String get tutorListen => 'Écouter (disclaimer inclus)';

  @override
  String get voiceMicUnavailable => 'Micro indisponible — saisissez le texte à la place.';

  @override
  String get voiceTooShort => 'Transcription trop courte (min 3 caractères).';

  @override
  String get voiceQuotaReached => 'Quota vocal du jour atteint — réessayez demain.';

  @override
  String get voiceOffline => 'Pas de réseau : la dictée sera possible dès le retour de la connexion.';

  @override
  String get voiceDraftFailed => 'Échec de la création du brouillon.';

  @override
  String get voiceHelp => 'Parlez naturellement : la carte est formatée automatiquement';

  @override
  String get voiceListening => 'Écoute en cours…';

  @override
  String get voiceTranscriptLabel => 'Transcription (dictée ou saisie manuelle)';

  @override
  String get voiceCreating => 'Création…';

  @override
  String get voiceCreateDraft => 'Créer le brouillon';

  @override
  String get voiceDraftCreated => 'Brouillon créé';

  @override
  String voiceRuleApplied(String rule) => 'Règle appliquée : ${rule}';

  @override
  String get leaderboardPseudonym => 'Pseudonyme (3-20 caractères, alphanumérique)';

  @override
  String get leaderboardPseudonymLength => '3-20 caractères';

  @override
  String get leaderboardPseudonymAlnum => 'Alphanumérique uniquement';

  @override
  String get leaderboardFacultyOptional => 'Faculté (optionnel)';

  @override
  String get leaderboardYearRange => 'Année (1-10)';

  @override
  String get leaderboardOptInFailed => 'Échec de l\'inscription au classement.';

  @override
  String get leaderboardOptOutGdpr => 'Se désinscrire du classement (RGPD)';

  @override
  String get mlPredictionTitle => 'Examen blanc : score estimé';

  @override
  String mlModelWindow(String version, int days) => 'Modèle ${version} · fenêtre ${days} j';

  @override
  String get mlNotEnoughData => 'Pas encore assez de données pour prédire.';

  @override
  String mlBasedOn(int reviews, int accuracy, int streak) => 'Basé sur ${reviews} revues sur 30 j : réussite ${accuracy} %, série ${streak} j.';

  @override
  String get mlAtRisk => 'à risque';

  @override
  String mlTagFocusTitle(int days) => 'Où concentrer l\'effort (${days} j)';

  @override
  String get mlTagRework => 'À retravailler';

  @override
  String get mlTagMastered => 'Maîtrisé — espacez';

  @override
  String mlTagLapses(int lapses, int reviews) => '(${lapses}/${reviews} échecs)';

  @override
  String get studyPrepareFailed => 'Impossible de préparer la session.';

  @override
  String get studyReviewNotSaved => 'Revue non enregistrée (stockage) — réessayez.';

  @override
  String studyDraftCreated(String id) => 'Brouillon créé — ${id}';

  @override
  String get studyNothingLeft => 'Rien à réviser — à plus tard !';

  @override
  String studyAgainCount(int count) => ' · ${count} à revoir bientôt';

  @override
  String studyProgress(int done, int remaining) => '${done} faites · ${remaining} restantes';

  @override
  String get studyFinish => 'Terminer';

  @override
  String get tutorIntro => 'Assistant de révision : posez une question de cours (anatomie, physiologie, biochimie…).';

  @override
  String get tutorMicUnavailable => 'Micro indisponible — saisissez votre question.';

  @override
  String get tutorDictate => 'Dicter';

  @override
  String get tutorTitle => 'Tuteur IA';

  @override
  String get voiceTitle => 'Dicter une carte';

  @override
  String get voiceHelpFull => 'Parlez naturellement : la carte est formatée automatiquement et relue avant publication.';

  @override
  String get voiceDictate => 'Dicter';

  @override
  String get voiceFront => 'Recto';

  @override
  String get voiceBack => 'Verso';

  @override
  String voiceRuleAndQuota(String rule, int quota) => 'Règle appliquée : ${rule} · quota restant : ${quota}';

  @override
  String get actionConfirm => 'Confirmer';

}

class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'ميدأنكي الجزائر';

  @override
  String get actionRetry => 'إعادة المحاولة';

  @override
  String get actionCancel => 'إلغاء';

  @override
  String get actionContinue => 'متابعة';

  @override
  String get actionSave => 'حفظ';

  @override
  String get actionClose => 'إغلاق';

  @override
  String get actionRefresh => 'تحديث';

  @override
  String get actionSkip => 'تخطي';

  @override
  String get actionNext => 'التالي';

  @override
  String get actionBack => 'رجوع';

  @override
  String get errorGeneric => 'حدث خطأ.';

  @override
  String get errorOffline => 'لا يوجد اتصال. الوضع دون اتصال متاح.';

  @override
  String get loading => 'جارٍ التحميل…';

  @override
  String get navHome => 'الرئيسية';

  @override
  String get navStudy => 'المراجعة';

  @override
  String get navDecks => 'الدروس';

  @override
  String get navExams => 'الامتحانات';

  @override
  String get navProfile => 'الملف الشخصي';

  @override
  String get authWelcomeTitle => 'راجع أفضل، احفظ أكثر';

  @override
  String get authWelcomeSubtitle => 'المراجعة المتباعدة لطلبة الطب في الجزائر.';

  @override
  String get authLogin => 'تسجيل الدخول';

  @override
  String get authSignup => 'إنشاء حساب';

  @override
  String get authEmail => 'البريد الإلكتروني';

  @override
  String get authEmailInvalid => 'بريد إلكتروني غير صالح.';

  @override
  String get authMagicLink => 'استلام رابط الدخول';

  @override
  String get authMagicLinkSent => 'تم إرسال الرابط. تحقق من بريدك.';

  @override
  String get authGoogle => 'المتابعة مع جوجل';

  @override
  String get authDisplayName => 'الاسم المعروض';

  @override
  String get authFaculty => 'الكلية';

  @override
  String get authStudyYear => 'سنة الدراسة';

  @override
  String get authFacultyRequired => 'اختر كليتك.';

  @override
  String get authHaveAccount => 'لدي حساب بالفعل';

  @override
  String get authNoAccount => 'ليس لدي حساب بعد';

  @override
  String get onboardingLanguage => 'لغة التطبيق';

  @override
  String get onboardingLanguageHelp => 'يمكنك تغييرها في أي وقت من الملف الشخصي.';

  @override
  String get onboardingGoal => 'الهدف اليومي';

  @override
  String onboardingGoalCards(int count) => '${count} بطاقة في اليوم';

  @override
  String get onboardingGoalHelp => 'هدف واقعي أفضل من هدف طموح متروك.';

  @override
  String get onboardingNotifications => 'تذكيرات المراجعة';

  @override
  String get onboardingNotificationsHelp => 'تذكير واحد يوميًا، ولا شيء بين 22:00 و08:00.';

  @override
  String get onboardingNotificationsEnable => 'تفعيل التذكيرات';

  @override
  String get onboardingNotificationsLater => 'لاحقًا';

  @override
  String get onboardingDone => 'لنبدأ!';

  @override
  String homeGreeting(String name) => 'مرحبًا ${name}';

  @override
  String get homeDueToday => 'للمراجعة اليوم';

  @override
  String homeDueCount(int count) {
    if (count == 0) return 'لا شيء للمراجعة';
    if (count == 1) return 'بطاقة واحدة';
    return '${count} بطاقة';
  }

  @override
  String get homeStartStudy => 'بدء الجلسة';

  @override
  String homeStreak(int count) {
    if (count == 0) return 'لا سلسلة';
    if (count == 1) return 'يوم واحد متتالٍ';
    return '${count} أيام متتالية';
  }

  @override
  String homeXp(int count) => '${count} نقطة';

  @override
  String homeLevel(int level) => 'المستوى ${level}';

  @override
  String get homeAccuracy => 'الدقة';

  @override
  String get homeNothingDue => 'كل شيء محدَّث. عد غدًا!';

  @override
  String get homeQuickActions => 'اختصارات';

  @override
  String get studyTitle => 'جلسة المراجعة';

  @override
  String get studyShowAnswer => 'إظهار الإجابة';

  @override
  String get studyRatingAgain => 'إعادة';

  @override
  String get studyRatingHard => 'صعبة';

  @override
  String get studyRatingGood => 'جيدة';

  @override
  String get studyRatingEasy => 'سهلة';

  @override
  String get studyEmpty => 'لا شيء للمراجعة حاليًا.';

  @override
  String get studyDone => 'انتهت الجلسة';

  @override
  String studyReviewed(int count) => '${count} بطاقة تمت مراجعتها';

  @override
  String get studyDictate => 'إملاء بطاقة';

  @override
  String get studyHint => 'تلميح';

  @override
  String get decksTitle => 'فهرس الدروس';

  @override
  String get decksDownloaded => 'تم التحميل';

  @override
  String get decksDownload => 'تحميل';

  @override
  String get decksDownloading => 'جارٍ التحميل…';

  @override
  String get decksPremium => 'مدفوع';

  @override
  String decksCardCount(int count) => '${count} بطاقة';

  @override
  String get decksEmpty => 'لا توجد دروس متاحة حاليًا.';

  @override
  String get decksOfflineReady => 'متاح دون اتصال';

  @override
  String get examsTitle => 'امتحانات تجريبية';

  @override
  String get examsStart => 'بدء الامتحان';

  @override
  String examsQuestionOf(int current, int total) => 'السؤال ${current} / ${total}';

  @override
  String examsTimeLeft(String time) => 'الوقت المتبقي: ${time}';

  @override
  String get examsSubmit => 'إنهاء الامتحان';

  @override
  String get examsSubmitConfirm => 'إنهاء الآن؟ ستُحتسب الأسئلة غير المجابة خاطئة.';

  @override
  String examsScore(String score) => 'النتيجة: ${score}%';

  @override
  String get examsPassed => 'ناجح';

  @override
  String get examsFailed => 'لم يتحقق';

  @override
  String get examsExpired => 'انتهى الوقت. تم إرسال الامتحان تلقائيًا.';

  @override
  String get examsEmpty => 'لا يوجد امتحان متاح.';

  @override
  String get examsPrediction => 'النتيجة المتوقعة';

  @override
  String get paywallTitle => 'انتقل إلى النسخة المدفوعة';

  @override
  String get paywallBenefitDecks => 'كل الدروس، دون اتصال';

  @override
  String get paywallBenefitExams => 'امتحانات تجريبية غير محدودة';

  @override
  String get paywallBenefitAi => 'معلم ذكي وتلميحات تكيفية';

  @override
  String get paywallCta => 'الدفع عبر Chargily';

  @override
  String get paywallRestore => 'لقد دفعت بالفعل';

  @override
  String paywallActiveUntil(String date) => 'نشط حتى ${date}';

  @override
  String get paywallGrace => 'سينتهي وصولك قريبًا. جدّد لتحتفظ بكل شيء.';

  @override
  String get paywallGroupPack => 'باقة جماعية';

  @override
  String get paywallJoinGroup => 'الانضمام برمز';

  @override
  String get profileTitle => 'الملف الشخصي';

  @override
  String get profileLanguage => 'اللغة';

  @override
  String get profileNotifications => 'الإشعارات';

  @override
  String get profileDailyGoal => 'الهدف اليومي';

  @override
  String get profileLeaderboardOptIn => 'الظهور في الترتيب';

  @override
  String get profileSync => 'المزامنة الآن';

  @override
  String get profileSynced => 'تمت المزامنة';

  @override
  String get profileLogout => 'تسجيل الخروج';

  @override
  String get profileLogoutConfirm => 'تسجيل الخروج؟ سترسل المراجعات غير المتزامنة أولاً.';

  @override
  String profileVersion(String version) => 'الإصدار ${version}';

  @override
  String get profileLegal => 'الإشعارات القانونية والخصوصية';

  @override
  String get leaderboardTitle => 'ترتيب الأسبوع';

  @override
  String get leaderboardOptIn => 'المشاركة في الترتيب';

  @override
  String get leaderboardOptOut => 'مغادرة الترتيب';

  @override
  String leaderboardMyRank(int rank) => 'ترتيبي: ${rank}';

  @override
  String get leaderboardEmpty => 'لا أحد في الترتيب حاليًا.';

  @override
  String get leaderboardError => 'تعذر تحميل الترتيب.';

  @override
  String get badgesTitle => 'الأوسمة';

  @override
  String get badgesLocked => 'مقفل';

  @override
  String get badgesEmpty => 'لا أوسمة بعد. راجع لفتحها!';

  @override
  String get shareTitle => 'مشاركة';

  @override
  String get shareCard => 'مشاركة هذه البطاقة';

  @override
  String get shareProgress => 'مشاركة تقدمي';

  @override
  String get notifPermissionTitle => 'السماح بالتذكيرات؟';

  @override
  String get notifPermissionBody => 'نرسل تذكيرًا عندما تحين بطاقات. مرة واحدة يوميًا فقط.';

  @override
  String get notifPermissionAllow => 'السماح';

  @override
  String get notifPermissionDeny => 'لا شكرًا';

  @override
  String get notifDenied => 'الإشعارات معطلة. يمكنك تفعيلها من إعدادات الهاتف.';

  @override
  String get aiHintLabel => 'تلميح مخصص';

  @override
  String get aiHintDismiss => 'إخفاء التلميح';

  @override
  String get tutorQuotaReached => 'بلغت حصة المعلم اليومية — أعد المحاولة غدًا.';

  @override
  String get tutorOffline => 'لا يوجد اتصال — يحتاج المعلم إلى الإنترنت.';

  @override
  String get tutorUnavailable => 'المعلم غير متاح مؤقتًا.';

  @override
  String get tutorPlaceholder => 'مساعد المراجعة: اطرح سؤالًا من الدرس';

  @override
  String get tutorStopDictation => 'إيقاف الإملاء';

  @override
  String get tutorEmergency => 'تم رصد حالة طارئة';

  @override
  String get tutorListen => 'استماع (يشمل التنبيه)';

  @override
  String get voiceMicUnavailable => 'الميكروفون غير متاح — اكتب النص بدلاً من ذلك.';

  @override
  String get voiceTooShort => 'النص قصير جدًا (3 أحرف على الأقل).';

  @override
  String get voiceQuotaReached => 'بلغت الحصة الصوتية اليومية — أعد المحاولة غدًا.';

  @override
  String get voiceOffline => 'لا يوجد اتصال: سيتاح الإملاء عند عودة الشبكة.';

  @override
  String get voiceDraftFailed => 'تعذر إنشاء المسودة.';

  @override
  String get voiceHelp => 'تحدث بشكل طبيعي: تُنسَّق البطاقة تلقائيًا';

  @override
  String get voiceListening => 'جارٍ الاستماع…';

  @override
  String get voiceTranscriptLabel => 'النص (إملاء أو كتابة يدوية)';

  @override
  String get voiceCreating => 'جارٍ الإنشاء…';

  @override
  String get voiceCreateDraft => 'إنشاء المسودة';

  @override
  String get voiceDraftCreated => 'تم إنشاء المسودة';

  @override
  String voiceRuleApplied(String rule) => 'القاعدة المطبقة: ${rule}';

  @override
  String get leaderboardPseudonym => 'الاسم المستعار (3-20 حرفًا، أحرف وأرقام)';

  @override
  String get leaderboardPseudonymLength => '3-20 حرفًا';

  @override
  String get leaderboardPseudonymAlnum => 'أحرف وأرقام فقط';

  @override
  String get leaderboardFacultyOptional => 'الكلية (اختياري)';

  @override
  String get leaderboardYearRange => 'السنة (1-10)';

  @override
  String get leaderboardOptInFailed => 'تعذر الانضمام إلى الترتيب.';

  @override
  String get leaderboardOptOutGdpr => 'الانسحاب من الترتيب (RGPD)';

  @override
  String get mlPredictionTitle => 'الامتحان التجريبي: النتيجة المتوقعة';

  @override
  String mlModelWindow(String version, int days) => 'النموذج ${version} · نافذة ${days} يومًا';

  @override
  String get mlNotEnoughData => 'لا توجد بيانات كافية للتنبؤ بعد.';

  @override
  String mlBasedOn(int reviews, int accuracy, int streak) => 'استنادًا إلى ${reviews} مراجعة خلال 30 يومًا: نجاح ${accuracy}%، سلسلة ${streak} يومًا.';

  @override
  String get mlAtRisk => 'في خطر';

  @override
  String mlTagFocusTitle(int days) => 'أين تركّز جهدك (${days} يومًا)';

  @override
  String get mlTagRework => 'بحاجة إلى مراجعة';

  @override
  String get mlTagMastered => 'متقَن — باعد المراجعات';

  @override
  String mlTagLapses(int lapses, int reviews) => '(${lapses}/${reviews} إخفاقات)';

  @override
  String get studyPrepareFailed => 'تعذر تحضير الجلسة.';

  @override
  String get studyReviewNotSaved => 'لم تُحفظ المراجعة (التخزين) — أعد المحاولة.';

  @override
  String studyDraftCreated(String id) => 'تم إنشاء المسودة — ${id}';

  @override
  String get studyNothingLeft => 'لا شيء للمراجعة — إلى اللقاء!';

  @override
  String studyAgainCount(int count) => ' · ${count} للمراجعة قريبًا';

  @override
  String studyProgress(int done, int remaining) => '${done} تمت · ${remaining} متبقية';

  @override
  String get studyFinish => 'إنهاء';

  @override
  String get tutorIntro => 'مساعد المراجعة: اطرح سؤالًا من الدرس (تشريح، فيزيولوجيا، كيمياء حيوية…).';

  @override
  String get tutorMicUnavailable => 'الميكروفون غير متاح — اكتب سؤالك.';

  @override
  String get tutorDictate => 'إملاء';

  @override
  String get tutorTitle => 'المعلّم الذكي';

  @override
  String get voiceTitle => 'إملاء بطاقة';

  @override
  String get voiceHelpFull => 'تحدث بشكل طبيعي: تُنسَّق البطاقة تلقائيًا وتُراجَع قبل النشر.';

  @override
  String get voiceDictate => 'إملاء';

  @override
  String get voiceFront => 'الوجه';

  @override
  String get voiceBack => 'الظهر';

  @override
  String voiceRuleAndQuota(String rule, int quota) => 'القاعدة المطبقة: ${rule} · الحصة المتبقية: ${quota}';

  @override
  String get actionConfirm => 'تأكيد';

}

class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'MedAnki DZ';

  @override
  String get actionRetry => 'Retry';

  @override
  String get actionCancel => 'Cancel';

  @override
  String get actionContinue => 'Continue';

  @override
  String get actionSave => 'Save';

  @override
  String get actionClose => 'Close';

  @override
  String get actionRefresh => 'Refresh';

  @override
  String get actionSkip => 'Skip';

  @override
  String get actionNext => 'Next';

  @override
  String get actionBack => 'Back';

  @override
  String get errorGeneric => 'Something went wrong.';

  @override
  String get errorOffline => 'No connection. Offline mode is still available.';

  @override
  String get loading => 'Loading…';

  @override
  String get navHome => 'Home';

  @override
  String get navStudy => 'Study';

  @override
  String get navDecks => 'Decks';

  @override
  String get navExams => 'Exams';

  @override
  String get navProfile => 'Profile';

  @override
  String get authWelcomeTitle => 'Study smarter, remember more';

  @override
  String get authWelcomeSubtitle => 'Spaced repetition for medical students in Algeria.';

  @override
  String get authLogin => 'Log in';

  @override
  String get authSignup => 'Sign up';

  @override
  String get authEmail => 'Email address';

  @override
  String get authEmailInvalid => 'Invalid email address.';

  @override
  String get authMagicLink => 'Send me a magic link';

  @override
  String get authMagicLinkSent => 'Link sent. Check your inbox.';

  @override
  String get authGoogle => 'Continue with Google';

  @override
  String get authDisplayName => 'Display name';

  @override
  String get authFaculty => 'Faculty';

  @override
  String get authStudyYear => 'Study year';

  @override
  String get authFacultyRequired => 'Pick your faculty.';

  @override
  String get authHaveAccount => 'I already have an account';

  @override
  String get authNoAccount => 'I don\'t have an account yet';

  @override
  String get onboardingLanguage => 'App language';

  @override
  String get onboardingLanguageHelp => 'You can change it anytime in your profile.';

  @override
  String get onboardingGoal => 'Daily goal';

  @override
  String onboardingGoalCards(int count) => '${count} cards per day';

  @override
  String get onboardingGoalHelp => 'A goal you keep beats an ambitious one you drop.';

  @override
  String get onboardingNotifications => 'Study reminders';

  @override
  String get onboardingNotificationsHelp => 'One reminder a day, never between 10pm and 8am.';

  @override
  String get onboardingNotificationsEnable => 'Enable reminders';

  @override
  String get onboardingNotificationsLater => 'Later';

  @override
  String get onboardingDone => 'Let\'s go!';

  @override
  String homeGreeting(String name) => 'Hello ${name}';

  @override
  String get homeDueToday => 'Due today';

  @override
  String homeDueCount(int count) {
    if (count == 0) return 'Nothing due';
    if (count == 1) return '1 card';
    return '${count} cards';
  }

  @override
  String get homeStartStudy => 'Start studying';

  @override
  String homeStreak(int count) {
    if (count == 0) return 'No streak';
    if (count == 1) return '1 day streak';
    return '${count} day streak';
  }

  @override
  String homeXp(int count) => '${count} XP';

  @override
  String homeLevel(int level) => 'Level ${level}';

  @override
  String get homeAccuracy => 'Accuracy';

  @override
  String get homeNothingDue => 'All caught up. Come back tomorrow!';

  @override
  String get homeQuickActions => 'Quick actions';

  @override
  String get studyTitle => 'Study session';

  @override
  String get studyShowAnswer => 'Show answer';

  @override
  String get studyRatingAgain => 'Again';

  @override
  String get studyRatingHard => 'Hard';

  @override
  String get studyRatingGood => 'Good';

  @override
  String get studyRatingEasy => 'Easy';

  @override
  String get studyEmpty => 'Nothing to review right now.';

  @override
  String get studyDone => 'Session complete';

  @override
  String studyReviewed(int count) => '${count} cards reviewed';

  @override
  String get studyDictate => 'Dictate a card';

  @override
  String get studyHint => 'Hint';

  @override
  String get decksTitle => 'Deck catalogue';

  @override
  String get decksDownloaded => 'Downloaded';

  @override
  String get decksDownload => 'Download';

  @override
  String get decksDownloading => 'Downloading…';

  @override
  String get decksPremium => 'Premium';

  @override
  String decksCardCount(int count) => '${count} cards';

  @override
  String get decksEmpty => 'No decks available yet.';

  @override
  String get decksOfflineReady => 'Available offline';

  @override
  String get examsTitle => 'Mock exams';

  @override
  String get examsStart => 'Start exam';

  @override
  String examsQuestionOf(int current, int total) => 'Question ${current} of ${total}';

  @override
  String examsTimeLeft(String time) => 'Time left: ${time}';

  @override
  String get examsSubmit => 'Submit exam';

  @override
  String get examsSubmitConfirm => 'Submit now? Unanswered questions count as wrong.';

  @override
  String examsScore(String score) => 'Score: ${score}%';

  @override
  String get examsPassed => 'Passed';

  @override
  String get examsFailed => 'Not reached';

  @override
  String get examsExpired => 'Time is up. The exam was submitted automatically.';

  @override
  String get examsEmpty => 'No exam available.';

  @override
  String get examsPrediction => 'Predicted score';

  @override
  String get paywallTitle => 'Go Premium';

  @override
  String get paywallBenefitDecks => 'Every deck, offline';

  @override
  String get paywallBenefitExams => 'Unlimited mock exams';

  @override
  String get paywallBenefitAi => 'AI tutor and adaptive hints';

  @override
  String get paywallCta => 'Pay with Chargily';

  @override
  String get paywallRestore => 'I already paid';

  @override
  String paywallActiveUntil(String date) => 'Active until ${date}';

  @override
  String get paywallGrace => 'Your access expires soon. Renew to keep everything.';

  @override
  String get paywallGroupPack => 'Group pack';

  @override
  String get paywallJoinGroup => 'Join with a code';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileLanguage => 'Language';

  @override
  String get profileNotifications => 'Notifications';

  @override
  String get profileDailyGoal => 'Daily goal';

  @override
  String get profileLeaderboardOptIn => 'Show me in the leaderboard';

  @override
  String get profileSync => 'Sync now';

  @override
  String get profileSynced => 'Synced';

  @override
  String get profileLogout => 'Log out';

  @override
  String get profileLogoutConfirm => 'Log out? Unsynced reviews will be sent first.';

  @override
  String profileVersion(String version) => 'Version ${version}';

  @override
  String get profileLegal => 'Legal and privacy';

  @override
  String get leaderboardTitle => 'Weekly leaderboard';

  @override
  String get leaderboardOptIn => 'Join the leaderboard';

  @override
  String get leaderboardOptOut => 'Leave the leaderboard';

  @override
  String leaderboardMyRank(int rank) => 'My rank: ${rank}';

  @override
  String get leaderboardEmpty => 'Nobody on the board yet.';

  @override
  String get leaderboardError => 'Couldn\'t load the leaderboard.';

  @override
  String get badgesTitle => 'Badges';

  @override
  String get badgesLocked => 'Locked';

  @override
  String get badgesEmpty => 'No badges yet. Study to unlock some!';

  @override
  String get shareTitle => 'Share';

  @override
  String get shareCard => 'Share this card';

  @override
  String get shareProgress => 'Share my progress';

  @override
  String get notifPermissionTitle => 'Allow reminders?';

  @override
  String get notifPermissionBody => 'We ping you when cards are due. Once a day, no more.';

  @override
  String get notifPermissionAllow => 'Allow';

  @override
  String get notifPermissionDeny => 'No thanks';

  @override
  String get notifDenied => 'Notifications are off. You can re-enable them in your phone settings.';

  @override
  String get aiHintLabel => 'Personalised hint';

  @override
  String get aiHintDismiss => 'Hide hint';

  @override
  String get tutorQuotaReached => 'Daily tutor quota reached — try again tomorrow.';

  @override
  String get tutorOffline => 'No connection — the tutor needs to be online.';

  @override
  String get tutorUnavailable => 'The tutor is temporarily unavailable.';

  @override
  String get tutorPlaceholder => 'Study assistant: ask a course question';

  @override
  String get tutorStopDictation => 'Stop dictation';

  @override
  String get tutorEmergency => 'Emergency detected';

  @override
  String get tutorListen => 'Listen (disclaimer included)';

  @override
  String get voiceMicUnavailable => 'Microphone unavailable — type the text instead.';

  @override
  String get voiceTooShort => 'Transcript too short (3 characters minimum).';

  @override
  String get voiceQuotaReached => 'Daily voice quota reached — try again tomorrow.';

  @override
  String get voiceOffline => 'No connection: dictation will work once you\'re back online.';

  @override
  String get voiceDraftFailed => 'Couldn\'t create the draft.';

  @override
  String get voiceHelp => 'Speak naturally: the card is formatted automatically';

  @override
  String get voiceListening => 'Listening…';

  @override
  String get voiceTranscriptLabel => 'Transcript (dictated or typed)';

  @override
  String get voiceCreating => 'Creating…';

  @override
  String get voiceCreateDraft => 'Create draft';

  @override
  String get voiceDraftCreated => 'Draft created';

  @override
  String voiceRuleApplied(String rule) => 'Rule applied: ${rule}';

  @override
  String get leaderboardPseudonym => 'Nickname (3-20 characters, alphanumeric)';

  @override
  String get leaderboardPseudonymLength => '3-20 characters';

  @override
  String get leaderboardPseudonymAlnum => 'Alphanumeric only';

  @override
  String get leaderboardFacultyOptional => 'Faculty (optional)';

  @override
  String get leaderboardYearRange => 'Year (1-10)';

  @override
  String get leaderboardOptInFailed => 'Couldn\'t join the leaderboard.';

  @override
  String get leaderboardOptOutGdpr => 'Leave the leaderboard (GDPR)';

  @override
  String get mlPredictionTitle => 'Mock exam: estimated score';

  @override
  String mlModelWindow(String version, int days) => 'Model ${version} · ${days}-day window';

  @override
  String get mlNotEnoughData => 'Not enough data to predict yet.';

  @override
  String mlBasedOn(int reviews, int accuracy, int streak) => 'Based on ${reviews} reviews over 30 days: ${accuracy}% accuracy, ${streak}-day streak.';

  @override
  String get mlAtRisk => 'at risk';

  @override
  String mlTagFocusTitle(int days) => 'Where to focus (${days} days)';

  @override
  String get mlTagRework => 'Needs work';

  @override
  String get mlTagMastered => 'Mastered — space it out';

  @override
  String mlTagLapses(int lapses, int reviews) => '(${lapses}/${reviews} lapses)';

  @override
  String get studyPrepareFailed => 'Couldn\'t prepare the session.';

  @override
  String get studyReviewNotSaved => 'Review not saved (storage) — try again.';

  @override
  String studyDraftCreated(String id) => 'Draft created — ${id}';

  @override
  String get studyNothingLeft => 'Nothing left to review — see you later!';

  @override
  String studyAgainCount(int count) => ' · ${count} to see again soon';

  @override
  String studyProgress(int done, int remaining) => '${done} done · ${remaining} left';

  @override
  String get studyFinish => 'Finish';

  @override
  String get tutorIntro => 'Study assistant: ask a course question (anatomy, physiology, biochemistry…).';

  @override
  String get tutorMicUnavailable => 'Microphone unavailable — type your question.';

  @override
  String get tutorDictate => 'Dictate';

  @override
  String get tutorTitle => 'AI tutor';

  @override
  String get voiceTitle => 'Dictate a card';

  @override
  String get voiceHelpFull => 'Speak naturally: the card is formatted automatically and reviewed before publishing.';

  @override
  String get voiceDictate => 'Dictate';

  @override
  String get voiceFront => 'Front';

  @override
  String get voiceBack => 'Back';

  @override
  String voiceRuleAndQuota(String rule, int quota) => 'Rule applied: ${rule} · quota left: ${quota}';

  @override
  String get actionConfirm => 'Confirm';

}
