package ir.maliarpro.hamrahyab.core.location

import org.junit.Assert.assertEquals
import org.junit.Test

class LocationQualityPolicyTest {
    private val policy = LocationQualityPolicy()
    private val now = 1_800_000_000_000L

    private fun snapshot(latitude: Double = 35.7, longitude: Double = 51.4,
        accuracy: Float = 20f, capturedAt: Long = now - 30_000L, mocked: Boolean = false) =
        LocationSnapshot(latitude, longitude, accuracy, capturedAt, "test", mocked)

    @Test fun recentAccurateLocationIsUsable() {
        assertEquals(LocationAssessment.USABLE, policy.assess(snapshot(), now))
    }

    @Test fun oldLocationIsStale() {
        assertEquals(LocationAssessment.STALE, policy.assess(snapshot(capturedAt = now - 121_000L), now))
    }

    @Test fun poorAccuracyIsNotFreshEnough() {
        assertEquals(LocationAssessment.INACCURATE, policy.assess(snapshot(accuracy = 150f), now))
    }

    @Test fun invalidCoordinatesAreRejected() {
        assertEquals(LocationAssessment.INVALID, policy.assess(snapshot(latitude = 95.0), now))
    }

    @Test fun mockedLocationIsNotAcceptedAsRealPosition() {
        assertEquals(LocationAssessment.MOCKED, policy.assess(snapshot(mocked = true), now))
    }

    @Test fun timestampTooFarInFutureIsRejected() {
        assertEquals(LocationAssessment.FUTURE_TIMESTAMP, policy.assess(snapshot(capturedAt = now + 121_000L), now))
    }
}
