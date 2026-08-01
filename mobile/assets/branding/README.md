# Visuels de marque

| Fichier | Usage | Contrainte |
|---|---|---|
| `app_icon.png` | icône de lancement (`flutter_launcher_icons`) | 1024×1024, sans transparence pour iOS |
| `app_icon_foreground.png` | calque avant de l'icône adaptative Android | 1024×1024, sujet dans les 66 % centraux |
| `splash.png` | écran de démarrage natif (`flutter_native_splash`) | 512×512, fond transparent ou #0F766E |

> **Placeholders.** Ces trois fichiers sont des visuels provisoires
> posés pour lever l'item **P2-8** de l'audit (« icônes/splash par
> défaut »). Ils permettent à `flutter_launcher_icons` et
> `flutter_native_splash` de tourner et à la CI de produire un APK
> présentable, mais ils doivent être remplacés par les visuels
> définitifs avant la première publication sur les stores.

Régénérer les déclinaisons après remplacement :

```bash
cd mobile
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

La palette est celle du thème : teal `#0F766E` (cf. `lib/app/theme.dart`).
