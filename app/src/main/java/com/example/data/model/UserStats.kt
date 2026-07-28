package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "user_stats")
data class UserStats(
    @PrimaryKey val id: Int = 1,
    val xp: Int = 120,
    val levelTitle: String = "P1 Medical Student",
    val streakCount: Int = 5,
    val lastStudyDate: String = "",
    val streakFreezeAvailable: Int = 2,
    val langPref: String = "EN", // "EN" or "FR"
    val selectedFaculty: String = "All"
)

@Entity(tableName = "exam_attempts")
data class ExamAttempt(
    @PrimaryKey val id: String,
    val timestamp: Long = System.currentTimeMillis(),
    val totalQuestions: Int,
    val correctAnswers: Int,
    val scorePercentage: Float,
    val durationSeconds: Long,
    val module: String
)
