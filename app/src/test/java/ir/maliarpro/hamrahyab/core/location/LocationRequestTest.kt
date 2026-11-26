package ir.maliarpro.hamrahyab.core.location

import org.junit.Assert.*
import org.junit.Test

class LocationRequestTest {
    private fun request() = LocationRequest(
        id = "request-1",
        requesterAccountId = "requester",
        targetAccountId = "target",
        targetDeviceId = "device-1",
        requestedAtEpochMillis = 100L,
        expiresAtEpochMillis = 1_000L
    )

    @Test fun onlyTargetCanApprove() {
        assertNull(request().approve("requester", 200L))
        assertEquals(LocationRequestStatus.APPROVED, request().approve("target", 200L)?.status)
    }

    @Test fun targetCanDeny() {
        assertEquals(LocationRequestStatus.DENIED, request().deny("target", 200L)?.status)
    }

    @Test fun requesterCanCancelPendingRequest() {
        assertEquals(LocationRequestStatus.CANCELLED, request().cancel("requester", 200L)?.status)
        assertNull(request().cancel("target", 200L))
    }

    @Test fun requestExpiresAndCannotBeApproved() {
        assertEquals(LocationRequestStatus.EXPIRED, request().expire(1_000L)?.status)
        assertNull(request().approve("target", 1_000L))
    }

    @Test fun accountsMustBeDifferent() {
        assertFalse(request().copy(targetAccountId = "requester").isPending(200L))
    }
}
