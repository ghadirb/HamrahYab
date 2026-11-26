package ir.maliarpro.hamrahyab.core.consent

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SharingConsentTest {
    private val now = 1_800_000_000_000L
    private fun consent(expiresAt: Long? = null, revokedAt: Long? = null) = SharingConsent(
        ownerAccountId = "owner", recipientAccountId = "recipient",
        scopes = setOf(SharingScope.REQUEST_LOCATION, SharingScope.VIEW_LAST_LOCATION),
        grantedAtEpochMillis = now - 10_000L,
        expiresAtEpochMillis = expiresAt, revokedAtEpochMillis = revokedAt
    )

    @Test fun grantedScopeIsAllowed() {
        assertTrue(consent().allows("owner", "recipient", SharingScope.REQUEST_LOCATION, now))
    }

    @Test fun ungrantedScopeIsDenied() {
        assertFalse(consent().allows("owner", "recipient", SharingScope.LIVE_SHARING, now))
    }

    @Test fun wrongRecipientIsDenied() {
        assertFalse(consent().allows("owner", "other", SharingScope.REQUEST_LOCATION, now))
    }

    @Test fun expiredConsentIsDenied() {
        assertFalse(consent(expiresAt = now - 1L).allows("owner", "recipient", SharingScope.REQUEST_LOCATION, now))
    }

    @Test fun revokedConsentIsDenied() {
        assertFalse(consent(revokedAt = now - 1L).allows("owner", "recipient", SharingScope.REQUEST_LOCATION, now))
    }
}
