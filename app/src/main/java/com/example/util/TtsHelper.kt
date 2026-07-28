package com.example.util

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

class TtsHelper(context: Context) : TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = TextToSpeech(context.applicationContext, this)
    private var isInitialized = false

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            isInitialized = true
            tts?.language = Locale.ENGLISH
        }
    }

    fun speak(text: String, isFrench: Boolean = false) {
        if (!isInitialized || text.isBlank()) return
        tts?.language = if (isFrench) Locale.FRENCH else Locale.ENGLISH
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "MedAnkiTts")
    }

    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
    }
}
