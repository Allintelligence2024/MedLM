package com.example.data.repository

import com.example.data.local.DatabaseInitializer
import com.example.data.local.MedDao
import com.example.data.model.CardItem
import com.example.data.model.Deck
import com.example.data.model.ExamAttempt
import com.example.data.model.ReviewLog
import com.example.data.model.SrsCardState
import com.example.data.model.UserStats
import com.example.srs.FsrsEngine
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import java.util.UUID

class MedRepository(private val dao: MedDao) {

    val allDecks: Flow<List<Deck>> = dao.getAllDecks()
    val allCards: Flow<List<CardItem>> = dao.getAllCards()
    val userStats: Flow<UserStats?> = dao.getUserStats()
    val examAttempts: Flow<List<ExamAttempt>> = dao.getExamAttempts()

    suspend fun initializeSeedDataIfNeeded() {
        val existingDecks = dao.getAllDecks().firstOrNull()
        if (existingDecks.isNullOrEmpty()) {
            dao.insertDecks(DatabaseInitializer.seedDecks)
            dao.insertCards(DatabaseInitializer.seedCards)
            dao.insertSrsStates(DatabaseInitializer.createInitialSrsStates(DatabaseInitializer.seedCards))
            dao.updateUserStats(DatabaseInitializer.initialUserStats)
        }
    }

    fun getCardsForDeck(deckId: String): Flow<List<CardItem>> {
        return dao.getCardsForDeck(deckId)
    }

    fun getQcmCards(faculty: String): Flow<List<CardItem>> {
        return dao.getQcmCardsByFaculty(faculty)
    }

    fun getAllSrsStates(): Flow<List<SrsCardState>> {
        return dao.getAllSrsStates()
    }

    suspend fun getSrsStateForCard(cardId: String): SrsCardState {
        return dao.getSrsState(cardId) ?: SrsCardState(cardId = cardId)
    }

    suspend fun recordReview(cardId: String, rating: Int, durationMs: Long = 0L) {
        val currentState = getSrsStateForCard(cardId)
        val newState = FsrsEngine.calculateNextState(currentState, rating)

        dao.insertSrsState(newState)
        dao.insertReviewLog(
            ReviewLog(
                id = UUID.randomUUID().toString(),
                cardId = cardId,
                rating = rating,
                reviewedTimestamp = System.currentTimeMillis(),
                durationMs = durationMs
            )
        )

        // Award XP & update stats
        val currentStats = dao.getUserStats().firstOrNull() ?: DatabaseInitializer.initialUserStats
        val newXp = currentStats.xp + 15
        val newLevelTitle = when {
            newXp >= 2000 -> "Resident Doctor"
            newXp >= 1000 -> "Intern Doctor"
            newXp >= 500 -> "P2 Medical Student"
            else -> "P1 Medical Student"
        }

        dao.updateUserStats(
            currentStats.copy(
                xp = newXp,
                levelTitle = newLevelTitle
            )
        )
    }

    suspend fun recordExamAttempt(total: Int, correct: Int, durationSeconds: Long, module: String) {
        val percentage = if (total > 0) (correct.toFloat() / total) * 100f else 0f
        val attempt = ExamAttempt(
            id = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis(),
            totalQuestions = total,
            correctAnswers = correct,
            scorePercentage = percentage,
            durationSeconds = durationSeconds,
            module = module
        )
        dao.insertExamAttempt(attempt)

        // Award +50 XP for exam completion
        val currentStats = dao.getUserStats().firstOrNull() ?: DatabaseInitializer.initialUserStats
        val newXp = currentStats.xp + 50
        val newLevelTitle = when {
            newXp >= 2000 -> "Resident Doctor"
            newXp >= 1000 -> "Intern Doctor"
            newXp >= 500 -> "P2 Medical Student"
            else -> "P1 Medical Student"
        }
        dao.updateUserStats(currentStats.copy(xp = newXp, levelTitle = newLevelTitle))
    }

    suspend fun updateLanguagePref(lang: String) {
        val currentStats = dao.getUserStats().firstOrNull() ?: DatabaseInitializer.initialUserStats
        dao.updateUserStats(currentStats.copy(langPref = lang))
    }

    suspend fun updateSelectedFaculty(faculty: String) {
        val currentStats = dao.getUserStats().firstOrNull() ?: DatabaseInitializer.initialUserStats
        dao.updateUserStats(currentStats.copy(selectedFaculty = faculty))
    }

    suspend fun addCustomCard(card: CardItem) {
        dao.insertCard(card)
        dao.insertSrsState(SrsCardState(cardId = card.id))
    }
}
