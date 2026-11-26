package ir.maliarpro.hamrahyab.data.remote

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Session tokens are encrypted with a non-exportable Android Keystore key. */
class SecureSessionStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("secure_session_v1", Context.MODE_PRIVATE)

    fun hasSession(): Boolean = preferences.contains(TOKEN_KEY)

    @Synchronized
    fun save(token: String) {
        require(token.length in 32..512)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        check(preferences.edit()
            .putString(IV_KEY, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(TOKEN_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .commit()) { "ذخیره امن نشست انجام نشد." }
    }

    @Synchronized
    fun read(): String? {
        val ivText = preferences.getString(IV_KEY, null) ?: return null
        val tokenText = preferences.getString(TOKEN_KEY, null) ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(),
                GCMParameterSpec(128, Base64.decode(ivText, Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(tokenText, Base64.NO_WRAP)), Charsets.UTF_8)
        }.getOrNull()
    }

    @Synchronized
    fun clear() { preferences.edit().clear().commit() }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build())
        return generator.generateKey()
    }

    private companion object {
        const val KEY_ALIAS = "hamrahyab.session.aes.v1"
        const val TOKEN_KEY = "encrypted_access_token"
        const val IV_KEY = "gcm_iv"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
