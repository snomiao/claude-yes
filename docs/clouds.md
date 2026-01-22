# Cloud Deployment Guide

This guide covers deploying `agent-yes` to various cloud platforms.

## Google Cloud Run

Google Cloud Run allows you to deploy containerized applications serverlessly. You can deploy the `agent-yes` Docker image directly from GitHub Container Registry.

### Prerequisites

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
2. Authenticate with Google Cloud:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

### Method 1: Direct Deployment (Simple)

Deploy directly from GitHub Container Registry:

```bash
# Deploy the latest version
gcloud run deploy agent-yes \
  --image ghcr.io/snomiao/agent-yes:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated

# Deploy with environment variables for API keys
gcloud run deploy agent-yes \
  --image ghcr.io/snomiao/agent-yes:latest \
  --region us-central1 \
  --platform managed \
  --set-env-vars ANTHROPIC_API_KEY=your-api-key-here \
  --allow-unauthenticated
```

### Method 2: Using Artifact Registry Remote Repository (Recommended)

For production deployments, use Artifact Registry as a remote repository proxy. This provides better reliability and avoids the 9.9 GB layer size limitation.

**Step 1: Create an Artifact Registry remote repository**

```bash
# Create a remote repository for GitHub Container Registry
gcloud artifacts repositories create ghcr-remote \
  --repository-format=docker \
  --location=us-central1 \
  --mode=remote-repository \
  --remote-repo-config-desc="GitHub Container Registry" \
  --remote-docker-repo=DOCKER-HUB \
  --remote-username=_json_key \
  --remote-password-secret-version=projects/YOUR_PROJECT_ID/secrets/github-pat/versions/latest

# For public repositories (no authentication needed)
gcloud artifacts repositories create ghcr-remote \
  --repository-format=docker \
  --location=us-central1 \
  --mode=remote-repository \
  --remote-repo-config-desc="GitHub Container Registry Public"
```

**Step 2: Deploy using the remote repository**

```bash
gcloud run deploy agent-yes \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/ghcr-remote/snomiao/agent-yes:latest \
  --region us-central1 \
  --platform managed
```

### Using Secrets for API Keys

For better security, store API keys in Google Secret Manager:

**Step 1: Create secrets**

```bash
# Create secret for Anthropic API key
echo -n "your-anthropic-api-key" | gcloud secrets create anthropic-api-key \
  --data-file=-

# Create secret for OpenAI API key
echo -n "your-openai-api-key" | gcloud secrets create openai-api-key \
  --data-file=-
```

**Step 2: Deploy with secrets**

```bash
gcloud run deploy agent-yes \
  --image ghcr.io/snomiao/agent-yes:latest \
  --region us-central1 \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest,OPENAI_API_KEY=openai-api-key:latest \
  --platform managed
```

### Configuring Resources

Adjust memory and CPU based on your workload:

```bash
gcloud run deploy agent-yes \
  --image ghcr.io/snomiao/agent-yes:latest \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --max-instances 10 \
  --platform managed
```

### Running Jobs (Non-HTTP)

For batch processing or scheduled tasks, use Cloud Run Jobs:

```bash
# Create a job
gcloud run jobs create agent-yes-job \
  --image ghcr.io/snomiao/agent-yes:latest \
  --region us-central1 \
  --set-env-vars ANTHROPIC_API_KEY=your-api-key \
  --task-timeout 3600 \
  --max-retries 3

# Execute the job
gcloud run jobs execute agent-yes-job --region us-central1

# Execute with arguments
gcloud run jobs update agent-yes-job \
  --region us-central1 \
  --args="--","run all tests and commit"

gcloud run jobs execute agent-yes-job --region us-central1
```

### Mounting Configuration Files

To persist credentials across runs, use Cloud Storage FUSE:

```bash
# Deploy with volume mount (requires Cloud Storage bucket)
gcloud run deploy agent-yes \
  --image ghcr.io/snomiao/agent-yes:latest \
  --region us-central1 \
  --execution-environment gen2 \
  --add-volume name=config,type=cloud-storage,bucket=your-config-bucket \
  --add-volume-mount volume=config,mount-path=/root/.config
```

### Example: Scheduled Automation

Deploy a scheduled job using Cloud Scheduler:

```bash
# Create a Cloud Run job
gcloud run jobs create nightly-tests \
  --image ghcr.io/snomiao/agent-yes:latest \
  --region us-central1 \
  --set-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --args="--exit-on-idle=600","--","run all tests and commit if passing"

# Create a Cloud Scheduler job to run it nightly at 2 AM
gcloud scheduler jobs create http nightly-tests-scheduler \
  --location us-central1 \
  --schedule "0 2 * * *" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/YOUR_PROJECT_ID/jobs/nightly-tests:run" \
  --http-method POST \
  --oauth-service-account-email YOUR_SERVICE_ACCOUNT@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### Viewing Logs

```bash
# View service logs
gcloud run services logs read agent-yes \
  --region us-central1 \
  --limit 50

# Stream logs in real-time
gcloud run services logs tail agent-yes \
  --region us-central1

# View job execution logs
gcloud run jobs executions logs read EXECUTION_NAME \
  --region us-central1
```

### Pricing Considerations

Cloud Run pricing is based on:

- **CPU and Memory**: Charged per 100ms of usage
- **Requests**: $0.40 per million requests
- **Networking**: Standard egress rates apply

For AI CLI tools, consider:

- Use `--timeout` to limit execution time
- Set `--max-instances` to control costs
- Use Jobs for non-HTTP workloads (cheaper than services)
- Store large datasets in Cloud Storage instead of container

### Multi-Platform Support

The `agent-yes` image supports both architectures available on Cloud Run:

- `linux/amd64` (x86_64) - Default on Cloud Run
- `linux/arm64` (aarch64) - Not yet available on Cloud Run

### Troubleshooting

**Issue: Container exits immediately**

Cloud Run services require listening on `PORT` environment variable. For CLI tools like `agent-yes`, use Cloud Run Jobs instead:

```bash
gcloud run jobs create agent-yes-job --image ghcr.io/snomiao/agent-yes:latest ...
```

**Issue: Timeout errors**

Increase timeout for long-running tasks:

```bash
gcloud run deploy agent-yes --timeout 3600  # 1 hour max
```

**Issue: Permission denied errors**

Ensure the service account has necessary permissions:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member serviceAccount:YOUR_SERVICE_ACCOUNT \
  --role roles/secretmanager.secretAccessor
```

## Other Cloud Platforms

### AWS (Coming Soon)

- AWS Fargate
- Amazon ECS
- AWS Lambda (with container support)

### Azure (Coming Soon)

- Azure Container Instances
- Azure Container Apps
- Azure Kubernetes Service

### DigitalOcean (Coming Soon)

- App Platform
- Kubernetes

### Fly.io (Coming Soon)

- Fly Machines
- Fly Apps

## Contributing

Have experience deploying to other cloud platforms? Please contribute by adding documentation for:

- AWS deployment guides
- Azure deployment guides
- Other cloud providers

Open a pull request at: https://github.com/snomiao/agent-yes
