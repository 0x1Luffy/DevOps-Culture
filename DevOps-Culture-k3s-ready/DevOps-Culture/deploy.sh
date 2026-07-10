#!/bin/bash
set -e

NAMESPACE="taskflow"
TAG=$(git rev-parse --short HEAD)
AUTH_SECRET_NAME="taskflow-auth-secret"
BACKEND_SECRET_NAME="taskflow-backend-secret"

echo "Deploying TaskFlow with tag: $TAG"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

apply_manifest() {
  local file=$1
  kubectl apply -f "$file"
}

ensure_backend_secret() {
  if kubectl get secret "$BACKEND_SECRET_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
    return
  fi

  if [ -z "${MONGO_URI:-}" ]; then
    echo "Missing $BACKEND_SECRET_NAME in namespace $NAMESPACE." >&2
    echo "Create it first, or rerun with MONGO_URI set." >&2
    exit 1
  fi

  kubectl create secret generic "$BACKEND_SECRET_NAME" \
    --namespace "$NAMESPACE" \
    --from-literal=MONGO_URI="$MONGO_URI"
}

ensure_auth_secret() {
  if kubectl get secret "$AUTH_SECRET_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
    return
  fi

  kubectl create secret generic "$AUTH_SECRET_NAME" \
    --namespace "$NAMESPACE" \
    --from-literal=JWT_SECRET="${JWT_SECRET:-dev-secret-change-me}" \
    --from-literal=ADMIN_USER="${ADMIN_USER:-admin}" \
    --from-literal=ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
}

apply_ingress_paths() {
  local ingress_name="taskflow-ingress"
  local paths_json

  paths_json='[{"path":"/api/stats","pathType":"Prefix","backend":{"service":{"name":"taskflow-stats-service","port":{"number":5001}}}},{"path":"/api/notifications","pathType":"Prefix","backend":{"service":{"name":"taskflow-notification-service","port":{"number":5002}}}},{"path":"/api/login","pathType":"Prefix","backend":{"service":{"name":"taskflow-auth-service","port":{"number":5003}}}},{"path":"/api/verify","pathType":"Prefix","backend":{"service":{"name":"taskflow-auth-service","port":{"number":5003}}}},{"path":"/api/status","pathType":"Prefix","backend":{"service":{"name":"taskflow-status-service","port":{"number":5004}}}},{"path":"/api","pathType":"Prefix","backend":{"service":{"name":"taskflow-backend","port":{"number":5000}}}},{"path":"/","pathType":"Prefix","backend":{"service":{"name":"taskflow-frontend","port":{"number":80}}}}]'

  if kubectl get ingress "$ingress_name" -n "$NAMESPACE" >/dev/null 2>&1; then
    kubectl patch ingress "$ingress_name" -n "$NAMESPACE" \
      --type='json' \
      -p="[{\"op\":\"replace\",\"path\":\"/spec/rules/0/http/paths\",\"value\":$paths_json}]"
    return
  fi

  if [ -n "${TASKFLOW_HOST:-}" ]; then
    local tmp_file
    tmp_file=$(mktemp)
    sed "s/taskflow.yourdomain.com/${TASKFLOW_HOST}/g" k8s/ingress.yaml > "$tmp_file"
    kubectl apply -f "$tmp_file"
    rm -f "$tmp_file"
    return
  fi

  echo "No existing ingress found and TASKFLOW_HOST is not set; skipping ingress apply."
}

require_command git
require_command docker
require_command kubectl

apply_manifest k8s/namespace.yaml
ensure_backend_secret
ensure_auth_secret

# Apply deployments and services before setting images so first-time installs work.
apply_manifest k8s/backend-service.yaml
apply_manifest k8s/frontend-service.yaml
apply_manifest k8s/stats-service-service.yaml
apply_manifest k8s/notification-service-service.yaml
apply_manifest k8s/auth-service-service.yaml
apply_manifest k8s/status-service-service.yaml
apply_manifest k8s/backend-deployment.yaml
apply_manifest k8s/frontend-deployment.yaml
apply_manifest k8s/stats-service-deployment.yaml
apply_manifest k8s/notification-service-deployment.yaml
apply_manifest k8s/auth-service-deployment.yaml
apply_manifest k8s/status-service-deployment.yaml
apply_ingress_paths

deploy_service() {
  local name=$1        # deploy dir / dockerhub image suffix
  local image=$2       # dockerhub image name
  local deployment=$3  # k8s deployment name
  local container=$4   # container name inside the deployment

  echo "Building $name..."
  docker buildx build \
    --platform linux/arm64 \
    --no-cache \
    --load \
    -t "$image:$TAG" \
    "./$name"

  docker push "$image:$TAG"
  kubectl set image "deployment/$deployment" "$container=$image:$TAG" -n "$NAMESPACE"
}

# Core services
deploy_service "frontend" "0x1luffy/frontend-taskflow" "taskflow-frontend" "frontend"
deploy_service "backend" "0x1luffy/backend-taskflow" "taskflow-backend" "backend"

# Microservices
deploy_service "stats-service" "0x1luffy/stats-service-taskflow" "taskflow-stats-service" "stats-service"
deploy_service "notification-service" "0x1luffy/notification-service-taskflow" "taskflow-notification-service" "notification-service"
deploy_service "auth-service" "0x1luffy/auth-service-taskflow" "taskflow-auth-service" "auth-service"
deploy_service "status-service" "0x1luffy/status-service-taskflow" "taskflow-status-service" "status-service"

echo "Waiting for rollout..."
kubectl rollout status deployment/taskflow-frontend -n "$NAMESPACE"
kubectl rollout status deployment/taskflow-backend -n "$NAMESPACE"
kubectl rollout status deployment/taskflow-stats-service -n "$NAMESPACE"
kubectl rollout status deployment/taskflow-notification-service -n "$NAMESPACE"
kubectl rollout status deployment/taskflow-auth-service -n "$NAMESPACE"
kubectl rollout status deployment/taskflow-status-service -n "$NAMESPACE"

echo "Done. All services deployed with tag: $TAG"
