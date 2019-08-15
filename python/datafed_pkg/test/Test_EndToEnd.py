# TODO: Turn global methods into separate test func library -- for use by other tests
# TODO: Change all commands to fit new CLI




"""*** SUMMARY
This script is used to test basic functionality of DataFed.
*** EXTENDED SUMMARY
DataFed is the Scientific Data Management System (SDMS) software
developed at Oak Ridge National Laboratory's Advanced Data and Workflows
Group. The SDMS is a federated data management tool designed to meet the
data storage, processing, and disseminating needs of the scientific
research community.

This script is intended to be run upon initial deployment of the SDMS
server, and periodically for the primary purpose of regression testing,
so as to ensure sustained basic functionality and sound status of the
SDMS database. It uses Python's built-in unittest package to test
DataFed functions through its Command-Line Interface (CLI). Before
running this script, a test allocation must manually set up on the
DataFed repository in question. After running this script, it is
recommended that a manual check and delete of the allocation (and
thereby all testing side effect objects) are done.

This script uses the following modules included in The Python 3
Standard Library:
    * os
    * subprocess
    * unittest
    * random
    * string
    * warnings
    * json

*** ROUTINE LISTINGS
String operations
*** SEE ALSO


*** NOTES


*** REFERENCES


*** EXAMPLES



Creating data record objects, with the following attributes:
    data_id: str; unique; format d/99999999; eight digits;
    Alias: str; unique; max 60 characters; must be alphanumeric or _ - .
        and will be shifted to lowercase
    Title: str; full-text; required; max 80 characters
    Description: str; full-text; max 500 characters
    Keywords: str; max 200 characters; deliminators can be any
        punctuation; shifted to lowercase; quotation \
            marks optional
    Owner: str; format u/[GlobusID]
    Locked: str; Yes or No;
    Size: numeric, given in units of ??
    Repo: CURRENTLY BUGGY and SHOULD be str; format repo/NAME
    Uploaded: CURRENTLY BUGGY, returns numeric ID??
    Created: ''
    Updated: ''

    def view(self, form = 'as_json'):
        if form == 'as_str':
            return 'dv \"%s\" -T' % (self.alias)

        elif form == 'as_csv':
            return "dv \"%s\" -C" % (self.alias)

        else:
            return "dv \"%s\" -J" % (self.alias)

"""
import os
import unittest
import random as r
import string
import json
import warnings
import datafed
import datafed.CommandLib as cmd
import datafed.Config

warnings.simplefilter("always") #warnings will be raised every time a
# non-compliant data record detail is generated


def escape(string):
    """Escapes a string so that it is suitable for BASH input.

    Args:
        string (str): The string to be escaped.

    Returns:
        str: The input string with all special characters -- backslashes,
        backticks, double- and single-quotes, dollar signs, and
        exclamations points -- preceded by two backslashes, such that it
        will print as being one backslash, as needed by the shell syntax.

    """
    escaped_string = string.replace("\\", '\\\\').replace('"', '\\"').replace(
        '`', '\\`').replace('$', '\\$').replace("'", "\\'").replace("!", "\\!")
    return str(escaped_string)


def unescape_for_JSON(string):
    """Ensures that string characters of JSON outputs (from SDMS/Shell)
    are unescaped such that they equal the python objects used as inputs.

     Args:
        string (str): The string of SDMS JSON-format output to be un-escaped.

    Returns:
        str: The input string with necessary special characters --
        single-quotes and exclamation points -- no longer preceded by
        backslashes.

    """
    unescaped_string = string.replace("\\'", "'") .replace('\\!', '!')
    return str(unescaped_string)


def string_generator(min_char=1, max_char=501, special_characters=True, \
        shift_to_lowercase=True, making_topic=False):
    """Creates a random string of random length (from within a specified
    range) out of random characters (from a specified selection).

    Args:
        min_char (int): The minimum possible length of the generated string.
            (default is 1)
        max_char (int): The maximum possible length of the generated string.
            (default is 501)
        special_characters (bool): A flag used to restrict characters to
            those permitted by DataFed for some metadata details.
            (default is True)
        shift_to_lowercase (bool): A flag used to shift all characters in
            generated string to lowercase, as the DataFed database does.
            (default is True)
        making_topic (bool): A flag used to omit periods (".") from the
            selection of possible characters.
            (default is False)

    Returns:
        A string of random characters for to be used in making details
        for input into the SDMS database.

    """
    all_char = string.ascii_letters + string.digits + string.punctuation
    all_char = all_char.replace('"', "")
    #For full text details -- title and desc
    spec_char = string.ascii_letters + string.digits + "_" + "-" + "."
    #Restricted selection matching SDMS requirements for alias and keywords
    topic_char = string.ascii_letters + string.digits + "_" + "-"
    #Use of periods is restricted, as this is the delimitor for (sub)topics

    if special_characters:
        if making_topic:
            randostring = ''.join(r.choice(topic_char) for i in range(
                r.randint(min_char, max_char)))

        else:
            randostring = ''.join(r.choice(spec_char) for i in range(
                r.randint(min_char, max_char)))
        pass

    else:
        randostring = ''.join(r.choice(all_char) for i in range(r.randint(
            min_char, max_char)))
        pass

    if shift_to_lowercase:
        randostring = randostring.lower()
    else:
        pass

    if randostring[0] == "-":
        randostring = randostring.replace("-", "_", 1) #If detail begins
        #with a hyphen, the shell will interpret it as a switch
    else:
        pass

    return str(randostring)


def make_alias(fits_requirements = True):
    """Generates a random string for use as a record alias in the SDMS.

    SDMS requires that (optional) aliases are unique, and contain a maximum
    of 60 alphanumeric characters or "_", "-", or ".", and will be shifted
    to lowercase by the database.

    Args:
        fits_requirements (bool): A flag used to indicate whether the
            generated alias should comply by SDMS requirements, or if it
            should violate requirements by being too long or containing
            forbidden characters.

    Returns:
        Random string for use as alias.

    Raises:
        SDMSError: Alias contains too many characters.
        SDMSError: Alias contains forbidden characters.

    """
    if fits_requirements:
        alias = string_generator(3, 40, True, True)
        pass
    else:
        too_long_alias = string_generator(62, 80, True, True)
        forbidden_char = string_generator(1, 61, False, False)
        non_compliant_functions = [too_long_alias, forbidden_char]
        alias = r.choice(non_compliant_functions)
        if alias is too_long_alias:
            warnings.warn("SDMSError: Alias contains too many characters.")
        else: #forbidden_char
            warnings.warn("SDMSError: Alias contains forbidden characters.")
        pass

    return alias


def make_title(fits_requirements = True):
    """Generates a random string for use as a record title in the SDMS.

    SDMS requires that all records have a title, which may be a maximum of
    80 full-text characters.

    Args:
        fits_requirements (bool): A flag used to indicate whether the
            generated title should comply by SDMS requirements, or if it
            should violate requirements by being empty, or too long.

    Returns:
        Random string for use as alias.

    Raises:
        SDMSError: Title is empty.
        SDMSError: Title contains too many characters.

    """
    if fits_requirements:
        title = string_generator(1, 60, False, False)
        pass
    else:
        empty_title = " "
        too_long_title = string_generator(182, 200, False, False)
        non_compliant_functions = [empty_title, too_long_title]
        title = r.choice(non_compliant_functions)
        if title is empty_title:
            warnings.warn("SDMSError: Title is empty.")
        else: #too_long_title
            warnings.warn("SDMSError: Title contains too many characters.")
        pass

    return title


def make_desc(fits_requirements = True):
    """Generates a random string for use as a record description in the SDMS.

    SDMS requires that (optional) descriptions have a maximum of 500
    full-text characters.

    Args:
        fits_requirements (bool): A flag used to indicate whether the
            generated description should comply by SDMS requirements, or if it
            should violate requirements by being too long.

    Returns:
        Random string for use as description.

    Raises:
        SDMSError: Description contains too many characters.

    """
    if fits_requirements:
        desc = string_generator(0, 300, False, False)
        pass
    else:
        desc = string_generator(502, 520, False, False)
        warnings.warn("SDMSError: Description contains too many characters.")
        pass

    return desc

################################ DATA RECORDS ################################


class DataRecord(object):
    """A class used to represent a data record within the SDMS.

    Creating a Python object with the same attributes as the SDMS object
    allows for ease of comparison between the SDMS output and test details.

    """
    def __init__(self, data_id, alias, title, desc, topic, keywords, owner,
    locked, size, repo, uploaded, created, updated, meta, deps):
        """Initializing the DataRecord object.

        Args:
            data_id (str): A unique identifier generated by the SDMS in the
                form "d/12345678".
            alias (str): An optional, unique (to the user), human-friendly
                      identifier.
            title (str): The (required) title of the data record.
            desc (str): A description of the data record.
            topic (str): The topic under which the data record can be
                found. Periods (".") are used as subtopic delimitors.
            keywords (str): Pertinent keywords by which the data record
                can be found. Delimitors can be commas, periods, semi-colons,
                or colons.
            owner (str): The user_id for the owner of the data record, in
                the format "u/username".
            locked (str): "Yes" or "No" indicating whether or not the data
                record is currently locked to prevent edits/reading.
            size (int): The size of the raw data in Bytes.
            repo (str): The unique id, in the format "repo/reponame", of
                the repo in which the record is stored.
            uploaded (int): The time at which the current raw data was put
                into the record, shown in Unix timestamp/'seconds since
                epoch' format.
            created (int): The time at which the data record was created,
                shown in Unix timestamp/'seconds since epoch' format.
            updated (int): The time at which the current raw data was
                put into the record. In Unix timestamp/'seconds since
                epoch' format.
            meta (str): The user-contributed, structured, domain-specific
                metadata, in JSON-format.
            deps (list): The provenance and dependencies associated with
                the data record. Dependencies have a data_id/alias (for the
                associated data record), a type and a direction. The three
                types of dependencies are "derived from", "component of",
                and "newer version of". Direction is either 0 or 1, with
                zero indicating the owner of the dependency, or the child,
                and 1 indicating the parent. Each dependency is a dict
                of strings all stored within a list.

    """
        self.data_id = data_id
        self.alias = alias
        self.title = title
        self.desc = desc
        self.topic = topic
        self.keywords = keywords
        self.owner = owner
        self.locked = locked
        self.size = size
        self.repo = repo
        self.uploaded = uploaded
        self.created = created
        self.updated = updated
        self.meta = meta
        self.deps = deps

    # TODO: Fix all f-strings
    '''
    def __str__(self):
        return f'id: {self.data_id}, alias: {self.alias}, title: {self.title},\
            desc: {self.desc}, topic: {self.topic}, keywords: {self.keywords},\
            owner: {self.owner}, locked: {self.locked}, size: {self.size}, \
            repo: {self.repo}, created: {self.created}, uploaded: \
            {self.uploaded}, updated: {self.updated}, meta: {self.meta}, deps: {self.meta}'

    def __repr__(self):
        return (f'{self.__class__.__name__} : ('f'{self.data_id!r}, \
            {self.alias!r}, {self.title!r}, {self.desc!r}, {self.topic!r}, \
            {self.keywords!r}, {self.owner!r}, {self.locked!r}, {self.size!r},\
            {self.repo!r}, {self.uploaded!r}, {self.created!r}, \
            {self.updated!r}, {self.meta!r}, {self.deps!r})')
    '''
    @classmethod
    def make_topic(cls, fits_requirements = True, quantity = 4,):
        topic_as_list = []
        if fits_requirements:
            for x in range(r.randint(1, int(quantity))):
                topic_as_list.append(string_generator(1, 5, True, True, True))
            topic = ".".join(topic_as_list) #joins words with '.' as delimitor

        else:
            def too_long_topic(num):
                warnings.warn("SDMSError: Topic word has too many characters")
                num -= 1
                topic_as_list = []
                topic_as_list.append(string_generator(26, 30, True, True, True))
                for x in range(r.randint(1, int(num))):topic_as_list.append(
                    string_generator(4, 9, True, True, True))
                topic = ".".join(topic_as_list)
                return topic

            def forbidden_char(num):
                warnings.warn("SDMSError: Topic contains forbidden characters")
                topic_as_list = []
                num -= 1
                topic_as_list.append(string_generator(4, 9, False, True, True))
                for x in range(r.randint(1, int(num))):topic_as_list.append(
                    string_generator(4, 9, True, True, True))
                topic = ".".join(topic_as_list)
                return topic

            non_compliant_functions = [too_long_topic, forbidden_char]
            topic = (r.choice(non_compliant_functions))(quantity)

        return topic

# gotta generate the DataRecord object, and then make a method to
#  change how it is formatted.

    @classmethod
    def generate(cls, fits_requirements = True):

        if fits_requirements:
            dr = DataRecord("d/data_id", make_alias(True), make_title(True), make_desc(True), DataRecord.make_topic(True),"Keywords","u/breetju","Locked","5665","repo/test","Uploaded"                ,"Created","Updated","{\n    \"whatever\": \"x = 579975\",\n \
                \"blue\": \"is a colour\"\n}", "[]")

        else:
            dr = DataRecord("d/data_id", make_alias(True), make_title(True),
                make_desc(True), DataRecord.make_topic(True),"Keywords",
                "u/breetju","Locked","5665","repo/test","Uploaded","Created",
                "Updated","{\n    \"whatever\": \"x = 579975\",\n    \"blue\":is a colour\"\n}", "[]")
            if r.choice([0,1]) == 0:
                dr.alias = make_alias(False)
            else:
                dr.title = make_title(False)

        return dr

    def as_text_input(self):
        text = './scripts/datafed data create "{}" -a "{}" -d "{}" -kw "{}"'.format(escape(self.title), escape(self.alias), escape(self.desc), escape(self.keywords))

        return text


    def as_py_input(self):
        command = 'data create "{}" -a "{}" -d "{}" -kw "{}"'.format(self.title, self.alias, self.desc, self.keywords) # TODO: add keywords and topic
        return command

    def type_change(self, form='as_dict'):  #### fix this to use magic method __str__
        dr_as_list = []
        if form == 'as_str':
            details = [self.data_id, self.alias, self.title, self.desc, \
                self.topic, self.keywords, self.owner, self.locked, self.size,\
                self.repo, self.uploaded, self.created, self.updated, \
                self.meta, self.deps]
            for attribute in details:
                    dr_as_list.append('"' + attribute + '"')
                    dr_as_str = " ".join(dr_as_list)  #string suitable for CLI Input, Ouput is separated by commas

            return dr_as_str

        elif form == 'as_list': #list of strings
            dr_as_list = [self.data_id, self.alias, self.title, self.desc,\
                self.topic, self.keywords, self.owner, self.locked, self.size,\
                self.repo, self.uploaded, self.created, self.updated, \
                self.meta, self.deps]

            return dr_as_list

        else: #Dictionary that can be serialized into JSON to match with CLI output
            return vars(self)

################################ COLLECTIONS ################################
'''
class Collection(object):

    def __init__(self, coll_id, alias, title, desc):
        self.coll_id = coll_id
        self.alias = alias
        self.title = title
        self.desc = desc

    def __str__(self):
        return f'id: {self.coll_id}, alias: {self.alias}, \
            title: {self.title}, desc: {self.desc}'

    def __repr__(self):
        return f'{self.__class__.__name__} : ({self.coll_id}, {self.alias}, \
            {self.title}, {self.desc})'

    @classmethod
    def generate(cls, fits_requirements=True):
        if fits_requirements:
            coll = Collection("c/coll_id", make_alias(True), make_title(True),\
                make_desc(True))
            pass
        else:
            coll = Collection("c/coll_id", make_alias(True), make_title(True),\
                make_desc(True))
            random_detail = r.choice([make_alias, make_title, make_desc])
            coll.random_detail = random_detail(False)
            pass
        return coll

    def as_input_str(self):  # TODO: Update command
        string = f'sdms cc -a "{escape(self.alias)}" -t "{escape(self.title)}"\
            -d "{escape(self.desc)}"'
        return string

    def type_change(self, form='as_dict'):
        if form == "as_list":
            coll_as_list = [self.coll_id, self.alias, self.title, self.desc]
            return coll_as_list
        else:
            return vars(self)



################################ PROJECTS ################################
'''
'''
There is no current CLI functionality in terms of projects, other than
viewing, and perhaps creating records within project allocations.
this may change, or may not. Saved queries can be listed and executed.
'''
'''
class project(object):

    def __init__(self, details):


    def __str__(self):


    def __repr__(self):


    @classmethod
    def generate(cls, fits_requirements=True):


    def as_input_str(self):


    def type_change(self, form='as_dict'):



################################ QUERIES ################################

class query(object):

    def __init__(self, details):


    def __str__(self):


    def __repr__(self):


    @classmethod
    def generate(cls, fits_requirements=True):


    def as_input_str(self):


    def type_change(self, form='as_dict'):

################################ ACCESS CONTROL GROUPS #########################
'''

################################ DEPENDENCIES ? ################################


import unittest as ut
import subprocess
import os
import json


testdata = '/data/unittesting/testfiles/SampleData.txt'

# TODO: Test the create and delete functions before continuing with testing any other functionality
##Creating a text file of input strings, each on a new line
##LATER  Need something recursive? -- that uses the lines of generated by bugaboo
#each action is a unit test -- generate record object, append dc command to list (necessary?),
#       send command to shell, (update by putting in data? save timestamp?) dv in json, compare with dr dict object,
#       then delete record.

#Setting up a class for testing Data Records

test_commands = {
    'text_create' : './scripts/datafed data create "{}" -a "{}" -d "{}" -kw "{}"'
}

def delete_testing_files():
    os.remove("~/jbreet/DataFed/python/datafed_pkg/test/datarecordsinput.txt")
    os.remove("~/jbreet/DataFed/python/datafed_pkg/test/outputfile.txt")
'''


class TestDataBasicReturn(ut.TestCase):

    # TODO: using object return, generate, check, then delete data record
    def test_dr_create_and_delete(self):
        config = datafed.Config.API()
        datafed.CommandLib.init()
        self.dr = DataRecord.generate(True)
        create_reply = cmd.command(self.dr.as_py_input()) #Returns tuple object (protobuf msg, msg type)
        self.assertEqual(self.dr.alias, create_reply[0].data[0].alias, msg = "Alias of intial data record create does not match.")
        try:
            del_reply = cmd.command('data delete {}'.format(create_reply[0].data[0].id))
            self.assertEqual(del_reply[1], 'AckReply', msg = "Delete of initial data record failed.")
        except AssertionError:
            print("Manual delete required")

    # TODO: same with collection

    #if this fails, do not continue
class TestDataBasicText(ut.TestCase):

    # TODO: using object return, generate, check, then delete data record
    def test_dr_create_and_delete(self):
        config = datafed.Config.API()
        #datafed.CommandLib.init()
        self.dr = DataRecord.generate(True)
        details = [str(self.dr.alias), str(self.dr.title),
                   str(self.dr.desc)]
        print(details)
        with open('datarecordsinput.txt', 'a+') as ipfile:
            ipfile.write(self.dr.as_text_input())
            print(ipfile.read())
        with open("outputfile.txt", 'a+') as opfile:
            subprocess.run(self.dr.as_text_input(), stdout=opfile, \
                               stderr=subprocess.STDOUT, shell=True)
        with open("outputfile.txt", 'r') as opfile:
            outs = opfile.read().split("\n")
            print(outs)
            words = [i.split("              ") for i in outs]
            flat_list = []
            for sublist in words:
                for item in sublist:
                    flat_list.append(unescape_for_JSON(item.strip()))
            print(flat_list)
        with self.subTest("Create"):
            self.assertIs(all(elem in flat_list for elem in details), True, \
                              msg="Data-create command unexpected failure")
        with self.subTest("Delete"):
            try:
                with open("outputfile.txt", "w+") as opfile:
                    subprocess.run('./scripts/datafed data delete {}'.format(self.dr.alias),
                                   stdout=opfile, stderr=subprocess.STDOUT, shell=True)
                with open('outputfile.txt', 'r') as opfile:
                    outs = opfile.read()
                self.assertIs("OK" in outs, True, msg="Data-delete of single \
                    record failed")
            except AssertionError:
                print("Manual delete required")
'''

class TestDataRecords_Text(ut.TestCase):
    '''
    def setUp(self): #happens before EVERY method in testcase
        self.drcorr0 = DataRecord.generate(True)
        self.drcorr1 = DataRecord.generate(True)
        subprocess.run(self.drcorr1.as_text_input(), shell=True)
    # MAKE THESE DR AS PART OF SETUP, NOT TEST??? NO WAY TO GURANTEE DR-CREATE TEST WILL PASS? BUT NOT PASSING IS FINE EITHER WAY BECAUSE NOTHIN TO DELETE I GUESS
         #Needs to be generated in setUp



    def tearDown(self): #Happens after EVERY method in test method
        subprocess.run('./scripts/datafed data delete {}'.format(self.drcorr1.alias), shell=True)
        files = ["jsonoutput.json", "drinput.txt", "outputfile.txt"]
        for item in files:
            if os.path.exists(item):
                os.remove(item)
            else:
                pass
    '''


    ############################# NEED SETUP
    '''
    def test_dr_create_JSON(self): #Take randostring, put into commands, pass to sdms, and write output to file
        with open('drinput.txt', 'a+') as ipfile:
            ipfile.write(self.drcorr0.as_input_str()) #writes a stringified copy of the DataRecord object as dictionary
        with open("jsonoutput.json", 'w+') as jsonopfile:
            subprocess.run(f'{self.drcorr0.as_input_str()} -J',\
                stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("jsonoutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        with self.subTest("Confirming alias"):
            self.assertEqual(unescape_for_JSON(str(op["data"][0]["alias"])),
                self.drcorr0.alias, msg="Returned alias does not match")
        with self.subTest("Confirming title"):
            self.assertEqual(unescape_for_JSON(str(op["data"][0]["title"])),
                self.drcorr0.title, msg="Returned title does not match")
        with self.subTest("Confirming desc"):
            self.assertEqual(unescape_for_JSON(op["data"][0]["desc"])),
                self.drcorr0.desc, msg="Returned desc does not match")
    '''
    def test_dr_create_incorrect(self):
        drerr = DataRecord.generate(fits_requirements=False)
        drerrinput = drerr.as_text_input()
        with open('datarecordsinput.txt', 'w+') as ipfile:
            ipfile.write(drerrinput)
        with open("outputfile.txt", 'w+') as opfile:
            subprocess.run(drerrinput,stdout=opfile,stderr=subprocess.STDOUT,shell=True)
        with open('outputfile.txt', 'r') as opfile:
            outs = opfile.read()
            print(outs)
        self.assertIs("ID:" not in outs, True, msg="Data-create of \
            incorrect data record unexpected pass. Manual delete required")

    '''
    def test_dr_create_incorrect_json(self):
        drerr = DataRecord.generate(False)
        drerrinput = drerr.as_input_str()
        with open('drinput.txt', 'a+') as ipfile:
            ipfile.write(drerr.as_input_str()) #writes a stringified copy of the DataRecord object as dictionary
        with open("jsonoutput.json", 'w+') as jsonopfile:
            subprocess.run(f'{drerrinput} -J', stdout=jsonopfile,
                stderr=subprocess.STDOUT, shell=True)
        with open("jsonoutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        self.assertEqual(op["status"], "ERROR", msg="Data-create of \
            incorrect data record unexpected pass")
    '''
'''
    def test_dr_update(self):
        new_title = "New Title"
        with open("jsonoutput.json", 'w+') as jsonopfile:
            subprocess.run(f'./scripts/datafed du {self.drcorr1.alias} -t "{new_title}" -J', stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("jsonoutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        self.assertEqual(op["data"][0]["title"], new_title, msg="Update of Data Record title unsuccessful")
'''
'''
    def test_dr_put(self):
        with open("jsonoutput.json", 'w+') as jsonopfile:
            subprocess.run(f'./scripts/datafed put "{self.drcorr1.alias}" "{testdata}"\
                --wait -J', stdout=jsonopfile, stderr=subprocess.STDOUT,
                shell=True)
        with open("jsonoutput.json", 'r') as jsonopfile:
            putop = json.load(jsonopfile)
        self.assertEqual(putop["status"], "SUCCEEDED",
            msg="Data-put transfer failed") #NB: Xfr will FAIL if Globus Connect is not running -- going to have to find a way to make this work????

    def test_dr_view(self):
        with open("jsonoutput.json", 'w+') as jsonopfile:
            subprocess.run(f'./scripts/datafed dv "{self.drcorr1.alias}" -D -J',
                stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("jsonoutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        with self.subTest("Confirming desc"):
            self.assertEqual(unescape_for_JSON(str(op["data"][0]["desc"]),
                self.drcorr1.desc, msg="Returned desc does not match")

################################ NOT making dependencies tests their own sub/class because the setup should be the same.
#                               Integrative may be better because if general DR unit tests fail, it won't be worth running the dependencies tests anyway.

    def test_deps_add_0(self):
        drcorr2 = DataRecord.generate(True)
        subprocess.run(f'{drcorr2.as_input_str()}', shell=True)
        with open("jsonoutput.json", "w+") as jsonopfile:
            subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -A \
                "{drcorr2.alias},0" -J', stdout=jsonopfile,
                stderr=subprocess.STDOUT, shell=True)
        with self.subTest("Confirming dependency created from owner \
                perspective"):
            with open("jsonoutput.json", "r") as jsonopfile:
                deps = json.load(jsonopfile)
            with self.subTest("Confirming alias"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["alias"])), drcorr2.alias, msg="Add dependency type 0 \
                    ERROR: relative's alias according to owner does not match")
            with self.subTest("Confirming type"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["type"])), 0, msg="Add dependency type 0 ERROR: \
                    type according to owner does not match")
            with self.subTest("Confirming direction"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["dir"])), 1, msg="Add dependency type 0 ERROR: dir \
                    according to owner does not match")
        with self.subTest("Confirming dependency from relative's perspective"):
            with open("jsonoutput.json", "w+") as jsonopfile:
                subprocess.run(f'./scripts/datafed dv "{drcorr2.alias}" -J',
                    stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
            with open("jsonoutput.json", "r") as jsonopfile:
                deps = json.load(jsonopfile)
            with self.subTest("Confirming alias"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["alias"])), self.drcorr1.alias, msg="Add dep type 0 \
                    ERROR: owner's alias according to relative does not match")
            with self.subTest("Confirming type"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["type"])), 0, msg="Add dependency type 0 ERROR: type \
                    according to relative does not match")
            with self.subTest("Confirming direction"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["dir"])), 0, msg="Add dependency type 0 ERROR: \
                    dir according to relative does not match")
        subprocess.run(f'./scripts/datafed data-delete {drcorr2.alias}', shell=True)

    def test_deps_add_1(self):
        drcorr2 = DataRecord.generate(True)
        subprocess.run(f'{drcorr2.as_input_str()}', shell=True)
        with open("jsonoutput.json", "w+") as jsonopfile:
            subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -A "\
                {drcorr2.alias},1" -J', stdout=jsonopfile,
                stderr=subprocess.STDOUT, shell=True)
        with self.subTest("Confirming dependency created from \
            owner perspective"):
            with open("jsonoutput.json", "r") as jsonopfile:
                deps = json.load(jsonopfile)
            with self.subTest("Confirming alias"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["alias"])), drcorr2.alias, msg="Add dependency type 1\
                    ERROR: relative's alias according to owner does not match")
            with self.subTest("Confirming type"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["type"])), 1, msg="Add dependency type 1 ERROR: type \
                    according to owner does not match")
            with self.subTest("Confirming direction"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["dir"])), 1, msg="Add dependency type 1 ERROR: dir \
                    according to owner does not match")
        with self.subTest("Confirming dependency from relative's perspective"):
            with open("jsonoutput.json", "w+") as jsonopfile:
                subprocess.run(f'./scripts/datafed dv "{drcorr2.alias}" -J',
                    stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
            with open("jsonoutput.json", "r") as jsonopfile:
                deps = json.load(jsonopfile)
            with self.subTest("Confirming alias"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["alias"])), self.drcorr1.alias, msg="Add dep type 1 \
                    ERROR: owner's alias according to relative does not match")
            with self.subTest("Confirming type"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["type"])), 1, msg="Add dep type 1 ERROR: type according \
                    to relative does not match")
            with self.subTest("Confirming direction"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["dir"])), 0, msg="Add dependency type 1 ERROR: dir \
                    according to relative does not match")
            subprocess.run(f'./scripts/datafed data-delete {drcorr2.alias}', shell=True)

    def test_deps_add_2(self):
        drcorr2 = DataRecord.generate(True)
        subprocess.run(f'{drcorr2.as_input_str()}', shell=True)
        with open("jsonoutput.json", "w+") as jsonopfile:
            subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -A \
                "{self.drcorr1.alias},2" -J', stdout=jsonopfile,
                stderr=subprocess.STDOUT, shell=True)
        with self.subTest("Confirming dependency created from owner\
            perspective"):
            with open("jsonoutput.json", "r") as jsonopfile:
                deps = json.load(jsonopfile)
            with self.subTest("Confirming alias"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["alias"])), drcorr2.alias, msg="Add dependency type 2 \
                    ERROR: relative's alias according to owner does not match")
            with self.subTest("Confirming type"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["type"])), 2, msg="Add dependency type 2 ERROR: type \
                    according to owner does not match")
            with self.subTest("Confirming direction"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["dir"])), 1, msg="Add dependency type 2 ERROR: dir \
                    according to owner does not match")
        with self.subTest("Confirming dependency from relative's perspective"):
            with open("jsonoutput.json", "w+") as jsonopfile:
                subprocess.run(f'./scripts/datafed dv "{drcorr2.alias}" -J',
                    stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
            with open("jsonoutput.json", "r") as jsonopfile:
                deps = json.load(jsonopfile)
            with self.subTest("Confirming alias"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["alias"])), self.drcorr1.alias, msg="Add dep type 2 \
                    ERROR: owner's alias according to relative does not match")
            with self.subTest("Confirming type"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["type"])), 2, msg="Add deptype 2 ERROR: type according \
                    to relative does not match")
            with self.subTest("Confirming direction"):
                self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                    0]["dir"])), 0, msg="Add dep type 2 ERROR: dir according \
                    to relative does not match")
        subprocess.run(f'./scripts/datafed data-delete {drcorr2.alias}', shell=True)

    def test_deps_remove(self):
        drcorr2 = DataRecord.generate(True)
        subprocess.run(f'{drcorr2.as_input_str()}', shell=True)
        subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -A "{drcorr2.alias},0"\
            -J', shell=True)#1
        with open("jsonoutput.json", "w+") as jsonopfile:
            subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -R \
                "{drcorr2.alias}" -J', stdout=jsonopfile,
                stderr=subprocess.STDOUT, shell=True)
        with open("jsonoutput.json", "r") as jsonopfile:
            deps = json.load(jsonopfile)
        self.assertEqual(deps["data"][0]["deps"][0], '[]',
            msg="Remove dependency type 0 failed")
        subprocess.run(f'./scripts/datafed data-delete {drcorr2.alias}', shell=True)

    def test_deps_replace_single(self):
        drcorr2 = DataRecord.generate(True)
        subprocess.run(f'{drcorr2.as_input_str()}', shell=True)
        drcorr3 = DataRecord.generate(True)
        subprocess.run(f'{drcorr3.as_input_str()}', shell=True)
        subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -A "{drcorr2.alias},0"\
            -J', shell=True)  #remove and add simultaneously #2
        with open("jsonoutput.json", "w+") as jsonopfile:
            subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -R \
                "{drcorr2.alias}" -A "{drcorr3.alias},2" -J', stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("jsonoutput.json", "r") as jsonopfile:
            deps = json.load(jsonopfile)
        with self.subTest("Confirming alias"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                0]["alias"])), drcorr3.alias, msg="Replace dep ERROR: relative's\
                alias according to owner does not match")
        with self.subTest("Confirming type"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                0]["type"])), 2, msg="Replace dep ERROR: type according to \
                owner does not match")
        with self.subTest("Confirming direction"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                0]["dir"])), 1, msg="Replace depERROR: dir according to \
                owner does not match")
        subprocess.run(f'./scripts/datafed data-delete {drcorr2.alias}', shell=True)
        subprocess.run(f'./scripts/datafed data-delete {drcorr3.alias}', shell=True)

    def test_deps_replace_multi(self):
        drcorr2 = DataRecord.generate(True)
        subprocess.run(f'{drcorr2.as_input_str()}', shell=True)
        drcorr3 = DataRecord.generate(True)
        subprocess.run(f'{drcorr3.as_input_str()}', shell=True)
        drcorr4 = DataRecord.generate(True)
        subprocess.run(f'{drcorr4.as_input_str()}', shell=True)
        drcorr5 = DataRecord.generate(True)
        subprocess.run(f'{drcorr5.as_input_str()}', shell=True)
        drcorr6 = DataRecord.generate(True)
        subprocess.run(f'{drcorr6.as_input_str()}', shell=True)
        subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -A "{drcorr2.alias},0" \
            -A "{drcorr3.alias},1" -J', shell=True)#3
        with open("jsonoutput.json", "w+") as jsonopfile:
            subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -C -A \
                "{drcorr4.alias},0" -A "{drcorr5.alias},1" -A \
                "{drcorr6.alias},2" -J', stdout=jsonopfile,
                stderr=subprocess.STDOUT, shell=True)
        with open("jsonoutput.json", "r") as jsonopfile:
            deps = json.load(jsonopfile)
        with self.subTest("Confirming alias"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                0]["alias"])), drcorr4.alias, msg="Replace dep add type 0 \
                ERROR: relative's alias according to owner does not match")
        with self.subTest("Confirming type"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                0]["type"])), 0, msg="Replace dependency add type 0 \
                ERROR: type according to owner does not match")
        with self.subTest("Confirming direction"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                0]["dir"])), 1, msg="Replace dependency add type 0 \
                ERROR: dir according to owner does not match")
        with self.subTest("Confirming alias"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                1]["alias"])), drcorr5.alias, msg="Replace dependency add type 1\
                ERROR: relative's alias according to owner does not match")
        with self.subTest("Confirming type"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                1]["type"])), 1, msg="Replace dependency add type 1 \
                ERROR: type according to owner does not match")
        with self.subTest("Confirming direction"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                1]["dir"])), 1, msg="Replace dependency add type 1 \
                ERROR: dir according to owner does not match")
        with self.subTest("Confirming alias"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                2]["alias"])), drcorr6.alias, msg="Replace dependency add type 2\
                ERROR: relative's alias according to owner does not match")
        with self.subTest("Confirming type"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                2]["type"])), 2, msg="Replace dependency add type 2 \
                ERROR: type according to owner does not match")
        with self.subTest("Confirming direction"):
            self.assertEqual(unescape_for_JSON(str(deps["data"][0]["deps"][
                2]["dir"])), 1, msg="Replace dependency add type 2 \
                ERROR: dir according to owner does not match")
        subprocess.run(f'./scripts/datafed data-delete {drcorr2.alias}', shell=True)
        subprocess.run(f'./scripts/datafed data-delete {drcorr3.alias}', shell=True)
        subprocess.run(f'./scripts/datafed data-delete {drcorr4.alias}', shell=True)
        subprocess.run(f'./scripts/datafed data-delete {drcorr5.alias}', shell=True)
        subprocess.run(f'./scripts/datafed data-delete {drcorr6.alias}', shell=True)

    def test_deps_clear(self): #multiple delete
        drcorr2 = DataRecord.generate(True)
        subprocess.run(f'{drcorr2.as_input_str()}', shell=True)
        drcorr3 = DataRecord.generate(True)
        subprocess.run(f'{drcorr3.as_input_str()}', shell=True)
        subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -A "{drcorr2.alias},0"\
            -A "{drcorr3.alias},1" -J', shell=True)
        with open("jsonoutput.json", "w+") as jsonopfile:
            subprocess.run(f'./scripts/datafed du "{self.drcorr1.alias}" -C -J',
                stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("jsonoutput.json", "r") as jsonopfile:
            deps = json.load(jsonopfile)
        self.assertEqual(deps["data"][0]["deps"][0], '[]',
            msg="Clear dependencies failed")
        subprocess.run(f'./scripts/datafed data-delete {drcorr2.alias}', shell=True)
        subprocess.run(f'./scripts/datafed data-delete {drcorr3.alias}', shell=True)
'''

'''
class TestCollections(ut.TestCase):

    def setUp(self):
        self.collcorr0 = Collection.generate(True)
        self.collcorr1 = Collection.generate(True)
        subprocess.run(f'{self.collcorr1.as_input_str()}', shell=True)

    def tearDown(self):
        subprocess.run(f'./scripts/datafed coll-delete {self.collcorr1.alias}', shell=True)
        files = ["colloutput.json", "collinput.txt", "outputfile.txt"]
        for item in files:
            if os.path.exists(item):
                os.remove(item)
            else:
                pass

    def test_coll_delete(self):
        with open("outputfile.txt", "w+") as opfile:
            subprocess.run(f'./scripts/datafed coll-delete {self.collcorr1.alias}',
                stdout=opfile, stderr=subprocess.STDOUT, shell=True)
        with open('outputfile.txt', 'r') as opfile:
            outs = opfile.read()
        self.assertEqual("SUCCESS" in outs, True, msg="Collection-delete \
            of single record failed")

    def test_coll_create(self):
        with open("collinput.txt", "w+") as ipfile:
            ipfile.write(self.collcorr0.as_input_str()) #writes a stringified copy of the Collection object as dictionary
        with open("colloutput.json", 'w+') as jsonopfile:
            subprocess.run(f'{self.collcorr0.as_input_str()} -J',
                stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("colloutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        with self.subTest("Confirming alias"):
            self.assertEqual(unescape_for_JSON(str(op["coll"][0]["alias"])),
                self.collcorr0.alias, msg="Returned alias does not match")
        with self.subTest("Confirming title"):
            self.assertEqual(unescape_for_JSON(str(op["coll"][0]["title"])),
                self.collcorr0.title, msg="Returned title does not match")
        with self.subTest("Confirming desc"):
            self.assertEqual(unescape_for_JSON(str(op["coll"][0]["desc"])),
                self.collcorr0.desc, msg="Returned desc does not match")
        coll_id = op["coll"][0]["id"]
        return coll_id

    def test_coll_create_incorrect(self):
        collerr = Collection.generate(False)
        with open("collinput.txt", "a+") as ipfile:
            ipfile.write(collerr.as_input_str()) #writes a stringified copy of the Collection object as dictionary
        with open("colloutput.json", 'w+') as jsonopfile:
            subprocess.run(f'{collerr.as_input_str()} -J', stdout=jsonopfile,
                stderr=subprocess.STDOUT, shell=True)
        with open("colloutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        self.assertEqual(op["status"], "ERROR", msg="Collection-create of \
            incorrect Collection unexpected pass")

    def test_coll_update(self):
        with open("colloutput.json", 'w+') as jsonopfile:
            subprocess.run(f'./scripts/datafed cu "{self.collcorr1.alias}" -t "New Title" \
                -J', stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("colloutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        self.assertEqual(unescape_for_JSON(str(op["coll"][0]["title"])),
            "New Title", msg="Returned title does not match")

    def test_coll_view(self):
        with open("colloutput.json", 'w+') as jsonopfile:
            subprocess.run(f'./scripts/datafed cv {self.collcorr1.alias} -J',
                stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("colloutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        with self.subTest("Confirming title"):
            self.assertEqual(unescape_for_JSON(str(op["coll"][0]["title"])),
                self.collcorr1.alias, msg="Returned alias does not match")
        with self.subTest("Confirming desc"):
            self.assertEqual(unescape_for_JSON(str(op["coll"][0]["desc"])),
                self.collcorr1.desc, msg="Returned desc does not match")

    def test_coll_link(self):
        collcorr2 = Collection.generate(True)
        subprocess.run(f'{collcorr2.as_input_str()}', shell=True)
        with open("colloutput.json", 'w+') as jsonopfile:
            subprocess.run(f'./scripts/datafed link "{collcorr2.alias}" \
                "{self.collcorr1.alias}" -J', shell=True)
            subprocess.run(f'./scripts/datafed ls "{self.collcorr1.alias}" -J',
                stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("colloutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        self.assertEqual(unescape_for_JSON(str(op["item"][0]["alias"])),
            collcorr2.alias, msg="Returned alias of child \
            Collection does not match")

    def test_coll_move(self):
        collcorr2 = Collection.generate(True)
        subprocess.run(f'{collcorr2.as_input_str()}', shell=True)
        collcorr3 = Collection.generate(True)
        subprocess.run(f'{collcorr3.as_input_str()}', shell=True)
        subprocess.run(f'./scripts/datafed link "{collcorr2.alias}" "{self.collcorr1.alias}"\
            -J', shell=True)
        subprocess.run(f'./scripts/datafed move "{collcorr2.alias}" "{collcorr3.alias}" -J',\
            shell=True)
        with self.subTest("Confirming unlink from previous parent"):
            with open("colloutput.json", 'w+') as jsonopfile:
                subprocess.run(f'./scripts/datafed ls "{self.collcorr1.alias}" -J',
                    stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
            with open("colloutput.json", 'r') as jsonopfile:
                op = json.load(jsonopfile)
            self.assertEqual(unescape_for_JSON(str(op["item"][0])), '[]',
                msg="Unlink of child from parent Collection during \
                move command failed")
        with self.subTest("Confirming link to new parent"):
            with open("colloutput.json", 'w+') as jsonopfile:
                subprocess.run(f'./scripts/datafed ls "{collcorr3.alias}" -J',
                    stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
            with open("colloutput.json", 'r') as jsonopfile:
                op = json.load(jsonopfile)
            self.assertEqual(unescape_for_JSON(str(op["item"][0]["alias"])),
                collcorr2.alias, msg="Returned alias of child Collection \
                in new parent during move command does not match")

    def test_coll_unlink(self):
        collcorr2 = Collection.generate(True)
        subprocess.run(f'{collcorr2.as_input_str()}', shell=True)
        subprocess.run(f'./scripts/datafed link "{collcorr2.alias}" "{self.collcorr1.alias}"\
            -J', shell=True)
        with open("colloutput.json", 'w+') as jsonopfile:
            subprocess.run(f'./scripts/datafed unlink "{collcorr2.alias}" \
                "{self.collcorr1.alias}" -J', shell=True)
            subprocess.run(f'./scripts/datafed ls "{self.collcorr1.alias}" -J',
                stdout=jsonopfile, stderr=subprocess.STDOUT, shell=True)
        with open("colloutput.json", 'r') as jsonopfile:
            op = json.load(jsonopfile)
        self.assertEqual(unescape_for_JSON(str(op["item"][0])), '[]',
            msg="Unlink of child from parent Collection failed")
            
            
            
            
'''

##########################
if __name__ == '__main__':
    ut.main()
    delete_testing_files()
