package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "decks")
data class Deck(
    @PrimaryKey val id: String,
    val titleEn: String,
    val titleFr: String,
    val module: String, // Anatomie, Biochimie, Physiologie, Histologie, Cytologie
    val year: Int, // 1 or 2
    val descriptionEn: String,
    val descriptionFr: String,
    val cardCount: Int,
    val colorHex: String,
    val isPremium: Boolean = false
)
