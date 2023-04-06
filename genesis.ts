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
	alias?: string
	includeDirs?: string[]
	dependencies?: string[]
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

	static async measureTime(fn: () => Promise<boolean>) {
		const start = Date.now()
		if (await fn()) {
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
}

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
		if (data.projects[group] != undefined && data.projects[group][name].type != undefined) {
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
			'bin-int/'
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
				'.vcxproj.user',
				'.vcxproj.filter',
				'.sln'
			])
		})

		return true
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

console.log(Gradient.pastel.multiline(Figlet.textSync('GenesisCLI >_', { font: 'Big Money-ne' })))
app.parse()
