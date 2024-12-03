# @package datafed.VersionUtils
# version utilities for ensuring updated version of package are being used
#
# The functions included in here are to do version comparisons and to grab
# the registered versions that are available on pypi.

import re
import requests


# Function to convert version string into a tuple of integers for comparison
def version_key(version):
    # Split main version and optional build number (e.g., "1.1.0-4" -> ["1.1.0", "4"])
    main_version, *build = version.split("-")
    # Convert main version part to tuple of integers for correct comparison
    main_version_tuple = tuple(map(int, main_version.split(".")))
    # Convert build part to integer if it exists, or set to -1 for non-build versions
    build_number = int(build[0]) if build else -1
    # Return full tuple for sorting, making sure 0.x.y is distinct from x.y.z
    return main_version_tuple + (build_number,)


# Function to check if a string contains any letters
def contains_letters(s):
    return bool(re.search("[a-zA-Z]", s))


def remove_after_prefix_with_numbers(s):
    # Use regular expression to match the prefix with numbers
    match = re.match(r"(\d+.*?)(\D.*)", s)
    if match:
        return match.group(1)  # Return the part before the remaining string
    return s  # If no match is found, return the original string


# Check with pypi if a newer release is available, only look for stable
# versions
def get_latest_stable_version(package_name):
    try:
        url = f"https://pypi.org/pypi/{package_name}/json"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        # Extract release versions
        releases = list(data.get("releases", {}).keys())
        # Filter the list to remove entries that contain any letters, we don't
        # want to look at entries that could be a pre-release of some sort and
        # recommend that the user use for instance a beta version.
        releases = [release for release in releases if not contains_letters(release)]
        if not releases:
            return None

        # Sort versions using the custom key function
        sorted_releases = sorted(releases, key=version_key)
        return sorted_releases[-1]
    except Exception as e:
        print(f"Unable to connect to pypi: {e}")
        return None
