# WARNING - Adding Tests

Note CMake is configured to run tests one at a time. The tests are specified in
CMake by passing a string that is matched against the chai test cases in the
"it()" sections of the chai unit tests..

i.e.

CMakeLists.txt line

```
add_test(NAME foxx_record COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_foxx.sh" -t "unit_record")
```

This will pass "unit_record" as the pattern to be matched to the test_foxx.sh
script. In turn, the test_foxx.sh script will call foxx test with
"unit_record".  Tests are not matched based on the name of the test file they
are matched based on the test cases. 

i.e.

Below is part of a test case that would be matched against the "unit_record" pattern.

```

describe('Record Class', () => {
  it('unit_record: isPathConsistent should return false paths are inconsistent in new and old alloc.', () => {
     :
     :
  });
});
``` 

Notice that 'unit_record' is explicitly mentioned in the test case.
