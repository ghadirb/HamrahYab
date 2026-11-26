package ir.maliarpro.hamrahyab

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import ir.maliarpro.hamrahyab.ui.HamrahYabApp
import ir.maliarpro.hamrahyab.ui.theme.HamrahYabTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HamrahYabTheme {
                HamrahYabApp()
            }
        }
    }
}
