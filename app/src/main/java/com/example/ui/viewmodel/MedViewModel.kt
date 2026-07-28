package com.example.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.data.local.AppDatabase
import com.example.data.model.CardItem
import com.example.data.model.Deck
import com.example.data.model.ExamAttempt
import com.example.data.model.SrsCardState
import com.example.data.model.UserStats
import com.example.data.repository.MedRepository
import com.example.util.TtsHelper
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MedViewModel(
    application: Application,
    private val repository: MedRepository
) : AndroidViewModel(application) {

    private val ttsHelper = TtsHelper(application)

    init {
        viewModelScope.launch {
            repository.initializeSeedDataIfNeeded()
        }
    }

    val userStats: StateFlow<UserStats> = repository.userStats
        .combine(repository.allDecks) { stats, _ ->
            stats ?: UserStats()
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = UserStats()
        )

    val allDecks: StateFlow<List<Deck>> = repository.allDecks
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val allCards: StateFlow<List<CardItem>> = repository.allCards
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val srsStates: StateFlow<List<SrsCardState>> = repository.getAllSrsStates()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val examAttempts: StateFlow<List<ExamAttempt>> = repository.examAttempts
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    // Calculate Due Cards reactively
    val dueCards: StateFlow<List<CardItem>> = combine(allCards, srsStates) { cards, states ->
        val now = System.currentTimeMillis()
        val dueStateMap = states.filter { it.nextReviewTimestamp <= now }.associateBy { it.cardId }
        cards.filter { card -> dueStateMap.containsKey(card.id) || !states.any { s -> s.cardId == card.id } }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = emptyList()
    )

    fun recordReview(cardId: String, rating: Int) {
        viewModelScope.launch {
            repository.recordReview(cardId, rating)
        }
    }

    fun setLanguagePref(lang: String) {
        viewModelScope.launch {
            repository.updateLanguagePref(lang)
        }
    }

    fun setSelectedFaculty(faculty: String) {
        viewModelScope.launch {
            repository.updateSelectedFaculty(faculty)
        }
    }

    fun submitMockExam(total: Int, correct: Int, durationSec: Long, module: String) {
        viewModelScope.launch {
            repository.recordExamAttempt(total, correct, durationSec, module)
        }
    }

    fun addCustomCard(card: CardItem) {
        viewModelScope.launch {
            repository.addCustomCard(card)
        }
    }

    fun speak(text: String, isFrench: Boolean = false) {
        ttsHelper.speak(text, isFrench)
    }

    override fun onCleared() {
        super.onCleared()
        ttsHelper.shutdown()
    }
}

class MedViewModelFactory(
    private val application: Application,
    private val repository: MedRepository
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(MedViewModel::class.java)) {
            return MedViewModel(application, repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
