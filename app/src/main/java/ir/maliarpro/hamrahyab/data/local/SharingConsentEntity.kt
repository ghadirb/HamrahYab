package ir.maliarpro.hamrahyab.data.local
import androidx.room.Entity
@Entity(tableName = "sharing_consents", primaryKeys = ["ownerAccountId", "recipientAccountId"])
data class SharingConsentEntity(
 val ownerAccountId: String, val recipientAccountId: String, val scopes: String,
 val grantedAtEpochMillis: Long, val expiresAtEpochMillis: Long?, val revokedAtEpochMillis: Long?
)
