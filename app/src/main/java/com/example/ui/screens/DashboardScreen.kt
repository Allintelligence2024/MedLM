package com.example.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.CardItem
import com.example.data.model.Deck
import com.example.data.model.UserStats
import com.example.ui.components.LanguageToggle
import com.example.ui.components.StreakBadge
import com.example.ui.components.XpBadge
import com.example.ui.theme.MedGoldStreak
import com.example.ui.theme.MedNavyDark
import com.example.ui.theme.MedNavyPrimary
import com.example.ui.theme.MedRedPulse
import com.example.ui.theme.MedTealSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    userStats: UserStats,
    dueCards: List<CardItem>,
    allDecks: List<Deck>,
    onStartStudy: (String?) -> Unit,
    onNavigateToQcm: () -> Unit,
    onNavigateToExam: () -> Unit,
    onNavigateToGlossary: () -> Unit,
    onNavigateToAddCard: () -> Unit,
    onLangSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val lang = userStats.langPref

    Box(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = 88.dp)
        ) {
            // Header: Greeting, Streak & Language Switcher
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = if (lang == "FR") "Salam, Étudiante en Médecine" else "Salam, Medical Student",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(text = "🇩🇿", fontSize = 18.sp)
                        }
                        Text(
                            text = userStats.levelTitle,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = MedTealSecondary
                        )
                    }

                    LanguageToggle(
                        currentLang = userStats.langPref,
                        onLangSelected = onLangSelected
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Badges Row (Streak & XP)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StreakBadge(streakCount = userStats.streakCount)
                    XpBadge(xp = userStats.xp, levelTitle = userStats.levelTitle)
                }

                Spacer(modifier = Modifier.height(16.dp))
            }

            // Hero Due Cards Session Banner
            item {
                val dueCount = dueCards.size
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(28.dp)),
                    colors = CardDefaults.cardColors(containerColor = Color.Transparent)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                brush = Brush.linearGradient(
                                    colors = listOf(MedNavyPrimary, MedNavyDark)
                                )
                            )
                            .padding(22.dp)
                    ) {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = Color.White.copy(alpha = 0.22f)
                                ) {
                                    Text(
                                        text = if (lang == "FR") "RÉVISIONS SRS EN ATTENTE" else "SRS DUE SESSION",
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color.White
                                    )
                                }

                                Icon(
                                    imageVector = Icons.Default.MedicalServices,
                                    contentDescription = "Medical",
                                    tint = MedTealSecondary,
                                    modifier = Modifier.size(26.dp)
                                )
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            Text(
                                text = if (dueCount > 0) {
                                    if (lang == "FR") "$dueCount cartes médicales à réviser aujourd'hui" else "$dueCount Medical Flashcards Due Today"
                                } else {
                                    if (lang == "FR") "Toutes les cartes sont révisées ! Bravo 🎉" else "All Cards Cleared! Great Job 🎉"
                                },
                                fontSize = 19.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )

                            Spacer(modifier = Modifier.height(6.dp))

                            Text(
                                text = if (lang == "FR") "L'algorithme FSRS optimise votre rétention mémoire à long terme." else "FSRS Spaced Repetition optimizes your long-term memory recall.",
                                fontSize = 12.sp,
                                color = Color.White.copy(alpha = 0.85f)
                            )

                            Spacer(modifier = Modifier.height(18.dp))

                            Button(
                                onClick = { onStartStudy(null) },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = MedTealSecondary),
                                shape = RoundedCornerShape(20.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PlayArrow,
                                    contentDescription = "Start",
                                    tint = Color.White
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = if (dueCount > 0) {
                                        if (lang == "FR") "Lancer la session SRS ($dueCount cartes)" else "Start SRS Review ($dueCount Due)"
                                    } else {
                                        if (lang == "FR") "Réviser le deck complet" else "Review Deck Cards"
                                    },
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))
            }

            // Quick Tools Hub (QCM Bank, Mock Exam, Medical Terms Glossary)
            item {
                Text(
                    text = if (lang == "FR") "Outils d'Étude Médicale" else "Medical Study Hub",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    QuickToolCard(
                        title = if (lang == "FR") "Banque QCM" else "QCM Bank",
                        subtitle = if (lang == "FR") "Annales Facs DZ" else "Algerian Faculty QCMs",
                        icon = Icons.Default.Quiz,
                        accentColor = MedNavyPrimary,
                        onClick = onNavigateToQcm,
                        modifier = Modifier.weight(1f)
                    )

                    QuickToolCard(
                        title = if (lang == "FR") "Examen Blanc" else "Mock Exam",
                        subtitle = if (lang == "FR") "Session Chrono" else "Timed Exam Session",
                        icon = Icons.Default.School,
                        accentColor = MedRedPulse,
                        onClick = onNavigateToExam,
                        modifier = Modifier.weight(1f)
                    )

                    QuickToolCard(
                        title = if (lang == "FR") "Lexique EN/FR" else "Med Glossary",
                        subtitle = if (lang == "FR") "Termes & Mnémo" else "Terms & Mnemonics",
                        icon = Icons.Default.Book,
                        accentColor = MedTealSecondary,
                        onClick = onNavigateToGlossary,
                        modifier = Modifier.weight(1f)
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
            }

            // Algerian Medical Modules Decks List
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (lang == "FR") "Modules Médicaux 1ère & 2ème Année" else "1st & 2nd Year Medical Modules",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))
            }

            items(allDecks) { deck ->
                val title = if (lang == "FR") deck.titleFr else deck.titleEn
                val desc = if (lang == "FR") deck.descriptionFr else deck.descriptionEn

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp)
                        .clickable { onStartStudy(deck.id) },
                    shape = RoundedCornerShape(22.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Module indicator icon
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(parseHexColor(deck.colorHex).copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.FitnessCenter,
                                contentDescription = deck.module,
                                tint = parseHexColor(deck.colorHex),
                                modifier = Modifier.size(24.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(14.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = parseHexColor(deck.colorHex).copy(alpha = 0.15f)
                                ) {
                                    Text(
                                        text = deck.module,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = parseHexColor(deck.colorHex)
                                    )
                                }
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "${deck.cardCount} cards",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Spacer(modifier = Modifier.height(4.dp))

                            Text(
                                text = title,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )

                            Spacer(modifier = Modifier.height(2.dp))

                            Text(
                                text = desc,
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2
                            )
                        }

                        Icon(
                            imageVector = Icons.Default.ChevronRight,
                            contentDescription = "Open",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        // Floating Action Button to Add Custom Cards
        FloatingActionButton(
            onClick = onNavigateToAddCard,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(20.dp),
            containerColor = MedNavyPrimary,
            contentColor = Color.White,
            shape = CircleShape
        ) {
            Icon(imageVector = Icons.Default.Add, contentDescription = "Add Flashcard")
        }
    }
}

@Composable
private fun QuickToolCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = title,
                    tint = accentColor,
                    modifier = Modifier.size(22.dp)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = title,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )

            Text(
                text = subtitle,
                fontSize = 10.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun parseHexColor(hex: String): Color {
    return try {
        Color(android.graphics.Color.parseColor(hex))
    } catch (e: Exception) {
        MedNavyPrimary
    }
}
