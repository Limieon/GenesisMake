import FS from 'fs'
import Path from 'path'

import Figlet from 'figlet'
import Chalk from 'chalk'
import { Command } from 'commander'
import Inquirer from 'inquirer'
import Gradient from 'gradient-string'
import ChildProcess from 'child_process'

type GenesisProject = {
	type: string
	includeDirs?: string[]
	dependencies?: string[]
	hide?: boolean
}

type GenesisLibrary = GenesisPremakeLibrary
type GenesisPremakeLibrary = {
	type: 'premake'
	script: string
}

type GenesisPacket = GenesisGitPacket
type GenesisGitPacket = {
	type: string
	repo: string
}

type GenesisModule = {
	type: string
	includeDirs: string[]
	dependencies?: string[]
	script?: string,
	packet?: GenesisPacket
	library?: GenesisLibrary
}
type GenesisFile = {
	name: string
	projects: { [key: string]: GenesisProject } | { [key: string]: { [key: string]: GenesisProject } }
	modules: { [key: string]: GenesisModule } | { [key: string]: { [key: string]: GenesisModule } }
}

class Genesis {
	static exists(): boolean { return FS.existsSync('./genesis.json') }
	static load(): GenesisFile { return JSON.parse(FS.readFileSync('./genesis.json', { encoding: 'utf-8' })) }
	static save(data: GenesisFile) { FS.writeFileSync('./genesis.json', JSON.stringify(data, null, 4)) }
}

class Utils {
	static removeFiles(dir: string, endings: string[]): void {
		if (!FS.existsSync(dir)) return
		FS.readdirSync(dir).forEach(f => {

			const path = Path.join(dir, f)
			const stat = FS.statSync(path)

			if (stat.isDirectory()) {
				this.removeFiles(path, endings)
				return
			}

			endings.forEach(e => {
				if (Path.extname(path) === e) {
					FS.unlinkSync(path)
					console.log(Chalk.gray('Removed'), Chalk.cyan(Path.relative(process.cwd(), path)))
				}
			})
		})
	}

	static async measureTime(fn: (...data: any[]) => Promise<boolean>, data?: any) {
		const start = Date.now()
		if (await fn(data)) {
			console.log(Chalk.green('Done!'), Chalk.gray('took', `${((Date.now() - start) / 1000)}s`))
		} else {
			console.log(Chalk.red('Failed!'), Chalk.gray('took', `${((Date.now() - start) / 1000)}s`))
		}
	}

	static async runCommand(command: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const cmd = ChildProcess.exec(command)
			cmd.stdout.pipe(process.stdout)
			cmd.stderr.pipe(process.stderr)
			cmd.on('exit', resolve)
		})
	}

	static flat(genesis: GenesisFile): { projects: { [key: string]: GenesisProject }, modules: { [key: string]: GenesisModule } } {
		const projects: { [key: string]: GenesisProject } = {}
		const modules: { [key: string]: GenesisModule } = {}

		Object.keys(genesis.projects).forEach(prj => {
			if (genesis.projects[prj].type != undefined) {
				projects[prj] = (genesis.projects[prj] as GenesisProject)
			} else {
				Object.keys(genesis.projects[prj]).forEach(prj2 => {
					if (genesis.projects[prj][prj2].type != undefined) {
						projects[`${prj}-${prj2}`] = genesis.projects[prj][prj2]
					} else {
						throw new Error(`Key ${prj}/${prj2} does not contain a project!`)
					}
				})
			}
		})

		Object.keys(genesis.modules).forEach(prj => {
			if (genesis.modules[prj].packet != undefined) {
				modules[prj] = (genesis.modules[prj] as GenesisModule)
			} else {
				Object.keys(genesis.modules[prj]).forEach(prj2 => {
					if (genesis.modules[prj][prj2].packet != undefined) {
						modules[`${prj}-${prj2}`] = genesis.modules[prj][prj2]
					} else {
						throw new Error(`Key ${prj}/${prj2} does not contain a module!`)
					}
				})
			}
		})

		return {
			projects, modules
		}
	}
}

const ARCHITECTURES = {
	x86: {
		msb: 'x86',
		premake: 'x86'
	},
	x64: {
		msb: 'x64',
		premake: 'x86_64'
	}
}

abstract class Generator {
	abstract getName(): string
	abstract getDescription(): string
	abstract generate(opt: any): Promise<boolean>
}
class GeneratorVSCodeMSB extends Generator {
	getName() { return 'vscodemsb' }
	getDescription() { return 'Generates VSCode Launches, Tasks and include directories' }

	async generate(opt: any): Promise<boolean> {
		if (!Genesis.exists()) {
			console.log(Chalk.red('Directory does not seem to contain a GenesisMake project!'))
			return false;
		}
		if (opt.arch == undefined || ARCHITECTURES[opt.arch] == undefined) {
			console.log(Chalk.red('Please specify a valid architecture!'))
			return false
		}
		if (opt.config == undefined) {
			console.log(Chalk.red('Please specify a valid configuration!'))
			return false
		}

		const configurations = []
		const tasks = []

		const { projects, modules } = Utils.flat(Genesis.load())
		Object.keys(projects).forEach(prj => {
			const project = projects[prj]
			if (project.type != 'ConsoleApp') return
			if (project.hide != undefined && project.hide) return

			const name = prj
			const { arch, config } = opt
			const archName = ARCHITECTURES[arch].msb

			configurations.push({
				name: `${name}-${config}`,
				type: 'cppvsdbg',
				request: 'launch',
				program: `\${workspaceFolder}/bin/windows/${config}/${prj}/${prj}.exe`,
				args: [],
				stopAtEntry: false,
				cwd: `\${workspaceFolder}/bin/windows/${config}/${prj}/`,
				console: 'newExternalWindow',
				preLaunchTask: `build-${config}`
			})
			tasks.push({
				label: `build-${config}`,
				type: 'shell',
				command: 'msbuild',
				args: [
					`/p:Configuration=${config}`,
					`/p:Platform=${archName}`,
					'-verbosity:minimal'
				],
				group: 'build',
				presentation: {
					reveal: 'silent'
				},
				problemMatcher: '$msCompile',
				dependsOn: 'premake-vs2022'
			})
		})

		if (!FS.existsSync('./.vscode')) FS.mkdirSync('./.vscode/')
		FS.writeFileSync('./.vscode/tasks.json', JSON.stringify({
			version: '2.0.0',
			tasks
		}, null, 4))
		FS.writeFileSync('./.vscode/launch.json', JSON.stringify({
			version: '0.2.0',
			configurations
		}, null, 4))

		return true
	}
}
class GeneratorPremake extends Generator {
	getName(): string { return "premake" }
	getDescription(): string { return "Generates buildable files using premake" }

	async generate(opt: any): Promise<boolean> {
		if (!FS.existsSync('./.genesis/project')) FS.mkdirSync('./.genesis/project/', { recursive: true })

		const genesis = Genesis.load()
		const { projects, modules } = Utils.flat(genesis)

		if (!FS.existsSync(`./.genesis/project/__global__.lua`)) FS.writeFileSync(`./.genesis/project/__global__.lua`, '--\n-- You can define premake code inside here which will be executed once for every\n-- project after it has configured\n--\n-- After this file, the specifc project lua file will be executed\n--\n\nprint("Any project has been configured")\n')
		Object.keys(projects).forEach(prjID => {
			const project = projects[prjID]
			if (!FS.existsSync(`./.genesis/project/${prjID}.lua`)) FS.writeFileSync(`./.genesis/project/${prjID}.lua`, `--\n-- You can define premake code inside here which will be executed\n-- after project "${prjID}" has been configured and the __global__ file has been finished!\n--\n\nprint("${prjID} has been configured!")\n`)
		})

		await Utils.runCommand('premake5 vs2022')

		return true
	}
}

const generatorVSCodeMSB = new GeneratorVSCodeMSB()
const generatorPremake = new GeneratorPremake()
const generators = {}
generators[generatorVSCodeMSB.getName()] = generatorVSCodeMSB
generators[generatorPremake.getName()] = generatorPremake

class Handlers {
	static async handleInit() {
		if (Genesis.exists()) {
			if (!(await Inquirer.prompt({
				name: 'replace',
				message: 'Should your current genesis.json file be replaced?',
				default: false,
				type: 'confirm'
			})).replace) return
		}
		const { name } = await Inquirer.prompt([
			{
				name: 'name',
				message: 'Enter the name of your workspace',
				type: 'input',
				default: Path.basename(process.cwd())
			}
		])
		const genesisFile: GenesisFile = {
			name,
			projects: {},
			modules: {}
		}

		console.log(Chalk.green('Successfully'), Chalk.gray('initialized empty workspace'), `${Chalk.cyan(name)}${Chalk.gray('!')}`)
		Genesis.save(genesisFile)
	}
	static async handleProject() {
		const { name, group, type, includes } = await Inquirer.prompt([
			{
				name: 'name',
				type: 'input',
				message: 'Enter the name of your project',
				default: 'Project'
			},
			{
				name: 'group',
				type: 'input',
				message: 'Enter the group of your project',
				default: 'Group'
			},
			{
				name: 'type',
				type: 'list',
				message: 'Choose the type of your project',
				choices: [
					'StaticLib',
					'ConsoleApp'
				]
			},
			{
				name: 'includes',
				type: 'confirm',
				message: 'Add own includes dir?',
				default: true
			}
		])
		const incs = includes ? [`%{wks.location}/${group}/src/${name}/`] : []

		const data = Genesis.load()
		if (data.projects[group] != undefined && data.projects[group][name] != undefined && data.projects[group][name].type != undefined) {
			console.log(Chalk.cyan(name), Chalk.gray('in'), Chalk.cyan(group), Chalk.red('already exists!'))
			return
		}

		if (data.projects[group] == undefined) data.projects[group] = {}
		const projectData: GenesisProject = {
			type,
			includeDirs: incs,
			dependencies: []
		}
		data.projects[group][name] = projectData
		Genesis.save(data)

		console.log(Chalk.gray('Project added'), `${Chalk.green('successfully')}${Chalk.gray('!')}`)
	}
	static async handleModule() {
		const { packetType } = await Inquirer.prompt({
			name: 'packetType',
			type: 'list',
			message: 'Choose the type of your packet',
			choices: [
				'Git Clone'
			]
		})

		let packet = undefined
		if (packetType === 'Git Clone') {
			packet = await Handlers.handleGitClonePacket()
		}

		const { type, name, include } = await Inquirer.prompt([
			{
				name: 'name',
				type: 'input',
				message: 'Enter the name of the module'
			},
			{
				name: 'type',
				type: 'list',
				choices: [
					'premake'
				],
				message: 'Choose a library type'
			},
			{
				name: 'include',
				type: 'input',
				message: 'Enter the include directory for your module',
				default: 'include/'
			}
		])

		let library: GenesisLibrary = undefined
		if (type == 'premake') {
			const { script } = await Inquirer.prompt({
				name: 'script',
				type: 'input',
				message: 'Enter the script name of the library',
				default: `%{wks.location}/.genesis/${name}.lua`
			})

			library = {
				type: 'premake',
				script
			}
		}

		const includeDirs = include.split(',')

		const data = Genesis.load()
		if (data.modules[name] != undefined) {
			console.log(Chalk.gray('Module'), Chalk.cyan(name), Chalk.red('already exists!'))
			return
		}
		const moduleData: GenesisModule = {
			type,
			includeDirs,
			packet,
			library,
			dependencies: []
		}
		data.modules[name] = moduleData
		Genesis.save(data)
		console.log(Chalk.gray('Module added'), `${Chalk.green('successfully')}${Chalk.gray('!')}`)
	}
	static async handleInstall() {
		if (!Genesis.exists()) {
			console.log(Chalk.red('Directory does not seem to be a GenesisMake project!'))
			return false
		}

		const modules = Genesis.load().modules
		for (let module of Object.keys(modules)) {
			const packet = modules[module].packet
			switch (packet.type) {
				case 'git-clone': {
					let p = packet as GenesisGitPacket
					await Utils.runCommand(`git clone ${p.repo} ./.genesis/modules/${module}`)
				}
			}
		}

		return true
	}

	static async handleGitClonePacket() {
		const { repo } = await Inquirer.prompt({
			name: 'repo',
			type: 'input',
			message: 'Enter your repo url'
		})
		return {
			type: 'git-clone',
			repo
		}
	}

	static async handleClean() {
		if (!Genesis.exists()) {
			console.log(Chalk.red('Directory does not seem to be a GenesisMake project!'))
			return false
		}

		const dirs = [
			'bin/',
			'bin-int/',
			'.genesis/modules/'
		]
		dirs.forEach(dir => {
			if (FS.existsSync(dir)) {
				console.log(Chalk.gray('Removing', dir))
				FS.rmSync(dir, { recursive: true })
			}
		})

		console.log(Chalk.gray('Deleting generated files...'))
		const projects = Genesis.load().projects
		Object.keys(projects).forEach(name => {
			Utils.removeFiles(Path.join(name), [
				'.vcxproj',
				'.user',
				'.filter',
				'.sln'
			])
		})

		return true
	}

	static async handleGenerate(data) {
		console.log(data)
		if (data.generator == undefined || generators[(data.generator as string).toLowerCase()] == undefined) {
			console.log(Chalk.red('No generator specified!'))
			console.log(Chalk.gray('The following generators are available:'))
			Object.keys(generators).forEach(k => {
				console.log(Chalk.cyan(k), Chalk.gray(generators[k].getDescription()))
			})
			return false;
		}
		const gen = (data.generator as string).toLowerCase()

		console.log(Chalk.gray('Generating data using'), Chalk.cyan(gen))
		return await (generators[gen].generate(data.opt))
	}

	static async handleBuildVS(arch: string, config: string) {
		await Utils.runCommand(`msbuild /p:Configuration=${config} /p:Platform=${arch} -verbosity:minimal`)

		return true
	}
	static async handleBuild(data) {
		const { toolchain } = data
		if (data.opt == undefined || data.opt.arch == undefined || data.opt.config == undefined) {
			console.log(Chalk.red('No architecture or configuration has been specified!'))
			return false
		}

		const tc = toolchain.toLowerCase()
		if (tc === 'msb') {
			return Handlers.handleBuildVS(data.opt.arch, data.opt.config)
		} else {
			console.log(Chalk.red('No toolchain called'), Chalk.cyan(tc), Chalk.red('found!'))
			return false
		}
	}
}

const app = new Command('genesis')
	.description('CLI utility tools for genesismake')
	.version('1.0.0')

app.command('init')
	.description('intiailizes a new genesis make project')
	.action(Handlers.handleInit)

app.command('project')
	.description('adds a new project to your genesis.json file')
	.action(Handlers.handleProject)

app.command('module')
	.description('adds a new module to your genesis.json file')
	.action(Handlers.handleModule)

app.command('install')
	.alias('i')
	.description('installs currently defined packets')
	.action(() => { Utils.measureTime(Handlers.handleInstall) })

app.command('clean')
	.description('cleans project data')
	.action(() => { Utils.measureTime(Handlers.handleClean) })

app.command('generate')
	.description('generates various files using a specified generator outof your genesis.json files')
	.argument('[generator]', 'specify generator to use')
	.option('-a, --arch [platform]', 'specify an architecture')
	.option('-c, --config [config]', 'specify a configuration')
	.action((generator, opt) => { Utils.measureTime(Handlers.handleGenerate, { opt, generator }) })

app.command('build')
	.description('build your project')
	.argument('[toolchain]', 'specify a toolchain that will be used to compile your code')
	.option('-a, --arch [platform]', 'specify an architecture')
	.option('-c, --config [config]', 'specify a configuration')
	.action((toolchain, opt) => { Utils.measureTime(Handlers.handleBuild, { opt, toolchain }) })

console.log(Gradient.pastel.multiline(Figlet.textSync('GenesisCLI >_', { font: 'Big Money-ne' })))
app.parse()
