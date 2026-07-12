pipeline {
  agent any

  environment {
    DOCKERHUB_NS = '0x1luffy'
    NAMESPACE    = 'taskflow'
    IMAGE_TAG    = "${env.GIT_COMMIT.take(7)}"
    BASE_DIR     = 'DevOps-Culture-k3s-ready/DevOps-Culture'   // repo not flattened - services live under here
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
        script {
          // service name -> [dockerhub image suffix, k8s deployment name, container name]
          def services = [
            'backend'             : [image: 'backend-taskflow',              deployment: 'taskflow-backend',              container: 'backend'],
            'frontend'             : [image: 'frontend-taskflow',            deployment: 'taskflow-frontend',             container: 'frontend'],
            'stats-service'        : [image: 'stats-service-taskflow',       deployment: 'taskflow-stats-service',        container: 'stats-service'],
            'notification-service' : [image: 'notification-service-taskflow',deployment: 'taskflow-notification-service', container: 'notification-service'],
            'auth-service'         : [image: 'auth-service-taskflow',        deployment: 'taskflow-auth-service',         container: 'auth-service'],
            'status-service'       : [image: 'status-service-taskflow',      deployment: 'taskflow-status-service',       container: 'status-service'],
          ]

          def prevCommit = sh(script: "git rev-parse HEAD~1 2>/dev/null || true", returnStdout: true).trim()
          def changedFiles

          if (prevCommit) {
            changedFiles = sh(script: "git diff --name-only ${prevCommit} HEAD", returnStdout: true).trim()
          } else {
            changedFiles = '' // no prior commit (first ever build) -> build everything below
          }

          def changedList = changedFiles ? changedFiles.split('\n') as List : []

          def changed
          if (!prevCommit) {
            changed = services.keySet() as List
          } else if (changedList.any { it.startsWith("${env.BASE_DIR}/k8s/") }) {
            // shared manifests changed -> safest to redeploy every service
            changed = services.keySet() as List
          } else {
            changed = services.keySet().findAll { svc ->
              changedList.any { it.startsWith("${env.BASE_DIR}/${svc}/") }
            }
          }

          echo "Changed services: ${changed}"

          env.CHANGED_SERVICES = changed.join(',')
          writeFile file: 'services.json', text: groovy.json.JsonOutput.toJson(services)
        }
      }
    }

    stage('Build, Push & Deploy') {
      when {
        expression { return env.CHANGED_SERVICES?.trim() }
      }
      steps {
        script {
          def services = new groovy.json.JsonSlurper().parseText(readFile('services.json'))
          def changed = env.CHANGED_SERVICES.split(',')

          def parallelStages = [:]
          changed.each { svcName ->
            def svc = services[svcName]
            parallelStages["${svcName}"] = {
              stage("${svcName}") {
                withCredentials([usernamePassword(
                  credentialsId: 'dockerhub-creds',
                  usernameVariable: 'DOCKER_USER',
                  passwordVariable: 'DOCKER_PASS'
                )]) {
                  sh """
                    echo "\$DOCKER_PASS" | docker login -u "\$DOCKER_USER" --password-stdin
                    docker buildx build \
                      --platform linux/arm64 \
                      --push \
                      -t ${DOCKERHUB_NS}/${svc.image}:${IMAGE_TAG} \
                      -t ${DOCKERHUB_NS}/${svc.image}:latest \
                      ./${BASE_DIR}/${svcName}
                  """
                }

                withCredentials([file(credentialsId: 'k3s-kubeconfig', variable: 'KUBECONFIG')]) {
                  sh """
                    kubectl set image deployment/${svc.deployment} ${svc.container}=${DOCKERHUB_NS}/${svc.image}:${IMAGE_TAG} -n ${NAMESPACE}
                    kubectl rollout status deployment/${svc.deployment} -n ${NAMESPACE} --timeout=120s
                  """
                }
              }
            }
          }
          parallel parallelStages
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
