<#
  Deploy Arth to Google Cloud: the API on Cloud Run, the web app on Firebase Hosting.

    powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1            # API + web app
    powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -Only api  # API only
    powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -Only web  # web app only

  Needs: gcloud and firebase CLIs signed in as the project owner, and billing (or credits)
  on the project. Keys are read from backend\.env and stored in Secret Manager; they are never
  printed, committed or set as plain environment variables.

  The web app calls the API on its own domain: Firebase Hosting sends /api/** to Cloud Run
  (see firebase.json), so no CORS and no API URL is needed in the browser build.
#>
param(
  [string]$Project = 'arth-solo-2026',
  [string]$Region = 'asia-south1',
  [ValidateSet('all', 'api', 'web')] [string]$Only = 'all'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$service = 'arth-api'
$sa = "$service@$Project.iam.gserviceaccount.com"

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
# Not named "Gcloud": PowerShell names ignore case, so it would call itself instead of gcloud.
function Invoke-Gcloud { & gcloud @args --project $Project --quiet; if ($LASTEXITCODE) { throw "gcloud $($args[0..2] -join ' ') failed" } }

# Reads KEY=value from backend\.env without echoing it.
function EnvValue($name) {
  $line = Get-Content (Join-Path $root 'backend\.env') | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { return '' }
  return ($line -replace "^$name=", '').Trim()
}

# Creates the secret if needed and adds a new version only when the value changed.
function PutSecret($secret, $value) {
  if (-not $value) { throw "No value for $secret in backend\.env" }
  & gcloud secrets describe $secret --project $Project *> $null
  if ($LASTEXITCODE) { Invoke-Gcloud secrets create $secret --replication-policy=automatic }
  $current = & gcloud secrets versions access latest --secret $secret --project $Project 2> $null
  if ($current -ne $value) {
    $tmp = New-TemporaryFile
    try {
      [IO.File]::WriteAllText($tmp, $value)   # no trailing newline
      Invoke-Gcloud secrets versions add $secret --data-file $tmp
    } finally { Remove-Item $tmp -Force }
  }
  Invoke-Gcloud secrets add-iam-policy-binding $secret --member "serviceAccount:$sa" --role roles/secretmanager.secretAccessor | Out-Null
}

if ($Only -in 'all', 'api') {
  Step 'Enabling Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Firestore'
  Invoke-Gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com

  Step "Service account $sa (Firestore access only)"
  & gcloud iam service-accounts describe $sa --project $Project *> $null
  if ($LASTEXITCODE) { Invoke-Gcloud iam service-accounts create $service --display-name 'Arth API' }
  Invoke-Gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$sa" --role roles/datastore.user --condition=None | Out-Null

  Step 'Keys into Secret Manager'
  PutSecret 'gemini-api-key' (EnvValue 'GEMINI_API_KEY')
  PutSecret 'data-gov-in-api-key' (EnvValue 'ARTH_DATA_GOV_IN_API_KEY')

  Step "Building and deploying $service to Cloud Run ($Region)"
  $origins = "https://$Project.web.app,https://$Project.firebaseapp.com,https://localhost,http://localhost:5173"
  # ^@^ switches the list separator to @ so the comma-separated origins stay one value
  $vars = "^@^ARTH_ENV=production@ARTH_STORE=firestore@ARTH_FIREBASE_PROJECT_ID=$Project@ARTH_CORS_ORIGINS=$origins"
  Invoke-Gcloud run deploy $service `
    --source (Join-Path $root 'backend') `
    --region $Region `
    --service-account $sa `
    --allow-unauthenticated `
    --set-env-vars $vars `
    --set-secrets 'GEMINI_API_KEY=gemini-api-key:latest,ARTH_DATA_GOV_IN_API_KEY=data-gov-in-api-key:latest' `
    --min-instances 0 --max-instances 3 --memory 512Mi --cpu 1 --concurrency 40 --timeout 60

  $url = & gcloud run services describe $service --region $Region --project $Project --format 'value(status.url)'
  Step "API is live at $url"
  $health = Invoke-RestMethod "$url/health"
  Write-Host "health: ok=$($health.ok) model=$($health.model) modelReady=$($health.modelReady)"
}

if ($Only -in 'all', 'web') {
  Step 'Building the web app'
  Push-Location (Join-Path $root 'frontend')
  try { npm run build; if ($LASTEXITCODE) { throw 'frontend build failed' } } finally { Pop-Location }

  Step 'Publishing to Firebase Hosting'
  Push-Location $root
  try { firebase deploy --only hosting,firestore:rules --project $Project; if ($LASTEXITCODE) { throw 'firebase deploy failed' } } finally { Pop-Location }
  Write-Host "`nWeb app: https://$Project.web.app" -ForegroundColor Green
}
