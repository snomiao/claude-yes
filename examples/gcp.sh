#!/bin/bash

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${GCP_REGION:-us-central1}"
JOB_NAME="${GCP_JOB_NAME:-agent-yes-job}"
IMAGE="${GCP_IMAGE:-ghcr.io/snomiao/agent-yes:latest}"
COMMAND="${1:-hello}"

# Check for ANTHROPIC_API_KEY
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is not set"
  echo ""
  echo "IMPORTANT: You need an API key from Anthropic Console (NOT OAuth token)"
  echo "1. Go to: https://console.anthropic.com/"
  echo "2. Create an API key (starts with sk-ant-api03-...)"
  echo "3. Export it: export ANTHROPIC_API_KEY='sk-ant-api03-...'"
  echo ""
  echo "Note: The OAuth token from ~/.claude/.credentials.json won't work for Cloud Run"
  echo ""
  exit 1
fi

echo "========================================="
echo "Google Cloud Run Jobs Deployment"
echo "========================================="
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Job Name: $JOB_NAME"
echo "Image: $IMAGE"
echo "Command: $COMMAND"
echo "========================================="

# Deploy or update Cloud Run Job
echo ""
echo "Deploying to Cloud Run Jobs..."
if gcloud run jobs describe "$JOB_NAME" --region="$REGION" &>/dev/null; then
  echo "Job exists, updating..."
  gcloud run jobs update "$JOB_NAME" \
    --image="$IMAGE" \
    --region="$REGION" \
    --task-timeout=3600 \
    --max-retries=0 \
    --set-env-vars="ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
    --args="claude","--","$COMMAND"
else
  echo "Creating new job..."
  gcloud run jobs create "$JOB_NAME" \
    --image="$IMAGE" \
    --region="$REGION" \
    --task-timeout=3600 \
    --max-retries=0 \
    --set-env-vars="ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
    --args="claude","--","$COMMAND"
fi

# Execute the job
echo ""
echo "Executing the job..."
EXECUTION_NAME=$(gcloud run jobs execute "$JOB_NAME" --region="$REGION" --format="value(metadata.name)")

echo ""
echo "Job execution started: $EXECUTION_NAME"
echo ""
echo "Streaming logs..."
echo "========================================="
gcloud run jobs executions logs tail "$EXECUTION_NAME" --region="$REGION"

echo ""
echo "========================================="
echo "View in console:"
echo "  https://console.cloud.google.com/run/jobs/details/$REGION/$JOB_NAME?project=$PROJECT_ID"


gcloud run jobs create agent-yes-job \
  --image ghcr.io/snomiao/agent-yes:latest \
  --region us-central1 \
  --set-env-vars ANTHROPIC_API_KEY=your-key-here \
  --args="claude","--","hello"

