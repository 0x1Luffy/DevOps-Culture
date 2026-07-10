# TaskFlow MERN DevOps Project

Simple MERN application for practicing DevOps with Kubernetes microservices.

## Stack
- React + Vite
- Node.js + Express
- MongoDB
- Docker
- Docker Compose
- Kubernetes

## Services
- `frontend` - React app served by Nginx
- `backend` - task CRUD API
- `stats-service` - task count aggregation API at `/api/stats`
- `notification-service` - in-memory notification API at `/api/notifications`
- `auth-service` - demo JWT login and verify API at `/api/login` and `/api/verify`
- `status-service` - service health aggregation API at `/api/status`

## Run Locally

```bash
docker compose up --build
```

Open the frontend on `http://localhost:8080`.

## Deploy

The deploy script applies the namespace, services, and deployments, then builds and pushes all six images before updating the Kubernetes deployments.

For an existing cluster, make sure the Mongo secret already exists:

```bash
kubectl get secret taskflow-backend-secret -n taskflow
```

If it does not exist, run the deploy with `MONGO_URI` set and the script will create it:

```bash
MONGO_URI='mongodb+srv://user:pass@cluster/db?retryWrites=true&w=majority' ./deploy.sh
```

Auth credentials are created automatically if `taskflow-auth-secret` is missing. Override the defaults during deploy when needed:

```bash
JWT_SECRET='replace-with-long-random-secret' ADMIN_USER='admin' ADMIN_PASSWORD='strong-password' ./deploy.sh
```

Ingress behavior:
- If `taskflow-ingress` already exists, the script patches only its path rules and preserves the existing host, TLS, and annotations.
- If no ingress exists, set `TASKFLOW_HOST` to create one from `k8s/ingress.yaml`.

```bash
TASKFLOW_HOST='taskflow.example.com' ./deploy.sh
```
