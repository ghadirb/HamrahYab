package ir.maliarpro.hamrahyab

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import ir.maliarpro.hamrahyab.core.location.LocationQualityPolicy
import ir.maliarpro.hamrahyab.data.local.HamrahYabDatabase
import ir.maliarpro.hamrahyab.data.local.LocalLocationRepository
import ir.maliarpro.hamrahyab.platform.location.OneShotLocationProvider
import ir.maliarpro.hamrahyab.ui.HamrahYabApp
import ir.maliarpro.hamrahyab.ui.theme.HamrahYabTheme
import kotlinx.coroutines.launch
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Date

class MainActivity : ComponentActivity() {
    private lateinit var repository: LocalLocationRepository
    private lateinit var locationProvider: OneShotLocationProvider
    private var lastLocation by mutableStateOf<ir.maliarpro.hamrahyab.core.location.LocationSnapshot?>(null)
    private var locationStatus by mutableStateOf("برای دریافت موقعیت، دکمه را لمس کنید.")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = LocalLocationRepository(HamrahYabDatabase.getInstance(this).dao())
        locationProvider = OneShotLocationProvider(this)

        lifecycleScope.launch {
            repository.observeLastLocation().collect { lastLocation = it }
        }

        setContent {
            HamrahYabTheme {
                HamrahYabApp(
                    lastLocation = lastLocation,
                    locationStatus = locationStatus,
                    onCaptureLocation = ::captureLocation
                )
            }
        }
    }

    private fun captureLocation() {
        locationStatus = "در حال دریافت موقعیت؛ حداکثر تا ۲۰ ثانیه..."
        locationProvider.request { result ->
            result.onSuccess { snapshot ->
                lifecycleScope.launch {
                    runCatching { repository.saveLocation(snapshot) }
                        .onSuccess {
                            val quality = LocationQualityPolicy().assess(snapshot, System.currentTimeMillis())
                            locationStatus = when (quality) {
                                ir.maliarpro.hamrahyab.core.location.LocationAssessment.USABLE ->
                                    "موقعیت با موفقیت ذخیره شد."
                                ir.maliarpro.hamrahyab.core.location.LocationAssessment.STALE ->
                                    "فقط موقعیت قبلی دریافت شد؛ داده تازه نیست."
                                ir.maliarpro.hamrahyab.core.location.LocationAssessment.INACCURATE ->
                                    "موقعیت دریافت شد، اما دقت آن پایین است."
                                ir.maliarpro.hamrahyab.core.location.LocationAssessment.MOCKED ->
                                    "هشدار: ارائه‌دهنده موقعیت را شبیه‌سازی‌شده علامت‌گذاری کرده است."
                                else -> "موقعیت ذخیره شد؛ کیفیت آن نیازمند بررسی است."
                            }
                        }
                        .onFailure { locationStatus = "ذخیره موقعیت انجام نشد: " + (it.message ?: "خطای نامشخص") }
                }
            }.onFailure {
                locationStatus = it.message ?: "دریافت موقعیت ناموفق بود."
            }
        }
    }
}
