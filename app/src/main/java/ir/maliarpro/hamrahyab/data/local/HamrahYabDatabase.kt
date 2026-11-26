package ir.maliarpro.hamrahyab.data.local
import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
@Database(entities = [LocationEntity::class, SharingConsentEntity::class], version = 1, exportSchema = false)
abstract class HamrahYabDatabase : RoomDatabase() {
 abstract fun dao(): HamrahYabDao
 companion object {
  @Volatile private var INSTANCE: HamrahYabDatabase? = null
  fun getInstance(context: Context): HamrahYabDatabase = INSTANCE ?: synchronized(this) {
   INSTANCE ?: Room.databaseBuilder(context.applicationContext, HamrahYabDatabase::class.java, "hamrahyab-local.db")
    .build().also { INSTANCE = it }
  }
 }
}
