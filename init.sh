# Run Commands with

sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl

 /etc/needrestart/restart.d/dbus.service
 systemctl restart getty@tty1.service
 systemctl restart networkd-dispatcher.service
 systemctl restart systemd-logind.service
 systemctl restart unattended-upgrades.service
 systemctl restart user@1000.service




sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
NODE_MAJOR=20
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt-get update
sudo apt-get install nodejs -y



# Install required Node.js packages
npm install express body-parser webrtc xmlhttprequest cors node-os-utils @pm2/io morgan

# Install and configure TURN server (coturn)
sudo apt install -y coturn


chmod +x get_repo.sh
sudo bash git.sh




if [ ! -d "fill-masjid-azaan-server" ]; then
    git clone https://github.com/Kesehet/fillmasjid-azaan-server.git
else
    cd fill-masjid-azaan-server
    git pull origin master
    cd ..
fi

