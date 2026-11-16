package ai.june.watchcompanion.phone

import android.content.Intent
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/**
 * Receives messages FROM the watch. Event-driven: the Wear framework starts this
 * service only when a message arrives, so there is no background loop to drain
 * the battery. Everything it hears goes into the timestamped EventLog.
 */
class PhoneWearListenerService : WearableListenerService() {

    override fun onMessageReceived(event: MessageEvent) {
        val text = String(event.data, Charsets.UTF_8)
        when (event.path) {
            Contract.PATH_PING ->
                EventLog.append(this, "WATCH → ping: ${text.ifBlank { "ping" }}")
            Contract.PATH_STATE ->
                EventLog.append(this, "WATCH → state: $text")
            else ->
                EventLog.append(this, "WATCH → ${event.path}: $text")
        }
        // Nudge the UI to refresh if it's open. Internal, not exported.
        sendBroadcast(Intent(EventLog.ACTION_UPDATED).setPackage(packageName))
    }
}
