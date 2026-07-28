package com.example.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.MedNavyPrimary
import com.example.ui.theme.MedTealSecondary

@Composable
fun LanguageToggle(
    currentLang: String,
    onLangSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.Translate,
            contentDescription = "Language",
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(start = 6.dp, end = 4.dp)
                .size(16.dp)
        )

        // EN Option
        val isEn = currentLang == "EN"
        val enBg by animateColorAsState(if (isEn) MedNavyPrimary else Color.Transparent, label = "enBg")
        val enTextColor by animateColorAsState(if (isEn) Color.White else MaterialTheme.colorScheme.onSurface, label = "enText")

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(16.dp))
                .background(enBg)
                .clickable { onLangSelected("EN") }
                .padding(horizontal = 10.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "EN (Main)",
                fontSize = 12.sp,
                fontWeight = if (isEn) FontWeight.Bold else FontWeight.Medium,
                color = enTextColor
            )
        }

        // FR Option
        val isFr = currentLang == "FR"
        val frBg by animateColorAsState(if (isFr) MedTealSecondary else Color.Transparent, label = "frBg")
        val frTextColor by animateColorAsState(if (isFr) Color.White else MaterialTheme.colorScheme.onSurface, label = "frText")

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(16.dp))
                .background(frBg)
                .clickable { onLangSelected("FR") }
                .padding(horizontal = 10.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "FR (Option)",
                fontSize = 12.sp,
                fontWeight = if (isFr) FontWeight.Bold else FontWeight.Medium,
                color = frTextColor
            )
        }
    }
}
