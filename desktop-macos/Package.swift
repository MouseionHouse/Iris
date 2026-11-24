// swift-tools-version:5.9
// The Iris macOS shell (mouseion/iris#109). `build.sh` builds the app target and wraps it in
// Iris.app; `swift test` runs the core's tests (they also run on Linux: the core is Foundation only).
import PackageDescription

var targets: [Target] = [
    // The bridge's checks and state, the matrix: parser, the navigation policy: no AppKit.
    .target(name: "IrisShellCore", path: "Sources/IrisShellCore"),
    .testTarget(name: "IrisShellCoreTests", dependencies: ["IrisShellCore"], path: "Tests/IrisShellCoreTests"),
]
#if os(macOS)
targets.append(
    .executableTarget(
        name: "Iris",
        dependencies: ["IrisShellCore"],
        path: "Sources/Iris",
        // build.sh passes -DIRIS_SHELL_TEST_HOOKS for test builds only.
        linkerSettings: [.linkedFramework("AppKit"), .linkedFramework("WebKit"), .linkedFramework("UserNotifications")]
    )
)
#endif

let package = Package(
    name: "Iris",
    // macOS 13, so Intel Macs (macOS 26 at most) are covered too, and anything newer.
    platforms: [.macOS(.v13)],
    targets: targets
)
