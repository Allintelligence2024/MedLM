/* MedAnki DZ — landing page (Phase 19.7).
   i18n client léger : dictionnaire dans i18n.json servi à côté de la page.
   - aucun tracker, aucun service tiers, aucun cookie ;
   - FR par défaut, AR = RTL, choix persisté en localStorage ;
   - le formulaire de notification est une intention (stores non ouverts,
     Phase 19.8) : le mail est composé en local, rien ne part en tiers. */
(function () {
  "use strict";

  var SUPPORTED = ["fr", "ar", "en"];
  var RTL_LANGS = { ar: true };
  var dict = null;

  function currentLang() {
    var saved = null;
    try {
      saved = window.localStorage.getItem("medanki_lang");
    } catch (_) {
      /* mode privé : pas de persistance, fr par défaut */
    }
    if (SUPPORTED.indexOf(saved) !== -1) return saved;
    var nav = (navigator.language || "fr").slice(0, 2);
    return SUPPORTED.indexOf(nav) !== -1 ? nav : "fr";
  }

  function t(key, lang) {
    var entry = dict[key];
    if (!entry) return key;
    return entry[lang] || entry.fr || key;
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS[lang] ? "rtl" : "ltr";
    document.title = t("meta.title", lang);
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("meta.description", lang));

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"), lang);
    });
    document
      .querySelectorAll("[data-i18n-placeholder]")
      .forEach(function (el) {
        el.setAttribute(
          "placeholder",
          t(el.getAttribute("data-i18n-placeholder"), lang),
        );
      });
    document.querySelectorAll(".lang-switch button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === lang);
    });
    try {
      window.localStorage.setItem("medanki_lang", lang);
    } catch (_) {
      /* silencieux */
    }
  }

  function initLanguageSwitch() {
    document.querySelectorAll(".lang-switch button").forEach(function (b) {
      b.addEventListener("click", function () {
        applyLang(b.getAttribute("data-lang"));
      });
    });
  }

  function initNotifyForm() {
    var form = document.getElementById("notify-form");
    var feedback = document.getElementById("notify-feedback");
    if (!form) return;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = (document.getElementById("email").value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        feedback.textContent = "✕ " + emailInvalid(currentLang());
        return;
      }
      // Intention de lancement : les stores ne sont pas encore ouverts
      // (Phase 19.8) — on accuse réception localement. Point de branchement
      // futur : POST /v1/marketing/notify-list (double opt-in, CNIL/18-07).
      feedback.textContent = "✓ " + notifyOk(currentLang());
      form.reset();
    });
  }

  function emailInvalid(lang) {
    return {
      fr: "Adresse email invalide.",
      ar: "عنوان بريد إلكتروني غير صالح.",
      en: "Invalid email address.",
    }[lang];
  }

  function notifyOk(lang) {
    return {
      fr: "C'est noté — un seul email au lancement.",
      ar: "تم التسجيل — رسالة واحدة عند الإطلاق.",
      en: "Noted — one email at launch.",
    }[lang];
  }

  fetch("i18n.json")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      dict = data;
      initLanguageSwitch();
      initNotifyForm();
      applyLang(currentLang());
    })
    .catch(function () {
      // Le HTML est déjà peuplé en FR côté contenu : sans dictionnaire,
      // la page reste lisible (dégradation gracieuse).
    });
})();
