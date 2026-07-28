package com.example.data.local

import com.example.data.model.CardItem
import com.example.data.model.Deck
import com.example.data.model.SrsCardState
import com.example.data.model.UserStats

object DatabaseInitializer {

    val seedDecks = listOf(
        Deck(
            id = "deck_anatomy_axillary",
            titleEn = "Axillary Artery & Upper Limb",
            titleFr = "Artère Axillaire & Membre Supérieur",
            module = "Anatomie",
            year = 1,
            descriptionEn = "Anatomical course, 6 major branches (SALTI mnemonic), relation to brachial plexus cords.",
            descriptionFr = "Trajet anatomique, 6 branches collatérales (Mnémotechnique SALTI), rapports avec le plexus brachial.",
            cardCount = 6,
            colorHex = "#00A896"
        ),
        Deck(
            id = "deck_anatomy_heart",
            titleEn = "Heart & Cardiac Conduction System",
            titleFr = "Cœur & Système de Conduction Cardiaque",
            module = "Anatomie",
            year = 1,
            descriptionEn = "SA Node, AV Node, Bundle of His, coronary circulation & valve projections.",
            descriptionFr = "Nœud sinusal, nœud atrio-ventriculaire, faisceau de His, circulation coronaire et foyers d'auscultation.",
            cardCount = 5,
            colorHex = "#E63946"
        ),
        Deck(
            id = "deck_biochim_glycolysis",
            titleEn = "Glycolysis & Metabolic Regulation",
            titleFr = "Glycolyse & Régulation Métabolique",
            module = "Biochimie",
            year = 1,
            descriptionEn = "PFK-1 key enzyme, ATP yield, anaerobic lactate conversion & hormonal control.",
            descriptionFr = "Enzyme clé PFK-1, bilan en ATP, voie anaérobie du lactate et contrôle hormonal.",
            cardCount = 5,
            colorHex = "#F4A261"
        ),
        Deck(
            id = "deck_physio_cardiac_action",
            titleEn = "Cardiac Action Potential",
            titleFr = "Potentiel d'Action Cardiaque",
            module = "Physiologie",
            year = 1,
            descriptionEn = "Phases 0 to 4 ion conductance (Na+, Ca2+ L-type, K+ rectifiers), refractory periods.",
            descriptionFr = "Conductances ioniques des phases 0 à 4 (Na+, Ca2+ L, K+), périodes réfractaires.",
            cardCount = 4,
            colorHex = "#0F4C81"
        ),
        Deck(
            id = "deck_histology_epithelium",
            titleEn = "Epithelial Tissues & Cell Junctions",
            titleFr = "Tissus Épithéliaux & Jonctions Cellulaires",
            module = "Histologie",
            year = 1,
            descriptionEn = "Classification, basement membrane, tight junctions (zonula occludens), desmosomes.",
            descriptionFr = "Classification, membrane basale, jonctions serrées (zonula occludens), desmosomes.",
            cardCount = 4,
            colorHex = "#2A9D8F"
        )
    )

    val seedCards = listOf(
        // Card 1: Anatomy Axillary Artery Branches
        CardItem(
            id = "card_ax_1",
            deckId = "deck_anatomy_axillary",
            type = "BASIC",
            frontEn = "What are the 6 collateral branches of the Axillary Artery?",
            frontFr = "Quelles sont les 6 branches collatérales de l'Artère Axillaire ?",
            backEn = "1. Superior Thoracic\n2. Thoraco-Acromial\n3. Lateral Thoracic\n4. Subscapular\n5. Anterior Humeral Circumflex\n6. Posterior Humeral Circumflex",
            backFr = "1. Thoracique Supérieure\n2. Thoraco-Acromiale\n3. Thoracique Latérale\n4. Subscapulaire\n5. Circonflexe Humérale Antérieure\n6. Circonflexe Humérale Postérieure",
            explanationEn = "Mnemonic SALTI: Superior thoracic, Acromiothoracic, Lateral thoracic, Subscapular, Two circumflexes (Ant & Post).",
            explanationFr = "Mnémotechnique SALTI : Supérieure, Acromio-thoracique, Latérale thoracique, Subscapulaire, Deux circonflexes.",
            medicalTermEn = "Axillary Artery / Branches",
            medicalTermFr = "Artère Axillaire / Collatérales",
            mnemonicEn = "SALTI",
            mnemonicFr = "SALTI",
            facultyTag = "Faculté d'Alger"
        ),
        // Card 2: Anatomy Axillary Artery QCM
        CardItem(
            id = "card_ax_2",
            deckId = "deck_anatomy_axillary",
            type = "QCM",
            frontEn = "Concerning the Axillary Artery, which of the following statements is CORRECT?",
            frontFr = "Concernant l'Artère Axillaire, quelle proposition est EXACTE ?",
            backEn = "Correct Option B: It originates at the outer border of the 1st rib as a continuation of the Subclavian Artery.",
            backFr = "Proposition exacte B : Elle fait suite à l'Artère Subclavière au bord externe de la 1ère côte.",
            explanationEn = "Option B is correct. It extends from the 1st rib to the lower border of Teres Major, continuing as the Brachial Artery.",
            explanationFr = "Option B vraie. Elle s'étend de la 1ère côte au bord inférieur du Grand Rond pour devenir l'Artère Brachiale.",
            medicalTermEn = "Subclavian to Axillary Transition",
            medicalTermFr = "Transition Subclavière - Axillaire",
            mnemonicEn = "",
            mnemonicFr = "",
            optionsJson = """[
                {"id":"A","textEn":"It is a branch of the Brachial Artery","textFr":"Elle est une branche de l'Artère Brachiale","isCorrect":false,"explanationEn":"False: Brachial artery is its continuation.","explanationFr":"Faux: L'artère brachiale en est la suite."},
                {"id":"B","textEn":"It begins at the outer border of the 1st rib continuing the Subclavian Artery","textFr":"Elle débute au bord externe de la 1ère côte en faisant suite à l'artère subclavière","isCorrect":true,"explanationEn":"Correct anatomical landmark!","explanationFr":"Repère anatomique exact !"},
                {"id":"C","textEn":"It gives off 3 posterior circumflex arteries","textFr":"Elle donne 3 artères circonflexes postérieures","isCorrect":false,"explanationEn":"False: It gives only 1 posterior circumflex artery.","explanationFr":"Faux: Elle donne 1 seule circonflexe postérieure."},
                {"id":"D","textEn":"It passes anterior to the Clavicle","textFr":"Elle passe en avant de la Clavicule","isCorrect":false,"explanationEn":"False: It passes posterior/inferior to the clavicle in the axillary fossa.","explanationFr":"Faux: Elle passe dans le creux axillaire en arrière/dessous de la clavicule."}
            ]""",
            facultyTag = "Faculté d'Oran 2023"
        ),
        // Card 3: Anatomy Pterion
        CardItem(
            id = "card_anat_pterion",
            deckId = "deck_anatomy_axillary",
            type = "BASIC",
            frontEn = "Which major artery lies directly deep to the Pterion suture of the skull?",
            frontFr = "Quelle artère majeure se situe directement sous la suture du Ptérion ?",
            backEn = "Middle Meningeal Artery (Anterior branch).",
            backFr = "L'Artère Méningée Moyenne (Branche antérieure).",
            explanationEn = "Clinical Significance: Skull fractures at the Pterion can tear the Middle Meningeal Artery, leading to an Epidural Hematoma.",
            explanationFr = "Intérêt clinique : Une fracture du Ptérion risque de déchirer l'artère méningée moyenne, provoquant un Épidurème / Hématome Épidural.",
            medicalTermEn = "Pterion / Middle Meningeal Artery",
            medicalTermFr = "Ptérion / Artère Méningée Moyenne",
            mnemonicEn = "",
            mnemonicFr = "",
            facultyTag = "Faculté de Constantine"
        ),
        // Card 4: Biochemistry Glycolysis Rate Limiting Step
        CardItem(
            id = "card_bio_1",
            deckId = "deck_biochim_glycolysis",
            type = "BASIC",
            frontEn = "What is the primary rate-limiting enzyme of Glycolysis?",
            frontFr = "Quelle est l'enzyme clé limitante de la Glycolyse ?",
            backEn = "Phosphofructokinase-1 (PFK-1).",
            backFr = "Phosphofructokinase-1 (PFK-1).",
            explanationEn = "PFK-1 catalyzes the irreversible conversion of Fructose 6-Phosphate to Fructose 1,6-Bisphosphate. Activated by AMP & F2,6BP; inhibited by ATP & Citrate.",
            explanationFr = "PFK-1 catalyse la conversion irréversible du Fructose 6-Phosphate en Fructose 1,6-Bisphosphate. Activée par AMP & F2,6BP ; inhibée par ATP & Citrate.",
            medicalTermEn = "PFK-1 / Glycolytic Pathway",
            medicalTermFr = "PFK-1 / Voie Glycolytique",
            mnemonicEn = "",
            mnemonicFr = "",
            facultyTag = "Faculté d'Alger"
        ),
        // Card 5: Biochemistry Glycolysis QCM
        CardItem(
            id = "card_bio_qcm",
            deckId = "deck_biochim_glycolysis",
            type = "QCM",
            frontEn = "Under anaerobic conditions in human erythrocytes, what is the end-product of Glycolysis?",
            frontFr = "En conditions anaérobies dans les hématies humaines, quel est le produit final de la Glycolyse ?",
            backEn = "Correct Option C: Lactate (via Lactate Dehydrogenase).",
            backFr = "Option exacte C : Le Lactate (via la Lactate Déshydrogénase).",
            explanationEn = "Erythrocytes lack mitochondria and rely exclusively on anaerobic glycolysis converting Pyruvate to Lactate to regenerate NAD+.",
            explanationFr = "Les hématies sont dépourvues de mitochondries et dépendent de la glycolyse anaérobie régénérant le NAD+ en convertissant le Pyruvate en Lactate.",
            medicalTermEn = "Anaerobic Lactate Conversion",
            medicalTermFr = "Conversion Anaérobie en Lactate",
            optionsJson = """[
                {"id":"A","textEn":"Acetyl-CoA","textFr":"Acétyl-CoA","isCorrect":false,"explanationEn":"False: Requires mitochondria and oxygen.","explanationFr":"Faux: Nécessite les mitochondries et l'oxygène."},
                {"id":"B","textEn":"Ethanol","textFr":"Éthanol","isCorrect":false,"explanationEn":"False: Occurs in yeast, not human cells.","explanationFr":"Faux: Se produit chez la levure, pas chez l'humain."},
                {"id":"C","textEn":"Lactate","textFr":"Lactate","isCorrect":true,"explanationEn":"Correct! Regenerates NAD+ for ongoing ATP production.","explanationFr":"Vrai ! Régénère le NAD+ pour continuer la production d'ATP."},
                {"id":"D","textEn":"Oxaloacetate","textFr":"Oxaloacétate","isCorrect":false,"explanationEn":"False: Intermediate in Krebs cycle and gluconeogenesis.","explanationFr":"Faux: Intermédiaire du cycle de Krebs et de la néoglucogenèse."}
            ]""",
            facultyTag = "Faculté d'Annaba 2023"
        ),
        // Card 6: Physiology Cardiac Action Potential
        CardItem(
            id = "card_phys_1",
            deckId = "deck_physio_cardiac_action",
            type = "BASIC",
            frontEn = "Which ion current causes Phase 2 (Plateau phase) in ventricular cardiac action potentials?",
            frontFr = "Quel courant ionique est responsable de la Phase 2 (Phase de plateau) du potentiel d'action ventriculaire ?",
            backEn = "Inward L-type Ca2+ current I(Ca-L) balanced by outward K+ current I(K).",
            backFr = "Courant entrant de Ca2+ type L I(Ca-L) équilibré par le courant sortant de K+ I(K).",
            explanationEn = "The prolonged Ca2+ influx maintains depolarization, allowing excitation-contraction coupling and preventing tetanus.",
            explanationFr = "L'entrée prolongée de Ca2+ maintient la dépolarisation, permettant le couplage excitation-contraction et évitant le tétanos cardiaque.",
            medicalTermEn = "Phase 2 Plateau / L-type Calcium",
            medicalTermFr = "Phase 2 Plateau / Calcium Type L",
            mnemonicEn = "",
            mnemonicFr = "",
            facultyTag = "Faculté d'Alger"
        ),
        // Card 7: Histology Epithelium
        CardItem(
            id = "card_histo_1",
            deckId = "deck_histology_epithelium",
            type = "BASIC",
            frontEn = "What type of intercellular junction seals adjacent epithelial cells to prevent paracellular diffusion?",
            frontFr = "Quel type de jonction intercellulaire scelle les cellules épithéliales adjacentes pour empêcher la diffusion paracellulaire ?",
            backEn = "Tight Junctions (Zonula Occludens).",
            backFr = "Jonctions Serrées (Zonula Occludens).",
            explanationEn = "Composed of Claudins & Occludins. Located at the most apical region of the lateral cell membrane.",
            explanationFr = "Composées de Claudines & Occludines. Situées à la partie la plus apicale de la membrane latérale.",
            medicalTermEn = "Zonula Occludens / Tight Junction",
            medicalTermFr = "Zonula Occludens / Jonction Serrée",
            mnemonicEn = "",
            mnemonicFr = "",
            facultyTag = "Faculté d'Oran"
        )
    )

    fun createInitialSrsStates(cards: List<CardItem>): List<SrsCardState> {
        val now = System.currentTimeMillis()
        return cards.map { card ->
            SrsCardState(
                cardId = card.id,
                state = "NEW",
                stability = 1.0f,
                difficulty = 5.0f,
                elapsedDays = 0,
                scheduledDays = 0,
                reps = 0,
                lapses = 0,
                lastReviewTimestamp = 0L,
                nextReviewTimestamp = now
            )
        }
    }

    val initialUserStats = UserStats(
        id = 1,
        xp = 180,
        levelTitle = "P1 Medical Student",
        streakCount = 6,
        lastStudyDate = "2026-07-26",
        streakFreezeAvailable = 2,
        langPref = "EN",
        selectedFaculty = "All"
    )
}
