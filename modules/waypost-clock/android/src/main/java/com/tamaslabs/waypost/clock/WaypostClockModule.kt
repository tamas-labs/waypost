package com.tamaslabs.waypost.clock

import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class WaypostClockModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WaypostClock")

    // elapsedRealtime() includes deep sleep (uptimeMillis() does not).
    Function("getUptimeMs") {
      SystemClock.elapsedRealtime().toDouble()
    }

    // BOOT_COUNT grows by one on every boot (API 24+). The kernel's random boot_id is only the fallback,
    // because SELinux may deny apps reading it.
    Function("getBootId") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val bootCount = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
      if (bootCount >= 0) {
        return@Function "android-boot:$bootCount"
      }
      val kernelBootId = runCatching { File("/proc/sys/kernel/random/boot_id").readText().trim() }.getOrNull()
      if (!kernelBootId.isNullOrEmpty()) {
        return@Function "android-kernel:$kernelBootId"
      }
      throw BootIdUnavailableException()
    }
  }
}

internal class BootIdUnavailableException :
  CodedException("Neither Settings.Global.BOOT_COUNT nor /proc/sys/kernel/random/boot_id is readable")
