import setuptools

setuptools.setup(
    name="datafed-dvstans",
    version="0.5.5",
    scripts = ['scripts/datafed'],
    author="Dale Stansberry",
    author_email="stansberrydv@ornl.gov",
    description="DataFed CLI and API",
    long_description="DataFed command-line interface and client libraries.",
    long_description_content_type="text/markdown",
    url="https://github.com/ORNL/DataFed",
    packages=setuptools.find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)