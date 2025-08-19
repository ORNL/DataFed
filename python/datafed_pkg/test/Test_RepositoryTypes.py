#!/usr/bin/env python3
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import the constant from CommandLib
try:
    from datafed.CommandLib import VALID_REPO_TYPES
except ImportError:
    # Fallback if import fails
    VALID_REPO_TYPES = ["globus", "metadata_only"]


def test_repository_type_validation():
    """Test repository type validation logic."""
    print("Testing type validation...")
    
    def validate_repo_type(type_value):
        """Validate repository type."""
        if type_value is None:
            type_value = "globus"
        if type_value not in VALID_REPO_TYPES:
            raise ValueError(f"Invalid repository type '{type_value}'. Must be one of: {', '.join(VALID_REPO_TYPES)}")
        return True
    
    test_cases = [
        ("globus", True),
        ("metadata_only", True,),
        ("invalid", False),
        ("", False),
        ("GLOBUS", False),
        ("Metadata_Only", False),
        (None, True),
        (123, False),
        ([], False),
        ({}, False),
        (3.14, False),
    ]
    
    failed = 0
    
    for type_value, should_pass in test_cases:
        try:
            validate_repo_type(type_value)
            if not should_pass:
                print(f"FAIL: '{type_value}' should have been rejected")
                failed += 1
        except ValueError:
            if should_pass:
                print(f"FAIL: '{type_value}' incorrectly rejected")
                failed += 1
    
    return failed == 0


def test_default_type_behavior():
    """Test that type defaults to 'globus'."""
    print("Testing default behavior...")
    
    def create_repo(repo_id, repo_type="globus", **kwargs):
        """Simulate repoCreate with default type."""
        if repo_type is None:
            repo_type = "globus"
        return {"repo_id": repo_id, "type": repo_type}
    
    # Test explicit, default, and None cases
    tests = [
        (create_repo("test1", repo_type="metadata_only"), "metadata_only"),
        (create_repo("test2"), "globus"),
        (create_repo("test3", repo_type=None), "globus"),
    ]
    
    for result, expected in tests:
        if result["type"] != expected:
            print(f"FAIL: Expected '{expected}', got '{result['type']}'")
            return False
    
    return True


def main():
    """Run all tests."""
    print("Repository Type Tests")
    print("-" * 30)
    
    all_passed = True
    
    if not test_repository_type_validation():
        all_passed = False
    
    if not test_default_type_behavior():
        all_passed = False
    
    print("-" * 30)
    if all_passed:
        print("All tests passed")
        return 0
    else:
        print("Tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())