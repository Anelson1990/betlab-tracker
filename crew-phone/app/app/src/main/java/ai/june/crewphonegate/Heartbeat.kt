package ai.june.crewphonegate

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Signed GO heartbeat — MUST match the harness's crewphone/killswitch.py exactly:
 *   sig = HMAC-SHA256(device_key, "go|" + exp)   (lowercase hex)
 *   go.json = {"state":"go","exp":<int>,"sig":"<hex>"}
 * The harness verifies this; if it doesn't match byte-for-byte, GO is rejected.
 */
object Heartbeat {
    fun sign(deviceKey: ByteArray, exp: Long): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(deviceKey, "HmacSHA256"))
        val raw = mac.doFinal("go|$exp".toByteArray(Charsets.UTF_8))
        return raw.joinToString("") { "%02x".format(it.toInt() and 0xFF) }
    }

    fun goJson(deviceKey: ByteArray, ttlSec: Long = 10, nowSec: Long = System.currentTimeMillis() / 1000): String {
        val exp = nowSec + ttlSec
        return """{"state":"go","exp":$exp,"sig":"${sign(deviceKey, exp)}"}"""
    }

    fun stopJson(): String = """{"state":"stop"}"""
}
