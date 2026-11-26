package ir.maliarpro.hamrahyab.core.device

/**
 * A single app installation registered to an account.
 * installationId must be a random, app-generated identifier, not a hardware ID.
 */
data class RegisteredDevice(
    val deviceId: String,
    val ownerAccountId: String,
    val displayName: String,
    val platform: DevicePlatform,
    val registeredAtEpochMillis: Long,
    val lastSeenAtEpochMillis: Long? = null,
    val isActive: Boolean = true
) {
    fun isValid(): Boolean =
        deviceId.isNotBlank() &&
            ownerAccountId.isNotBlank() &&
            displayName.isNotBlank() &&
            registeredAtEpochMillis >= 0L &&
            (lastSeenAtEpochMillis == null || lastSeenAtEpochMillis >= registeredAtEpochMillis)

    fun deactivate(): RegisteredDevice = copy(isActive = false)
}

enum class DevicePlatform { ANDROID }
