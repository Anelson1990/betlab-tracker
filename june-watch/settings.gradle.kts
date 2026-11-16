// June Watch Companion — v0 spike. Self-contained Gradle project so it lifts
// cleanly into its own repo later (Austin's "3 for intentions with going 2").
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "JuneWatchCompanion"
include(":phone", ":wear")
