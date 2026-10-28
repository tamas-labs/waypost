package com.tamaslabs.waypost.power

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WaypostPowerModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WaypostPower")

    // Whether the app is exempt from battery optimization (Doze and App Standby do not hold back its alarms).
    Function("isIgnoringBatteryOptimizations") {
      val powerManager = context.getSystemService(PowerManager::class.java)
      powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    // Opens the system dialog that asks for the exemption. Some vendors remove that dialog; then the list of
    // battery optimization settings opens instead, where the guard has to find the app.
    Function("requestIgnoreBatteryOptimizations") {
      val request = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
      try {
        start(request)
      } catch (_: ActivityNotFoundException) {
        start(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      }
    }
  }

  private fun start(intent: Intent) {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
