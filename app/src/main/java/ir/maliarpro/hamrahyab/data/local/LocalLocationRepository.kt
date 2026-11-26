package ir.maliarpro.hamrahyab.data.local
import ir.maliarpro.hamrahyab.core.consent.SharingConsent
import ir.maliarpro.hamrahyab.core.consent.SharingScope
import ir.maliarpro.hamrahyab.core.location.LocationSnapshot
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
class LocalLocationRepository(private val dao: HamrahYabDao) {
 fun observeLastLocation(): Flow<LocationSnapshot?> = dao.observeLastLocation().map { row ->
  row?.let { LocationSnapshot(it.latitude, it.longitude, it.accuracyMeters, it.capturedAtEpochMillis, it.provider, it.isMocked) }
 }
 suspend fun saveLocation(snapshot: LocationSnapshot) {
  require(snapshot.hasValidCoordinates() && snapshot.hasValidAccuracy())
  dao.saveLocation(LocationEntity(latitude=snapshot.latitude, longitude=snapshot.longitude,
   accuracyMeters=snapshot.accuracyMeters, capturedAtEpochMillis=snapshot.capturedAtEpochMillis,
   provider=snapshot.provider, isMocked=snapshot.isMocked))
 }
 suspend fun saveConsent(consent: SharingConsent) {
  dao.saveConsent(SharingConsentEntity(consent.ownerAccountId, consent.recipientAccountId,
   consent.scopes.map { it.name }.sorted().joinToString(","),
   consent.grantedAtEpochMillis, consent.expiresAtEpochMillis, consent.revokedAtEpochMillis))
 }
 fun observeConsents(): Flow<List<SharingConsent>> = dao.observeConsents().map { rows ->
  rows.map { row -> SharingConsent(row.ownerAccountId, row.recipientAccountId,
   row.scopes.split(",").mapNotNull { runCatching { SharingScope.valueOf(it) }.getOrNull() }.toSet(),
   row.grantedAtEpochMillis, row.expiresAtEpochMillis, row.revokedAtEpochMillis) }
 }
 suspend fun revokeConsent(ownerId: String, recipientId: String) = dao.deleteConsent(ownerId, recipientId)
}
