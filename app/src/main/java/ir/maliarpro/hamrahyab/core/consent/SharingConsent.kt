package ir.maliarpro.hamrahyab.core.consent

/** Product-level permission between two accounts. Android runtime permissions are separate. */
data class SharingConsent(
    val ownerAccountId: String,
    val recipientAccountId: String,
    val scopes: Set<SharingScope>,
    val grantedAtEpochMillis: Long,
    val expiresAtEpochMillis: Long? = null,
    val revokedAtEpochMillis: Long? = null
) {
    fun isActive(nowEpochMillis: Long): Boolean {
        if (ownerAccountId.isBlank() || recipientAccountId.isBlank()) return false
        if (ownerAccountId == recipientAccountId) return false
        if (grantedAtEpochMillis > nowEpochMillis) return false
        if (revokedAtEpochMillis != null && revokedAtEpochMillis <= nowEpochMillis) return false
        if (expiresAtEpochMillis != null && expiresAtEpochMillis <= nowEpochMillis) return false
        return scopes.isNotEmpty()
    }

    fun allows(ownerId: String, recipientId: String, scope: SharingScope, nowEpochMillis: Long): Boolean =
        ownerAccountId == ownerId && recipientAccountId == recipientId &&
            scope in scopes && isActive(nowEpochMillis)
}

enum class SharingScope {
    REQUEST_LOCATION, VIEW_LAST_LOCATION, LIVE_SHARING,
    EMERGENCY_LOCATION, MANAGE_GEOFENCES, RECEIVE_SOS
}
