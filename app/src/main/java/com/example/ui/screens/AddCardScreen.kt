package com.example.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.CardItem
import com.example.data.model.Deck
import com.example.ui.components.LanguageToggle
import com.example.ui.theme.MedNavyPrimary
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddCardScreen(
    decks: List<Deck>,
    langPref: String,
    onSaveCard: (CardItem) -> Unit,
    onLangSelected: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedDeckId by remember { mutableStateOf(decks.firstOrNull()?.id ?: "deck_anatomy_axillary") }
    var frontEn by remember { mutableStateOf("") }
    var frontFr by remember { mutableStateOf("") }
    var backEn by remember { mutableStateOf("") }
    var backFr by remember { mutableStateOf("") }
    var termEn by remember { mutableStateOf("") }
    var termFr by remember { mutableStateOf("") }
    var mnemonicEn by remember { mutableStateOf("") }
    var explanationEn by remember { mutableStateOf("") }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (langPref == "FR") "Ajouter une Carte Flash" else "Create Custom Flashcard",
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    LanguageToggle(
                        currentLang = langPref,
                        onLangSelected = onLangSelected,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Text(
                text = if (langPref == "FR") "Entrez les détails de votre carte d'étude :" else "Enter your study card details:",
                fontSize = 14.sp,
                color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Front Question EN
            OutlinedTextField(
                value = frontEn,
                onValueChange = { frontEn = it },
                label = { Text("Front Question (English)") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Front Question FR
            OutlinedTextField(
                value = frontFr,
                onValueChange = { frontFr = it },
                label = { Text("Question en Français (Optionnel)") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Back Answer EN
            OutlinedTextField(
                value = backEn,
                onValueChange = { backEn = it },
                label = { Text("Back Answer (English)") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Back Answer FR
            OutlinedTextField(
                value = backFr,
                onValueChange = { backFr = it },
                label = { Text("Réponse en Français (Optionnel)") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Medical Term EN & FR
            Row(modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = termEn,
                    onValueChange = { termEn = it },
                    label = { Text("Med Term (EN)") },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                )

                Spacer(modifier = Modifier.padding(horizontal = 4.dp))

                OutlinedTextField(
                    value = termFr,
                    onValueChange = { termFr = it },
                    label = { Text("Terme Médical (FR)") },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Mnemonic
            OutlinedTextField(
                value = mnemonicEn,
                onValueChange = { mnemonicEn = it },
                label = { Text("Mnemonic / Astuce (e.g., SALTI)") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Explanation
            OutlinedTextField(
                value = explanationEn,
                onValueChange = { explanationEn = it },
                label = { Text("Clinical Note / Explication") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    if (frontEn.isNotBlank() && backEn.isNotBlank()) {
                        val newCard = CardItem(
                            id = "custom_${UUID.randomUUID()}",
                            deckId = selectedDeckId,
                            type = "BASIC",
                            frontEn = frontEn,
                            frontFr = frontFr,
                            backEn = backEn,
                            backFr = backFr,
                            explanationEn = explanationEn,
                            medicalTermEn = termEn,
                            medicalTermFr = termFr,
                            mnemonicEn = mnemonicEn,
                            facultyTag = "Personnalisé"
                        )
                        onSaveCard(newCard)
                        onBack()
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MedNavyPrimary),
                enabled = frontEn.isNotBlank() && backEn.isNotBlank()
            ) {
                Icon(imageVector = Icons.Default.Check, contentDescription = "Save")
                Spacer(modifier = Modifier.padding(horizontal = 4.dp))
                Text(
                    text = if (langPref == "FR") "Enregistrer dans FSRS" else "Save Card to FSRS",
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
