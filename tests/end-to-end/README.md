# Instructions

The end to end tests require that two users be created. Because we cannot automate the authentication steps we will create entries in the database for two users to be test users, the passwords for these test users should only exist in the env.

The python API will be exclusively used to run the end to end tests, in this folder

To use the python API you will need to build it

```bash
cmake -S. -B build -DBUILD_PYTHON_CLIENT=ON
cmake --build build --target pydatafed
```
