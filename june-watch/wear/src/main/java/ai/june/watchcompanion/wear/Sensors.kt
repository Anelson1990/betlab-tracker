package ai.june.watchcompanion.wear

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper

/**
 * Battery + one-shot sensor snapshots. Battery is free (no permission). Sensor
 * snapshots register a listener, grab the FIRST reading, then unregister — no
 * persistent listener, so this never spins the battery the sleep tracker needs.
 * Missing permission / missing sensor / timeout all return null (graceful degrade).
 */
object Sensors {

    fun batteryPercent(context: Context): Int {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        val pct = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        if (pct in 0..100) return pct
        val i = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = i?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = i?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) level * 100 / scale else -1
    }

    fun snapshot(context: Context, sensorType: Int, timeoutMs: Long = 4000, onResult: (Float?) -> Unit) {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val sensor = sm?.getDefaultSensor(sensorType)
        if (sm == null || sensor == null) { onResult(null); return }

        val handler = Handler(Looper.getMainLooper())
        var done = false
        val listener = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                if (done) return
                done = true
                sm.unregisterListener(this)
                onResult(e.values.firstOrNull())
            }
            override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }

        val registered = try {
            sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
        } catch (e: SecurityException) {
            false
        }
        if (!registered) { onResult(null); return }

        handler.postDelayed({
            if (!done) { done = true; sm.unregisterListener(listener); onResult(null) }
        }, timeoutMs)
    }
}
