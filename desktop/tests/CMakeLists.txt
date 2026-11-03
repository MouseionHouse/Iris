function(iris_test name)
    add_executable(${name} ${name}.cpp)
    target_link_libraries(${name} PRIVATE irisshell Qt6::Test)
    add_test(NAME ${name} COMMAND ${name})
    set_tests_properties(${name} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()

iris_test(tst_navigationpolicy)
iris_test(tst_irisbridge)
iris_test(tst_badge)

# Talks to a fake org.freedesktop.Notifications, so it runs on a session bus of its own.
find_program(IRIS_DBUS_RUN_SESSION dbus-run-session REQUIRED)
add_executable(tst_notifier tst_notifier.cpp fakenotificationserver.h)
target_link_libraries(tst_notifier PRIVATE irisshell Qt6::Test)
target_compile_definitions(tst_notifier PRIVATE IRIS_NOTIFYRC="${CMAKE_CURRENT_SOURCE_DIR}/../house.mouseion.iris.notifyrc")
add_test(NAME tst_notifier COMMAND ${IRIS_DBUS_RUN_SESSION} -- $<TARGET_FILE:tst_notifier>)
set_tests_properties(tst_notifier PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")

# The fake server as a process, for tests/e2e.
add_executable(fakenotifyd fakenotifyd.cpp fakenotificationserver.h)
target_link_libraries(fakenotifyd PRIVATE Qt6::Core Qt6::DBus)
# KNotification asks the server once per process whether it can take an inline reply, so the plain
# server is a second run of the same test.
add_test(NAME tst_notifier_plain_server COMMAND ${IRIS_DBUS_RUN_SESSION} -- $<TARGET_FILE:tst_notifier> replyActionOnlyWhenTheServerCanDoIt)
set_tests_properties(tst_notifier_plain_server PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;IRIS_TEST_SERVER_WITHOUT_INLINE_REPLY=1")
