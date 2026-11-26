param(
    [Parameter(Mandatory)]
    [ValidateSet('seed','provider','rag','backend','web','simulations','gate','drafts','index')]
    [string]$Mode,
    [string]$RunId,
    [string]$Report,
    [switch]$LiveModel
)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location $workspace
$databaseName = 'phlpost_evl1_qa'
$env:EVL1_MODE = 'evl1-local'
$env:NODE_ENV = 'development'
$env:REDIS_URL = 'redis://127.0.0.1:6380/13'
$env:REDIS_KEY_PREFIX = 'phlpost-evl1-qa'
$env:OPENAI_BASE_URL = 'http://127.0.0.1:8330/v1'
$env:OPENAI_API_KEY = 'evl1-local-fixture'
$env:LLM_PROVIDER = 'openai'
$env:RAG_SERVICE_URL = 'http://127.0.0.1:18030'
$env:RAG_SERVICE_TOKEN_SECRET = 'evl1-isolated-loopback-rag-token-only'
$env:TRACING_PROVIDER = 'langsmith'
$env:LANGSMITH_API_KEY = 'evl1-local-placeholder'
$env:LANGSMITH_ENDPOINT = 'http://127.0.0.1:9'
$env:LANGSMITH_TRACING = 'false'
$env:LANGCHAIN_TRACING_V2 = 'false'
$env:WATSONX_ENABLED = 'false'
$env:PROVIDER_PROBE_ENABLED = 'false'
$env:ANTHROPIC_API_KEY = ''
$env:CACHE_ENABLED = 'false'
$env:CORS_ORIGINS = 'http://127.0.0.1:3031'
$env:BETTER_AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3031'
$env:BETTER_AUTH_URL = 'http://127.0.0.1:3030'
$env:BETTER_AUTH_SECRET = 'evl1-isolated-loopback-auth-secret-only'
$env:PORT = '3030'
$env:TRACKING_CONNECTOR = 'mock'
$env:TRACKING_LOOKUP_TIMEOUT_MS = '100'
$env:RATE_LIMIT_CHAT = '1000/minute'
$env:RATE_LIMIT_CLASSIFY = '1000/minute'
$env:RATE_LIMIT_DEFAULT = '1000/minute'
$env:OTEL_ENABLED = 'false'
$env:SENTRY_ENABLED = 'false'
$env:POSTHOG_ENABLED = 'false'
$env:NEXT_PUBLIC_SENTRY_ENABLED = 'false'
$env:NEXT_PUBLIC_POSTHOG_ENABLED = 'false'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:LOG_LEVEL = 'warn'
$evlRagPort = 18030
if ($LiveModel) {
    if ($Mode -notin 'rag','gate','index') { throw 'Use the live provider only for rag, index, or gate' }
    $credential = Get-Content -LiteralPath apps/rag/.env | Where-Object { $_ -match '^OPENAI_API_KEY\s*=' } | Select-Object -First 1
    if (!$credential) { throw 'No OpenAI credential is configured for the RAG service' }
    $env:OPENAI_API_KEY = ($credential -split '=',2)[1].Trim().Trim('"').Trim("'")
    $env:OPENAI_BASE_URL = 'https://api.openai.com/v1'
    $env:EVL1_EXECUTION_LABEL = 'live-openai-on-synthetic-sources'
    $evlRagPort = 18031
    $env:RAG_SERVICE_URL = "http://127.0.0.1:$evlRagPort"
    $env:REDIS_URL = 'redis://127.0.0.1:6380/12'
}

if ($Mode -notin 'provider','web') {
    $databasePassword = docker exec philpost_ai-postgres printenv POSTGRES_PASSWORD
    if ($LASTEXITCODE -ne 0 -or !$databasePassword) { throw 'Local PostgreSQL is unavailable' }
    $env:DATABASE_URL = 'postgresql://postgres:' + [uri]::EscapeDataString($databasePassword) + '@127.0.0.1:5433/' + $databaseName
    $target = [uri]$env:DATABASE_URL
    if ($target.Host -ne '127.0.0.1' -or $target.Port -ne 5433 -or $target.AbsolutePath -ne "/$databaseName") {
        throw 'Unexpected evaluation target'
    }
}

switch ($Mode) {
    'seed' {
        if (!$env:EVL1_QA_PASSWORD) { throw 'Set EVL1_QA_PASSWORD for the four isolated test accounts' }
        pnpm.cmd --filter @repo/db exec drizzle-kit migrate
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $env:SEED_ADMIN_PASSWORD = $env:EVL1_QA_PASSWORD
        pnpm.cmd --filter @repo/db exec tsx src/seed.ts
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        Push-Location apps/backend
        node dist/answer-quality-local.js seed
        Pop-Location
    }
    'provider' { node scripts/evl1-provider.cjs }
    'rag' {
        Set-Location apps/rag
        & ./.venv/Scripts/python.exe -m uvicorn --factory app.main:create_app --host 127.0.0.1 --port $evlRagPort
    }
    'backend' {
        Set-Location apps/backend
        # Keep the cookie host-only on 127.0.0.1 even if .env sets Domain=localhost.
        node -e "require('dotenv/config'); delete process.env.BETTER_AUTH_COOKIE_DOMAIN; require('reflect-metadata'); require('./dist/bootstrap').createApplication().then(app => app.listen(3030, '127.0.0.1')).catch(error => { console.error(error); process.exitCode = 1 })"
    }
    'web' {
        $env:EVL1_LOCAL_UI = 'true'
        $env:NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3030/api'
        $env:INTERNAL_API_BASE_URL = $env:NEXT_PUBLIC_API_BASE_URL
        $env:NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3031'
        $env:NEXT_PUBLIC_API_VERSION = 'v1'
        pnpm.cmd --filter @repo/web exec next dev --hostname 127.0.0.1 --port 3031
    }
    'simulations' { Set-Location apps/backend; node dist/answer-quality-local.js simulations }
    'index' {
        if (!$LiveModel) { throw 'Index mode requires -LiveModel' }
        Set-Location apps/backend
        node dist/answer-quality-local.js index-live
    }
    'gate' {
        if (!$Report) { $Report = Join-Path $workspace '.cache/evl1-quality-report.json' }
        Set-Location apps/backend
        if ($RunId) { node dist/answer-quality-cli.js local $Report $RunId }
        else { node dist/answer-quality-cli.js local $Report }
    }
    'drafts' {
        if (!$Report) { $Report = Join-Path $workspace '.cache/evl1-drafts.json' }
        Set-Location apps/backend
        node dist/answer-quality-cli.js drafts $Report
    }
}
exit $LASTEXITCODE
