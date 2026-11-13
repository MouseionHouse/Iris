// The one place that names Iris. Nothing else in the shell hardcodes these. The URL and origin come
// from the build (CMake's IRIS_URL).
#pragma once

#include <QLatin1StringView>

namespace ShellConfig {

inline constexpr QLatin1StringView url{IRIS_SHELL_URL};
inline constexpr QLatin1StringView origin{IRIS_SHELL_ORIGIN};
inline constexpr QLatin1StringView appId{"house.mouseion.iris"};
inline constexpr QLatin1StringView displayName{"Iris"};
inline constexpr QLatin1StringView iconName{"house.mouseion.iris"};
// The theme emblem the tray draws over the icon while something mentions you (#83).
inline constexpr QLatin1StringView mentionOverlayIconName{"emblem-important"};
inline constexpr QLatin1StringView desktopFileName{"house.mouseion.iris"};
// QCoreApplication name and domain: KDBusService derives its D-Bus name from them
// ("house.mouseion" + "." + "iris" == appId), and Qt derives the data directory from the name.
inline constexpr QLatin1StringView organizationDomain{"mouseion.house"};
inline constexpr QLatin1StringView applicationName{"iris"};
inline constexpr QLatin1StringView profileName{"iris"};

}
