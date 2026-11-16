package ai.june.watchcompanion.wear

/** Mirror of :phone's Contract.kt — keep the two in sync by hand (v0, no shared module). */
object Contract {
    const val PATH_MESSAGE = "/june/message"          // phone -> watch: show text + buzz
    const val PATH_PING = "/june/ping"                // watch -> phone: a preset ping
    const val PATH_STATE_REQUEST = "/june/state/request" // phone -> watch: ask for state
    const val PATH_STATE = "/june/state"              // watch -> phone: battery/sensor JSON

    const val PRESET_NEED_YOU = "Need you"
}
