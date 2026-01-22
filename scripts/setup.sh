#!/bin/bash

set -e

if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

read -p "Enter project directory (default: /opt/defender-chatroom): " PROJECT_DIR
PROJECT_DIR=${PROJECT_DIR:-/opt/defender-chatroom}

apt update
apt install -y docker.io docker-compose-plugin
systemctl enable docker
systemctl start docker

cat > /etc/systemd/system/defender-chatroom.service <<EOF
[Unit]
Description=Defender.ChatRoom
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=$SUDO_USER

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable defender-chatroom.service

echo "Setup complete. Start with: cd $PROJECT_DIR && docker compose up -d --build"
