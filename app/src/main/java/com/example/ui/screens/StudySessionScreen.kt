package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.CardItem
import com.example.srs.FsrsEngine
import com.example.ui.components.FlipCard
import com.example.ui.components.LanguageToggle
import com.example.ui.theme.MedGreenSuccess
import com.example.ui.theme.MedNavyPrimary
import com.example.ui.theme.MedOrangeHard
import com.example.ui.theme.MedRedPulse
import com.example.ui.theme.MedTealSecondary

@Composable
fun StudySessionScreen(
    cardsToStudy: List<CardItem>,
    langPref: String,
    onRecordReview: (String, Int) -> Unit,
    onLangSelected: (String) -> Unit,
    onSpeak: (String, Boolean) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var currentIndex by remember { mutableIntStateOf(0) }
    var isFlipped by remember { mutableStateOf(false) }
    var reviewsCompletedCount by remember { mutableIntStateOf(0) }
    var isCompleted by remember { mutableStateOf(false) }

    if (cardsToStudy.isEmpty() || currentIndex >= cardsToStudy.size) {
        isCompleted = true
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.Default.ArrowBack,
                        contentDescription = "Back",
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }

                if (!isCompleted) {
                    Text(
                        text = "Card ${currentIndex + 1} of ${cardsToStudy.size}",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                } else {
                    Text(
                        text = if (langPref == "FR") "Session Terminée" else "Session Complete",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                LanguageToggle(
                    currentLang = langPref,
                    onLangSelected = onLangSelected
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            if (!isCompleted && currentIndex < cardsToStudy.size) {
                val currentCard = cardsToStudy[currentIndex]
                val progress = (currentIndex + 1).toFloat() / cardsToStudy.size.toFloat()

                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    // Progress Bar
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(CircleShape),
                        color = MedTealSecondary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // 3D Flip Card
                    FlipCard(
                        card = currentCard,
                        isFlipped = isFlipped,
                        onFlip = { isFlipped = !isFlipped },
                        langPref = langPref,
                        onSpeak = onSpeak,
                        modifier = Modifier.weight(1f)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Rating Buttons Bar (shown when card is flipped or tap to flip hint)
                    if (isFlipped) {
                        AnimatedVisibility(
                            visible = true,
                            enter = fadeIn() + slideInVertically { it / 2 }
                        ) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = if (langPref == "FR") "Comment évaluez-vous votre rappel ?" else "Rate your recall quality:",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(bottom = 8.dp),
                                    textAlign = TextAlign.Center
                                )

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    // Again (1d)
                                    RatingButton(
                                        label = if (langPref == "FR") "Avoir (1j)" else "Again (1d)",
                                        color = MedRedPulse,
                                        onClick = {
                                            onRecordReview(currentCard.id, FsrsEngine.RATING_AGAIN)
                                            reviewsCompletedCount++
                                            isFlipped = false
                                            currentIndex++
                                        },
                                        modifier = Modifier.weight(1f)
                                    )

                                    // Hard (2d)
                                    RatingButton(
                                        label = if (langPref == "FR") "Difficile (2j)" else "Hard (2d)",
                                        color = MedOrangeHard,
                                        onClick = {
                                            onRecordReview(currentCard.id, FsrsEngine.RATING_HARD)
                                            reviewsCompletedCount++
                                            isFlipped = false
                                            currentIndex++
                                        },
                                        modifier = Modifier.weight(1f)
                                    )

                                    // Good (8d)
                                    RatingButton(
                                        label = if (langPref == "FR") "Bon (8j)" else "Good (8d)",
                                        color = MedGreenSuccess,
                                        onClick = {
                                            onRecordReview(currentCard.id, FsrsEngine.RATING_GOOD)
                                            reviewsCompletedCount++
                                            isFlipped = false
                                            currentIndex++
                                        },
                                        modifier = Modifier.weight(1f)
                                    )

                                    // Easy (21d)
                                    RatingButton(
                                        label = if (langPref == "FR") "Facile (21j)" else "Easy (21d)",
                                        color = MedNavyPrimary,
                                        onClick = {
                                            onRecordReview(currentCard.id, FsrsEngine.RATING_EASY)
                                            reviewsCompletedCount++
                                            isFlipped = false
                                            currentIndex++
                                        },
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                            }
                        }
                    } else {
                        Button(
                            onClick = { isFlipped = true },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = MedNavyPrimary)
                        ) {
                            Text(
                                text = if (langPref == "FR") "Afficher la réponse" else "Show Answer",
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }
                }
            } else {
                // SESSION COMPLETED CELEBRATION
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(90.dp)
                            .clip(CircleShape)
                            .background(MedTealSecondary.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.EmojiEvents,
                            contentDescription = "Trophy",
                            tint = MedTealSecondary,
                            modifier = Modifier.size(50.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Text(
                        text = if (langPref == "FR") "Session Complétée avec Succès !" else "SRS Session Completed!",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = if (langPref == "FR") "Vous avez révisé $reviewsCompletedCount cartes aujourd'hui. Votre mémoire à long terme se renforce !" else "You reviewed $reviewsCompletedCount flashcards. Your long-term medical recall is strengthening!",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 24.dp)
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = "XP",
                                tint = MedTealSecondary
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "+${reviewsCompletedCount * 15} XP Earned!",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = MedTealSecondary
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(32.dp))

                    Button(
                        onClick = onBack,
                        modifier = Modifier.fillMaxWidth(0.8f),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MedNavyPrimary)
                    ) {
                        Text(
                            text = if (langPref == "FR") "Retour au Tableau de Bord" else "Return to Dashboard",
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RatingButton(
    label: String,
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = color),
        contentPadding = PaddingValues(2.dp)
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            textAlign = TextAlign.Center
        )
    }
}
