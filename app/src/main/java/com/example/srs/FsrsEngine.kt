package com.example.srs

import com.example.data.model.SrsCardState
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min

object FsrsEngine {

    const val RATING_AGAIN = 1
    const val RATING_HARD = 2
    const val RATING_GOOD = 3
    const val RATING_EASY = 4

    private const val ONE_DAY_MS = 86400000L

    fun calculateNextState(
        currentState: SrsCardState,
        rating: Int,
        nowTimestamp: Long = System.currentTimeMillis()
    ): SrsCardState {
        var difficulty = currentState.difficulty
        var stability = currentState.stability
        var reps = currentState.reps + 1
        var lapses = currentState.lapses

        // Update Difficulty (d in range 1.0 to 10.0)
        val dChange = when (rating) {
            RATING_AGAIN -> 0.8f
            RATING_HARD -> 0.3f
            RATING_GOOD -> 0.0f
            RATING_EASY -> -0.5f
            else -> 0.0f
        }
        difficulty = min(10.0f, max(1.0f, difficulty + dChange))

        // Calculate retrievability at current interval
        val elapsedDays = if (currentState.lastReviewTimestamp > 0) {
            max(0, ((nowTimestamp - currentState.lastReviewTimestamp) / ONE_DAY_MS).toInt())
        } else {
            0
        }

        val newScheduledDays: Int
        val newState: String

        when (rating) {
            RATING_AGAIN -> {
                lapses += 1
                stability = max(0.5f, stability * 0.4f)
                newScheduledDays = 1
                newState = "RELEARNING"
            }
            RATING_HARD -> {
                stability = max(1.0f, stability * 1.3f)
                newScheduledDays = max(2, (stability * 0.9f).toInt())
                newState = "REVIEW"
            }
            RATING_GOOD -> {
                stability = max(2.0f, stability * (1.0f + (11.0f - difficulty) * 0.25f))
                newScheduledDays = max(3, stability.toInt())
                newState = "REVIEW"
            }
            RATING_EASY -> {
                stability = max(5.0f, stability * (1.0f + (11.0f - difficulty) * 0.45f) * 1.3f)
                newScheduledDays = max(7, (stability * 1.5f).toInt())
                newState = "REVIEW"
            }
            else -> {
                newScheduledDays = 1
                newState = currentState.state
            }
        }

        val nextReviewTimestamp = nowTimestamp + (newScheduledDays * ONE_DAY_MS)

        return currentState.copy(
            state = newState,
            stability = stability,
            difficulty = difficulty,
            elapsedDays = elapsedDays,
            scheduledDays = newScheduledDays,
            reps = reps,
            lapses = lapses,
            lastReviewTimestamp = nowTimestamp,
            nextReviewTimestamp = nextReviewTimestamp
        )
    }

    fun getRetrievability(state: SrsCardState, nowTimestamp: Long = System.currentTimeMillis()): Float {
        if (state.lastReviewTimestamp <= 0L) return 0.0f
        val days = ((nowTimestamp - state.lastReviewTimestamp) / ONE_DAY_MS).toFloat()
        if (days <= 0) return 1.0f
        return exp(-days / (9.0f * state.stability)).coerceIn(0.0f, 1.0f)
    }
}
