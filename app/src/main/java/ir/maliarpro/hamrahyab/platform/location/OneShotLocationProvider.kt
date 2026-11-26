package ir.maliarpro.hamrahyab.platform.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import ir.maliarpro.hamrahyab.core.location.LocationAssessment
import ir.maliarpro.hamrahyab.core.location.LocationQualityPolicy
import ir.maliarpro.hamrahyab.core.location.LocationSnapshot

/**
 * Captures one fresh location after an explicit user action.
 *
 * Updates are removed as soon as a usable fix arrives or the short timeout expires.
 * This provider never requests background location or keeps a continuous listener.
 */
class OneShotLocationProvider(
    context: Context,
    private val timeoutMillis: Long = 20_000L,
    private val qualityPolicy: LocationQualityPolicy = LocationQualityPolicy()
) {
    private val appContext = context.applicationContext
    private val manager = appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private val handler = Handler(Looper.getMainLooper())

    fun request(callback: (Result<LocationSnapshot>) -> Unit) {
        val fine = appContext.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = appContext.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            callback(Result.failure(SecurityException("مجوز موقعیت مکانی داده نشده است.")))
            return
        }

        val providers = try {
            manager.getProviders(true).filter {
                it == LocationManager.GPS_PROVIDER || it == LocationManager.NETWORK_PROVIDER
            }
        } catch (error: SecurityException) {
            callback(Result.failure(error))
            return
        }

        if (providers.isEmpty()) {
            callback(Result.failure(IllegalStateException("مکان‌یاب گوشی خاموش است یا ارائه‌دهنده‌ای در دسترس نیست.")))
            return
        }

        var best: Location? = null
        var completed = false
        var timeoutRunnable: Runnable? = null
        val listeners = mutableListOf<LocationListener>()

        fun finish(result: Result<LocationSnapshot>) {
            if (completed) return
            completed = true
            timeoutRunnable?.let(handler::removeCallbacks)
            listeners.forEach { listener ->
                runCatching { manager.removeUpdates(listener) }
            }
            callback(result)
        }

        fun consider(location: Location) {
            val snapshot = location.toSnapshot()
            if (qualityPolicy.assess(snapshot, System.currentTimeMillis()) != LocationAssessment.USABLE) {
                return
            }
            if (best == null || location.accuracy < (best?.accuracy ?: Float.MAX_VALUE)) {
                best = location
            }
            if (location.accuracy <= LocationQualityPolicy.DEFAULT_MAX_ACCURACY_METERS) {
                finish(Result.success(snapshot))
            }
        }

        timeoutRunnable = Runnable {
            val candidate = best
            if (candidate != null) {
                finish(Result.success(candidate.toSnapshot()))
            } else {
                finish(Result.failure(IllegalStateException(
                    "در مهلت تعیین‌شده موقعیت تازه و با دقت کافی دریافت نشد."
                )))
            }
        }

        providers.forEach { provider ->
            if (completed) return@forEach
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) = consider(location)
                @Deprecated("Deprecated by Android")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
                override fun onProviderEnabled(provider: String) = Unit
                override fun onProviderDisabled(provider: String) = Unit
            }
            listeners += listener
            try {
                manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
                manager.getLastKnownLocation(provider)?.let(::consider)
            } catch (error: SecurityException) {
                finish(Result.failure(error))
                return
            }
        }

        if (!completed) timeoutRunnable?.let { handler.postDelayed(it, timeoutMillis) }
    }

    @Suppress("DEPRECATION")
    private fun Location.toSnapshot() = LocationSnapshot(
        latitude = latitude,
        longitude = longitude,
        accuracyMeters = accuracy,
        capturedAtEpochMillis = time,
        provider = provider ?: "unknown",
        isMocked = if (android.os.Build.VERSION.SDK_INT >= 31) isMock else isFromMockProvider
    )
}