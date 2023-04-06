outdir = "%{cfg.system}/%{cfg.longname}/%{prj.name}"

workspace "GenesisEngine"
location "."

configurations {
	"Debug-x64", "Release-x64", "Dist-x64",
	"Debug-x86", "Release-x86", "Dist-x86"
}

filter "configurations:*x64"
architecture "x86_64"
filter "configurations:*x86"
architecture "x86"
filter ""

include "genesis.lua"
