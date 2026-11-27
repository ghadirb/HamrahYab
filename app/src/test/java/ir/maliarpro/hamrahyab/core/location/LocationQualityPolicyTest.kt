package ir.maliarpro.hamrahyab.core.location

import org.junit.Assert.assertEquals
import org.junit.Test

class LocationQualityPolicyTest {
    private val policy = LocationQualityPolicy()
    private val now = 1_800_000_000_000L

    private fun snapshot(
        ageMillis: Long = 30_000L,
        accuracyMeters: Float = 25f,
        mocked: Boolean = false,
        latitude: Double = 35.7,
        longitude: Double = 51.4
    ) = LocationSnapshot(
        latitude = latitude,
        longitude = longitude,
        accuracyMeters = accuracyMeters,
        capturedAtEpochMillis = now - ageMillis,
        provider = "gps",
        isMocked = mocked
    )

    @Test
    fun freshAccurateLocationIsUsable() {
        assertEquals(LocationAssessment.USABLE, policy.assess(snapshot(), now))
    }

    @Test
    fun staleLocationIsRejected() {
        assertEquals(
            LocationAssessment.STALE,
            policy.assess(snapshot(ageMillis = LocationQualityPolicy.DEFAULT_MAX_AGE_MILLIS + 1), now)
        )
    }

    @Test
    fun inaccurateLocationIsRejected() {
        assertEquals(
            LocationAssessment.INACCURATE,
            policy.assess(snapshot(accuracyMeters = 150f), now)
        )
    }

    @Test
    fun mockedLocationIsRejected() {
        assertEquals(LocationAssessment.MOCKED, policy.assess(snapshot(mocked = true), now))
    }

    @Test
    fun futureTimestampBeyondAllowedSkewIsRejected() {
        val future = snapshot(ageMillis = -LocationQualityPolicy.DEFAULT_FUTURE_SKEW_MILLIS - 1)
        assertEquals(LocationAssessment.FUTURE_TIMESTAMP, policy.assess(future, now))
    }

    @Test
    fun invalidCoordinatesAreRejected() {
        assertEquals(
            LocationAssessment.INVALID,
            policy.assess(snapshot(latitude = 91.0), now)
        )
    }
}
