cmake_minimum_required(VERSION 3.24)
project(iris-desktop VERSION 0.1.0 LANGUAGES CXX)

find_package(ECM REQUIRED NO_MODULE)
set(CMAKE_MODULE_PATH ${ECM_MODULE_PATH})

include(KDEInstallDirs)
include(KDECMakeSettings)
include(KDECompilerSettings NO_POLICY_SCOPE)

option(IRIS_SHELL_TEST_HOOKS "Let environment variables point the shell at a test server (never for release builds)" OFF)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Network Qml Quick QuickControls2 WebChannel WebEngineQuick Test)
find_package(KF6 REQUIRED COMPONENTS Config CoreAddons DBusAddons)

qt_policy(SET QTP0001 NEW)

qt_add_library(irisshell STATIC
    src/irisbridge.cpp
    src/navigationpolicy.cpp
    src/networkwatch.cpp
    src/windowstate.cpp
)
target_include_directories(irisshell PUBLIC src)
target_compile_definitions(irisshell PUBLIC IRIS_SHELL_VERSION="${PROJECT_VERSION}")
target_link_libraries(irisshell PUBLIC Qt6::Core Qt6::Gui Qt6::Network Qt6::WebChannel KF6::ConfigCore KF6::ConfigGui)
set_source_files_properties(../branding/iris-app-icon.svg PROPERTIES QT_RESOURCE_ALIAS icon.svg)
set_source_files_properties(src/bridge-adapter.js PROPERTIES QT_RESOURCE_ALIAS bridge-adapter.js)
qt_add_resources(irisshell iris_assets PREFIX /iris FILES src/bridge-adapter.js ../branding/iris-app-icon.svg)

qt_add_executable(iris src/main.cpp)
qt_add_qml_module(iris
    URI House.Iris
    VERSION 1.0
    QML_FILES src/qml/Main.qml src/qml/OfflinePage.qml
)
target_link_libraries(iris PRIVATE irisshell Qt6::Quick Qt6::QuickControls2 Qt6::WebEngineQuick KF6::DBusAddons KF6::CoreAddons)
if(IRIS_SHELL_TEST_HOOKS)
    target_compile_definitions(iris PRIVATE IRIS_SHELL_TEST_HOOKS)
endif()

install(TARGETS iris ${KDE_INSTALL_TARGETS_DEFAULT_ARGS})
install(PROGRAMS house.mouseion.iris.desktop DESTINATION ${KDE_INSTALL_APPDIR})
# KF6 reads knotifications6; KDE_INSTALL_KNOTIFYRCDIR is still the KF5 knotifications5 here.
install(FILES house.mouseion.iris.notifyrc DESTINATION ${KDE_INSTALL_DATADIR}/knotifications6)
install(DIRECTORY icons/hicolor DESTINATION ${KDE_INSTALL_ICONDIR})
install(FILES ../branding/iris-app-icon.svg DESTINATION ${KDE_INSTALL_ICONDIR}/hicolor/scalable/apps RENAME house.mouseion.iris.svg)

enable_testing()
add_subdirectory(tests)
