package ai.june.crewphonegate

import android.content.Context
import android.util.Base64
import java.security.SecureRandom

/**
 * The device key: 32 random bytes generated on first run, stored in the app's
 * private prefs. The SAME key (shown here as base64) is provisioned into the harness
 * env as CREWPHONE_DEVICE_KEY, which base64-decodes it. The agent never gets it, so
 * it can't forge a GO heartbeat.
 */
object KeyBox {
    private const val PREF = "crewphone_gate"
    private const val KEY = "device_key_b64"

    fun deviceKey(ctx: Context): ByteArray = Base64.decode(deviceKeyB64(ctx), Base64.NO_WRAP)

    fun deviceKeyB64(ctx: Context): String {
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        var b64 = p.getString(KEY, null)
        if (b64 == null) {
            val bytes = ByteArray(32)
            SecureRandom().nextBytes(bytes)
            b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            p.edit().putString(KEY, b64).apply()
        }
        return b64
    }
}
