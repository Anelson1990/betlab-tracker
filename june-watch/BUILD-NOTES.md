# June Watch Companion — BUILD-NOTES (v0 spike)

Build hand: Claude (cloud seat). Date: 2026-11-16.
Goal: give June a **Bluetooth** channel into Austin's Galaxy Watch6 (no WiFi needed
on the watch leg), via a Wear OS app + a phone relay over the Wear Data Layer.

## STATUS — read this first (honest labels)

- **SOURCE COMPLETE — UNCOMPILED.** I could not build the APKs in the cloud
  container: its proxy **blocks `dl.google.com`** (confirmed: `403 to CONNECT,
  policy denial`), which is the only source of the Android SDK platform +
  build-tools. Google Maven and Gradle *are* reachable, so the build works
  anywhere with the SDK — just not here.
- Therefore every v0 action below is **BUILT (in source) BUT UNPROVEN** until it's
  compiled and run on Austin's real watch + phone. Nothing here is VERIFIED LIVE yet.
- The out-of-scope powers (tap injection, accessibility, pm/package control) are
  **IMPOSSIBLE BY DESIGN** for a sideloaded Wear OS app and were **not attempted** —
  that's June's separate ADB-over-WiFi project.

## v0 scope (three actions, all implemented in source)

1. **Phone → watch:** phone sends text on `/june/message`; the watch shows it and
   plays June's distinct buzz (two short taps + one long). — *unproven*
2. **Watch → phone:** the watch's **"Need you"** button sends `/june/ping`; the
   phone logs it with a timestamp (in-app log + a file). — *unproven*
3. **Watch state it legitimately owns:** battery (no permission) + a step/heart-rate
   snapshot **only if** the user grants `BODY_SENSORS` / `ACTIVITY_RECOGNITION`,
   requested in the open on the watch; degrades to "—" if denied. The phone can also
   pull it with **Get state** (`/june/state/request` → `/june/state` JSON). — *unproven*

## Key decisions

- **Same applicationId on both apps:** `ai.june.watchcompanion`. The Data Layer only
  pairs the watch + phone apps when they share the same package name **and the same
  signing key**. (Code packages differ: `…​.phone` / `…​.wear` namespaces — that's fine.)
- **MessageClient, not DataClient.** v0 only needs live pings, not synced state.
  Paths: `/june/message`, `/june/ping`, `/june/state/request`, `/june/state`.
- **Idle-cheap / battery-safe (it's also the sleep tracker):** both listener
  services are event-driven (the framework starts them only on an incoming
  message). No polling loops, no wake locks. Sensor reads are **one-shot snapshots**
  — register, grab the first value, unregister immediately (4s timeout).
- **Graceful permission degrade:** no sensor permission → snapshot returns null →
  UI shows "—" and the phone JSON carries `null`. Battery always works.

## ⚠️ Signing — the gotcha that breaks the Data Layer

Both APKs **must be signed with the same key** or the watch and phone won't see each
other. For this v0 spike that means the simplest safe path is:

- **Build BOTH modules on the SAME machine in one go** so they share that machine's
  Android **debug** keystore (`~/.android/debug.keystore`). Do **not** build the
  phone APK on one machine and the watch APK on another — different debug keys →
  they won't pair.
- The debug keystore is **not** committed (the repo `.gitignore` blocks all
  `*.keystore` / `*.jks`; the crew floor keeps keys off the repo).
- **For a real (non-debug) build:** Austin generates one release keystore, keeps the
  file himself (off-repo), and a `signingConfigs { release { … } }` block is added
  that reads its path/passwords from `local.properties` or env — not from source.
  Not needed for the v0 spike.

## Build (on a machine with the Android SDK — Austin's box, June's box, or Android Studio)

Easiest: open `june-watch/` in **Android Studio** (it brings its own JDK + SDK) and
let it build. Or command line, with `ANDROID_HOME` set and SDK packages installed:

```bash
cd june-watch
# first time only, generate the Gradle wrapper (or just open in Android Studio):
#   gradle wrapper --gradle-version 8.9
./gradlew :phone:assembleDebug :wear:assembleDebug     # build BOTH together (same debug key)
```

Outputs:
- phone: `phone/build/outputs/apk/debug/phone-debug.apk`
- watch: `wear/build/outputs/apk/debug/wear-debug.apk`

Toolchain pinned conservative (real, compatible as of early 2026): AGP 8.5.2,
Kotlin 1.9.24 (Compose compiler 1.5.14), Gradle 8.9, compileSdk 34. Android Studio
may offer newer — safe to accept. (I could not run the compiler here, so expect a
normal first-build fix-up pass in Studio.)

## Install (Austin's tap — nothing installs without his approval)

- **Phone APK:** `adb install -r phone-debug.apk` (phone on USB or ADB-WiFi).
- **Watch APK:** over the ADB-over-WiFi door June opens (watch Developer options →
  Wireless debugging): `adb connect <watch-ip>:<port>` then
  `adb -s <watch-ip>:<port> install -r wear-debug.apk`. Coordinate the door with June.
- Open "June" on the watch and "June Watch (Phone)" on the phone once, so the
  listener services are registered.

## Prove it (the evidence trail, once it's on hardware)

- **Phone→watch:** type text on the phone, Send → text appears on the watch + it
  buzzes. Screenshot the watch.
- **Watch→phone:** tap "Need you" on the watch → the phone log shows
  `WATCH → ping: Need you` with a timestamp. The log is also a file:
  `adb shell run-as ai.june.watchcompanion cat files/june_events.log`.
- **State:** tap "Read sensors" on the watch (grant or deny the prompt — both are
  valid outcomes to record); or "Get state" on the phone → JSON logged.
- Grade with June from her phone door; report to Austin gist-first.

## Files
```
june-watch/
  settings.gradle.kts, build.gradle.kts, gradle.properties, gradle/wrapper/…
  phone/  (Android relay: MainActivity, PhoneWearListenerService, WatchLink, EventLog, Contract)
  wear/   (Wear OS: MainActivity[Compose], WatchWearListenerService, PhoneLink, Buzz, Sensors, WatchState, Contract)
```
`Contract.kt` is duplicated in both modules by design (no shared module in v0) — keep
the two in sync if paths change.
