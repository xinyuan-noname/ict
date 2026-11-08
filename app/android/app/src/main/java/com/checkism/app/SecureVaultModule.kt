package com.checkism.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Android 安全存储：Keystore 密钥 + AES/GCM 加密后写入私有 SharedPreferences。
 * 注意：当前环境无法构建验证（缺 Android SDK/JDK 17）。
 */
class SecureVaultModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName(): String = "SecureVaultModule"

    private val prefs = context.getSharedPreferences("ict_secure_vault", Context.MODE_PRIVATE)

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build()
        )
        return generator.generateKey()
    }

    @ReactMethod
    fun set(key: String, value: String, promise: Promise) {
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey())
            val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            val payload = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
                Base64.encodeToString(encrypted, Base64.NO_WRAP)
            prefs.edit().putString(key, payload).commit().let {
                if (it) promise.resolve(null) else promise.reject("E_VAULT_WRITE", "prefs write failed")
            }
        } catch (e: Exception) {
            promise.reject("E_VAULT_WRITE", e)
        }
    }

    @ReactMethod
    fun get(key: String, promise: Promise) {
        try {
            val payload = prefs.getString(key, null)
            if (payload == null) {
                promise.resolve(null)
                return
            }
            val parts = payload.split(":")
            if (parts.size != 2) {
                promise.resolve(null)
                return
            }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(),
                GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))
            )
            val plain = cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP))
            promise.resolve(String(plain, Charsets.UTF_8))
        } catch (e: Exception) {
            promise.reject("E_VAULT_READ", e)
        }
    }

    @ReactMethod
    fun clear(key: String, promise: Promise) {
        prefs.edit().remove(key).apply()
        promise.resolve(null)
    }

    companion object {
        private const val ALIAS = "ict_session_vault_key"
    }
}