package com.example.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.example.data.model.CardItem
import com.example.data.model.Deck
import com.example.data.model.ExamAttempt
import com.example.data.model.ReviewLog
import com.example.data.model.SrsCardState
import com.example.data.model.UserStats

@Database(
    entities = [
        Deck::class,
        CardItem::class,
        SrsCardState::class,
        ReviewLog::class,
        UserStats::class,
        ExamAttempt::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun medDao(): MedDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "medanki_dz_database"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
