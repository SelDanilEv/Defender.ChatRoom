#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
ENV_FILE="$PROJECT_DIR/.env"

# Load .env file if it exists
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Set defaults if not set
export REPOSITORY_OWNER=${REPOSITORY_OWNER:-defendersd}
export IMAGE_TAG=${IMAGE_TAG:-latest}

# Check if required variables are set
if [ "$REPOSITORY_OWNER" == "defendersd" ] && [ ! -f "$ENV_FILE" ]; then
    # Default is fine, no error needed
    :
fi

cd "$PROJECT_DIR"

case "$1" in
    start)
        echo "Starting Defender.ChatRoom (production)..."
        echo "Registry: Docker Hub"
        echo "Repository: $REPOSITORY_OWNER"
        echo "Tag: $IMAGE_TAG"
        
        # Login to Docker Hub if DOCKERHUB_TOKEN is set
        if [ -n "$DOCKERHUB_TOKEN" ]; then
            echo "$DOCKERHUB_TOKEN" | docker login -u "$REPOSITORY_OWNER" --password-stdin
        fi
        
        docker compose -f "$COMPOSE_FILE" up -d --pull always
        echo "✅ Application started"
        ;;
    stop)
        echo "Stopping Defender.ChatRoom..."
        docker compose -f "$COMPOSE_FILE" down
        echo "✅ Application stopped"
        ;;
    restart)
        echo "Restarting Defender.ChatRoom..."
        docker compose -f "$COMPOSE_FILE" restart
        echo "✅ Application restarted"
        ;;
    logs)
        docker compose -f "$COMPOSE_FILE" logs -f "${2:-}"
        ;;
    status)
        echo "Defender.ChatRoom Status:"
        docker compose -f "$COMPOSE_FILE" ps
        ;;
    update)
        if [ -z "$2" ]; then
            echo "Error: Please provide IMAGE_TAG"
            echo "Usage: $0 update <IMAGE_TAG>"
            echo "Example: $0 update 20241215-42"
            exit 1
        fi
        
        echo "Updating to tag: $2"
        export IMAGE_TAG=$2
        
        if [ -n "$DOCKERHUB_TOKEN" ]; then
            echo "$DOCKERHUB_TOKEN" | docker login -u "$REPOSITORY_OWNER" --password-stdin
        fi
        docker compose -f "$COMPOSE_FILE" pull
        docker compose -f "$COMPOSE_FILE" up -d
        echo "✅ Application updated to tag: $2"
        ;;
    pull)
        echo "Pulling latest images..."
        if [ -n "$DOCKERHUB_TOKEN" ]; then
            echo "$DOCKERHUB_TOKEN" | docker login -u "$REPOSITORY_OWNER" --password-stdin
        fi
        docker compose -f "$COMPOSE_FILE" pull
        echo "✅ Images pulled"
        ;;
    *)
        echo "Defender.ChatRoom Production Management Script"
        echo ""
        echo "Usage: $0 {start|stop|restart|logs|status|update|pull}"
        echo ""
        echo "Commands:"
        echo "  start          - Start the application (pulls images)"
        echo "  stop           - Stop the application"
        echo "  restart        - Restart the application"
        echo "  logs [service] - View logs (optionally for specific service: backend/frontend)"
        echo "  status         - Show application status"
        echo "  update <tag>   - Update to a specific image tag (e.g., 20241215-42)"
        echo "  pull           - Pull images without starting"
        echo ""
        echo "Environment variables (set in .env file or export):"
        echo "  REPOSITORY_OWNER  - Docker Hub username (default: defendersd)"
        echo "  IMAGE_TAG         - Image tag (default: latest)"
        echo "  DOCKERHUB_TOKEN   - Docker Hub access token (optional, for private images)"
        echo ""
        exit 1
        ;;
esac
