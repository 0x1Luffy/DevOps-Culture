// Defined at the top level (outside pipeline{}) so it's a plain function call from
// any stage - no JSON parsing, no serialization across steps, no sandbox restrictions.
// Just returns a fresh literal map each time it's called.
def getServices() {
  return [
    'backend'             : [image: 'backend-taskflow',              deployment: 'taskflow-backend',              container: 'backend',              manifest: 'backend-deployment.yaml'],
    'frontend'             : [image: 'frontend-taskflow',            deployment: 'taskflow-frontend',             container: 'frontend',             manifest: 'frontend-deployment.yaml'],
    'stats-service'        : [image: 'stats-service-taskflow',       deployment: 'taskflow-stats-service',        container: 'stats-service',        manifest: 'stats-service-deployment.yaml'],
    'notification-service' : [image: 'notification-service-taskflow',deployment: 'taskflow-notification-service', container: 'notification-service', manifest: 'notification-service-deployment.yaml'],
    'auth-service'         : [image: 'auth-service-taskflow',        deployment: 'taskflow-auth-service',         container: 'auth-service',         manifest: 'auth-service-deployment.yaml'],
    'status-service'       : [image: 'status-service-taskflow',      deployment: 'taskflow-status-service',       container: 'status-service',       manifest: 'status-service-deployment.yaml'],
  ]
}

pipeline {
  agent any

  environment {
    DOCKERHUB_NS   = '0x1luffy'
    NAMESPACE      = 'taskflow'
    IMAGE_TAG      = "${env.GIT_COMMIT.take(7)}"   // short SHA, for readable Docker Hub tags
    FULL_SHA       = "${env.GIT_COMMIT}"            // full SHA, for precise state tracking
    BASE_DIR       = 'DevOps-Culture-k3s-ready/DevOps-Culture'   // repo not flattened - services live under here
    ANNOTATION_KEY = 'deployed-git-commit'   // no dots - avoids jsonpath escaping edge cases entirely
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  triggers {
    githubPush()
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Detect changed services') {
      steps {
        withCredentials([file(credentialsId: 'k3s-kubeconfig', variable: 'KUBECONFIG')]) {
          script {
            def services = getServices()
            def changed = []

            services.each { svcName, svc ->
              // Read OUR OWN annotation off the live Deployment — not the image tag.
              // We are the only writer of this annotation (set in the Deploy stage,
              // only after a rollout succeeds), so it's guaranteed to be a clean full
              // SHA whenever it's present. No dependency on any tagging scheme used
              // by deploy.sh, manual pushes, or anything else outside this pipeline.
              def deployedSha = sh(
                script: "kubectl get deployment/${svc.deployment} -n ${NAMESPACE} -o jsonpath=\"{.metadata.annotations.${ANNOTATION_KEY}}\" 2>/dev/null || true",
                returnStdout: true
              ).trim()

              if (!deployedSha) {
                echo "${svcName}: no pipeline-managed deployment record found -> building"
                changed << svcName
                return
              }

              def shaValid = sh(script: "git cat-file -e ${deployedSha} 2>/dev/null", returnStatus: true) == 0
              if (!shaValid) {
                echo "${svcName}: recorded commit ${deployedSha} not found in git history -> building to be safe"
                changed << svcName
                return
              }

              // Diff both the service's source folder AND its own k8s manifest against
              // the commit we last successfully deployed.
              def diffCmd = "git diff --quiet ${deployedSha} HEAD -- ${env.BASE_DIR}/${svcName}/ ${env.BASE_DIR}/k8s/${svc.manifest}"
              def diffExit = sh(script: diffCmd, returnStatus: true)

              if (diffExit != 0) {
                echo "${svcName}: drift detected (last deployed=${deployedSha}) -> building"
                changed << svcName
              } else {
                echo "${svcName}: matches last deployed commit ${deployedSha} -> skipping"
              }
            }

            echo "Changed services: ${changed}"
            env.CHANGED_SERVICES = changed.join(',')
          }
        }
      }
    }

    stage('Build') {
      when {
        expression { return env.CHANGED_SERVICES?.trim() }
      }
      steps {
        script {
          def services = getServices()
          def changed = env.CHANGED_SERVICES.split(',')

          def parallelStages = [:]
          changed.each { svcName ->
            def svc = services[svcName]
            parallelStages["${svcName}"] = {
              stage("build-${svcName}") {
                // --load pulls the built image into the local docker daemon
                // (instead of streaming straight to the registry like --push does)
                // so the Push stage below has something local to push.
                sh """
                  set -e
                  docker buildx build \
                    --platform linux/arm64 \
                    --load \
                    -t ${DOCKERHUB_NS}/${svc.image}:${IMAGE_TAG} \
                    -t ${DOCKERHUB_NS}/${svc.image}:latest \
                    ./${BASE_DIR}/${svcName}
                """
              }
            }
          }
          parallel parallelStages
        }
      }
    }

    stage('Push') {
      when {
        expression { return env.CHANGED_SERVICES?.trim() }
      }
      steps {
        script {
          def services = getServices()
          def changed = env.CHANGED_SERVICES.split(',')

          withCredentials([usernamePassword(
            credentialsId: 'dockerhub-creds',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
          )]) {
            sh 'set -e; echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin'

            def parallelStages = [:]
            changed.each { svcName ->
              def svc = services[svcName]
              parallelStages["${svcName}"] = {
                stage("push-${svcName}") {
                  sh """
                    set -e
                    docker push ${DOCKERHUB_NS}/${svc.image}:${IMAGE_TAG}
                    docker push ${DOCKERHUB_NS}/${svc.image}:latest
                  """
                }
              }
            }
            parallel parallelStages
          }
          sh 'docker logout || true'
        }
      }
    }

    stage('Deploy') {
      when {
        expression { return env.CHANGED_SERVICES?.trim() }
      }
      steps {
        script {
          def services = getServices()
          def changed = env.CHANGED_SERVICES.split(',')

          withCredentials([file(credentialsId: 'k3s-kubeconfig', variable: 'KUBECONFIG')]) {
            def parallelStages = [:]
            changed.each { svcName ->
              def svc = services[svcName]
              parallelStages["${svcName}"] = {
                stage("deploy-${svcName}") {
                  sh """
                    set -e
                    kubectl set image deployment/${svc.deployment} ${svc.container}=${DOCKERHUB_NS}/${svc.image}:${IMAGE_TAG} -n ${NAMESPACE}
                    kubectl rollout status deployment/${svc.deployment} -n ${NAMESPACE} --timeout=300s
                    kubectl annotate deployment/${svc.deployment} -n ${NAMESPACE} ${ANNOTATION_KEY}=${FULL_SHA} --overwrite
                  """
                }
              }
            }
            parallel parallelStages
          }
        }
      }
    }
  }

  post {
    failure {
      echo "Build/deploy failed. To roll back a specific service, run on the VM:\n" +
           "  kubectl rollout undo deployment/<deployment-name> -n taskflow"
    }
    success {
      echo "Deployed: ${env.CHANGED_SERVICES ?: 'nothing (no relevant changes)'} @ tag ${env.IMAGE_TAG}"
    }
  }
}
