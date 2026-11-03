// The one place that names Iris. Nothing else in the shell hardcodes these.
#pragma once

#include <QLatin1StringView>

namespace ShellConfig {

inline constexpr QLatin1StringView url{"https://iris.example.org"};
inline constexpr QLatin1StringView origin{"https://iris.example.org"};
inline constexpr QLatin1StringView appId{"house.mouseion.iris"};
inline constexpr QLatin1StringView displayName{"Iris"};
inline constexpr QLatin1StringView iconName{"house.mouseion.iris"};
inline constexpr QLatin1StringView desktopFileName{"house.mouseion.iris"};
// QCoreApplication name and domain: KDBusService derives its D-Bus name from them
// ("house.mouseion" + "." + "iris" == appId), and Qt derives the data directory from the name.
inline constexpr QLatin1StringView organizationDomain{"mouseion.house"};
inline constexpr QLatin1StringView applicationName{"iris"};
inline constexpr QLatin1StringView profileName{"iris"};

}
