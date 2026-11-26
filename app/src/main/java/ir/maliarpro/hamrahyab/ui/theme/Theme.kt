package ir.maliarpro.hamrahyab.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val HamrahYabColors = lightColorScheme(
    primary = Color(0xFF176B87),
    onPrimary = Color.White,
    secondary = Color(0xFF3C7D75),
    background = Color(0xFFF5F8FA),
    surface = Color.White,
    onSurface = Color(0xFF172B36),
    onBackground = Color(0xFF172B36)
)

@Composable
fun HamrahYabTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = HamrahYabColors,
        content = content
    )
}
