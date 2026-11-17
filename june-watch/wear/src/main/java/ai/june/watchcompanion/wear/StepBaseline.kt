package ai.june.watchcompanion.wear

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Daily step count (v1 #3). TYPE_STEP_COUNTER is CUMULATIVE since boot, so the
 * raw value (v0 sent 45,882) is meaningless as "today's steps". We baseline it:
 * record the counter at the first reading of each calendar day and report
 * current - baseline. Persisted so it survives process death. On a reboot the
 * counter resets to a small number; if current < baseline we re-baseline, so the
 * result is never negative.
 */
object StepBaseline {
    private const val PREF = "june_steps"
    private const val KEY_DATE = "date"
    private const val KEY_BASE = "baseline"
    private val dayFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    fun daily(context: Context, rawCumulative: Int): Int {
        if (rawCumulative < 0) return 0
        val prefs = context.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val today = dayFmt.format(Date())
        val storedDay = prefs.getString(KEY_DATE, null)
        var baseline = prefs.getInt(KEY_BASE, -1)

        val needsReset = storedDay != today || baseline < 0 || rawCumulative < baseline
        if (needsReset) {
            baseline = rawCumulative
            prefs.edit().putString(KEY_DATE, today).putInt(KEY_BASE, baseline).apply()
        }
        return (rawCumulative - baseline).coerceAtLeast(0)
    }
}
