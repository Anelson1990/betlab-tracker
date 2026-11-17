package ai.june.watchcompanion.wear

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { WatchUi() }
    }
}

@Composable
private fun WatchUi() {
    val context = LocalContext.current
    val scroll = rememberScrollState()
    var lastPing by remember { mutableStateOf(0L) }

    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* if denied, June's messages still show in-app */ }

    LaunchedEffect(Unit) {
        WatchState.battery = Sensors.batteryPercent(context)
        // v1 #1: POST_NOTIFICATIONS (API 33+) so the wake-and-present notification can post.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { readSensors(context) }

    MaterialTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .padding(horizontal = 12.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("June", textAlign = TextAlign.Center, style = MaterialTheme.typography.title2)
            Spacer(Modifier.height(4.dp))
            Text(
                if (WatchState.lastMessage.isBlank()) "(no message yet)" else WatchState.lastMessage,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.body1
            )
            Spacer(Modifier.height(12.dp))

            // v1 #2: Chips (full-width rounded) instead of circular Buttons so the
            // labels don't clip on the 480x480 round screen.
            Chip(
                onClick = {
                    val now = System.currentTimeMillis()
                    if (now - lastPing >= 2000L) { // v1 #4: light debounce
                        lastPing = now
                        PhoneLink.send(context, Contract.PATH_PING, Contract.PRESET_NEED_YOU) {
                            WatchState.status = it
                        }
                    }
                },
                label = { Text(Contract.PRESET_NEED_YOU) },
                colors = ChipDefaults.primaryChipColors(),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(8.dp))

            Chip(
                onClick = {
                    val needed = sensorPermissions().filter {
                        ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
                    }
                    if (needed.isEmpty()) readSensors(context) else permLauncher.launch(needed.toTypedArray())
                },
                label = { Text("Read sensors") },
                colors = ChipDefaults.secondaryChipColors(),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(12.dp))
            Text("Battery: " + if (WatchState.battery < 0) "?" else "${WatchState.battery}%")
            Text("Steps today: " + (WatchState.steps?.toString() ?: "—"))
            Text("Heart: " + (WatchState.heartRate?.let { "$it bpm" } ?: "—"))
            Spacer(Modifier.height(8.dp))
            Text(WatchState.status, style = MaterialTheme.typography.caption1)
        }
    }
}

private fun sensorPermissions(): List<String> {
    val list = mutableListOf(Manifest.permission.BODY_SENSORS)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        list += Manifest.permission.ACTIVITY_RECOGNITION
    }
    return list
}

private fun readSensors(context: Context) {
    WatchState.battery = Sensors.batteryPercent(context)
    // v1 #3: convert the cumulative counter to today's steps.
    Sensors.snapshot(context, Sensor.TYPE_STEP_COUNTER) { raw ->
        WatchState.steps = raw?.let { StepBaseline.daily(context, it.toInt()) }
    }
    Sensors.snapshot(context, Sensor.TYPE_HEART_RATE) { WatchState.heartRate = it?.toInt() }
    WatchState.status = "sensors read"
}
