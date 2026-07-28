package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.data.local.AppDatabase
import com.example.data.repository.MedRepository
import com.example.ui.screens.AddCardScreen
import com.example.ui.screens.DashboardScreen
import com.example.ui.screens.GlossaryScreen
import com.example.ui.screens.MockExamScreen
import com.example.ui.screens.QcmBankScreen
import com.example.ui.screens.StatsScreen
import com.example.ui.screens.StudySessionScreen
import com.example.ui.theme.MedAnkiTheme
import com.example.ui.theme.MedNavyPrimary
import com.example.ui.viewmodel.MedViewModel
import com.example.ui.viewmodel.MedViewModelFactory

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val db = AppDatabase.getInstance(applicationContext)
        val repository = MedRepository(db.medDao())

        setContent {
            MedAnkiTheme {
                val viewModel: MedViewModel = viewModel(
                    factory = MedViewModelFactory(application, repository)
                )

                val userStats by viewModel.userStats.collectAsStateWithLifecycle()
                val dueCards by viewModel.dueCards.collectAsStateWithLifecycle()
                val allDecks by viewModel.allDecks.collectAsStateWithLifecycle()
                val allCards by viewModel.allCards.collectAsStateWithLifecycle()
                val srsStates by viewModel.srsStates.collectAsStateWithLifecycle()
                val examAttempts by viewModel.examAttempts.collectAsStateWithLifecycle()

                val navController = rememberNavController()
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = navBackStackEntry?.destination?.route

                val showBottomBar = currentRoute in listOf("dashboard", "qcm", "glossary", "stats")

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    bottomBar = {
                        if (showBottomBar) {
                            Surface(
                                shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                                shadowElevation = 10.dp,
                                color = Color.White
                            ) {
                                NavigationBar(
                                    containerColor = Color.White,
                                    tonalElevation = 0.dp
                                ) {
                                    val itemColors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = MedNavyPrimary,
                                        selectedTextColor = MedNavyPrimary,
                                        indicatorColor = Color(0xFFEEF2FF),
                                        unselectedIconColor = com.example.ui.theme.OnSurfaceVariantMuted,
                                        unselectedTextColor = com.example.ui.theme.OnSurfaceVariantMuted
                                    )

                                    NavigationBarItem(
                                        selected = currentRoute == "dashboard",
                                        colors = itemColors,
                                        onClick = {
                                            navController.navigate("dashboard") {
                                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                                launchSingleTop = true
                                                restoreState = true
                                            }
                                        },
                                        icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                                        label = { Text("Home", fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
                                    )

                                    NavigationBarItem(
                                        selected = currentRoute == "qcm",
                                        colors = itemColors,
                                        onClick = {
                                            navController.navigate("qcm") {
                                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                                launchSingleTop = true
                                                restoreState = true
                                            }
                                        },
                                        icon = { Icon(Icons.Default.Quiz, contentDescription = "QCM Bank") },
                                        label = { Text("QCM Bank", fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
                                    )

                                    NavigationBarItem(
                                        selected = currentRoute == "glossary",
                                        colors = itemColors,
                                        onClick = {
                                            navController.navigate("glossary") {
                                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                                launchSingleTop = true
                                                restoreState = true
                                            }
                                        },
                                        icon = { Icon(Icons.Default.Book, contentDescription = "Glossary") },
                                        label = { Text("Glossary", fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
                                    )

                                    NavigationBarItem(
                                        selected = currentRoute == "stats",
                                        colors = itemColors,
                                        onClick = {
                                            navController.navigate("stats") {
                                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                                launchSingleTop = true
                                                restoreState = true
                                            }
                                        },
                                        icon = { Icon(Icons.Default.Insights, contentDescription = "Stats") },
                                        label = { Text("Stats", fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
                                    )
                                }
                            }
                        }
                    }
                ) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = "dashboard",
                        modifier = Modifier.padding(innerPadding)
                    ) {
                        // DASHBOARD
                        composable("dashboard") {
                            DashboardScreen(
                                userStats = userStats,
                                dueCards = dueCards,
                                allDecks = allDecks,
                                onStartStudy = { deckId ->
                                    val route = if (deckId != null) "study?deckId=$deckId" else "study"
                                    navController.navigate(route)
                                },
                                onNavigateToQcm = { navController.navigate("qcm") },
                                onNavigateToExam = { navController.navigate("exam") },
                                onNavigateToGlossary = { navController.navigate("glossary") },
                                onNavigateToAddCard = { navController.navigate("addCard") },
                                onLangSelected = { lang -> viewModel.setLanguagePref(lang) }
                            )
                        }

                        // STUDY SESSION
                        composable(
                            route = "study?deckId={deckId}",
                            arguments = listOf(navArgument("deckId") {
                                type = NavType.StringType
                                nullable = true
                                defaultValue = null
                            })
                        ) { backStack ->
                            val selectedDeckId = backStack.arguments?.getString("deckId")
                            val cardsForStudy = if (selectedDeckId != null) {
                                allCards.filter { it.deckId == selectedDeckId }
                            } else {
                                if (dueCards.isNotEmpty()) dueCards else allCards
                            }

                            StudySessionScreen(
                                cardsToStudy = cardsForStudy,
                                langPref = userStats.langPref,
                                onRecordReview = { cardId, rating -> viewModel.recordReview(cardId, rating) },
                                onLangSelected = { lang -> viewModel.setLanguagePref(lang) },
                                onSpeak = { text, isFr -> viewModel.speak(text, isFr) },
                                onBack = { navController.popBackStack() }
                            )
                        }

                        // QCM BANK
                        composable("qcm") {
                            val qcmCards = allCards.filter { it.type == "QCM" }
                            QcmBankScreen(
                                qcmCards = qcmCards,
                                selectedFaculty = userStats.selectedFaculty,
                                langPref = userStats.langPref,
                                onFacultySelected = { fac -> viewModel.setSelectedFaculty(fac) },
                                onLangSelected = { lang -> viewModel.setLanguagePref(lang) },
                                onBack = { navController.popBackStack() }
                            )
                        }

                        // MOCK EXAM
                        composable("exam") {
                            val qcmCards = allCards.filter { it.type == "QCM" }
                            MockExamScreen(
                                qcmCards = qcmCards,
                                langPref = userStats.langPref,
                                onSubmitExam = { total, correct, durationSec, module ->
                                    viewModel.submitMockExam(total, correct, durationSec, module)
                                },
                                onLangSelected = { lang -> viewModel.setLanguagePref(lang) },
                                onBack = { navController.popBackStack() }
                            )
                        }

                        // GLOSSARY
                        composable("glossary") {
                            GlossaryScreen(
                                allCards = allCards,
                                langPref = userStats.langPref,
                                onSpeak = { text, isFr -> viewModel.speak(text, isFr) },
                                onLangSelected = { lang -> viewModel.setLanguagePref(lang) },
                                onBack = { navController.popBackStack() }
                            )
                        }

                        // STATS
                        composable("stats") {
                            StatsScreen(
                                userStats = userStats,
                                srsStates = srsStates,
                                examAttempts = examAttempts,
                                langPref = userStats.langPref,
                                onLangSelected = { lang -> viewModel.setLanguagePref(lang) },
                                onBack = { navController.popBackStack() }
                            )
                        }

                        // ADD CARD
                        composable("addCard") {
                            AddCardScreen(
                                decks = allDecks,
                                langPref = userStats.langPref,
                                onSaveCard = { newCard -> viewModel.addCustomCard(newCard) },
                                onLangSelected = { lang -> viewModel.setLanguagePref(lang) },
                                onBack = { navController.popBackStack() }
                            )
                        }
                    }
                }
            }
        }
    }
}
