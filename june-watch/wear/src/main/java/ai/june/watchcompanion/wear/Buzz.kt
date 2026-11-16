package ai.june.watchcompanion.wear

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** June's distinct buzz: two short taps + one long. Event-driven, one-shot. */
object Buzz {
    private val JUNE = longArrayOf(0, 120, 90, 120, 90, 300) // off,on,off,on,off,on (ms)

    fun june(context: Context) {
        val v = vibrator(context) ?: return
        v.vibrate(VibrationEffect.createWaveform(JUNE, -1))
    }

    private fun vibrator(context: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
}
