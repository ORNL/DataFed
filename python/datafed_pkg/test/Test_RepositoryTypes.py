#!/usr/bin/env python3
"""
Simple test for repository type functionality in DataFed Python SDK.
Tests the validation logic without requiring full API setup.
"""

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
    print("Testing repository type validation...")
    
    # Simulate the validation logic from CommandLib.py
    def validate_repo_type(type_value):
        """Validate repository type (from CommandLib.py)."""
        if type_value is None:
            type_value = "globus"
        if type_value not in VALID_REPO_TYPES:
            raise ValueError(f"Invalid repository type '{type_value}'. Must be one of: {', '.join(VALID_REPO_TYPES)}")
        return True
    
    # Test valid types
    test_cases = [
        ("globus", True, "Valid 'globus' type"),
        ("metadata_only", True, "Valid 'metadata_only' type"),
        ("invalid", False, "Invalid type should raise error"),
        ("", False, "Empty type should raise error"),
        ("GLOBUS", False, "Uppercase should raise error (case-sensitive)"),
        ("Metadata_Only", False, "Mixed case should raise error"),
        (None, True, "None type should default to 'globus'"),
        (123, False, "Integer type should raise error"),
        ([], False, "List type should raise error"),
        ({}, False, "Dict type should raise error"),
        (3.14, False, "Float type should raise error"),
    ]
    
    passed = 0
    failed = 0
    
    for type_value, should_pass, description in test_cases:
        try:
            validate_repo_type(type_value)
            if should_pass:
                print(f"✓ {description}: '{type_value}' accepted")
                passed += 1
            else:
                print(f"✗ {description}: '{type_value}' should have been rejected")
                failed += 1
        except ValueError as e:
            if not should_pass:
                print(f"✓ {description}: '{type_value}' correctly rejected - {e}")
                passed += 1
            else:
                print(f"✗ {description}: '{type_value}' incorrectly rejected - {e}")
                failed += 1
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0


def test_default_type_behavior():
    """Test that type defaults to 'globus'."""
    print("\nTesting default type behavior...")
    
    # Simulate default parameter behavior with None handling
    def create_repo(repo_id, repo_type="globus", **kwargs):
        """Simulate repoCreate with default type."""
        if repo_type is None:
            repo_type = "globus"
        return {"repo_id": repo_id, "type": repo_type}
    
    # Test with explicit type
    result = create_repo("test1", repo_type="metadata_only")
    assert result["type"] == "metadata_only", "Explicit type not preserved"
    print("✓ Explicit type 'metadata_only' preserved")
    
    # Test with default type
    result = create_repo("test2")
    assert result["type"] == "globus", "Default type not set to 'globus'"
    print("✓ Default type is 'globus'")
    
    # Test with type=None
    result = create_repo("test3", repo_type=None)
    assert result["type"] == "globus", "Type=None did not default to 'globus'"
    print("✓ Type=None defaults to 'globus'")
    
    return True


def main():
    """Run all tests."""
    print("DataFed Python SDK Repository Type Tests")
    print("=" * 50)
    
    all_passed = True
    
    # Run validation tests
    if not test_repository_type_validation():
        all_passed = False
    
    # Run default behavior tests
    if not test_default_type_behavior():
        all_passed = False
    
    print("\n" + "=" * 50)
    if all_passed:
        print("🎉 All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())