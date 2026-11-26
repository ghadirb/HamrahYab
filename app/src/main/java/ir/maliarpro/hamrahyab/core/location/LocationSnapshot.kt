package ir.maliarpro.hamrahyab.core.location

/**
 * A location observation with enough metadata to avoid presenting old or imprecise
 * coordinates as a live position.
 *
 * Coordinates are stored in WGS84 degrees. capturedAtEpochMillis is the time the
 * provider measured the location, not the time the app received it.
 */
data class LocationSnapshot(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val capturedAtEpochMillis: Long,
    val provider: String,
    val isMocked: Boolean = false
) {
    fun hasValidCoordinates(): Boolean =
        latitude.isFinite() && longitude.isFinite() &&
            latitude in -90.0..90.0 && longitude in -180.0..180.0

    fun hasValidAccuracy(): Boolean = accuracyMeters.isFinite() && accuracyMeters > 0f
}
