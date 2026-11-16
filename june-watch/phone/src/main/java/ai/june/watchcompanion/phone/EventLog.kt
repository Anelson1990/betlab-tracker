package ai.june.watchcompanion.phone

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Tiny append-only, timestamped log backed by a file in filesDir. This is the v0
 * evidence trail: every phone<->watch event lands here with a timestamp, and the
 * UI just renders it. Pull it off-device with:
 *   adb shell run-as ai.june.watchcompanion cat files/june_events.log
 */
object EventLog {
    const val ACTION_UPDATED = "ai.june.watchcompanion.LOG_UPDATED"
    private const val FILE = "june_events.log"
    private val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)

    @Synchronized
    fun append(context: Context, line: String) {
        val stamped = "${fmt.format(Date())}  $line\n"
        File(context.applicationContext.filesDir, FILE).appendText(stamped)
    }

    @Synchronized
    fun read(context: Context): String {
        val f = File(context.applicationContext.filesDir, FILE)
        return if (f.exists()) f.readText() else ""
    }

    @Synchronized
    fun clear(context: Context) {
        File(context.applicationContext.filesDir, FILE).delete()
    }
}
