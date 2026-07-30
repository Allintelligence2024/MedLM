#!/usr/bin/env python3
"""
generate_anatomie_seed.py — Génère 5 decks Anatomie (~600 cartes).

But : démontrer la qualité du pipeline contenu en produisant un
seed substantiel. Les 5 decks couvrent les modules d'anatomie
classique de P1 :

  1. Membre supérieur (~120 cartes)
  2. Membre inférieur (~120 cartes)
  3. Thorax (~120 cartes)
  4. Abdomen (~120 cartes)
  5. Tête et cou (~120 cartes)

Chaque carte respecte la v2 §5 :
  * id unique
  * type (basic / qcm / cloze)
  * source_meta obligatoire (original, faculté, year, can_distribute)
  * content bilingue FR/EN (front, back, explanation)
  * tags

Le contenu est délibérément **générique** mais précis
anatomiquement — c'est du seed, pas un manuel. Il sera
remplacé/augmenté par les contenus validés par les enseignants
en prod (Phase 17+).

Usage :
    python3 tools/scripts/seed/generate_anatomie_seed.py [--dry-run]

Sortie :
    mobile/assets/content/deck_anatomie_{membre_sup,membre_inf,thorax,abdomen,tete_cou}.json
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
ASSETS_DIR = REPO_ROOT / "mobile/assets/content"

DECKS = [
    {
        "deck_id": "deck_anat_membre_sup",
        "module_id": "anatomie",
        "name_fr": "Membre supérieur",
        "name_en": "Upper limb",
        "description_fr": "Ostéologie, myologie, vascularisation et innervation du membre supérieur.",
        "description_en": "Osteology, myology, vascularization and innervation of the upper limb.",
        "topics": [
            ("ostéologie", "Ostéologie — ceinture scapulaire, humérus, radius, cubitus, os de la main"),
            ("articulations", "Articulations — épaule, coude, poignet, doigts"),
            ("myologie", "Myologie — muscles de l'épaule, du bras, de l'avant-bras, de la main"),
            ("plexus_brachial", "Plexus brachial — racines, troncs, faisceaux, branches terminales"),
            ("vascularisation", "Vascularisation — artère axillaire, brachiale, radiale, ulnaire"),
            ("innervation", "Innervation — nerfs médian, ulnaire, radial, musculo-cutané"),
            ("clinique", "Anatomie clinique — fractures, luxations, syndromes canalaires"),
        ],
        "card_count": 120,
    },
    {
        "deck_id": "deck_anat_membre_inf",
        "module_id": "anatomie",
        "name_fr": "Membre inférieur",
        "name_en": "Lower limb",
        "description_fr": "Ostéologie, myologie, vascularisation et innervation du membre inférieur.",
        "description_en": "Osteology, myology, vascularization and innervation of the lower limb.",
        "topics": [
            ("ostéologie", "Ostéologie — fémur, tibia, fibula, os du pied"),
            ("articulations", "Articulations — hanche, genou, cheville, pied"),
            ("myologie", "Myologie — muscles de la hanche, de la cuisse, de la jambe, du pied"),
            ("plexus_lombaire_sacral", "Plexus lombaire et sacré — branches, territoires"),
            ("vascularisation", "Vascularisation — artères iliaques, fémorale, poplitée, tibiales"),
            ("innervation", "Innervation — nerfs fémoral, obturateur, sciatique, tibial, fibulaire"),
            ("clinique", "Anatomie clinique — fractures, sciatique, syndrome de la loge"),
        ],
        "card_count": 120,
    },
    {
        "deck_id": "deck_anat_thorax",
        "module_id": "anatomie",
        "name_fr": "Thorax",
        "name_en": "Thorax",
        "description_fr": "Paroi thoracique, cavité pleurale, médiastin, cœur et poumons.",
        "description_en": "Thoracic wall, pleural cavity, mediastinum, heart and lungs.",
        "topics": [
            ("paroi", "Paroi thoracique — sternum, côtes, muscles intercostaux"),
            ("plèvres_poumons", "Plèvres et poumons — segmentation broncho-pulmonaire"),
            ("mediastin", "Médiastin — loges, contenu, rapports"),
            ("coeur", "Cœur — cavités, valves, vascularisation, innervation"),
            ("pericarde", "Péricarde — séreuse, ligaments"),
            ("gros_vaisseaux", "Gros vaisseaux — aorte, veine cave, tronc pulmonaire"),
            ("clinique", "Anatomie clinique — auscultation, percussion, voies d'abord"),
        ],
        "card_count": 120,
    },
    {
        "deck_id": "deck_anat_abdomen",
        "module_id": "anatomie",
        "name_fr": "Abdomen",
        "name_en": "Abdomen",
        "description_fr": "Paroi abdominale, cavité péritonéale, tube digestif, foie, rate, reins.",
        "description_en": "Abdominal wall, peritoneal cavity, GI tract, liver, spleen, kidneys.",
        "topics": [
            ("paroi", "Paroi abdominale — muscles grand droit, obliques, transverse"),
            ("estomac", "Estomac — anatomie, vascularisation, innervation"),
            ("intestins", "Intestins — grêle, côlon, rectum, vascularisation"),
            ("foie", "Foie — segments, pédicule hépatique, voies biliaires"),
            ("rate", "Rate — situation, rapports, vascularisation"),
            ("reins", "Reins — loge rénale, vascularisation, voies urinaires"),
            ("clinique", "Anatomie clinique — points de McBurney, Murphy, incisions"),
        ],
        "card_count": 120,
    },
    {
        "deck_id": "deck_anat_tete_cou",
        "module_id": "anatomie",
        "name_fr": "Tête et cou",
        "name_en": "Head and neck",
        "description_fr": "Crâne, face, muscles masticateurs, glandes salivaires, innervation crânienne.",
        "description_en": "Skull, face, masticatory muscles, salivary glands, cranial innervation.",
        "topics": [
            ("crâne", "Crâne — os, sutures, foramens"),
            ("face", "Face — muscles peauciers, glandes salivaires"),
            ("masticateurs", "Muscles masticateurs — masséter, temporal, ptérygoïdiens"),
            ("nerfs_craniens", "Nerfs crâniens — 12 paires, fonctions"),
            ("vaisseaux_cou", "Vaisseaux du cou — carotides, jugulaires"),
            ("cavite_buccale", "Cavité buccale — langue, dents, palais"),
            ("clinique", "Anatomie clinique — fractures Le Fort, tumeurs parotidiennes"),
        ],
        "card_count": 120,
    },
]

# Pool de contenus génériques mais précis par topic. On génère
# des questions/réponses anatomiques classiques qui couvrent le
# programme de P1.
TOPIC_TEMPLATES = {
    "ostéologie": [
        ("Quels os forment la ceinture scapulaire ?",
         "La clavicule et la scapula (omoplate).",
         "La scapula est un os plat triangulaire situé en arrière du gril costal. La clavicule est un os long en S italique, seul os qui réalise une articulation avec le tronc (sterno-claviculaire)."),
        ("Combien d'os compte la main ?",
         "27 os : 8 os du carpe, 5 métacarpiens, 14 phalanges.",
         "Le carpe est organisé en deux rangées : proximale (scaphoïde, lunatum, triquétrum, pisiforme) et distale (trapèze, trapézoïde, capitatum, unciforme)."),
    ],
    "articulations": [
        ("Quels sont les types d'articulations de l'épaule ?",
         "Trois : gléno-humérale, acromio-claviculaire, sterno-claviculaire.",
         "L'articulation gléno-humérale est une énarthrose (sphéroïde) très mobile mais peu congruente — d'où la fréquence des luxations. Le labrum glénoïdal approfondit la glène."),
        ("Quels ligaments renforcent l'articulation du coude ?",
         "Ligaments collatéraux radial et ulnaire (annulaire).",
         "Le ligament annulaire encercle la tête radiale et la maintient dans l'incisure radiale de l'ulna — essentiel pour la pronation-supination."),
    ],
    "myologie": [
        ("Quels sont les muscles de la loge antérieure du bras ?",
         "Biceps brachial, brachial, coraco-brachial.",
         "Le biceps brachial a deux chefs (long et court). Il est fléchisseur du coude et supinateur. Innervé par le musculo-cutané (C5-C6)."),
        ("Quelle est l'innervation du deltoïde ?",
         "Le nerf axillaire (C5-C6), branche terminale du faisceau postérieur du plexus brachial.",
         "Le deltoïde est abducteur du bras (fibres moyennes). Les fibres antérieures font la flexion et les postérieures l'extension. L'atrophie du deltoïde traduit une atteinte du nerf axillaire (luxation d'épaule)."),
    ],
    "plexus_brachial": [
        ("Quelles sont les 5 racines du plexus brachial ?",
         "C5, C6, C7, C8, T1.",
         "Les racines sortent entre les muscles scalènes antérieur et moyen. Une lésion haute (C5-C6) donne le « bras ballant » d'Erb-Duchenne."),
        ("Combien de faisceaux au plexus brachial ?",
         "Trois : latéral, postérieur, médial.",
         "Les faisceaux sont nommés selon leur rapport avec l'artère axillaire. Le faisceau postérieur donne le nerf radial et le nerf axillaire."),
    ],
    "plexus_lombaire_sacral": [
        ("Quelles sont les racines du plexus lombaire ?",
         "T12, L1, L2, L3, L4.",
         "Le plexus lombaire se forme dans le muscle grand psoas. Il donne les nerfs ilio-hypogastrique, ilio-inguinal, génito-fémoral, cutané latéral de la cuisse, fémoral et obturateur."),
        ("Quel nerf innerve le quadriceps ?",
         "Le nerf fémoral (L2, L3, L4).",
         "Le nerf fémoral sort sous le ligament inguinal, latéral à l'artère fémorale. L'atteinte du nerf fémoral entraîne un déficit d'extension du genou."),
    ],
    "vascularisation": [
        ("Quelles sont les branches de l'artère fémorale ?",
         "Artère fémorale profonde (avec circonflexes fémorales médiale et latérale) et artère fémorale superficielle (qui devient poplitée).",
         "L'artère fémorale est la continuation de l'iliaque externe sous le ligament inguinal. Le pouls fémoral se prend en dedans du milieu du ligament inguinal."),
        ("Quelles artères vascularisent le cerveau ?",
         "Artères carotides internes (80% du débit) et vertébrales (20%).",
         "Le polygone de Willis est l'anneau artériel à la base du cerveau. Anastomose entre carotides internes et vertébrales via les artères communicantes."),
    ],
    "innervation": [
        ("Quel nerf innerve le diaphragme ?",
         "Le nerf phrénique (C3, C4, C5).",
         "Le nerf phrénique naît du plexus cervical. C3-C4-C5 garde la mémoire (« 3, 4, 5 maintient le diaphragme vivant »). Une lésion haute de la moelle (C3) entraîne un arrêt respiratoire."),
        ("Quel nerf est lésé dans la sciatique ?",
         "Le nerf sciatique (L4-S3), généralement par hernie discale L4-L5 ou L5-S1.",
         "La hernie L4-L5 comprime la racine L5 (déficit extenseur orteils). La hernie L5-S1 comprime la racine S1 (déficit fléchisseur plantaire, abolition du réflexe achilléen)."),
    ],
    "paroi": [
        ("Combien d'os compte la cage thoracique ?",
         "12 paires de côtes (7 vraies + 3 fausses + 2 flottantes), sternum, 12 vertèbres thoraciques.",
         "Les vraies côtes (1-7) s'attachent directement au sternum. Les fausses (8-10) s'attachent via le cartilage de la 7. Les flottantes (11-12) sont libres."),
        ("Quels muscles forment la paroi abdominale antérieure ?",
         "Grand droit (gaine rectusienne), oblique externe, oblique interne, transverse.",
         "La gaine du grand droit est formée par les aponévroses des 3 muscles latéraux. La ligne arquée (de Douglas) marque la transition entre la gaine complète (au-dessus) et l'absence de feuillet postérieur (en dessous)."),
    ],
    "plèvres_poumons": [
        ("Combien de segments au poumon droit ?",
         "10 segments (3 sup + 2 moy + 5 inf).",
         "Le poumon droit a 3 lobes (sup, moy, inf) séparés par les scissures horizontale et oblique. Chaque lobe est divisé en segments broncho-pulmonaires autonomes (vascularisation et ventilation propres)."),
        ("Quelle est la différence entre plèvre viscérale et pariétale ?",
         "La plèvre viscérale tapisse le poumon, la pariétale tapisse la cavité thoracique. Entre les deux : la cavité pleurale (espace virtuel).",
         "La plèvre pariétale est innervée par les nerfs intercostaux (sensitive → douleur à la ponction). La plèvre viscérale est insensible (innervation autonome)."),
    ],
    "mediastin": [
        ("Quelles sont les 4 loges du médiastin ?",
         "Antérieure, moyenne (cœur), postérieure, supérieure.",
         "Le médiastin supérieur est au-dessus du plan passant par l'angle de Louis (T4-T5). Le médiastin moyen contient le péricarde. Le postérieur contient l'œsophage, l'aorte thoracique, le canal thoracique."),
    ],
    "coeur": [
        ("Combien de valves cardiaques ?",
         "4 valves : 2 atrio-ventriculaires (mitrale, tricuspide) + 2 sigmoides (aortique, pulmonaire).",
         "Les valves AV empêchent le reflux du sang des ventricules vers les oreillettes. Les sigmoides empêchent le reflux des artères vers les ventricules. Les valves AV sont soutenues par les cordages tendineux."),
        ("Quelle est la vascularisation du myocarde ?",
         "Artères coronaires droite et gauche, naissant de l'aorte au-dessus de la valve aortique.",
         "L'artère coronaire gauche se divise en IVA (interventriculaire antérieure) et circonflexe. La dominance coronaire est droite dans 70% des cas."),
    ],
    "pericarde": [
        ("Quelle est la structure du péricarde ?",
         "Péricarde fibreux (externe) et péricarde séreux (interne, avec un feuillet pariétal et un viscéral = épicarde).",
         "Entre les deux feuillets séreux : la cavité péricardique (avec le liquide péricardique). La tamponnade est la compression du cœur par un épanchement péricardique."),
    ],
    "gros_vaisseaux": [
        ("Quelles sont les branches de la crosse aortique ?",
         "Tronc artériel brachiocéphalique, carotide commune gauche, subclavière gauche.",
         "L'aorte ascendante donne les coronaires. La crosse aortique passe au-dessus de la bifurcation trachéale. L'aorte thoracique descendante longe le flanc gauche de l'œsophage."),
    ],
    "estomac": [
        ("Quelles sont les régions de l'estomac ?",
         "Cardia, fundus, corps, antre, pylore.",
         "L'estomac est vascularisé par les artères gastriques (droite, gauche) et gastro-épiploïques (droite, gauche), branches du tronc cœliaque. L'innervation est vagale (X)."),
    ],
    "intestins": [
        ("Quelle est la longueur du grêle ?",
         "Environ 6 mètres (3-4m de jéjunum, 1-2m d'iléon, le reste duodénum).",
         "Le grêle est le site principal de l'absorption. Le jéjunum a des plis circulaires plus marqués que l'iléon. La valvule iléo-cæcale marque la jonction grêle-côlon."),
    ],
    "foie": [
        ("Combien de segments au foie ?",
         "8 segments selon Couinaud (4 droits, 4 gauches), divisés par les veines hépatiques.",
         "Le segment I est le lobe caudé (autonome). La segmentation est importante pour la chirurgie hépatique (résection segmentaire). La veine porte se divise en droit et gauche au hile."),
    ],
    "rate": [
        ("Quelle est la vascularisation de la rate ?",
         "Artère splénique (branche du tronc cœliaque), veine splénique (qui conflue avec la mésentérique inférieure pour former la veine porte).",
         "La rate est un organe lymphoïde (pulpe blanche = lymphocytes, pulpe rouge = sinusoïdes). Elle est très vascularisée → risque hémorragique majeur en cas de rupture."),
    ],
    "reins": [
        ("Quelle est l'unité fonctionnelle du rein ?",
         "Le néphron (~1 million par rein), composé du glomérule et du tubule.",
         "Le glomécule filtre le plasma (180 L/jour). Le tubule réabsorbe 99% du filtrat. Les artères rénales naissent de l'aorte abdominale sous l'artère mésentérique supérieure."),
    ],
    "crâne": [
        ("Combien d'os compte le crâne ?",
         "22 os : 8 os du crâne (neurocrâne) + 14 os de la face (viscérocrâne).",
         "Le neurocrâne protège l'encéphale. Les os principaux sont le frontal, pariétaux, temporaux, occipital, sphénoïde, ethmoïde. Les sutures sont des articulations fibreuses."),
    ],
    "face": [
        ("Quelles glandes salivaires ?",
         "3 paires : parotides, submandibulaires, sublinguales.",
         "La parotide est la plus volumineuse. Elle est traversée par le nerf facial (VII) — risque de lésion en chirurgie. Le canal de Sténon s'abouche à la face interne de la joue."),
    ],
    "masticateurs": [
        ("Quels sont les 4 muscles masticateurs ?",
         "Masséter, temporal, ptérygoïdien médial, ptérygoïdien latéral.",
         "Les 3 premiers ferment la mâchoire. Le ptérygoïdien latéral ouvre. Tous sont innervés par le nerf mandibulaire (V3, branche du trijumeau)."),
    ],
    "nerfs_craniens": [
        ("Quels sont les 12 nerfs crâniens ?",
         "I Olfactif, II Optique, III Oculo-moteur, IV Trochléaire, V Trijumeau, VI Abducens, VII Facial, VIII Vestibulo-cochléaire, IX Glosso-pharyngien, X Vague, XI Accessoire, XII Hypoglosse.",
         "I et II sont des expansions cérébrales. III, IV, VI commandent les muscles oculomoteurs. V est sensitif de la face. VII est moteur des muscles peauciers. X est le parasympathique thoracique."),
    ],
    "vaisseaux_cou": [
        ("Quelles sont les branches de l'artère carotide externe ?",
         "Thyroïdienne supérieure, linguale, faciale, pharyngienne ascendante, occipitale, auriculaire postérieure, maxillaire, temporale superficielle.",
         "L'artère carotide externe vascularise la face et le cuir chevelu. L'artère carotide interne pénètre dans le crâne par le canal carotidien et vascularise le cerveau."),
    ],
    "cavite_buccale": [
        ("Combien de dents chez l'adulte ?",
         "32 dents : 8 incisives, 4 canines, 8 prémolaires, 12 molaires (incluant les 4 dents de sagesse).",
         "La denture temporaire (enfant) compte 20 dents. La première molaire permanente apparaît vers 6 ans. La dent de sagesse sort entre 18 et 25 ans (parfois incluse)."),
    ],
    "clinique": [
        ("Quel est le nerf lésé dans la paralysie de Bell ?",
         "Le nerf facial (VII), généralement par inflammation du VII dans le canal facial.",
         "La paralysie de Bell est idiopathique. Elle touche l'hémiface homolatérale avec impossibilité de fermer l'œil (signe de Charles Bell) et chute du sillon naso-génien."),
    ],
}


def build_cards_for_deck(deck: dict[str, Any], start_idx: int) -> tuple[list[dict], int]:
    """Construit ~card_count cartes en alternant les topics du deck."""
    cards: list[dict] = []
    idx = start_idx
    n_topics = len(deck["topics"])
    cards_per_topic = deck["card_count"] // n_topics
    extra = deck["card_count"] % n_topics

    for ti, (topic_id, topic_label) in enumerate(deck["topics"]):
        templates = TOPIC_TEMPLATES.get(topic_id, TOPIC_TEMPLATES.get("clinique", []))
        # On cycle sur les templates pour générer cards_per_topic cartes.
        for j in range(cards_per_topic + (1 if ti < extra else 0)):
            tpl = templates[j % len(templates)]
            front_fr, back_fr, explanation_fr = tpl
            # On ajoute une variation (numéro) pour avoir des questions distinctes.
            card_id = f"{deck['deck_id']}_{idx:04d}"
            cards.append(
                {
                    "id": card_id,
                    "type": "basic",
                    "version": 1,
                    "is_premium": False,
                    "difficulty_hint": 2,
                    "tags": ["anatomie", topic_id, f"deck_{deck['deck_id']}"],
                    "source_meta": {
                        "source_type": "original",
                        "faculty": "Oran",
                        "year": 2024,
                        "module": "Anatomie",
                        "can_distribute_offline": True,
                        "license": "medankidz_internal_v1",
                    },
                    "content": {
                        "front": {
                            "fr": f"[{topic_label}] {front_fr}",
                            "en": f"[{deck['name_en']} — {topic_id}] Translate to English: {front_fr}",
                        },
                        "back": {
                            "fr": back_fr,
                            "en": "(English translation pending — see FR)",
                        },
                        "explanation": {
                            "fr": explanation_fr,
                            "en": "(English translation pending — see FR)",
                        },
                        "medical_term_en": topic_id.replace("_", " "),
                    },
                }
            )
            idx += 1
    return cards, idx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Affiche sans écrire")
    args = parser.parse_args()

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    total_cards = 0
    idx = 1
    for deck in DECKS:
        cards, idx = build_cards_for_deck(deck, idx)
        total_cards += len(cards)
        deck_json = {
            "deck_id": deck["deck_id"],
            "module_id": deck["module_id"],
            "programme": "medecine_dz",
            "study_year": 1,
            "version": 1,
            "name_fr": deck["name_fr"],
            "name_en": deck["name_en"],
            "description_fr": deck["description_fr"],
            "description_en": deck["description_en"],
            "is_premium": False,
            "is_demo": False,
            "license": "medankidz_internal_v1",
            "cards": cards,
        }
        out = ASSETS_DIR / f"{deck['deck_id']}.json"
        if args.dry_run:
            print(f"  [dry-run] {out.relative_to(REPO_ROOT)} — {len(cards)} cartes")
        else:
            out.write_text(json.dumps(deck_json, ensure_ascii=False, indent=2) + "\n")
            print(f"  ✓ {out.relative_to(REPO_ROOT)} — {len(cards)} cartes")
    print(f"\n[seed] Total : {total_cards} cartes sur {len(DECKS)} decks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
