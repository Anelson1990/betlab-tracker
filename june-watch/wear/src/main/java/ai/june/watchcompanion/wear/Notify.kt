package ai.june.watchcompanion.wear

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/**
 * Presents a June message on the watch (v1 #1): a HIGH-importance notification
 * with a full-screen intent. A full-screen-intent notification is the sanctioned
 * way to wake the screen and put UI in front FROM A BACKGROUND SERVICE — directly
 * launching an activity from the background is blocked on modern Android, so the
 * listener service uses this instead of starting MainActivity itself.
 *
 * The channel's own vibration is OFF so Buzz.june stays the single distinct buzz.
 * Posting needs POST_NOTIFICATIONS (API 33+), requested in MainActivity; if it's
 * denied the message still lands in the app UI (WatchState.lastMessage).
 */
object Notify {
    private const val CHANNEL_ID = "june_messages"
    private const val NOTIF_ID = 1001

    private fun ensureChannel(context: Context) {
        val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
            val ch = NotificationChannel(CHANNEL_ID, "June messages", NotificationManager.IMPORTANCE_HIGH)
            ch.description = "Messages from June"
            ch.enableVibration(false) // Buzz.june owns the vibration — no double buzz
            mgr.createNotificationChannel(ch)
        }
    }

    fun presentMessage(context: Context, text: String) {
        ensureChannel(context)
        val open = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pi = PendingIntent.getActivity(
            context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val shown = if (text.isBlank()) "(message)" else text
        val n = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle("June")
            .setContentText(shown)
            .setStyle(Notification.BigTextStyle().bigText(shown))
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setFullScreenIntent(pi, true) // wake the screen + present the text
            .build()

        val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        try {
            mgr.notify(NOTIF_ID, n)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted — message still shows in the app UI.
        }
    }
}
