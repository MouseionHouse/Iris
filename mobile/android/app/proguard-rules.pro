# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Capacitor reads @CapacitorPlugin (and the @Permission entries in it) by reflection at run time.
# Its own rules keep the plugins but not these annotation types, and R8 then treats the plugin's
# annotation as always null: a permission request finds no permission strings and returns without
# settling the call. MouseionPush.enable() hung on a spinner that way (2026-10-12).
-keep @interface com.getcapacitor.annotation.** { *; }
