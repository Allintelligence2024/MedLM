package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.CardItem
import com.example.data.model.QcmOption
import com.example.ui.components.LanguageToggle
import com.example.ui.theme.MedGreenSuccess
import com.example.ui.theme.MedNavyPrimary
import com.example.ui.theme.MedRedPulse
import com.example.ui.theme.MedTealSecondary
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QcmBankScreen(
    qcmCards: List<CardItem>,
    selectedFaculty: String,
    langPref: String,
    onFacultySelected: (String) -> Unit,
    onLangSelected: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val faculties = listOf("All", "Faculté d'Alger", "Oran", "Constantine", "Annaba")
    var currentQcmIndex by remember { mutableIntStateOf(0) }
    var selectedOptionId by remember { mutableStateOf<String?>(null) }

    val filteredQcms = if (selectedFaculty == "All") {
        qcmCards
    } else {
        qcmCards.filter { it.facultyTag.contains(selectedFaculty, ignoreCase = true) }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (langPref == "FR") "Banque QCM Algérie" else "Algeria QCM Bank",
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
        ) {
            // Faculty Filter Row
            LazyRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                items(faculties) { fac ->
                    val isSelected = fac == selectedFaculty
                    FilterChip(
                        selected = isSelected,
                        onClick = {
                            onFacultySelected(fac)
                            currentQcmIndex = 0
                            selectedOptionId = null
                        },
                        label = { Text(text = fac, fontSize = 12.sp) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (filteredQcms.isNotEmpty() && currentQcmIndex < filteredQcms.size) {
                val card = filteredQcms[currentQcmIndex]
                val options = parseOptionsJson(card.optionsJson)

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                ) {
                    // QCM Question Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
                    ) {
                        Column(modifier = Modifier.padding(18.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = MedNavyPrimary.copy(alpha = 0.1f)
                                ) {
                                    Text(
                                        text = card.facultyTag,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = MedNavyPrimary
                                    )
                                }

                                Text(
                                    text = "QCM ${currentQcmIndex + 1} / ${filteredQcms.size}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            val questionText = if (langPref == "FR" && card.frontFr.isNotBlank()) card.frontFr else card.frontEn

                            Text(
                                text = questionText,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                                lineHeight = 22.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Options List
                    options.forEach { option ->
                        val isSelected = selectedOptionId == option.id
                        val isRevealed = selectedOptionId != null

                        val borderColor = when {
                            !isRevealed && isSelected -> MedNavyPrimary
                            isRevealed && option.isCorrect -> MedGreenSuccess
                            isRevealed && isSelected && !option.isCorrect -> MedRedPulse
                            else -> MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                        }

                        val bgColor = when {
                            isRevealed && option.isCorrect -> MedGreenSuccess.copy(alpha = 0.12f)
                            isRevealed && isSelected && !option.isCorrect -> MedRedPulse.copy(alpha = 0.12f)
                            isSelected -> MedNavyPrimary.copy(alpha = 0.08f)
                            else -> MaterialTheme.colorScheme.surface
                        }

                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 10.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .border(1.5.dp, borderColor, RoundedCornerShape(16.dp))
                                .clickable { selectedOptionId = option.id },
                            colors = CardDefaults.cardColors(containerColor = bgColor)
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(32.dp)
                                            .clip(CircleShape)
                                            .background(
                                                when {
                                                    isRevealed && option.isCorrect -> MedGreenSuccess
                                                    isRevealed && isSelected && !option.isCorrect -> MedRedPulse
                                                    else -> MedNavyPrimary.copy(alpha = 0.15f)
                                                }
                                            ),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        if (isRevealed && option.isCorrect) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = "Correct",
                                                tint = Color.White,
                                                modifier = Modifier.size(18.dp)
                                            )
                                        } else if (isRevealed && isSelected && !option.isCorrect) {
                                            Icon(
                                                imageVector = Icons.Default.Close,
                                                contentDescription = "Wrong",
                                                tint = Color.White,
                                                modifier = Modifier.size(18.dp)
                                            )
                                        } else {
                                            Text(
                                                text = option.id,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = MedNavyPrimary
                                            )
                                        }
                                    }

                                    Spacer(modifier = Modifier.width(12.dp))

                                    val optionText = if (langPref == "FR" && option.textFr.isNotBlank()) option.textFr else option.textEn

                                    Text(
                                        text = optionText,
                                        fontSize = 14.sp,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        modifier = Modifier.weight(1f)
                                    )
                                }

                                // Option Explanation Rationale when revealed
                                if (isRevealed) {
                                    val expl = if (langPref == "FR" && option.explanationFr.isNotBlank()) option.explanationFr else option.explanationEn
                                    if (expl.isNotBlank()) {
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .background(
                                                    Color.White.copy(alpha = 0.6f),
                                                    RoundedCornerShape(8.dp)
                                                )
                                                .padding(8.dp),
                                            verticalAlignment = Alignment.Top
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Lightbulb,
                                                contentDescription = "Rationale",
                                                tint = if (option.isCorrect) MedGreenSuccess else MedRedPulse,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                text = expl,
                                                fontSize = 12.sp,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Next Question Action Button
                    if (currentQcmIndex < filteredQcms.size - 1) {
                        Button(
                            onClick = {
                                currentQcmIndex++
                                selectedOptionId = null
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = MedNavyPrimary)
                        ) {
                            Text(
                                text = if (langPref == "FR") "QCM Suivant" else "Next QCM",
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Icon(imageVector = Icons.Default.ChevronRight, contentDescription = "Next")
                        }
                    } else {
                        Text(
                            text = if (langPref == "FR") "Fin des QCM pour cette faculté ! 🎉" else "End of QCMs for this faculty selection! 🎉",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MedTealSecondary,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            } else {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (langPref == "FR") "Aucun QCM trouvé pour cette sélection." else "No QCMs found for this selection.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

private fun parseOptionsJson(json: String?): List<QcmOption> {
    if (json.isNullOrBlank()) return emptyList()
    return try {
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val type = Types.newParameterizedType(List::class.java, QcmOption::class.java)
        val adapter = moshi.adapter<List<QcmOption>>(type)
        adapter.fromJson(json) ?: emptyList()
    } catch (e: Exception) {
        emptyList()
    }
}
