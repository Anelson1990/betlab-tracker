package ai.june.crewphonegate

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import ai.june.crewphonegate.databinding.ActivityMainBinding
import java.io.File

/**
 * The STOP/GO kill switch. GO writes a signed heartbeat to files/go.json every 5s
 * WHILE this screen is open; the harness reads it via
 *   adb exec-out run-as ai.june.crewphonegate cat files/go.json
 * and refuses to act unless a fresh valid GO is present. Flip STOP, background the
 * app, or close it -> heartbeats stop -> agents lock out within the TTL. Fail closed:
 * the app always opens in STOP.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding
    private lateinit var key: ByteArray
    private val handler = Handler(Looper.getMainLooper())
    private var go = false

    private val tick = object : Runnable {
        override fun run() {
            if (go) { writeGo(); handler.postDelayed(this, 5000) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)
        key = KeyBox.deviceKey(this)
        b.deviceKey.text = KeyBox.deviceKeyB64(this)
        b.copyKey.setOnClickListener {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("device_key", KeyBox.deviceKeyB64(this)))
            Toast.makeText(this, "Device key copied", Toast.LENGTH_SHORT).show()
        }
        b.toggle.setOnCheckedChangeListener { _, checked -> setGo(checked) }
    }

    private fun setGo(on: Boolean) {
        go = on
        handler.removeCallbacks(tick)
        if (on) { writeGo(); handler.postDelayed(tick, 5000) } else { writeStop() }
        b.status.text = if (on) getString(R.string.go_status) else getString(R.string.stop_status)
    }

    override fun onResume() {
        super.onResume()
        // Fail-closed default: always start in STOP when the screen appears.
        go = false
        b.toggle.isChecked = false
        setGo(false)
    }

    override fun onPause() {
        super.onPause()
        // Leaving the screen = lock out. The last GO heartbeat expires within its TTL.
        go = false
        handler.removeCallbacks(tick)
        writeStop()
    }

    private fun writeGo() = File(filesDir, "go.json").writeText(Heartbeat.goJson(key))
    private fun writeStop() = File(filesDir, "go.json").writeText(Heartbeat.stopJson())
}
