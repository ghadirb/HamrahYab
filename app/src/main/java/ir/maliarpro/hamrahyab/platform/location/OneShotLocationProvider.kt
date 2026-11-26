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
import ir.maliarpro.hamrahyab.core.location.LocationSnapshot
class OneShotLocationProvider(context: Context, private val timeoutMillis: Long = 20_000L) {
 private val appContext = context.applicationContext
 private val manager = appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
 private val handler = Handler(Looper.getMainLooper())
 fun request(callback: (Result<LocationSnapshot>) -> Unit) {
  val fine = appContext.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
  val coarse = appContext.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
  if (!fine && !coarse) {
   callback(Result.failure(SecurityException("مجوز موقعیت مکانی داده نشده است."))); return
  }
  val providers = try { manager.getProviders(true).filter {
   it == LocationManager.GPS_PROVIDER || it == LocationManager.NETWORK_PROVIDER
  } } catch (e: SecurityException) { callback(Result.failure(e)); return }
  if (providers.isEmpty()) {
   callback(Result.failure(IllegalStateException("مکان‌یاب گوشی خاموش است یا ارائه‌دهنده‌ای در دسترس نیست."))); return
  }
  var best: Location? = null
  var completed = false
  val listeners = mutableListOf<LocationListener>()
  fun finish(result: Result<LocationSnapshot>) {
   if (completed) return
   completed = true
   handler.removeCallbacksAndMessages(null)
   listeners.forEach { runCatching { manager.removeUpdates(it) } }
   callback(result)
  }
  fun consider(location: Location) {
   if (best == null || location.accuracy < (best?.accuracy ?: Float.MAX_VALUE)) best = location
   if (location.accuracy > 0f && location.accuracy <= 100f) finish(Result.success(location.toSnapshot()))
  }
  providers.forEach { provider ->
   val listener = object : LocationListener {
    override fun onLocationChanged(location: Location) = consider(location)
    @Deprecated("Deprecated by Android") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit
   }
   listeners += listener
   try {
    manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
    manager.getLastKnownLocation(provider)?.let(::consider)
   } catch (e: SecurityException) { finish(Result.failure(e)); return }
  }
  handler.postDelayed({
   val candidate = best
   if (candidate != null) finish(Result.success(candidate.toSnapshot()))
   else finish(Result.failure(IllegalStateException("در مهلت تعیین‌شده موقعیتی دریافت نشد.")))
  }, timeoutMillis)
 }
 private fun Location.toSnapshot() = LocationSnapshot(latitude, longitude, accuracy, time,
  provider ?: "unknown", if (android.os.Build.VERSION.SDK_INT >= 31) isMock else isFromMockProvider)
}
