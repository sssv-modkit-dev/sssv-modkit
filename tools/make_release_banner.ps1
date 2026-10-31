# Compatibility entry point: all rendering is handled by the portable generator.
param(
    [string]$Name = '',
    [string]$Version = 'CONCEPT',
    [string]$Out = '',
    [ValidateSet('blue', 'orange', 'green')][string]$Palette = 'blue',
    [ValidateSet('random', 'english', 'french', 'spanish', 'german', 'japanese')][string]$QuoteStyle = 'random',
    [ValidateSet('original', 'head', 'ears', 'both')][string]$Recolor = 'both',
    [string]$Browser = '',
    [switch]$Batch
)
$ErrorActionPreference = 'Stop'
$python = Get-Command python3, python -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$python) { throw 'Python 3.8+ is required. Use sh tools/make_release_banner.sh or install Python.' }
$arguments = @((Join-Path $PSScriptRoot 'make_release_banner.py'),
    '--version', $Version, '--palette', $Palette, '--quote-style', $QuoteStyle, '--recolor', $Recolor)
if ($Name) { $arguments += @('--name', $Name) }
if ($Out) { $arguments += @('--out', $Out) }
if ($Browser) { $arguments += @('--browser', $Browser) }
if ($Batch) { $arguments += '--batch' }
& $python.Source @arguments
exit $LASTEXITCODE
