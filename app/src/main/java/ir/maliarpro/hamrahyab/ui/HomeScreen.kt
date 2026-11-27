package ir.maliarpro.hamrahyab.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FamilyRestroom
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import ir.maliarpro.hamrahyab.core.location.LocationSnapshot
import ir.maliarpro.hamrahyab.platform.location.OneShotLocationProvider
import ir.maliarpro.hamrahyab.ui.AuthAccessCard

private data class FeatureItem(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val status: String
)

@Composable
fun HamrahYabApp() {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            HomeScreen()
        }
    }
}

@Composable
private fun HomeScreen() {
    val context = LocalContext.current
    val locationProvider = remember(context) { OneShotLocationProvider(context) }
    var lastLocation by remember { mutableStateOf<LocationSnapshot?>(null) }
    var locationStatus by remember { mutableStateOf("برای دریافت موقعیت، دکمه زیر را بزنید.") }
    var isCapturing by remember { mutableStateOf(false) }

    val features = listOf(
        FeatureItem(
            title = "همراهی خانواده",
            description = "اشتراک‌گذاری رضایت‌مندانه موقعیت و تعریف مکان‌های امن",
            icon = Icons.Outlined.FamilyRestroom,
            status = "در حال آماده‌سازی"
        ),
        FeatureItem(
            title = "مراقبت از سالمندان",
            description = "درخواست کمک اضطراری و بررسی آخرین وضعیت دستگاه",
            icon = Icons.Outlined.HealthAndSafety,
            status = "در حال آماده‌سازی"
        ),
        FeatureItem(
            title = "پیدا کردن گوشی",
            description = "مشاهده آخرین موقعیت ثبت‌شده دستگاه‌های خودتان",
            icon = Icons.Outlined.PhoneAndroid,
            status = "در حال آماده‌سازی"
        )
    )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(52.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Security,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.padding(13.dp)
                    )
                }
                Column {
                    Text(
                        text = "همراه‌یاب",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "امنیت خانواده، مراقبت از عزیزان",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(4.dp))
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primary
                ),
                shape = RoundedCornerShape(22.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "با خیال آسوده در کنار هم",
                        color = MaterialTheme.colorScheme.onPrimary,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "همراه‌یاب برای ارتباط و مراقبت آگاهانه اعضای خانواده طراحی شده است.",
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.9f),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }

        item {
            Text(
                text = "خدمات همراه‌یاب",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        }

        items(features.size) { index ->
            FeatureCard(feature = features[index])
        }

        item {
            AuthAccessCard()
        }

        item {
            LocationCaptureCard(
                lastLocation = lastLocation,
                status = locationStatus,
                isCapturing = isCapturing,
                onCapture = {
                    if (!isCapturing) {
                        isCapturing = true
                        locationStatus = "در حال دریافت موقعیت؛ حداکثر تا ۲۰ ثانیه..."
                        locationProvider.request { result ->
                            isCapturing = false
                            result.fold(
                                onSuccess = {
                                    lastLocation = it
                                    locationStatus = "موقعیت تازه دریافت شد. این اطلاعات فعلاً فقط روی همین گوشی نمایش داده می‌شود."
                                },
                                onFailure = {
                                    locationStatus = it.message ?: "دریافت موقعیت انجام نشد."
                                }
                            )
                        }
                    }
                }
            )
        }

        item {
            Text(
                text = "حریم خصوصی شما مهم است",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = "اشتراک‌گذاری موقعیت فقط با رضایت صاحب دستگاه انجام می‌شود. دریافت موقعیت در این نسخه فقط با اقدام مستقیم شما انجام می‌شود و هنوز به سرور ارسال نمی‌شود.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun FeatureCard(feature: FeatureItem) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.padding(18.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                modifier = Modifier.size(48.dp)
            ) {
                Icon(
                    imageVector = feature.icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(12.dp)
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = feature.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = feature.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = feature.status,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}
