package ir.maliarpro.hamrahyab.core.location

/** Classifies a location before it can be described as a fresh position. */
class LocationQualityPolicy(
    private val maxAgeMillis: Long = DEFAULT_MAX_AGE_MILLIS,
    private val maxAccuracyMeters: Float = DEFAULT_MAX_ACCURACY_METERS,
    private val allowedFutureSkewMillis: Long = DEFAULT_FUTURE_SKEW_MILLIS
) {
    init {
        require(maxAgeMillis >= 0L)
        require(maxAccuracyMeters > 0f && maxAccuracyMeters.isFinite())
        require(allowedFutureSkewMillis >= 0L)
    }

    fun assess(snapshot: LocationSnapshot, nowEpochMillis: Long): LocationAssessment {
        if (!snapshot.hasValidCoordinates() || !snapshot.hasValidAccuracy()) return LocationAssessment.INVALID
        if (snapshot.isMocked) return LocationAssessment.MOCKED
        if (snapshot.capturedAtEpochMillis > nowEpochMillis + allowedFutureSkewMillis) {
            return LocationAssessment.FUTURE_TIMESTAMP
        }
        if (nowEpochMillis - snapshot.capturedAtEpochMillis > maxAgeMillis) return LocationAssessment.STALE
        if (snapshot.accuracyMeters > maxAccuracyMeters) return LocationAssessment.INACCURATE
        return LocationAssessment.USABLE
    }

    companion object {
        const val DEFAULT_MAX_AGE_MILLIS = 2 * 60 * 1000L
        const val DEFAULT_MAX_ACCURACY_METERS = 100f
        const val DEFAULT_FUTURE_SKEW_MILLIS = 2 * 60 * 1000L
    }
}

enum class LocationAssessment { USABLE, STALE, INACCURATE, INVALID, MOCKED, FUTURE_TIMESTAMP }
