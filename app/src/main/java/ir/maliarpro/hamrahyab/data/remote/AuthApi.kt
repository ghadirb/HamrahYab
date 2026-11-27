package ir.maliarpro.hamrahyab.data.remote

import ir.maliarpro.hamrahyab.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class OtpChallenge(val id: String, val expiresAtMs: Long, val retryAfterSeconds: Int)
data class AuthSession(val accessToken: String, val accountId: String, val deviceId: String, val expiresAtMs: Long)

class AuthApi(private val baseUrl: String = BuildConfig.API_BASE_URL) {
    val isConfigured: Boolean
        get() = runCatching {
            val url = URL(baseUrl)
            url.protocol == "https" && url.host.isNotBlank()
        }.getOrDefault(false)

    suspend fun requestOtp(phone: String): OtpChallenge = withContext(Dispatchers.IO) {
        val response = post("/v1/auth/otp/request", JSONObject().put("phone", phone))
        OtpChallenge(response.getString("challengeId"), response.getLong("expiresAtMs"),
            response.optInt("retryAfterSeconds", 60))
    }

    suspend fun verifyOtp(challengeId: String, code: String, deviceName: String): AuthSession =
        withContext(Dispatchers.IO) {
            val response = post("/v1/auth/otp/verify", JSONObject()
                .put("challengeId", challengeId).put("code", code).put("deviceName", deviceName.take(80)))
            AuthSession(response.getString("accessToken"), response.getString("accountId"),
                response.getString("deviceId"), response.getLong("expiresAtMs"))
        }

    private fun post(path: String, body: JSONObject): JSONObject {
        require(isConfigured) { "آدرس امن سرور همراه‌یاب تنظیم نشده است." }
        val connection = URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(payload) }.getOrElse { JSONObject() }
            if (status !in 200..299) {
                val message = json.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
                throw IllegalStateException(message ?: "ارتباط با سرور برقرار نشد (کد $status).")
            }
            return json
        } finally {
            connection.disconnect()
        }
    }
}
