# Publish Vite/React frontend to GitHub (wacherfrontend). Excludes server/ and build artifacts.
#
# Private repo: Git must authenticate as wacheit26-bit (not another GitHub account).
# Option A — one-time in PowerShell (do not paste the token in chat):
#   $env:WACHERFRONTEND_GITHUB_PAT = "ghp_xxxxxxxx"
#   .\scripts\push-frontend-to-github.ps1 -Message "Frontend update"
# Option B — Git Credential Manager: run `git ls-remote` on the repo URL and sign in as wacheit26-bit
#   (PAT as password). Clear stale GitHub login if you see "Repository not found" on a private repo.
#
# Usage: .\scripts\push-frontend-to-github.ps1 [-Message "your commit message"]

param(
  [string]$Message = "Frontend update",
  [string]$GitHubPat = $env:WACHERFRONTEND_GITHUB_PAT
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path "src\main.jsx")) {
  Write-Error "Run this from the Wache project root (src\main.jsx missing)."
}

$FrontendRepo = "wacheit26-bit/wacherfrontend"
$FrontendRemoteUrl = "https://github.com/$FrontendRepo.git"

function Get-AuthenticatedRemoteUrl {
  param([string]$Pat)
  if ([string]::IsNullOrWhiteSpace($Pat)) {
    return $FrontendRemoteUrl
  }
  $token = [uri]::EscapeDataString($Pat.Trim())
  return "https://wacheit26-bit:${token}@github.com/$FrontendRepo.git"
}

function Invoke-GitWithPat {
  param([string[]]$GitArgs)
  & git -c credential.helper= @GitArgs
  return $LASTEXITCODE
}

function Test-GitHubRepoAccess {
  param([string]$Url)
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = git -c credential.helper= ls-remote $Url 2>&1 | Out-String
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($code -ne 0) {
    return @{ Ok = $false; Output = $out.Trim() }
  }
  if ($out -match "not granted|not found|Authentication failed|Permission denied|403|Invalid username") {
    return @{ Ok = $false; Output = $out.Trim() }
  }
  return @{ Ok = $true; Output = $out.Trim() }
}

$PushRemoteUrl = Get-AuthenticatedRemoteUrl -Pat $GitHubPat

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
  "scripts/push-frontend-to-github.ps1",
  "scripts/hostinger-deploy-frontend.sh",
  "docs/HOSTINGER-FRONTEND.md"
)

foreach ($path in $FrontendPaths) {
  if (Test-Path (Join-Path $Root $path)) {
    git add -- "$path"
  }
}

$Status = git status --porcelain -- @FrontendPaths
if ($Status) {
  git -c user.email="wacheit26-bit@users.noreply.github.com" -c user.name="wacheit26-bit" commit -m $Message
  Write-Host "Committed frontend changes on local main."
} else {
  Write-Host "No frontend path changes to commit on local main."
}

$remoteList = @(git remote 2>$null)
if ($remoteList -contains "frontend") {
  git remote set-url frontend $FrontendRemoteUrl
} else {
  git remote add frontend $FrontendRemoteUrl
}

Write-Host "Checking access to $FrontendRemoteUrl ..."
$access = Test-GitHubRepoAccess -Url $PushRemoteUrl
if (-not $access.Ok) {
  Write-Host ""
  Write-Host "Cannot access wacheit26-bit/wacherfrontend with this token."
  if ($access.Output) {
    Write-Host $access.Output
  }
  Write-Host ""
  Write-Host "Use a classic PAT (starts with ghp_) on account wacheit26-bit with the 'repo' scope."
  Write-Host "Fine-grained tokens (github_pat_) need Contents: Read and write on this repo."
  Write-Host "Clear wrong GitHub login: git credential-manager github logout"
  Write-Host ""
  Write-Host '  $env:WACHERFRONTEND_GITHUB_PAT = "ghp_..."'
  Write-Host "  .\scripts\push-frontend-to-github.ps1 -Message `"$Message`""
  Write-Host ""
  exit 1
}

$ArchiveArgs = $FrontendPaths | Where-Object { Test-Path (Join-Path $Root $_) }
if (-not $ArchiveArgs.Count) {
  Write-Error "Nothing to publish - no frontend paths found."
}

$PublishDir = Join-Path $env:TEMP ("wacherfrontend-publish-{0}" -f [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $PublishDir | Out-Null

$zipFile = Join-Path $env:TEMP ("wache-frontend-{0}.zip" -f [guid]::NewGuid().ToString("n"))
try {
  & git -C $Root archive --format=zip -o $zipFile HEAD -- @ArchiveArgs
  if (-not (Test-Path $zipFile)) {
    Write-Error "git archive failed to create $zipFile"
  }
  Expand-Archive -Path $zipFile -DestinationPath $PublishDir -Force
} finally {
  if (Test-Path $zipFile) {
    Remove-Item -Force $zipFile
  }
}

Push-Location $PublishDir
git init -b main | Out-Null
git remote add origin $PushRemoteUrl
git add -A
git -c user.email="wacheit26-bit@users.noreply.github.com" -c user.name="wacheit26-bit" commit -m $Message

$ErrorActionPreference = "Continue"
$remoteMain = git -c credential.helper= ls-remote --heads origin main 2>&1 | Out-String
$ErrorActionPreference = "Stop"
if ($remoteMain -match "not granted|Authentication failed|Permission denied|Invalid username|403") {
  Write-Host ""
  Write-Host "GitHub rejected this token for wacheit26-bit/wacherfrontend."
  Write-Host "Use a classic PAT with the 'repo' scope, owned by wacheit26-bit."
  Write-Host "If you use a fine-grained token, grant Contents: Read and write on this repo."
  Pop-Location
  Remove-Item -Recurse -Force $PublishDir -ErrorAction SilentlyContinue
  Set-Location $Root
  exit 1
}

if ($remoteMain -match "refs/heads/main") {
  Invoke-GitWithPat -GitArgs @("pull", "--rebase", "origin", "main") | Out-Null
  $pushCode = Invoke-GitWithPat -GitArgs @("push", "origin", "main")
} else {
  $pushCode = Invoke-GitWithPat -GitArgs @("push", "-u", "origin", "main")
}
if ($pushCode -ne 0) {
  Write-Host "git push failed. Check token scopes and that the repo exists under wacheit26-bit."
  Pop-Location
  Remove-Item -Recurse -Force $PublishDir -ErrorAction SilentlyContinue
  Set-Location $Root
  exit 1
}
Pop-Location

Remove-Item -Recurse -Force $PublishDir -ErrorAction SilentlyContinue
Set-Location $Root
Write-Host "Pushed frontend to https://github.com/$FrontendRepo (branch main)."
