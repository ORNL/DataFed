<div align="center">

  [![getopts_long logo](https://raw.githubusercontent.com/UrsaDK/getopts_long/master/docs/images/logo.png)](#)<br>

  [![stable branch](https://img.shields.io/badge/dynamic/json.svg?color=lightgrey&label=stable&query=%24.default_branch&url=https%3A%2F%2Fapi.github.com%2Frepos%2FUrsaDK%2Fgetopts_long&logo=github)](https://github.com/UrsaDK/getopts_long/tree/master)
  [![latest release](https://img.shields.io/badge/dynamic/json.svg?color=blue&label=release&query=%24.name&url=https%3A%2F%2Fapi.github.com%2Frepos%2FUrsaDK%2Fgetopts_long%2Freleases%2Flatest&logo=docker)](https://hub.docker.com/r/ursadk/getopts_long)
  [![test coverage](https://codecov.io/gh/UrsaDK/getopts_long/graph/badge.svg)](https://codecov.io/gh/UrsaDK/getopts_long)
  [![donate link](https://img.shields.io/badge/donate-coinbase-gold.svg?colorB=ff8e00&logo=bitcoin)](https://commerce.coinbase.com/checkout/17ae30c2-9c3f-45fb-a911-36d01a3c81b6)

</div>

# getopts_long

This is a pure BASH implementation of `getopts_long` function, which "upgrades" the built-in `getopts` with support for GNU-style long options, such as:

  - `--option`
  - `--option value`
  - `--option=value`

This function is 100% compatible with the built-in `getopts`. It is implemented with no external dependencies, and relies solely on BASH built-in tools to provide all of its functionality.

Table of Content
----------------

<!-- TOC START min:2 max:4 link:true asterisk:false update:true -->
- [Table of Content](#table-of-content)
- [Installation](#installation)
  - [Source the library](#source-the-library)
  - [Paste the content](#paste-the-content)
  - [Run in docker](#run-in-docker)
- [Usage](#usage)
  - [Extended OPTSPEC](#extended-optspec)
  - [Example script](#example-script)
- [How It Works](#how-it-works)
  - [Internal variables](#internal-variables)
  - [Error reporting](#error-reporting)
    - [Verbose mode](#verbose-mode)
    - [Silent mode](#silent-mode)
<!-- TOC END -->

## Installation

The function is distributed via a single self-contained file:
```
lib/getopts_long.bash
```

There are a number of ways to make it available to your script, all of them come with their own advantages and disadvantages. Consider carefully all of the following and pick the method of installation that suits your needs best.

### Source the library

This is the recommended way of providing `getopts_long` functionality to your script. To use it, clone this repository somewhere on your system:

```
git clone https://github.com/UrsaDK/getopts_long.git
```

Then update your script to source the function code:

```
. "__PATH_TO__/getopts_long/lib/getopts_long.bash"
```

This method allows you to receive any future updates and all fixes to the function by simply running `git pull` within the repository. However, if you customise the function for your own needs, you might end up having to fix git merge conflicts in the future.

### Paste the content

An alternative method of installation is to simply copy-n-paste the content of `lib/getopts_long.bash` into your script.

This will make the function available to a single script and you will easily be able to customise it for your own needs. However, you will need to keep an eye on this repository and manually upgrade the function whenever an update is released.

### Run in docker

A more advanced way to run your script with getopts_long is to mount its directory into the getopts_long docker container:

```
docker container run --rm --init -it -v ${YOUR_SCRIPT_DIR}:/mnt ursadk/getopts_long -l
```

Your project is available under `/mnt` directory, and `getopts_long` function can be sourced from `/home/lib/getopts_long.bash`.

The container also provides the following tools:

  - `shellcheck` - https://github.com/koalaman/shellcheck
  - `bats-core` - https://github.com/bats-core/bats-core
  - `kcov` - https://github.com/SimonKagstrom/kcov
  - `/home/bin/bats` - a custom wrapper around the above three tools that allows you to run test and generates a coverage report as long as the root directory of your project includes `bin`, `lib`, and `test` directories, which are used accordingly.
  - `/home/bin/kcov` - a custom wrapper around the `kcov` command which cleans up output reports

Please note that `/home/bin` directory in _pre-pended_ to the shell's PATH variable. As such, all files placed in `/home/bin` will be executed in preference to the system tools. For example, executing `kcov` runs `/home/bin/kcov` not `/usr/local/bin/kcov`.

## Usage

The syntax for `getopts_long` is the same as the syntax for the built-in `getopts`:

```
getopts_long OPTSPEC VARNAME [ARGS...]
```

where:

| Name    | Description |
| ------- | ----------- |
| OPTSPEC | An extended list of expected options and their arguments. |
| VARNAME | A shell-variable to use for option reporting. |
| ARGS    | An optional list of arguments to parse. If omitted, then `getopts_long` will parse arguments supplied to the script. |

### Extended OPTSPEC

An OPTSPEC string tells `getopts_long` which options to expect and which of them must have an argument. The syntax is very simple:

- single-character options are named first (identical to the built-in `getopts`);
- long options follow the single-character options, they are named as is and are separated from each other and the single-character options by a space.

Just like with the original `getopts`, when you want `getopts_long` to expect an argument for an option, just place a `:` (colon) after the option.

For example, given `'af: all file:'` as the OPTSPEC string, `getopts_long` will recognise the following options:

- `-a` - a single character (short) option with no argument;
- `-f ARG` - a single character (short) option with an argument;
- `--all` - a multi-character (long) option with no argument;
- `--file ARG` - a multi-character (long) option with an argument.

If the very first character of the optspec-string is a `:` (colon), which would normally be nonsense because there's no option letter preceding it, `getopts_long` switches to "silent error reporting mode" (See [Error Reporting](#error-reporting) for more info).

In production scripts, "silent mode" is usually what you want because it allows you to handle errors yourself without being distracted by default error messages. It's also easier to handle, since the failure cases are indicated by assigning distinct characters to `VARNAME`.

### Example script

A good example is worth a thousand words, so here is an example of how you could use the function within a script:

``` bash
#!/usr/bin/env bash
source "${PATH_TO_REPO}/lib/getopts_long.bash"

while getopts_long ':af: all file:' OPTKEY; do
    case ${OPTKEY} in
        'a'|'all')
            echo 'all triggered'
            ;;
        'f'|'file')
            echo "file supplied -- ${OPTARG}"
            ;;
        '?')
            echo "INVALID OPTION -- ${OPTARG}" >&2
            exit 1
            ;;
        ':')
            echo "MISSING ARGUMENT for option -- ${OPTARG}" >&2
            exit 1
            ;;
        *)
            echo "UNIMPLEMENTED OPTION -- ${OPTKEY}" >&2
            exit 1
            ;;
    esac
done

shift $(( OPTIND - 1 ))
[[ "${1}" == "--" ]] && shift

...
```

## How It Works

In general the use of `getopts_long` is identical to that of the built-in `getopts`. Just like the built-in function, you need to call `getopts_long` several times. Each time it will use the next positional parameter and a possible argument, if parsable, and provide it to you. The function will not change the set of positional parameters. If you want to shift them, it must be done manually:

``` bash
shift $(( OPTIND - 1 ))
# now do something with $@
```

Just like `getopts`, `getopts_long` sets an exit status to FALSE when there's nothing left to parse. Thus, it's easy to use in a while-loop:

``` bash
while getopts ...; do
  ...
done
```

Identical to `getopts`, `getopts_long` will parse options and their possible arguments. It will stop parsing on the first non-option argument (a string that doesn't begin with a hyphen (`-`) that isn't an argument for any option in front of it). It will also stop parsing when it sees the `--` (double-hyphen), which means end of options.

### Internal variables

Like the original `getopts`, `getopts_long` sets the following variables:

| Variable | Description |
| -------- | ----------- |
| OPTIND   | Holds the index to the next argument to be processed. This is how the function "remembers" its own status between invocations. OPTIND is initially set to 1, and **needs to be re-set to 1 if you want to parse anything again with getopts**. |
| OPTARG   | This variable is set to any argument for an option found by `getopts_long`. It also contains the option flag of an unknown option. |
| OPTERR   | (Values 0 or 1) Indicates if Bash should display error messages generated by `getopts_long`. The value is initialised to 1 on every shell startup - so be sure to always set it to 0 if you don't want to see annoying messages! <br><br> OPTERR is not specified by POSIX for the getopts built-in utility — only for the C getopt() function in unistd.h (opterr). OPTERR is bash-specific and not supported by shells such as ksh93, mksh, zsh, or dash. |

### Error reporting

Regarding error-reporting, there are two modes `getopts_long` can run in:

  - verbose mode
  - silent mode

In production scripts I recommend using the silent mode, because it allows you to handle errors yourself without being distracted by default error messages. It's also easier to handle, since the failure cases are indicated by assigning distinct characters to `VARNAME`.

#### Verbose mode

| Error type                  | What happens |
| --------------------------- | ------------ |
| invalid option              | `VARNAME` is set to `?` (question-mark) and `OPTARG` is unset. |
| required argument not found | `VARNAME` is set to `?` (question-mark), `OPTARG` is unset and an _error message is printed_. |

#### Silent mode

| Error type                  | What happens |
| --------------------------- | ------------ |
| invalid option              | `VARNAME` is set to `?` (question-mark) and `OPTARG` is set to the (invalid) option character. |
| required argument not found | `VARNAME` is set to `:` (colon) and `OPTARG` contains the option in question. |
