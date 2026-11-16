package ai.june.watchcompanion.wear

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import java.util.concurrent.Executors

/** Watch -> phone sender (MessageClient). Off the main thread; result is a short string. */
object PhoneLink {
    private val io = Executors.newSingleThreadExecutor()

    fun send(context: Context, path: String, text: String, onResult: (String) -> Unit = {}) {
        val app = context.applicationContext
        io.execute {
            val outcome = try {
                val nodes = Tasks.await(Wearable.getNodeClient(app).connectedNodes)
                if (nodes.isEmpty()) {
                    "no phone connected"
                } else {
                    var ok = 0
                    for (n in nodes) {
                        try {
                            Tasks.await(
                                Wearable.getMessageClient(app)
                                    .sendMessage(n.id, path, text.toByteArray(Charsets.UTF_8))
                            )
                            ok++
                        } catch (_: Exception) {
                        }
                    }
                    "sent to $ok/${nodes.size}"
                }
            } catch (e: Exception) {
                "failed: ${e.message}"
            }
            onResult(outcome)
        }
    }
}
