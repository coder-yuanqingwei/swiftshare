package com.swiftshare

import android.app.Application
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import java.io.File

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    installCrashReporter()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
  }

  /**
   * Diagnostics: capture any uncaught Java exception, persist it to a file and
   * hand it to the separate ":crash" process so it survives process death.
   */
  private fun installCrashReporter() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      val trace = buildString {
        append("TIME: ")
        append(java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
            .format(java.util.Date()))
        append("\nTHREAD: ")
        append(thread.name)
        append("\n\n")
        append(Log.getStackTraceString(throwable))
      }
      runCatching {
        val dir = getExternalFilesDir(null) ?: filesDir
        File(dir, "swiftshare_crash.txt").writeText(trace)
        val i = Intent(this, CrashReportActivity::class.java)
        i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        i.addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
        i.putExtra("trace", trace)
        startActivity(i)
      }
      // Give the :crash process a moment to start and render before we die.
      try { Thread.sleep(1200) } catch (_: InterruptedException) {}
      previous?.uncaughtException(thread, throwable)
    }
  }
}
