package ai.june.watchcompanion.phone

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import java.util.concurrent.Executors

/**
 * Sends a message to every connected watch node over the Wear Data Layer
 * (MessageClient — live, fire-and-forget; no synced state needed for v0).
 * Runs off the main thread; [onResult] is invoked (on a background thread) with a
 * short human-readable outcome — callers marshal back to the UI thread.
 */
object WatchLink {
    private val io = Executors.newSingleThreadExecutor()

    fun send(context: Context, path: String, text: String, onResult: (String) -> Unit) {
        val app = context.applicationContext
        io.execute {
            val outcome = try {
                val nodes = Tasks.await(Wearable.getNodeClient(app).connectedNodes)
                if (nodes.isEmpty()) {
                    "no watch connected"
                } else {
                    var ok = 0
                    for (node in nodes) {
                        try {
                            Tasks.await(
                                Wearable.getMessageClient(app)
                                    .sendMessage(node.id, path, text.toByteArray(Charsets.UTF_8))
                            )
                            ok++
                        } catch (_: Exception) {
                            // couldn't reach this node; try the next one
                        }
                    }
                    "sent to $ok/${nodes.size} node(s)"
                }
            } catch (e: Exception) {
                "send failed: ${e.message}"
            }
            onResult(outcome)
        }
    }
}
