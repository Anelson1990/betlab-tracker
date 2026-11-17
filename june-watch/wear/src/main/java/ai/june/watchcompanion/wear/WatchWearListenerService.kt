package ai.june.watchcompanion.wear

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/**
 * Receives messages FROM the phone (June). Event-driven — started only on a
 * message, no background loop.
 *   /june/message        -> show the text + play June's buzz
 *   /june/state/request  -> reply with battery (+ last sensor snapshot) as JSON
 */
class WatchWearListenerService : WearableListenerService() {

    override fun onMessageReceived(event: MessageEvent) {
        val text = String(event.data, Charsets.UTF_8)
        when (event.path) {
            Contract.PATH_MESSAGE -> {
                WatchState.lastMessage = text
                WatchState.status = "message from June"
                Buzz.june(this)
                Notify.presentMessage(this, text) // v1 #1: wake + put the text in front
            }
            Contract.PATH_STATE_REQUEST -> replyState()
        }
    }

    private fun replyState() {
        WatchState.battery = Sensors.batteryPercent(this)
        val json = JSONObject()
            .put("battery", WatchState.battery)
            .put("steps", WatchState.steps ?: JSONObject.NULL)
            .put("heartRate", WatchState.heartRate ?: JSONObject.NULL)
            .toString()
        PhoneLink.send(this, Contract.PATH_STATE, json)
    }
}
