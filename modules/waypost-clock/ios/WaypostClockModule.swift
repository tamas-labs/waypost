import Darwin
import ExpoModulesCore

public class WaypostClockModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WaypostClock")

    // On Darwin, CLOCK_MONOTONIC keeps counting while the device sleeps (CLOCK_UPTIME_RAW does not).
    Function("getUptimeMs") { () -> Double in
      Double(clock_gettime_nsec_np(CLOCK_MONOTONIC) / 1_000_000)
    }

    // kern.bootsessionuuid is a new random UUID on every boot. kern.boottime is only the fallback: it is
    // derived from the wall clock, so it may move when the clock is set, without a reboot.
    Function("getBootId") { () throws -> String in
      if let session = Self.sysctlString("kern.bootsessionuuid") {
        return "ios-session:" + session.lowercased()
      }
      if let bootTime = Self.bootTimeSeconds() {
        return "ios-boottime:" + String(bootTime)
      }
      throw BootIdUnavailableException()
    }

    // iOS does not tell the GNSS time of a fix (gnss_time is Android only).
    Function("getGnssTimeMs") { (_: Double) -> Double? in
      nil
    }
  }

  private static func sysctlString(_ name: String) -> String? {
    var size = 0
    guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 1 else { return nil }
    var buffer = [CChar](repeating: 0, count: size)
    guard sysctlbyname(name, &buffer, &size, nil, 0) == 0 else { return nil }
    let value = String(cString: buffer)
    return value.isEmpty ? nil : value
  }

  private static func bootTimeSeconds() -> Int? {
    var bootTime = timeval()
    var size = MemoryLayout<timeval>.size
    guard sysctlbyname("kern.boottime", &bootTime, &size, nil, 0) == 0 else { return nil }
    return Int(bootTime.tv_sec)
  }
}

internal final class BootIdUnavailableException: Exception {
  override var reason: String {
    "Neither kern.bootsessionuuid nor kern.boottime is readable"
  }
}
