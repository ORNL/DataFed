import setuptools

with open("README.md", "r") as fh:
    long_description = fh.read()

setuptools.setup(
    name="datafed-dvstans",
    version="0.5.1",
    author="Dale Stansberry",
    author_email="stansberrydv@ornl.gov",
    description="DataFed CLI and API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/ORNL/DataFed",
    packages=setuptools.find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)