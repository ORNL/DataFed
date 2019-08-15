import datafed
import datafed.CommandLib
import datafed.Config

def main():
    config = datafed.Config.API() #generate default configs
    datafed.CommandLib.init() #Config module will try to find things and send to MessageLib init
    for i in range(10):
        returned = datafed.CommandLib.command('data get y4 -fp ../../../URL_gets')
        #returned1 = datafed.CommandLib.command('more 2')
        print(returned)
        #print(returned1)

if __name__ == "__main__":
    main()