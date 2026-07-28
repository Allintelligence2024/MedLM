package com.example.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.example.data.model.CardItem
import com.example.data.model.Deck
import com.example.data.model.ExamAttempt
import com.example.data.model.ReviewLog
import com.example.data.model.SrsCardState
import com.example.data.model.UserStats
import kotlinx.coroutines.flow.Flow

@Dao
interface MedDao {

    // Decks
    @Query("SELECT * FROM decks ORDER BY module ASC")
    fun getAllDecks(): Flow<List<Deck>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDecks(decks: List<Deck>)

    // Cards
    @Query("SELECT * FROM cards WHERE deckId = :deckId")
    fun getCardsForDeck(deckId: String): Flow<List<CardItem>>

    @Query("SELECT * FROM cards")
    fun getAllCards(): Flow<List<CardItem>>

    @Query("SELECT * FROM cards WHERE id = :cardId")
    suspend fun getCardById(cardId: String): CardItem?

    @Query("SELECT * FROM cards WHERE type = 'QCM'")
    fun getQcmCards(): Flow<List<CardItem>>

    @Query("SELECT * FROM cards WHERE type = 'QCM' AND (facultyTag LIKE '%' || :faculty || '%' OR :faculty = 'All')")
    fun getQcmCardsByFaculty(faculty: String): Flow<List<CardItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCards(cards: List<CardItem>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCard(card: CardItem)

    // SRS States
    @Query("SELECT * FROM srs_states")
    fun getAllSrsStates(): Flow<List<SrsCardState>>

    @Query("SELECT * FROM srs_states WHERE cardId = :cardId")
    suspend fun getSrsState(cardId: String): SrsCardState?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSrsState(srsCardState: SrsCardState)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSrsStates(srsCardStates: List<SrsCardState>)

    // Review Logs
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReviewLog(reviewLog: ReviewLog)

    @Query("SELECT * FROM review_logs ORDER BY reviewedTimestamp DESC")
    fun getAllReviewLogs(): Flow<List<ReviewLog>>

    // User Stats
    @Query("SELECT * FROM user_stats WHERE id = 1")
    fun getUserStats(): Flow<UserStats?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun updateUserStats(stats: UserStats)

    // Exam Attempts
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertExamAttempt(attempt: ExamAttempt)

    @Query("SELECT * FROM exam_attempts ORDER BY timestamp DESC")
    fun getExamAttempts(): Flow<List<ExamAttempt>>
}
