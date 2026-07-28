package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "srs_states")
data class SrsCardState(
    @PrimaryKey val cardId: String,
    val state: String = "NEW", // NEW, LEARNING, REVIEW, RELEARNING
    val stability: Float = 1.0f,
    val difficulty: Float = 5.0f,
    val elapsedDays: Int = 0,
    val scheduledDays: Int = 0,
    val reps: Int = 0,
    val lapses: Int = 0,
    val lastReviewTimestamp: Long = 0L,
    val nextReviewTimestamp: Long = System.currentTimeMillis()
)

@Entity(tableName = "review_logs")
data class ReviewLog(
    @PrimaryKey val id: String,
    val cardId: String,
    val rating: Int, // 1=Again, 2=Hard, 3=Good, 4=Easy
    val reviewedTimestamp: Long = System.currentTimeMillis(),
    val durationMs: Long = 0L
)
