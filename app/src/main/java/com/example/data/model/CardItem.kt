package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cards")
data class CardItem(
    @PrimaryKey val id: String,
    val deckId: String,
    val type: String, // "BASIC", "CLOZE", "QCM"
    val frontEn: String,
    val frontFr: String,
    val backEn: String,
    val backFr: String,
    val explanationEn: String = "",
    val explanationFr: String = "",
    val medicalTermEn: String = "",
    val medicalTermFr: String = "",
    val mnemonicEn: String = "",
    val mnemonicFr: String = "",
    val optionsJson: String? = null, // JSON string for QCM choices if type == QCM
    val facultyTag: String = "Faculté d'Alger" // e.g. Alger 2023, Oran 2022
)

// Data class to parse QCM options
data class QcmOption(
    val id: String, // "A", "B", "C", "D", "E"
    val textEn: String,
    val textFr: String,
    val isCorrect: Boolean,
    val explanationEn: String = "",
    val explanationFr: String = ""
)
