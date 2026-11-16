package ai.june.watchcompanion.phone

/**
 * Message paths shared by the phone and watch apps. Kept in sync by hand with
 * :wear's Contract.kt (v0 has no shared module on purpose — keep it simple).
 * Both apps share the SAME applicationId + signing key, so the Data Layer treats
 * them as one app across the two nodes.
 */
object Contract {
    const val PATH_MESSAGE = "/june/message"          // phone -> watch: show text + buzz
    const val PATH_PING = "/june/ping"                // watch -> phone: a preset ping
    const val PATH_STATE_REQUEST = "/june/state/request" // phone -> watch: ask for state
    const val PATH_STATE = "/june/state"              // watch -> phone: battery/sensor JSON

    const val PRESET_NEED_YOU = "Need you"
}
