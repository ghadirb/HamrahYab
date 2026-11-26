package ir.maliarpro.hamrahyab.ui

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import ir.maliarpro.hamrahyab.data.remote.AuthApi
import ir.maliarpro.hamrahyab.data.remote.SecureSessionStore
import kotlinx.coroutines.launch

@Composable
fun AuthAccessCard() {
    val context = LocalContext.current
    val api = remember { AuthApi() }
    val store = remember { SecureSessionStore(context) }
    var dialogOpen by remember { mutableStateOf(false) }
    var signedIn by remember { mutableStateOf(store.hasSession()) }

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("حساب همراه‌یاب", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(if (signedIn) "نشست ورود این دستگاه به‌صورت رمزنگاری‌شده نگهداری می‌شود."
                else "برای اتصال امن دستگاه‌ها، ورود با شماره همراه در نظر گرفته شده است.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (signedIn) {
                TextButton(onClick = { store.clear(); signedIn = false }) { Text("خروج از حساب این دستگاه") }
            } else {
                Button(onClick = { dialogOpen = true }, enabled = api.isConfigured) { Text("ورود با شماره همراه") }
                if (!api.isConfigured) Text(
                    "ورود آنلاین تا زمان راه‌اندازی سرور فعال نیست؛ امکانات محلی برنامه همچنان قابل استفاده‌اند.",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    if (dialogOpen) OtpLoginDialog(api = api, onDismiss = { dialogOpen = false }, onAuthenticated = { token ->
        runCatching { store.save(token) }
            .onSuccess { signedIn = true; dialogOpen = false }
    })
}

@Composable
private fun OtpLoginDialog(api: AuthApi, onDismiss: () -> Unit, onAuthenticated: (String) -> Unit) {
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var challengeId by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("شماره همراه خود را وارد کنید.") }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (challengeId == null) "ورود به همراه‌یاب" else "تأیید شماره همراه") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (challengeId == null) OutlinedTextField(value = phone, onValueChange = {
                    phone = it.filter { ch -> ch.isDigit() || ch == '+' || ch == ' ' || ch == '-' }.take(18)
                }, label = { Text("شماره همراه") }, placeholder = { Text("۰۹۱۲۱۲۳۴۵۶۷") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), singleLine = true)
                else OutlinedTextField(value = code, onValueChange = {
                    code = normalizeDigits(it).filter(Char::isDigit).take(6)
                }, label = { Text("کد شش‌رقمی پیامک‌شده") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), singleLine = true)
                Text(message, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                busy = true
                scope.launch {
                    try {
                        if (challengeId == null) {
                            val result = api.requestOtp(normalizePhoneDigits(phone))
                            challengeId = result.id
                            message = "کد ارسال شد؛ اعتبار کد پنج دقیقه است."
                        } else {
                            val session = api.verifyOtp(challengeId!!, normalizeDigits(code),
                                "${Build.MANUFACTURER} ${Build.MODEL}".take(80))
                            onAuthenticated(session.accessToken)
                        }
                    } catch (error: Exception) {
                        message = error.message ?: "عملیات انجام نشد؛ دوباره تلاش کنید."
                    } finally { busy = false }
                }
            }) { Text(if (busy) "لطفاً صبر کنید…" else if (challengeId == null) "دریافت کد" else "تأیید و ورود") }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (challengeId != null) TextButton(enabled = !busy, onClick = {
                    challengeId = null; code = ""; message = "شماره همراه خود را وارد کنید."
                }) { Text("تغییر شماره") }
                TextButton(enabled = !busy, onClick = onDismiss) { Text("بستن") }
            }
        }
    )
}

private fun normalizePhoneDigits(value: String): String = normalizeDigits(value).replace(" ", "").replace("-", "")
private fun normalizeDigits(value: String): String = buildString {
    value.forEach { ch ->
        append(when (ch) {
            in '۰'..'۹' -> ('0'.code + ch.code - '۰'.code).toChar()
            in '٠'..'٩' -> ('0'.code + ch.code - '٠'.code).toChar()
            else -> ch
        })
    }
}
