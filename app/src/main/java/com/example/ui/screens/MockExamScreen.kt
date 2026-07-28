package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
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
import com.example.data.model.QcmOption
import com.example.ui.components.LanguageToggle
import com.example.ui.theme.MedGreenSuccess
import com.example.ui.theme.MedNavyPrimary
import com.example.ui.theme.MedRedPulse
import com.example.ui.theme.MedTealSecondary
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MockExamScreen(
    qcmCards: List<CardItem>,
    langPref: String,
    onSubmitExam: (Int, Int, Long, String) -> Unit,
    onLangSelected: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var examTimeSeconds by remember { mutableIntStateOf(600) } // 10 minutes
    var isTimerRunning by remember { mutableStateOf(true) }
    var currentQuestionIndex by remember { mutableIntStateOf(0) }
    val userAnswers = remember { mutableStateMapOf<Int, String>() }
    var isSubmitted by remember { mutableStateOf(false) }

    val examQuestions = remember(qcmCards) { qcmCards.take(10) }

    // Countdown Timer Loop
    LaunchedEffect(isTimerRunning, examTimeSeconds) {
        if (isTimerRunning && examTimeSeconds > 0 && !isSubmitted) {
            delay(1000L)
            examTimeSeconds--
        } else if (examTimeSeconds <= 0 && !isSubmitted) {
            isSubmitted = true
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (langPref == "FR") "Examen Blanc Chronométré" else "Timed Mock Exam",
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            if (!isSubmitted && examQuestions.isNotEmpty() && currentQuestionIndex < examQuestions.size) {
                val card = examQuestions[currentQuestionIndex]
                val options = parseOptionsJson(card.optionsJson)
                val selectedOption = userAnswers[currentQuestionIndex]

                val minutes = examTimeSeconds / 60
                val seconds = examTimeSeconds % 60
                val timeFormatted = String.format("%02d:%02d", minutes, seconds)

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                ) {
                    // Timer & Progress Bar Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Timer,
                                contentDescription = "Timer",
                                tint = if (examTimeSeconds < 60) MedRedPulse else MedNavyPrimary
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = timeFormatted,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (examTimeSeconds < 60) MedRedPulse else MedNavyPrimary
                            )
                        }

                        Text(
                            text = "Question ${currentQuestionIndex + 1} / ${examQuestions.size}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    LinearProgressIndicator(
                        progress = { (currentQuestionIndex + 1).toFloat() / examQuestions.size.toFloat() },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(CircleShape),
                        color = MedNavyPrimary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // Question Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MedTealSecondary.copy(alpha = 0.12f)
                            ) {
                                Text(
                                    text = card.facultyTag,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MedTealSecondary
                                )
                            }

                            Spacer(modifier = Modifier.height(10.dp))

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

                    // Options list
                    options.forEach { option ->
                        val isOptionSelected = selectedOption == option.id

                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 10.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .border(
                                    1.5.dp,
                                    if (isOptionSelected) MedNavyPrimary else MaterialTheme.colorScheme.outline.copy(alpha = 0.3f),
                                    RoundedCornerShape(16.dp)
                                )
                                .clickable { userAnswers[currentQuestionIndex] = option.id },
                            colors = CardDefaults.cardColors(
                                containerColor = if (isOptionSelected) MedNavyPrimary.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surface
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(30.dp)
                                        .clip(CircleShape)
                                        .background(if (isOptionSelected) MedNavyPrimary else MaterialTheme.colorScheme.surfaceVariant),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = option.id,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (isOptionSelected) Color.White else MaterialTheme.colorScheme.onSurface
                                    )
                                }

                                Spacer(modifier = Modifier.width(12.dp))

                                val optText = if (langPref == "FR" && option.textFr.isNotBlank()) option.textFr else option.textEn

                                Text(
                                    text = optText,
                                    fontSize = 14.sp,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Navigation buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        if (currentQuestionIndex > 0) {
                            Button(
                                onClick = { currentQuestionIndex-- },
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                            ) {
                                Text(
                                    text = if (langPref == "FR") "Précédent" else "Previous",
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        } else {
                            Spacer(modifier = Modifier.width(1.dp))
                        }

                        if (currentQuestionIndex < examQuestions.size - 1) {
                            Button(
                                onClick = { currentQuestionIndex++ },
                                colors = ButtonDefaults.buttonColors(containerColor = MedNavyPrimary)
                            ) {
                                Text(
                                    text = if (langPref == "FR") "Suivant" else "Next Question",
                                    color = Color.White
                                )
                            }
                        } else {
                            Button(
                                onClick = {
                                    isSubmitted = true
                                    val duration = 600L - examTimeSeconds
                                    var correct = 0
                                    examQuestions.forEachIndexed { idx, q ->
                                        val opts = parseOptionsJson(q.optionsJson)
                                        val correctOpt = opts.find { it.isCorrect }?.id
                                        if (userAnswers[idx] == correctOpt) correct++
                                    }
                                    onSubmitExam(examQuestions.size, correct, duration, "Mixed Module")
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = MedGreenSuccess)
                            ) {
                                Text(
                                    text = if (langPref == "FR") "Soumettre l'Examen" else "Submit Exam",
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }
            } else {
                // EXAM RESULT SUMMARY SCORECARD
                var correctCount = 0
                examQuestions.forEachIndexed { idx, q ->
                    val opts = parseOptionsJson(q.optionsJson)
                    val correctOpt = opts.find { it.isCorrect }?.id
                    if (userAnswers[idx] == correctOpt) correctCount++
                }

                val scorePercent = if (examQuestions.isNotEmpty()) (correctCount.toFloat() / examQuestions.size) * 100f else 0f
                val isPassed = scorePercent >= 60f

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState()),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(90.dp)
                            .clip(CircleShape)
                            .background(if (isPassed) MedGreenSuccess.copy(alpha = 0.15f) else MedRedPulse.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isPassed) Icons.Default.EmojiEvents else Icons.Default.CheckCircle,
                            contentDescription = "Result",
                            tint = if (isPassed) MedGreenSuccess else MedRedPulse,
                            modifier = Modifier.size(50.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = if (isPassed) {
                            if (langPref == "FR") "Examen Réussi ! 🎉" else "Exam Passed! 🎉"
                        } else {
                            if (langPref == "FR") "Continuez vos révisions 💪" else "Keep Reviewing 💪"
                        },
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Score: ${scorePercent.toInt()}% ($correctCount / ${examQuestions.size} correct)",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isPassed) MedGreenSuccess else MedRedPulse
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Card(
                        modifier = Modifier.fillMaxWidth(0.9f),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "+50 XP Awarded for Mock Exam Completion!",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = MedTealSecondary
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(28.dp))

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
