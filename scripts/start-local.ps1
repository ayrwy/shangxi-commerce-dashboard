<#
.SYNOPSIS
  Starts the local MySQL, Django, and Shangxi frontend services.

.DESCRIPTION
  This script does not sign in to any account and does not restart services
  that are already listening on their local ports.
#>

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'

function Test-LocalPort {
  param([int]$Port)

  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Wait-LocalPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 15
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalPort -Port $Port) { return $true }
    Start-Sleep -Milliseconds 400
  }

  return $false
}

function Start-WindowedCommand {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $windowCommand = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$WorkingDirectory'; $Command"
  Start-Process -FilePath 'powershell.exe' -WorkingDirectory $WorkingDirectory -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $windowCommand) | Out-Null
}

Write-Host ''
Write-Host 'Shangxi local environment launcher' -ForegroundColor Cyan
Write-Host '----------------------------------' -ForegroundColor DarkGray

if (-not (Test-LocalPort -Port 3306)) {
  $mysqlService = Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue
  if ($null -eq $mysqlService) {
    Write-Warning 'MySQL80 service was not found. Start MySQL manually in Windows Services.'
  } else {
    try {
      Start-Service -Name 'MySQL80'
      if (Wait-LocalPort -Port 3306 -TimeoutSeconds 12) {
        Write-Host 'OK  MySQL started on port 3306' -ForegroundColor Green
      } else {
        Write-Warning 'MySQL was asked to start, but port 3306 is not listening yet.'
      }
    } catch {
      Write-Warning 'Could not start MySQL automatically. Run this launcher as administrator or start MySQL80 manually.'
    }
  }
} else {
  Write-Host 'OK  MySQL is already running on port 3306' -ForegroundColor Green
}

$djangoPython = Join-Path $backendRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $djangoPython)) {
  throw "Django virtual environment was not found: $djangoPython"
}

if (-not (Test-LocalPort -Port 8000)) {
  Start-WindowedCommand -Title 'Shangxi - Django Backend' -WorkingDirectory $backendRoot -Command '.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000'
  if (Wait-LocalPort -Port 8000) {
    Write-Host 'OK  Django started on port 8000' -ForegroundColor Green
  } else {
    Write-Warning 'Django startup timed out. Check the Shangxi - Django Backend window.'
  }
} else {
  Write-Host 'OK  Django is already running on port 8000' -ForegroundColor Green
}

if (-not (Test-LocalPort -Port 5173)) {
  Start-WindowedCommand -Title 'Shangxi - Frontend' -WorkingDirectory $projectRoot -Command 'npm run dev -- --host 127.0.0.1'
  if (Wait-LocalPort -Port 5173) {
    Write-Host 'OK  Frontend started on port 5173' -ForegroundColor Green
  } else {
    Write-Warning 'Frontend startup timed out. Check the Shangxi - Frontend window.'
  }
} else {
  Write-Host 'OK  Frontend is already running on port 5173' -ForegroundColor Green
}

if (Test-LocalPort -Port 5173) {
  Start-Process 'http://127.0.0.1:5173/'
}

if (Test-LocalPort -Port 8000) {
  Start-Process 'http://127.0.0.1:8000/admin/'
}

Write-Host ''
Write-Host 'Shangxi and Django Admin were opened. Please sign in manually.' -ForegroundColor Cyan
Write-Host 'You can close this window. Django and the frontend keep running in their own windows.' -ForegroundColor DarkGray
