package ir.maliarpro.hamrahyab.data.local
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow
@Dao
interface HamrahYabDao {
 @Query("SELECT * FROM last_location WHERE id = 'latest' LIMIT 1")
 fun observeLastLocation(): Flow<LocationEntity?>
 @Insert(onConflict = OnConflictStrategy.REPLACE)
 suspend fun saveLocation(location: LocationEntity)
 @Query("SELECT * FROM sharing_consents ORDER BY grantedAtEpochMillis DESC")
 fun observeConsents(): Flow<List<SharingConsentEntity>>
 @Insert(onConflict = OnConflictStrategy.REPLACE)
 suspend fun saveConsent(consent: SharingConsentEntity)
 @Query("DELETE FROM sharing_consents WHERE ownerAccountId = :ownerId AND recipientAccountId = :recipientId")
 suspend fun deleteConsent(ownerId: String, recipientId: String)
}
