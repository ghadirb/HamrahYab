package ir.maliarpro.hamrahyab.core.location

/**
 * A one-time request for a target device to capture and return a location.
 * This model does not perform background tracking or bypass device permissions.
 */
data class LocationRequest(
    val id: String,
    val requesterAccountId: String,
    val targetAccountId: String,
    val targetDeviceId: String,
    val requestedAtEpochMillis: Long,
    val expiresAtEpochMillis: Long,
    val status: LocationRequestStatus = LocationRequestStatus.PENDING,
    val respondedAtEpochMillis: Long? = null
) {
    fun isPending(nowEpochMillis: Long): Boolean =
        id.isNotBlank() &&
            requesterAccountId.isNotBlank() &&
            targetAccountId.isNotBlank() &&
            targetDeviceId.isNotBlank() &&
            requesterAccountId != targetAccountId &&
            requestedAtEpochMillis <= nowEpochMillis &&
            expiresAtEpochMillis > requestedAtEpochMillis &&
            nowEpochMillis < expiresAtEpochMillis &&
            status == LocationRequestStatus.PENDING

    fun approve(byAccountId: String, nowEpochMillis: Long): LocationRequest? =
        respond(byAccountId, nowEpochMillis, LocationRequestStatus.APPROVED)

    fun deny(byAccountId: String, nowEpochMillis: Long): LocationRequest? =
        respond(byAccountId, nowEpochMillis, LocationRequestStatus.DENIED)

    fun cancel(byAccountId: String, nowEpochMillis: Long): LocationRequest? {
        if (byAccountId != requesterAccountId || !isPending(nowEpochMillis)) return null
        return copy(status = LocationRequestStatus.CANCELLED, respondedAtEpochMillis = nowEpochMillis)
    }

    fun expire(nowEpochMillis: Long): LocationRequest? {
        if (status != LocationRequestStatus.PENDING || nowEpochMillis < expiresAtEpochMillis) return null
        return copy(status = LocationRequestStatus.EXPIRED, respondedAtEpochMillis = nowEpochMillis)
    }

    private fun respond(
        byAccountId: String,
        nowEpochMillis: Long,
        newStatus: LocationRequestStatus
    ): LocationRequest? {
        if (byAccountId != targetAccountId || !isPending(nowEpochMillis)) return null
        return copy(status = newStatus, respondedAtEpochMillis = nowEpochMillis)
    }
}

enum class LocationRequestStatus { PENDING, APPROVED, DENIED, CANCELLED, EXPIRED, FULFILLED }
