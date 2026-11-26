package ir.maliarpro.hamrahyab.core.connection

/**
 * An invitation to establish a consent-based connection between two accounts.
 * The backend must generate opaque, single-use invitation codes and enforce
 * uniqueness, rate limits, authorization, and expiry.
 */
data class ConnectionInvitation(
    val id: String,
    val inviterAccountId: String,
    val inviteeAccountId: String?,
    val createdAtEpochMillis: Long,
    val expiresAtEpochMillis: Long,
    val status: InvitationStatus = InvitationStatus.PENDING,
    val acceptedAtEpochMillis: Long? = null,
    val closedAtEpochMillis: Long? = null
) {
    fun isPending(nowEpochMillis: Long): Boolean =
        id.isNotBlank() &&
            inviterAccountId.isNotBlank() &&
            (inviteeAccountId == null || inviteeAccountId.isNotBlank()) &&
            expiresAtEpochMillis > createdAtEpochMillis &&
            createdAtEpochMillis <= nowEpochMillis &&
            nowEpochMillis < expiresAtEpochMillis &&
            status == InvitationStatus.PENDING

    fun accept(byAccountId: String, nowEpochMillis: Long): ConnectionInvitation? {
        if (byAccountId.isBlank() || byAccountId == inviterAccountId) return null
        if (inviteeAccountId != null && inviteeAccountId != byAccountId) return null
        if (!isPending(nowEpochMillis)) return null
        return copy(
            inviteeAccountId = byAccountId,
            status = InvitationStatus.ACCEPTED,
            acceptedAtEpochMillis = nowEpochMillis,
            closedAtEpochMillis = nowEpochMillis
        )
    }

    fun decline(byAccountId: String, nowEpochMillis: Long): ConnectionInvitation? {
        if (byAccountId.isBlank() || byAccountId == inviterAccountId) return null
        if (inviteeAccountId != null && inviteeAccountId != byAccountId) return null
        if (!isPending(nowEpochMillis)) return null
        return copy(
            inviteeAccountId = byAccountId,
            status = InvitationStatus.DECLINED,
            closedAtEpochMillis = nowEpochMillis
        )
    }

    fun revoke(byAccountId: String, nowEpochMillis: Long): ConnectionInvitation? {
        if (byAccountId != inviterAccountId || !isPending(nowEpochMillis)) return null
        return copy(status = InvitationStatus.REVOKED, closedAtEpochMillis = nowEpochMillis)
    }

    fun expire(nowEpochMillis: Long): ConnectionInvitation? {
        if (status != InvitationStatus.PENDING || nowEpochMillis < expiresAtEpochMillis) return null
        return copy(status = InvitationStatus.EXPIRED, closedAtEpochMillis = nowEpochMillis)
    }
}

enum class InvitationStatus { PENDING, ACCEPTED, DECLINED, REVOKED, EXPIRED }
