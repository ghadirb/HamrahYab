package ir.maliarpro.hamrahyab.data.local
import androidx.room.Entity
import androidx.room.PrimaryKey
@Entity(tableName = "last_location")
data class LocationEntity(
 @PrimaryKey val id: String = SINGLETON_ID,
 val latitude: Double, val longitude: Double, val accuracyMeters: Float,
 val capturedAtEpochMillis: Long, val provider: String, val isMocked: Boolean
) { companion object { const val SINGLETON_ID = "latest" } }
