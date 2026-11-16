package ai.june.watchcompanion.wear

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Process-wide observable state. The listener service writes to it (e.g. a new
 * message from June), the Compose UI reads it. Simple + sufficient for v0; if we
 * ever need it to survive process death, move to DataClient synced state.
 */
object WatchState {
    var lastMessage by mutableStateOf("")
    var status by mutableStateOf("idle")
    var battery by mutableStateOf(-1)
    var steps by mutableStateOf<Int?>(null)
    var heartRate by mutableStateOf<Int?>(null)
}
