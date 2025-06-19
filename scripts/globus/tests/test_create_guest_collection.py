#!/usr/bin/env python3

import os
import tempfile


def should_recreate_guest_collection(current_base_path, base_path_cache_file):
    """
    Test version of the should_recreate_guest_collection function
    """
    # Read cached base path from file
    cached_base_path = None
    if os.path.exists(base_path_cache_file):
        try:
            with open(base_path_cache_file, 'r') as f:
                cached_base_path = f.read().strip()
        except Exception as e:
            print(f"Error reading cached base path: {e}")

    if cached_base_path:
        cached_base_path = cached_base_path.rstrip('/') if cached_base_path != '/' else '/'
        print(f"Found cached base path: '{cached_base_path}'")
    else:
        print("No cached base path found")

    print(f"Current BASE_PATH environment variable: '{current_base_path}'")

    # Check for manual override first
    force_recreate = os.getenv("DATAFED_FORCE_RECREATE_GUEST_COLLECTION", "false").lower() == "true"
    if force_recreate:
        return True, "DATAFED_FORCE_RECREATE_GUEST_COLLECTION is set, forcing recreation"

    # Compare base paths
    if cached_base_path is None:
        return True, "No cached base path available, recreating collection to ensure consistency"
    elif cached_base_path != current_base_path:
        return True, f"Base path changed from '{cached_base_path}' to '{current_base_path}'"
    else:
        return False, f"Base path unchanged ('{cached_base_path}'), keeping existing guest collection"


def test_scenarios():
    """Test different scenarios"""

    print("=== Testing Guest Collection Recreation Logic ===\n")

    # Create a temporary cache file for testing
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
        cache_file = f.name

    try:
        # Test 1: Force recreation with environment variable
        print("TEST 1: Force recreation with environment variable")
        os.environ["DATAFED_FORCE_RECREATE_GUEST_COLLECTION"] = "true"
        should_recreate, reason = should_recreate_guest_collection("/test/path", cache_file)
        print(f"Should recreate: {should_recreate}")
        print(f"Reason: {reason}")
        print()

        # Test 2: No cached path (file doesn't exist)
        print("TEST 2: No cached base path available")
        os.environ["DATAFED_FORCE_RECREATE_GUEST_COLLECTION"] = "false"
        should_recreate, reason = should_recreate_guest_collection("/test/path", cache_file)
        print(f"Should recreate: {should_recreate}")
        print(f"Reason: {reason}")
        print()

        # Test 3: Cached path exists and matches
        print("TEST 3: Cached path exists and matches current path")
        with open(cache_file, 'w') as f:
            f.write("/test/path")
        should_recreate, reason = should_recreate_guest_collection("/test/path", cache_file)
        print(f"Should recreate: {should_recreate}")
        print(f"Reason: {reason}")
        print()

        # Test 4: Cached path exists but differs
        print("TEST 4: Cached path exists but differs from current path")
        with open(cache_file, 'w') as f:
            f.write("/old/path")
        should_recreate, reason = should_recreate_guest_collection("/new/path", cache_file)
        print(f"Should recreate: {should_recreate}")
        print(f"Reason: {reason}")
        print()

    finally:
        # Clean up
        if os.path.exists(cache_file):
            os.unlink(cache_file)
        # Reset environment variable
        os.environ.pop("DATAFED_FORCE_RECREATE_GUEST_COLLECTION", None)


if __name__ == "__main__":
    test_scenarios()
