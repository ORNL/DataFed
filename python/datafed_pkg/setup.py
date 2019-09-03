import setuptools
from os import path
from datafed import version

# read the contents of your README file
this_directory = path.abspath(path.dirname(__file__))
with open(path.join(this_directory, 'README'), encoding='utf-8') as f:
    long_description = f.read()

setuptools.setup(
    name="datafed-dvstans",
    version=version,
    scripts = ['scripts/datafed'],
    author="Dale Stansberry",
    author_email="stansberrydv@ornl.gov",
    description="DataFed CLI and API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/ORNL/DataFed",
    packages=setuptools.find_packages(),
    #install_requires=[
    #    'protobuf>=3.7',
    #    'pyzmq>=18',
    #    'wget>=3.2',
    #    'click>=7',
    #    'prompt_toolkit>2'
    #],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)