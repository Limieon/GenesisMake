# GenesisMake
## About
GenesisMake is not an entire build system! It is only a script written in lua to read module data in the form of a json file and then create premake projects out of it!

This only works using [Premake](https://github.com/premake/premake-core/)!

## How to Use
To use this script, you have to include it into an existing premake script:
```Lua
include "genesis.lua"
```
It should be included after the workspace definition.

## JSON File Structure
The json file has to be named `genesis.json`.
It consists (at the time of writing) of 2 main properties:
* projects
* modules

**Projects** are your local projects that are composed together, **Modules** are 3rd-Party projects that are required by your local projets.

Raw genesis file:
```JSON
{
	"projects": {},
	"modules": {}
}
```

### Define a project
Here is an example of 2 projects getting defined, both in the `Test` group:

```JSON
{
	"projects": {
		"Test": {
			"Client": {
				"type": "ConsoleApp",
				"alias": "Start",
				"includeDirs": [
					"%{wks.location}/Test/src/Client/"
				],
				"dependencies": [
					"Test-Utils"
				]
			},
			"Utils": {
				"type": "StaticLib",
				"includeDirs": [
					"%{wks.location}/Test/src/Utils/"
				]
			}
		}
	}
}
```
**IMPORTANT:** The location of the project is always: `WORKSPACE_ROOT/GROUP/src/NAME`

The `Client` Project is of type `ConsoleApp`. Currently supported types are `StaticLib` and `ConsoleApp`. To find more about those types (or `kind` called in premake), check the wiki entry: [Kinds](https://premake.github.io/docs/kind/).

The Client project also gets set an alias (which is currently unsued but will be later used for VSCode Tasks and Launchs).

Include dirs should be self explanatory. But in this case we only add the includes of the current project. This can also redirect to a global `include/` directory, but it is recommended to define a module for your 3rd-Party includes.

Dependencies are used to tell premake what projects need to be compiled first and what is needed to be linked. Include dirs from dependencies will automatically be added to the current project and do not need to be specified in the `includeDirs` property.

The `Utils` project hasl like the same properties, but the type is `StaticLib` instead of `ConsoleApp` in this case.

### Define a module
This is an example for creating 2 modules, `spdlog` and `fmt`. Spdlog is dependent on fmt and both modules are compiled lika a default premake project.
```JSON
{
	"modules": {
		"fmt": {
			"type": "premake",
			"includeDirs": [
				"include/"
			]
		},
		"spdlog": {
			"type": "premake",
			"includeDirs": [
				"include/"
			],
			"dependencies": [
				"fmt"
			]
		}
	}
}
```
You can optionally specify a `script` property which renames the premake script that will be used.  
In the case of not defining it, the following will be used: `WORKSPCE_ROOT/.genesis/scripts/NAME.lua`

Also modules always have to be in the `WORKSPACE_ROOT/.genesis/modules/` directory, else they will not be found.

## Further Development
This project was made for personal use, so development will continue if I need more features. The current use of this is in my custom game engine: [Genesis Engine](https://github.com/GMasterHD/GenesisEngine).  
But here is a list of features that well be implemented as I need them in my engine:
* Header Only Libraries
* Dynamic Libraries
* Generating Scripts for basic libraries
* A CLI to more easy define projects
* VSCode Integration
* Feature to specify tests
