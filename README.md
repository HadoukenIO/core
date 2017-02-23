# OpenFin Core

#### Requirements
_The following setup is known to be working well. You can try other versions at your 
own risk of losing a lot of time._
* [Visual Studio 2013](https://www.microsoft.com/en-us/download/details.aspx?id=44914) *
* Node 6.9.0
* Grunt (grunt-cli 1.2.0)
* node-inspector 0.12.3 _(problems with 0.12.4 - 0.12.8)_
* Python 2.7.12 

\_______________

\* Only needed on Windows

### Building the project

#### Mac/Linux
```bash
npm install
```

#### Windows
You need to ensure that Visual Studio 2013 is used to build the project.
```bash
npm update -msvs_version=2013
npm install
```

### Testing

* Install the OpenFin cli tool
```bash
npm install -g openfin-cli
```

* Create a manifest file [Manifest file docs](http://docsgohere), targeting a valid version [Runtime versions](https://developer.openfin.co/versions/?product=Runtime&version=stabe)

app.json
```javascript
{
    "startup_app": {
        "name": "OpenfinPOC",
        "description": "OpenFin POC",
        "url": "http://www.openfin.co",
        "uuid": "OpenfinPOC-hla8ix6e0y2iwwjlxkojkbj4i",
        "autoShow": true
    },
    "runtime": {
        "arguments": "",
        "version": "[replace this with a version]"
    }
}
```

* Launch OpenFin once
```bash
openfin --config app.json --launch 
```

* Replace the OpenFin core with a built core
```bash
grunt deploy --target=C:\Users\[username]\AppData\Local\OpenFin\runtime\[replace this with a version]\OpenFin\resources
```

* Now you can re-launch the OpenFin app with the modified OpenFin core.
```bash
openfin --config app.json --launch 
```

### Using node-inspector


* Set breakpoints and debug using Chrome (check node-inspector's documentation on how do it)



### File Structure Notes
The contents of `/src/renderer/extended` folder is referenced by the `openfin.asar` (not contained in this project)


### Building for Non Commercial license distribution

In order to build the project for distribution without a commercial OpenFin license you will need to completely remove any file with the commercial license header, please review the LICENSE file.
