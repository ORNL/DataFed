from datafed.VERSION import __version__
import setuptools
from os import path
import os

# read the contents of README file
this_directory = path.abspath(path.dirname(__file__))
with open(path.join(this_directory, "README"), encoding="utf-8") as f:
    long_description = f.read()


with open("requirements.txt", "r") as f:
    install_requires = [line.strip() for line in f]

setuptools.setup(
    name=os.getenv("DATAFED_PYPI_REPO", "datafed"),
    version=__version__,
    author="Dale Stansberry, Joshua Brown",
    author_email="stansberrydv@ornl.gov, brownjs@ornl.gov",
    description="DataFed CLI and API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/ORNL/DataFed",
    packages=setuptools.find_packages(),
    setup_requires=["setuptools"],
    install_requires=install_requires,
    entry_points={"console_scripts": ["datafed = datafed.CLI:run"]},
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)
