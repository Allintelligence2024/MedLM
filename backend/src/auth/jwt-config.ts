/// Configuration de signature JWT — logique pure, testable.
///
/// FAILLE CORRIGÉE (trouvée le 2026-08-01 en démarrant le binaire réel)
/// ---------------------------------------------------------------------
/// `auth.module.ts` retombait silencieusement sur un secret HS256 écrit
/// en clair dans le code source dès que `JWT_SIGNING_KEY_PATH` était
/// absent — y compris avec `NODE_ENV=production`.
///
/// Ce n'était pas théorique : démarré sans la variable, le serveur
/// acceptait un jeton forgé à la main avec ce secret, `role: admin`
/// compris, et répondait 200 sur les endpoints protégés. Le secret étant
/// dans un dépôt, n'importe qui pouvait usurper n'importe quel compte.
///
/// Trois conséquences aggravantes :
///   * le repli est SILENCIEUX — rien dans les logs ne distingue un
///     démarrage sécurisé d'un démarrage vulnérable ;
///   * HS256 est symétrique : il rend impossible la vérification
///     hors-ligne du JWT d'entitlement, qui suppose RS256 (v2 §8.1) ;
///   * la variable est facile à oublier, précisément parce que rien
///     n'échoue quand elle manque.
///
/// Règle retenue : en production, l'absence de clé RS256 est une erreur
/// de démarrage. En développement et en test, le repli HS256 reste
/// disponible — mais bruyant, et avec un secret aléatoire par processus
/// plutôt qu'une constante partagée par tous les déploiements.
import { randomBytes } from 'node:crypto';

export interface JwtSigningConfig {
  privateKey?: string;
  secret?: string;
  signOptions: { expiresIn: number; algorithm: 'RS256' | 'HS256' };
  /// Renseigné quand on a dû se replier : le module l'utilise pour
  /// journaliser un avertissement visible.
  fallbackReason?: string;
}

export class InsecureJwtConfigError extends Error {
  constructor(reason: string) {
    super(
      `Configuration JWT non sécurisée en production : ${reason}. ` +
        'Définir JWT_SIGNING_KEY_PATH (clé privée RS256, ' +
        '`openssl genrsa -out keys/jwt-private.pem 2048`). ' +
        'Refus de démarrer — un repli HS256 avec un secret du dépôt ' +
        "permettrait de forger n'importe quel jeton, rôle admin compris.",
    );
    this.name = 'InsecureJwtConfigError';
  }
}

/// Construit la configuration de signature.
///
/// @param readKey lecteur de fichier injecté (testable sans I/O).
export function buildJwtConfig(args: {
  keyPath: string | undefined;
  ttlSeconds: number;
  nodeEnv: string | undefined;
  readKey: (path: string) => string;
}): JwtSigningConfig {
  const { keyPath, ttlSeconds, nodeEnv, readKey } = args;
  const isProduction = (nodeEnv ?? '').toLowerCase() === 'production';

  if (keyPath) {
    let key: string;
    try {
      key = readKey(keyPath);
    } catch (e) {
      // Une clé déclarée mais illisible est TOUJOURS une erreur : se
      // replier ici transformerait une faute de chemin en faille.
      throw new InsecureJwtConfigError(
        `clé illisible « ${keyPath} » (${(e as Error).message})`,
      );
    }
    if (!key.includes('PRIVATE KEY')) {
      throw new InsecureJwtConfigError(
        `« ${keyPath} » ne contient pas de clé privée PEM`,
      );
    }
    return {
      privateKey: key,
      signOptions: { expiresIn: ttlSeconds, algorithm: 'RS256' },
    };
  }

  if (isProduction) {
    throw new InsecureJwtConfigError('JWT_SIGNING_KEY_PATH absente');
  }

  // Dev / test : secret ALÉATOIRE par processus. Une constante en dur
  // serait partagée par tous les déploiements qui oublient la variable
  // — c'est précisément ce qui a créé la faille. Un secret aléatoire
  // invalide les jetons au redémarrage : gênant en dev, inoffensif.
  return {
    secret: randomBytes(32).toString('hex'),
    signOptions: { expiresIn: ttlSeconds, algorithm: 'HS256' },
    fallbackReason:
      'JWT_SIGNING_KEY_PATH absente — repli HS256 avec un secret ALÉATOIRE ' +
      'par processus. Les jetons ne survivent pas à un redémarrage et la ' +
      "vérification hors-ligne de l'entitlement (RS256) est indisponible.",
  };
}
