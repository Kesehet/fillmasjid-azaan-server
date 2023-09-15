// Required modules
const express = require('express');
const bodyParser = require('body-parser');
const webrtc = require("wrtc");
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const io = require('@pm2/io');
const morgan = require('morgan');

// Initialize express app
const app = express();

// Middleware configurations
app.use(cors({ origin: 'https://app.fillmasjid.in' }));
app.use(morgan('combined'));
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Global variables
let senderStream = {};
const PEERS = {};
const cherry = [{
    urls: "turn:72.235.112.32:8443",
    // username: "any",
    // credential: "any",
}];

// SSL configurations
const options = {
    key: fs.readFileSync(__dirname + '/fillmasjid.com.pk'),
    cert: fs.readFileSync(__dirname + '/fillmasjid.com.pem')
};

// Metrics for monitoring
io.metric({ name: 'No. of User Connections', value: () => Object.keys(PEERS).length });
io.metric({ name: 'No. of Active Masjids', value: () => Object.keys(senderStream).length });
let notifUsers = 0;
let failedNotif = 0;
io.metric({ name: 'Notification Sent to', value: () => notifUsers });
io.metric({ name: 'No. of Failed Notifications', value: () => failedNotif });

app.get("/", (req, res) => {
    res.send("Fill Masjid Server :)");
})


// Consumer endpoint
app.post("/consumer", async ({ body }, res) => {
    const peer = new webrtc.RTCPeerConnection({ iceServers: cherry });
    await peer.setRemoteDescription(new webrtc.RTCSessionDescription(body.sdp));

    const currentStream = senderStream[body.connectionID.trim()];
    if (!currentStream) {
        return res.json({});
    }

    try {
        currentStream.getTracks().forEach(track => peer.addTrack(track, currentStream));
    } catch (error) {
        console.log(`Stream ${body.connectionID} not Up Yet`);
        return res.json({});
    }

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    if (PEERS[body.version]) {
        PEERS[body.version].close();
        clearPeers();
    }

    PEERS[body.version] = peer;
    res.json({ sdp: peer.localDescription, streams: Object.keys(senderStream) });
});

// Broadcast endpoint
app.post('/broadcast', async ({ body }, res) => {
    const peer = new webrtc.RTCPeerConnection({ iceServers: cherry });
    peer.ontrack = (e) => handleTrackEvent(e, peer, body.connectionID.trim());

    await peer.setRemoteDescription(new webrtc.RTCSessionDescription(body.sdp));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    if (PEERS[body.version]) {
        PEERS[body.version].close();
        clearPeers();
    }

    PEERS[body.version] = peer;
    res.json({ sdp: peer.localDescription, connectionID: body.connectionID });
});

// Handle track event
function handleTrackEvent(e, peer, connID) {
    senderStream[connID] = e.streams[0];
}

// Clear disconnected peers
function clearPeers() {
    for (const version in PEERS) {
        const connectionState = PEERS[version].connectionState;
        if (["failed", "disconnected", "closed"].includes(connectionState)) {
            console.log(`| CLR | ${version} LEFT`);
            PEERS[version].close();
            delete PEERS[version];
        }
    }
}



const firebaseRequestDelay = 3;
let firebaseRequestList = [];
let firebaseInterval = setInterval(firebaseRunLoop, firebaseRequestDelay * 1000);

function firebaseRunLoop() {
    const ret = [];
    for (let i = 0; i < firebaseRequestList.length; i++) {
        if (i == 0) {
            launchFire(firebaseRequestList[i]);
        } else {
            ret.push(firebaseRequestList[i]);
        }
    }
    firebaseRequestList = [...new Set(ret)]; // Ensure unique values
    if (firebaseRequestList.length === 0) {
        clearInterval(firebaseInterval);
        firebaseInterval = undefined;
    }
}

async function launchFire(hash) {
    const registeredIDs = JSON.parse(await getFireIds(hash));
    console.log(registeredIDs);
    try {
        notifUsers = registeredIDs.length;
        failedNotif = 0;
    } catch (e) {
        console.log("Exception in setting notified users");
    }
    registeredIDs.forEach(element => {
        fire(hash, element.version, element.firebase_token);
    });
}

// Firebase notification function
async function fire(hash, version, fireToken) {
    const serverKey = 'AAAAniguGJI:APA91bGyqHQUE9gcDMZXPiPeFfqjRxnA5XsEHxu5RYrHAyDEmu7ms2-Iys1FUXdOuhRi8X0yULBJbPVpsrUGDkoyv2tSS-AwVUUaLIsv3zSMk1XMCoZSbs5Bc-6vvhdVg9681Z8ui7cR'; // Consider moving this to environment variables or a config file
    const message = {
        to: fireToken,
        notification: {
            title: 'Azaan',
            body: "Azaan Time.",
        },
        data: {
            hash: `${hash}&bg_id=${version}`,
            static_notify_title: "Azaan",
            static_notify_body: hash,
            version: version
        },
        priority: "high",
        android: {
            priority: "high"
        },
        apns: {
            "headers": {
                "apns-priority": "5"
            }
        },
        webpush: {
            "headers": {
                "Urgency": "high"
            }
        }
    };

    const options = {
        hostname: 'fcm.googleapis.com',
        port: 443,
        path: '/fcm/send',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${serverKey}`
        }
    };

    const response = await sendMessage(options, message);
    const parsedResponse = JSON.parse(response);
    console.log(`| SUC | ${parsedResponse.success} ${version} | FAL | ${parsedResponse.failure}`);
    failedNotif += 1;
}

async function sendMessage(options, message) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let response = '';
            res.on('data', (chunk) => {
                response += chunk;
            });
            res.on('end', () => {
                resolve(response);
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(JSON.stringify(message));
        req.end();
    });
}

// Function to get Firebase IDs
function getFireIds(masjidToken) {
    return new Promise((resolve, reject) => {
        const url = "https://fillmasjid.in/api/app/api12.php";
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                resolve(xhr.responseText.trim());
            }
        };
        const data = `masjidToken=${masjidToken}&task=getFireTokens&version=3duverseServer`;
        xhr.send(data);
    });
}


// Start the server
const server = https.createServer(options, app);
server.listen(443, '0.0.0.0', () => console.log('server started'));

// Set interval to clear peers
setInterval(clearPeers, 5000);