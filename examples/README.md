# GCP Cloud Run Demo

## Quick Start

### 1. Set your API key

```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

### 2. Run the deployment script

```bash
cd demo
./gcp.sh "hello"
```

## Usage

The script accepts a command as the first argument:

```bash
# Run a hello command
./gcp.sh "hello"

# Run a custom command
./gcp.sh "list all files in the current directory"

# Default command (if no argument provided)
./gcp.sh
```

## Configuration

You can customize the deployment with environment variables:

```bash
export GCP_PROJECT_ID="my-project"
export GCP_REGION="asia-northeast1"
export GCP_JOB_NAME="my-custom-job"
export GCP_IMAGE="ghcr.io/snomiao/agent-yes:latest"

./gcp.sh "your command here"
```

## How it works

1. **No TTY needed**: The script configures Cloud Run Jobs to run non-interactively
2. **API Key authentication**: Uses `ANTHROPIC_API_KEY` environment variable
3. **Auto-execution**: Creates/updates the job and executes it immediately
4. **Log streaming**: Automatically streams logs from the execution

## Why Cloud Run Jobs instead of Cloud Run Services?

- **Cloud Run Services**: Require an HTTP server listening on `$PORT` - not suitable for CLI tools
- **Cloud Run Jobs**: Run to completion and exit - perfect for CLI tools like `agent-yes`

## Alternative: Quick test on Compute Engine

If you need TTY for local testing:

```bash
# Create a VM
gcloud compute instances create agent-yes-vm \
  --machine-type=e2-medium \
  --zone=us-central1-a

# SSH and run
gcloud compute ssh agent-yes-vm -- \
  'docker run -it --rm -e ANTHROPIC_API_KEY=xxx ghcr.io/snomiao/agent-yes:latest claude -- hello'
```
