import CommandLib

def main():
    returned = CommandLib.exec('data create "Testing the Object Return" -a testobj -d "This is to test the object return of the exec function"')
    print(returned)

if __name__ == "__main__":
    main()