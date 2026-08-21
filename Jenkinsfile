pipeline {
    agent any

    stages {

        stage('Checkout') {
            steps {
                echo 'Pulling project from GitHub...'
                checkout scm
            }
        }

        stage('Build Docker Images') {
            steps {
                echo 'Building Docker images...'
                sh 'docker compose build'
            }
        }

        stage('Stop Existing Containers') {
            steps {
                echo 'Stopping existing Agritrace containers...'
                sh 'docker compose down || true'
            }
        }

        stage('Start Application') {
            steps {
                echo 'Starting Agritrace application...'
                sh 'docker compose up -d'
            }
        }

        stage('Check Containers') {
            steps {
                echo 'Checking running containers...'
                sh 'docker ps'
            }
        }
    }

    post {
        success {
            echo 'Jenkins pipeline completed successfully!'
        }

        failure {
            echo 'Jenkins pipeline failed. Check the console output.'
        }
    }
}