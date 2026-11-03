function(iris_test name)
    add_executable(${name} ${name}.cpp)
    target_link_libraries(${name} PRIVATE irisshell Qt6::Test)
    add_test(NAME ${name} COMMAND ${name})
    set_tests_properties(${name} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()

iris_test(tst_navigationpolicy)
iris_test(tst_irisbridge)
