--
-- genesis.lua
--
-- Copyright (c) 2023 DragonsRoar
--
-- Permission is hereby granted, free of charge, to any person obtaining a copy of
-- this software and associated documentation files (the "Software"), to deal in
-- the Software without restriction, including without limitation the rights to
-- use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
-- of the Software, and to permit persons to whom the Software is furnished to do
-- so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in all
-- copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE.
--

local json = require "json"

local function defineProject(name, group, type, includeDirs, dependencies, script)
	project(group .. "-" .. name)
	location("%{wks.location}/" .. group .. "/src/" .. group .. name .. "/")
	kind(type)
	systemversion "latest"
	language "C++"
	cppdialect "C++20"

	debugdir("%{wks.location}/bin/" .. outdir)
	targetdir("%{wks.location}/bin/" .. outdir)
	objdir("%{wks.location}/bin-int/" .. outdir)

	files {
		"%{prj.location}/**.c",
		"%{prj.location}/**.h",
		"%{prj.location}/**.cpp",
		"%{prj.location}/**.hpp"
	}

	includedirs(includeDirs)

	if (type ~= "StaticLib") then
		links(dependencies)
	end

	include("./.genesis/project/__global__.lua")
	if (script ~= nil) then
		include(script)
	end
end

function readFile(file)
	local f = assert(io.open(file, "rb"))
	local content = f:read("*all")
	f:close()
	return content
end

local moduleRoot = "%{wks.location}/.genesis/modules/"

local function checkIfProjectModule(data)
	return data.type ~= nil or data.library ~= nil
end

local genesisFile = json.decode(readFile("genesis.json"))
local projects = genesisFile.projects
local modules = genesisFile.modules

-- Stores if project is type ore module
local isModule = {}

local plainProjects = {}
for key, val in pairs(projects) do
	for nKey, val in pairs(val) do
		if checkIfProjectModule(val) then
			plainProjects[key .. "-" .. nKey] = val
			isModule[key .. "-" .. nKey] = false
		end
	end
end

local plainModules = {}
for key, val in pairs(modules) do
	if checkIfProjectModule(val) then
		plainModules[key] = val
		isModule[key] = true
	else
		for nKey, val in pairs(val) do
			if checkIfProjectModule(val) then
				plainModules[key .. "-" .. nKey] = val
				isModule[key .. "-" .. nKey] = true
			end
		end
	end
end

function table.deep_copy(orig)
	local orig_type = type(orig)
	local copy
	if orig_type == 'table' then
		copy = {}
		for orig_key, orig_value in next, orig, nil do
			copy[table.deep_copy(orig_key)] = table.deep_copy(orig_value)
		end
		setmetatable(copy, table.deep_copy(getmetatable(orig)))
	else -- number, string, boolean, etc
		copy = orig
	end
	return copy
end

function table.has_value(tab, val)
	for index, value in ipairs(tab) do
		if value == val then
			return true
		end
	end

	return false
end

local function hasDependencies(data)
	return data["dependencies"] ~= nil or data["dependencies"] ~= nil
end

local function rec_getDependencies(data)
	if hasDependencies(data) then
		local deps = table.deep_copy(data.dependencies)
		for _, d in pairs(data.dependencies) do
			if type(d) == "string" then
				assert(isModule[d] ~= nil, "Project/Module " .. d .. " is not defined!")

				if isModule[d] then
					for _, dep in pairs(rec_getDependencies(plainModules[d])) do
						table.insert(deps, dep)
					end
				else
					for _, dep in pairs(rec_getDependencies(plainProjects[d])) do
						table.insert(deps, dep)
					end
				end
			end
		end

		return deps
	else
		return {}
	end
end
local function getDependencies(data)
	local deps = rec_getDependencies(data)
	local depsN = {}
	for _, d in pairs(deps) do
		if not table.has_value(depsN, d) then
			table.insert(depsN, d)
		end
	end
	return depsN
end

local function getIncludeDirs(names)
	local includeDirs = {}
	for _, prj in pairs(names) do
		if isModule[prj] then
			assert(plainModules[prj].includeDirs, "Module " .. prj .. " does not have any include dirs!")
			local dirs = {}
			dirs = plainModules[prj].includeDirs

			for _, dir in pairs(dirs) do
				table.insert(includeDirs, moduleRoot .. dir)
			end
		else
			assert(plainProjects[prj].includeDirs, "Project " .. prj .. " does not have any include dirs!")
			local dirs = {}
			dirs = plainProjects[prj].includeDirs

			for _, dir in pairs(dirs) do
				table.insert(includeDirs, dir)
			end
		end
	end
	return includeDirs
end

function string.split(inputstr, sep)
	if sep == nil then
		sep = "%s"
	end
	local t = {}
	for str in string.gmatch(inputstr, "([^" .. sep .. "]+)") do
		table.insert(t, str)
	end
	return t
end

local function handleProject(name, data)
	local deps = getDependencies(data)
	local includeDirs = getIncludeDirs(deps)

	for _, dir in pairs(data.includeDirs) do
		table.insert(includeDirs, dir)
	end

	local split = string.split(name, "-")
	defineProject(split[2], split[1], data.type, includeDirs, deps, "./.genesis/project/" .. name .. ".lua")
end

local function handleModule(name, data)
	local function handlePremakeModule(name, data)
		local scriptName = data.library.script
		if (scriptName == nil) then
			print("WARN: Could not find script property on module " .. name .. "!")
			print("Setting script location to " .. moduleRoot .. "../scripts/" .. name)
			print("")
			scriptName = moduleRoot .. "../scripts/" .. name
		end
	end

	if data.library.type == "premake" then
		handlePremakeModule(name, data)
	else
		assert(true, "Cannot find library of type " .. data.library.type .. "!")
	end
end

function dump(o)
	if type(o) == 'table' then
		local s = '{ '
		for k, v in pairs(o) do
			if type(k) ~= 'number' then k = '"' .. k .. '"' end
			s = s .. '[' .. k .. '] = ' .. dump(v) .. ','
		end
		return s .. '} '
	else
		return tostring(o)
	end
end

for key, val in pairs(plainModules) do
	handleModule(key, val)
end

for key, val in pairs(plainProjects) do
	handleProject(key, val)
end
