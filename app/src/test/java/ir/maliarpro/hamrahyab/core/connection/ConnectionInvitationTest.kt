package ir.maliarpro.hamrahyab.core.connection

import org.junit.Assert.*
import org.junit.Test

class ConnectionInvitationTest {
    private fun invitation() = ConnectionInvitation(
        id = "invite-1",
        inviterAccountId = "owner",
        inviteeAccountId = null,
        createdAtEpochMillis = 100L,
        expiresAtEpochMillis = 1_000L
    )

    @Test fun inviteeCanAcceptOnce() {
        val accepted = invitation().accept("member", 200L)
        assertEquals(InvitationStatus.ACCEPTED, accepted?.status)
        assertNull(accepted?.accept("other", 300L))
    }

    @Test fun inviterCannotAcceptOwnInvitation() {
        assertNull(invitation().accept("owner", 200L))
    }

    @Test fun anotherAccountCannotAcceptBoundInvitation() {
        val bound = invitation().copy(inviteeAccountId = "member")
        assertNull(bound.accept("other", 200L))
    }

    @Test fun inviterCanRevokePendingInvitation() {
        assertEquals(InvitationStatus.REVOKED, invitation().revoke("owner", 200L)?.status)
        assertNull(invitation().revoke("member", 200L))
    }

    @Test fun expiredInvitationCannotBeAccepted() {
        assertNull(invitation().accept("member", 1_000L))
        assertEquals(InvitationStatus.EXPIRED, invitation().expire(1_000L)?.status)
    }
}
