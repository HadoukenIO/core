# runtime-core

#### Requirements
_The following setup is known to be working well. You can try other versions at your 
own risk of losing a lot of time_
* [Visual Studio 2013](https://www.microsoft.com/en-us/download/details.aspx?id=44914)
* Node 6.9.0
* Grunt (grunt-cli 1.2.0)
* node-inspector 0.12.3 _(problems with 0.12.4 - 0.12.8)_
* Python 2.7.12



### Building the project
To ensure that Visual Studio 2013 is used add the "-msvs_version=2013" flag to `npm install/update`
```bash
npm update -msvs_version=2013
grunt build-dev
```



### Testing

**Initial setup**
* Launch an OpenFin app and target a v6 version (i.e.: "6.49.12.68") so that RVM can install 
that runtime version on your machine
* Close the app

**Continuous**
* Keep `node-inspector` running. Use it to debug browser process in Chrome
* Deploy runtime-core locally using grunt task. Example:
    
```bash
    grunt deploy --target=C:\Users\username\AppData\Local\OpenFin\runtime\6.49.12.68\OpenFin\resources
```
* Launch the app
* Set breakpoints and debug using Chrome (check node-inspector's documentation on how do it)



### File Structure Notes
The contents of `/src/renderer/extended` folder is referenced by the `openfin.asar` (not contained in this project)


### Building for Non Commercial license distribution

In order to build the project for distribution without a commercial OpenFin license you will need to completely remove any file with the commercial license header, please review the LICENSE file.
