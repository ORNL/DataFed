import setuptools
from os import path


# read the contents of README file
this_directory = path.abspath(path.dirname(__file__))
with open(path.join(this_directory, 'README'), encoding='utf-8') as f:
    long_description = f.read()

# read the contents of VERSION file
with open(path.join(this_directory, 'VERSION'), encoding='utf-8') as f:
    version = f.read()

setuptools.setup(
    name="datafed",
    version=version,
    author="Dale Stansberry",
    author_email="stansberrydv@ornl.gov",
    description="DataFed CLI and API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/ORNL/DataFed",
    packages=setuptools.find_packages(),
    setup_requires=[
        'setuptools',
    ],
    install_requires=[
        'protobuf>=3',
        'pyzmq>=16',
        'wget>=3',
        'click>=7',
        'prompt_toolkit>=2'
    ],
    entry_points={
        "console_scripts" : ["datafed = datafed.CLI:run"]
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)