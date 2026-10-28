Pod::Spec.new do |s|
  s.name           = 'WaypostClock'
  s.version        = '1.0.0'
  s.summary        = 'Monotonic clock (uptime including sleep) and boot ID'
  s.description    = 'Monotonic clock (uptime including sleep) and boot ID for the Waypost chain entries'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
