# Publish Vite/React frontend to GitHub (watcher3frontend). Excludes server/ and build artifacts.
# Usage: .\scripts\push-frontend-to-github.ps1 [-Message "your commit message"]

param(
  [string]$Message = "Frontend update"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path "src\main.jsx")) {
  Write-Error "Run this from the Wache project root (src\main.jsx missing)."
}

$FrontendRemoteUrl = "https://github.com/succ-cloud/watcher3frontend.git"
$PublishDir = Join-Path $Root ".frontend-publish"

$FrontendPaths = @(
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "tailwind.config.js",
  "netlify.toml",
  ".env.example",
  ".gitignore",
  "README.md",
  "public",
  "src",
  "scripts/push-frontend-to-github.ps1"
)

foreach ($path in $FrontendPaths) {
  if (Test-Path (Join-Path $Root $path)) {
    git add -- "$path"
  }
}

$Status = git status --porcelain -- @FrontendPaths
if ($Status) {
  git -c user.email="succ-cloud@users.noreply.github.com" -c user.name="succ-cloud" commit -m $Message
  Write-Host "Committed frontend changes on local main."
} else {
  Write-Host "No frontend path changes to commit on local main."
}

$remoteList = @(git remote 2>$null)
if ($remoteList -notcontains "frontend") {
  git remote add frontend $FrontendRemoteUrl
  Write-Host "Added git remote 'frontend' -> $FrontendRemoteUrl"
}

function Ensure-PublishRepo {
  if (Test-Path (Join-Path $PublishDir ".git")) {
    Set-Location $PublishDir
    git fetch origin 2>$null
    if (git rev-parse origin/main 2>$null) {
      git checkout main 2>$null
      git reset --hard origin/main
    } else {
      git checkout -B main 2>$null
    }
    Set-Location $Root
    return
  }

  if (Test-Path $PublishDir) {
    Remove-Item -Recurse -Force $PublishDir
  }
  New-Item -ItemType Directory -Path $PublishDir | Out-Null
  Set-Location $PublishDir
  git init -b main | Out-Null
  git remote add origin $FrontendRemoteUrl
  Set-Location $Root
}

Ensure-PublishRepo

$ArchiveArgs = $FrontendPaths | Where-Object { Test-Path (Join-Path $Root $_) }
if (-not $ArchiveArgs.Count) {
  Write-Error "Nothing to publish - no frontend paths found."
}

Get-ChildItem -Path $PublishDir -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
& git -C $Root archive HEAD -- @ArchiveArgs | tar -x -C $PublishDir

Set-Location $PublishDir
git add -A
$PublishStatus = git status --porcelain
if (-not $PublishStatus) {
  Write-Host "No changes to publish (frontend repo already up to date)."
  Set-Location $Root
  exit 0
}

git -c user.email="succ-cloud@users.noreply.github.com" -c user.name="succ-cloud" commit -m $Message

$HasRemoteMain = git rev-parse origin/main 2>$null
if ($HasRemoteMain) {
  git pull --rebase origin main
  git push origin main
} else {
  git push -u origin main
}

Set-Location $Root
Write-Host "Pushed frontend to $FrontendRemoteUrl on branch main."
