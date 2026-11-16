package ai.june.watchcompanion.phone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import ai.june.watchcompanion.phone.databinding.ActivityMainBinding

/**
 * The relay UI. June (through her phone door) or a human can:
 *   - type text + Send  -> pushes it to the watch (shows + buzzes there)
 *   - Get state         -> asks the watch for battery/sensor snapshot
 *   - watch the log      -> every event, timestamped, is rendered live
 * The log is also a file (see EventLog) so it's real evidence, not a UI claim.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding

    private val updates = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) = refresh()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.sendButton.setOnClickListener {
            val text = b.messageInput.text?.toString()?.trim().orEmpty()
            if (text.isEmpty()) return@setOnClickListener
            WatchLink.send(this, Contract.PATH_MESSAGE, text) { outcome ->
                runOnUiThread {
                    EventLog.append(this, "PHONE → watch: \"$text\"  [$outcome]")
                    b.messageInput.text?.clear()
                    refresh()
                }
            }
        }

        b.stateButton.setOnClickListener {
            WatchLink.send(this, Contract.PATH_STATE_REQUEST, "") { outcome ->
                runOnUiThread {
                    EventLog.append(this, "PHONE → watch: state request  [$outcome]")
                    refresh()
                }
            }
        }

        b.clearButton.setOnClickListener {
            EventLog.clear(this)
            refresh()
        }
    }

    override fun onResume() {
        super.onResume()
        ContextCompat.registerReceiver(
            this, updates, IntentFilter(EventLog.ACTION_UPDATED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        refresh()
    }

    override fun onPause() {
        super.onPause()
        unregisterReceiver(updates)
    }

    private fun refresh() {
        val log = EventLog.read(this)
        b.logView.text = if (log.isBlank()) getString(R.string.no_events) else log
        b.logScroll.post { b.logScroll.fullScroll(View.FOCUS_DOWN) }
    }
}
