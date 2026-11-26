package ir.maliarpro.hamrahyab.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import ir.maliarpro.hamrahyab.core.location.LocationSnapshot
import java.text.DateFormat
import java.util.Date

@Composable
fun LocationCaptureCard(
    lastLocation: LocationSnapshot?,
    status: String,
    isCapturing: Boolean,
    onCapture: () -> Unit
) {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        if (result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        ) {
            onCapture()
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("ثبت آخرین موقعیت این گوشی", style = MaterialTheme.typography.titleMedium)
            Text(
                "موقعیت فقط با درخواست شما و پس از اجازه اندروید دریافت می‌شود؛ پس از دریافت، درخواست متوقف می‌شود.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Button(
                enabled = !isCapturing,
                onClick = {
                    val fine = ContextCompat.checkSelfPermission(
                        context, Manifest.permission.ACCESS_FINE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED
                    val coarse = ContextCompat.checkSelfPermission(
                        context, Manifest.permission.ACCESS_COARSE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED
                    if (fine || coarse) {
                        onCapture()
                    } else {
                        launcher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                }
            ) {
                Text(if (isCapturing) "در حال دریافت موقعیت..." else "دریافت موقعیت فعلی")
            }
            Text(status, style = MaterialTheme.typography.bodySmall)
            if (lastLocation != null) {
                Text(
                    "آخرین ثبت: " + DateFormat.getDateTimeInstance()
                        .format(Date(lastLocation.capturedAtEpochMillis)),
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    "دقت تقریبی: ${lastLocation.accuracyMeters.toInt()} متر | ${lastLocation.provider}",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    "عرض: ${lastLocation.latitude}، طول: ${lastLocation.longitude}",
                    style = MaterialTheme.typography.bodySmall
                )
            } else {
                Text("هنوز موقعیتی ذخیره نشده است.", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
